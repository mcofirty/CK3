/**
 * Génère src/data/map.json : 30 comtés (cellules de Voronoï), mer, adjacences, terrains,
 * rivières, 7 duchés, 2 royaumes et les 5 domaines de départ.
 * Usage : npm run generate-map [-- --seed 42]
 */
import { writeFileSync } from 'node:fs';
import { NAMES } from '../src/data/names';
import { Rng } from '../src/engine/rng';
import type { Terrain } from '../src/engine/state';

type P = [number, number];
const argSeed = process.argv.indexOf('--seed');
const rng = new Rng(argSeed > 0 ? Number(process.argv[argSeed + 1]) : 1066);
const W = 1000;
const H = 1300;
const LAND = 30;

// --- Sites : terre dans une forme irrégulière, mer autour. ---
function inBlob(x: number, y: number): number {
  const cx = W / 2;
  const cy = H / 2;
  const dx = (x - cx) / (W * 0.42);
  const dy = (y - cy) / (H * 0.44);
  const a = Math.atan2(dy, dx);
  const wobble = 1 + 0.12 * Math.sin(3 * a + 1.3) + 0.08 * Math.sin(5 * a + 0.4);
  return Math.sqrt(dx * dx + dy * dy) / wobble;
}

const candidates: P[] = [];
const cols = 7;
const rows = 9;
for (let r = 0; r < rows; r++) {
  for (let c = 0; c < cols; c++) {
    const x = ((c + 0.5 + (r % 2 ? 0.25 : -0.25)) * W) / cols + rng.range(-45, 45);
    const y = ((r + 0.5) * H) / rows + rng.range(-45, 45);
    candidates.push([x, y]);
  }
}
const sortedByBlob = candidates
  .map((p) => ({ p, d: inBlob(p[0], p[1]) }))
  .sort((a, b) => a.d - b.d);
const land = sortedByBlob.slice(0, LAND).map((s) => s.p);
const sea = sortedByBlob.slice(LAND).map((s) => s.p);
const sites = [...land, ...sea];

// --- Voronoï par découpage de demi-plans. ---
function clip(poly: P[], a: number, b: number, c: number): P[] {
  // Garde les points tels que a*x + b*y <= c
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
const cells: P[][] = sites.map((s, i) => {
  let poly: P[] = [
    [0, 0],
    [W, 0],
    [W, H],
    [0, H],
  ];
  sites.forEach((o, j) => {
    if (i === j) return;
    const a = o[0] - s[0];
    const b = o[1] - s[1];
    const c = (o[0] * o[0] + o[1] * o[1] - s[0] * s[0] - s[1] * s[1]) / 2;
    poly = clip(poly, a, b, c);
  });
  return poly;
});

function distPointSeg(p: P, a: P, b: P): number {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const l2 = dx * dx + dy * dy || 1;
  const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l2));
  return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy));
}
/** Arête partagée entre deux cellules (ou undefined). */
function sharedEdge(i: number, j: number): [P, P] | undefined {
  const pi = cells[i];
  const pj = cells[j];
  for (let k = 0; k < pi.length; k++) {
    const a = pi[k];
    const b = pi[(k + 1) % pi.length];
    if (Math.hypot(b[0] - a[0], b[1] - a[1]) < 12) continue;
    const mid: P = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    for (let m = 0; m < pj.length; m++) {
      if (distPointSeg(mid, pj[m], pj[(m + 1) % pj.length]) < 0.5) return [a, b];
    }
  }
  return undefined;
}

const adj: number[][] = land.map(() => []);
const edges = new Map<string, [P, P]>();
for (let i = 0; i < LAND; i++) {
  for (let j = i + 1; j < LAND; j++) {
    const e = sharedEdge(i, j);
    if (e) {
      adj[i].push(j);
      adj[j].push(i);
      edges.set(`${i}|${j}`, e);
    }
  }
}
const coastal = land.map((_, i) => sea.some((_, s) => !!sharedEdge(i, LAND + s)));

// --- Terrains : montagnes groupées, marais sur les côtes, forêts et collines. ---
const terrain: Terrain[] = land.map(() => 'plaine');
const mountainSeed = rng.int(0, LAND - 1);
terrain[mountainSeed] = 'montagne';
for (const n of adj[mountainSeed].slice(0, 2)) terrain[n] = 'montagne';
for (let i = 0; i < LAND; i++) {
  if (terrain[i] !== 'plaine') continue;
  const r = rng.next();
  if (coastal[i] && r < 0.22) terrain[i] = 'marais';
  else if (r < 0.42) terrain[i] = 'foret';
  else if (r < 0.62)
    terrain[i] = adj[i].some((n) => terrain[n] === 'montagne')
      ? 'colline'
      : rng.chance(0.5)
        ? 'colline'
        : 'plaine';
}

