import type { UnitType } from '../engine/state';

export interface UnitStats {
  label: string;
  short: string;
  /** Coût de recrutement d'une compagnie de 100 hommes (or). */
  recruit: number;
  /** Entretien par compagnie et par saison (or). */
  upkeep: number;
  attack: number;
  defense: number;
  morale: number;
  /** Bâtiment requis pour recruter (dans un comté du domaine propre). */
  building: 'caserne' | 'archerie' | 'ecuries' | null;
}

export const UNIT_TYPES: UnitType[] = ['levees', 'piquiers', 'archers', 'infanterie', 'cavalerie'];

export const UNITS: Record<UnitType, UnitStats> = {
  levees: { label: 'Levées', short: 'Lev', recruit: 0, upkeep: 1, attack: 2, defense: 2, morale: 40, building: null },
  piquiers: { label: 'Piquiers', short: 'Piq', recruit: 40, upkeep: 3, attack: 3, defense: 6, morale: 60, building: 'caserne' },
  archers: { label: 'Archers', short: 'Arc', recruit: 45, upkeep: 3, attack: 4, defense: 2, morale: 50, building: 'archerie' },
  infanterie: { label: 'Infanterie lourde', short: 'Inf', recruit: 70, upkeep: 5, attack: 6, defense: 6, morale: 70, building: 'caserne' },
  cavalerie: { label: 'Cavalerie lourde', short: 'Cav', recruit: 100, upkeep: 8, attack: 8, defense: 4, morale: 75, building: 'ecuries' },
};

/** Matrice des contres : COUNTERS[attaquant][cible] multiplie l'attaque. */
export const COUNTERS: Record<UnitType, Record<UnitType, number>> = {
  levees: { levees: 1.0, piquiers: 0.8, archers: 1.2, infanterie: 0.7, cavalerie: 0.8 },
  piquiers: { levees: 1.1, piquiers: 1.0, archers: 1.0, infanterie: 0.8, cavalerie: 1.8 },
  archers: { levees: 1.3, piquiers: 1.4, archers: 1.0, infanterie: 0.8, cavalerie: 0.7 },
  infanterie: { levees: 1.3, piquiers: 1.3, archers: 1.1, infanterie: 1.0, cavalerie: 0.9 },
  cavalerie: { levees: 1.5, piquiers: 0.6, archers: 1.6, infanterie: 1.0, cavalerie: 1.0 },
};
