/** Épidémies : elles naissent, avancent de comté en comté, puis s'éteignent. */
import { BALANCE } from '../data/balance';
import { addTrait, hasTrait } from './characters';
import { notify, type Ctx } from './context';
import { countyRuler } from './realm';
import type { GameState } from './state';

const P = BALANCE.plague;

export function canCatch(state: GameState, countyId: string): boolean {
  const c = state.counties[countyId];
  if (!c || c.plague) return false;
  return c.plagueEnded === undefined || state.turn - c.plagueEnded > P.immunity;
}

export function startPlague(state: GameState, countyId: string): boolean {
  if (!canCatch(state, countyId)) return false;
  state.counties[countyId].plague = P.duration;
  return true;
}

export function playerRealmPlagued(state: GameState): boolean {
  return Object.values(state.counties).some(
    (c) => c.plague && countyRuler(state, c) === state.playerId,
  );
}

/** Fin de saison : ravages, propagation, extinction. */
export function seasonPlague(ctx: Ctx): void {
  const { state, rng } = ctx;
  const plagued = Object.values(state.counties).filter((c) => c.plague);
  if (!plagued.length) {
    // Une épidémie peut naître n'importe où.
    if (rng.chance(P.worldChance)) {
      const c = rng.pick(Object.values(state.counties));
      startPlague(state, c.id);
    }
    return;
  }
  const newly: string[] = [];
  for (const c of plagued) {
    if (rng.chance(P.developmentLoss) && c.development > 1) c.development -= 1;
    c.levyPool *= 1 - P.levyLoss;
    for (const ch of Object.values(state.characters)) {
      if (!ch.alive || (ch.courtId !== c.holderId && ch.id !== c.holderId)) continue;
      if (!hasTrait(ch, 'malade') && rng.chance(P.sicknessChance)) addTrait(ch, 'malade');
    }
    if (!c.quarantine)
      for (const n of c.adjacent)
        if (canCatch(state, n) && rng.chance(P.spreadChance)) newly.push(n);
    c.plague! -= c.quarantine ? 2 : 1;
    if (c.plague! <= 0) {
      c.plague = undefined;
      c.quarantine = undefined;
      c.plagueEnded = state.turn;
    }
  }
  const before = playerRealmPlagued(state);
  for (const id of new Set(newly)) startPlague(state, id);
  for (const id of new Set(newly)) {
    const c = state.counties[id];
    if (countyRuler(state, c) !== state.playerId) continue;
    notify(state, `L’épidémie atteint ${c.name}.`);
    if (!before) (state.pendingTriggers ??= []).push({ trigger: 'peste', scope: { comte: id } });
    break;
  }
  const after = playerRealmPlagued(state);
  if (before && !after && state.stats) state.stats.plaguesSurvived += 1;
}
