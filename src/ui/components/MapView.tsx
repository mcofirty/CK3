import { useMemo, useRef, useState } from 'react';
import { TERRAINS } from '../../data/terrain';
import { atWar } from '../../engine/characters';
import { Rng } from '../../engine/rng';
import {
  capitalOf,
  countyRuler,
  fortLevel,
  independentRulers,
  realmCounties,
  realmName,
} from '../../engine/realm';
import type { GameState, Terrain } from '../../engine/state';
import { totalMen } from '../../engine/units';
import type { MapData } from '../../engine/mapgen';

// ---------------------------------------------------------------------------
// Couleurs des royaumes : une couleur distincte par souverain indépendant
// ---------------------------------------------------------------------------

export const PLAYER_COLOR = '#b4473a';
const REALM_PALETTE = [
  '#4f7fb5',
  '#5d9a55',
  '#9a6fb0',
  '#d39a3a',
  '#3f9e9a',
  '#8a9450',
  '#b8737f',
  '#6f7d8f',
];

/** Attribue à chaque souverain une couleur stable (graine de dynastie) et sans doublon. */
export function realmColors(game: GameState): Map<string, string> {
  const res = new Map<string, string>();
  const used = new Set<string>();
  const rulers = independentRulers(game).sort((a, b) => {
    const da = game.characters[a]?.dynastyId ?? a;
    const db = game.characters[b]?.dynastyId ?? b;
    return da.localeCompare(db);
  });
  for (const r of rulers) {
    if (r === game.playerId) {
      res.set(r, PLAYER_COLOR);
      continue;
    }
    const dyn = game.characters[r]?.dynastyId;
    const seed = dyn ? (game.dynasties[dyn]?.seed ?? 7) : 7;
    let i = new Rng(seed).int(0, REALM_PALETTE.length - 1);
    for (let k = 0; k < REALM_PALETTE.length && used.has(REALM_PALETTE[i]); k++)
      i = (i + 1) % REALM_PALETTE.length;
    used.add(REALM_PALETTE[i]);
    res.set(r, REALM_PALETTE[i]);
  }
  return res;
}

export function realmColor(game: GameState, rulerId: string): string {
  return realmColors(game).get(rulerId) ?? '#8c8c8c';
}

/** Effectif visible d'une armée : exact près de vos troupes et forts, estimé au-delà. */
export function visibleMen(game: GameState, armyId: string): { men: number; exact: boolean } {
  const a = game.armies[armyId];
  const men = totalMen(a.men);
  if (a.ownerId === game.playerId) return { men, exact: true };
  const mine = new Set<string>();
  for (const c of Object.values(game.counties))
    if (countyRuler(game, c) === game.playerId) mine.add(c.id);
  for (const x of Object.values(game.armies)) if (x.ownerId === game.playerId) mine.add(x.location);
  const near = mine.has(a.location) || game.counties[a.location].adjacent.some((n) => mine.has(n));
  if (near) return { men, exact: true };
  return { men: Math.max(500, Math.round(men / 500) * 500), exact: false };
}

// ---------------------------------------------------------------------------
// Géométrie précalculée : arêtes partagées entre comtés et côtes
// ---------------------------------------------------------------------------

type Pt = [number, number];
const near = (a: Pt, b: Pt) => Math.abs(a[0] - b[0]) <= 2.5 && Math.abs(a[1] - b[1]) <= 2.5;

interface Geometry {
  COUNTY: Map<string, MapData['counties'][number]>;
  /** Arêtes communes à deux comtés voisins. */
  SHARED: { a: string; b: string; p: Pt; q: Pt }[];
  /** Segments de côte. */
  COAST: [Pt, Pt][];
  /** Cadre des terres, avec une marge. */
  LAND: { x: number; y: number; w: number; h: number };
}

const geoCache = new WeakMap<MapData, Geometry>();

