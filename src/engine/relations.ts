/** Relations personnelles (amis, rivaux, amants) et souvenirs qui durent. */
import { BALANCE } from '../data/balance';
import { TRAITS } from '../data/traits';
import { addOpinion, ageOf, closeFamily, isAdult, isCloseFamily, parentsOf } from './characters';
import type { Ctx } from './context';
import { vassalsOf } from './realm';
import type { Character, GameState } from './state';

const R = BALANCE.relations;

export function makeFriends(a: Character, b: Character): void {
  if (a.id === b.id) return;
  if (!a.friends.includes(b.id)) a.friends.push(b.id);
  if (!b.friends.includes(a.id)) b.friends.push(a.id);
  a.rivals = a.rivals.filter((x) => x !== b.id);
  b.rivals = b.rivals.filter((x) => x !== a.id);
}

export function makeRivals(a: Character, b: Character): void {
  if (a.id === b.id) return;
  if (!a.rivals.includes(b.id)) a.rivals.push(b.id);
  if (!b.rivals.includes(a.id)) b.rivals.push(a.id);
  a.friends = a.friends.filter((x) => x !== b.id);
  b.friends = b.friends.filter((x) => x !== a.id);
}

export function reconcile(a: Character, b: Character): void {
  a.rivals = a.rivals.filter((x) => x !== b.id);
  b.rivals = b.rivals.filter((x) => x !== a.id);
}

export function makeLovers(a: Character, b: Character): void {
  if (a.id === b.id) return;
  a.lovers = [...new Set([...(a.lovers ?? []), b.id])];
  b.lovers = [...new Set([...(b.lovers ?? []), a.id])];
}

export function endLovers(a: Character, b: Character): void {
  a.lovers = (a.lovers ?? []).filter((x) => x !== b.id);
  b.lovers = (b.lovers ?? []).filter((x) => x !== a.id);
}

/**
 * Souvenir : la famille proche de la victime n'oubliera pas.
 * Un souvenir sanglant (≤ memoryKill) peut pousser à la vengeance.
 */
export function addMemory(
  state: GameState,
  victimId: string,
  culpritId: string,
  kind: 'mort' | 'prison',
): void {
  const v = state.characters[victimId];
  if (!v) return;
  const value = kind === 'mort' ? R.memoryKill : R.memoryPrison;
  const seasons = kind === 'mort' ? R.memoryKillSeasons : R.memoryKillSeasons / 2;
  const reason = kind === 'mort' ? `A fait périr ${v.name}` : `A jeté ${v.name} au cachot`;
  const kin = [v, ...parentsOf(state, v), ...closeFamily(state, v)].filter(
    (k, i, all) => k.alive && k.id !== culpritId && all.findIndex((x) => x.id === k.id) === i,
  );
  for (const k of kin)
    if (k.id !== v.id || kind === 'prison')
      addOpinion(state, k.id, culpritId, reason, value, seasons);
  for (const f of v.friends) {
    const fr = state.characters[f];
    if (fr?.alive && fr.id !== culpritId)
      addOpinion(state, f, culpritId, reason, Math.round(value / 2), seasons / 2);
  }
}

/** Compatibilité de caractère : traits communs moins traits opposés. */
export function compatibility(a: Character, b: Character): number {
  let n = 0;
  for (const t of a.traits) {
    const def = TRAITS[t];
    if (def?.category !== 'personnalite') continue;
    if (b.traits.includes(t)) n += 1;
    if (def.opposite && b.traits.includes(def.opposite)) n -= 1;
  }
  return n;
}

/** Personnes que le souverain côtoie : cour, conseil, vassaux. */
export function companions(state: GameState): Character[] {
  const p = state.characters[state.playerId];
  const ids = new Set<string>(vassalsOf(state, p.id));
  for (const c of Object.values(state.characters))
    if (c.alive && c.courtId === p.id && c.id !== p.id) ids.add(c.id);
  return [...ids]
    .map((id) => state.characters[id])
    .filter(
      (c) =>
        c?.alive &&
        isAdult(state, c) &&
        !c.imprisonedBy &&
        c.id !== p.spouseId &&
        !isCloseFamily(state, p, c),
    );
}

/** Une relation naît parfois à la cour : un événement propose de la nouer. */
export function seasonRelations(ctx: Ctx): void {
  const { state, rng } = ctx;
  const p = state.characters[state.playerId];
  if (!p?.alive || !rng.chance(R.formChance)) return;
  const pool = companions(state).filter(
    (c) =>
      !p.friends.includes(c.id) && !p.rivals.includes(c.id) && !(p.lovers ?? []).includes(c.id),
  );
  if (!pool.length) return;
  const c = rng.pick(pool);
  const comp = compatibility(p, c);
  let trigger = 'relation_ami';
  if (comp < 0 || (comp === 0 && rng.chance(0.35))) trigger = 'relation_rival';
  else if (
    comp >= 0 &&
    c.female !== p.female &&
    Math.abs(ageOf(state, c) - ageOf(state, p)) < 20 &&
    rng.chance(0.3)
  )
    trigger = 'relation_amant';
  (state.pendingTriggers ??= []).push({ trigger, scope: { proche: c.id } });
}
