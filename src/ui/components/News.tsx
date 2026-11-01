/** Nouvelles du monde : ce qui se passe chez les autres souverains. */
import { useMemo, useState } from 'react';
import { yearOf } from '../../engine/context';
import { bordersPlayer } from '../../engine/realm';
import type { GameState, NewsEntry } from '../../engine/state';

export const NEWS_ICON: Record<NewsEntry['kind'], string> = {
  guerre: '⚔',
  paix: '🕊',
  deces: '✝',
  succession: '♛',
  mariage: '⚭',
  alliance: '🤝',
  titre: '♜',
  revolte: '🔥',
  fait: '•',
};

const FILTERS = [
  { id: 'tout', label: 'Tout', kinds: null },
  { id: 'voisins', label: 'Voisins', kinds: null },
  { id: 'guerres', label: 'Guerres', kinds: ['guerre', 'paix', 'revolte'] },
  { id: 'cours', label: 'Cours', kinds: ['deces', 'succession', 'mariage', 'alliance', 'titre'] },
  { id: 'terres', label: 'Terres', kinds: ['fait'] },
] as const;

type FilterId = (typeof FILTERS)[number]['id'];

/** Nouvelles concernant un souverain (par son identifiant ou le nom de sa maison). */
export function newsAbout(game: GameState, rulerId: string): NewsEntry[] {
  const c = game.characters[rulerId];
  const house = c?.dynastyId ? game.dynasties[c.dynastyId]?.name : undefined;
  return (game.worldNews ?? []).filter(
    (n) => n.rulerId === rulerId || (!!house && n.text.includes(house)),
  );
}

export function NewsList({ game, list }: { game: GameState; list: NewsEntry[] }) {
  const byYear = new Map<number, NewsEntry[]>();
  for (const n of [...list].reverse()) {
    const y = yearOf(game, n.turn);
    byYear.set(y, [...(byYear.get(y) ?? []), n]);
  }
  if (!list.length) return <p className="muted small">Aucune nouvelle pour l’instant.</p>;
  return (
    <>
      {[...byYear.entries()].map(([y, items]) => (
        <div key={y} className="news-year">
          <h4 className="news-year-title">{y}</h4>
          {items.map((n, i) => (
            <p key={i} className={`small news-item news-${n.kind}`}>
              <span className="muted news-icon" aria-hidden>
                {NEWS_ICON[n.kind]}
              </span>{' '}
              {n.text}
            </p>
          ))}
        </div>
      ))}
    </>
  );
}

export function WorldNews({ game }: { game: GameState }) {
  const [filter, setFilter] = useState<FilterId>('tout');
  const all = game.worldNews ?? [];
  const neighbours = useMemo(() => {
    const ids = new Set(all.map((n) => n.rulerId).filter((x): x is string => !!x));
    return new Set([...ids].filter((id) => bordersPlayer(game, id)));
  }, [game, all]);
  const f = FILTERS.find((x) => x.id === filter)!;
  const list = all.filter((n) =>
    filter === 'voisins'
      ? !!n.rulerId && neighbours.has(n.rulerId)
      : !f.kinds || (f.kinds as readonly string[]).includes(n.kind),
  );
  return (
    <div className="card">
      <p className="small muted" style={{ marginTop: 0 }}>
        Ce que rapportent marchands, pèlerins et espions des cours étrangères.
      </p>
      <div className="row wrap news-filters" style={{ marginBottom: 8 }}>
        {FILTERS.map((x) => (
          <button
            key={x.id}
            className={`chip news-filter${filter === x.id ? ' on' : ''}`}
            aria-pressed={filter === x.id}
            onClick={() => setFilter(x.id)}
          >
            {x.label}
          </button>
        ))}
      </div>
      <NewsList game={game} list={list} />
    </div>
  );
}
