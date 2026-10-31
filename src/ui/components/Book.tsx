/** Livre de la dynastie, fins et succès. */
import { yearOf } from '../../engine/context';
import { ACHIEVEMENTS, ENDINGS } from '../../engine/endings';
import type { GameState } from '../../engine/state';
import { displayName } from '../../engine/characters';
import { CharLink, Portrait } from './common';

/** Les souverains successifs de la maison, avec leurs hauts faits. */
export function DynastyBook({ game }: { game: GameState }) {
  const rulers = game.rulers?.length
    ? game.rulers
    : [{ id: game.playerId, from: 0, to: undefined, ambitions: [] }];
  return (
    <div className="book">
      {[...rulers].reverse().map((r, i) => {
        const c = game.characters[r.id];
        if (!c) return null;
        const to = r.to ?? game.turn;
        const deeds = game.chronicle.filter(
          (e) =>
            e.turn >= r.from &&
            e.turn < (r.to ?? Infinity) &&
            ['guerre', 'bataille', 'titre', 'mariage', 'intrigue'].includes(e.kind),
        );
        return (
          <div key={`${r.id}-${r.from}`} className="card book-page">
            <div className="row">
              <Portrait state={game} c={c} size={64} />
              <div className="grow">
                <div className="small muted">
                  {rulers.length - i}
                  {rulers.length - i === 1 ? 'er' : 'e'} souverain
                </div>
                <h3 style={{ margin: 0 }}>{displayName(game, c)}</h3>
                <div className="small">
                  {yearOf(game, r.from)} –{' '}
                  {r.to === undefined && c.alive ? 'aujourd’hui' : yearOf(game, to)}
                  {' · '}
                  {Math.max(0, Math.floor((to - r.from) / 4))} ans de règne
                </div>
              </div>
            </div>
            {r.ambitions.length > 0 && (
              <p className="small" style={{ margin: '8px 0 0' }}>
                🎯 {r.ambitions.join(' · ')}
              </p>
            )}
            {(c.perks?.length ?? 0) > 0 && (
              <p className="small muted" style={{ margin: '4px 0 0' }}>
                {c.perks!.length} talent{c.perks!.length > 1 ? 's' : ''} · {c.traits.length} trait
                {c.traits.length > 1 ? 's' : ''}
              </p>
            )}
            {deeds.length > 0 && (
              <ul className="deeds">
                {deeds.slice(-6).map((e, k) => (
                  <li key={k} className="small">
                    <b>{yearOf(game, e.turn)}</b> — {e.text}
                  </li>
                ))}
              </ul>
            )}
            {deeds.length === 0 && r.ambitions.length === 0 && (
              <p className="small muted" style={{ margin: '8px 0 0' }}>
                Un règne encore sans haut fait.
              </p>
            )}
            {!c.alive && (
              <p className="small muted" style={{ margin: '6px 0 0' }}>
                Mort {c.deathCause ?? ''}. <CharLink state={game} id={c.id} />
              </p>
            )}
          </div>
        );
      })}
    </div>
  );
}

export function AchievementList({ unlocked, current }: { unlocked: string[]; current?: string[] }) {
  const got = new Set(unlocked);
  const now = new Set(current ?? []);
  return (
    <div className="achievements">
      <p className="small muted">
        {got.size} / {ACHIEVEMENTS.length} succès débloqués sur cet appareil.
      </p>
      {ACHIEVEMENTS.map((a) => (
        <div key={a.id} className={`ach${got.has(a.id) ? ' got' : ''}`}>
          <span className="ach-icon">{got.has(a.id) ? a.icon : '🔒'}</span>
          <div className="grow">
            <b>{a.name}</b>
            {now.has(a.id) && <span className="chip tiny good"> cette partie</span>}
            <div className="small muted">{a.description}</div>
          </div>
        </div>
      ))}
    </div>
  );
}

export function EndingBanner({ game }: { game: GameState }) {
  const id = game.gameOver?.ending;
  const e = id ? ENDINGS[id] : undefined;
  if (!e) return null;
  return (
    <div className="card ending">
      <div className="ending-icon">{e.icon}</div>
      <h2 className="center">{e.title}</h2>
      <p className="center">{e.text}</p>
    </div>
  );
}
