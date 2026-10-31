import { useState } from 'react';
import { yearOf } from '../../engine/context';
import type { GameState } from '../../engine/state';
import { downloadExport } from '../../save/storage';
import { useStore } from '../store';

const KIND_ICON: Record<string, string> = {
  naissance: '✶',
  deces: '✝',
  succession: '♛',
  guerre: '⚔',
  bataille: '⚔',
  titre: '♜',
  mariage: '⚭',
  evenement: '✎',
  intrigue: '☾',
  divers: '•',
};

export function ChronicleScreen({ game }: { game: GameState }) {
  const [view, setView] = useState<'chronique' | 'nouvelles'>('chronique');
  const quit = useStore((s) => s.quit);
  const entries = [...game.chronicle].reverse();
  const byYear = new Map<number, typeof entries>();
  for (const e of entries) {
    const y = yearOf(game, e.turn);
    byYear.set(y, [...(byYear.get(y) ?? []), e]);
  }
  return (
    <>
      <div className="segmented" style={{ marginBottom: 12 }}>
        <button
          className={view === 'chronique' ? 'active' : ''}
          onClick={() => setView('chronique')}
        >
          Chronique
        </button>
        <button
          className={view === 'nouvelles' ? 'active' : ''}
          onClick={() => setView('nouvelles')}
        >
          Nouvelles
        </button>
      </div>
      {view === 'chronique' &&
        [...byYear.entries()].map(([y, list]) => (
          <div key={y} className="card">
            <h3>{y}</h3>
            {list.map((e, i) => (
              <p key={i}>
                <span className="muted">{KIND_ICON[e.kind]}</span> {e.text}
              </p>
            ))}
          </div>
        ))}
      {view === 'nouvelles' && (
        <div className="card">
          {game.notifications.length === 0 && <p className="muted">Rien de neuf.</p>}
          {[...game.notifications].reverse().map((n, i) => (
            <p key={i} className="small">
              <b>{yearOf(game, n.turn)}</b> — {n.text}
            </p>
          ))}
        </div>
      )}
      {game.lastBattleReport && (
        <div className="card">
          <h3>Dernière bataille : {game.lastBattleReport.countyName}</h3>
          <p className="small">
            {game.lastBattleReport.attackerName} contre {game.lastBattleReport.defenderName} —{' '}
            <b className={game.lastBattleReport.playerWon ? 'good' : 'bad'}>
              {game.lastBattleReport.playerWon ? 'victoire' : 'défaite'}
            </b>{' '}
            en {game.lastBattleReport.result.rounds} rounds ; pertes{' '}
            {game.lastBattleReport.result.losses.attacker} /{' '}
            {game.lastBattleReport.result.losses.defender}.
          </p>
        </div>
      )}
      <div className="card">
        <h3>Partie</h3>
        <p className="small muted">
          Sauvegarde automatique à chaque fin de saison. Exportez régulièrement pour ne jamais
          perdre votre lignée.
        </p>
        <div className="row wrap">
          <button className="btn" onClick={() => downloadExport(game)}>
            Exporter (JSON)
          </button>
          <button className="btn ghost" onClick={quit}>
            Menu principal
          </button>
        </div>
      </div>
    </>
  );
}
