/** Décisions actives : tournoi, chasse, festin, pèlerinage… */
import { DECISION_BY_ID } from '../data/decisions';
import type { Ctx } from './context';
import { buildScope, checkAll, EVENTS, queueEvent, rolesAvailable } from './events/engine';
import type { GameState } from './state';

export interface DecisionCheck {
  ok: boolean;
  reason?: string;
  /** Saisons avant de pouvoir recommencer. */
  wait: number;
}

export function decisionCheck(state: GameState, id: string): DecisionCheck {
  const d = DECISION_BY_ID[id];
  const p = state.characters[state.playerId];
  if (!d || !p) return { ok: false, reason: 'Décision inconnue', wait: 0 };
  const last = state.decisionsUsed?.[id];
  const wait = last === undefined ? 0 : Math.max(0, last + d.cooldownYears * 4 - state.turn);
  if (wait > 0) return { ok: false, reason: `Encore ${wait} saison(s)`, wait };
  if (state.phase !== 'saison') return { ok: false, reason: 'Pas maintenant', wait };
  if (state.pendingEvents.length) return { ok: false, reason: 'Un événement attend', wait };
  if (!checkAll(state, d.conditions, { souverain: p.id }))
    return { ok: false, reason: d.conditionText ?? 'Conditions non remplies', wait };
  if ((d.cost.or ?? 0) > p.gold) return { ok: false, reason: `Il faut ${d.cost.or} or`, wait };
  if ((d.cost.prestige ?? 0) > p.prestige)
    return { ok: false, reason: `Il faut ${d.cost.prestige} prestige`, wait };
  if ((d.cost.piete ?? 0) > p.piety)
    return { ok: false, reason: `Il faut ${d.cost.piete} piété`, wait };
  const def = EVENTS[d.event];
  if (!def) return { ok: false, reason: 'Indisponible', wait };
  if (!rolesAvailable(state, def)) return { ok: false, reason: 'Personne à convier', wait };
  return { ok: true, wait };
}

export function takeDecision(ctx: Ctx, id: string): boolean {
  const { state } = ctx;
  if (!decisionCheck(state, id).ok) return false;
  const d = DECISION_BY_ID[id];
  const def = EVENTS[d.event];
  const scope = buildScope(ctx, def);
  if (!scope) return false;
  const p = state.characters[state.playerId];
  p.gold -= d.cost.or ?? 0;
  p.prestige -= d.cost.prestige ?? 0;
  p.piety -= d.cost.piete ?? 0;
  (state.decisionsUsed ??= {})[id] = state.turn;
  if (state.stats) state.stats.decisions += 1;
  queueEvent(ctx, def, scope);
  return true;
}
