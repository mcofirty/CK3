/**
 * Génération procédurale de la carte, propre à chaque partie (à partir de la graine).
 * 48 comtés (cellules de Voronoï) dans une terre à la forme variable, entourée de mer ;
 * adjacences, relief, 2 ou 3 rivières, 12 duchés, 3 royaumes et 8 domaines de départ
 * de tailles inégales (de grands royaumes voisins de petites seigneuries).
 */
import { NAMES } from '../data/names';
import type { Rng } from './rng';
import type { Terrain } from './state';

export interface MapCounty {
  id: string;
  name: string;
  terrain: string;
  duchy: string;
  x: number;
  y: number;
  polygon: [number, number][];
  adjacent: string[];
  rivers: string[];
  coastal: boolean;
}

export interface MapData {
  width: number;
  height: number;
  counties: MapCounty[];
  duchies: { id: string; name: string; kingdom: string; counties: string[] }[];
  kingdoms: { id: string; name: string; duchies: string[] }[];
  realms: string[][];
  rivers: { a: string; b: string; path: [number, number][] }[];
  sea: [number, number][][];
}

type P = [number, number];
const W = 1260;
const H = 1640;
const LAND = 48;
const KINGDOMS = 3;
/** Tailles cibles des domaines de départ (un seul de 6 est attribué au joueur). */
export const REALM_SIZES = [9, 8, 6, 6, 6, 5, 4, 4];
const REALMS = REALM_SIZES.length;
const DUCHY_SIZES = [5, 5, 4, 4, 4, 4, 4, 4, 4, 4, 3, 3];
const DUCHIES = DUCHY_SIZES.length;

function clip(poly: P[], a: number, b: number, c: number): P[] {
  const out: P[] = [];
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i];
    const q = poly[(i + 1) % poly.length];
    const fp = a * p[0] + b * p[1] - c;
    const fq = a * q[0] + b * q[1] - c;
    if (fp <= 0) out.push(p);
    if ((fp < 0 && fq > 0) || (fp > 0 && fq < 0)) {
      const t = fp / (fp - fq);
      out.push([p[0] + t * (q[0] - p[0]), p[1] + t * (q[1] - p[1])]);
    }
  }
  return out;
}

function distPointSeg(p: P, a: P, b: P): number {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const l2 = dx * dx + dy * dy || 1;
  const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l2));
  return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy));
}

const dist = (a: P, b: P) => Math.hypot(a[0] - b[0], a[1] - b[1]);

