/**
 * Bilan de saison : instantané pris quand le joueur finit la saison, puis comparaison avec
 * l'état au début de la saison suivante (« Depuis la saison dernière », Règne › Résumé).
 */
import { BALANCE } from '../data/balance';
import { opinion } from './characters';
import { realmCounties, vassalsOf } from './realm';
import type { ChronicleEntry, GameState, SeasonSnapshot } from './state';

/** Photographie ce qui compte pour le joueur, juste avant la fin de saison. */
export function takeSnapshot(state: GameState): SeasonSnapshot {
  const pl = state.playerId;
  const me = state.characters[pl];
  const opinions: Record<string, number> = {};
  for (const v of vassalsOf(state, pl)) opinions[v] = opinion(state, v, pl);
  return {
    turn: state.turn,
    rulerId: pl,
    gold: me.gold,
    prestige: me.prestige,
    piety: me.piety,
    renown: state.dynasties[state.playerDynastyId]?.renown ?? 0,
    counties: realmCounties(state, pl).map((c) => c.id),
    opinions,
  };
}

export interface SeasonDigest {
  gold: number;
  prestige: number;
  piety: number;
  renown: number;
  gained: string[];
  lost: string[];
  /** Vassaux dont l'opinion a nettement bougé (au moins `BALANCE.digest.opinionStep`). */
  opinions: { id: string; before: number; after: number }[];
  /** Faits marquants de la chronique depuis l'instantané (hors événements ordinaires). */
  facts: ChronicleEntry[];
  /** Le souverain a changé (succession) : les écarts de ressources ne sont pas comparables. */
  newRuler: boolean;
}

/** Ce qui a changé depuis l'instantané ; rien si la saison n'a pas encore été finie. */
export function seasonDigest(state: GameState): SeasonDigest | undefined {
  const snap = state.lastSnapshot;
  if (!snap || snap.turn >= state.turn) return undefined;
  const pl = state.playerId;
  const me = state.characters[pl];
  const newRuler = snap.rulerId !== pl;
  const now = new Set(realmCounties(state, pl).map((c) => c.id));
  const before = new Set(snap.counties);
  const opinions = newRuler
    ? []
    : vassalsOf(state, pl)
        .filter((v) => v in snap.opinions)
        .map((v) => ({ id: v, before: snap.opinions[v], after: opinion(state, v, pl) }))
        .filter((o) => Math.abs(o.after - o.before) >= BALANCE.digest.opinionStep)
        .sort((a, b) => Math.abs(b.after - b.before) - Math.abs(a.after - a.before));
  return {
    gold: newRuler ? 0 : me.gold - snap.gold,
    prestige: newRuler ? 0 : me.prestige - snap.prestige,
    piety: newRuler ? 0 : me.piety - snap.piety,
    renown: (state.dynasties[state.playerDynastyId]?.renown ?? 0) - snap.renown,
    gained: [...now].filter((id) => !before.has(id)),
    lost: [...before].filter((id) => !now.has(id)),
    opinions,
    facts: state.chronicle.filter((e) => e.turn >= snap.turn && e.kind !== 'evenement'),
    newRuler,
  };
}
