/**
 * Éléments graphiques de la carte illustrée : symboles SVG (arbres, collines, montagnes,
 * champs, villages, châteaux, navires, rose des vents) et placement procédural du décor.
 * Tout est dessiné en SVG, sans image externe ; le décor est déterministe pour une carte donnée.
 */
import { foreignLands, type ForeignLand, type MapData } from '../../engine/mapgen';
import { Rng, hashString } from '../../engine/rng';

type Pt = [number, number];

// ---------------------------------------------------------------------------
// Symboles
// ---------------------------------------------------------------------------

const INK = '#3b2a1a';

export function MapSymbols() {
  return (
    <>
      {/* Feuillu */}
      <symbol id="s-tree" overflow="visible">
        <ellipse cx="2" cy="1" rx="10" ry="3.2" fill="rgba(40,30,10,0.28)" />
        <rect x="-1.6" y="-7" width="3.2" height="8" rx="1" fill="#6b4a2a" />
        <circle cx="0" cy="-15" r="9.5" fill="#4b7a2c" stroke="#25381a" strokeWidth="1" />
        <circle cx="-5.5" cy="-11" r="6.5" fill="#55882f" stroke="#25381a" strokeWidth="0.8" />
        <circle cx="5.5" cy="-11.5" r="6.5" fill="#477127" stroke="#25381a" strokeWidth="0.8" />
        <circle cx="-3" cy="-18" r="4.2" fill="#78a948" />
        <circle cx="2" cy="-12" r="2.4" fill="#86b553" opacity="0.8" />
      </symbol>
      {/* Feuillu d'automne */}
      <symbol id="s-tree-or" overflow="visible">
        <ellipse cx="2" cy="1" rx="10" ry="3.2" fill="rgba(40,30,10,0.28)" />
        <rect x="-1.6" y="-7" width="3.2" height="8" rx="1" fill="#6b4a2a" />
        <circle cx="0" cy="-15" r="9.5" fill="#c58a27" stroke="#5a3a12" strokeWidth="1" />
        <circle cx="-5.5" cy="-11" r="6.5" fill="#d49a2f" stroke="#5a3a12" strokeWidth="0.8" />
        <circle cx="5.5" cy="-11.5" r="6.5" fill="#b9791f" stroke="#5a3a12" strokeWidth="0.8" />
        <circle cx="-3" cy="-18" r="4.2" fill="#e8b84d" />
      </symbol>
      {/* Conifère */}
      <symbol id="s-pine" overflow="visible">
        <ellipse cx="2" cy="1" rx="8" ry="2.6" fill="rgba(40,30,10,0.28)" />
        <rect x="-1.4" y="-5" width="2.8" height="6" fill="#5a3c22" />
        <path
          d="M0 -30 L-8 -12 L8 -12 Z"
          fill="#3c6b3c"
          stroke="#1f3a20"
          strokeWidth="0.9"
          strokeLinejoin="round"
        />
        <path
          d="M0 -22 L-10 -3 L10 -3 Z"
          fill="#33602f"
          stroke="#1f3a20"
          strokeWidth="0.9"
          strokeLinejoin="round"
        />
        <path d="M0 -30 L-3 -22 L0 -23 Z M0 -22 L-4 -12 L0 -13 Z" fill="#5f9455" />
      </symbol>
      {/* Colline */}
      <symbol id="s-hill" overflow="visible">
        <ellipse cx="3" cy="1" rx="25" ry="4" fill="rgba(40,30,10,0.22)" />
        <path
          d="M-24 0 Q-14 -19 0 -21 Q14 -19 24 0 Z"
          fill="#a9a35c"
          stroke="#5f5730"
          strokeWidth="1.2"
        />
        <path d="M0 -21 Q14 -19 24 0 L6 0 Q8 -10 0 -21 Z" fill="#8c8746" />
        <path
          d="M-16 -9 Q-10 -16 -3 -18"
          stroke="#d2cc8c"
          strokeWidth="2"
          fill="none"
          strokeLinecap="round"
        />
        <path d="M-12 -2 l2 -3 M-4 -4 l2 -3 M8 -3 l2 -3" stroke="#6d6a35" strokeWidth="1" />
      </symbol>
      {/* Montagne */}
      <symbol id="s-mount" overflow="visible">
        <ellipse cx="4" cy="1" rx="30" ry="4.5" fill="rgba(40,30,10,0.25)" />
        <path
          d="M-28 0 L-6 -40 L2 -30 L9 -37 L30 0 Z"
          fill="#cfc2a2"
          stroke={INK}
          strokeWidth="1.4"
          strokeLinejoin="round"
        />
        <path d="M-6 -40 L2 -30 L-2 0 L-28 0 Z" fill="#e3d9be" />
        <path d="M2 -30 L9 -37 L30 0 L-2 0 Z" fill="#9c8d72" />
        <path d="M-6 -40 L-12 -29 L-7 -31 L-3 -26 L2 -30 Z" fill="#fbf8f0" />
        <path d="M9 -37 L5 -31 L9 -32 L13 -29 Z" fill="#f2eee4" />
        <path
          d="M-6 -40 L2 -30 L9 -37 L30 0 L-28 0 Z"
          fill="none"
          stroke={INK}
          strokeWidth="1.4"
          strokeLinejoin="round"
        />
        <path d="M-2 0 L2 -30 M14 -10 L20 -6" stroke="#6b5d48" strokeWidth="1" />
      </symbol>
      {/* Marais */}
      <symbol id="s-marsh" overflow="visible">
        <ellipse cx="0" cy="0" rx="12" ry="4" fill="#7fa9b9" stroke="#4d7684" strokeWidth="0.8" />
        <ellipse cx="14" cy="5" rx="7" ry="2.6" fill="#86b0c0" stroke="#4d7684" strokeWidth="0.8" />
        <path
          d="M-8 -1 v-9 M-5 -1 v-12 M-2 -1 v-8 M10 3 v-8 M13 3 v-10"
          stroke="#3f6b35"
          strokeWidth="1.3"
          strokeLinecap="round"
        />
        <circle cx="-5" cy="-13" r="1.3" fill="#7a4e2a" />
        <circle cx="13" cy="-8" r="1.3" fill="#7a4e2a" />
      </symbol>
      {/* Champs cultivés */}
      <symbol id="s-field" overflow="visible">
        <g transform="skewX(-18)">
          <rect
            x="-20"
            y="-12"
            width="18"
            height="11"
            fill="#d4b35d"
            stroke="#8a6d33"
            strokeWidth="0.8"
          />
          <path d="M-20 -9 h18 M-20 -6 h18 M-20 -3 h18" stroke="#b8963f" strokeWidth="0.8" />
          <rect
            x="0"
            y="-12"
            width="16"
            height="11"
            fill="#9c7448"
            stroke="#6e5030"
            strokeWidth="0.8"
          />
          <path d="M3 -12 v11 M7 -12 v11 M11 -12 v11" stroke="#7f5c38" strokeWidth="0.8" />
          <rect
            x="-12"
            y="1"
            width="20"
            height="9"
            fill="#a9b45a"
            stroke="#6b7a33"
            strokeWidth="0.8"
          />
        </g>
      </symbol>
      {/* Village */}
      <symbol id="s-town" overflow="visible">
        <ellipse cx="2" cy="2" rx="20" ry="4" fill="rgba(40,30,10,0.25)" />
        <g stroke={INK} strokeWidth="1" strokeLinejoin="round">
          <rect x="-16" y="-9" width="11" height="9" fill="#e6d6b2" />
          <path d="M-17.5 -9 L-10.5 -17 L-3.5 -9 Z" fill="#9a4a32" />
          <rect x="-3" y="-12" width="12" height="12" fill="#efe1c0" />
          <path d="M-4.5 -12 L3 -21 L10.5 -12 Z" fill="#7d3b2a" />
          <rect x="10" y="-7" width="9" height="7" fill="#e2d1aa" />
          <path d="M9 -7 L14.5 -13 L20 -7 Z" fill="#a85a3a" />
        </g>
        <rect x="1" y="-6" width="3" height="6" fill={INK} opacity="0.7" />
      </symbol>
      {/* Château (la bannière prend la couleur courante) */}
      <symbol id="s-castle" overflow="visible">
        <ellipse cx="2" cy="2" rx="24" ry="5" fill="rgba(40,30,10,0.28)" />
        <g stroke={INK} strokeWidth="1.2" strokeLinejoin="round">
          <path
            d="M-20 0 V-14 H-16 V-11 H-12 V-14 H-8 V-11 H8 V-14 H12 V-11 H16 V-14 H20 V0 Z"
            fill="#cfc2a6"
          />
          <rect x="-24" y="-24" width="9" height="24" fill="#d9cdb2" />
          <path d="M-26 -24 L-19.5 -34 L-13 -24 Z" fill="#4a5d7a" />
          <rect x="15" y="-24" width="9" height="24" fill="#d9cdb2" />
          <path d="M13 -24 L19.5 -34 L26 -24 Z" fill="#4a5d7a" />
          <rect x="-8" y="-30" width="16" height="30" fill="#e4d9c0" />
          <path d="M-10 -30 L0 -42 L10 -30 Z" fill="#3e4f6a" />
          <path d="M-3 0 V-7 Q0 -11 3 -7 V0 Z" fill="#4a3424" />
        </g>
        <path d="M0 -42 V-54" stroke={INK} strokeWidth="1.3" />
        <path d="M0 -54 L12 -51 L0 -47 Z" fill="currentColor" stroke={INK} strokeWidth="0.8" />
        <rect x="-22" y="-19" width="2.5" height="4" fill={INK} opacity="0.6" />
        <rect x="18" y="-19" width="2.5" height="4" fill={INK} opacity="0.6" />
      </symbol>
      {/* Navire */}
      <symbol id="s-ship" overflow="visible">
        <path d="M-22 0 Q0 10 22 0 L18 -6 H-18 Z" fill="#6b4529" stroke={INK} strokeWidth="1.1" />
        <path d="M-1 -6 V-40" stroke={INK} strokeWidth="1.4" />
        <path d="M0 -38 Q14 -26 0 -10 Z" fill="#f4ecdc" stroke={INK} strokeWidth="1" />
        <path d="M-2 -36 Q-14 -26 -2 -14 Z" fill="#ece2cc" stroke={INK} strokeWidth="1" />
        <path d="M-1 -40 L8 -43 L-1 -45 Z" fill="#a33a2c" />
        <path
          d="M-26 5 q6 -3 12 0 t12 0 t12 0 t12 0"
          stroke="#e8f1f4"
          strokeWidth="1.2"
          fill="none"
          opacity="0.8"
        />
      </symbol>
      {/* Rose des vents */}
      <symbol id="s-compass" overflow="visible">
        <circle r="46" fill="rgba(243,233,205,0.85)" stroke={INK} strokeWidth="2" />
        <circle r="40" fill="none" stroke="#a17f3a" strokeWidth="3" />
        <circle r="35" fill="none" stroke={INK} strokeWidth="0.8" />
        <g fill="#c9a24e" stroke={INK} strokeWidth="1">
          {[45, 135, 225, 315].map((a) => (
            <path key={a} d="M0 0 L5 -5 L0 -28 L-5 -5 Z" transform={`rotate(${a})`} />
          ))}
        </g>
        <g stroke={INK} strokeWidth="1">
          {[0, 90, 180, 270].map((a) => (
            <g key={a} transform={`rotate(${a})`}>
              <path d="M0 0 L7 -7 L0 -44 Z" fill="#e7cf8a" />
              <path d="M0 0 L-7 -7 L0 -44 Z" fill="#8a6a2a" />
            </g>
          ))}
        </g>
        <circle r="5" fill="#e7cf8a" stroke={INK} strokeWidth="1" />
        <text y="-52" textAnchor="middle" className="map-font" fontSize="16" fill={INK}>
          N
        </text>
      </symbol>
    </>
  );
}

