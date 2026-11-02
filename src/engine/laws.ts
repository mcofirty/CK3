/** Changer de loi de succession, réformer son gouvernement, prévoir l'héritier. */
import {
  GOVERNMENTS,
  LAW_CHANGE_OPINION,
  LAW_COOLDOWN,
  REFORMS,
  SUCCESSION_LAWS,
  type ReformDef,
} from '../data/governments';
import { addOpinion } from './characters';
import { heirsOf } from './characters/lifecycle';
import { chronicle, worldNews } from './context';
import { governmentOf } from './government';
import { capitalOf } from './realm';
import type { Character, GameState, GovernmentId, SuccessionLaw } from './state';

export interface LawCheck {
  ok: boolean;
  reason?: string;
  cost: number;
}

const vassalsOf = (state: GameState, id: string) =>
  Object.values(state.characters).filter((v) => v.alive && v.liegeId === id);

/** Peut-on adopter cette loi de succession ? */
export function lawCheck(state: GameState, id: string, law: SuccessionLaw): LawCheck {
  const r = state.characters[id];
  const cost = SUCCESSION_LAWS[law].cost;
  if (!r) return { ok: false, reason: 'Souverain inconnu', cost };
  if (r.successionLaw === law) return { ok: false, reason: 'Loi en vigueur', cost };
  const gov = GOVERNMENTS[governmentOf(state, id)];
  if (!gov.laws.includes(law))
    return { ok: false, reason: `Interdite sous le gouvernement « ${gov.name} »`, cost };
  if (r.lawChangedTurn !== undefined && state.turn - r.lawChangedTurn < LAW_COOLDOWN)
    return {
      ok: false,
      reason: `Loi changée récemment (encore ${Math.ceil((LAW_COOLDOWN - (state.turn - r.lawChangedTurn)) / 4)} an(s))`,
      cost,
    };
  if (r.prestige < cost) return { ok: false, reason: `Il faut ${cost} prestige`, cost };
  return { ok: true, cost };
}

export function changeSuccessionLaw(state: GameState, id: string, law: SuccessionLaw): boolean {
  const chk = lawCheck(state, id, law);
  if (!chk.ok) return false;
  const r = state.characters[id];
  r.prestige -= chk.cost;
  r.successionLaw = law;
  r.lawChangedTurn = state.turn;
  for (const v of vassalsOf(state, id))
    addOpinion(state, v.id, id, 'Loi de succession changée', LAW_CHANGE_OPINION, 16);
  const text = `${r.name} adopte la loi de succession « ${SUCCESSION_LAWS[law].name} ».`;
  if (id === state.playerId) chronicle(state, text, 'titre');
  else worldNews(state, text, 'titre', id);
  return true;
}

export const reformsFrom = (state: GameState, id: string): ReformDef[] =>
  REFORMS.filter((r) => r.from === governmentOf(state, id));

export function reformCheck(
  state: GameState,
  id: string,
  to: GovernmentId,
): { ok: boolean; reason?: string; reform?: ReformDef } {
  const r = state.characters[id];
  const reform = reformsFrom(state, id).find((x) => x.to === to);
  if (!r || !reform) return { ok: false, reason: 'Réforme impossible' };
  if (r.liegeId) return { ok: false, reason: 'Seul un souverain réforme son gouvernement', reform };
  if (reform.needsKingdom && !Object.values(state.kingdoms).some((k) => k.holderId === id))
    return { ok: false, reason: 'Il faut porter une couronne royale', reform };
  const cap = capitalOf(state, id);
  if (reform.minCapitalDev && (cap?.development ?? 0) < reform.minCapitalDev)
    return {
      ok: false,
      reason: `Capitale développée au niveau ${reform.minCapitalDev} requise`,
      reform,
    };
  if (r.prestige < reform.prestige)
    return { ok: false, reason: `Il faut ${reform.prestige} prestige`, reform };
  if (r.gold < reform.gold) return { ok: false, reason: `Il faut ${reform.gold} or`, reform };
  return { ok: true, reform };
}

/** Réforme le gouvernement ; une loi devenue interdite cède la place à la loi d'usage. */
export function reformGovernment(state: GameState, id: string, to: GovernmentId): boolean {
  const chk = reformCheck(state, id, to);
  if (!chk.ok || !chk.reform) return false;
  const r = state.characters[id];
  r.prestige -= chk.reform.prestige;
  r.gold -= chk.reform.gold;
  r.government = to;
  const gov = GOVERNMENTS[to];
  if (!gov.laws.includes(r.successionLaw)) r.successionLaw = gov.defaultLaw;
  for (const v of vassalsOf(state, id))
    addOpinion(state, v.id, id, chk.reform.label, chk.reform.vassalOpinion, 24);
  const text = `${r.name} réforme son royaume : ${gov.name.toLowerCase()}.`;
  if (id === state.playerId) chronicle(state, text, 'titre');
  else worldNews(state, text, 'titre', id);
  return true;
}

/** Qui hériterait si ce souverain mourait aujourd'hui sous cette loi ? */
export function heirUnderLaw(
  state: GameState,
  c: Character,
  law: SuccessionLaw,
): Character | undefined {
  const saved = c.successionLaw;
  c.successionLaw = law;
  try {
    return heirsOf(state, c)[0];
  } finally {
    c.successionLaw = saved;
  }
}
