/** Fiche d'un royaume : souverain, ligne de succession, prétendants, influence du joueur. */
import { BALANCE } from '../../data/balance';
import { TRAITS } from '../../data/traits';
import { ageOf, allied, displayName, opinion } from '../../engine/characters';
import { claimsOnHouse, hasFamilyPact, hasSuccessionPact, unionsOf } from '../../engine/crowns';
import { populationOf } from '../../engine/economy/local';
import {
  acclaimThreshold,
  acclaimedHeir,
  influenceOf,
  kinLabel,
  successionLine,
  supportOf,
} from '../../engine/influence';
import { capitalOf, domainCounties, hasCourt, realmName } from '../../engine/realm';
import type { Character, GameState } from '../../engine/state';
import { militaryStrength } from '../../engine/war';
import { useStore } from '../store';
import { fmtPop } from './Capital';
import { Bar, HouseArms, CountyLink, Portrait, Sheet, signed } from './common';
import { GOVERNMENTS, SUCCESSION_LAWS } from '../../data/governments';
import { governmentOf } from '../../engine/government';

const I = BALANCE.influence;

function PersonRow({
  game,
  ruler,
  c,
  rank,
  supported,
  canSupport,
}: {
  game: GameState;
  ruler: Character;
  c: Character;
  rank?: number;
  supported: boolean;
  canSupport: boolean;
}) {
  const inspect = useStore((s) => s.inspect);
  const dispatch = useStore((s) => s.dispatch);
  const pl = game.playerId;
  const traits = c.traits
    .map((t) => TRAITS[t]?.name)
    .filter(Boolean)
    .slice(0, 3)
    .join(', ');
  return (
    <div className={`realm-person${supported ? ' supported' : ''}`}>
      <button className="realm-person-main" onClick={() => inspect({ kind: 'perso', id: c.id })}>
        {rank !== undefined && <span className="realm-rank">{rank}</span>}
        <Portrait state={game} c={c} size={40} />
        <span className="grow">
          <b>{c.id === pl ? 'Vous' : displayName(game, c)}</b>
          <span className="small muted">
            {kinLabel(game, ruler, c)} · {ageOf(game, c)} ans
            {traits ? ` · ${traits}` : ''}
            {c.id !== pl ? ` · opinion ${signed(opinion(game, c.id, pl))}` : ''}
          </span>
        </span>
      </button>
      {canSupport && (
        <button
          className={`btn small${supported ? ' primary' : ' ghost'}`}
          onClick={() =>
            dispatch({
              type: 'supportHeir',
              rulerId: ruler.id,
              candidateId: supported ? undefined : c.id,
            })
          }
        >
          {supported ? 'Soutenu ✓' : 'Soutenir'}
        </button>
      )}
    </div>
  );
}

