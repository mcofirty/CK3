/** Économie locale : saison (contentement, révoltes), décisions du seigneur, édits, emprunts. */
import { BALANCE } from '../../data/balance';
import { EDICT_BY_ID } from '../../data/edicts';
import { clamp, newId, notify, type Ctx } from '../context';
import { countyIncome, incomeMultiplier } from '../realm';
import type { ConscriptionLevel, County, GameState, TaxLevel } from '../state';
import {
  contentIncomeMult,
  contentmentDelta,
  contentmentOf,
  countyIncomeMult,
  hurtPopulation,
  revoltChance,
  TAX_LABELS,
  vitalityOf,
  vitalityTarget,
} from './local';

const L = BALANCE.local;

// ---------------------------------------------------------------------------
// Saison
// ---------------------------------------------------------------------------

/** La population se remet lentement (selon le contentement) ; l'occupation la saigne. */
export function seasonPopulation(c: County): void {
  const P = BALANCE.population;
  const v = vitalityOf(c);
  const target = vitalityTarget(c);
  let next = v + Math.sign(target - v) * Math.min(Math.abs(target - v), P.recovery);
  if (c.occupation) next *= 1 - P.occupationLoss;
  if (c.plague) next *= 1 - P.plagueLoss;
  c.vitality = Math.round(clamp(next, P.vitalityMin, P.vitalityMax) * 1000) / 1000;
}

/** Fin de saison : le contentement évolue, la colère peut éclater. */
export function seasonLocalEconomy(ctx: Ctx): void {
  const { state, rng } = ctx;
  let revolt = false;
  for (const c of Object.values(state.counties)) {
    c.contentment = clamp(contentmentOf(c) + contentmentDelta(state, c).total, 0, 100);
    seasonPopulation(c);
    const p = revoltChance(c);
    if (!p || !rng.chance(p)) continue;
    if (c.holderId === state.playerId) {
      // Une seule jacquerie à la fois : l'événement laisse le joueur choisir.
      if (revolt) continue;
      revolt = true;
      (state.pendingTriggers ??= []).push({ trigger: 'revolte_paysanne', scope: { comte: c.id } });
    } else {
      // Ailleurs, la révolte coûte du développement puis s'apaise d'elle-même.
      if (c.development > 1) c.development -= 1;
      hurtPopulation(c, BALANCE.population.revoltLoss);
      c.contentment = clamp(contentmentOf(c) + 15, 0, 100);
    }
  }
  aiTaxes(state);
  // Faillite avec des emprunts : les créanciers se font entendre.
  const p = state.characters[state.playerId];
  if (
    p &&
    p.gold < BALANCE.economy.debtThreshold &&
    (state.loans ?? []).some((l) => l.ownerId === p.id)
  ) {
    p.prestige += L.loanDefaultPrestige / 4;
    notify(state, 'Les banquiers réclament leur dû : votre réputation en souffre.');
  }
}

/** L'IA lève l'impôt quand le trésor est maigre et le peuple content, et le baisse avant la colère. */
function aiTaxes(state: GameState): void {
  const holders = new Set(Object.values(state.counties).map((c) => c.holderId));
  for (const id of holders) {
    if (id === state.playerId && !state.autoplay) continue;
    const r = state.characters[id];
    if (!r?.alive) continue;
    const poor = r.gold < 60;
    for (const c of Object.values(state.counties)) {
      if (c.holderId !== id) continue;
      const v = contentmentOf(c);
      if (v < L.aiLowerTaxContentment) c.tax = v < L.revoltThreshold ? 'faible' : 'normal';
      else if (poor && v > L.aiRaiseTaxContentment) c.tax = 'eleve';
      else if (!poor && c.tax === 'eleve') c.tax = 'normal';
    }
  }
}

// ---------------------------------------------------------------------------
// Décisions du seigneur
// ---------------------------------------------------------------------------

export function setTax(
  state: GameState,
  rulerId: string,
  countyId: string,
  level: TaxLevel,
): boolean {
  const c = state.counties[countyId];
  if (!c || c.holderId !== rulerId) return false;
  c.tax = level;
  return true;
}

export function setTaxAll(state: GameState, rulerId: string, level: TaxLevel): number {
  let n = 0;
  for (const c of Object.values(state.counties))
    if (c.holderId === rulerId) {
      c.tax = level;
      n++;
    }
  if (n && rulerId === state.playerId)
    notify(state, `Impôts ${TAX_LABELS[level].toLowerCase()} dans tout le domaine.`);
  return n;
}

export function setConscription(
  state: GameState,
  rulerId: string,
  countyId: string,
  level: ConscriptionLevel,
): boolean {
  const c = state.counties[countyId];
  if (!c || c.holderId !== rulerId) return false;
  c.conscription = level;
  return true;
}

