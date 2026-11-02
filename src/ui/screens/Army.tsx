import { useEffect, useState } from 'react';
import { BALANCE } from '../../data/balance';
import { MERCENARIES } from '../../data/mercenaries';
import { UNIT_TYPES, UNITS } from '../../data/units';
import { mercCheck, negotiateChance } from '../../engine/war/campaignExtras';
import { allied, displayName, isAdult, skill, warSide } from '../../engine/characters';
import {
  availableLevies,
  countyRuler,
  fortLevel,
  independentRulers,
  realmCounties,
  realmName,
  recruitCapacity,
  standingOf,
} from '../../engine/realm';
import type { CasusBelliType, GameState, UnitType } from '../../engine/state';
import { armyUpkeep, totalMen } from '../../engine/units';
import {
  armyOf,
  canDeclareWar,
  canLoot,
  canRaise,
  canRecruit,
  courtiersOf,
  scoreFor,
  warsOf,
} from '../../engine/war';
import {
  Bar,
  CardTitle,
  ChoiceGrid,
  Segmented,
  signed,
  useFocusView,
  usePager,
} from '../components/common';
import { Pip } from './Court';
import { CallHelpSheet } from '../components/Diplomacy';
import { PeaceSheet } from '../components/Peace';
import { useStore } from '../store';

const ARMY_VIEWS = ['troupes', 'guerres'] as const;
type ArmyView = (typeof ARMY_VIEWS)[number];

export function ArmyScreen({ game }: { game: GameState }) {
  const [view, setView] = useState<ArmyView>('troupes');
  const dir = usePager(ARMY_VIEWS, view, setView);
  useFocusView(ARMY_VIEWS, setView);
  const atWar = warsOf(game, game.playerId).length > 0;
  return (
    <>
      <Segmented
        className="subnav"
        options={[
          { value: 'troupes', label: 'Troupes' },
          { value: 'guerres', label: <Pip on={atWar}>Guerres</Pip> },
        ]}
        value={view}
        onChange={setView}
      />
      <div className={`view enter-${dir}`} key={view}>
        {view === 'troupes' ? <TroopsView game={game} /> : <WarsView game={game} />}
      </div>
    </>
  );
}

