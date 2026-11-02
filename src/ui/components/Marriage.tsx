/** Arranger un mariage : choix du membre de la famille, du parti, des clauses et de la dot. */
import { useState } from 'react';
import { closeFamily, displayName, isAdult, topLiege } from '../../engine/characters';
import { marriageAcceptance, marriageCandidates } from '../../engine/diplomacy';
import type { MarriageClause } from '../../engine/crowns';
import type { Character, GameState } from '../../engine/state';
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