/** Une tentative de génération ; renvoie null si le résultat n'est pas jouable. */
function attempt(rng: Rng): MapData | null {
  // Forme de la terre : ellipse déformée par des harmoniques aléatoires.
  const rot = rng.range(0, Math.PI);
  const ax = rng.range(0.36, 0.44);
  const ay = rng.range(0.4, 0.46);
  const harmonics = [2, 3, 4, 5, 7].map((k) => ({
    k,
    amp: rng.range(0, 0.13),
    ph: rng.range(0, 6.28),
  }));
  const blob = (x: number, y: number) => {
    const dx = (x - W / 2) / (W * ax);
    const dy = (y - H / 2) / (H * ay);
    const a = Math.atan2(dy, dx) + rot;
    let wob = 1;
    for (const h of harmonics) wob += h.amp * Math.sin(h.k * a + h.ph);
    return Math.sqrt(dx * dx + dy * dy) / wob;
  };

  const cols = 9;
  const rows = 11;
  const jitter = rng.range(38, 62);
  const cand: P[] = [];
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++)
      cand.push([
        ((c + 0.5 + (r % 2 ? 0.25 : -0.25)) * W) / cols + rng.range(-jitter, jitter),
        ((r + 0.5) * H) / rows + rng.range(-jitter, jitter),
      ]);
  const sorted = cand.map((p) => ({ p, d: blob(p[0], p[1]) })).sort((a, b) => a.d - b.d);
  const land = sorted.slice(0, LAND).map((s) => s.p);
  const sea = sorted.slice(LAND).map((s) => s.p);
  const sites = [...land, ...sea];

  const cells: P[][] = sites.map((s, i) => {
    let poly: P[] = [
      [0, 0],
      [W, 0],
      [W, H],
      [0, H],
    ];
    sites.forEach((o, j) => {
      if (i === j) return;
      poly = clip(
        poly,
        o[0] - s[0],
        o[1] - s[1],
        (o[0] * o[0] + o[1] * o[1] - s[0] * s[0] - s[1] * s[1]) / 2,
      );
    });
    return poly;
  });

  const sharedEdge = (i: number, j: number): [P, P] | undefined => {
    const pi = cells[i];
    const pj = cells[j];
    for (let k = 0; k < pi.length; k++) {
      const a = pi[k];
      const b = pi[(k + 1) % pi.length];
      if (dist(a, b) < 12) continue;
      const mid: P = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
      for (let m = 0; m < pj.length; m++)
        if (distPointSeg(mid, pj[m], pj[(m + 1) % pj.length]) < 0.5) return [a, b];
    }
    return undefined;
  };

  const adj: number[][] = land.map(() => []);
  const edges = new Map<string, [P, P]>();
  for (let i = 0; i < LAND; i++)
    for (let j = i + 1; j < LAND; j++) {
      const e = sharedEdge(i, j);
      if (e) {
        adj[i].push(j);
        adj[j].push(i);
        edges.set(`${i}|${j}`, e);
      }
    }
  // Terre d'un seul tenant, sans comté isolé.
  const seen = new Set([0]);
  const queue = [0];
  while (queue.length) {
    for (const n of adj[queue.shift()!]) {
      if (!seen.has(n)) {
        seen.add(n);
        queue.push(n);
      }
    }
  }
  if (seen.size !== LAND || adj.some((a) => a.length < 2)) return null;
  const coastal = land.map((_, i) => sea.some((_, s) => !!sharedEdge(i, LAND + s)));

  // Relief : 1 ou 2 massifs, collines au pied des montagnes, marais côtiers, forêts.
  const terrain: Terrain[] = land.map(() => 'plaine');
  const massifs = rng.int(2, 3);
  for (let m = 0; m < massifs; m++) {
    const s = rng.int(0, LAND - 1);
    terrain[s] = 'montagne';
    for (const n of rng.shuffle([...adj[s]]).slice(0, rng.int(1, 2))) terrain[n] = 'montagne';
  }
  const forest = rng.range(0.18, 0.4);
  const marsh = rng.range(0.1, 0.3);
  for (let i = 0; i < LAND; i++) {
    if (terrain[i] !== 'plaine') continue;
    const r = rng.next();
    if (coastal[i] && r < marsh) terrain[i] = 'marais';
    else if (r < marsh + forest) terrain[i] = 'foret';
    else if (adj[i].some((n) => terrain[n] === 'montagne') ? r < 0.85 : r < marsh + forest + 0.18)
      terrain[i] = 'colline';
  }
  if (terrain.filter((t) => t === 'plaine').length < 10) return null;

  // Rivières : 1 ou 2 chaînes d'arêtes depuis la côte.
  const riverPairs: [number, number][] = [];
  const nRivers = rng.int(2, 3);
  for (let rv = 0; rv < nRivers; rv++) {
    const starts = coastal
      .map((c, i) => (c && terrain[i] !== 'montagne' ? i : -1))
      .filter((i) => i >= 0);
    if (!starts.length) break;
    let a = rng.pick(starts);
    let prev = -1;
    const len = rng.int(3, 6);
    for (let step = 0; step < len; step++) {
      const options = adj[a].filter(
        (n) =>
          n !== prev && !riverPairs.some(([x, y]) => (x === a && y === n) || (x === n && y === a)),
      );
      if (!options.length) break;
      options.sort((x, y) => blob(...land[x]) - blob(...land[y]));
      const b = options[Math.min(options.length - 1, rng.int(0, 1))];
      riverPairs.push([a, b]);
      const common = adj[a].filter((n) => adj[b].includes(n) && n !== prev);
      prev = a;
      a = common.length ? rng.pick(common) : b;
    }
  }

  // Partition équilibrée par croissance multi-sources.
  const farthest = (k: number): number[] => {
    const seeds = [rng.int(0, LAND - 1)];
    while (seeds.length < k) {
      let best = 0;
      let bestD = -1;
      for (let i = 0; i < LAND; i++) {
        const d = Math.min(...seeds.map((s) => dist(land[i], land[s])));
        if (d > bestD) {
          bestD = d;
          best = i;
        }
      }
      seeds.push(best);
    }
    return seeds;
  };
  const grow = (seeds: number[], sizes: number[]): number[] | null => {
    const owner = land.map(() => -1);
    seeds.forEach((s, k) => (owner[s] = k));
    const count = seeds.map(() => 1);
    let changed = true;
    while (changed) {
      changed = false;
      for (const k of rng.shuffle(seeds.map((_, i) => i))) {
        if (count[k] >= sizes[k]) continue;
        const frontier: number[] = [];
        owner.forEach((o, i) => {
          if (o === k) for (const n of adj[i]) if (owner[n] === -1) frontier.push(n);
        });
        if (!frontier.length) continue;
        const pick = frontier.sort(
          (x, y) => dist(land[x], land[seeds[k]]) - dist(land[y], land[seeds[k]]),
        )[0];
        owner[pick] = k;
        count[k]++;
        changed = true;
      }
    }
    // Restes : rattachés au voisin le plus petit.
    for (let guard = 0; owner.some((o) => o === -1) && guard < 50; guard++) {
      owner.forEach((o, i) => {
        if (o !== -1) return;
        const ns = adj[i]
          .filter((n) => owner[n] !== -1)
          .sort((x, y) => count[owner[x]] - count[owner[y]]);
        if (ns.length) {
          owner[i] = owner[ns[0]];
          count[owner[i]]++;
        }
      });
    }
    if (owner.some((o) => o === -1)) return null;
    return owner;
  };

  const duchyOwner = grow(farthest(DUCHIES), DUCHY_SIZES);
  const realmOwner = grow(farthest(REALMS), rng.shuffle([...REALM_SIZES]));
  if (!duchyOwner || !realmOwner) return null;
  const realmCount = [...Array(REALMS).keys()].map((r) => realmOwner.filter((o) => o === r).length);
  if (realmCount.some((n) => n < 3 || n > 10)) return null;
  // Au moins un domaine de taille moyenne pour le joueur.
  if (!realmCount.some((n) => n >= 5 && n <= 7)) return null;
  // Chaque domaine d'un seul tenant.
  for (let r = 0; r < REALMS; r++) {
    const ms = land.map((_, i) => i).filter((i) => realmOwner[i] === r);
    const got = new Set([ms[0]]);
    const q = [ms[0]];
    while (q.length)
      for (const n of adj[q.shift()!])
        if (realmOwner[n] === r && !got.has(n)) {
          got.add(n);
          q.push(n);
        }
    if (got.size !== ms.length) return null;
  }

  const duchyY = [...Array(DUCHIES).keys()].map((d) => {
    const ms = land.filter((_, i) => duchyOwner[i] === d);
    return ms.reduce((s, p) => s + p[1], 0) / ms.length;
  });
  const vertical = rng.chance(0.5);
  const duchyX = [...Array(DUCHIES).keys()].map((d) => {
    const ms = land.filter((_, i) => duchyOwner[i] === d);
    return ms.reduce((s, p) => s + p[0], 0) / ms.length;
  });
  // Royaumes : tiers des duchés le long d'un axe.
  const key = vertical ? duchyY : duchyX;
  const order = [...key.keys()].sort((a, b) => key[a] - key[b]);
  const duchyKingdom = key.map((_, d) =>
    Math.min(KINGDOMS - 1, Math.floor((order.indexOf(d) * KINGDOMS) / DUCHIES)),
  );

  // Noms uniques.
  const used = new Set<string>();
  const placeName = (): string => {
    for (let i = 0; i < 200; i++) {
      const n = rng.pick(NAMES.placeStarts) + rng.pick(NAMES.placeEnds);
      if (!used.has(n)) {
        used.add(n);
        return n;
      }
    }
    return `Terre ${used.size}`;
  };

  const round = (p: P): [number, number] => [Math.round(p[0]), Math.round(p[1])];
  const counties: MapCounty[] = land.map((_, i) => {
    const cell = cells[i];
    return {
      id: `c${i}`,
      name: placeName(),
      terrain: terrain[i],
      duchy: `d${duchyOwner[i]}`,
      x: Math.round(cell.reduce((s, q) => s + q[0], 0) / cell.length),
      y: Math.round(cell.reduce((s, q) => s + q[1], 0) / cell.length),
      polygon: cell.map(round),
      adjacent: adj[i].map((n) => `c${n}`),
      rivers: riverPairs
        .filter(([a, b]) => a === i || b === i)
        .map(([a, b]) => `c${a === i ? b : a}`),
      coastal: coastal[i],
    };
  });
  const duchies = [...Array(DUCHIES).keys()].map((d) => ({
    id: `d${d}`,
    name: placeName(),
    kingdom: `k${duchyKingdom[d]}`,
    counties: counties.filter((c) => c.duchy === `d${d}`).map((c) => c.id),
  }));
  const kingdoms = [...Array(KINGDOMS).keys()].map((k) => ({
    id: `k${k}`,
    name: placeName(),
    duchies: duchies.filter((d) => d.kingdom === `k${k}`).map((d) => d.id),
  }));
  const realms = [...Array(REALMS).keys()].map((r) =>
    counties.filter((_, i) => realmOwner[i] === r).map((c) => c.id),
  );
  const rivers = riverPairs
    .map(([a, b]) => {
      const e = edges.get(`${Math.min(a, b)}|${Math.max(a, b)}`);
      return e ? { a: `c${a}`, b: `c${b}`, path: e.map(round) } : null;
    })
    .filter((x): x is { a: string; b: string; path: [number, number][] } => !!x);
  return {
    width: W,
    height: H,
    counties,
    duchies,
    kingdoms,
    realms,
    rivers,
    sea: sea.map((_, s) => cells[LAND + s].map(round)),
  };
}

