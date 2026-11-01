/** Entourage : cour et salaires, candidats de passage, pupilles, débauchage, trésorier. */
import { useState } from 'react';
import { BALANCE } from '../../data/balance';
import { ageOf, displayName, isAdult } from '../../engine/characters';
import type { Acceptance } from '../../engine/diplomacy';
import {
  candidateAcceptance,
  chanceOf,
  courtCapacity,
  courtierFee,
  courtierWage,
  courtRoster,
  poachAcceptance,
  poachTargets,
  rallyAcceptance,
  wardAcceptance,
  wardCandidates,
  wardsAtCourt,
} from '../../engine/entourage';
import { economyOf } from '../../engine/realm';
import type { Character, GameState } from '../../engine/state';
import { useStore } from '../store';
import { Bar, CharLine, Portrait, Segmented, Skills, TraitChips, signed } from './common';

const E = BALANCE.entourage;

/** Détail d'une acceptation : verdict ou chance, puis facteurs. */
export function Factors({
  acc,
  probabilistic,
}: {
  acc: Acceptance;
  /** Résolution tirée au sort : afficher une chance plutôt qu'un verdict. */
  probabilistic?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const verdict = acc.blocked
    ? `Impossible : ${acc.blocked}`
    : probabilistic
      ? `Chance : ${Math.round(chanceOf(acc.score) * 100)} %`
      : acc.accept
        ? `Acceptera (${signed(acc.score)})`
        : `Refusera (${signed(acc.score)})`;
  const good = !acc.blocked && (probabilistic ? chanceOf(acc.score) >= 0.5 : acc.accept);
  return (
    <div className="small" style={{ marginTop: 4 }}>
      <button className="link" onClick={() => setOpen(!open)} aria-expanded={open}>
        <b className={good ? 'good' : 'bad'}>{verdict}</b> {open ? '▴' : '▾'}
      </button>
      {open &&
        !acc.blocked &&
        acc.factors.map((f, i) => (
          <div key={i} className="row">
            <span className="muted grow">{f.label}</span>
            <span>{signed(f.value)}</span>
          </div>
        ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Cour du joueur
// ---------------------------------------------------------------------------

export function CourtCard({ game }: { game: GameState }) {
  const dispatch = useStore((s) => s.dispatch);
  const [confirm, setConfirm] = useState<string | null>(null);
  const roster = courtRoster(game, game.playerId);
  const cap = courtCapacity(game, game.playerId);
  const paid = roster.filter((e) => !e.free);
  const payroll = paid.reduce((s, e) => s + e.wage, 0);
  return (
    <div className="card">
      <h3>Cour</h3>
      <div className="row small">
        <span className="grow muted">Courtisans extérieurs</span>
        <b>
          {roster.length} · {Math.min(roster.length, cap)} / {cap} places gratuites
        </b>
      </div>
      <Bar value={Math.min(roster.length, cap)} max={Math.max(1, cap)} color="var(--gold)" />
      <p className="small muted" style={{ margin: '6px 0 8px' }}>
        {paid.length > 0
          ? `${paid.length} courtisan(s) au-delà des places gratuites : salaires ${payroll.toFixed(1)} or par saison.`
          : 'La cour tient dans les places gratuites : aucun salaire. Les places viennent avec le rang et la Gestion.'}
      </p>
      {roster.length === 0 && (
        <p className="muted">Personne à votre service. Recrutez ci-dessous.</p>
      )}
      {roster.map((e) => (
        <div key={e.c.id} className="court-row">
          <CharLine
            state={game}
            c={e.c}
            extra={
              <>
                {e.council ? 'conseil · ' : ''}
                {e.free ? (
                  'gratuit'
                ) : (
                  <b className="warn">{courtierWage(e.c).toFixed(1)} or/saison</b>
                )}
              </>
            }
          />
          <button
            className={`btn small${confirm === e.c.id ? ' danger' : ' ghost'}`}
            onClick={() => {
              if (confirm !== e.c.id) {
                setConfirm(e.c.id);
                return;
              }
              setConfirm(null);
              dispatch({ type: 'dismissCourtier', id: e.c.id });
            }}
          >
            {confirm === e.c.id ? 'Confirmer' : 'Congédier'}
          </button>
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Candidats de passage
// ---------------------------------------------------------------------------

export function CandidatesCard({ game }: { game: GameState }) {
  const dispatch = useStore((s) => s.dispatch);
  const list = game.candidates ?? [];
  return (
    <div className="card">
      <h3>Candidats de passage</h3>
      <p className="small muted">
        De nouveaux visages se présentent chaque printemps. Une prime d’engagement, puis un salaire
        si la cour dépasse ses places gratuites. Les talents très recherchés exigent du prestige.
      </p>
      {list.length === 0 && <p className="muted">Personne ne se présente pour l’instant.</p>}
      {list.map((cand) => {
        const c = game.characters[cand.id];
        if (!c) return null;
        const acc = candidateAcceptance(game, cand);
        const left = Math.max(0, cand.until - game.turn);
        return (
          <div key={cand.id} className="candidate">
            <div className="row">
              <Portrait state={game} c={c} size={52} />
              <div className="grow">
                <b>{displayName(game, c)}</b>
                <div className="small muted">
                  {cand.profile} · {cand.origin} · {ageOf(game, c)} ans
                </div>
              </div>
              <span className="small muted">{left} saison(s)</span>
            </div>
            <div style={{ margin: '8px 0 4px' }}>
              <Skills c={c} />
            </div>
            <TraitChips c={c} />
            <Factors acc={acc} />
            <div className="row" style={{ marginTop: 6 }}>
              <span className="small muted grow">
                Prime {cand.fee} or · salaire ensuite {courtierWage(c).toFixed(1)} or/saison au-delà
                des places gratuites
              </span>
              <button
                className="btn small primary"
                disabled={!!acc.blocked}
                onClick={() => dispatch({ type: 'inviteCandidate', id: cand.id })}
              >
                Engager ({cand.fee})
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Pupilles
// ---------------------------------------------------------------------------

export function WardsCard({ game }: { game: GameState }) {
  const dispatch = useStore((s) => s.dispatch);
  const here = wardsAtCourt(game);
  const options = wardCandidates(game);
  if (!here.length && !options.length) return null;
  return (
    <div className="card">
      <h3>Pupilles</h3>
      <p className="small muted">
        Les enfants de vos vassaux peuvent grandir à votre cour : ils sont éduqués par vos
        courtisans, le vassal vous en est reconnaissant (+{E.ward.vassalOpinion} d’opinion tant que
        l’enfant reste), et à seize ans vous décidez de son avenir.
      </p>
      {here.map((k) => (
        <CharLine key={k.id} state={game} c={k} extra="pupille à votre cour" />
      ))}
      {options.slice(0, 8).map(({ vassal, child }) => {
        const acc = wardAcceptance(game, child.id);
        return (
          <div key={child.id} className="court-row">
            <CharLine
              state={game}
              c={child}
              extra={
                <>
                  {child.female ? 'fille' : 'fils'} de {vassal.name}
                </>
              }
            />
            <div className="col" style={{ alignItems: 'flex-end', gap: 2 }}>
              <button
                className="btn small"
                disabled={!!acc.blocked}
                onClick={() => dispatch({ type: 'requestWard', childId: child.id })}
              >
                Demander
              </button>
              <Factors acc={acc} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Débauchage chez un rival (fiche d'un souverain)
// ---------------------------------------------------------------------------

export function PoachCard({ game, rulerId }: { game: GameState; rulerId: string }) {
  const dispatch = useStore((s) => s.dispatch);
  const group = poachTargets(game).find((g) => g.ruler.id === rulerId);
  if (!group) return null;
  return (
    <div className="card">
      <b>Débaucher un courtisan</b>
      <p className="small muted">
        Une offre peut échouer, et {group.ruler.name} n’aime pas qu’on lui prenne ses gens.
      </p>
      {group.members.slice(0, 5).map((m) => {
        const acc = poachAcceptance(game, m.id);
        return (
          <div key={m.id} className="court-row">
            <CharLine state={game} c={m} extra={`prime ${courtierFee(m)} or`} />
            <div className="col" style={{ alignItems: 'flex-end', gap: 2 }}>
              <button
                className="btn small"
                disabled={!!acc.blocked}
                onClick={() => dispatch({ type: 'poachCourtier', id: m.id })}
              >
                Débaucher
              </button>
              <Factors acc={acc} probabilistic />
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Actions dans la fiche d'un personnage
// ---------------------------------------------------------------------------

/** Actions de cour possibles sur un personnage. */
export function courtActionKinds(game: GameState, c: Character): ('rally' | 'poach' | 'ward')[] {
  if (!c.alive || c.id === game.playerId) return [];
  const kinds: ('rally' | 'poach' | 'ward')[] = [];
  if (c.imprisonedBy === game.playerId) kinds.push('rally');
  const poach = poachAcceptance(game, c.id);
  if (!poach.blocked || /Il faut/.test(poach.blocked)) kinds.push('poach');
  if (!isAdult(game, c)) {
    const w = wardAcceptance(game, c.id);
    if (!w.blocked || w.blocked === 'Il conteste votre autorité') kinds.push('ward');
  }
  return kinds;
}

/** Débaucher, rallier ou demander comme pupille, selon le personnage. */
export function CourtActions({ game, c }: { game: GameState; c: Character }) {
  const dispatch = useStore((s) => s.dispatch);
  const kinds = courtActionKinds(game, c);
  return (
    <>
      {kinds.includes('rally') && (
        <div className="court-action">
          <div className="row">
            <span className="grow">
              <b>Rallier à votre cause</b>
              <span className="small muted"> · {E.rally.fee} or, une seule tentative</span>
            </span>
            <button
              className="btn small"
              disabled={!!rallyAcceptance(game, c.id).blocked}
              onClick={() => dispatch({ type: 'rallyPrisoner', id: c.id })}
            >
              Proposer
            </button>
          </div>
          <Factors acc={rallyAcceptance(game, c.id)} probabilistic />
        </div>
      )}
      {kinds.includes('poach') && (
        <div className="court-action">
          <div className="row">
            <span className="grow">
              <b>Débaucher</b>
              <span className="small muted"> · prime {courtierFee(c)} or</span>
            </span>
            <button
              className="btn small"
              disabled={!!poachAcceptance(game, c.id).blocked}
              onClick={() => dispatch({ type: 'poachCourtier', id: c.id })}
            >
              Faire une offre
            </button>
          </div>
          <Factors acc={poachAcceptance(game, c.id)} probabilistic />
        </div>
      )}
      {kinds.includes('ward') && (
        <div className="court-action">
          <div className="row">
            <span className="grow">
              <b>Demander comme pupille</b>
            </span>
            <button
              className="btn small"
              disabled={!!wardAcceptance(game, c.id).blocked}
              onClick={() => dispatch({ type: 'requestWard', childId: c.id })}
            >
              Demander
            </button>
          </div>
          <Factors acc={wardAcceptance(game, c.id)} />
        </div>
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// Trésorier (vue Économie)
// ---------------------------------------------------------------------------

export function TreasuryCard({ game }: { game: GameState }) {
  const dispatch = useStore((s) => s.dispatch);
  const policy = game.treasury ?? 'prudent';
  const eco = economyOf(game, game.playerId);
  const roster = courtRoster(game, game.playerId);
  const wage = roster.filter((e) => !e.free).reduce((s, e) => s + e.wage, 0);
  return (
    <div className="card">
      <h3>Trésorier</h3>
      <Segmented
        options={[
          { value: 'prudent' as const, label: 'Prudent' },
          { value: 'manuel' as const, label: 'Manuel' },
        ]}
        value={policy}
        onChange={(v) => dispatch({ type: 'setTreasury', policy: v })}
      />
      <p className="small muted" style={{ margin: '6px 0 0' }}>
        {policy === 'prudent'
          ? 'Quand l’or prévu passe sous zéro, le trésorier relève les impôts des comtés contents, puis laisse partir le courtisan payé le moins utile. Une mesure par saison.'
          : 'Aucune mesure automatique. Seuls les impayés font partir un courtisan par saison tant que le trésor est négatif.'}
      </p>
      <dl className="kv" style={{ marginTop: 8 }}>
        <dt>Solde prévu</dt>
        <dd className={eco.goldNet >= 0 ? 'good' : 'bad'}>
          {signed(Math.round(eco.goldNet * 10) / 10)} or / saison
        </dd>
        <dt>Salaires de la cour</dt>
        <dd>{wage > 0 ? `${wage.toFixed(1)} or / saison` : 'aucun'}</dd>
      </dl>
    </div>
  );
}
