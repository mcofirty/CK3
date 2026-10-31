import { useState } from 'react';
import { BALANCE } from '../../data/balance';
import {
  ageOf,
  allied,
  atWar,
  closeFamily,
  displayName,
  isAdult,
  topLiege,
} from '../../engine/characters';
import {
  allianceAcceptance,
  marriageAcceptance,
  marriageCandidates,
  tributeAcceptance,
  type Acceptance,
} from '../../engine/diplomacy';
import { canStartPlot, PLOT_INFO, plotOdds, plotTargets } from '../../engine/intrigue';
import { independentRulers, realmCounties, realmName } from '../../engine/realm';
import type { Character, GameState, PlotType } from '../../engine/state';
import { truceWith } from '../../engine/war';
import {
  CharLine,
  Opinion,
  Portrait,
  Segmented,
  Sheet,
  signed,
  usePager,
} from '../components/common';
import { DECISIONS } from '../../data/decisions';
import { decisionCheck } from '../../engine/decisions';
import { useStore } from '../store';

function AcceptanceView({ acc }: { acc: Acceptance }) {
  return (
    <div className="small" style={{ marginTop: 6 }}>
      <b className={acc.accept ? 'good' : 'bad'}>
        {acc.blocked
          ? `Impossible : ${acc.blocked}`
          : acc.accept
            ? `Acceptera (${signed(acc.score)})`
            : `Refusera (${signed(acc.score)})`}
      </b>
      {!acc.blocked &&
        acc.factors.map((f, i) => (
          <div key={i} className="row">
            <span className="muted grow">{f.label}</span>
            <span>{signed(f.value)}</span>
          </div>
        ))}
    </div>
  );
}

const INTRIGUE_VIEWS = ['diplomatie', 'complots', 'decisions'] as const;

export function IntrigueScreen({ game }: { game: GameState }) {
  const [view, setView] = useState<'diplomatie' | 'complots' | 'decisions'>('diplomatie');
  const dir = usePager(INTRIGUE_VIEWS, view, setView);
  return (
    <>
      <Segmented
        style={{ marginBottom: 12 }}
        options={[
          { value: 'diplomatie', label: 'Diplomatie' },
          { value: 'complots', label: 'Complots' },
          { value: 'decisions', label: 'Décisions' },
        ]}
        value={view}
        onChange={setView}
      />
      <div className={`view enter-${dir}`} key={view}>
        {view === 'diplomatie' && <Diplomacy game={game} />}
        {view === 'complots' && <Plots game={game} />}
        {view === 'decisions' && <Decisions game={game} />}
      </div>
    </>
  );
}

function Diplomacy({ game }: { game: GameState }) {
  const pl = game.playerId;
  const [open, setOpen] = useState<string | null>(null);
  const [marriage, setMarriage] = useState(false);
  const rulers = independentRulers(game).filter((r) => r !== pl);
  return (
    <>
      <div className="card">
        <h3>Cours voisines</h3>
        {rulers.map((r) => {
          const c = game.characters[r];
          const rel = atWar(game, pl, r)
            ? 'en guerre'
            : allied(game, pl, r)
              ? 'allié'
              : truceWith(game, pl, r)
                ? 'trêve'
                : '';
          return (
            <CharLine
              key={r}
              state={game}
              c={c}
              onTap={() => setOpen(r)}
              extra={
                <>
                  {realmName(game, r)} ({realmCounties(game, r).length})
                  {rel && <b className={rel === 'en guerre' ? 'bad' : 'good'}> · {rel}</b>}{' '}
                  <Opinion state={game} from={r} to={pl} />
                </>
              }
            />
          );
        })}
      </div>
      <button className="btn block" onClick={() => setMarriage(true)}>
        Arranger un mariage
      </button>
      {open && <RulerSheet game={game} id={open} onClose={() => setOpen(null)} />}
      {marriage && <MarriageSheet game={game} onClose={() => setMarriage(false)} />}
    </>
  );
}

