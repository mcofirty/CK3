/** Mercenaires et conduite des sièges. */
import { BALANCE } from '../../data/balance';
import { MERC_BY_ID } from '../../data/mercenaries';
import { UNIT_TYPES } from '../../data/units';
import { skill } from '../characters';
import { clamp, notify, type Ctx } from '../context';
import { gainXp } from '../progression';
import { fortLevel, standingOf } from '../realm';
import type { GameState } from '../state';
import { emptyUnits, totalMen } from '../units';

// ---------------------------------------------------------------------------
// Mercenaires
// ---------------------------------------------------------------------------

export function mercCheck(
  state: GameState,
  ownerId: string,
  id: string,
): { ok: boolean; reason?: string } {
  const def = MERC_BY_ID[id];
  const c = state.characters[ownerId];
  if (!def || !c) return { ok: false, reason: 'Compagnie inconnue' };
  if ((state.mercenaries ?? []).some((m) => m.id === id))
    return { ok: false, reason: 'Déjà sous contrat' };
  const cd = state.mercCooldown?.[id];
  if (cd !== undefined && cd > state.turn)
    return { ok: false, reason: `De retour dans ${cd - state.turn} saison(s)` };
  if (c.gold < def.cost) return { ok: false, reason: `Il faut ${def.cost} or` };
  return { ok: true };
}

export function hireMercenaries(ctx: Ctx, ownerId: string, id: string): boolean {
  const { state } = ctx;
  if (!mercCheck(state, ownerId, id).ok) return false;
  const def = MERC_BY_ID[id];
  const c = state.characters[ownerId];
  c.gold -= def.cost;
  const men = { ...emptyUnits(), ...def.men };
  // Directement dans l'armée levée, sinon parmi les compagnies professionnelles.
  const army = Object.values(state.armies).find((a) => a.ownerId === ownerId);
  const dest = army ? army.men : standingOf(state, ownerId);
  for (const u of UNIT_TYPES) dest[u] += men[u];
  if (army) army.baseMen += totalMen(men);
  (state.mercenaries ??= []).push({
    id,
    ownerId,
    men,
    until: state.turn + BALANCE.mercenaries.contractSeasons,
  });
  if (ownerId === state.playerId)
    notify(
      state,
      `${def.name} signe un contrat de ${BALANCE.mercenaries.contractSeasons} saisons.`,
    );
  return true;
}

/** Fin des contrats : la compagnie quitte vos rangs avec ses survivants. */
export function seasonMercenaries(state: GameState): void {
  const left: typeof state.mercenaries = [];
  for (const m of state.mercenaries ?? []) {
    if (m.until > state.turn && state.characters[m.ownerId]?.alive) {
      left.push(m);
      continue;
    }
    const st = standingOf(state, m.ownerId);
    const army = Object.values(state.armies).find((a) => a.ownerId === m.ownerId);
    for (const u of UNIT_TYPES) {
      let n = m.men[u];
      const fromStanding = Math.min(st[u], n);
      st[u] -= fromStanding;
      n -= fromStanding;
      if (army && n > 0) {
        const fromArmy = Math.min(army.men[u], n);
        army.men[u] -= fromArmy;
      }
    }
    (state.mercCooldown ??= {})[m.id] = state.turn + BALANCE.mercenaries.cooldownSeasons;
    if (m.ownerId === state.playerId)
      notify(
        state,
        `Le contrat de ${MERC_BY_ID[m.id]?.name ?? 'la compagnie'} expire : elle s’en va.`,
      );
  }
  state.mercenaries = left;
}

// ---------------------------------------------------------------------------
// Sièges
// ---------------------------------------------------------------------------

/** Chance qu'une garnison accepte de se rendre. */
export function negotiateChance(state: GameState, armyId: string): number {
  const a = state.armies[armyId];
  const c = a ? state.counties[a.location] : undefined;
  const owner = a ? state.characters[a.ownerId] : undefined;
  if (!a || !c || !owner) return 0;
  const S = BALANCE.siege;
  return clamp(
    S.negotiateBase +
      (skill(owner, 'diplomatie') - 10) * S.negotiatePerDiplo +
      (c.siege?.progress ?? 0) * S.negotiatePerProgress +
      fortLevel(c) * S.negotiatePerFort,
    0.05,
    0.9,
  );
}

/**
 * Négociation (une tentative par comté) : la garnison se rend contre de l'or,
 * sinon le siège continue et la tentative coûte du prestige. Renvoie vrai si le comté tombe.
 */
export function tryNegotiate(ctx: Ctx, armyId: string): boolean {
  const { state, rng } = ctx;
  const a = state.armies[armyId];
  if (!a || a.siegeMode !== 'negocier' || a.negotiated === a.location) return false;
  const c = state.counties[a.location];
  const owner = state.characters[a.ownerId];
  a.negotiated = a.location;
  a.siegeMode = undefined;
  const S = BALANCE.siege;
  gainXp(state, owner, 'diplomatie', 10);
  if (owner.gold >= S.negotiateGold && rng.chance(negotiateChance(state, armyId))) {
    owner.gold -= S.negotiateGold;
    if (a.ownerId === state.playerId)
      notify(state, `La garnison de ${c.name} accepte de se rendre contre ${S.negotiateGold} or.`);
    return true;
  }
  owner.prestige += S.negotiateFailPrestige;
  if (a.ownerId === state.playerId)
    notify(state, `La garnison de ${c.name} refuse de parlementer.`);
  return false;
}
