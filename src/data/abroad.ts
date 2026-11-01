/**
 * Faits de saison chez les autres souverains (IA) : récoltes, fêtes, fondations, brigands…
 * Ils modifient vraiment leur trésor, leurs levées ou leurs comtés, et paraissent dans les
 * nouvelles du monde. Gabarits : {souverain}, {comte}, {maison}.
 */
import type { Terrain } from '../engine/state';

export interface AbroadEffect {
  gold?: number;
  prestige?: number;
  piety?: number;
  /** Développement du comté concerné. */
  development?: number;
  /** Part des levées du comté perdue (0,2 = −20 %) ou regagnée (négatif). */
  levyLoss?: number;
  contentment?: number;
  /** Population : part gagnée (positif) ou perdue (négatif). */
  population?: number;
}

export interface AbroadHappening {
  id: string;
  text: string;
  weight: number;
  /** Saisons possibles (0 printemps … 3 hiver) ; toutes si absent. */
  seasons?: number[];
  terrains?: Terrain[];
  coastal?: boolean;
  river?: boolean;
  /** Or minimal du souverain (dépenses volontaires : fêtes, fondations). */
  needGold?: number;
  /** Développement minimal du comté. */
  minDevelopment?: number;
  effect: AbroadEffect;
}

export const ABROAD: AbroadHappening[] = [
  {
    id: 'recolte_abondante',
    text: 'Récolte abondante à {comte} : les greniers de {souverain} débordent.',
    weight: 10,
    seasons: [1, 2],
    effect: { gold: 25, contentment: 5 },
  },
  {
    id: 'mauvaise_recolte',
    text: 'Mauvaise récolte à {comte}, sur les terres de {souverain} ; le pain renchérit.',
    weight: 9,
    seasons: [2],
    effect: { gold: -20, contentment: -8, levyLoss: 0.15 },
  },
  {
    id: 'famine',
    text: 'La famine frappe {comte} : les campagnes de {souverain} se vident.',
    weight: 3,
    seasons: [3, 0],
    minDevelopment: 2,
    effect: { development: -1, levyLoss: 0.3, contentment: -12, population: -0.12 },
  },
  {
    id: 'hiver_rude',
    text: 'Hiver terrible à {comte} : les routes sont coupées, les levées de {souverain} fondent.',
    weight: 6,
    seasons: [3],
    effect: { levyLoss: 0.15, contentment: -4, population: -0.03 },
  },
  {
    id: 'tournoi',
    text: '{souverain} donne un grand tournoi à {comte} ; chevaliers et ménestrels accourent.',
    weight: 7,
    seasons: [0, 1],
    needGold: 80,
    effect: { gold: -45, prestige: 45, contentment: 3 },
  },
  {
    id: 'fetes',
    text: 'Fêtes somptueuses à la cour de {souverain}.',
    weight: 6,
    needGold: 60,
    effect: { gold: -30, prestige: 25 },
  },
  {
    id: 'abbaye',
    text: '{souverain} fonde une abbaye à {comte}.',
    weight: 4,
    needGold: 120,
    effect: { gold: -70, piety: 60, contentment: 4 },
  },
  {
    id: 'pelerinage',
    text: '{souverain} revient d’un long pèlerinage, auréolé de piété.',
    weight: 4,
    seasons: [0, 1, 2],
    effect: { gold: -15, piety: 40, prestige: 10 },
  },
  {
    id: 'miracle',
    text: 'On crie au miracle à {comte} ; les fidèles affluent chez {souverain}.',
    weight: 3,
    effect: { piety: 25, contentment: 6 },
  },
  {
    id: 'brigands',
    text: 'Des brigands écument les chemins de {comte}, sur les terres de {souverain}.',
    weight: 7,
    terrains: ['foret', 'colline', 'marais', 'montagne'],
    effect: { gold: -10, levyLoss: 0.1, contentment: -6 },
  },
  {
    id: 'pirates',
    text: 'Des pirates pillent la côte de {comte} et brûlent les barques de pêcheurs.',
    weight: 5,
    coastal: true,
    seasons: [0, 1, 2],
    effect: { gold: -15, levyLoss: 0.1, contentment: -5 },
  },
  {
    id: 'crue',
    text: 'La rivière sort de son lit à {comte} ; moulins et ponts sont emportés.',
    weight: 4,
    river: true,
    seasons: [0, 2],
    effect: { gold: -15, levyLoss: 0.08, contentment: -4, population: -0.03 },
  },
  {
    id: 'incendie',
    text: 'Un incendie ravage la ville de {comte}.',
    weight: 3,
    minDevelopment: 3,
    effect: { development: -1, gold: -10, contentment: -6, population: -0.04 },
  },
  {
    id: 'foire',
    text: 'Une grande foire attire les marchands à {comte} ; {souverain} prélève ses droits.',
    weight: 6,
    terrains: ['plaine', 'colline'],
    seasons: [1, 2],
    effect: { gold: 30, contentment: 3 },
  },
  {
    id: 'essor',
    text: '{comte} prospère : artisans et colons s’y installent.',
    weight: 2,
    effect: { development: 1, contentment: 4, population: 0.04 },
  },
  {
    id: 'scandale',
    text: 'Un scandale éclabousse la maison {maison} : la cour de {souverain} en bruit.',
    weight: 4,
    effect: { prestige: -35 },
  },
  {
    id: 'mine',
    text: 'On découvre un filon d’argent près de {comte} : la fortune sourit à {souverain}.',
    weight: 2,
    terrains: ['montagne', 'colline'],
    effect: { gold: 60 },
  },
];