/** Géométrie dérivée de la carte, calculée une fois par carte. */
export function geometry(map: MapData): Geometry {
  const cached = geoCache.get(map);
  if (cached) return cached;
  const COUNTY = new Map(map.counties.map((c) => [c.id, c]));
  const SHARED: Geometry['SHARED'] = [];
  for (const c of map.counties) {
    for (const nId of c.adjacent) {
      if (nId < c.id) continue;
      const n = COUNTY.get(nId)!;
      const common = (c.polygon as Pt[]).filter((v) => (n.polygon as Pt[]).some((w) => near(v, w)));
      if (common.length >= 2) SHARED.push({ a: c.id, b: nId, p: common[0], q: common[1] });
    }
  }
  const COAST: [Pt, Pt][] = [];
  for (const c of map.counties) {
    const poly = c.polygon as Pt[];
    for (let i = 0; i < poly.length; i++) {
      const p = poly[i];
      const q = poly[(i + 1) % poly.length];
      const shared = SHARED.some(
        (e) =>
          (e.a === c.id || e.b === c.id) &&
          ((near(e.p, p) && near(e.q, q)) || (near(e.p, q) && near(e.q, p))),
      );
      if (!shared) COAST.push([p, q]);
    }
  }
  const xs = map.counties.flatMap((c) => c.polygon.map((p) => p[0]));
  const ys = map.counties.flatMap((c) => c.polygon.map((p) => p[1]));
  const m = 24;
  const LAND = {
    x: Math.min(...xs) - m,
    y: Math.min(...ys) - m,
    w: Math.max(...xs) - Math.min(...xs) + 2 * m,
    h: Math.max(...ys) - Math.min(...ys) + 2 * m,
  };
  const g = { COUNTY, SHARED, COAST, LAND };
  geoCache.set(map, g);
  return g;
}

const pts = (poly: number[][]) => poly.map((p) => p.join(',')).join(' ');
const seg = (p: Pt, q: Pt) => `M${p[0]} ${p[1]}L${q[0]} ${q[1]}`;

const TERRAIN_PATTERN: Partial<Record<Terrain, string>> = {
  foret: 'url(#pat-foret)',
  colline: 'url(#pat-colline)',
  montagne: 'url(#pat-montagne)',
  marais: 'url(#pat-marais)',
};

// ---------------------------------------------------------------------------
// Composant
// ---------------------------------------------------------------------------

