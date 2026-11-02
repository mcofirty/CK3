/**
 * Carte de Westeros : un diagramme de Voronoï par terre (continent, chaque île), dont chaque
 * cellule est découpée dans le contour dessiné. Les côtes suivent donc exactement le tracé.
 */
import {
  CROSSINGS,
  FOREIGN,
  ISLANDS,
  MAINLAND,
  RIVER_PAIRS,
  SITES,
  WALL,
  WESTEROS_H,
  WESTEROS_W,
  type RegionId,
} from '../../data/westeros/geography';
import type { MapCounty, MapData } from '../mapgen';

type P = [number, number];

/** Régions : duchés du jeu, et les anciens royaumes dont elles relèvent. */
export const REGIONS: { id: RegionId; name: string; kingdom: string }[] = [
  { id: 'nord', name: 'le Nord', kingdom: 'k_nord' },
  { id: 'conflans', name: 'les Conflans', kingdom: 'k_trident' },
  { id: 'iles', name: 'les Îles de Fer', kingdom: 'k_iles' },
  { id: 'val', name: 'le Val d’Arryn', kingdom: 'k_val' },
  { id: 'ouest', name: 'l’Ouest', kingdom: 'k_roc' },
  { id: 'couronne', name: 'les terres de la Couronne', kingdom: 'k_couronnes' },
  { id: 'bief', name: 'le Bief', kingdom: 'k_bief' },
  { id: 'orage', name: 'les terres de l’Orage', kingdom: 'k_orage' },
  { id: 'dorne', name: 'Dorne', kingdom: 'k_dorne' },
];

export const KINGDOMS: { id: string; name: string }[] = [
  { id: 'k_couronnes', name: 'les Sept Couronnes' },
  { id: 'k_nord', name: 'le Nord' },
  { id: 'k_iles', name: 'les Îles de Fer' },
  { id: 'k_trident', name: 'le Trident' },
  { id: 'k_val', name: 'la Montagne et le Val' },
  { id: 'k_roc', name: 'le Roc' },
  { id: 'k_bief', name: 'le Bief' },
  { id: 'k_orage', name: 'l’Orage' },
  { id: 'k_dorne', name: 'Dorne' },
];

const dist = (a: P, b: P) => Math.hypot(a[0] - b[0], a[1] - b[1]);

function distPointSeg(p: P, a: P, b: P): number {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const l2 = dx * dx + dy * dy || 1;
  const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l2));
  return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy));
}

/** Point dans un polygone (règle pair-impair). */
export function inside(pt: P, poly: P[]): boolean {
  let res = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    if (yi > pt[1] !== yj > pt[1] && pt[0] < ((xj - xi) * (pt[1] - yi)) / (yj - yi) + xi)
      res = !res;
  }
  return res;
}

/** Arrondit et retire les sommets confondus. */
function tidy(poly: P[]): P[] {
  const out: P[] = [];
  for (const p of poly) {
    const q: P = [Math.round(p[0]), Math.round(p[1])];
    const last = out[out.length - 1];
    if (!last || last[0] !== q[0] || last[1] !== q[1]) out.push(q);
  }
  if (
    out.length > 1 &&
    out[0][0] === out[out.length - 1][0] &&
    out[0][1] === out[out.length - 1][1]
  )
    out.pop();
  return out;
}

/** Aire signée (positive dans le sens horaire de l'écran). */
function area(poly: P[]): number {
  let a = 0;
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i];
    const q = poly[(i + 1) % poly.length];
    a += p[0] * q[1] - q[0] * p[1];
  }
  return a / 2;
}

/**
 * Coupe un polygone simple (concave possible) par le demi-plan a·x + b·y ≤ c et renvoie les
 * morceaux séparés : là où une coupe naïve relierait deux côtes par-dessus une baie, chaque
 * rive devient un polygone à part.
 */
export function splitClip(poly: P[], a: number, b: number, c: number): P[][] {
  const f = (p: P) => a * p[0] + b * p[1] - c;
  const n = poly.length;
  if (poly.every((p) => f(p) <= 0)) return [poly];
  if (poly.every((p) => f(p) >= 0)) return [];
  // Parcours : sommets gardés et points de coupe (entrée / sortie), le long du contour.
  type Node = { p: P; kind: 'in' | 'enter' | 'exit'; t?: number };
  const seq: Node[] = [];
  const dir: P = [-b, a];
  for (let i = 0; i < n; i++) {
    const p = poly[i];
    const q = poly[(i + 1) % n];
    const fp = f(p);
    const fq = f(q);
    if (fp <= 0) seq.push({ p, kind: 'in' });
    if ((fp <= 0 && fq > 0) || (fp > 0 && fq <= 0)) {
      const t = fp / (fp - fq);
      const x: P = [p[0] + t * (q[0] - p[0]), p[1] + t * (q[1] - p[1])];
      seq.push({ p: x, kind: fp <= 0 ? 'exit' : 'enter', t: x[0] * dir[0] + x[1] * dir[1] });
    }
  }
  const cuts = seq.filter((x) => x.kind !== 'in').sort((u, v) => u.t! - v.t!);
  // Les cordes (segments de la droite à l'intérieur du polygone) relient les coupes deux à deux.
  const partner = new Map<Node, Node>();
  for (let k = 0; k + 1 < cuts.length; k += 2) {
    partner.set(cuts[k], cuts[k + 1]);
    partner.set(cuts[k + 1], cuts[k]);
  }
  const index = new Map(seq.map((x, i) => [x, i]));
  const used = new Set<Node>();
  const rings: P[][] = [];
  for (const start of seq) {
    if (start.kind !== 'enter' || used.has(start)) continue;
    const ring: P[] = [];
    let cur: Node = start;
    for (let guard = 0; guard < 4 * seq.length; guard++) {
      used.add(cur);
      ring.push(cur.p);
      if (cur.kind === 'exit') {
        const next = partner.get(cur);
        if (!next || next === start) break;
        cur = next;
        if (used.has(cur)) break;
        continue;
      }
      const nxt = seq[(index.get(cur)! + 1) % seq.length];
      if (nxt === start) break;
      cur = nxt;
    }
    if (ring.length >= 3) rings.push(ring);
  }
  return rings.length ? rings : [];
}

