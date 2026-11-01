import { useMemo, useRef, useState } from 'react';
import { atWar } from '../../engine/characters';
import { contentmentOf } from '../../engine/economy/local';
import {
  capitalOf,
  countyRuler,
  fortLevel,
  independentRulers,
  realmCounties,
  realmName,
} from '../../engine/realm';
import type { GameState } from '../../engine/state';
import { totalMen } from '../../engine/units';
import type { MapData } from '../../engine/mapgen';
import { MapSymbols, decorFor } from './MapArt';
import { houseColorOf } from '../../engine/heraldry';

// ---------------------------------------------------------------------------
// Couleurs des royaumes : celle de la maison du souverain (blason, fond des portraits)
// ---------------------------------------------------------------------------

const NO_HOUSE = '#8c8c8c';

/** Couleur de la maison d'un personnage (gris s'il n'en a pas). */
export function characterColor(game: GameState, id: string): string {
  const dyn = game.characters[id]?.dynastyId;
  const d = dyn ? game.dynasties[dyn] : undefined;
  return d ? houseColorOf(d) : NO_HOUSE;
}

/** Couleur du domaine du joueur. */
export const playerColor = (game: GameState): string => characterColor(game, game.playerId);

/** Chaque souverain indépendant prend la couleur de sa maison, unique par maison. */
export function realmColors(game: GameState): Map<string, string> {
  const res = new Map<string, string>();
  for (const r of independentRulers(game)) res.set(r, characterColor(game, r));
  return res;
}