function RulerSheet({ game, id, onClose }: { game: GameState; id: string; onClose: () => void }) {
  const dispatch = useStore((s) => s.dispatch);
  const inspect = useStore((s) => s.inspect);
  const pl = game.playerId;
  const c = game.characters[id];
  const alliance = allianceAcceptance(game, pl, id);
  const tribute = tributeAcceptance(game, pl, id);
  const gift = BALANCE.economy.giftCost;
  return (
    <Sheet onClose={onClose}>
      <div className="row">
        <Portrait state={game} c={c} size={64} />
        <div className="grow">
          <h2 style={{ margin: 0 }}>{displayName(game, c)}</h2>
          <div className="small muted">
            {realmName(game, id)} · {Math.round(c.gold)} or
          </div>
        </div>
        <Opinion state={game} from={id} to={pl} />
      </div>
      <button
        className="btn block ghost"
        style={{ marginTop: 10 }}
        onClick={() => inspect({ kind: 'perso', id })}
      >
        Fiche détaillée (traits, famille, terres) ›
      </button>
      <div className="card" style={{ marginTop: 12 }}>
        <b>Envoyer un cadeau ({gift} or)</b>
        <p className="small muted">+{BALANCE.economy.giftOpinion} d’opinion pendant 4 ans.</p>
        <button
          className="btn small"
          disabled={game.characters[pl].gold < gift}
          onClick={() => dispatch({ type: 'sendGift', targetId: id })}
        >
          Envoyer
        </button>
      </div>
      <div className="card">
        <b>Proposer une alliance</b>
        <AcceptanceView acc={alliance} />
        <button
          className="btn small"
          style={{ marginTop: 6 }}
          disabled={!!alliance.blocked}
          onClick={() => dispatch({ type: 'proposeAlliance', targetId: id })}
        >
          Proposer
        </button>
      </div>
      <div className="card">
        <b>Réclamer un tribut ({BALANCE.diplomacy.tribute.amount} or)</b>
        <AcceptanceView acc={tribute} />
        <button
          className="btn small"
          style={{ marginTop: 6 }}
          disabled={!!tribute.blocked}
          onClick={() => dispatch({ type: 'demandTribute', targetId: id })}
        >
          Exiger
        </button>
      </div>
    </Sheet>
  );
}

function MarriageSheet({ game, onClose }: { game: GameState; onClose: () => void }) {
  const dispatch = useStore((s) => s.dispatch);
  const p = game.characters[game.playerId];
  const singles = [p, ...closeFamily(game, p)].filter(
    (c) => !c.spouseId && isAdult(game, c) && c.dynastyId === game.playerDynastyId,
  );
  const [who, setWho] = useState<Character | null>(singles[0] ?? null);
  const [target, setTarget] = useState<Character | null>(null);
  const cands = who ? marriageCandidates(game, who) : [];
  return (
    <Sheet onClose={onClose}>
      <h2>Arranger un mariage</h2>
      <p className="small muted">
        Un mariage crée un lien entre les cours et permet ensuite une alliance. Épouser un souverain
        ou son enfant augmente la renommée.
      </p>
      {singles.length === 0 && <p className="muted">Personne à marier dans votre famille.</p>}
      {singles.length > 0 && (
        <select
          className="select"
          style={{ width: '100%' }}
          value={who?.id ?? ''}
          onChange={(e) => {
            setWho(game.characters[e.target.value]);
            setTarget(null);
          }}
        >
          {singles.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
              {c.id === p.id ? ' (vous)' : ''}
            </option>
          ))}
        </select>
      )}
      {who &&
        !target &&
        cands.map((c) => (
          <CharLine
            key={c.id}
            state={game}
            c={c}
            onTap={() => setTarget(c)}
            extra={<>cour de {game.characters[topLiege(game, c.id)]?.name}</>}
          />
        ))}
      {who && target && (
        <div className="card" style={{ marginTop: 10 }}>
          <b>
            {who.name} ⚭ {displayName(game, target)}
          </b>
          <AcceptanceView acc={marriageAcceptance(game, who, target)} />
          <div className="row" style={{ marginTop: 8 }}>
            <button className="btn small ghost" onClick={() => setTarget(null)}>
              Autre parti
            </button>
            <button
              className="btn small primary right"
              onClick={() => {
                dispatch({ type: 'proposeMarriage', aId: who.id, bId: target.id });
                onClose();
              }}
            >
              Proposer
            </button>
          </div>
        </div>
      )}
    </Sheet>
  );
}

