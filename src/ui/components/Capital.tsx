/** Capitale et population d'un comté (fiche de comté). */
import { BALANCE } from '../../data/balance';
import {
  basePopulation,
  isCapital,
  populationOf,
  vitalityOf,
  vitalityTarget,
} from '../../engine/economy/local';
import { canMoveCapital, capitalOccupied, capitalOf, realmCounties } from '../../engine/realm';
import type { County, GameState } from '../../engine/state';
import { useStore } from '../store';
import { Bar, CharLink, CountyLink } from './common';

const C = BALANCE.capital;
const pct = (x: number) => `${Math.round((x - 1) * 100)} %`;
export const fmtPop = (n: number) => n.toLocaleString('fr-FR');

/** Tendance de la population : croissance, stable ou déclin. */
export function popTrend(c: County): { label: string; cls: string } {
  const gap = vitalityTarget(c) - vitalityOf(c);
  if (c.occupation || c.plague) return { label: 'en déclin', cls: 'bad' };
  if (gap > 0.02) return { label: 'en croissance', cls: 'good' };
  if (gap < -0.02) return { label: 'en léger recul', cls: 'warn' };
  return { label: 'stable', cls: '' };
}

export function CapitalSection({ game, c }: { game: GameState; c: County }) {
  const dispatch = useStore((s) => s.dispatch);
  const pl = game.playerId;
  const seat = isCapital(c);
  const mine = c.holderId === pl;
  const v = vitalityOf(c);
  const trend = popTrend(c);
  const myCap = capitalOf(game, pl);
  const move = mine && !seat ? canMoveCapital(game, pl, c.id) : undefined;
  return (
    <section className="ins-section">
      <h3>{seat ? '★ Capitale et population' : 'Population'}</h3>
      <dl className="kv">
        <dt>Population</dt>
        <dd>
          {fmtPop(populationOf(c))} âmes{' '}
          <span className={`small ${trend.cls}`}>({trend.label})</span>
        </dd>
        <dt className="small">· vitalité</dt>
        <dd className="small">
          {Math.round(v * 100)} % (revenus et levées ×{v.toFixed(2)})
        </dd>
        <dt className="small">· sans pertes</dt>
        <dd className="small">{fmtPop(Math.round(basePopulation(c) / 100) * 100)} âmes</dd>
      </dl>
      <Bar
        value={v * 100}
        max={BALANCE.population.vitalityMax * 100}
        color="var(--good, #4f7a3c)"
      />
      <p className="small muted">
        La population suit le développement et le terrain ; épidémies, occupation, pillages et
        famines la font chuter, la paix et le contentement la font remonter.
      </p>
      {seat && (
        <>
          <p className="small">
            Siège de <CharLink state={game} id={c.holderId} /> : revenus et levées +
            {pct(C.incomeMult)}, développement {pct(C.devGrowthMult)} plus rapide (plafond +
            {C.devMaxBonus}), +{C.extraSlots} emplacement, +{C.fort} fortification, population ×
            {BALANCE.population.capitalMult}.
          </p>
          <p className="small muted">
            Occupée, elle coûte {Math.round(C.occupiedIncomeLoss * 100)} % des revenus du domaine et
            rapporte {C.occupationScore} points de guerre à l’ennemi ; tenue {C.capitulateSeasons}{' '}
            saisons, son seigneur est prêt à capituler. Perdue à la paix : {C.lostPrestige}{' '}
            prestige.
          </p>
          {capitalOccupied(game, c.holderId) && (
            <p className="small bad">Capitale occupée : la cour est en déroute.</p>
          )}
        </>
      )}
      {move && (
        <div className="card" style={{ marginTop: 8 }}>
          <b>Établir la capitale ici</b>
          <p className="small muted" style={{ margin: '4px 0' }}>
            {C.moveGold} or et {C.movePrestige} prestige. L’ancienne capitale
            {myCap ? (
              <>
                , <CountyLink state={game} id={myCap.id} />,
              </>
            ) : null}{' '}
            perd ses avantages et grogne ({C.moveOldContentment} contentement). Pas d’autre
            déménagement avant {C.moveCooldownSeasons / 4} ans.
          </p>
          {move.reason && <p className="small warn">{move.reason}</p>}
          <button
            className="btn small"
            disabled={!move.ok}
            onClick={() => dispatch({ type: 'moveCapital', countyId: c.id })}
          >
            Déplacer la cour
          </button>
        </div>
      )}
    </section>
  );
}

/** Résumé du domaine : capitale et population totale. */
export function RealmPopulation({ game, rulerId }: { game: GameState; rulerId: string }) {
  const counties = realmCounties(game, rulerId);
  const total = counties.reduce((s, c) => s + populationOf(c), 0);
  const cap = capitalOf(game, rulerId);
  const fallen = capitalOccupied(game, rulerId);
  return (
    <dl className="kv">
      <dt>Capitale</dt>
      <dd className={fallen ? 'bad' : undefined}>
        {cap ? <CountyLink state={game} id={cap.id} /> : '—'}
        {fallen ? ' (occupée)' : ''}
      </dd>
      <dt>Population du royaume</dt>
      <dd>{fmtPop(total)} âmes</dd>
    </dl>
  );
}
