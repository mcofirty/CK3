import { useMemo, useRef, useState } from 'react';
import { TERRAINS } from '../../data/terrain';
import { Rng } from '../../engine/rng';
import { countyRuler, fortLevel } from '../../engine/realm';
import type { GameState } from '../../engine/state';
import { totalMen } from '../../engine/units';
import { MAP_DATA } from '../../engine/world';
import { atWar } from '../../engine/characters';

const REALM_COLORS = [
  '#c4574a',
  '#4f7fb5',
  '#5d9a55',
  '#a467b0',
  '#d39a3a',
  '#4aa6a0',
  '#b86b8f',
  '#8d8d4a',
];

export function realmColor(game: GameState, rulerId: string): string {
  const c = game.characters[rulerId];
  const dyn = c?.dynastyId ? game.dynasties[c.dynastyId] : undefined;
  if (rulerId === game.playerId) return '#c9a227';
  return REALM_COLORS[new Rng(dyn?.seed ?? 7).int(0, REALM_COLORS.length - 1)];
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

/** Cadre des terres (hors mer), avec une marge. */
const LAND = (() => {
  const xs = MAP_DATA.counties.flatMap((c) => c.polygon.map((p) => p[0]));
  const ys = MAP_DATA.counties.flatMap((c) => c.polygon.map((p) => p[1]));
  const m = 30;
  return {
    x: Math.min(...xs) - m,
    y: Math.min(...ys) - m,
    w: Math.max(...xs) - Math.min(...xs) + 2 * m,
    h: Math.max(...ys) - Math.min(...ys) + 2 * m,
  };
})();

export function MapView({
  game,
  selected,
  onSelect,
}: {
  game: GameState;
  selected?: string;
  onSelect: (id: string) => void;
}) {
  const [mode, setMode] = useState<'royaumes' | 'terrain'>('royaumes');
  const [vb, setVb] = useState(LAND);
  const svgRef = useRef<SVGSVGElement>(null);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const moved = useRef(0);
  const dark =
    typeof matchMedia !== 'undefined' && matchMedia('(prefers-color-scheme: dark)').matches;

  const toSvg = (dx: number, dy: number) => {
    const r = svgRef.current!.getBoundingClientRect();
    const s = Math.max(vb.w / r.width, vb.h / r.height);
    return { dx: dx * s, dy: dy * s, s };
  };
  const clampVb = (v: typeof vb) => {
    const w = Math.max(220, Math.min(LAND.w * 1.3, v.w));
    const h = (w * v.h) / v.w;
    return {
      w,
      h,
      x: Math.max(-200, Math.min(MAP_DATA.width - w + 200, v.x)),
      y: Math.max(-200, Math.min(MAP_DATA.height - h + 200, v.y)),
    };
  };
  const onDown = (e: React.PointerEvent) => {
    (e.target as Element).setPointerCapture?.(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size === 1) moved.current = 0;
  };
  const onMove = (e: React.PointerEvent) => {
    const prev = pointers.current.get(e.pointerId);
    if (!prev) return;
    const pts = [...pointers.current.entries()];
    if (pts.length === 1) {
      const { dx, dy } = toSvg(e.clientX - prev.x, e.clientY - prev.y);
      moved.current += Math.abs(e.clientX - prev.x) + Math.abs(e.clientY - prev.y);
      setVb((v) => clampVb({ ...v, x: v.x - dx, y: v.y - dy }));
    } else if (pts.length === 2) {
      const other = pts.find(([id]) => id !== e.pointerId)![1];
      const d0 = Math.hypot(prev.x - other.x, prev.y - other.y);
      const d1 = Math.hypot(e.clientX - other.x, e.clientY - other.y);
      if (d0 > 0) {
        const f = d0 / d1;
        const r = svgRef.current!.getBoundingClientRect();
        const mx = (other.x + e.clientX) / 2 - r.left;
        const my = (other.y + e.clientY) / 2 - r.top;
        setVb((v) => {
          const s = Math.max(v.w / r.width, v.h / r.height);
          const cx = v.x + mx * s;
          const cy = v.y + my * s;
          const w = v.w * f;
          const h = v.h * f;
          return clampVb({ x: cx - (cx - v.x) * f, y: cy - (cy - v.y) * f, w, h });
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

  const armiesByCounty = useMemo(() => {
    const m = new Map<string, string[]>();
    for (const a of Object.values(game.armies))
      m.set(a.location, [...(m.get(a.location) ?? []), a.id]);
    return m;
  }, [game.armies]);
  const playerArmy = Object.values(game.armies).find((a) => a.ownerId === game.playerId);
  const center = (id: string) => MAP_DATA.counties.find((c) => c.id === id)!;

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
        <rect
          x={-500}
          y={-500}
          width={MAP_DATA.width + 1000}
          height={MAP_DATA.height + 1000}
          fill="var(--sea)"
        />
        {MAP_DATA.counties.map((m) => {
          const c = game.counties[m.id];
          const ruler = countyRuler(game, c);
          const fill =
            mode === 'terrain'
              ? dark
                ? TERRAINS[c.terrain].colorDark
                : TERRAINS[c.terrain].color
              : realmColor(game, ruler);
          return (
            <polygon
              key={m.id}
              className={`county${selected === m.id ? ' sel' : ''}`}
              points={m.polygon.map((p) => p.join(',')).join(' ')}
              fill={fill}
              fillOpacity={mode === 'royaumes' ? (c.holderId === ruler ? 0.9 : 0.62) : 1}
              onClick={() => moved.current < 10 && onSelect(m.id)}
            />
          );
        })}
        {MAP_DATA.rivers.map((r, i) => (
          <polyline
            key={i}
            points={r.path.map((p) => p.join(',')).join(' ')}
            stroke="#3b78c2"
            strokeWidth={9}
            strokeLinecap="round"
            fill="none"
            pointerEvents="none"
          />
        ))}
        {/* Occupations et sièges */}
        {Object.values(game.counties).map((c) => {
          const m = center(c.id);
          return (
            <g key={c.id} pointerEvents="none">
              {c.occupation && (
                <polygon points={m.polygon.map((p) => p.join(',')).join(' ')} fill="url(#hatch)" />
              )}
              {fortLevel(c) > 0 && (
                <text x={m.x} y={m.y - 28} fontSize="20" textAnchor="middle">
                  {'▲'.repeat(fortLevel(c))}
                </text>
              )}
            </g>
          );
        })}
        <defs>
          <pattern
            id="hatch"
            width="16"
            height="16"
            patternUnits="userSpaceOnUse"
            patternTransform="rotate(45)"
          >
            <rect width="7" height="16" fill="rgba(140,20,20,0.45)" />
          </pattern>
        </defs>
        {MAP_DATA.counties.map((m) => (
          <text key={m.id} x={m.x} y={m.y} className="county-label">
            {game.counties[m.id].name}
          </text>
        ))}
        {/* Trajet de l'armée du joueur */}
        {playerArmy && playerArmy.path.length > 0 && (
          <polyline
            points={[playerArmy.location, ...playerArmy.path]
              .map((id) => `${center(id).x},${center(id).y + 30}`)
              .join(' ')}
            stroke="var(--accent)"
            strokeWidth={6}
            strokeDasharray="14 10"
            fill="none"
            pointerEvents="none"
          />
        )}
        {[...armiesByCounty.entries()].map(([cid, ids]) => {
          const m = center(cid);
          return ids.map((id, i) => {
            const a = game.armies[id];
            const mine = a.ownerId === game.playerId;
            const hostile = atWar(game, a.ownerId, game.playerId);
            const vis = visibleMen(game, id);
            const x = m.x + (i - (ids.length - 1) / 2) * 70;
            const y = m.y + 34;
            return (
              <g key={id} pointerEvents="none">
                <rect
                  x={x - 32}
                  y={y - 16}
                  width={64}
                  height={30}
                  rx={8}
                  fill={mine ? '#c9a227' : hostile ? '#8a2f24' : realmColor(game, a.ownerId)}
                  stroke="#1c1813"
                  strokeWidth={2}
                />
                <text
                  x={x}
                  y={y + 6}
                  fontSize="18"
                  fontWeight="700"
                  textAnchor="middle"
                  fill={mine ? '#1c1813' : '#fff'}
                >
                  {vis.exact
                    ? vis.men >= 1000
                      ? `${(vis.men / 1000).toFixed(1)}k`
                      : vis.men
                    : `~${(vis.men / 1000).toFixed(1)}k`}
                </text>
              </g>
            );
          });
        })}
      </svg>
      <div className="map-legend">
        <button
          className="btn"
          onClick={() => setMode(mode === 'royaumes' ? 'terrain' : 'royaumes')}
        >
          {mode === 'royaumes' ? 'Terrain' : 'Royaumes'}
        </button>
        <button className="btn" onClick={() => zoom(0.75)}>
          ＋
        </button>
        <button className="btn" onClick={() => zoom(1.33)}>
          －
        </button>
      </div>
    </div>
  );
}
