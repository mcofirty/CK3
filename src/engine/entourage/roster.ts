/**
 * Cour d'un souverain : qui y vit, combien de places sont gratuites, qui est payé.
 * Module pur, sans dépendance au royaume (lu par le calcul des revenus).
 */
import { BALANCE } from '../../data/balance';
import { heldCounties, isAdult, skill } from '../characters';
import { SKILL_KEYS, type Character, type GameState } from '../state';

const E = BALANCE.entourage;

export const bestSkill = (c: Character): number => Math.max(...SKILL_KEYS.map((k) => skill(c, k)));

/** Valeur d'un courtisan : ses deux meilleures compétences (sert à ordonner et à départager). */
export function courtierValue(c: Character): number {
  const v = SKILL_KEYS.map((k) => skill(c, k)).sort((a, b) => b - a);
  return v[0] + v[1] * 0.5;
}

/** Salaire par saison. */
export function courtierWage(c: Character): number {
  return Math.round((E.wageBase + E.wagePerSkill * bestSkill(c)) * 10) / 10;
}

/** Prime d'engagement. */
export function courtierFee(c: Character): number {
  return Math.round(E.feeBase + E.feePerSkill * bestSkill(c));
}

function rankKey(state: GameState, id: string): keyof typeof E.freeRank {
  if (Object.values(state.kingdoms).some((k) => k.holderId === id)) return 'roi';
  if (Object.values(state.duchies).some((d) => d.holderId === id)) return 'duc';
  if (heldCounties(state, id).length) return 'comte';
  return 'aucun';
}

/** Places sans salaire : base + rang + Gestion. */
export function courtCapacity(state: GameState, rulerId: string): number {
  const r = state.characters[rulerId];
  if (!r) return 0;
  return (
    E.freeBase +
    E.freeRank[rankKey(state, rulerId)] +
    Math.floor(skill(r, 'gestion') / E.gestionPerSlot)
  );
}

/** Courtisans extérieurs adultes : ni famille, ni conjoint, ni otage, ni terres, ni visiteur. */
export function outsiders(state: GameState, rulerId: string): Character[] {
  const r = state.characters[rulerId];
  return Object.values(state.characters).filter(
    (c) =>
      c.alive &&
      c.id !== rulerId &&
      c.courtId === rulerId &&
      !c.visitor &&
      !c.hostageOf &&
      !c.imprisonedBy &&
      !c.fosterOf &&
      c.id !== r?.spouseId &&
      (!r?.dynastyId || c.dynastyId !== r.dynastyId) &&
      isAdult(state, c) &&
      !heldCounties(state, c.id).length,
  );
}

export interface RosterEntry {
  c: Character;
  /** Place gratuite ? */
  free: boolean;
  wage: number;
  council: boolean;
}

/**
 * Les places gratuites vont d'abord aux membres du conseil, puis aux plus compétents ;
 * les autres sont payés (et partent les premiers en cas de besoin).
 */
export function courtRoster(state: GameState, rulerId: string): RosterEntry[] {
  const seated = new Set(
    Object.values(state.council)
      .map((s) => s.holderId)
      .filter(Boolean),
  );
  const list = outsiders(state, rulerId)
    .map((c) => ({ c, council: rulerId === state.playerId && seated.has(c.id) }))
    .sort(
      (a, b) =>
        (b.council ? 1000 : 0) + courtierValue(b.c) - ((a.council ? 1000 : 0) + courtierValue(a.c)),
    );
  const cap = courtCapacity(state, rulerId);
  return list.map((x, i) => ({ ...x, free: i < cap, wage: i < cap ? 0 : courtierWage(x.c) }));
}

export function courtPayroll(
  state: GameState,
  rulerId: string,
): { total: number; paid: RosterEntry[] } {
  const paid = courtRoster(state, rulerId).filter((e) => !e.free);
  return { total: Math.round(paid.reduce((s, e) => s + e.wage, 0) * 10) / 10, paid };
}