function Plots({ game }: { game: GameState }) {
  const dispatch = useStore((s) => s.dispatch);
  const pl = game.playerId;
  const mine = Object.values(game.plots).find((p) => p.ownerId === pl);
  const [type, setType] = useState<PlotType>('discrediter');
  const [targetId, setTargetId] = useState<string>('');
  const groups = plotTargets(game, pl, type);
  const odds = targetId ? plotOdds(game, pl, targetId, 0) : undefined;
  const chk = targetId ? canStartPlot(game, pl, type, targetId) : { ok: false };
  return (
    <>
      {mine && (
        <div className="card">
          <h3>
            {PLOT_INFO[mine.type].label} : {game.characters[mine.targetId]?.name}
          </h3>
          <div className="small">Progression {Math.min(100, Math.round(mine.progress))} %</div>
          <div className="bar">
            <div
              style={{ width: `${Math.min(100, mine.progress)}%`, background: 'var(--accent)' }}
            />
          </div>
          {(() => {
            const o = plotOdds(game, pl, mine.targetId, mine.agents, mine.progress);
            return (
              <div className="small" style={{ marginTop: 6 }}>
                <b>Chance de réussite : {Math.round(o.success * 100)} %</b> · {o.seasons} saison(s)
                restante(s) · risque {Math.round(o.discoveryPerSeason * 100)} %/saison
                {o.reasons.map((r, i) => (
                  <div key={i} className="row">
                    <span className="muted grow">{r.label}</span>
                    <span>{r.value}</span>
                  </div>
                ))}
              </div>
            );
          })()}
          <div className="row" style={{ marginTop: 8 }}>
            <button
              className="btn small"
              disabled={
                mine.agents >= BALANCE.intrigue.maxAgents ||
                game.characters[pl].gold < BALANCE.intrigue.agentCost
              }
              onClick={() => dispatch({ type: 'addAgent', plotId: mine.id })}
            >
              Recruter un agent ({BALANCE.intrigue.agentCost} or) — {mine.agents}/
              {BALANCE.intrigue.maxAgents}
            </button>
            <button
              className="btn small ghost right"
              onClick={() => dispatch({ type: 'abandonPlot', plotId: mine.id })}
            >
              Abandonner
            </button>
          </div>
        </div>
      )}
      {!mine && (
        <div className="card">
          <h3>Ourdir un complot</h3>
          <Segmented
            options={(Object.keys(PLOT_INFO) as PlotType[]).map((t) => ({
              value: t,
              label: PLOT_INFO[t].label,
            }))}
            value={type}
            onChange={(t) => {
              setType(t);
              setTargetId('');
            }}
          />
          <p className="small muted">{PLOT_INFO[type].description}</p>
          <select
            className="select"
            style={{ width: '100%' }}
            value={targetId}
            onChange={(e) => setTargetId(e.target.value)}
          >
            <option value="">— Cible —</option>
            {groups.map((g) => (
              <optgroup
                key={g.rulerId}
                label={g.rulerId === pl ? 'Vos vassaux' : realmName(game, g.rulerId)}
              >
                {g.members.map((m) => {
                  const c = game.characters[m.id];
                  return (
                    <option key={m.id} value={m.id}>
                      {displayName(game, c)} — {m.relation}, {ageOf(game, c)} ans
                    </option>
                  );
                })}
              </optgroup>
            ))}
          </select>
          {odds && (
            <div className="small" style={{ marginTop: 6 }}>
              <b>Chance de réussite sans agent : {Math.round(odds.success * 100)} %</b> ·{' '}
              {odds.seasons} saison(s) · risque {Math.round(odds.discoveryPerSeason * 100)} %/saison
              {odds.reasons.map((r, i) => (
                <div key={i} className="row">
                  <span className="muted grow">{r.label}</span>
                  <span>{r.value}</span>
                </div>
              ))}
              <p className="muted">Découvert : −40 d’opinion de la cible et −40 prestige.</p>
            </div>
          )}
          <button
            className="btn primary block"
            style={{ marginTop: 8 }}
            disabled={!chk.ok}
            onClick={() => dispatch({ type: 'startPlot', plotType: type, targetId })}
          >
            Lancer le complot
          </button>
        </div>
      )}
      <div className="card">
        <h3>Complots contre vous</h3>
        <p className="small muted">
          Votre maître-espion, chargé de « Démasquer les complots », peut les découvrir. Les
          complots démasqués apparaissent sous forme d’événement.
        </p>
        {game.notifications
          .filter((n) => /complot|attentat|rumeurs/i.test(n.text))
          .slice(-5)
          .map((n, i) => (
            <p key={i} className="small">
              • {n.text}
            </p>
          ))}
      </div>
    </>
  );
}

function Decisions({ game }: { game: GameState }) {
  const dispatch = useStore((s) => s.dispatch);
  return (
    <div className="card">
      <h3>Décisions</h3>
      <p className="small muted">
        Agissez au lieu d’attendre : chaque décision ouvre un événement, puis revient après un
        délai.
      </p>
      {DECISIONS.map((d) => {
        const chk = decisionCheck(game, d.id);
        const cost = [
          d.cost.or ? `${d.cost.or} or` : '',
          d.cost.prestige ? `${d.cost.prestige} prestige` : '',
          d.cost.piete ? `${d.cost.piete} piété` : '',
        ]
          .filter(Boolean)
          .join(', ');
        return (
          <div key={d.id} className="list-item decision">
            <span className="dec-icon">{d.icon}</span>
            <div className="grow">
              <b>{d.name}</b>
              <div className="small">{d.description}</div>
              <div className="small muted">
                {cost} · tous les {d.cooldownYears} an{d.cooldownYears > 1 ? 's' : ''}
                {!chk.ok && chk.reason && <span className="bad"> · {chk.reason}</span>}
              </div>
            </div>
            <button
              className="btn small primary"
              disabled={!chk.ok}
              onClick={() => dispatch({ type: 'takeDecision', id: d.id })}
            >
              Agir
            </button>
          </div>
        );
      })}
    </div>
  );
}
