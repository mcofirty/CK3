/**
 * Décisions actives : le joueur agit au lieu d'attendre. Chacune coûte quelque chose,
 * revient après un délai et ouvre un événement (src/data/events/decisions.json).
 */
import type { Condition } from '../engine/events/types';

export interface DecisionDef {
  id: string;
  name: string;
  icon: string;
  description: string;
  cost: { or?: number; prestige?: number; piete?: number };
  /** Délai avant de pouvoir recommencer (années). */
  cooldownYears: number;
  conditions?: Condition[];
  /** Raison affichée si les conditions ne sont pas remplies. */
  conditionText?: string;
  /** Identifiant de l'événement ouvert. */
  event: string;
}

export const DECISIONS: DecisionDef[] = [
  {
    id: 'tournoi',
    name: 'Organiser un tournoi',
    icon: '🏇',
    description:
      'Les chevaliers du royaume s’affrontent en lice. Prestige, amitiés… et peut-être une blessure si vous combattez vous-même.',
    cost: { or: 100 },
    cooldownYears: 4,
    conditions: [{ en_guerre: false }],
    conditionText: 'Impossible en temps de guerre',
    event: 'dec_tournoi',
  },
  {
    id: 'chasse',
    name: 'Partir à la chasse',
    icon: '🦌',
    description: 'Quelques jours en forêt pour oublier les soucis du trône.',
    cost: { or: 25 },
    cooldownYears: 1,
    event: 'dec_chasse',
  },
  {
    id: 'festin',
    name: 'Donner un festin',
    icon: '🍗',
    description: 'Vassaux et courtisans à votre table : l’occasion de nouer des liens.',
    cost: { or: 60 },
    cooldownYears: 2,
    event: 'dec_festin',
  },
  {
    id: 'pelerinage',
    name: 'Partir en pèlerinage',
    icon: '🕯️',
    description:
      'Une longue route vers un sanctuaire lointain. Piété et sérénité, si l’on revient.',
    cost: { or: 50 },
    cooldownYears: 6,
    conditions: [{ en_guerre: false }, { age_max: 65 }],
    conditionText: 'Ni en guerre, ni trop âgé',
    event: 'dec_pelerinage',
  },
  {
    id: 'retraite',
    name: 'Retraite spirituelle',
    icon: '⛪',
    description: 'Quelques semaines de silence dans un monastère.',
    cost: { prestige: 30 },
    cooldownYears: 2,
    event: 'dec_retraite',
  },
  {
    id: 'grand_conseil',
    name: 'Réunir les vassaux',
    icon: '🏛️',
    description: 'Écouter les doléances des grands du royaume.',
    cost: { prestige: 50 },
    cooldownYears: 3,
    conditions: [{ comtes_min: 3 }],
    conditionText: 'Il faut un royaume d’au moins 3 comtés',
    event: 'dec_grand_conseil',
  },
  {
    id: 'chroniqueur',
    name: 'Engager un chroniqueur',
    icon: '🖋️',
    description: 'Qu’un lettré consigne les hauts faits de la maison pour la postérité.',
    cost: { or: 80 },
    cooldownYears: 8,
    event: 'dec_chroniqueur',
  },
  {
    id: 'inspection',
    name: 'Inspecter le domaine',
    icon: '🌾',
    description: 'Parcourir vos terres, écouter les intendants, corriger les abus.',
    cost: { or: 30 },
    cooldownYears: 3,
    event: 'dec_inspection',
  },
];

export const DECISION_BY_ID: Record<string, DecisionDef> = Object.fromEntries(
  DECISIONS.map((d) => [d.id, d]),
);
