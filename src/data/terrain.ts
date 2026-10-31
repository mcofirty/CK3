import type { Terrain } from '../engine/state';

export interface TerrainDef {
  label: string;
  /** Multiplicateur d'attaque de la cavalerie (les deux camps). */
  cavalryAttack: number;
  /** Multiplicateur d'attaque des archers (les deux camps). */
  archerAttack: number;
  /** Multiplicateur d'attaque de toutes les unités. */
  allAttack: number;
  /** Multiplicateur de défense du défenseur. */
  defenderDefense: number;
  /** Multiplicateur d'attaque des archers du défenseur. */
  defenderArcherAttack: number;
  /** Multiplicateur appliqué aux charges de l'attaquant. */
  attackerCharge: number;
  /** Moral perdu par l'attaquant à chaque round. */
  attackerMoralePerRound: number;
  /** Embuscade possible si le commandant défenseur a cette Ruse. */
  ambushRuse: number | null;
  /** Multiplicateur d'usure en campagne. */
  attrition: number;
  /** Couleur de la carte. */
  color: string;
  colorDark: string;
}

export const TERRAINS: Record<Terrain, TerrainDef> = {
  plaine: {
    label: 'Plaine',
    cavalryAttack: 1.2,
    archerAttack: 1,
    allAttack: 1,
    defenderDefense: 1,
    defenderArcherAttack: 1,
    attackerCharge: 1,
    attackerMoralePerRound: 0,
    ambushRuse: null,
    attrition: 1,
    color: '#d9cf98',
    colorDark: '#5d5836',
  },
  colline: {
    label: 'Colline',
    cavalryAttack: 1,
    archerAttack: 1,
    allAttack: 1,
    defenderDefense: 1.25,
    defenderArcherAttack: 1.2,
    attackerCharge: 0.85,
    attackerMoralePerRound: 0,
    ambushRuse: null,
    attrition: 1,
    color: '#c6b27c',
    colorDark: '#5f5234',
  },
  foret: {
    label: 'Forêt',
    cavalryAttack: 0.7,
    archerAttack: 0.8,
    allAttack: 1,
    defenderDefense: 1,
    defenderArcherAttack: 1,
    attackerCharge: 1,
    attackerMoralePerRound: 0,
    ambushRuse: 12,
    attrition: 1,
    color: '#8fae78',
    colorDark: '#2f4a2c',
  },
  marais: {
    label: 'Marais',
    cavalryAttack: 1,
    archerAttack: 1,
    allAttack: 0.8,
    defenderDefense: 1,
    defenderArcherAttack: 1,
    attackerCharge: 1,
    attackerMoralePerRound: 5,
    ambushRuse: null,
    attrition: 1.5,
    color: '#9fb39c',
    colorDark: '#34473f',
  },
  montagne: {
    label: 'Montagne',
    cavalryAttack: 0.6,
    archerAttack: 1,
    allAttack: 1,
    defenderDefense: 1.4,
    defenderArcherAttack: 1,
    attackerCharge: 1,
    attackerMoralePerRound: 0,
    ambushRuse: null,
    attrition: 1.5,
    color: '#b3a597',
    colorDark: '#4b443e',
  },
};

/** Rivière franchie : attaque de l'attaquant aux premiers rounds. */
export const RIVER = { attackerAttack: 0.7, rounds: 2 };
