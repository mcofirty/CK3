import { useEffect, useState } from 'react';
import { TERRAINS } from '../../data/terrain';
import { TRAITS } from '../../data/traits';
import { UNIT_TYPES, UNITS } from '../../data/units';
import { SEASON_NAMES } from '../../data/names';
import { TACTICS, type TacticId } from '../../data/tactics';
import {
  duelPower,
  flankTargets,
  frontCommander,
  hasAbility,
  isActive,
  other,
  sideMen,
  suggestedOrders,
  validOrders,
} from '../../engine/battle/engine';
import {
  FRONTS,
  FRONT_LABELS,
  ORDER_LABELS,
  PRESET_LABELS,
  type BattleSide,
  type BattleState,
  type FrontId,
  type Order,
  type Preset,
  type SideOrders,
  WEATHER_ICONS,
  WEATHER_LABELS,
} from '../../engine/battle/types';
import type { GameState, UnitType } from '../../engine/state';
import { totalMen } from '../../engine/units';
import { Bar, Segmented } from '../components/common';
import { useStore } from '../store';

const ORDER_HELP: Record<Order, string> = {
  charger: 'Attaque ×1,3 (cavalerie ×1,5), défense ×0,85.',
  tenir: 'Défense ×1,4, attaque ×0,7, pertes de moral ×0,75.',
  tirer: 'Seuls les archers tirent (×1,2). 3 volées par bataille.',
  feindre:
    'Si l’ennemi charge : pertes ×1,5 et −20 moral pour lui. Exige 40 % de cavalerie et Guerre ≥ 12.',
  replier: 'Le front rejoint la réserve (−10 moral). Le front adverse devient libre.',
  flanc: 'Front libre : attaque un front voisin, ×1,5 et −10 moral.',
};