export function realmColor(game: GameState, rulerId: string): string {
  return characterColor(game, rulerId);
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
  const [mode, setMode] = useState<'royaumes' | 'terrain' | 'peuple'>('royaumes');
  const [legend, setLegend] = useState(false);
  const [hint, setHint] = useState<string | null>(null);
  const decor = decorFor(MAP_DATA);
  const [vb, setVb] = useState(LAND);
  const svgRef = useRef<SVGSVGElement>(null);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const moved = useRef(0);

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
  const WORLD = { x: -220, y: -220, w: MAP_DATA.width + 440, h: MAP_DATA.height + 440 };
  const clampVb = (v: typeof vb) => {
    const w = Math.max(200, Math.min(WORLD.w * 1.1, v.w));
    const h = (w * v.h) / v.w;
    return {
      w,
      h,
      x: Math.max(WORLD.x - w * 0.3, Math.min(WORLD.x + WORLD.w - w * 0.7, v.x)),
      y: Math.max(WORLD.y - h * 0.3, Math.min(WORLD.y + WORLD.h - h * 0.7, v.y)),
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
  const k = vb.w / LAND.w;
  const labelScale = Math.max(0.6, Math.min(1.05, k));
  const showRealms = mode === 'royaumes' && k > 0.72;
  const coastD = COAST.map(([p, q]) => seg(p, q)).join('');
  const foreignCoastD = decor.foreign.flatMap((f) => f.coast.map(([p, q]) => seg(p, q))).join('');
  const allCoast = coastD + foreignCoastD;
  const realmEdges = (r: string) =>
    [...SHARED.filter((e) => (rulerOf.get(e.a) === r) !== (rulerOf.get(e.b) === r))]
      .map((e) => seg(e.p, e.q))
      .join('') +
    COAST.filter(([p]) => {
      const owner = MAP_DATA.counties.find((c) =>
        c.polygon.some((v) => Math.abs(v[0] - p[0]) < 1 && Math.abs(v[1] - p[1]) < 1),
      );
      return owner && rulerOf.get(owner.id) === r;
    })
      .map(([p, q]) => seg(p, q))
      .join('');
  const flash = (t: string) => {
    setHint(t);
    setTimeout(() => setHint(null), 2200);
  };

  return (
    <div className="map-wrap illustrated">
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
          <MapSymbols />
          <radialGradient id="sea-grad" cx="50%" cy="48%" r="75%">
            <stop offset="0%" stopColor="#a8c6d4" />
            <stop offset="100%" stopColor="#6f97ae" />
          </radialGradient>
          <pattern id="pat-herbe" width="60" height="44" patternUnits="userSpaceOnUse">
            <g stroke="rgba(70,95,35,0.32)" strokeWidth="1.1" strokeLinecap="round">
              <path d="M8 12 l2 -5 M11 12 l1 -6 M14 12 l-1 -5" />
              <path d="M40 34 l2 -5 M43 34 l1 -6 M46 34 l-1 -5" />
            </g>
            <circle cx="30" cy="8" r="1.2" fill="rgba(255,250,220,0.35)" />
            <circle cx="50" cy="20" r="9" fill="rgba(255,250,220,0.07)" />
          </pattern>
          <pattern id="pat-papier" width="120" height="120" patternUnits="userSpaceOnUse">
            <circle cx="20" cy="30" r="22" fill="rgba(255,255,230,0.06)" />
            <circle cx="90" cy="80" r="30" fill="rgba(90,70,30,0.05)" />
          </pattern>
          <pattern
            id="pat-brume"
            width="14"
            height="14"
            patternUnits="userSpaceOnUse"
            patternTransform="rotate(35)"
          >
            <rect width="14" height="14" fill="rgba(240,232,210,0.38)" />
            <path d="M0 0 V14" stroke="rgba(70,50,30,0.32)" strokeWidth="1.4" />
          </pattern>
          <pattern
            id="hatch"
            width="16"
            height="16"
            patternUnits="userSpaceOnUse"
            patternTransform="rotate(45)"
          >
            <rect width="6" height="16" fill="rgba(150,20,20,0.45)" />
          </pattern>
          {rulers.map((r) => (
            <clipPath id={`clip-${r}`} key={r}>
              {realmCounties(game, r).map((c) => (
                <polygon key={c.id} points={pts(COUNTY.get(c.id)!.polygon)} />
              ))}
            </clipPath>
          ))}
        </defs>

        {/* Mer */}
        <rect
          x={-3000}
          y={-3000}
          width={MAP_DATA.width + 6000}
          height={MAP_DATA.height + 6000}
          fill="url(#sea-grad)"
        />
        {decor.waves.map((w, i) => (
          <path
            key={i}
            d={`M${w[0] - 12} ${w[1]} q6 -4 12 0 t12 0`}
            stroke="rgba(235,245,248,0.55)"
            strokeWidth={1.6}
            fill="none"
            pointerEvents="none"
          />
        ))}
        {/* Lignes de rivage (contours dans l'eau) */}
        <g fill="none" strokeLinecap="round" strokeLinejoin="round" pointerEvents="none">
          <path d={allCoast} stroke="rgba(200,224,232,0.55)" strokeWidth={64} />
          <path d={allCoast} stroke="#93b8c9" strokeWidth={56} opacity={0.9} />
          <path d={allCoast} stroke="rgba(214,234,240,0.7)" strokeWidth={38} />
          <path d={allCoast} stroke="#9fc2d1" strokeWidth={31} />
          <path d={allCoast} stroke="#e7d7a6" strokeWidth={14} />
        </g>

        {/* Terres lointaines */}
        {decor.foreign.map((f, i) => (
          <g
            key={i}
            onClick={tap(() => flash(`${f.name} : contrées lointaines, hors de votre portée.`))}
          >
            {f.cells.map((cell, j) => (
              <polygon key={j} points={pts(cell)} fill="#b9b98a" stroke="#b9b98a" strokeWidth={1} />
            ))}
          </g>
        ))}

        {/* Comtés : couleur de terrain */}
        {MAP_DATA.counties.map((m) => (
          <polygon
            key={m.id}
            points={pts(m.polygon)}
            fill={TERRAIN_FILL[game.counties[m.id].terrain]}
            stroke={TERRAIN_FILL[game.counties[m.id].terrain]}
            strokeWidth={1}
            pointerEvents="none"
          />
        ))}
        {[...MAP_DATA.counties.map((m) => m.polygon), ...decor.foreign.flatMap((f) => f.cells)].map(
          (poly, i) => (
            <polygon key={i} points={pts(poly)} fill="url(#pat-herbe)" pointerEvents="none" />
          ),
        )}

        {/* Couche « Peuple » : contentement des comtés du royaume */}
        {mode === 'peuple' &&
          MAP_DATA.counties.map((m) => {
            const c = game.counties[m.id];
            const mineRealm = rulerOf.get(m.id) === game.playerId;
            const v = contentmentOf(c);
            const hue = Math.round((v / 100) * 120);
            return (
              <polygon
                key={`p-${m.id}`}
                points={pts(m.polygon)}
                fill={mineRealm ? `hsl(${hue} 70% 45%)` : '#6b5a45'}
                opacity={mineRealm ? 0.5 : 0.18}
                className="realm-tint"
                pointerEvents="none"
              />
            );
          })}
        {/* Teinte et liseré des royaumes */}
        {mode === 'royaumes' &&
          MAP_DATA.counties.map((m) => {
            const c = game.counties[m.id];
            const r = rulerOf.get(m.id)!;
            return (
              <polygon
                key={m.id}
                points={pts(m.polygon)}
                fill={colors.get(r) ?? '#888'}
                opacity={c.holderId === r ? 0.3 : 0.18}
                className="realm-tint"
                pointerEvents="none"
              />
            );
          })}
        {rulers.map((r) => (
          <path
            key={r}
            d={realmEdges(r)}
            clipPath={`url(#clip-${r})`}
            stroke={colors.get(r)}
            strokeWidth={mode === 'royaumes' ? 22 : 10}
            strokeLinejoin="round"
            fill="none"
            opacity={mode === 'royaumes' ? 0.55 : 0.35}
            pointerEvents="none"
          />
        ))}
        {MAP_DATA.counties.map((m) =>
          game.counties[m.id].occupation ? (
            <polygon key={m.id} points={pts(m.polygon)} fill="url(#hatch)" pointerEvents="none" />
          ) : null,
        )}

        {/* Chemins */}
        <g fill="none" strokeLinecap="round" pointerEvents="none">
          {decor.roads.map((r, i) => (
            <path
              key={`o${i}`}
              d={`M${r.a[0]} ${r.a[1]} Q${r.c[0]} ${r.c[1]} ${r.b[0]} ${r.b[1]}`}
              stroke="#8d7650"
              strokeWidth={6.5}
              opacity={0.55}
            />
          ))}
          {decor.roads.map((r, i) => (
            <path
              key={`i${i}`}
              d={`M${r.a[0]} ${r.a[1]} Q${r.c[0]} ${r.c[1]} ${r.b[0]} ${r.b[1]}`}
              stroke="#e1d0a4"
              strokeWidth={4}
              strokeDasharray="9 4"
            />
          ))}
        </g>

        {/* Rivières */}
        {MAP_DATA.rivers.map((r, i) => (
          <g key={i} pointerEvents="none">
            <polyline
              points={pts(r.path)}
              stroke="#3f6f93"
              strokeWidth={9}
              strokeLinecap="round"
              fill="none"
            />
            <polyline
              points={pts(r.path)}
              stroke="#7fb1cf"
              strokeWidth={5}
              strokeLinecap="round"
              fill="none"
            />
          </g>
        ))}

        {/* Limites : vassaux (pointillés), royaumes (encre) */}
        <path
          d={SHARED.filter(
            (e) =>
              rulerOf.get(e.a) === rulerOf.get(e.b) &&
              game.counties[e.a].holderId !== game.counties[e.b].holderId,
          )
            .map((e) => seg(e.p, e.q))
            .join('')}
          stroke="rgba(59,42,26,0.6)"
          strokeWidth={2}
          strokeDasharray="4 5"
          fill="none"
          pointerEvents="none"
        />
        <path
          d={SHARED.filter(
            (e) =>
              rulerOf.get(e.a) === rulerOf.get(e.b) &&
              game.counties[e.a].holderId === game.counties[e.b].holderId,
          )
            .map((e) => seg(e.p, e.q))
            .join('')}
          stroke="rgba(59,42,26,0.22)"
          strokeWidth={1.4}
          fill="none"
          pointerEvents="none"
        />
        <path
          d={SHARED.filter((e) => rulerOf.get(e.a) !== rulerOf.get(e.b))
            .map((e) => seg(e.p, e.q))
            .join('')}
          stroke="#3b2a1a"
          strokeWidth={4}
          strokeDasharray="14 5 3 5"
          strokeLinecap="round"
          fill="none"
          pointerEvents="none"
        />
        {/* Côtes à l'encre */}
        <path
          d={allCoast}
          stroke="#3b2a1a"
          strokeWidth={3.2}
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
          pointerEvents="none"
        />

        {/* Décor : reliefs, forêts, champs */}
        {[...decor.icons, ...decor.foreignIcons].map((ic, i) => (
          <use
            key={i}
            href={`#${ic.sym}`}
            transform={`translate(${ic.x} ${ic.y}) scale(${ic.s})`}
            pointerEvents="none"
          />
        ))}

        {/* Brume sur les terres lointaines */}
        {decor.foreign.map((f, i) => (
          <g key={i} pointerEvents="none">
            {f.cells.map((cell, j) => (
              <polygon key={j} points={pts(cell)} fill="url(#pat-brume)" />
            ))}
          </g>
        ))}

        {/* Villages et châteaux */}
        {MAP_DATA.counties.map((m) => {
          const c = game.counties[m.id];
          const t = decor.towns[m.id];
          const cap = capitals.has(m.id);
          const f = fortLevel(c);
          return (
            <g key={m.id} pointerEvents="none">
              <use
                href={cap ? '#s-castle' : '#s-town'}
                transform={`translate(${t[0]} ${t[1]}) scale(${cap ? 0.95 : 0.9})`}
                style={{ color: colors.get(rulerOf.get(m.id)!) }}
              />
              {f > 0 &&
                Array.from({ length: f }).map((_, i) => (
                  <rect
                    key={i}
                    x={t[0] - (f * 8) / 2 + i * 8 + 1}
                    y={t[1] + 5}
                    width={5}
                    height={5}
                    fill="#3b2a1a"
                    opacity={0.75}
                  />
                ))}
            </g>
          );
        })}

        {/* Zones de toucher et sélection */}
        {MAP_DATA.counties.map((m) => (
          <polygon
            key={m.id}
            points={pts(m.polygon)}
            fill={selected === m.id ? 'rgba(255,245,210,0.18)' : 'transparent'}
            stroke={selected === m.id ? '#8a2f24' : 'none'}
            strokeWidth={selected === m.id ? 6 : 0}
            strokeLinejoin="round"
            onClick={tap(() => onSelect(m.id))}
          />
        ))}

        {/* Noms */}
        {decor.foreign.map((f, i) => (
          <text
            key={i}
            x={f.label[0]}
            y={f.label[1]}
            className="map-font foreign-label"
            fontSize={30}
            pointerEvents="none"
          >
            {f.name}
            <tspan x={f.label[0]} dy={26} fontSize={18}>
              {f.kind === 'royaume' ? '— royaume étranger —' : '— terres inexplorées —'}
            </tspan>
          </text>
        ))}
        {showRealms &&
          realmLabels.map((l) => (
            <g key={l.r} pointerEvents="none">
              <text x={l.x} y={l.y - 6} className="map-font-sc realm-label-ill kind" fontSize={18}>
                {l.kind}
              </text>
              <text
                x={l.x}
                y={l.y + 26}
                className="map-font-sc realm-label-ill"
                fontSize={l.size > 6 ? 42 : 36}
                fill={l.r === game.playerId ? '#6e1e15' : '#2f2114'}
              >
                {l.name}
              </text>
            </g>
          ))}
        {!showRealms &&
          MAP_DATA.counties.map((m) => (
            <text
              key={m.id}
              x={m.x}
              y={m.y + 8}
              className="map-font county-label-ill"
              fontSize={24 * labelScale + 3}
              pointerEvents="none"
            >
              {game.counties[m.id].name}
            </text>
          ))}

        {/* Rose des vents, cartouche, navires */}
        {decor.ships.map((p, i) => (
          <use
            key={i}
            href="#s-ship"
            transform={`translate(${p[0]} ${p[1]}) scale(${i ? -1.1 : 1.2} 1.2)`}
            pointerEvents="none"
          />
        ))}
        {decor.compass && (
          <use
            href="#s-compass"
            transform={`translate(${decor.compass[0]} ${decor.compass[1]}) scale(1.1)`}
            pointerEvents="none"
          />
        )}
        {decor.cartouche && (
          <g
            transform={`translate(${decor.cartouche[0]} ${decor.cartouche[1]})`}
            pointerEvents="none"
          >
            <path
              d="M-150 -26 H150 L165 -8 L150 12 H-150 L-165 -8 Z"
              fill="#e9d9b0"
              stroke="#3b2a1a"
              strokeWidth={2.4}
            />
            <path
              d="M-150 -26 L-176 -34 L-166 -8 L-176 18 L-150 12 Z M150 -26 L176 -34 L166 -8 L176 18 L150 12 Z"
              fill="#d2bd8c"
              stroke="#3b2a1a"
              strokeWidth={2.2}
              strokeLinejoin="round"
            />
            <text x={0} y={2} className="map-font" fontSize={30} textAnchor="middle" fill="#3b2a1a">
              Marches d’Aveline
            </text>
          </g>
        )}

        {/* Trajet de l'armée du joueur */}
        {playerArmy && playerArmy.path.length > 0 && (
          <polyline
            points={[playerArmy.location, ...playerArmy.path]
              .map((id) => `${COUNTY.get(id)!.x},${COUNTY.get(id)!.y + 44}`)
              .join(' ')}
            stroke="#8a2f24"
            strokeWidth={5}
            strokeDasharray="2 10"
            strokeLinecap="round"
            fill="none"
            pointerEvents="none"
          />
        )}

        {/* Armées : jetons cliquables */}
        {/* Sièges en feu, épidémies */}
        {MAP_DATA.counties.map((m) => {
          const c = game.counties[m.id];
          if (!c.siege && !c.plague) return null;
          return (
            <g key={`fx-${m.id}`} pointerEvents="none">
              {c.siege && (
                <text x={m.x + 34} y={m.y - 30} fontSize={34} className="map-fire">
                  🔥
                </text>
              )}
              {c.plague && (
                <text x={m.x - 40} y={m.y - 30} fontSize={30} className="map-plague">
                  ☠️
                </text>
              )}
            </g>
          );
        })}
        {[...armiesByCounty.entries()].flatMap(([cid, ids]) => {
          const m = COUNTY.get(cid)!;
          return ids.map((id, i) => {
            const a = game.armies[id];
            const mine = a.ownerId === game.playerId;
            const hostile = atWar(game, a.ownerId, game.playerId);
            const vis = visibleMen(game, id);
            const x = m.x + (i - (ids.length - 1) / 2) * 76;
            const y = m.y + 44;
            const col = colors.get(a.ownerId) ?? characterColor(game, a.ownerId);
            const label = vis.exact
              ? vis.men >= 1000
                ? `${(vis.men / 1000).toFixed(1)}k`
                : String(vis.men)
              : `~${(vis.men / 1000).toFixed(1)}k`;
            return (
              <g
                key={id}
                className="army-token"
                onClick={tap(() => onArmy?.(id))}
                style={{ cursor: 'pointer', transform: `translate(${x}px, ${y}px)` }}
              >
                <rect
                  x={-34}
                  y={-15}
                  width={70}
                  height={30}
                  rx={8}
                  fill="#f1e4c3"
                  stroke={hostile ? '#a3261c' : mine ? '#b8860b' : '#3b2a1a'}
                  strokeWidth={hostile || mine ? 3.5 : 2}
                />
                <path
                  d="M-28 -10 h16 v9 c0 6 -8 9 -8 9 c0 0 -8 -3 -8 -9 z"
                  fill={col}
                  stroke="#3b2a1a"
                  strokeWidth={1.5}
                />
                <text
                  x={12}
                  y={6}
                  fontSize="17"
                  fontWeight="700"
                  textAnchor="middle"
                  fill="#3b2a1a"
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
        <button
          className="btn"
          aria-pressed={mode === 'peuple'}
          onClick={() => setMode(mode === 'peuple' ? 'royaumes' : 'peuple')}
        >
          Peuple
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
      {hint && <div className="map-hint glass">{hint}</div>}
      {!hint && mode === 'peuple' && (
        <div className="map-hint glass">Contentement : 🔴 colère · 🟡 calme · 🟢 prospérité</div>
      )}
      {!hint && showRealms && !legend && (
        <div className="map-hint glass">Pincez pour voir les comtés</div>
      )}
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
              <i className="k-cap" /> Château : capitale · ■ fortification
            </span>
            <span>
              <i className="k-fog" /> Terres lointaines (hors de portée)
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

/** Couleurs de terrain façon carte peinte. */
const TERRAIN_FILL: Record<string, string> = {
  plaine: '#b9c77f',
  colline: '#aebc72',
  foret: '#97b066',
  marais: '#a3b38b',
  montagne: '#bdb48f',
};