export function RealmSheet({ game }: { game: GameState }) {
  const id = useStore((s) => s.realmSheet);
  const close = useStore((s) => s.setRealmSheet);
  const dispatch = useStore((s) => s.dispatch);
  const inspect = useStore((s) => s.inspect);
  if (!id) return null;
  const r = game.characters[id];
  if (!r?.alive || !hasCourt(game, id)) return null;
  const pl = game.playerId;
  const mine = id === pl;
  const dyn = r.dynastyId ? game.dynasties[r.dynastyId] : undefined;
  const counties = domainCounties(game, id);
  const pop = counties.reduce((s, c) => s + populationOf(c), 0);
  const cap = capitalOf(game, id);
  const claimants = claimsOnHouse(game, id);
  const points = influenceOf(game, id);
  const support = supportOf(game, id);
  const supported = support ? game.characters[support] : undefined;
  const seat = game.council.chancelier;
  const chancellorOn = seat.task === 'influence' && seat.targetId === id && !!seat.holderId;
  const unions = unionsOf(game, id);
  const law = `${SUCCESSION_LAWS[r.successionLaw].name}${r.agnatic ? ', agnatique' : ''}`;
  return (
    <Sheet onClose={() => close(null)}>
      <div className="row">
        {dyn && <HouseArms dyn={dyn} size={44} />}
        <div className="grow">
          <h2 style={{ margin: 0 }}>{realmName(game, id)}</h2>
          <div className="small muted">
            {counties.length} comtés · {fmtPop(pop)} âmes
            {cap ? (
              <>
                {' '}
                · capitale <CountyLink state={game} id={cap.id} />
              </>
            ) : null}
          </div>
        </div>
      </div>

      <h3 className="settings-title">Souverain</h3>
      <div className="settings-group trade-box">
        <PersonRow game={game} ruler={r} c={r} supported={false} canSupport={false} />
        <dl className="kv" style={{ marginTop: 6 }}>
          <dt>Maison</dt>
          <dd>{dyn?.name ?? '—'}</dd>
          <dt>Gouvernement</dt>
          <dd>{GOVERNMENTS[governmentOf(game, id)].name}</dd>
          <dt>Loi de succession</dt>
          <dd>{law}</dd>
          {!mine && (
            <>
              <dt>Force militaire</dt>
              <dd>
                {(militaryStrength(game, id) / Math.max(1, militaryStrength(game, pl))).toFixed(1)}×
                la vôtre
              </dd>
            </>
          )}
          {unions.length > 0 && (
            <>
              <dt>Couronnes réunies</dt>
              <dd>{unions.map((u) => u.name).join(', ')}</dd>
            </>
          )}
          {!mine && (
            <>
              <dt>Avec vous</dt>
              <dd>
                {[
                  allied(game, pl, id) && 'alliance',
                  hasFamilyPact(game, pl, id) && 'pacte de famille',
                  hasSuccessionPact(game, pl, id) && 'pacte successoral',
                ]
                  .filter(Boolean)
                  .join(', ') || '—'}{' '}
                · opinion {signed(opinion(game, id, pl))}
              </dd>
            </>
          )}
        </dl>
      </div>

      <SuccessionSection game={game} id={id} />

      {!mine && (
        <div className="card" style={{ marginTop: 12 }}>
          <b>Votre influence à cette cour</b>
          <div className="row small" style={{ marginTop: 6 }}>
            <span className="grow muted">Influence</span>
            <b>
              {Math.round(points)} / {I.max}
            </b>
          </div>
          <Bar value={points} max={I.max} color="var(--gold)" />
          <p className="small muted" style={{ margin: '6px 0' }}>
            Elle facilite mariages, alliances, pactes et traités avec cette cour, et permet de faire
            acclamer un candidat à la mort du souverain : {I.supportThreshold} pour un héritier de
            la ligne, {I.outsiderThreshold} pour un prétendant d’une autre maison. Elle s’érode de{' '}
            {I.decay} par saison.
          </p>
          {supported && (
            <p className="small" style={{ margin: '0 0 6px' }}>
              Candidat soutenu : <b>{displayName(game, supported)}</b> —{' '}
              {points >= acclaimThreshold(game, id, supported.id) ? (
                <span className="good">serait acclamé</span>
              ) : (
                <span className="warn">
                  il faut {acclaimThreshold(game, id, supported.id)} d’influence
                </span>
              )}
              .
            </p>
          )}
          <div className="row wrap" style={{ gap: 6 }}>
            <button
              className="btn small"
              disabled={game.characters[pl].gold < I.courtGold}
              onClick={() => dispatch({ type: 'courtGrandees', rulerId: id })}
            >
              Courtiser les Grands ({I.courtGold} or, +{I.courtGain})
            </button>
            {seat.holderId && (
              <button
                className={`btn small${chancellorOn ? ' primary' : ' ghost'}`}
                disabled={chancellorOn}
                onClick={() =>
                  dispatch({
                    type: 'setCouncil',
                    post: 'chancelier',
                    holderId: seat.holderId,
                    task: 'influence',
                    targetId: id,
                  })
                }
              >
                {chancellorOn ? 'Le chancelier y œuvre ✓' : 'Y envoyer le chancelier'}
              </button>
            )}
          </div>
          <p className="tiny muted" style={{ margin: '6px 0 0' }}>
            Gagnée aussi par les cadeaux (+{I.giftGain}) et les liens de famille (+{I.familyTie} par
            saison).
          </p>
        </div>
      )}
      {mine && claimants.length === 0 && (
        <p className="small muted">Aucun prétendant ne conteste votre maison.</p>
      )}
      <button
        className="btn block ghost"
        style={{ marginTop: 10 }}
        onClick={() => inspect({ kind: 'perso', id })}
      >
        Fiche détaillée du souverain ›
      </button>
    </Sheet>
  );
}

/**
 * Ligne de succession et prétendants d'un royaume. Pour le joueur : Royaume › Lois ;
 * pour une autre cour : sa fiche de royaume (avec le soutien d'un candidat).
 */
export function SuccessionSection({ game, id }: { game: GameState; id: string }) {
  const r = game.characters[id];
  const pl = game.playerId;
  const mine = id === pl;
  const line = successionLine(game, id);
  const claimants = claimsOnHouse(game, id);
  const support = supportOf(game, id);
  const acclaimed = mine ? undefined : acclaimedHeir(game, r);
  const nextRuler = acclaimed ?? line[0];
  return (
    <>
      <h3 className="settings-title">Ligne de succession</h3>
      <div className="settings-group trade-box">
        {nextRuler ? (
          <p className="small" style={{ margin: '0 0 6px' }}>
            {acclaimed && acclaimed.id !== line[0]?.id ? (
              <>
                Les Grands acclameraient <b>{displayName(game, acclaimed)}</b>, votre candidat,
                plutôt que {line[0] ? displayName(game, line[0]) : 'l’héritier'}.
              </>
            ) : (
              <>
                Héritier attendu : <b>{displayName(game, nextRuler)}</b>
                {r.successionLaw === 'partage' && line.length > 1
                  ? ' (les cadets recevront une part des comtés)'
                  : ''}
                .
              </>
            )}
          </p>
        ) : (
          <p className="small bad" style={{ margin: '0 0 6px' }}>
            Aucun héritier : la maison risque de s’éteindre.
          </p>
        )}
        {line.map((c, i) => (
          <PersonRow
            key={c.id}
            game={game}
            ruler={r}
            c={c}
            rank={i + 1}
            supported={support === c.id}
            canSupport={!mine}
          />
        ))}
      </div>

      {claimants.length > 0 && (
        <>
          <h3 className="settings-title">Prétendants</h3>
          <div className="settings-group trade-box">
            {claimants.map((x) => {
              const c = game.characters[x.claimantId];
              return (
                <div key={c.id}>
                  <PersonRow
                    game={game}
                    ruler={r}
                    c={c}
                    supported={support === c.id}
                    canSupport={!mine}
                  />
                  <p className="tiny muted" style={{ margin: '0 0 6px 50px' }}>
                    Droit {x.strong ? 'fort' : 'faible'}
                    {x.reasons.length ? ` : ${x.reasons.join(', ')}` : ''}
                  </p>
                </div>
              );
            })}
          </div>
        </>
      )}
    </>
  );
}
