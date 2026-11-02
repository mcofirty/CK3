/**
 * Bilan de saison : instantané pris quand le joueur finit la saison, puis comparaison avec
 * l'état au début de la saison suivante (« Depuis la saison dernière », Règne › Résumé).
 */
import { BALANCE } from '../data/balance';
import { healthOf, opinion } from './characters';
import { titlesOf } from './characters/lifecycle';
import { realmCounties, vassalsOf } from './realm';
import type { ChronicleEntry, FollowedSnapshot, GameState, SeasonSnapshot } from './state';

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
    followed: Object.fromEntries((state.followed ?? []).map((id) => [id, followedSnap(state, id)])),
  };
}

// ---------------------------------------------------------------------------
// Personnages suivis
// ---------------------------------------------------------------------------

/** Suit un personnage (ou cesse de le suivre) ; au plus `BALANCE.digest.maxFollowed`. */
export function toggleFollow(state: GameState, id: string): void {
  if (!state.characters[id] || id === state.playerId) return;
  const list = state.followed ?? [];
  if (list.includes(id)) state.followed = list.filter((x) => x !== id);
  else if (list.length < BALANCE.digest.maxFollowed) state.followed = [...list, id];
}

export function isFollowed(state: GameState, id: string): boolean {
  return (state.followed ?? []).includes(id);
}

function followedSnap(state: GameState, id: string): FollowedSnapshot {
  const c = state.characters[id];
  return {
    alive: !!c?.alive,
    health: c ? healthOf(c) : 0,
    spouseId: c?.spouseId,
    liegeId: c?.liegeId,
    imprisoned: !!c?.imprisonedBy,
    titles: c ? titlesOf(state, id).length : 0,
    children: c?.childrenIds.length ?? 0,
    opinion: c?.alive ? opinion(state, id, state.playerId) : 0,
  };
}

/** Ce qui a changé pour un personnage suivi depuis la dernière fin de saison. */
export interface FollowedChange {
  id: string;
  died: boolean;
  married: boolean;
  widowed: boolean;
  imprisoned: boolean;
  freed: boolean;
  titlesGained: number;
  titlesLost: number;
  births: number;
  newLiege: boolean;
  health: number;
  opinion: number;
}

export function followedChanges(state: GameState): FollowedChange[] {
  const snap = state.lastSnapshot;
  if (!snap?.followed || snap.turn >= state.turn) return [];
  const res: FollowedChange[] = [];
  for (const id of state.followed ?? []) {
    const before = snap.followed[id];
    if (!before) continue;
    const now = followedSnap(state, id);
    const ch: FollowedChange = {
      id,
      died: before.alive && !now.alive,
      married: !before.spouseId && !!now.spouseId,
      widowed: !!before.spouseId && !now.spouseId && now.alive,
      imprisoned: !before.imprisoned && now.imprisoned,
      freed: before.imprisoned && !now.imprisoned && now.alive,
      titlesGained: Math.max(0, now.titles - before.titles),
      titlesLost: Math.max(0, before.titles - now.titles),
      births: Math.max(0, now.children - before.children),
      newLiege: now.alive && before.liegeId !== now.liegeId,
      health: now.alive ? now.health - before.health : 0,
      opinion: now.alive && before.alive ? now.opinion - before.opinion : 0,
    };
    const notable =
      ch.died ||
      ch.married ||
      ch.widowed ||
      ch.imprisoned ||
      ch.freed ||
      ch.titlesGained ||
      ch.titlesLost ||
      ch.births ||
      ch.newLiege ||
      Math.abs(ch.health) >= BALANCE.digest.healthStep ||
      Math.abs(ch.opinion) >= BALANCE.digest.opinionStep;
    if (notable) res.push(ch);
  }
  return res;
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
