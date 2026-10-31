import type { BuildingType, UnitType } from '../engine/state';

export interface BuildingLevel {
  cost: number;
  seasons: number;
  /** Or par saison. */
  income?: number;
  /** Hommes de levée supplémentaires. */
  levies?: number;
  /** Bonus de chance de développement par saison (en points de %). */
  development?: number;
  /** Niveaux de fortification. */
  fort?: number;
  /** Piété par saison. */
  piety?: number;
  /** Ravitaillement regagné par une armée amie dans le comté. */
  supply?: number;
  /** Compagnies recrutables par saison. */
  recruitCap?: number;
}

export interface BuildingDef {
  id: BuildingType;
  name: string;
  description: string;
  levels: [BuildingLevel, BuildingLevel];
  /** Types d'unités débloqués au recrutement. */
  unlocks?: UnitType[];
  /** Une Route permet de traverser 2 comtés par saison. */
  road?: boolean;
}

export const BUILDINGS: Record<BuildingType, BuildingDef> = {
  marche: {
    id: 'marche', name: 'Marché', description: 'Augmente les revenus du comté.',
    levels: [
      { cost: 60, seasons: 2, income: 2 },
      { cost: 120, seasons: 3, income: 4 },
    ],
  },
  ferme: {
    id: 'ferme', name: 'Ferme', description: 'Plus de levées et un meilleur ravitaillement.',
    levels: [
      { cost: 50, seasons: 2, levies: 100, supply: 10, income: 0.5 },
      { cost: 100, seasons: 3, levies: 200, supply: 20, income: 1 },
    ],
  },
  caserne: {
    id: 'caserne', name: 'Caserne', description: 'Permet de recruter piquiers et infanterie lourde.',
    unlocks: ['piquiers', 'infanterie'],
    levels: [
      { cost: 80, seasons: 2, levies: 50, recruitCap: 2 },
      { cost: 150, seasons: 3, levies: 100, recruitCap: 4 },
    ],
  },
  ecuries: {
    id: 'ecuries', name: 'Écuries', description: 'Permet de recruter la cavalerie lourde.',
    unlocks: ['cavalerie'],
    levels: [
      { cost: 100, seasons: 3, recruitCap: 1 },
      { cost: 180, seasons: 3, recruitCap: 3 },
    ],
  },
  archerie: {
    id: 'archerie', name: 'Archerie', description: 'Permet de recruter des archers.',
    unlocks: ['archers'],
    levels: [
      { cost: 70, seasons: 2, recruitCap: 2 },
      { cost: 130, seasons: 3, recruitCap: 4 },
    ],
  },
  muraille: {
    id: 'muraille', name: 'Muraille', description: '+1 niveau de fortification par niveau.',
    levels: [
      { cost: 100, seasons: 3, fort: 1 },
      { cost: 180, seasons: 4, fort: 1 },
    ],
  },
  chapelle: {
    id: 'chapelle', name: 'Chapelle', description: 'Produit de la piété et favorise le développement.',
    levels: [
      { cost: 50, seasons: 2, piety: 1, development: 1 },
      { cost: 100, seasons: 3, piety: 2, development: 2 },
    ],
  },
  route: {
    id: 'route', name: 'Route', description: 'Les armées traversent 2 comtés par saison depuis ce comté.',
    road: true,
    levels: [
      { cost: 60, seasons: 2, income: 0.5, development: 1 },
      { cost: 110, seasons: 2, income: 1, development: 2, supply: 10 },
    ],
  },
};

export const BUILDING_TYPES = Object.keys(BUILDINGS) as BuildingType[];
