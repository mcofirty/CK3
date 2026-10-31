import { UNIT_TYPES, UNITS } from '../data/units';
import type { UnitCounts, UnitType } from './state';

export function emptyUnits(): UnitCounts {
  return { levees: 0, piquiers: 0, archers: 0, infanterie: 0, cavalerie: 0 };
}

export function totalMen(u: Partial<UnitCounts>): number {
  let t = 0;
  for (const k of UNIT_TYPES) t += u[k] ?? 0;
  return t;
}

export function addUnits(a: UnitCounts, b: Partial<UnitCounts>): UnitCounts {
  const r = { ...a };
  for (const k of UNIT_TYPES) r[k] += b[k] ?? 0;
  return r;
}

export function scaleUnits(a: UnitCounts, f: number): UnitCounts {
  const r = { ...a };
  for (const k of UNIT_TYPES) r[k] *= f;
  return r;
}

export function share(u: UnitCounts, type: UnitType): number {
  const t = totalMen(u);
  return t > 0 ? u[type] / t : 0;
}

/** Valeur d'une armée en or (coût de recrutement équivalent). */
export function armyCost(u: UnitCounts): number {
  let c = 0;
  for (const k of UNIT_TYPES) c += (u[k] / 100) * (UNITS[k].recruit || 20);
  return c;
}

/** Puissance estimée (pour l'IA de campagne). */
export function armyStrength(u: UnitCounts): number {
  let s = 0;
  for (const k of UNIT_TYPES) {
    const st = UNITS[k];
    s += (u[k] / 100) * (st.attack + st.defense) * (0.5 + st.morale / 100);
  }
  return s;
}

/** Entretien par saison. */
export function armyUpkeep(u: UnitCounts): number {
  let c = 0;
  for (const k of UNIT_TYPES) c += (u[k] / 100) * UNITS[k].upkeep;
  return c;
}

export function roundUnits(u: UnitCounts): UnitCounts {
  const r = { ...u };
  for (const k of UNIT_TYPES) r[k] = Math.max(0, Math.round(r[k]));
  return r;
}