// ---------------------------------------------------------------------------
// Placement du décor
// ---------------------------------------------------------------------------

export interface Icon {
  sym: string;
  x: number;
  y: number;
  s: number;
}

export interface Decor {
  icons: Icon[];
  foreignIcons: Icon[];
  towns: Record<string, Pt>;
  roads: { a: Pt; b: Pt; c: Pt }[];
  foreign: ForeignLand[];
  compass?: Pt;
  cartouche?: Pt;
  ships: Pt[];
  waves: Pt[];
}

function inside(pt: Pt, poly: Pt[]): boolean {
  let ins = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    if (yi > pt[1] !== yj > pt[1] && pt[0] < ((xj - xi) * (pt[1] - yi)) / (yj - yi) + xi)
      ins = !ins;
  }
  return ins;
}

function edgeDist(pt: Pt, poly: Pt[]): number {
  let best = Infinity;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const l2 = dx * dx + dy * dy || 1;
    const t = Math.max(0, Math.min(1, ((pt[0] - a[0]) * dx + (pt[1] - a[1]) * dy) / l2));
    best = Math.min(best, Math.hypot(pt[0] - (a[0] + t * dx), pt[1] - (a[1] + t * dy)));
  }
  return best;
}

const TERRAIN_DECOR: Record<string, { n: [number, number]; pick: (r: Rng) => [string, number] }> = {
  foret: {
    n: [8, 11],
    pick: (r) => [
      r.chance(0.35) ? 's-pine' : r.chance(0.12) ? 's-tree-or' : 's-tree',
      r.range(0.85, 1.15),
    ],
  },
  colline: {
    n: [4, 6],
    pick: (r) => (r.chance(0.72) ? ['s-hill', r.range(0.8, 1.1)] : ['s-tree', 0.85]),
  },
  montagne: {
    n: [4, 6],
    pick: (r) => (r.chance(0.8) ? ['s-mount', r.range(0.8, 1.15)] : ['s-pine', 0.9]),
  },
  marais: {
    n: [4, 6],
    pick: (r) => (r.chance(0.65) ? ['s-marsh', r.range(0.8, 1.1)] : ['s-tree', 0.8]),
  },
  plaine: {
    n: [3, 5],
    pick: (r) =>
      r.chance(0.5) ? ['s-field', r.range(0.85, 1.05)] : ['s-tree', r.range(0.75, 0.95)],
  },
};

