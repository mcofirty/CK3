/**
 * Tactiques de bataille : chaque camp reçoit une main au début de la bataille et peut en
 * jouer une par round, une seule fois chacune.
 */
import type { Order } from '../engine/battle/types';
import type { UnitType } from '../engine/state';

export type TacticId =
  | 'harangue'
  | 'pluie_fleches'
  | 'charge_lourde'
  | 'mur_boucliers'
  | 'feux_trompeurs'
  | 'contre_attaque'
  | 'cri_de_guerre'
  | 'percee'
  | 'ordre_serre'
  | 'diversion';

export interface TacticDef {
  id: TacticId;
  name: string;
  icon: string;
  description: string;
  // --- Conditions pour l'avoir en main ---
  /** Part minimale de ces unités dans l'armée. */
  minShare?: { units: UnitType[]; share: number };
  /** Guerre ou Ruse minimale du commandant principal. */
  minGuerre?: number;
  minRuse?: number;
  /** Le souverain doit commander. */
  sovereign?: boolean;
  // --- Effets pendant le round où elle est jouée ---
  /** Moral ajouté aux fronts actifs du camp. */
  morale?: number;
  /** Moral retiré aux fronts actifs adverses. */
  enemyMorale?: number;
  /** Moral retiré à la réserve adverse. */
  enemyReserveMorale?: number;
  /** Attaque ×x pour les fronts qui suivent ces ordres (« all » = tous). */
  attack?: Partial<Record<Order | 'all', number>>;
  /** Attaque ×x par type d'unité. */
  unitAttack?: Partial<Record<UnitType, number>>;
  /** Défense ×x pour les fronts qui suivent ces ordres. */
  defense?: Partial<Record<Order | 'all', number>>;
  /** Pertes de moral subies ×x. */
  moraleLoss?: number;
  /** Volées rendues aux archers. */
  volleys?: number;
  /** Un front qui tient et se fait charger frappe ×x. */
  counter?: number;
  /** Annule la tactique adverse du round. */
  cancel?: boolean;
}

export const TACTICS: Record<TacticId, TacticDef> = {
  harangue: {
    id: 'harangue',
    name: 'Harangue',
    icon: '📣',
    description: '+12 de moral sur tous vos fronts.',
    morale: 12,
  },
  pluie_fleches: {
    id: 'pluie_fleches',
    name: 'Pluie de flèches',
    icon: '🏹',
    description: 'Archers ×1,7 ce round et une volée de plus.',
    minShare: { units: ['archers'], share: 0.12 },
    unitAttack: { archers: 1.7 },
    volleys: 1,
  },
  charge_lourde: {
    id: 'charge_lourde',
    name: 'Charge lourde',
    icon: '🐎',
    description: 'Cavalerie ×1,5 sur les fronts qui chargent.',
    minShare: { units: ['cavalerie'], share: 0.08 },
    unitAttack: { cavalerie: 1.5 },
  },
  mur_boucliers: {
    id: 'mur_boucliers',
    name: 'Mur de boucliers',
    icon: '🛡️',
    description: 'Défense ×1,35 pour les fronts qui tiennent.',
    minShare: { units: ['piquiers', 'infanterie'], share: 0.2 },
    defense: { tenir: 1.35 },
  },
  feux_trompeurs: {
    id: 'feux_trompeurs',
    name: 'Feux trompeurs',
    icon: '🔥',
    description: '−6 de moral sur les fronts ennemis, −15 à leur réserve.',
    minRuse: 12,
    enemyMorale: 6,
    enemyReserveMorale: 15,
  },
  contre_attaque: {
    id: 'contre_attaque',
    name: 'Contre-attaque',
    icon: '⚔️',
    description: 'Un front qui tient et se fait charger frappe ×1,6.',
    minGuerre: 12,
    counter: 1.6,
  },
  cri_de_guerre: {
    id: 'cri_de_guerre',
    name: 'Cri de guerre',
    icon: '👑',
    description: 'Le souverain mène : +8 de moral, −5 chez l’ennemi.',
    sovereign: true,
    morale: 8,
    enemyMorale: 5,
  },
  percee: {
    id: 'percee',
    name: 'Percée',
    icon: '➶',
    description: 'Attaque ×1,3 pour les fronts qui chargent, défense ×0,85.',
    attack: { charger: 1.3 },
    defense: { charger: 0.85 },
  },
  ordre_serre: {
    id: 'ordre_serre',
    name: 'Ordre serré',
    icon: '▦',
    description: 'Pertes de moral −40 % ce round.',
    minGuerre: 10,
    moraleLoss: 0.6,
  },
  diversion: {
    id: 'diversion',
    name: 'Diversion',
    icon: '🎭',
    description: 'Annule la tactique adverse de ce round.',
    minRuse: 14,
    cancel: true,
  },
};

export const TACTIC_IDS = Object.keys(TACTICS) as TacticId[];
