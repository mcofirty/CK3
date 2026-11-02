/** Lois et gouvernement : réformer son gouvernement, changer de loi de succession. */
import { GOVERNMENTS, LAW_COOLDOWN, SUCCESSION_LAWS } from '../../data/governments';
import { ageOf, displayName } from '../../engine/characters';
import { heirsOf } from '../../engine/characters/lifecycle';
import { electionResults, governmentOf } from '../../engine/government';
import { heirUnderLaw, lawCheck, reformCheck, reformsFrom } from '../../engine/laws';
import type { GameState, SuccessionLaw } from '../../engine/state';
import { useStore } from '../store';
import { AgnaticLaw } from './Crowns';
import { CharLink } from './common';

const pct = (x: number) => `${x > 0 ? '+' : ''}${Math.round(x * 100)} %`;
const LAW_ORDER: SuccessionLaw[] = [
  'partage',
  'primogeniture',
  'ultimogeniture',
  'seniorite',
  'elective',
];

/** Effets d'un gouvernement, en une ligne. */
export function governmentEffects(id: keyof typeof GOVERNMENTS): string {
  const g = GOVERNMENTS[id];
  const parts: string[] = [];
  if (g.income) parts.push(`revenus ${pct(g.income)}`);
  if (g.levies) parts.push(`levées ${pct(g.levies)}`);
  if (g.vassalOpinion)
    parts.push(`vassaux ${g.vassalOpinion > 0 ? '+' : ''}${g.vassalOpinion} d’opinion`);
  return parts.join(' · ') || 'ni bonus ni malus';
}

/** Gouvernement et loi de succession du joueur (Royaume › Lois). */
export function LawsBody({ game }: { game: GameState }) {
  const dispatch = useStore((s) => s.dispatch);
  const pl = game.playerId;
  const p = game.characters[pl];
  const govId = governmentOf(game, pl);
  const gov = GOVERNMENTS[govId];
  const reforms = reformsFrom(game, pl);
  const ballot = p.successionLaw === 'elective' ? electionResults(game, p, heirsOf(game, p)) : [];
  const since = p.lawChangedTurn !== undefined ? game.turn - p.lawChangedTurn : undefined;
  return (
    <>
      <div className="card">
        <h3>Gouvernement</h3>
        <b>{gov.name}</b>
        <p className="small" style={{ margin: '4px 0' }}>
          {gov.description}
        </p>
        <p className="small muted" style={{ margin: '0 0 6px' }}>
          {governmentEffects(govId)} · lois permises :{' '}
          {gov.laws.map((l) => SUCCESSION_LAWS[l].name.toLowerCase()).join(', ')}
        </p>
        {reforms.map((r) => {
          const chk = reformCheck(game, pl, r.to);
          return (
            <div key={r.to} className="law-row">
              <div className="grow">
                <b>{r.label}</b>
                <div className="small muted">
                  Devient : {GOVERNMENTS[r.to].name} ({governmentEffects(r.to)}) · {r.prestige}{' '}
                  prestige{r.gold ? `, ${r.gold} or` : ''} · vassaux{' '}
                  {r.vassalOpinion > 0 ? '+' : ''}
                  {r.vassalOpinion}
                </div>
                {!chk.ok && <div className="small warn">{chk.reason}</div>}
              </div>
              <button
                className="btn small"
                disabled={!chk.ok}
                onClick={() => dispatch({ type: 'reformGovernment', to: r.to })}
              >
                Réformer
              </button>
            </div>
          );
        })}
      </div>

      <div className="card">
        <h3>Loi de succession</h3>
        <p className="small muted" style={{ margin: '0 0 6px' }}>
          Changer de loi coûte du prestige, irrite vos vassaux, et ne peut se refaire avant{' '}
          {LAW_COOLDOWN / 4} ans
          {since !== undefined && since < LAW_COOLDOWN
            ? ` (encore ${Math.ceil((LAW_COOLDOWN - since) / 4)} an(s))`
            : ''}
          . L’aperçu indique qui hériterait aujourd’hui.
        </p>
        {LAW_ORDER.map((law) => {
          const def = SUCCESSION_LAWS[law];
          const current = p.successionLaw === law;
          const allowed = gov.laws.includes(law);
          const chk = lawCheck(game, pl, law);
          const heir = heirUnderLaw(game, p, law);
          return (
            <div key={law} className={`law-row${current ? ' current' : ''}`}>
              <div className="grow">
                <b>
                  {def.name}
                  {current ? ' · en vigueur' : ''}
                </b>
                <div className="small">{def.description}</div>
                <div className="small muted">
                  Héritier :{' '}
                  {heir ? (
                    <>
                      <CharLink state={game} id={heir.id} /> ({ageOf(game, heir)} ans)
                    </>
                  ) : (
                    'aucun'
                  )}
                  {!current && allowed ? ` · ${def.cost} prestige` : ''}
                </div>
                {!current && !chk.ok && <div className="small warn">{chk.reason}</div>}
              </div>
              {!current && allowed && (
                <button
                  className="btn small"
                  disabled={!chk.ok}
                  onClick={() => dispatch({ type: 'changeLaw', law })}
                >
                  Adopter
                </button>
              )}
            </div>
          );
        })}
        {ballot.length > 0 && (
          <div style={{ marginTop: 8 }}>
            <b className="small">Si l’élection avait lieu aujourd’hui</b>
            {ballot.slice(0, 4).map((b) => (
              <div key={b.candidateId} className="row small">
                <span className="grow">{displayName(game, game.characters[b.candidateId])}</span>
                <span>
                  {b.votes} voix
                  {b.voters.includes(pl) ? ' (dont la vôtre)' : ''}
                </span>
              </div>
            ))}
            <p className="tiny muted" style={{ margin: '4px 0 0' }}>
              Vous avez 3 voix, chaque vassal une : soignez leur opinion envers votre candidat.
            </p>
          </div>
        )}
        <AgnaticLaw game={game} />
      </div>
    </>
  );
}