// --- Rivière : une chaîne d'arêtes depuis la côte. ---
const riverPairs: [number, number][] = [];
{
  const start = coastal.findIndex((c, i) => c && terrain[i] !== 'montagne');
  let a = start;
  let prev = -1;
  for (let step = 0; step < 7; step++) {
    const options = adj[a].filter(
      (n) =>
        n !== prev && !riverPairs.some(([x, y]) => (x === a && y === n) || (x === n && y === a)),
    );
    if (!options.length) break;
    // Rivière le long de la frontière entre a et b ; on avance vers le centre.
    options.sort((x, y) => inBlob(...land[x]) - inBlob(...land[y]));
    const b = options[Math.min(options.length - 1, rng.int(0, 1))];
    riverPairs.push([a, b]);
    // Le prochain tronçon longe un voisin commun.
    const common = adj[a].filter((n) => adj[b].includes(n) && n !== prev);
    prev = a;
    a = common.length ? rng.pick(common) : b;
  }
}

// --- Croissance de régions équilibrées (BFS multi-sources). ---
function grow(seeds: number[], sizes: number[]): number[] {
  const owner = land.map(() => -1);
  seeds.forEach((s, k) => (owner[s] = k));
  const count = seeds.map(() => 1);
  let changed = true;
  while (changed) {
    changed = false;
    for (let k = 0; k < seeds.length; k++) {
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
  // Restes : au voisin le plus proche.
  let guard = 0;
  while (owner.some((o) => o === -1) && guard++ < 100) {
    owner.forEach((o, i) => {
      if (o !== -1) return;
      const n = adj[i].find((x) => owner[x] !== -1);
      if (n !== undefined) owner[i] = owner[n];
    });
  }
  return owner;
}
function dist(a: P, b: P): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1]);
}
function farthestSeeds(k: number): number[] {
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
}

const duchyOwner = grow(farthestSeeds(7), [5, 5, 4, 4, 4, 4, 4]);
// Royaumes : nord et sud selon le centre des duchés.
const duchyCenters = [...Array(7).keys()].map((d) => {
  const ms = land.filter((_, i) => duchyOwner[i] === d);
  return ms.reduce((s, p) => s + p[1], 0) / Math.max(1, ms.length);
});
const medianY = [...duchyCenters].sort((a, b) => a - b)[3];
const duchyKingdom = duchyCenters.map((y) => (y <= medianY ? 0 : 1));

// Domaines de départ : 5 souverains, 6 comtés chacun ; le joueur au centre-sud.
let realmSeeds = farthestSeeds(5);
const centerIdx = land
  .map((p, i) => ({ i, d: dist(p, [W * 0.5, H * 0.62]) }))
  .sort((a, b) => a.d - b.d)[0].i;
realmSeeds = [centerIdx, ...realmSeeds.filter((s) => s !== centerIdx)].slice(0, 5);
const realmOwner = grow(realmSeeds, [6, 6, 6, 6, 6]);

// --- Noms. ---
const used = new Set<string>();
function placeName(): string {
  for (;;) {
    const n = rng.pick(NAMES.placeStarts) + rng.pick(NAMES.placeEnds);
    if (!used.has(n)) {
      used.add(n);
      return n;
    }
  }
}

const round = (p: P): [number, number] => [Math.round(p[0]), Math.round(p[1])];
const counties = land.map((_, i) => {
  const cell = cells[i];
  const cx = cell.reduce((s, q) => s + q[0], 0) / cell.length;
  const cy = cell.reduce((s, q) => s + q[1], 0) / cell.length;
  return {
    id: `c${i}`,
    name: placeName(),
    terrain: terrain[i],
    duchy: `d${duchyOwner[i]}`,
    x: Math.round(cx),
    y: Math.round(cy),
    polygon: cell.map(round),
    adjacent: adj[i].map((n) => `c${n}`),
    rivers: riverPairs
      .filter(([a, b]) => a === i || b === i)
      .map(([a, b]) => `c${a === i ? b : a}`),
    coastal: coastal[i],
  };
});
const duchies = [...Array(7).keys()].map((d) => ({
  id: `d${d}`,
  name: placeName(),
  kingdom: `k${duchyKingdom[d]}`,
  counties: counties.filter((c) => c.duchy === `d${d}`).map((c) => c.id),
}));
const kingdoms = [0, 1].map((k) => ({
  id: `k${k}`,
  name: placeName(),
  duchies: duchies.filter((d) => d.kingdom === `k${k}`).map((d) => d.id),
}));
const realms = [...Array(5).keys()].map((r) =>
  counties.filter((_, i) => realmOwner[i] === r).map((c) => c.id),
);
const rivers = riverPairs.map(([a, b]) => {
  const e = edges.get(`${Math.min(a, b)}|${Math.max(a, b)}`)!;
  return { a: `c${a}`, b: `c${b}`, path: e.map(round) };
});

const map = {
  width: W,
  height: H,
  counties,
  duchies,
  kingdoms,
  realms,
  rivers,
  sea: sea.map((_, s) => cells[LAND + s].map(round)),
};
writeFileSync(new URL('../src/data/map.json', import.meta.url), JSON.stringify(map));
console.log(
  `Carte : ${counties.length} comtés, ${duchies.length} duchés, ${kingdoms.length} royaumes, ` +
    `${rivers.length} tronçons de rivière. Domaines : ${realms.map((r) => r.length).join(', ')}`,
);
console.log(
  'Terrains :',
  Object.entries(
    terrain.reduce<Record<string, number>>((m, t) => ((m[t] = (m[t] ?? 0) + 1), m), {}),
  ),
);
console.log(
  'Duchés :',
  duchies.map((d) => `${d.name}(${d.counties.length},${d.kingdom})`).join(' '),
);