function sharedEdge(pi: P[], pj: P[]): [P, P] | undefined {
  for (let k = 0; k < pi.length; k++) {
    const a = pi[k];
    const b = pi[(k + 1) % pi.length];
    if (dist(a, b) < 8) continue;
    const mid: P = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    for (let m = 0; m < pj.length; m++)
      if (distPointSeg(mid, pj[m], pj[(m + 1) % pj.length]) < 1.5) return [a, b];
  }
  return undefined;
}

export function buildWesterosMap(): MapData {
  const landOf = (id: string): P[] => {
    const site = SITES.find((x) => x.id === id)!;
    return site.island ? ISLANDS[site.island] : MAINLAND;
  };
  const cells = new Map<string, P[]>();
  for (const site of SITES) {
    let pieces: P[][] = [landOf(site.id)];
    const same = SITES.filter((o) => o.id !== site.id && o.island === site.island);
    const sp: P = [site.x, site.y];
    for (const o of same) {
      const a = o.x - sp[0];
      const b = o.y - sp[1];
      const c = (o.x * o.x + o.y * o.y - sp[0] * sp[0] - sp[1] * sp[1]) / 2;
      pieces = pieces.flatMap((pc) => splitClip(pc, a, b, c));
    }
    // Le morceau qui porte le château (sinon le plus grand).
    const own =
      pieces.find((pc) => inside(sp, pc)) ??
      [...pieces].sort((x, y) => Math.abs(area(y)) - Math.abs(area(x)))[0];
    cells.set(site.id, tidy(own));
  }
  const adjacency = new Map<string, Set<string>>(SITES.map((x) => [x.id, new Set<string>()]));
  const edges = new Map<string, [P, P]>();
  for (let i = 0; i < SITES.length; i++)
    for (let j = i + 1; j < SITES.length; j++) {
      const a = SITES[i];
      const b = SITES[j];
      if (a.island !== b.island) continue;
      const e = sharedEdge(cells.get(a.id)!, cells.get(b.id)!);
      if (e) {
        adjacency.get(a.id)!.add(b.id);
        adjacency.get(b.id)!.add(a.id);
        edges.set([a.id, b.id].sort().join('|'), e);
      }
    }
  for (const [a, b] of CROSSINGS) {
    adjacency.get(a)!.add(b);
    adjacency.get(b)!.add(a);
  }
  const counties: MapCounty[] = SITES.map((site) => {
    const poly = cells.get(site.id)!;
    const coastal = poly.some((p, k) => {
      const q = poly[(k + 1) % poly.length];
      return ![...adjacency.get(site.id)!].some((n) => {
        const e = edges.get([site.id, n].sort().join('|'));
        return (
          e &&
          ((dist(e[0], p) < 2 && dist(e[1], q) < 2) || (dist(e[0], q) < 2 && dist(e[1], p) < 2))
        );
      });
    });
    return {
      id: site.id,
      name: site.name,
      terrain: site.terrain,
      duchy: `d_${site.region}`,
      x: site.x,
      y: site.y,
      polygon: poly,
      adjacent: [...adjacency.get(site.id)!],
      rivers: RIVER_PAIRS.filter(([a, b]) => a === site.id || b === site.id).map(([a, b]) =>
        a === site.id ? b : a,
      ),
      coastal,
    };
  });
  const duchies = REGIONS.map((r) => ({
    id: `d_${r.id}`,
    name: r.name,
    kingdom: r.kingdom,
    counties: SITES.filter((x) => x.region === r.id).map((x) => x.id),
  }));
  const kingdoms = KINGDOMS.map((k) => ({
    id: k.id,
    name: k.name,
    duchies: duchies.filter((d) => d.kingdom === k.id).map((d) => d.id),
  }));
  const rivers = RIVER_PAIRS.map(([a, b]) => {
    const e = edges.get([a, b].sort().join('|'));
    return e ? { a, b, path: [e[0], e[1]] as P[] } : null;
  }).filter((x): x is { a: string; b: string; path: P[] } => !!x);
  // Mer : carreaux loin des terres (vagues, navires).
  const lands = [MAINLAND, ...Object.values(ISLANDS), ...FOREIGN.map((f) => f.poly)];
  const sea: P[][] = [];
  const step = 100;
  for (let y = 0; y < WESTEROS_H; y += step)
    for (let x = 0; x < WESTEROS_W; x += step) {
      const c: P = [x + step / 2, y + step / 2];
      if (lands.some((l) => inside(c, l))) continue;
      sea.push([
        [x, y],
        [x + step, y],
        [x + step, y + step],
        [x, y + step],
      ]);
    }
  return {
    width: WESTEROS_W,
    height: WESTEROS_H,
    counties,
    duchies,
    kingdoms,
    realms: [],
    rivers,
    sea,
    title: 'Westeros',
    foreign: FOREIGN,
    wall: WALL,
  };
}