// --- Édits ---
export function edictCheck(
  state: GameState,
  rulerId: string,
  id: string,
): { ok: boolean; active: boolean; reason?: string } {
  const e = EDICT_BY_ID[id];
  const r = state.characters[rulerId];
  if (!e || !r) return { ok: false, active: false, reason: 'Édit inconnu' };
  const active = (state.edicts?.[rulerId] ?? []).includes(id);
  if (active) return { ok: true, active };
  const cd = state.edictCooldown?.[`${rulerId}:${id}`];
  if (cd !== undefined && cd > state.turn)
    return { ok: false, active, reason: `Abrogé récemment : encore ${cd - state.turn} saison(s)` };
  if (r.gold < e.cost) return { ok: false, active, reason: `Il faut ${e.cost} or` };
  return { ok: true, active };
}

/** Proclame l'édit, ou l'abroge s'il est en vigueur. */
export function toggleEdict(state: GameState, rulerId: string, id: string): boolean {
  const chk = edictCheck(state, rulerId, id);
  if (!chk.ok) return false;
  const e = EDICT_BY_ID[id];
  const list = ((state.edicts ??= {})[rulerId] ??= []);
  if (chk.active) {
    state.edicts[rulerId] = list.filter((x) => x !== id);
    (state.edictCooldown ??= {})[`${rulerId}:${id}`] = state.turn + e.cooldown;
    if (rulerId === state.playerId) notify(state, `Édit abrogé : ${e.name}.`);
  } else {
    state.characters[rulerId].gold -= e.cost;
    list.push(id);
    if (rulerId === state.playerId) notify(state, `Édit proclamé : ${e.name}.`);
  }
  return true;
}

// --- Emprunts ---
/** Revenus du domaine propre par saison (avant entretien). */
export function demesneIncome(state: GameState, rulerId: string): number {
  return (
    Object.values(state.counties)
      .filter((c) => c.holderId === rulerId && !c.occupation)
      .reduce((s, c) => s + countyIncome(c) * countyIncomeMult(c), 0) *
    incomeMultiplier(state, rulerId)
  );
}

export function debtOf(state: GameState, rulerId: string): number {
  return (state.loans ?? [])
    .filter((l) => l.ownerId === rulerId)
    .reduce((s, l) => s + l.principal, 0);
}

/** Montant encore empruntable. */
export function loanCap(state: GameState, rulerId: string): number {
  const cap = Math.floor((demesneIncome(state, rulerId) * L.loanCapSeasons) / 10) * 10;
  return Math.max(0, cap - debtOf(state, rulerId));
}

export function takeLoan(state: GameState, rulerId: string, amount: number): boolean {
  const r = state.characters[rulerId];
  const a = Math.floor(amount);
  if (!r || a < L.loanMin || a > loanCap(state, rulerId)) return false;
  (state.loans ??= []).push({
    id: newId(state, 'l'),
    ownerId: rulerId,
    principal: a,
    rate: L.loanRate,
    turn: state.turn,
  });
  r.gold += a;
  if (rulerId === state.playerId)
    notify(
      state,
      `Les banquiers vous prêtent ${a} or à ${Math.round(L.loanRate * 100)} % par saison.`,
    );
  return true;
}

export function repayLoan(state: GameState, rulerId: string, loanId: string): boolean {
  const loan = (state.loans ?? []).find((l) => l.id === loanId && l.ownerId === rulerId);
  const r = state.characters[rulerId];
  if (!loan || !r || r.gold < loan.principal) return false;
  r.gold -= loan.principal;
  state.loans = (state.loans ?? []).filter((l) => l !== loan);
  if (rulerId === state.playerId) notify(state, `Emprunt de ${loan.principal} or remboursé.`);
  return true;
}

/** Les dettes d'un souverain mort passent à son héritier. */
export function transferLoans(state: GameState, fromId: string, toId: string): void {
  for (const l of state.loans ?? []) if (l.ownerId === fromId) l.ownerId = toId;
  if (state.edicts?.[fromId]) {
    state.edicts[toId] = state.edicts[fromId];
    delete state.edicts[fromId];
  }
}

/** Bilan d'un comté du domaine (pour l'interface). */
export function countyLedger(state: GameState, countyId: string) {
  const c = state.counties[countyId];
  const base = countyIncome(c);
  const taxMult = L.taxes[c.tax ?? 'normal'].income;
  const contentMult = contentIncomeMult(c);
  const ruler = incomeMultiplier(state, c.holderId);
  return { base, taxMult, contentMult, ruler, total: base * taxMult * contentMult * ruler };
}
