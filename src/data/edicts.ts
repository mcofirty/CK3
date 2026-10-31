/**
 * Édits du royaume : des politiques économiques que le souverain proclame ou abroge.
 * Chacun a un coût de proclamation, éventuellement un entretien, et des effets.
 */
export interface EdictDef {
  id: string;
  name: string;
  icon: string;
  description: string;
  /** Or payé à la proclamation. */
  cost: number;
  /** Or par saison tant que l'édit est en vigueur. */
  upkeep?: number;
  /** Revenus du domaine : ×(1 + x). */
  income?: number;
  /** Contentement par saison dans tout le domaine. */
  contentment?: number;
  /** Développement : ×(1 + x). */
  development?: number;
  /** Piété et prestige par saison. */
  piety?: number;
  prestige?: number;
  /** Levées : ×(1 + x). */
  levies?: number;
  /** Saisons avant de pouvoir le proclamer à nouveau une fois abrogé. */
  cooldown: number;
}

export const EDICTS: EdictDef[] = [
  {
    id: 'greniers',
    name: 'Greniers publics',
    icon: '🌾',
    description: 'Des réserves de grain pour les mauvais jours : le peuple mange à sa faim.',
    cost: 60,
    upkeep: 6,
    contentment: 2,
    cooldown: 4,
  },
  {
    id: 'foires',
    name: 'Foires franches',
    icon: '🎪',
    description: 'Les marchands ne paient plus de taxes aux foires : le commerce fleurit.',
    cost: 40,
    income: -0.1,
    development: 0.4,
    contentment: 0.5,
    cooldown: 4,
  },
  {
    id: 'peages',
    name: 'Péages sur les routes',
    icon: '🚧',
    description: 'Chaque pont, chaque gué rapporte. Les voyageurs grognent, le commerce ralentit.',
    cost: 30,
    income: 0.12,
    development: -0.2,
    contentment: -1,
    cooldown: 4,
  },
  {
    id: 'aumones',
    name: 'Aumônes seigneuriales',
    icon: '🕯️',
    description: 'Le souverain nourrit les pauvres aux portes des églises.',
    cost: 20,
    upkeep: 5,
    contentment: 1,
    piety: 1,
    cooldown: 4,
  },
  {
    id: 'cadastre',
    name: 'Cadastre',
    icon: '📜',
    description: 'Chaque champ est arpenté et inscrit : plus rien n’échappe au percepteur.',
    cost: 120,
    income: 0.1,
    contentment: -0.5,
    cooldown: 8,
  },
  {
    id: 'milices',
    name: 'Milices communales',
    icon: '🛡️',
    description: 'Les villages entretiennent leurs propres hommes en armes.',
    cost: 50,
    upkeep: 4,
    levies: 0.2,
    contentment: -0.5,
    cooldown: 4,
  },
];

export const EDICT_BY_ID: Record<string, EdictDef> = Object.fromEntries(
  EDICTS.map((e) => [e.id, e]),
);