export function MapView({
  game,
  selected,
  onSelect,
  onArmy,
}: {
  game: GameState;
  selected?: string;
  onSelect: (id: string) => void;
  onArmy?: (armyId: string) => void;
}) {
  const MAP_DATA = game.map;
  const { COUNTY, SHARED, COAST, LAND } = geometry(MAP_DATA);
  const [mode, setMode] = useState<'royaumes' | 'terrain'>('royaumes');
  const [legend, setLegend] = useState(false);
  const [vb, setVb] = useState(LAND);
  const svgRef = useRef<SVGSVGElement>(null);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const moved = useRef(0);
  const dark =
    typeof matchMedia !== 'undefined' && matchMedia('(prefers-color-scheme: dark)').matches;

  const colors = useMemo(() => realmColors(game), [game]);
  const rulerOf = useMemo(() => {
    const m = new Map<string, string>();
    for (const c of Object.values(game.counties)) m.set(c.id, countyRuler(game, c));
    return m;
  }, [game]);

  // --- Gestes : glisser, pincer, molette ---
  const scale = () => {
    const r = svgRef.current!.getBoundingClientRect();
    return Math.max(vb.w / r.width, vb.h / r.height);
  };
  const clampVb = (v: typeof vb) => {
    const w = Math.max(200, Math.min(LAND.w * 1.25, v.w));
    const h = (w * v.h) / v.w;
    return {
      w,
      h,
      x: Math.max(LAND.x - w * 0.5, Math.min(LAND.x + LAND.w - w * 0.5, v.x)),
      y: Math.max(LAND.y - h * 0.5, Math.min(LAND.y + LAND.h - h * 0.5, v.y)),
    };
  };
  const onDown = (e: React.PointerEvent) => {
    // Le bord de l'écran est réservé au glissement entre pages.
    if (e.pointerType !== 'mouse' && (e.clientX < 24 || e.clientX > window.innerWidth - 24)) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size === 1) moved.current = 0;
  };
  const onMove = (e: React.PointerEvent) => {
    const prev = pointers.current.get(e.pointerId);
    if (!prev) return;
    const all = [...pointers.current.entries()];
    if (all.length === 1) {
      const s = scale();
      moved.current += Math.abs(e.clientX - prev.x) + Math.abs(e.clientY - prev.y);
      if (moved.current > 6) {
        (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
        setVb((v) =>
          clampVb({ ...v, x: v.x - (e.clientX - prev.x) * s, y: v.y - (e.clientY - prev.y) * s }),
        );
      }
    } else if (all.length === 2) {
      const other = all.find(([id]) => id !== e.pointerId)![1];
      const d0 = Math.hypot(prev.x - other.x, prev.y - other.y);
      const d1 = Math.hypot(e.clientX - other.x, e.clientY - other.y);
      if (d0 > 0 && d1 > 0) {
        const f = d0 / d1;
        const r = svgRef.current!.getBoundingClientRect();
        const mx = (other.x + e.clientX) / 2 - r.left;
        const my = (other.y + e.clientY) / 2 - r.top;
        setVb((v) => {
          const s = Math.max(v.w / r.width, v.h / r.height);
          const cx = v.x + mx * s;
          const cy = v.y + my * s;
          return clampVb({
            x: cx - (cx - v.x) * f,
            y: cy - (cy - v.y) * f,
            w: v.w * f,
            h: v.h * f,
          });
        });
      }
      moved.current += 20;
    }
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
  };
  const onUp = (e: React.PointerEvent) => {
    pointers.current.delete(e.pointerId);
  };
  const zoom = (f: number) =>
    setVb((v) =>
      clampVb({
        x: v.x + (v.w * (1 - f)) / 2,
        y: v.y + (v.h * (1 - f)) / 2,
        w: v.w * f,
        h: v.h * f,
      }),
    );
  const focusPlayer = () => {
    const mine = realmCounties(game, game.playerId).map((c) => COUNTY.get(c.id)!);
    if (!mine.length) return setVb(LAND);
    const xs = mine.flatMap((c) => c.polygon.map((p) => p[0]));
    const ys = mine.flatMap((c) => c.polygon.map((p) => p[1]));
    const m = 60;
    setVb(
      clampVb({
        x: Math.min(...xs) - m,
        y: Math.min(...ys) - m,
        w: Math.max(...xs) - Math.min(...xs) + 2 * m,
        h: Math.max(...ys) - Math.min(...ys) + 2 * m,
      }),
    );
  };
  const tap = (fn: () => void) => () => {
    if (moved.current < 8) fn();
  };

  // --- Données dérivées ---
  const rulers = independentRulers(game);
  const realmLabels = rulers.map((r) => {
    const cs = realmCounties(game, r).map((c) => COUNTY.get(c.id)!);
    const x = cs.reduce((s, c) => s + c.x, 0) / Math.max(1, cs.length);
    const y = cs.reduce((s, c) => s + c.y, 0) / Math.max(1, cs.length);
    const name = realmName(game, r);
    const [kind, ...rest] = name.split(' de ');
    return { r, x, y, kind, name: rest.join(' de ') || name, size: cs.length };
  });
  const capitals = new Set(rulers.map((r) => capitalOf(game, r)?.id).filter(Boolean) as string[]);
  const armiesByCounty = new Map<string, string[]>();
  for (const a of Object.values(game.armies))
    armiesByCounty.set(a.location, [...(armiesByCounty.get(a.location) ?? []), a.id]);
  const playerArmy = Object.values(game.armies).find((a) => a.ownerId === game.playerId);
  const k = vb.w / LAND.w; // facteur de zoom (1 = carte entière)
  const labelScale = Math.max(0.55, Math.min(1, k));
  // Zoom sémantique : vue d'ensemble = noms des royaumes, zoom avant = noms des comtés.
  const showRealms = mode === 'royaumes' && k > 0.72;

  return (
    <div className="map-wrap">
      <svg
        ref={svgRef}
        viewBox={`${vb.x} ${vb.y} ${vb.w} ${vb.h}`}
        preserveAspectRatio="xMidYMid meet"
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
        onWheel={(e) => zoom(e.deltaY > 0 ? 1.1 : 0.9)}
      >
        <defs>
          <radialGradient id="sea-grad" cx="50%" cy="45%" r="70%">
            <stop offset="0%" stopColor={dark ? '#1f3644' : '#d3e1e6'} />
            <stop offset="100%" stopColor={dark ? '#0f1b22' : '#a9c0ca'} />
          </radialGradient>
          <pattern id="pat-vagues" width="60" height="26" patternUnits="userSpaceOnUse">
            <path
              d="M0 13 Q15 5 30 13 T60 13"
              fill="none"
              stroke={dark ? 'rgba(170,210,230,0.12)' : 'rgba(255,255,255,0.45)'}
              strokeWidth="2"
            />
          </pattern>
          <pattern id="pat-foret" width="44" height="40" patternUnits="userSpaceOnUse">
            <g fill="rgba(30,60,30,0.38)">
              <path d="M11 6 L18 20 H4 Z" />
              <rect x="10" y="20" width="2" height="5" />
              <path d="M33 22 L40 36 H26 Z" />
              <rect x="32" y="36" width="2" height="4" />
            </g>
          </pattern>
          <pattern id="pat-colline" width="56" height="34" patternUnits="userSpaceOnUse">
            <g fill="none" stroke="rgba(90,60,25,0.35)" strokeWidth="2.2" strokeLinecap="round">
              <path d="M4 16 Q14 4 24 16" />
              <path d="M32 32 Q42 20 52 32" />
            </g>
          </pattern>
          <pattern id="pat-montagne" width="60" height="48" patternUnits="userSpaceOnUse">
            <g stroke="rgba(60,45,35,0.45)" strokeWidth="2.2" strokeLinejoin="round">
              <path d="M4 26 L16 8 L28 26" fill="rgba(255,255,255,0.25)" />
              <path d="M32 46 L44 28 L56 46" fill="rgba(255,255,255,0.25)" />
            </g>
          </pattern>
          <pattern id="pat-marais" width="40" height="30" patternUnits="userSpaceOnUse">
            <g stroke="rgba(40,80,70,0.4)" strokeWidth="2" strokeLinecap="round">
              <path d="M6 18 V8 M10 18 V11 M14 18 V9" />
              <path d="M24 28 h12" />
            </g>
          </pattern>
          <pattern
            id="hatch"
            width="16"
            height="16"
            patternUnits="userSpaceOnUse"
            patternTransform="rotate(45)"
          >
            <rect width="6" height="16" fill="rgba(150,20,20,0.5)" />
          </pattern>
          <filter id="relief" x="-5%" y="-5%" width="110%" height="110%">
            <feDropShadow dx="0" dy="6" stdDeviation="8" floodColor="#000" floodOpacity="0.25" />
          </filter>
        </defs>

        {/* Mer */}
        <rect
          x={LAND.x - 2000}
          y={LAND.y - 2000}
          width={LAND.w + 4000}
          height={LAND.h + 4000}
          fill="url(#sea-grad)"
        />
        <rect
          x={LAND.x - 2000}
          y={LAND.y - 2000}
          width={LAND.w + 4000}
          height={LAND.h + 4000}
          fill="url(#pat-vagues)"
        />
        {/* Halo de côte */}
        <path
          d={COAST.map(([p, q]) => seg(p, q)).join('')}
          stroke={dark ? 'rgba(160,200,220,0.18)' : 'rgba(255,255,255,0.7)'}
          strokeWidth={22}
          strokeLinecap="round"
          fill="none"
        />

        {/* Comtés */}
        <g filter="url(#relief)">
          {MAP_DATA.counties.map((m) => {
            const c = game.counties[m.id];
            const ruler = rulerOf.get(m.id)!;
            const fill =
              mode === 'terrain'
                ? dark
                  ? TERRAINS[c.terrain].colorDark
                  : TERRAINS[c.terrain].color
                : (colors.get(ruler) ?? '#8c8c8c');
            return (
              <polygon
                key={m.id}
                points={pts(m.polygon)}
                fill={fill}
                fillOpacity={mode === 'royaumes' ? (c.holderId === ruler ? 0.92 : 0.7) : 1}
                stroke="none"
              />
            );
          })}
        </g>
        {/* Textures de relief */}
        {MAP_DATA.counties.map((m) => {
          const pat = TERRAIN_PATTERN[game.counties[m.id].terrain];
          return pat ? (
            <polygon
              key={m.id}
              points={pts(m.polygon)}
              fill={pat}
              opacity={mode === 'terrain' ? 1 : 0.75}
              pointerEvents="none"
            />
          ) : null;
        })}
        {/* Occupations */}
        {MAP_DATA.counties.map((m) =>
          game.counties[m.id].occupation ? (
            <polygon key={m.id} points={pts(m.polygon)} fill="url(#hatch)" pointerEvents="none" />
          ) : null,
        )}

        {/* Limites : comtés (fines), vassaux et duchés (pointillés), royaumes (épaisses) */}
        <path
          d={SHARED.filter(
            (e) =>
              rulerOf.get(e.a) === rulerOf.get(e.b) &&
              game.counties[e.a].holderId === game.counties[e.b].holderId,
          )
            .map((e) => seg(e.p, e.q))
            .join('')}
          stroke="rgba(30,20,10,0.28)"
          strokeWidth={1.5}
          fill="none"
          pointerEvents="none"
        />
        <path
          d={SHARED.filter(
            (e) =>
              rulerOf.get(e.a) === rulerOf.get(e.b) &&
              game.counties[e.a].holderId !== game.counties[e.b].holderId,
          )
            .map((e) => seg(e.p, e.q))
            .join('')}
          stroke="rgba(30,20,10,0.55)"
          strokeWidth={2.5}
          strokeDasharray="6 6"
          fill="none"
          pointerEvents="none"
        />
        <path
          d={SHARED.filter((e) => rulerOf.get(e.a) !== rulerOf.get(e.b))
            .map((e) => seg(e.p, e.q))
            .join('')}
          stroke={dark ? 'rgba(10,6,4,0.9)' : 'rgba(35,22,14,0.85)'}
          strokeWidth={6}
          strokeLinecap="round"
          fill="none"
          pointerEvents="none"
        />
        {/* Côte du royaume du joueur, liseré or */}
        <path
          d={[
            ...SHARED.filter(
              (e) => (rulerOf.get(e.a) === game.playerId) !== (rulerOf.get(e.b) === game.playerId),
            ).map((e) => seg(e.p, e.q)),
          ].join('')}
          stroke="#e0b443"
          strokeWidth={2.5}
          strokeLinecap="round"
          fill="none"
          pointerEvents="none"
        />
        <path
          d={COAST.map(([p, q]) => seg(p, q)).join('')}
          stroke="rgba(35,22,14,0.55)"
          strokeWidth={2.5}
          fill="none"
          pointerEvents="none"
        />

        {/* Rivières */}
        {MAP_DATA.rivers.map((r, i) => (
          <polyline
            key={i}
            points={pts(r.path)}
            stroke={dark ? '#4f8fc4' : '#3f7fbe'}
            strokeWidth={8}
            strokeLinecap="round"
            fill="none"
            pointerEvents="none"
          />
        ))}

        {/* Zones de toucher */}
        {MAP_DATA.counties.map((m) => (
          <polygon
            key={m.id}
            points={pts(m.polygon)}
            fill="transparent"
            stroke={selected === m.id ? 'var(--accent)' : 'none'}
            strokeWidth={selected === m.id ? 7 : 0}
            strokeLinejoin="round"
            onClick={tap(() => onSelect(m.id))}
          />
        ))}

        {/* Noms des royaumes */}
        {showRealms &&
          realmLabels.map((l) => (
            <g key={l.r} pointerEvents="none" opacity={0.92}>
              <text
                x={l.x}
                y={l.y - 8}
                className="realm-label kind"
                style={{ fontSize: 17 }}
                fill={l.r === game.playerId ? '#7a2018' : '#1e1611'}
              >
                {l.kind.toUpperCase()}
              </text>
              <text
                x={l.x}
                y={l.y + 22}
                className="realm-label"
                style={{ fontSize: l.size > 6 ? 38 : 32 }}
                fill={l.r === game.playerId ? '#7a2018' : '#1e1611'}
              >
                {l.name.toUpperCase()}
              </text>
            </g>
          ))}

        {/* Capitales et forts */}
        {MAP_DATA.counties.map((m) => {
          const c = game.counties[m.id];
          const f = fortLevel(c);
          const cap = capitals.has(m.id);
          return (
            <g key={m.id} pointerEvents="none">
              {cap && (
                <g transform={`translate(${m.x} ${m.y - 22})`}>
                  <path
                    d="M-11 8 V-4 H-7 V-8 H-3 V-4 H3 V-8 H7 V-4 H11 V8 Z"
                    fill={rulerOf.get(m.id) === game.playerId ? '#e0b443' : '#f3ecdc'}
                    stroke="#1e1611"
                    strokeWidth={2}
                    strokeLinejoin="round"
                  />
                </g>
              )}
              {f > 0 &&
                Array.from({ length: f }).map((_, i) => (
                  <rect
                    key={i}
                    x={m.x - (f * 9) / 2 + i * 9 + 1}
                    y={m.y + 10}
                    width={6}
                    height={6}
                    rx={1}
                    fill="#1e1611"
                    opacity={0.7}
                  />
                ))}
            </g>
          );
        })}

        {/* Noms des comtés */}
        {!showRealms &&
          MAP_DATA.counties.map((m) => (
            <text
              key={m.id}
              x={m.x}
              y={m.y + 4}
              className="county-label"
              style={{ fontSize: 22 * labelScale + 4 }}
            >
              {game.counties[m.id].name}
            </text>
          ))}

        {/* Trajet de l'armée du joueur */}
        {playerArmy && playerArmy.path.length > 0 && (
          <polyline
            points={[playerArmy.location, ...playerArmy.path]
              .map((id) => `${COUNTY.get(id)!.x},${COUNTY.get(id)!.y + 40}`)
              .join(' ')}
            stroke="var(--accent)"
            strokeWidth={6}
            strokeDasharray="14 10"
            strokeLinecap="round"
            fill="none"
            pointerEvents="none"
          />
        )}

        {/* Armées : écussons cliquables */}
        {[...armiesByCounty.entries()].map(([cid, ids]) => {
          const m = COUNTY.get(cid)!;
          return ids.map((id, i) => {
            const a = game.armies[id];
            const mine = a.ownerId === game.playerId;
            const hostile = atWar(game, a.ownerId, game.playerId);
            const vis = visibleMen(game, id);
            const x = m.x + (i - (ids.length - 1) / 2) * 74;
            const y = m.y + 42;
            const col = mine ? PLAYER_COLOR : (colors.get(a.ownerId) ?? '#666');
            const label = vis.exact
              ? vis.men >= 1000
                ? `${(vis.men / 1000).toFixed(1)}k`
                : String(vis.men)
              : `~${(vis.men / 1000).toFixed(1)}k`;
            return (
              <g
                key={id}
                transform={`translate(${x} ${y})`}
                onClick={tap(() => onArmy?.(id))}
                style={{ cursor: 'pointer' }}
              >
                <rect
                  x={-36}
                  y={-17}
                  width={72}
                  height={34}
                  rx={17}
                  fill={col}
                  stroke={hostile ? '#ff5a45' : '#1e1611'}
                  strokeWidth={hostile ? 4 : 2.5}
                />
                <path
                  d="M-26 -9 h12 v8 c0 5 -6 8 -6 8 c0 0 -6 -3 -6 -8 z"
                  fill="#f3ecdc"
                  stroke="#1e1611"
                  strokeWidth={1.5}
                />
                <text
                  x={8}
                  y={7}
                  fontSize="18"
                  fontWeight="700"
                  textAnchor="middle"
                  fill="#fff"
                  style={{ fontFamily: 'var(--font)' }}
                >
                  {label}
                </text>
              </g>
            );
          });
        })}
      </svg>

      <div className="map-tools">
        <button
          className="btn"
          onClick={() => setMode(mode === 'royaumes' ? 'terrain' : 'royaumes')}
        >
          {mode === 'royaumes' ? 'Relief' : 'Royaumes'}
        </button>
        <button className="btn" onClick={() => setLegend(!legend)} aria-pressed={legend}>
          Légende
        </button>
      </div>
      <div className="map-zoom">
        <button className="btn" onClick={focusPlayer} aria-label="Centrer sur mon royaume">
          ◎
        </button>
        <button className="btn" onClick={() => zoom(0.75)} aria-label="Zoomer">
          ＋
        </button>
        <button className="btn" onClick={() => zoom(1.33)} aria-label="Dézoomer">
          －
        </button>
      </div>
      {showRealms && !legend && <div className="map-hint glass">Pincez pour voir les comtés</div>}
      {legend && (
        <div className="map-legend-card glass">
          {rulers
            .sort((a, b) => (a === game.playerId ? -1 : b === game.playerId ? 1 : 0))
            .map((r) => (
              <div key={r} className="row small">
                <span className="swatch" style={{ background: colors.get(r) }} />
                <span className="grow ellipsis">
                  {realmName(game, r)}
                  {r === game.playerId ? ' (vous)' : ''}
                </span>
                <span className="muted">{realmCounties(game, r).length}</span>
              </div>
            ))}
          <div className="legend-keys small muted">
            <span>
              <i className="k-realm" /> Frontière de royaume
            </span>
            <span>
              <i className="k-vassal" /> Terre de vassal
            </span>
            <span>
              <i className="k-cap" /> Capitale · ■ fortification
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
