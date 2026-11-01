/** Économie locale : tableau de bord du royaume et fiche économique d'un comté. */
import { BALANCE } from '../../data/balance';
import { EDICTS } from '../../data/edicts';
import { countyLedger, debtOf, edictCheck, loanCap } from '../../engine/economy';
import {
  CONSCRIPTION_LABELS,
  CONSCRIPTION_LEVELS,
  contentmentDelta,
  contentmentOf,
  countyDevMult,
  countyLevyMult,
  isCapital,
  moodOf,
  populationOf,
  revoltChance,
  TAX_LABELS,
  TAX_LEVELS,
} from '../../engine/economy/local';
import { countyMaxLevies, economyOf } from '../../engine/realm';
import { fmtPop, RealmPopulation } from './Capital';
import type { GameState, TaxLevel } from '../../engine/state';
import { useStore } from '../store';
import { Bar, Segmented, signed } from './common';
import { TreasuryCard } from './Entourage';

const L = BALANCE.local;
/** Nombre signé, une décimale si besoin, virgule française. */
const fmt = (n: number) =>
  `${n > 0 ? '+' : '−'}${String(Math.round(Math.abs(n) * 10) / 10).replace('.', ',')}`;
const pct = (m: number) => `${m >= 1 ? '+' : '−'}${Math.round(Math.abs(m - 1) * 100)} %`;

function moodColor(v: number): string {
  if (v >= 75) return 'var(--good)';
  if (v >= 50) return 'var(--gold)';
  if (v >= L.revoltThreshold) return '#d9822b';
  return 'var(--bad)';
}

const TAX_HINT: Record<TaxLevel, string> = {
  faible: `revenus ×${L.taxes.faible.income}, contentement +${L.taxes.faible.contentment}/saison`,
  normal: 'revenus ×1, contentement stable',
  eleve: `revenus ×${L.taxes.eleve.income}, contentement ${L.taxes.eleve.contentment}/saison`,
  ecrasant: `revenus ×${L.taxes.ecrasant.income}, contentement ${L.taxes.ecrasant.contentment}/saison`,
};

// ---------------------------------------------------------------------------
// Fiche d'un comté
// ---------------------------------------------------------------------------

