/** Recherche : retrouver un personnage, un comté ou un royaume par son nom. */
import { useMemo, useState } from 'react';
import { displayName, topLiege } from '../../engine/characters';
import { countyRuler, independentRulers, realmName, titleOf } from '../../engine/realm';
import type { GameState } from '../../engine/state';
import { useStore } from '../store';
import { Portrait, Sheet } from './common';

/** Minuscules sans accents, pour comparer « Élise » et « elise ». */
export function fold(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

const MAX = 25;

/** Pertinence : le nom commence par la recherche, puis un de ses mots, puis il la contient. */
function rank(name: string, query: string): number {
  const n = fold(name);
  if (n.startsWith(query)) return 0;
  if (n.split(/[\s'’-]+/).some((w) => w.startsWith(query))) return 1;
  return 2;
}

export function SearchSheet({ game, onClose }: { game: GameState; onClose: () => void }) {
  const inspect = useStore((s) => s.inspect);
  const setRealmSheet = useStore((s) => s.setRealmSheet);
  const [q, setQ] = useState('');
  const query = fold(q.trim());
  const rulers = useMemo(() => independentRulers(game), [game]);
  const results = useMemo(() => {
    if (query.length < 2) return null;
    const people = Object.values(game.characters)
      .filter((c) => fold(displayName(game, c)).includes(query))
      .sort(
        (a, b) =>
          Number(b.alive) - Number(a.alive) ||
          rank(displayName(game, a), query) - rank(displayName(game, b), query) ||
          a.name.localeCompare(b.name),
      )
      .slice(0, MAX);
    const counties = Object.values(game.counties)
      .filter((c) => fold(c.name).includes(query))
      .sort((a, b) => rank(a.name, query) - rank(b.name, query) || a.name.localeCompare(b.name))
      .slice(0, MAX);
    const realms = rulers.filter((r) => fold(realmName(game, r)).includes(query));
    return { people, counties, realms };
  }, [game, query, rulers]);
  const none =
    results && !results.people.length && !results.counties.length && !results.realms.length;
  return (
    <Sheet onClose={onClose}>
      <h2>Rechercher</h2>
      <input
        className="select search-input"
        type="search"
        inputMode="search"
        autoFocus
        placeholder="Nom d’un personnage, d’un comté, d’un royaume…"
        aria-label="Rechercher"
        value={q}
        onChange={(e) => setQ(e.target.value)}
      />
      {!results && <p className="small muted">Tapez au moins deux lettres.</p>}
      {none && <p className="small muted">Aucun résultat pour « {q.trim()} ».</p>}
      {results && results.realms.length > 0 && (
        <>
          <h3 className="settings-title">Royaumes</h3>
          {results.realms.map((r) => (
            <button
              key={r}
              className="list-item plain tappable"
              onClick={() => {
                onClose();
                setRealmSheet(r);
              }}
            >
              <span className="grow">
                <b>{realmName(game, r)}</b>
                <span className="small muted"> · {game.characters[r]?.name}</span>
              </span>
              <span className="chev">›</span>
            </button>
          ))}
        </>
      )}
      {results && results.people.length > 0 && (
        <>
          <h3 className="settings-title">Personnages</h3>
          {results.people.map((c) => (
            <button
              key={c.id}
              className="list-item plain tappable"
              onClick={() => inspect({ kind: 'perso', id: c.id })}
            >
              <Portrait state={game} c={c} size={40} />
              <span className="grow search-text">
                <b>{displayName(game, c)}</b>
                <span className="small muted">
                  {c.alive
                    ? titleOf(game, c.id) ||
                      `cour de ${game.characters[topLiege(game, c.id)]?.name ?? '—'}`
                    : 'mort'}
                </span>
              </span>
              <span className="chev">›</span>
            </button>
          ))}
        </>
      )}
      {results && results.counties.length > 0 && (
        <>
          <h3 className="settings-title">Comtés</h3>
          {results.counties.map((k) => (
            <button
              key={k.id}
              className="list-item plain tappable"
              onClick={() => inspect({ kind: 'comte', id: k.id })}
            >
              <span className="grow search-text">
                <b>{k.name}</b>
                <span className="small muted">{realmName(game, countyRuler(game, k))}</span>
              </span>
              <span className="chev">›</span>
            </button>
          ))}
        </>
      )}
    </Sheet>
  );
}
