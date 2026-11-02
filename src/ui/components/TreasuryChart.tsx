/** Courbe du trésor : l'or au début de chaque saison sur les cinq dernières années. */
import { useRef, useState } from 'react';
import { SEASON_NAMES } from '../../data/names';
import { yearOf } from '../../engine/context';
import type { GameState } from '../../engine/state';
import { signed } from './common';

const W = 320;
const H = 120;
const PAD = { l: 8, r: 12, t: 14, b: 20 };

export function TreasuryChart({ game }: { game: GameState }) {
  const h = game.treasuryHistory ?? [];
  const [hover, setHover] = useState<number | null>(null);
  const ref = useRef<SVGSVGElement>(null);
  if (h.length < 2)
    return (
      <p className="small muted" style={{ margin: '8px 0 0' }}>
        La courbe du trésor se dessine au fil des saisons.
      </p>
    );
  const golds = h.map((p) => p.gold);
  const lo = Math.min(0, ...golds);
  const hi = Math.max(10, ...golds);
  const x = (i: number) => PAD.l + (i * (W - PAD.l - PAD.r)) / (h.length - 1);
  const y = (v: number) => PAD.t + ((hi - v) * (H - PAD.t - PAD.b)) / (hi - lo || 1);
  const line = h
    .map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)} ${y(p.gold).toFixed(1)}`)
    .join('');
  const area = `${line}L${x(h.length - 1).toFixed(1)} ${y(lo)}L${x(0).toFixed(1)} ${y(lo)}Z`;
  const label = (turn: number) => `${SEASON_NAMES[turn % 4]} ${yearOf(game, turn)}`;
  const first = h[0];
  const last = h[h.length - 1];
  const change = last.gold - first.gold;
  const pick = (clientX: number) => {
    const r = ref.current?.getBoundingClientRect();
    if (!r) return;
    const px = ((clientX - r.left) / r.width) * W;
    const i = Math.round(((px - PAD.l) / (W - PAD.l - PAD.r)) * (h.length - 1));
    setHover(Math.max(0, Math.min(h.length - 1, i)));
  };
  const sel = hover !== null ? h[hover] : undefined;
  return (
    <div className="treasury-chart">
      <div className="row small" style={{ margin: '10px 0 2px' }}>
        <span className="grow muted">Or au début de chaque saison</span>
        <b className={change >= 0 ? 'good' : 'bad'}>
          {signed(change)} or en {Math.round(h.length / 4) || 1} an{h.length >= 8 ? 's' : ''}
        </b>
      </div>
      <div className="treasury-tip small" aria-live="polite">
        {sel ? (
          <>
            <b>{label(sel.turn)}</b> : {sel.gold} or · {signed(sel.net)} par saison
          </>
        ) : (
          <span className="muted">Touchez la courbe pour lire une saison.</span>
        )}
      </div>
      <svg
        ref={ref}
        viewBox={`0 0 ${W} ${H}`}
        width="100%"
        role="img"
        aria-label={`Trésor : de ${first.gold} or (${label(first.turn)}) à ${last.gold} or (${label(last.turn)}).`}
        data-noswipe
        onPointerDown={(e) => pick(e.clientX)}
        onPointerMove={(e) => pick(e.clientX)}
        onPointerLeave={() => setHover(null)}
      >
        <line className="tc-grid" x1={PAD.l} x2={W - PAD.r} y1={y(hi)} y2={y(hi)} />
        <line className="tc-base" x1={PAD.l} x2={W - PAD.r} y1={y(0)} y2={y(0)} />
        <text className="tc-label" x={W - PAD.r} y={y(hi) - 4} textAnchor="end">
          {Math.round(hi)}
        </text>
        {lo < 0 && (
          <text className="tc-label" x={W - PAD.r} y={y(lo) + 12} textAnchor="end">
            {Math.round(lo)}
          </text>
        )}
        <path className="tc-area" d={area} />
        <path className="tc-line" d={line} />
        {sel && hover !== null && (
          <line className="tc-cross" x1={x(hover)} x2={x(hover)} y1={PAD.t} y2={H - PAD.b} />
        )}
        <circle className="tc-end" cx={x(h.length - 1)} cy={y(last.gold)} r={4.5} />
        {sel && hover !== null && (
          <circle className="tc-dot" cx={x(hover)} cy={y(sel.gold)} r={4.5} />
        )}
        <text className="tc-label" x={PAD.l} y={H - 4}>
          {yearOf(game, first.turn)}
        </text>
        <text className="tc-label" x={W - PAD.r} y={H - 4} textAnchor="end">
          {yearOf(game, last.turn)}
        </text>
      </svg>
      <details className="tc-table small">
        <summary>Voir en tableau</summary>
        <table>
          <thead>
            <tr>
              <th>Saison</th>
              <th>Or</th>
              <th>Net</th>
            </tr>
          </thead>
          <tbody>
            {[...h].reverse().map((p) => (
              <tr key={p.turn}>
                <td>{label(p.turn)}</td>
                <td>{p.gold}</td>
                <td>{signed(p.net)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </div>
  );
}
