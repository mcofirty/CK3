/** Gouvernement d'un souverain (lu par l'économie, les levées et l'opinion) et élections. */
import { GOVERNMENTS, type GovernmentDef } from '../data/governments';
import { isAdult, opinion, skill } from './characters';
import type { Character, GameState, GovernmentId } from './state';
import { SKILL_KEYS } from './state';

/** Gouvernement du royaume dont relève ce personnage (celui de son souverain). */
export function governmentOf(state: GameState, id: string): GovernmentId {
  let c = state.characters[id];
  for (let i = 0; c?.liegeId && i < 8; i++) c = state.characters[c.liegeId];
  return c?.government ?? 'feodal';
}

export const govDef = (state: GameState, id: string): GovernmentDef =>
  GOVERNMENTS[governmentOf(state, id)];

export interface Ballot {
  candidateId: string;
  votes: number;
  /** Qui a voté pour lui. */
  voters: string[];
}

const bestSkill = (c: Character) => Math.max(...SKILL_KEYS.map((k) => skill(c, k)));

/**
 * Élection de l'héritier (loi élective) : le souverain (3 voix) et chaque vassal (1 voix)
 * votent pour l'adulte de la maison qu'ils préfèrent (opinion, talents ; le souverain penche
 * pour ses enfants, un vassal candidat vote pour lui-même).
 */
export function electionResults(state: GameState, ruler: Character, pool: Character[]): Ballot[] {
  const candidates = pool
    .filter(
      (c) =>
        c.alive &&
        isAdult(state, c) &&
        (!c.imprisonedBy || c.imprisonedBy === ruler.id) &&
        !(ruler.agnatic && c.female),
    )
    .slice(0, 6);
  if (!candidates.length) return [];
  const voters: { id: string; weight: number }[] = [{ id: ruler.id, weight: 3 }];
  for (const v of Object.values(state.characters))
    if (v.alive && v.liegeId === ruler.id) voters.push({ id: v.id, weight: 1 });
  const tally = new Map<string, Ballot>(
    candidates.map((c) => [c.id, { candidateId: c.id, votes: 0, voters: [] }]),
  );
  for (const v of voters) {
    let best = candidates[0];
    let bestScore = -Infinity;
    for (const c of candidates) {
      let s = (c.id === v.id ? 50 : opinion(state, v.id, c.id)) + 2 * bestSkill(c);
      if (v.id === ruler.id && ruler.childrenIds.includes(c.id)) s += 15;
      if (s > bestScore) {
        bestScore = s;
        best = c;
      }
    }
    const b = tally.get(best.id)!;
    b.votes += v.weight;
    b.voters.push(v.id);
  }
  return [...tally.values()].sort(
    (a, b) =>
      b.votes - a.votes ||
      state.characters[a.candidateId].birthTurn - state.characters[b.candidateId].birthTurn,
  );
}

/** Multiplicateur de levées dû au gouvernement du royaume (pour un comté tenu par `holderId`). */
export const governmentLevies = (state: GameState, holderId: string): number =>
  1 + govDef(state, holderId).levies;