/** L'armée levée, ses commandants et son siège, le recrutement et les mercenaires. */
function TroopsView({ game }: { game: GameState }) {
  const dispatch = useStore((s) => s.dispatch);
  const goTo = useStore((s) => s.goTo);
  const pl = game.playerId;
  const army = armyOf(game, pl);
  const standing = standingOf(game, pl);
  const cap = recruitCapacity(game, pl);
  const levies = availableLevies(game, pl).total;
  const raise = canRaise(game, pl);
  const commanders = [
    game.characters[pl],
    ...courtiersOf(game, pl),
    ...Object.values(game.characters).filter((c) => c.alive && c.liegeId === pl),
  ].filter((c) => c.alive && isAdult(game, c) && !c.imprisonedBy);
  return (
    <>
      <div className="card">
        <h3>Armée</h3>
        {!army && (
          <>
            <p className="small muted">
              Levées disponibles : <b>{levies}</b> · compagnies professionnelles :{' '}
              <b>{totalMen(standing)}</b>
            </p>
            <button
              className="btn primary block"
              disabled={!raise.ok}
              onClick={() => dispatch({ type: 'raiseArmy' })}
            >
              Lever l’armée
            </button>
            {!raise.ok && <p className="small bad">{raise.reason}</p>}
            <p className="small muted">
              Les levées sont gratuites tant qu’elles restent chez elles ; une fois levées, elles
              coûtent 1 or par compagnie et par saison. Une fois levée, déplacez l’armée depuis la
              carte : touchez un comté, puis « Envoyer l’armée ici ».
            </p>
          </>
        )}
        {army && (
          <>
            <p>
              À <b>{game.counties[army.location].name}</b>
              {army.path.length > 0 && (
                <>
                  {' '}
                  → {game.counties[army.path[army.path.length - 1]].name} ({army.path.length} étape
                  {army.path.length > 1 ? 's' : ''})
                </>
              )}
            </p>
            <div className="row wrap" style={{ gap: 4 }}>
              {UNIT_TYPES.filter((u) => army.men[u] > 0).map((u) => (
                <span key={u} className="chip">
                  {UNITS[u].label} {Math.round(army.men[u])}
                </span>
              ))}
            </div>
            <p className="small" style={{ marginTop: 6 }}>
              Total {Math.round(totalMen(army.men))} hommes · entretien{' '}
              {armyUpkeep(army.men).toFixed(1)} or/saison · levée depuis {army.seasonsRaised}{' '}
              saison(s)
            </p>
            <div className="small">Ravitaillement {Math.round(army.supply)}</div>
            <Bar
              value={army.supply}
              max={100}
              color={army.supply < 25 ? 'var(--bad)' : 'var(--good)'}
            />
            <h3 style={{ marginTop: 10 }}>Commandants</h3>
            {(['main', 0, 1] as const).map((slot) => {
              const cur = slot === 'main' ? army.commanderId : army.frontCommanders[slot];
              return (
                <div key={String(slot)} className="row" style={{ marginBottom: 6 }}>
                  <span className="small" style={{ width: 92 }}>
                    {slot === 'main' ? 'Principal' : `Front ${slot + 1}`}
                  </span>
                  <select
                    className="select grow"
                    value={cur ?? ''}
                    onChange={(e) =>
                      dispatch({
                        type: 'setCommander',
                        armyId: army.id,
                        slot,
                        commanderId: e.target.value || undefined,
                      })
                    }
                  >
                    <option value="">—</option>
                    {commanders.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name} (Guerre {skill(c, 'guerre')}){c.id === pl ? ' — vous' : ''}
                      </option>
                    ))}
                  </select>
                </div>
              );
            })}
            <p className="small muted">
              Le souverain qui commande donne +10 de moral, mais risque blessure et capture.
            </p>
            <div className="row wrap" style={{ marginTop: 8 }}>
              <button className="btn small primary" onClick={() => goTo('royaume', 'carte')}>
                Déplacer sur la carte
              </button>
              <button
                className="btn small"
                disabled={!canLoot(game, army).ok}
                onClick={() => dispatch({ type: 'loot', armyId: army.id })}
              >
                Piller
              </button>
              <button
                className="btn small ghost"
                onClick={() => dispatch({ type: 'disbandArmy', armyId: army.id })}
              >
                Dissoudre
              </button>
            </div>
          </>
        )}
      </div>
      {army && game.counties[army.location].siege?.armyId === army.id && (
        <SiegeCard game={game} armyId={army.id} />
      )}

      {army && game.counties[army.location].siege?.armyId === army.id && (
        <SiegeCard game={game} armyId={army.id} />
      )}

      <div className="card">
        <h3>Compagnies professionnelles</h3>
        <p className="small muted">
          Capacité de recrutement :{' '}
          {Math.max(0, cap.cap - (game.characters[pl].recruitedThisSeason ?? 0))} compagnie(s) cette
          saison
        </p>
        {(UNIT_TYPES.filter((u) => u !== 'levees') as UnitType[]).map((u) => {
          const chk = canRecruit(game, pl, u, 1);
          const st = UNITS[u];
          return (
            <div key={u} className="list-item">
              <div className="grow">
                <b>{st.label}</b>{' '}
                <span className="muted small">
                  × {Math.round(standing[u] / 100)}
                  {army ? ` (+${Math.round(army.men[u] / 100)} en campagne)` : ''}
                </span>
                <div className="small muted">
                  Att. {st.attack} · Déf. {st.defense} · Moral {st.morale} · {st.recruit} or,{' '}
                  {st.upkeep} or/saison
                  {!chk.ok && <span className="bad"> · {chk.reason}</span>}
                </div>
              </div>
              {standing[u] > 0 && (
                <button
                  className="btn small ghost"
                  onClick={() => dispatch({ type: 'dismiss', unit: u, companies: 1 })}
                >
                  −
                </button>
              )}
              <button
                className="btn small"
                disabled={!chk.ok}
                onClick={() => dispatch({ type: 'recruit', unit: u, companies: 1 })}
              >
                +1
              </button>
            </div>
          );
        })}
      </div>
      <MercCard game={game} />
    </>
  );
}