export function CountyEconomy({ game, id }: { game: GameState; id: string }) {
  const dispatch = useStore((s) => s.dispatch);
  const c = game.counties[id];
  const mine = c.holderId === game.playerId;
  const v = contentmentOf(c);
  const mood = moodOf(c);
  const delta = contentmentDelta(game, c);
  const led = countyLedger(game, id);
  const risk = revoltChance(c);
  return (
    <>
      <div className="row small">
        <span className="grow muted">Contentement du peuple</span>
        <b style={{ color: moodColor(v) }}>
          {mood.icon} {mood.label} ({Math.round(v)})
        </b>
      </div>
      <Bar value={v} max={100} color={moodColor(v)} />
      <div className="reasons" style={{ marginTop: 6 }}>
        {delta.reasons.map((r) => (
          <div key={r.label} className="row small">
            <span className="grow">{r.label}</span>
            <b className={r.value >= 0 ? 'good' : 'bad'}>{signed(r.value)}</b>
          </div>
        ))}
        <div className="row small">
          <b className="grow">Par saison</b>
          <b className={delta.total >= 0 ? 'good' : 'bad'}>
            {signed(Math.round(delta.total * 10) / 10)}
          </b>
        </div>
      </div>
      {risk > 0 && (
        <p className="small bad" style={{ margin: '6px 0 0' }}>
          🔥 Risque de révolte : {Math.round(risk * 100)} % par saison.
        </p>
      )}

      <dl className="kv" style={{ marginTop: 10 }}>
        <dt>Revenus de base</dt>
        <dd>{led.base.toFixed(1)} or</dd>
        <dt className="small">· impôts {TAX_LABELS[c.tax ?? 'normal'].toLowerCase()}</dt>
        <dd className="small">{pct(led.taxMult)}</dd>
        <dt className="small">· contentement</dt>
        <dd className="small">{pct(led.contentMult)}</dd>
        {mine && (
          <>
            <dt className="small">· gestion, talents, édits</dt>
            <dd className="small">{pct(led.ruler)}</dd>
            <dt>Rapport au trésor</dt>
            <dd>
              <b>{led.total.toFixed(1)} or / saison</b>
            </dd>
          </>
        )}
        <dt>Levées maximales</dt>
        <dd>{Math.round(countyMaxLevies(c) * countyLevyMult(game, c))} hommes</dd>
        <dt>Croissance du développement</dt>
        <dd>{pct(countyDevMult(game, c))}</dd>
      </dl>

      {mine && (
        <>
          <h4 className="eco-sub">Impôts</h4>
          <Segmented
            options={TAX_LEVELS.map((t) => ({ value: t, label: TAX_LABELS[t] }))}
            value={c.tax ?? 'normal'}
            onChange={(level) => dispatch({ type: 'setTax', countyId: id, level })}
          />
          <p className="small muted" style={{ margin: '4px 0 0' }}>
            {TAX_HINT[c.tax ?? 'normal']}
          </p>
          <h4 className="eco-sub">Conscription</h4>
          <Segmented
            options={CONSCRIPTION_LEVELS.map((t) => ({ value: t, label: CONSCRIPTION_LABELS[t] }))}
            value={c.conscription ?? 'normale'}
            onChange={(level) => dispatch({ type: 'setConscription', countyId: id, level })}
          />
          <p className="small muted" style={{ margin: '4px 0 0' }}>
            Levées ×{L.conscription[c.conscription ?? 'normale'].levies}, contentement{' '}
            {signed(L.conscription[c.conscription ?? 'normale'].contentment)}/saison, développement
            ×{L.conscription[c.conscription ?? 'normale'].development}.
          </p>
        </>
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// Tableau de bord du royaume
// ---------------------------------------------------------------------------

export function EconomyView({ game }: { game: GameState }) {
  const dispatch = useStore((s) => s.dispatch);
  const inspect = useStore((s) => s.inspect);
  const pl = game.playerId;
  const p = game.characters[pl];
  const eco = economyOf(game, pl);
  const own = Object.values(game.counties)
    .filter((c) => c.holderId === pl)
    .sort((a, b) => contentmentOf(a) - contentmentOf(b));
  const avg = own.length ? own.reduce((s, c) => s + contentmentOf(c), 0) / own.length : 0;
  const taxes = own.map((c) => c.tax ?? 'normal');
  const common = taxes.every((t) => t === taxes[0]) ? taxes[0] : null;
  const loans = (game.loans ?? []).filter((l) => l.ownerId === pl);
  const cap = loanCap(game, pl);
  const debt = debtOf(game, pl);
  const active = new Set(game.edicts?.[pl] ?? []);
  return (
    <>
      <div className="card">
        <h3>Trésor</h3>
        <div className="eco-kpis">
          <div>
            <b>{Math.round(p.gold)}</b>
            <span>or</span>
          </div>
          <div>
            <b className={eco.goldNet >= 0 ? 'good' : 'bad'}>
              {signed(Math.round(eco.goldNet * 10) / 10)}
            </b>
            <span>par saison</span>
          </div>
          <div>
            <b>{Math.round(p.gold + eco.goldNet * 4)}</b>
            <span>dans un an</span>
          </div>
        </div>
        <div className="reasons" style={{ marginTop: 8 }}>
          {eco.gold.map((l) => (
            <div key={l.label} className="row small">
              <span className="grow">{l.label}</span>
              <b className={l.value >= 0 ? 'good' : 'bad'}>{signed(l.value)}</b>
            </div>
          ))}
        </div>
      </div>

      <TreasuryCard game={game} />

      <div className="card">
        <h3>Impôts et peuple</h3>
        <RealmPopulation game={game} rulerId={game.playerId} />
        <div className="row small" style={{ marginBottom: 4 }}>
          <span className="grow muted">Contentement moyen du domaine</span>
          <b style={{ color: moodColor(avg) }}>{Math.round(avg)}</b>
        </div>
        <Bar value={avg} max={100} color={moodColor(avg)} />
        <p className="small muted" style={{ margin: '10px 0 6px' }}>
          Impôts dans tout le domaine :
        </p>
        <Segmented
          options={TAX_LEVELS.map((t) => ({ value: t, label: TAX_LABELS[t] }))}
          value={common}
          onChange={(level) => dispatch({ type: 'setTaxAll', level })}
        />
        <p className="small muted" style={{ margin: '4px 0 8px' }}>
          {common ? TAX_HINT[common] : 'Taux différents selon les comtés.'} Sous {L.revoltThreshold}{' '}
          de contentement, le peuple peut se révolter.
        </p>
        {own.map((c) => {
          const v = contentmentOf(c);
          const led = countyLedger(game, c.id);
          const d = contentmentDelta(game, c).total;
          return (
            <button
              key={c.id}
              className="eco-county"
              onClick={() => inspect({ kind: 'comte', id: c.id })}
            >
              <span className="eco-mood">{moodOf(c).icon}</span>
              <span className="grow">
                <span className="row small">
                  <b className="grow">
                    {isCapital(c) ? '★ ' : ''}
                    {c.name}
                  </b>
                  <span>{led.total.toFixed(1)} or</span>
                </span>
                <span className="eco-bar">
                  <span style={{ width: `${v}%`, background: moodColor(v) }} />
                </span>
                <span className="small muted">
                  Impôts {TAX_LABELS[c.tax ?? 'normal'].toLowerCase()} · conscription{' '}
                  {CONSCRIPTION_LABELS[c.conscription ?? 'normale'].toLowerCase()} · {Math.round(v)}{' '}
                  ({signed(Math.round(d * 10) / 10)}) · {fmtPop(populationOf(c))} âmes
                </span>
              </span>
              <span className="muted">›</span>
            </button>
          );
        })}
      </div>

      <div className="card">
        <h3>Édits du royaume</h3>
        <p className="small muted">
          Des politiques pour tout le domaine. Abroger un édit est gratuit, mais il ne peut être
          proclamé à nouveau tout de suite.
        </p>
        {EDICTS.map((e) => {
          const chk = edictCheck(game, pl, e.id);
          const on = active.has(e.id);
          const fx = [
            e.income
              ? `revenus ${e.income > 0 ? '+' : '−'}${Math.round(Math.abs(e.income) * 100)} %`
              : '',
            e.contentment ? `contentement ${fmt(e.contentment)}/saison` : '',
            e.development
              ? `développement ${e.development > 0 ? '+' : '−'}${Math.round(Math.abs(e.development) * 100)} %`
              : '',
            e.levies ? `levées +${Math.round(e.levies * 100)} %` : '',
            e.piety ? `piété +${e.piety}/saison` : '',
            e.upkeep ? `entretien ${e.upkeep} or/saison` : '',
          ].filter(Boolean);
          return (
            <div key={e.id} className={`list-item decision${on ? ' edict-on' : ''}`}>
              <span className="dec-icon">{e.icon}</span>
              <div className="grow">
                <b>{e.name}</b>
                {on && <span className="chip tiny good"> en vigueur</span>}
                <div className="small">{e.description}</div>
                <div className="small muted">
                  {fx.join(' · ')}
                  {!on && ` · proclamation ${e.cost} or`}
                  {!chk.ok && chk.reason && <span className="bad"> · {chk.reason}</span>}
                </div>
              </div>
              <button
                className={`btn small${on ? ' ghost' : ' primary'}`}
                disabled={!chk.ok}
                onClick={() => dispatch({ type: 'toggleEdict', id: e.id })}
              >
                {on ? 'Abroger' : 'Proclamer'}
              </button>
            </div>
          );
        })}
      </div>

      <div className="card">
        <h3>Banquiers</h3>
        <p className="small muted">
          Emprunter donne de l’or tout de suite ; les intérêts ({Math.round(L.loanRate * 100)} % par
          saison) pèsent jusqu’au remboursement. Les dettes passent à l’héritier.
        </p>
        {loans.map((l) => (
          <div key={l.id} className="list-item">
            <div className="grow">
              <b>{l.principal} or</b>
              <div className="small muted">
                Intérêts {(l.principal * l.rate).toFixed(1)} or/saison · depuis{' '}
                {Math.max(0, game.turn - l.turn)} saison(s)
              </div>
            </div>
            <button
              className="btn small"
              disabled={p.gold < l.principal}
              onClick={() => dispatch({ type: 'repayLoan', loanId: l.id })}
            >
              Rembourser
            </button>
          </div>
        ))}
        <p className="small" style={{ margin: '8px 0' }}>
          Dette : <b>{debt} or</b> · encore empruntable : <b>{cap} or</b>
        </p>
        <div className="row wrap">
          {[100, 250]
            .filter((a) => a <= cap)
            .map((a) => (
              <button
                key={a}
                className="btn small"
                onClick={() => dispatch({ type: 'takeLoan', amount: a })}
              >
                Emprunter {a} or
              </button>
            ))}
          {cap >= L.loanMin && (
            <button
              className="btn small"
              onClick={() => dispatch({ type: 'takeLoan', amount: cap })}
            >
              Emprunter le maximum ({cap})
            </button>
          )}
          {cap < L.loanMin && (
            <span className="small muted">Les banquiers ne prêteront pas davantage.</span>
          )}
        </div>
      </div>
    </>
  );
}
