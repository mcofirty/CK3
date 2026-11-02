/** Prisonniers du joueur : rançon, comté, ralliement, otage, libération, exécution. */
import { useState } from 'react';
import { BALANCE } from '../../data/balance';
import { displayName } from '../../engine/characters';
import { chanceOf, rallyAcceptance } from '../../engine/entourage';
import type { GameState } from '../../engine/state';
import { useStore } from '../store';
import { CardTitle, Tip } from './common';

export function PrisonersCard({ game }: { game: GameState }) {
  const dispatch = useStore((s) => s.dispatch);
  const [confirmExec, setConfirmExec] = useState<string | null>(null);
  const pl = game.playerId;
  const prisoners = Object.values(game.characters).filter((c) => c.alive && c.imprisonedBy === pl);
  if (!prisoners.length) return null;
  return (
    <div className="card" id="focus-prisonniers">
      <CardTitle extra={String(prisoners.length)}>Prisonniers</CardTitle>
      {prisoners.map((c) => {
        const landed = Object.values(game.counties).some((k) => k.holderId === c.id);
        return (
          <div key={c.id} className="list-item" style={{ flexWrap: 'wrap' }}>
            <b className="grow">{displayName(game, c)}</b>
            <button
              className="btn small"
              onClick={() => dispatch({ type: 'ransom', characterId: c.id, kind: 'or' })}
            >
              Rançon en or
            </button>
            {landed && (
              <button
                className="btn small"
                onClick={() => dispatch({ type: 'ransom', characterId: c.id, kind: 'comte' })}
              >
                Exiger un comté
              </button>
            )}
            {!landed && (
              <Tip
                text={`Lui proposer de vous servir (${BALANCE.entourage.rally.fee} or, une seule tentative) : chance ${Math.round(chanceOf(rallyAcceptance(game, c.id).score) * 100)} %.`}
              >
                <button
                  className="btn small"
                  disabled={!!rallyAcceptance(game, c.id).blocked}
                  onClick={() => dispatch({ type: 'rallyPrisoner', id: c.id })}
                >
                  Rallier
                </button>
              </Tip>
            )}
            {!landed && (
              <Tip text="Il vit à votre cour : tant qu’il y reste, sa famille ne peut pas vous attaquer.">
                <button
                  className="btn small"
                  onClick={() => dispatch({ type: 'ransom', characterId: c.id, kind: 'otage' })}
                >
                  Garder en otage
                </button>
              </Tip>
            )}
            <button
              className="btn small ghost"
              onClick={() => dispatch({ type: 'ransom', characterId: c.id, kind: 'liberer' })}
            >
              Libérer
            </button>
            <button
              className={`btn small${confirmExec === c.id ? ' danger' : ' ghost'}`}
              onClick={() => {
                if (confirmExec !== c.id) {
                  setConfirmExec(c.id);
                  return;
                }
                setConfirmExec(null);
                dispatch({ type: 'ransom', characterId: c.id, kind: 'executer' });
              }}
            >
              {confirmExec === c.id ? 'Confirmer l’exécution' : 'Exécuter'}
            </button>
          </div>
        );
      })}
    </div>
  );
}