/** Génère une carte jouable (nouvel essai tant que le résultat n'est pas valide). */
export function generateMap(rng: Rng): MapData {
  for (let i = 0; i < 60; i++) {
    const m = attempt(rng);
    if (m) return m;
  }
  throw new Error('Génération de carte impossible');
}

// ---------------------------------------------------------------------------
// Terres lointaines : continents et royaumes hors de portée, au bord du monde
// ---------------------------------------------------------------------------

export interface ForeignLand {
  name: string;
  kind: 'royaume' | 'inexplore';
  cells: [number, number][][];
  /** Cellules d'origine (dans le cadre de la carte). */
  source: [number, number][][];
  /** Arêtes de côte (non partagées entre cellules du même ensemble). */
  coast: [[number, number], [number, number]][];
  label: [number, number];
}

const closeTo = (a: number[], b: number[]) =>
  Math.abs(a[0] - b[0]) <= 2.5 && Math.abs(a[1] - b[1]) <= 2.5;

function hashStr(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/**
 * Déduit les terres lointaines de la carte (déterministe) : cellules de mer au bord du monde,
 * éloignées de la côte jouable, regroupées en 2 ou 3 masses par secteurs angulaires.
 */
export function foreignLands(map: MapData, RngCtor: new (s: number) => Rng): ForeignLand[] {
  const rng = new RngCtor(hashStr(map.counties.map((c) => c.name).join('|')));
  const W0 = map.width;
  const H0 = map.height;
  const centroid = (poly: [number, number][]) => [
    poly.reduce((s, p) => s + p[0], 0) / poly.length,
    poly.reduce((s, p) => s + p[1], 0) / poly.length,
  ];
  const landPts = map.counties.flatMap((c) => c.polygon);
  const info = map.sea.map((poly, i) => {
    const c = centroid(poly);
    const border = poly.some((p) => p[0] <= 1 || p[0] >= W0 - 1 || p[1] <= 1 || p[1] >= H0 - 1);
    const coastal = poly.filter((p) => landPts.some((q) => closeTo(p, q))).length >= 2;
    const dLand = Math.min(...map.counties.map((k) => Math.hypot(k.x - c[0], k.y - c[1])));
    const angle = Math.atan2(c[1] - H0 / 2, c[0] - W0 / 2);
    return { i, poly, c, border, coastal, dLand, angle };
  });
  const sectors = [...Array(rng.int(2, 3))].map(() => ({
    a: rng.range(-Math.PI, Math.PI),
    w: rng.range(0.9, 1.5),
  }));
  const angDist = (a: number, b: number) => {
    const d = Math.abs(a - b) % (2 * Math.PI);
    return d > Math.PI ? 2 * Math.PI - d : d;
  };
  const shares = (a: [number, number][], b: [number, number][]) =>
    a.filter((p) => b.some((q) => closeTo(p, q))).length >= 2;
  // Graines au bord du monde, puis croissance vers l'intérieur (en gardant un détroit de mer).
  const allowed = (x: (typeof info)[number]) => !x.coastal && x.dLand > 125;
  const chosenSet = new Set(
    info
      .filter((x) => x.border && allowed(x) && sectors.some((z) => angDist(x.angle, z.a) < z.w))
      .map((x) => x.i),
  );
  for (let round = 0; round < 2; round++) {
    for (const x of info) {
      if (chosenSet.has(x.i) || !allowed(x) || x.dLand < 170) continue;
      if ([...chosenSet].some((j) => shares(info[j].poly, x.poly))) chosenSet.add(x.i);
    }
  }
  const chosen = info.filter((x) => chosenSet.has(x.i));
  const groups: (typeof chosen)[] = [];
  const seen = new Set<number>();
  for (const s of chosen) {
    if (seen.has(s.i)) continue;
    const g = [s];
    seen.add(s.i);
    for (let k = 0; k < g.length; k++)
      for (const t of chosen) {
        if (!seen.has(t.i) && shares(g[k].poly, t.poly)) {
          seen.add(t.i);
          g.push(t);
        }
      }
    groups.push(g);
  }
  // Les terres touchant le bord du monde se prolongent au-delà : ce sont des continents.
  const FAR = 900;
  const ext = (p: [number, number]): [number, number] => [
    p[0] <= 1 ? p[0] - FAR : p[0] >= W0 - 1 ? p[0] + FAR : p[0],
    p[1] <= 1 ? p[1] - FAR : p[1] >= H0 - 1 ? p[1] + FAR : p[1],
  ];
  const syl = [
    'Mor',
    'Val',
    'Kar',
    'Ost',
    'Thul',
    'Ard',
    'Sel',
    'Brun',
    'Hel',
    'Dor',
    'Vyr',
    'Gal',
  ];
  const end = ['vaine', 'dor', 'heim', 'ance', 'rie', 'mark', 'ande', 'gard', 'esse', 'ombre'];
  return groups.map((g, gi) => {
    const coast: ForeignLand['coast'] = [];
    for (const s of g) {
      for (let k = 0; k < s.poly.length; k++) {
        const p = s.poly[k];
        const q = s.poly[(k + 1) % s.poly.length];
        const onBorder =
          (p[0] <= 1 && q[0] <= 1) ||
          (p[0] >= W0 - 1 && q[0] >= W0 - 1) ||
          (p[1] <= 1 && q[1] <= 1) ||
          (p[1] >= H0 - 1 && q[1] >= H0 - 1);
        const inner = g.some(
          (t) => t !== s && t.poly.some((a) => closeTo(a, p)) && t.poly.some((a) => closeTo(a, q)),
        );
        if (!inner && !onBorder) coast.push([ext(p), ext(q)]);
      }
    }
    // Étiquette : la cellule la plus proche du centre du monde.
    const best = [...g].sort(
      (a, b) =>
        Math.hypot(a.c[0] - W0 / 2, a.c[1] - H0 / 2) - Math.hypot(b.c[0] - W0 / 2, b.c[1] - H0 / 2),
    )[0];
    const kind: ForeignLand['kind'] = gi === 0 || rng.chance(0.5) ? 'royaume' : 'inexplore';
    const n = rng.pick(syl) + rng.pick(end);
    return {
      name: kind === 'royaume' ? `Royaume de ${n}` : `Terres de ${n}`,
      kind,
      cells: g.map((s) => s.poly.map(ext)),
      source: g.map((s) => s.poly),
      coast,
      label: [Math.round(best.c[0]), Math.round(best.c[1])],
    };
  });
}