export function BattleScreen({ game }: { game: GameState }) {
  const b = game.battle!;
  const dispatch = useStore((s) => s.dispatch);
  const me = b.playerSide ?? 'attacker';
  const mine = b[me];
  const enemy = b[other(me)];
  const [orders, setOrders] = useState<SideOrders>(() => suggestedOrders(b, me));
  const [reserveTo, setReserveTo] = useState<FrontId | null>(null);
  const [rally, setRally] = useState<FrontId | null>(null);
  useEffect(() => {
    setOrders(suggestedOrders(b, me));
    setReserveTo(null);
    setRally(null);
    // Nouveaux ordres proposés à chaque round.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [b.round, b.phase]);

  const terrain = TERRAINS[b.terrain].label;
  const canRally = !mine.rallyUsed && mine.commanders.some((c) => hasAbility(c, 'inspirant'));
  const lastLog = b.log[b.log.length - 1];
  const showEnemyFronts = b.round > 0 || mine.recon >= 2;

  const launch = () => {
    const o: SideOrders = { ...orders, reserve: {}, rally: rally ?? undefined };
    if (reserveTo) o.reserve = { [reserveTo]: { ...mine.reserve } };
    dispatch({ type: 'battleRound', orders: o });
  };

  return (
    <div className="battle">
      <div className="battle-head glass">
        <div className="row">
          <h3 style={{ margin: 0 }} className="grow">
            Bataille de {b.countyName}
          </h3>
          <span className="small muted">
            {b.phase === 'deploiement'
              ? 'Déploiement'
              : b.phase === 'fin'
                ? 'Terminée'
                : `Round ${b.round} / ${b.maxRounds}`}
          </span>
        </div>
        <div className="small muted">
          {terrain} · {SEASON_NAMES[b.season]} · {WEATHER_ICONS[b.weather ?? 'clair']}{' '}
          {WEATHER_LABELS[b.weather ?? 'clair']}
          {b.river ? ' · rivière franchie' : ''}
          {' · '}vous {me === 'attacker' ? 'attaquez' : 'défendez'} · reconnaissance {mine.recon}
        </div>
      </div>

      <div className="battle-body">
        {b.duel?.status === 'propose' && b.duel.challenger !== me && <DuelPrompt b={b} />}
        {b.duel?.text && b.duel.status !== 'propose' && (
          <div className="duel-banner glass small">🤺 {b.duel.text}</div>
        )}
        <SideHeader side={enemy} recon={mine.recon} estimate={b.estimate} enemy />
        <div className="fronts">
          {FRONTS.map((f) => (
            <FrontCard
              key={f}
              b={b}
              side={enemy}
              f={f}
              hidden={!showEnemyFronts}
              revealed={b.revealedOrders?.[f]}
            />
          ))}
        </div>
        <div className="vs">⚔</div>
        <div className="fronts">
          {FRONTS.map((f) => (
            <FrontCard key={f} b={b} side={mine} f={f} />
          ))}
        </div>
        <SideHeader side={mine} recon={2} estimate={0} />

        {b.phase === 'deploiement' && <Deployment b={b} side={mine} />}

        {b.phase === 'rounds' && (
          <>
            <div className="fronts" style={{ marginTop: 8 }}>
              {FRONTS.map((f) => {
                const valid = validOrders(b, me, f);
                const targets = flankTargets(b, me, f);
                return (
                  <div key={f} className="orders">
                    {valid.length === 0 && <span className="small muted center">—</span>}
                    {valid.map((o) => (
                      <button
                        key={o}
                        className={orders.orders[f] === o ? 'active' : ''}
                        title={ORDER_HELP[o]}
                        onClick={() =>
                          setOrders({
                            ...orders,
                            orders: { ...orders.orders, [f]: o },
                            flankTargets: {
                              ...orders.flankTargets,
                              [f]: o === 'flanc' ? targets[0] : undefined,
                            },
                          })
                        }
                      >
                        {ORDER_LABELS[o]}
                      </button>
                    ))}
                    {orders.orders[f] === 'flanc' && targets.length > 1 && (
                      <select
                        className="select"
                        value={orders.flankTargets?.[f] ?? targets[0]}
                        onChange={(e) =>
                          setOrders({
                            ...orders,
                            flankTargets: {
                              ...orders.flankTargets,
                              [f]: e.target.value as FrontId,
                            },
                          })
                        }
                      >
                        {targets.map((t) => (
                          <option key={t} value={t}>
                            {FRONT_LABELS[t]}
                          </option>
                        ))}
                      </select>
                    )}
                  </div>
                );
              })}
            </div>
            <details className="small muted" style={{ marginTop: 6 }}>
              <summary>Effet des ordres</summary>
              {(Object.keys(ORDER_HELP) as Order[]).map((o) => (
                <p key={o}>
                  <b>{ORDER_LABELS[o]}</b> : {ORDER_HELP[o]}
                </p>
              ))}
            </details>
          </>
        )}

        {b.log.length > 0 && (
          <div className="log" style={{ marginTop: 10 }}>
            {lastLog && (
              <p>
                <b>Round {lastLog.round}</b>
              </p>
            )}
            {lastLog?.lines.map((l, i) => (
              <p key={i}>{l}</p>
            ))}
          </div>
        )}

        {b.phase === 'fin' && b.result && <Report game={game} b={b} />}
      </div>

      <div className="drawer glass">
        {b.phase === 'deploiement' && (
          <div className="row">
            <button className="btn ghost" onClick={() => dispatch({ type: 'battleAuto' })}>
              Auto
            </button>
            <button className="btn primary grow" onClick={() => dispatch({ type: 'battleStart' })}>
              Engager la bataille
            </button>
          </div>
        )}
        {b.phase === 'rounds' && (
          <>
            <div className="row small" style={{ marginBottom: 6 }}>
              <span>
                Réserve : <b>{Math.round(totalMen(mine.reserve))}</b>
                {totalMen(mine.reserve) > 0 ? ` (moral ${Math.round(mine.reserveMorale)})` : ''}
              </span>
            </div>
            {totalMen(mine.reserve) > 0 && (
              <Segmented
                style={{ marginBottom: 6 }}
                options={[
                  { value: 'garder', label: 'Garder' },
                  ...FRONTS.map((f) => ({ value: f, label: `→ ${FRONT_LABELS[f]}` })),
                ]}
                value={reserveTo ?? 'garder'}
                onChange={(v) => setReserveTo(v === 'garder' ? null : (v as FrontId))}
              />
            )}
            {canRally && (
              <Segmented
                style={{ marginBottom: 6 }}
                options={[
                  { value: 'non', label: 'Pas de ralliement' },
                  ...FRONTS.filter((f) => isActive(mine.fronts[f])).map((f) => ({
                    value: f,
                    label: `Rallier ${FRONT_LABELS[f].toLowerCase()}`,
                  })),
                ]}
                value={rally ?? 'non'}
                onChange={(v) => setRally(v === 'non' ? null : (v as FrontId))}
              />
            )}
            <TacticHand
              side={mine}
              value={orders.tactic}
              onChange={(t) => setOrders({ ...orders, tactic: t })}
            />
            <div className="row">
              <button className="btn ghost" onClick={() => dispatch({ type: 'battleAuto' })}>
                Auto
              </button>
              {!mine.challenged && !b.duel && mine.mainCommanderId && enemy.mainCommanderId && (
                <button
                  className="btn ghost"
                  aria-label="Défier le commandant ennemi en duel"
                  onClick={() => dispatch({ type: 'battleChallenge' })}
                >
                  🤺<span className="hide-narrow"> Défier</span>
                </button>
              )}
              <button className="btn primary grow" onClick={launch}>
                Lancer le round
              </button>
            </div>
          </>
        )}
        {b.phase === 'fin' && (
          <button className="btn primary block" onClick={() => dispatch({ type: 'battleClose' })}>
            Retour à la campagne
          </button>
        )}
      </div>
    </div>
  );
}

function SideHeader({
  side,
  recon,
  estimate,
  enemy,
}: {
  side: BattleSide;
  recon: number;
  estimate: number;
  enemy?: boolean;
}) {
  const men = sideMen(side);
  const total = totalMen(men);
  return (
    <div className="row small wrap" style={{ margin: '4px 0', gap: 6 }}>
      <b>{side.name}</b>
      {side.elan > 0 && (
        <span className="elan" title="Élan : attaque renforcée">
          {'🔥'.repeat(side.elan)}
        </span>
      )}
      {enemy && side.tactics?.length > 0 && (
        <span className="chip tiny">🃏 {side.tactics.length} tactique(s)</span>
      )}
      <span className="muted">
        {enemy && recon === 0
          ? `~${estimate} hommes (estimation)`
          : `${Math.round(total)} / ${side.initialMen} hommes`}
        {enemy &&
          recon >= 1 &&
          ' · ' +
            UNIT_TYPES.filter((u) => men[u] > 0)
              .map((u) => `${UNITS[u].short} ${Math.round(men[u])}`)
              .join(' ')}
      </span>
    </div>
  );
}

function FrontCard({
  b,
  side,
  f,
  hidden,
  revealed,
}: {
  b: BattleState;
  side: BattleSide;
  f: FrontId;
  hidden?: boolean;
  revealed?: Order;
}) {
  const fr = side.fronts[f];
  const men = totalMen(fr.men);
  const cmd = frontCommander(side, f);
  const [hit, setHit] = useState(false);
  useEffect(() => {
    if (fr.lastLoss > 0) {
      setHit(true);
      const t = setTimeout(() => setHit(false), 500);
      return () => clearTimeout(t);
    }
  }, [b.round, fr.lastLoss]);
  const cls = `front${fr.broken ? ' broken' : ''}${fr.withdrawn ? ' withdrawn' : ''}${hit ? ' hit' : ''}`;
  if (hidden) {
    return (
      <div className={cls}>
        <b>{FRONT_LABELS[f]}</b>
        <p className="muted">?</p>
        {revealed && (
          <p className="small">
            Ordre : <b>{ORDER_LABELS[revealed]}</b>
          </p>
        )}
      </div>
    );
  }
  const start = Math.max(fr.startMen, men, 1);
  return (
    <div className={cls}>
      <b>{FRONT_LABELS[f]}</b>
      {fr.broken && (
        <div className="bad small">
          <b>Brisé</b>
        </div>
      )}
      {fr.withdrawn && !fr.broken && (
        <div className="muted small">
          {men > 0 ? '' : b.phase === 'deploiement' ? 'Vide' : 'Replié'}
        </div>
      )}
      <div className="small">{Math.round(men)} h.</div>
      <Bar value={men} max={start} color="var(--blue)" />
      {b.phase !== 'deploiement' && (
        <>
          <div className="small" style={{ marginTop: 3 }}>
            Moral {Math.max(0, Math.round(fr.morale))}
          </div>
          <Bar value={fr.morale} max={100} color={fr.morale < 25 ? 'var(--bad)' : 'var(--gold)'} />
        </>
      )}
      <div className="units">
        {UNIT_TYPES.filter((u) => fr.men[u] >= 1).map((u) => (
          <span key={u}>
            {UNITS[u].short} {Math.round(fr.men[u] / 100)}
          </span>
        ))}
      </div>
      {cmd && (
        <div className="cmd">
          {cmd.name} ({cmd.guerre})
          {cmd.traits
            .filter((t) => TRAITS[t]?.battle)
            .map((t) => ` · ${TRAITS[t].name}`)
            .join('')}
        </div>
      )}
      {revealed && (
        <div className="small">
          Ordre prévu : <b>{ORDER_LABELS[revealed]}</b>
        </div>
      )}
    </div>
  );
}

function Deployment({ b, side }: { b: BattleState; side: BattleSide }) {
  const dispatch = useStore((s) => s.dispatch);
  const types = UNIT_TYPES.filter((u) => totalMen({ [u]: sideMen(side)[u] }) > 0);
  const move = (unit: UnitType, from: FrontId | 'reserve', to: FrontId | 'reserve') =>
    dispatch({ type: 'battleMove', unit, from, to });
  return (
    <div className="card" style={{ marginTop: 10 }}>
      <h3>Déploiement</h3>
      <div className="preset-grid">
        {(Object.keys(PRESET_LABELS) as Preset[]).map((p) => (
          <button
            key={p}
            className="btn small"
            onClick={() => dispatch({ type: 'battleDeploy', preset: p })}
          >
            {PRESET_LABELS[p]}
          </button>
        ))}
      </div>
      <p className="small muted">
        Réserve :{' '}
        {UNIT_TYPES.filter((u) => side.reserve[u] >= 1)
          .map((u) => `${UNITS[u].short} ${Math.round(side.reserve[u] / 100)}`)
          .join(' · ') || 'vide'}
      </p>
      {FRONTS.map((f) => (
        <div key={f} style={{ borderTop: '1px solid var(--line)', paddingTop: 6, marginTop: 6 }}>
          <div className="row">
            <b className="grow">{FRONT_LABELS[f]}</b>
            <select
              className="select"
              value={side.fronts[f].commanderId ?? ''}
              onChange={(e) =>
                dispatch({
                  type: 'battleCommander',
                  front: f,
                  commanderId: e.target.value || undefined,
                })
              }
            >
              <option value="">Sans commandant</option>
              {side.commanders.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} ({c.guerre})
                </option>
              ))}
            </select>
          </div>
          <div className="row wrap" style={{ gap: 4, marginTop: 4 }}>
            {types.map((u) => (
              <span key={u} className="row" style={{ gap: 2 }}>
                <button
                  className="btn small"
                  style={{ minWidth: 44 }}
                  disabled={side.fronts[f].men[u] < 1}
                  onClick={() => move(u, f, 'reserve')}
                >
                  −
                </button>
                <span className="small" style={{ minWidth: 44, textAlign: 'center' }}>
                  {UNITS[u].short} {Math.round(side.fronts[f].men[u] / 100)}
                </span>
                <button
                  className="btn small"
                  style={{ minWidth: 44 }}
                  disabled={side.reserve[u] < 1}
                  onClick={() => move(u, 'reserve', f)}
                >
                  +
                </button>
              </span>
            ))}
          </div>
        </div>
      ))}
      {b.ambush && b.playerSide === 'attacker' && (
        <p className="small bad">La forêt est propice aux embuscades…</p>
      )}
    </div>
  );
}

