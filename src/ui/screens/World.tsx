import { useState } from 'react';
import { BALANCE } from '../../data/balance';
import { ageOf, allied, atWar, displayName } from '../../engine/characters';
import { allianceAcceptance, tributeAcceptance } from '../../engine/diplomacy';
import { canStartPlot, PLOT_INFO, plotOdds, plotTargets } from '../../engine/intrigue';
import { capitalOf, domainCounties, greatCourts, realmName } from '../../engine/realm';
import type { GameState, PlotType } from '../../engine/state';
import { truceWith } from '../../engine/war';
import {
  CardTitle,
  CharLine,
  ChoiceGrid,
  Opinion,
  Portrait,
  Segmented,
  Sheet,
  useFocusView,
  usePager,
} from '../components/common';
import { PoachCard } from '../components/Entourage';
import { AcceptanceView } from '../components/Diplomacy';
import { PactsCard } from '../components/Crowns';
import { EssosView, WallView } from '../components/WallEssos';
import { wallStatus } from '../../engine/scenario/wall';
import { Pip } from './Court';
import { hasFamilyPact } from '../../engine/crowns';
import { NewsList, WorldNews, newsAbout } from '../components/News';
import { useStore } from '../store';
import { FirstVisitTip } from '../components/FirstVisit';

const WORLD_VIEWS = ['cours', 'complots', 'nouvelles'] as const;
/** Mode Trône de fer : le Mur et Essos en plus. */
const WESTEROS_VIEWS = ['cours', 'complots', 'nouvelles', 'mur', 'essos'] as const;
type WorldView = (typeof WESTEROS_VIEWS)[number];

export function WorldScreen({ game }: { game: GameState }) {
  const [view, setView] = useState<WorldView>('cours');
  const views: readonly WorldView[] = game.scenario === 'westeros' ? WESTEROS_VIEWS : WORLD_VIEWS;
  const dir = usePager(views, view, setView);
  useFocusView(views, setView);
  return (
    <>
      <Segmented
        className="subnav"
        options={[
          { value: 'cours', label: 'Cours' },
          { value: 'complots', label: 'Complots' },
          { value: 'nouvelles', label: 'Nouvelles' },
          ...(game.scenario === 'westeros'
            ? [
                { value: 'mur' as const, label: <Pip on={wallAlert(game)}>Le Mur</Pip> },
                { value: 'essos' as const, label: 'Essos' },
              ]
            : []),
        ]}
        value={view}
        onChange={setView}
      />
      <div className={`view enter-${dir}`} key={view}>
        <FirstVisitTip id={`monde/${view}`} />
        {view === 'cours' && <Diplomacy game={game} />}
        {view === 'complots' && <Plots game={game} />}
        {view === 'nouvelles' && <WorldNews game={game} />}
        {view === 'mur' && <WallView game={game} />}
        {view === 'essos' && <EssosView game={game} />}
      </div>
    </>
  );
}

/** Le Mur demande attention : il vacille ou il est tombé. */
function wallAlert(game: GameState): boolean {
  return !!game.wall && wallStatus(game) !== 'tient';
}

function Diplomacy({ game }: { game: GameState }) {
  const pl = game.playerId;
  const [open, setOpen] = useState<string | null>(null);
  const goTo = useStore((s) => s.goTo);
  const rulers = greatCourts(game).filter((r) => r !== pl);
  return (
    <>
      <div className="card">
        <CardTitle>Cours voisines</CardTitle>
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
                  {realmName(game, r)} ({domainCounties(game, r).length})
                  {rel && <b className={rel === 'en guerre' ? 'bad' : 'good'}> · {rel}</b>}{' '}
                  <Opinion state={game} from={r} to={pl} />
                </>
              }
            />
          );
        })}
      </div>
      <button className="btn block" onClick={() => goTo('cour', 'maison')}>
        Arranger un mariage (Cour › Maison) ›
      </button>
      {open && <RulerSheet game={game} id={open} onClose={() => setOpen(null)} />}
    </>
  );
}

function RulerSheet({ game, id, onClose }: { game: GameState; id: string; onClose: () => void }) {
  const dispatch = useStore((s) => s.dispatch);
  const setTradeWith = useStore((s) => s.setTradeWith);
  const setRealmSheet = useStore((s) => s.setRealmSheet);
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
            {realmName(game, id)} · capitale {capitalOf(game, id)?.name ?? '—'} ·{' '}
            {Math.round(c.gold)} or
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
      <button
        className="btn block ghost"
        style={{ marginTop: 6 }}
        onClick={() => setRealmSheet(id)}
      >
        Fiche du royaume (succession, influence) ›
      </button>
      <h3 className="settings-title">Relations</h3>
      <div className="card">
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
      {allied(game, pl, id) ? (
        <div className="card">
          <b>Alliance en vigueur</b>
          <p className="small muted" style={{ margin: '4px 0 8px' }}>
            La rompre coûte {-BALANCE.diplomacy.breakAlliance.prestige} prestige et sa rancune (
            {BALANCE.diplomacy.breakAlliance.opinion} d’opinion). L’attaquer dans les{' '}
            {BALANCE.diplomacy.breakAlliance.treacherySeasons} saisons qui suivent passe pour une
            traîtrise ({BALANCE.diplomacy.breakAlliance.treacheryPrestige} prestige, toutes les
            cours vous en veulent).
            {hasFamilyPact(game, pl, id)
              ? ' Vous êtes aussi liés par un pacte de famille : le rompre est un parjure.'
              : ''}
          </p>
          <button
            className="btn small ghost"
            onClick={() => dispatch({ type: 'breakAlliance', targetId: id })}
          >
            Rompre l’alliance
          </button>
        </div>
      ) : (
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
      )}
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
      <h3 className="settings-title">Accords</h3>
      <div className="card">
        <b>Traité de terres</b>
        <p className="small muted" style={{ margin: '4px 0 8px' }}>
          Acheter, vendre ou échanger des comtés, avec de l’or de part et d’autre.
        </p>
        <button className="btn small" onClick={() => setTradeWith({ targetId: id })}>
          Négocier
        </button>
      </div>
      <PactsCard game={game} rulerId={id} />
      <h3 className="settings-title">Sa cour</h3>
      <PoachCard game={game} rulerId={id} />
      <RulerNews game={game} id={id} />
    </Sheet>
  );
}

function RulerNews({ game, id }: { game: GameState; id: string }) {
  const list = newsAbout(game, id).slice(-8);
  if (!list.length) return null;
  return (
    <div className="card">
      <b>Dernières nouvelles de cette cour</b>
      <NewsList game={game} list={list} />
    </div>
  );
}

function Plots({ game }: { game: GameState }) {
  const dispatch = useStore((s) => s.dispatch);
  const goTo = useStore((s) => s.goTo);
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
          <CardTitle>Ourdir un complot</CardTitle>
          <ChoiceGrid
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
        <CardTitle help="Votre maître-espion, chargé de « Démasquer les complots », peut les découvrir. Les complots démasqués apparaissent sous forme d’événement.">
          Complots contre vous
        </CardTitle>
        {!game.council.espion?.holderId && (
          <button className="link" onClick={() => goTo('cour', 'conseil')}>
            Aucun maître-espion pour les démasquer : nommer quelqu’un ›
          </button>
        )}
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