function scatter(
  rng: Rng,
  poly: Pt[],
  count: number,
  pick: (r: Rng) => [string, number],
  avoid: (p: Pt) => boolean,
  out: Icon[],
): void {
  const xs = poly.map((p) => p[0]);
  const ys = poly.map((p) => p[1]);
  const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  const placed: Pt[] = [];
  for (let tries = 0; tries < 160 && placed.length < count; tries++) {
    const p: Pt = [rng.range(x0, x1), rng.range(y0, y1)];
    if (!inside(p, poly) || edgeDist(p, poly) < 16 || avoid(p)) continue;
    if (placed.some((q) => Math.hypot(q[0] - p[0], q[1] - p[1]) < 26)) continue;
    placed.push(p);
    const [sym, s] = pick(rng);
    out.push({ sym, x: Math.round(p[0]), y: Math.round(p[1]), s: Math.round(s * 100) / 100 });
  }
}

const decorCache = new WeakMap<MapData, Decor>();

/** Décor de la carte : calculé une fois par carte, identique à chaque affichage. */
export function decorFor(map: MapData): Decor {
  const cached = decorCache.get(map);
  if (cached) return cached;
  const rng = new Rng(hashString(map.counties.map((c) => c.name).join('|')));
  const icons: Icon[] = [];
  const towns: Record<string, Pt> = {};
  for (const c of map.counties) {
    const poly = c.polygon as Pt[];
    const town: Pt = [c.x, c.y - 26];
    towns[c.id] = town;
    const avoid = (p: Pt) =>
      (Math.abs(p[0] - c.x) < 62 && Math.abs(p[1] - (c.y + 2)) < 20) || // nom
      Math.hypot(p[0] - town[0], p[1] - town[1]) < 34 || // village
      (Math.abs(p[0] - c.x) < 48 && p[1] > c.y + 18 && p[1] < c.y + 66); // armées
    const d = TERRAIN_DECOR[c.terrain] ?? TERRAIN_DECOR.plaine;
    scatter(rng, poly, rng.int(d.n[0], d.n[1]), d.pick, avoid, icons);
  }
  icons.sort((a, b) => a.y - b.y);

  // Chemins : arbre couvrant minimal entre les villages voisins (Kruskal).
  const edges: { a: string; b: string; d: number }[] = [];
  for (const c of map.counties)
    for (const n of c.adjacent)
      if (n > c.id) {
        const o = map.counties.find((k) => k.id === n)!;
        edges.push({ a: c.id, b: n, d: Math.hypot(c.x - o.x, c.y - o.y) });
      }
  edges.sort((x, y) => x.d - y.d);
  const parent: Record<string, string> = Object.fromEntries(map.counties.map((c) => [c.id, c.id]));
  const find = (x: string): string => (parent[x] === x ? x : (parent[x] = find(parent[x])));
  const roads: Decor['roads'] = [];
  for (const e of edges) {
    const ra = find(e.a);
    const rb = find(e.b);
    if (ra === rb) continue;
    parent[ra] = rb;
    const a = towns[e.a];
    const b = towns[e.b];
    const mx = (a[0] + b[0]) / 2;
    const my = (a[1] + b[1]) / 2;
    const off = rng.range(-0.18, 0.18);
    roads.push({
      a: [a[0], a[1] + 6],
      b: [b[0], b[1] + 6],
      c: [mx - (b[1] - a[1]) * off, my + (b[0] - a[0]) * off],
    });
  }

  // Terres lointaines et leur décor.
  const foreign = foreignLands(map, Rng);
  const foreignIcons: Icon[] = [];
  for (const f of foreign)
    for (const cell of f.source) {
      const kind = rng.pick(['foret', 'colline', 'montagne', 'plaine']);
      const d = TERRAIN_DECOR[kind];
      scatter(
        rng,
        cell as Pt[],
        rng.int(4, 7),
        d.pick,
        (p) => Math.hypot(p[0] - f.label[0], p[1] - f.label[1]) < 70,
        foreignIcons,
      );
    }
  foreignIcons.sort((a, b) => a.y - b.y);

  // Mer ouverte : rose des vents, cartouche, navires, vaguelettes.
  const foreignCells = new Set(foreign.flatMap((f) => f.source));
  const farFromForeign = (p: Pt) =>
    foreign.every((f) => Math.hypot(f.label[0] - p[0], f.label[1] - p[1]) > 240);
  const landPts = map.counties.map((c) => [c.x, c.y] as Pt);
  const openSea = map.sea
    .filter((cell) => !foreignCells.has(cell))
    .map((cell) => {
      const c: Pt = [
        cell.reduce((s, p) => s + p[0], 0) / cell.length,
        cell.reduce((s, p) => s + p[1], 0) / cell.length,
      ];
      const d = Math.min(...landPts.map((p) => Math.hypot(p[0] - c[0], p[1] - c[1])));
      return { c, d, cell: cell as Pt[] };
    })
    .filter((s) => s.d > 120 && inside(s.c, s.cell) && farFromForeign(s.c))
    .sort((a, b) => b.d - a.d);
  const take = (pred: (p: Pt) => boolean) => {
    const i = openSea.findIndex((s) => pred(s.c));
    return i >= 0 ? openSea.splice(i, 1)[0].c : undefined;
  };
  const compass = take((p) => p[0] > map.width / 2 && p[1] < map.height / 2) ?? take(() => true);
  const cartouche = take((p) => p[1] < map.height / 2) ?? take(() => true);
  const ships = [take(() => true), take(() => true)].filter((p): p is Pt => !!p);
  const waves: Pt[] = [];
  for (const s of openSea)
    for (let k = 0; k < 3; k++)
      waves.push([s.c[0] + rng.range(-50, 50), s.c[1] + rng.range(-50, 50)]);

  const d: Decor = { icons, foreignIcons, towns, roads, foreign, compass, cartouche, ships, waves };
  decorCache.set(map, d);
  return d;
}