function Report({ game, b }: { game: GameState; b: BattleState }) {
  const r = b.result!;
  const me = b.playerSide ?? 'attacker';
  const won = r.winner === me;
  const name = (id: string) =>
    game.characters[id]?.name ??
    b.attacker.commanders.concat(b.defender.commanders).find((c) => c.id === id)?.name ??
    id;
  return (
    <div className="card" style={{ marginTop: 10 }}>
      <h2 className={won ? 'good' : 'bad'}>{won ? 'Victoire !' : 'Défaite'}</h2>
      <p>
        {r.reason === 'deroute'
          ? 'L’ennemi est en déroute.'
          : 'L’attaquant se retire après 8 rounds.'}
        {r.reason === 'deroute' && !won && ' Votre armée est en déroute.'} {r.rounds} rounds.
      </p>
      <dl className="kv">
        <dt>Vos pertes</dt>
        <dd>{r.losses[me]}</dd>
        <dt>Pertes ennemies</dt>
        <dd>{r.losses[other(me)]}</dd>
        {r.pursuitLosses > 0 && (
          <>
            <dt>Dont poursuite</dt>
            <dd>{r.pursuitLosses}</dd>
          </>
        )}
        <dt>Score de guerre</dt>
        <dd>
          {won ? '+' : '−'}
          {r.warScore}
        </dd>
      </dl>
      {r.killed.length > 0 && <p className="small">Tués : {r.killed.map(name).join(', ')}</p>}
      {r.wounded.length > 0 && <p className="small">Blessés : {r.wounded.map(name).join(', ')}</p>}
      {r.captured.length > 0 && (
        <p className="small">Capturés : {r.captured.map(name).join(', ')}</p>
      )}
    </div>
  );
}

