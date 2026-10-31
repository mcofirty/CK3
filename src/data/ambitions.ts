/**
 * Ambitions : à son avènement, le souverain choisit un grand but parmi trois.
 * Réussir rapporte prestige, renommée et expérience ; échouer pèse sur l'esprit.
 */
import type { SkillKey } from '../engine/state';

export type AmbitionKind =
  | 'comtes'
  | 'or'
  | 'batiments'
  | 'victoires'
  | 'royaume'
  | 'duche'
  | 'piete'
  | 'enfants'
  | 'developpement'
  | 'paix'
  | 'alliances'
  | 'amis'
  | 'complots'
  | 'savoir'
  | 'renommee';

export interface AmbitionDef {
  id: string;
  name: string;
  /** {n} est remplacé par la cible. */
  description: string;
  kind: AmbitionKind;
  /** Cible relative à la valeur au moment du choix… */
  delta?: number;
  /** …ou absolue. */
  absolute?: number;
  years: number;
  reward: { prestige: number; renown: number; xp: SkillKey };
  icon: string;
}

export const AMBITIONS: AmbitionDef[] = [
  {
    id: 'unir_terres',
    name: 'Agrandir le royaume',
    description: 'Gagner {n} comtés de plus dans votre royaume.',
    kind: 'comtes',
    delta: 2,
    years: 12,
    reward: { prestige: 250, renown: 60, xp: 'guerre' },
    icon: '🗺️',
  },
  {
    id: 'tresor',
    name: 'Remplir le trésor',
    description: 'Amasser {n} pièces d’or.',
    kind: 'or',
    absolute: 600,
    years: 10,
    reward: { prestige: 150, renown: 40, xp: 'gestion' },
    icon: '💰',
  },
  {
    id: 'batisseur',
    name: 'Bâtir pour les siècles',
    description: 'Lancer {n} chantiers de plus.',
    kind: 'batiments',
    delta: 4,
    years: 10,
    reward: { prestige: 180, renown: 50, xp: 'gestion' },
    icon: '🏰',
  },
  {
    id: 'gloire',
    name: 'Gloire des armes',
    description: 'Remporter {n} batailles.',
    kind: 'victoires',
    delta: 3,
    years: 12,
    reward: { prestige: 250, renown: 60, xp: 'guerre' },
    icon: '⚔️',
  },
  {
    id: 'couronne',
    name: 'Ceindre une couronne',
    description: 'Créer ou tenir un titre royal.',
    kind: 'royaume',
    absolute: 1,
    years: 15,
    reward: { prestige: 400, renown: 120, xp: 'diplomatie' },
    icon: '👑',
  },
  {
    id: 'duche',
    name: 'Un duché de plus',
    description: 'Tenir {n} titre(s) ducal(aux).',
    kind: 'duche',
    delta: 1,
    years: 12,
    reward: { prestige: 200, renown: 50, xp: 'diplomatie' },
    icon: '🛡️',
  },
  {
    id: 'devotion',
    name: 'Une vie de dévotion',
    description: 'Atteindre {n} de piété.',
    kind: 'piete',
    delta: 250,
    years: 10,
    reward: { prestige: 120, renown: 40, xp: 'savoir' },
    icon: '✝️',
  },
  {
    id: 'descendance',
    name: 'Une grande descendance',
    description: 'Avoir {n} enfants vivants.',
    kind: 'enfants',
    delta: 2,
    years: 10,
    reward: { prestige: 120, renown: 60, xp: 'diplomatie' },
    icon: '👪',
  },
  {
    id: 'prosperite',
    name: 'Prospérité du domaine',
    description: 'Porter le développement total de votre domaine à {n}.',
    kind: 'developpement',
    delta: 3,
    years: 12,
    reward: { prestige: 150, renown: 50, xp: 'gestion' },
    icon: '🌾',
  },
  {
    id: 'paix',
    name: 'Le prince de la paix',
    description: 'Rester {n} saisons sans guerre.',
    kind: 'paix',
    absolute: 24,
    years: 8,
    reward: { prestige: 150, renown: 40, xp: 'diplomatie' },
    icon: '🕊️',
  },
  {
    id: 'alliances',
    name: 'Tisser des alliances',
    description: 'Compter {n} alliés.',
    kind: 'alliances',
    delta: 2,
    years: 10,
    reward: { prestige: 150, renown: 50, xp: 'diplomatie' },
    icon: '🤝',
  },
  {
    id: 'amitie',
    name: 'Une cour d’amis',
    description: 'Compter {n} amis.',
    kind: 'amis',
    delta: 2,
    years: 8,
    reward: { prestige: 100, renown: 30, xp: 'diplomatie' },
    icon: '🍷',
  },
  {
    id: 'ombres',
    name: 'Maître des ombres',
    description: 'Mener {n} complots à leur terme.',
    kind: 'complots',
    delta: 2,
    years: 10,
    reward: { prestige: 100, renown: 40, xp: 'ruse' },
    icon: '🗝️',
  },
  {
    id: 'erudit',
    name: 'Devenir un érudit',
    description: 'Atteindre {n} en Savoir.',
    kind: 'savoir',
    delta: 3,
    years: 10,
    reward: { prestige: 120, renown: 50, xp: 'savoir' },
    icon: '📜',
  },
  {
    id: 'renom',
    name: 'Un nom qui résonne',
    description: 'Porter la renommée de la maison à {n}.',
    kind: 'renommee',
    delta: 150,
    years: 12,
    reward: { prestige: 150, renown: 0, xp: 'diplomatie' },
    icon: '🏛️',
  },
];

export const AMBITION_BY_ID: Record<string, AmbitionDef> = Object.fromEntries(
  AMBITIONS.map((a) => [a.id, a]),
);