/** Les guerres en cours (score, paix, appel à l'aide) et la déclaration de guerre. */
function WarsView({ game }: { game: GameState }) {
  const focusWar = useStore((s) => s.focusWar);
  const clearFocusWar = useStore((s) => s.clearFocusWar);
  const pl = game.playerId;
  // Guerre tout juste rejointe : on la met en avant dans la carte Guerres.
  useEffect(() => {
    if (!focusWar) return;
    const t = setTimeout(() => {
      document
        .getElementById(`war-${focusWar}`)
        ?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    }, 350);
    const c = setTimeout(clearFocusWar, 3500);
    return () => {
      clearTimeout(t);
      clearTimeout(c);
    };
  }, [focusWar, clearFocusWar]);
  const [callHelp, setCallHelp] = useState<string | null>(null);
  const [peaceWar, setPeaceWar] = useState<string | null>(null);
  const army = armyOf(game, pl);
  return (
    <>
      <div className="card">
        <h3>Guerres</h3>
        {warsOf(game, pl).length === 0 && <p className="muted">Vos terres sont en paix.</p>}
        {warsOf(game, pl).map((w) => {
          const my = scoreFor(game, w, pl);
          const leader = w.attackerId === pl || w.defenderId === pl;
          const enemy = warSide(game, w.id, pl) === 'attacker' ? w.defenderId : w.attackerId;
          const myAllies = (
            warSide(game, w.id, pl) === 'attacker'
              ? [w.attackerId, ...w.attackerAllies]
              : [w.defenderId, ...w.defenderAllies]
          ).filter((x) => x !== pl);
          const callable = independentRulers(game).filter(
            (r) => r !== pl && allied(game, pl, r) && !warSide(game, w.id, r),
          );
          return (
            <div
              key={w.id}
              id={`war-${w.id}`}
              className={focusWar === w.id ? 'war-focus' : undefined}
              style={{ borderTop: '1px solid var(--line)', paddingTop: 8, marginTop: 8 }}
            >
              <b>{w.name}</b>
              <div className="small muted">
                Contre {displayName(game, game.characters[enemy])}
                {myAllies.length
                  ? ` · avec ${myAllies.map((a) => game.characters[a]?.name).join(', ')}`
                  : ''}
                {w.targetCountyId
                  ? ` · objectif ${game.counties[w.targetCountyId].name}${w.objectiveHeldSeasons ? ` (tenu ${w.objectiveHeldSeasons} saison(s))` : ''}`
                  : ''}
              </div>
              <div className="row small" style={{ marginTop: 4 }}>
                <span>Score</span>
                <b className={my >= 0 ? 'good' : 'bad'}>{signed(my)}</b>
              </div>
              <div className="bar" style={{ position: 'relative' }}>
                <div
                  style={{
                    width: `${(my + 100) / 2}%`,
                    background: my >= 0 ? 'var(--good)' : 'var(--bad)',
                  }}
                />
              </div>
              {leader && (
                <button
                  className="btn small primary"
                  style={{ marginTop: 8, marginRight: 8 }}
                  onClick={() => setPeaceWar(w.id)}
                >
                  Négocier la paix
                </button>
              )}
              <button
                className="btn small"
                style={{ marginTop: 8 }}
                onClick={() => setCallHelp(w.id)}
              >
                Appeler à l’aide
                {callable.length
                  ? ` (${callable.length} allié${callable.length > 1 ? 's' : ''})`
                  : ''}
              </button>
            </div>
          );
        })}
      </div>

      {army && game.counties[army.location].siege?.armyId === army.id && (
        <SiegeCard game={game} armyId={army.id} />
      )}
      <DeclareWar game={game} />
      {peaceWar && <PeaceSheet game={game} warId={peaceWar} onClose={() => setPeaceWar(null)} />}
      {callHelp && <CallHelpSheet game={game} warId={callHelp} onClose={() => setCallHelp(null)} />}
    </>
  );
}

/** Déclarer une guerre : casus belli et cibles possibles, directement dans la vue. */
function DeclareWar({ game }: { game: GameState }) {
  const dispatch = useStore((s) => s.dispatch);
  const pl = game.playerId;
  const me = game.characters[pl];
  const [cb, setCb] = useState<CasusBelliType>(me.liegeId ? 'independance' : 'revendication');
  const mine = new Set(realmCounties(game, pl).map((c) => c.id));
  const targets =
    cb === 'revendication'
      ? me.claims.map((id) => game.counties[id]).filter((c) => c && countyRuler(game, c) !== pl)
      : cb === 'conquete'
        ? Object.values(game.counties).filter(
            (c) => !mine.has(c.id) && c.adjacent.some((n) => mine.has(n)),
          )
        : [];
  return (
    <div className="card" id="focus-declarer">
      <CardTitle>Déclarer une guerre</CardTitle>
      <ChoiceGrid<CasusBelliType>
        cols={3}
        options={[
          { value: 'revendication', label: 'Revendication' },
          { value: 'conquete', label: 'Conquête' },
          { value: 'independance', label: 'Indépendance' },
        ]}
        value={cb}
        onChange={setCb}
      />
      <p className="tiny muted" style={{ margin: '6px 0 0' }}>
        Droit dynastique (succession d’une autre maison) : Royaume › Lois › Droits dynastiques.
      </p>
      <p className="small muted">
        {cb === 'revendication' &&
          'Sur un comté que vous revendiquez (héritée, ou fabriquée par votre chancelier).'}
        {cb === 'conquete' &&
          'Coûte beaucoup de prestige ; réservée aux rois et aux souverains Ambitieux. Les comtés occupés sont aussi pris.'}
        {cb === 'independance' && 'Pour un vassal qui veut s’affranchir de son suzerain.'}
      </p>
      {cb === 'independance' && me.liegeId && (
        <button
          className="btn primary block"
          onClick={() => {
            dispatch({ type: 'declareWar', targetId: me.liegeId!, cb });
          }}
        >
          Se soulever contre {game.characters[me.liegeId].name}
        </button>
      )}
      {targets.length === 0 && cb !== 'independance' && (
        <p className="muted">Aucune cible possible.</p>
      )}
      {targets.map((c) => {
        const def = countyRuler(game, c);
        const chk = canDeclareWar(game, pl, def, cb, c.id);
        return (
          <div key={c.id} className="list-item">
            <div className="grow">
              <b>{c.name}</b>
              <div className="small muted">
                {realmName(game, def)}
                {!chk.ok && <span className="bad"> · {chk.reasons.join(' · ')}</span>}
                {chk.prestigeCost ? ` · ${chk.prestigeCost} prestige` : ''}
              </div>
            </div>
            <button
              className="btn small primary"
              disabled={!chk.ok}
              onClick={() => {
                dispatch({ type: 'declareWar', targetId: def, cb, countyId: c.id });
              }}
            >
              Guerre
            </button>
          </div>
        );
      })}
    </div>
  );
}

