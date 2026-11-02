/** Arranger un mariage : choix du membre de la famille, du parti, des clauses et de la dot. */
import { useState } from 'react';
import {
  allied,
  closeFamily,
  displayName,
  isAdult,
  skillsOf,
  topLiege,
} from '../../engine/characters';
import { independentRulers } from '../../engine/realm';
import { marriageAcceptance, marriageCandidates, type Acceptance } from '../../engine/diplomacy';
import type { MarriageClause } from '../../engine/crowns';
import { SKILL_KEYS, type Character, type GameState } from '../../engine/state';
import { useStore } from '../store';
import { MarriageClauses } from './Crowns';
import { AcceptanceView } from './Diplomacy';
import { CharLine, Sheet } from './common';

/** Membres de la maison qui peuvent être mariés (le souverain compris). */
export function marriageableKin(game: GameState): Character[] {
  const p = game.characters[game.playerId];
  return [p, ...closeFamily(game, p)].filter(
    (c) => !c.spouseId && isAdult(game, c) && c.dynastyId === game.playerDynastyId,
  );
}

type MarriageSort = 'rang' | 'acceptation' | 'competences' | 'age' | 'interet';
const SORT_LABELS: Record<MarriageSort, string> = {
  rang: 'Rang de la cour',
  acceptation: 'Chance d’acceptation',
  competences: 'Compétences',
  age: 'Âge (plus jeunes d’abord)',
  interet: 'Intérêt diplomatique',
};

interface Match {
  c: Character;
  acc: Acceptance;
  skills: number;
  tags: string[];
  interest: number;
}

/**
 * Partis triés : rang de leur cour (ordre du moteur), chance d'acceptation, total des
 * compétences, âge, ou intérêt diplomatique (alliance possible, famille régnante, droits par le
 * sang pour les enfants d'une princesse étrangère).
 */
function sortMatches(
  game: GameState,
  who: Character,
  list: Character[],
  sort: MarriageSort,
): Match[] {
  const pl = game.playerId;
  const rulers = independentRulers(game);
  const ruling = new Set(rulers.map((r) => game.characters[r]?.dynastyId).filter(Boolean));
  const matches = list.map((c, i): Match & { i: number } => {
    const court = topLiege(game, c.id);
    const tags: string[] = [];
    let interest = 0;
    if (court !== pl && rulers.includes(court) && !allied(game, pl, court)) {
      tags.push('alliance possible');
      interest += 1;
    }
    if (c.dynastyId && ruling.has(c.dynastyId)) {
      tags.push('famille régnante');
      interest += 2;
      if (c.female && !who.female) {
        tags.push('droits par le sang');
        interest += 2;
      }
    }
    const sk = skillsOf(c);
    const skills = SKILL_KEYS.reduce((sum, k) => sum + sk[k], 0);
    return { c, acc: marriageAcceptance(game, who, c), skills, tags, interest, i };
  });
  const by: Record<
    MarriageSort,
    (a: (typeof matches)[number], b: (typeof matches)[number]) => number
  > = {
    rang: (a, b) => a.i - b.i,
    acceptation: (a, b) =>
      Number(!!a.acc.blocked) - Number(!!b.acc.blocked) || b.acc.score - a.acc.score,
    competences: (a, b) => b.skills - a.skills,
    age: (a, b) => b.c.birthTurn - a.c.birthTurn,
    interet: (a, b) => b.interest - a.interest || a.i - b.i,
  };
  return [...matches].sort(by[sort]);
}

export function MarriageSheet({
  game,
  onClose,
  whoId,
}: {
  game: GameState;
  onClose: () => void;
  /** Membre de la famille à marier, choisi d'avance (bouton « Marier » d'une ligne). */
  whoId?: string;
}) {
  const dispatch = useStore((s) => s.dispatch);
  const p = game.characters[game.playerId];
  const singles = marriageableKin(game);
  const [who, setWho] = useState<Character | null>(
    (whoId ? singles.find((c) => c.id === whoId) : undefined) ?? singles[0] ?? null,
  );
  const [target, setTarget] = useState<Character | null>(null);
  const [clause, setClause] = useState<MarriageClause>('aucune');
  const [dowry, setDowry] = useState(0);
  const [sort, setSort] = useState<MarriageSort>('rang');
  const cands = who ? sortMatches(game, who, marriageCandidates(game, who), sort) : [];
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
      {who && !target && cands.length > 0 && (
        <label className="row small match-sort">
          <span className="muted">Trier par</span>
          <select
            className="select grow"
            value={sort}
            onChange={(e) => setSort(e.target.value as MarriageSort)}
          >
            {(Object.keys(SORT_LABELS) as MarriageSort[]).map((k) => (
              <option key={k} value={k}>
                {SORT_LABELS[k]}
              </option>
            ))}
          </select>
        </label>
      )}
      {who &&
        !target &&
        cands.map(({ c, acc, skills, tags }) => (
          <CharLine
            key={c.id}
            state={game}
            c={c}
            onTap={() => setTarget(c)}
            extra={
              <>
                cour de {game.characters[topLiege(game, c.id)]?.name} · compétences {skills} ·{' '}
                <span className={acc.blocked ? 'bad' : acc.accept ? 'good' : 'warn'}>
                  {acc.blocked ? 'impossible' : acc.accept ? 'accepterait' : 'hésite'}
                </span>
                {tags.length > 0 && (
                  <span className="match-tags">
                    {tags.map((t) => (
                      <span key={t} className="chip tiny">
                        {t}
                      </span>
                    ))}
                  </span>
                )}
              </>
            }
          />
        ))}
      {who && target && (
        <div className="card" style={{ marginTop: 10 }}>
          <b>
            {who.name} ⚭ {displayName(game, target)}
          </b>
          <MarriageClauses
            clause={clause}
            dowry={dowry}
            maxGold={Math.max(0, Math.floor(game.characters[game.playerId].gold / 10) * 10)}
            onChange={(c, d) => {
              setClause(c);
              setDowry(d);
            }}
          />
          <AcceptanceView acc={marriageAcceptance(game, who, target, clause, dowry)} />
          <div className="row" style={{ marginTop: 8 }}>
            <button className="btn small ghost" onClick={() => setTarget(null)}>
              Autre parti
            </button>
            <button
              className="btn small primary right"
              onClick={() => {
                dispatch({ type: 'proposeMarriage', aId: who.id, bId: target.id, clause, dowry });
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
