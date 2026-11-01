/**
 * Économie locale : effets purs des impôts, de la conscription, du contentement et des édits.
 * Ce fichier n'importe pas le royaume (il est lu par le calcul des revenus).
 */
import { BALANCE } from '../../data/balance';
import { BUILDINGS } from '../../data/buildings';
import { EDICT_BY_ID, type EdictDef } from '../../data/edicts';
import { clamp } from '../context';
import type { ConscriptionLevel, County, GameState, TaxLevel } from '../state';

const L = BALANCE.local;

export const TAX_LEVELS: TaxLevel[] = ['faible', 'normal', 'eleve', 'ecrasant'];
export const TAX_LABELS: Record<TaxLevel, string> = {
  faible: 'Faibles',
  normal: 'Normaux',
  eleve: 'Élevés',
  ecrasant: 'Écrasants',
};
export const CONSCRIPTION_LEVELS: ConscriptionLevel[] = ['legere', 'normale', 'lourde'];
export const CONSCRIPTION_LABELS: Record<ConscriptionLevel, string> = {
  legere: 'Légère',
  normale: 'Normale',
  lourde: 'Lourde',
};

export const taxOf = (c: County): TaxLevel => c.tax ?? 'normal';
export const conscriptionOf = (c: County): ConscriptionLevel => c.conscription ?? 'normale';
export const contentmentOf = (c: County): number => c.contentment ?? L.contentmentStart;

const lerp = (r: { min: number; max: number }, v: number) =>
  r.min + ((r.max - r.min) * clamp(v, 0, 100)) / 100;

export const contentIncomeMult = (c: County) => lerp(L.contentIncome, contentmentOf(c));
export const contentLeviesMult = (c: County) => lerp(L.contentLevies, contentmentOf(c));
export const contentDevMult = (c: County) => lerp(L.contentDevelopment, contentmentOf(c));

/** Humeur affichée. */
export function moodOf(c: County): { label: string; icon: string; cls: string } {
  const v = contentmentOf(c);
  if (v >= 75) return { label: 'Prospère', icon: '😊', cls: 'good' };
  if (v >= 50) return { label: 'Paisible', icon: '🙂', cls: '' };
  if (v >= L.revoltThreshold) return { label: 'Mécontent', icon: '😠', cls: 'warn' };
  return { label: 'Au bord de la révolte', icon: '🔥', cls: 'bad' };
}

// --- Édits ---
export function edictsOf(state: GameState, rulerId: string): EdictDef[] {
  return (state.edicts?.[rulerId] ?? []).map((id) => EDICT_BY_ID[id]).filter(Boolean);
}

export function edictSum(
  state: GameState,
  rulerId: string | undefined,
  key: 'income' | 'contentment' | 'development' | 'levies' | 'piety' | 'prestige' | 'upkeep',
): number {
  if (!rulerId) return 0;
  return edictsOf(state, rulerId).reduce((s, e) => s + (e[key] ?? 0), 0);
}

// --- Capitale et population ---
const CAP = BALANCE.capital;
const POP = BALANCE.population;

/** Le comté est-il la capitale de son seigneur ? */
export const isCapital = (c: County): boolean => !!c.seatOf && c.seatOf === c.holderId;

export const vitalityOf = (c: County): number => c.vitality ?? 1;

/** Population « normale » d'un comté (vitalité 1). */
export function basePopulation(c: County): number {
  return (
    (POP.base + c.development * POP.perDevelopment) *
    POP.terrain[c.terrain] *
    (isCapital(c) ? POP.capitalMult : 1)
  );
}

/** Nombre d'âmes, arrondi à la centaine. */
export function populationOf(c: County): number {
  return Math.round((basePopulation(c) * vitalityOf(c)) / 100) * 100;
}

/** Vitalité vers laquelle la population tend, selon le contentement. */
export function vitalityTarget(c: County): number {
  return POP.targetBase + contentmentOf(c) * POP.targetPerContentment;
}

/** Applique une perte (ou un gain) de population, en part de la vitalité. */
export function hurtPopulation(c: County, loss: number): void {
  c.vitality = clamp(vitalityOf(c) * (1 - loss), POP.vitalityMin, POP.vitalityMax);
}

export const countySlots = (c: County): number => c.slots + (isCapital(c) ? CAP.extraSlots : 0);
export const countyDevMax = (c: County): number =>
  BALANCE.economy.developmentMax + (isCapital(c) ? CAP.devMaxBonus : 0);

// --- Multiplicateurs d'un comté ---
/** Revenus du comté : impôts × contentement × population × capitale. */
export function countyIncomeMult(c: County): number {
  return (
    L.taxes[taxOf(c)].income *
    contentIncomeMult(c) *
    vitalityOf(c) *
    (isCapital(c) ? CAP.incomeMult : 1)
  );
}

/** Levées maximales : impôts × conscription × contentement × édits du seigneur. */
export function countyLevyMult(state: GameState, c: County): number {
  return (
    L.taxes[taxOf(c)].levies *
    L.conscription[conscriptionOf(c)].levies *
    contentLeviesMult(c) *
    vitalityOf(c) *
    (isCapital(c) ? CAP.leviesMult : 1) *
    (1 + edictSum(state, c.holderId, 'levies'))
  );
}

/** Croissance du développement. */
export function countyDevMult(state: GameState, c: County): number {
  return Math.max(
    0.1,
    L.conscription[conscriptionOf(c)].development *
      contentDevMult(c) *
      (isCapital(c) ? CAP.devGrowthMult : 1) *
      (1 + edictSum(state, c.holderId, 'development')),
  );
}

export interface Reason {
  label: string;
  value: number;
}

/** Variation du contentement à la prochaine saison, avec ses raisons. */
export function contentmentDelta(
  state: GameState,
  c: County,
): { total: number; reasons: Reason[] } {
  const reasons: Reason[] = [];
  const push = (label: string, value: number) =>
    Math.abs(value) >= 0.05 && reasons.push({ label, value: Math.round(value * 10) / 10 });
  push(`Impôts ${TAX_LABELS[taxOf(c)].toLowerCase()}`, L.taxes[taxOf(c)].contentment);
  push(
    `Conscription ${CONSCRIPTION_LABELS[conscriptionOf(c)].toLowerCase()}`,
    L.conscription[conscriptionOf(c)].contentment,
  );
  for (const e of edictsOf(state, c.holderId)) if (e.contentment) push(e.name, e.contentment);
  const chapels = c.buildings.filter((b) => b.type === 'chapelle').reduce((s, b) => s + b.level, 0);
  if (chapels && BUILDINGS.chapelle) push('Chapelle', chapels * L.chapelContentment);
  if (c.occupation) push('Occupation ennemie', L.occupiedContentment);
  if (c.plague) push('Épidémie', L.plagueContentment);
  push('Retour au calme', (L.contentmentRest - contentmentOf(c)) * L.contentmentReturn);
  return { total: reasons.reduce((s, r) => s + r.value, 0), reasons };
}

/** Risque de révolte paysanne par saison. */
export function revoltChance(c: County): number {
  const v = contentmentOf(c);
  return v < L.revoltThreshold ? (L.revoltThreshold - v) * L.revoltPerPoint : 0;
}