function SiegeCard({ game, armyId }: { game: GameState; armyId: string }) {
  const dispatch = useStore((s) => s.dispatch);
  const army = game.armies[armyId];
  const c = game.counties[army.location];
  const required = BALANCE.war.siegeBase + fortLevel(c);
  const progress = Math.min(required, c.siege?.progress ?? 0);
  const chance = Math.round(negotiateChance(game, armyId) * 100);
  const negotiated = army.negotiated === army.location;
  return (
    <div className="card">
      <h3>Siège de {c.name}</h3>
      <div className="row small">
        <span className="grow">Progression</span>
        <b>
          {progress} / {required} saison(s)
        </b>
      </div>
      <Bar value={progress} max={required} color="var(--accent)" />
      <p className="small muted" style={{ margin: '6px 0 8px' }}>
        Choisissez comment mener le siège :
      </p>
      <div className="siege-modes">
        <button
          className={`btn small${army.assault ? ' primary' : ''}`}
          onClick={() => dispatch({ type: 'assault', armyId })}
        >
          ⚔️ Assaut
          <span className="small">prise immédiate, pertes lourdes</span>
        </button>
        <button
          className={`btn small${army.siegeMode === 'blocus' ? ' primary' : ''}`}
          onClick={() =>
            dispatch({
              type: 'siegeMode',
              armyId,
              mode: army.siegeMode === 'blocus' ? undefined : 'blocus',
            })
          }
        >
          🛡️ Blocus
          <span className="small">usure −30 %</span>
        </button>
        <button
          className={`btn small${army.siegeMode === 'negocier' ? ' primary' : ''}`}
          disabled={negotiated}
          onClick={() =>
            dispatch({
              type: 'siegeMode',
              armyId,
              mode: army.siegeMode === 'negocier' ? undefined : 'negocier',
            })
          }
        >
          🕊️ Négocier
          <span className="small">
            {negotiated ? 'déjà tenté' : `${chance} %, ${BALANCE.siege.negotiateGold} or`}
          </span>
        </button>
      </div>
    </div>
  );
}

function MercCard({ game }: { game: GameState }) {
  const dispatch = useStore((s) => s.dispatch);
  const pl = game.playerId;
  const contracts = (game.mercenaries ?? []).filter((m) => m.ownerId === pl);
  return (
    <div className="card">
      <CardTitle
        help={`Disponibles tout de suite, pour ${BALANCE.mercenaries.contractSeasons} saisons. Leur solde s’ajoute à l’entretien des troupes.`}
      >
        Mercenaires
      </CardTitle>
      {MERCENARIES.map((m) => {
        const contract = contracts.find((x) => x.id === m.id);
        const chk = mercCheck(game, pl, m.id);
        return (
          <div key={m.id} className="list-item">
            <div className="grow">
              <b>{m.name}</b>
              <div className="small muted">
                {m.origin} ·{' '}
                {(Object.entries(m.men) as [UnitType, number][])
                  .map(([u, n]) => `${UNITS[u].short} ${n / 100}`)
                  .join(' · ')}
              </div>
              <div className="small">
                {contract ? (
                  <span className="good">
                    Sous contrat ({contract.until - game.turn} saison(s) restantes)
                  </span>
                ) : (
                  <>
                    {m.description}
                    {!chk.ok && <span className="bad"> · {chk.reason}</span>}
                  </>
                )}
              </div>
            </div>
            {!contract && (
              <button
                className="btn small"
                disabled={!chk.ok}
                onClick={() => dispatch({ type: 'hireMercenaries', id: m.id })}
              >
                {m.cost} or
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}