function TacticHand({
  side,
  value,
  onChange,
}: {
  side: BattleSide;
  value?: TacticId;
  onChange: (t?: TacticId) => void;
}) {
  if (!side.tactics?.length)
    return (
      <p className="small muted" style={{ margin: '0 0 6px' }}>
        Plus de tactique en main.
      </p>
    );
  const sel = value ? TACTICS[value] : undefined;
  return (
    <div className="tactics" data-noswipe>
      <div className="tactic-hand">
        {side.tactics.map((t) => (
          <button
            key={t}
            className={`tactic${value === t ? ' active' : ''}`}
            onClick={() => onChange(value === t ? undefined : t)}
          >
            <span className="t-icon">{TACTICS[t].icon}</span>
            <span className="t-name">{TACTICS[t].name}</span>
          </button>
        ))}
      </div>
      <p className="small muted" style={{ margin: '4px 0 6px' }}>
        {sel
          ? `${sel.name} : ${sel.description}`
          : 'Touchez une tactique pour la jouer ce round (une seule fois par bataille).'}
      </p>
    </div>
  );
}

function DuelPrompt({ b }: { b: BattleState }) {
  const dispatch = useStore((s) => s.dispatch);
  const d = b.duel!;
  const ch = b[d.challenger].commanders.find((c) => c.id === d.challengerId);
  const me = b[other(d.challenger)].commanders.find((c) => c.id === d.targetId);
  if (!ch || !me) return null;
  const a = duelPower(me);
  const e = duelPower(ch);
  return (
    <div className="duel-prompt glass">
      <b>🤺 {ch.name} vous défie en duel !</b>
      <p className="small" style={{ margin: '4px 0 8px' }}>
        {me.name} (force {a}) contre {ch.name} (force {e}). Le vainqueur galvanise son armée, le
        vaincu risque blessure ou mort. Refuser fait murmurer vos rangs.
      </p>
      <div className="row">
        <button
          className="btn grow"
          onClick={() => dispatch({ type: 'battleDuel', accept: false })}
        >
          Refuser
        </button>
        <button
          className="btn primary grow"
          onClick={() => dispatch({ type: 'battleDuel', accept: true })}
        >
          Relever le défi
        </button>
      </div>
    </div>
  );
}
