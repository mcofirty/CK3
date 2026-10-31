/**
 * Arbres de compétences.
 * - Talents : propres à un personnage, gagnés avec l'expérience, perdus à sa mort.
 * - Héritages : propres à la maison, achetés avec la renommée, conservés jusqu'à la fin.
 */
import type { SkillKey, Skills } from '../engine/state';
import type { TacticId } from './tactics';

/** Bonus génériques ; chaque clé est lue à un seul endroit du moteur. */
export interface PerkEffects {
  /** Compétences (talents uniquement). */
  skills?: Partial<Skills>;
  /** Santé (talents uniquement). */
  health?: number;
  /** Revenus du domaine propre : ×(1 + x). */
  income?: number;
  /** Levées disponibles : ×(1 + x). */
  levies?: number;
  /** Opinion des vassaux envers ce suzerain. */
  vassalOpinion?: number;
  /** Opinion de tous envers ce personnage. */
  opinionAll?: number;
  /** Progression de ses complots : ×(1 + x). */
  plotPower?: number;
  /** Chance de découvrir les complots dirigés contre lui (par saison). */
  plotDefense?: number;
  /** Stress gagné : ×(1 + x). */
  stressGain?: number;
  /** Baisse du stress par saison. */
  stressDecay?: number;
  /** Prestige par saison. */
  prestige?: number;
  /** Piété par saison. */
  piety?: number;
  /** Renommée de la maison par saison. */
  renown?: number;
  /** Coût des bâtiments : ×(1 + x). */
  buildCost?: number;
  /** Usure des armées : ×(1 + x). */
  attrition?: number;
  /** Ravitaillement regagné en terre amie. */
  supply?: number;
  /** Acceptation des mariages et alliances. */
  acceptance?: number;
  /** Tactique toujours présente dans la main en bataille. */
  tactic?: TacticId;
  /** Guerre en commandement. */
  commander?: number;
  /** Moral de départ des troupes qu'il commande. */
  morale?: number;
  /** Bonus en duel. */
  duel?: number;
  /** Fertilité : ×(1 + x). */
  fertility?: number;
  /** Expérience gagnée : ×(1 + x). */
  xpGain?: number;
  /** Croissance du développement : ×(1 + x). */
  development?: number;
  /** Risque de décès : ×(1 + x). */
  deathChance?: number;
  /** Compétences gagnées à la majorité par les enfants de la maison (héritages). */
  education?: Partial<Skills>;
}

export type PerkKey = Exclude<keyof PerkEffects, 'skills' | 'education' | 'tactic'>;

export interface PerkDef extends PerkEffects {
  id: string;
  name: string;
  branch: SkillKey;
  /** 1 à 4 ; un talent de rang n demande un talent de rang n-1 de la même branche. */
  tier: 1 | 2 | 3 | 4;
  description: string;
}

export const BRANCH_NAMES: Record<SkillKey, string> = {
  diplomatie: 'Cour',
  guerre: 'Fer',
  gestion: 'Domaine',
  ruse: 'Ombres',
  savoir: 'Érudition',
};

const list: PerkDef[] = [
  // --- Diplomatie ---
  {
    id: 'bienseance',
    name: 'Bienséance',
    branch: 'diplomatie',
    tier: 1,
    description: '+5 d’opinion de tous.',
    opinionAll: 5,
  },
  {
    id: 'charisme',
    name: 'Charisme',
    branch: 'diplomatie',
    tier: 2,
    description: '+2 en Diplomatie.',
    skills: { diplomatie: 2 },
  },
  {
    id: 'entremetteur',
    name: 'Entremetteur',
    branch: 'diplomatie',
    tier: 2,
    description: '+15 d’acceptation pour les mariages et alliances.',
    acceptance: 15,
  },
  {
    id: 'suzerain_aime',
    name: 'Suzerain aimé',
    branch: 'diplomatie',
    tier: 3,
    description: '+10 d’opinion des vassaux.',
    vassalOpinion: 10,
  },
  {
    id: 'orateur',
    name: 'Orateur',
    branch: 'diplomatie',
    tier: 3,
    description: 'Tactique « Harangue » toujours en main ; +0,5 prestige par saison.',
    tactic: 'harangue',
    prestige: 0.5,
  },
  {
    id: 'voix_royaume',
    name: 'Voix du royaume',
    branch: 'diplomatie',
    tier: 4,
    description: '+2 en Diplomatie, +10 d’opinion de tous, +1 prestige par saison.',
    skills: { diplomatie: 2 },
    opinionAll: 10,
    prestige: 1,
  },
  // --- Guerre ---
  {
    id: 'discipline',
    name: 'Discipline',
    branch: 'guerre',
    tier: 1,
    description: '+5 de moral de départ pour les troupes qu’il commande.',
    morale: 5,
  },
  {
    id: 'meneur',
    name: 'Meneur d’hommes',
    branch: 'guerre',
    tier: 2,
    description: '+2 en Guerre lorsqu’il commande.',
    commander: 2,
  },
  {
    id: 'logisticien',
    name: 'Logisticien',
    branch: 'guerre',
    tier: 2,
    description: 'Usure −25 %, +10 de ravitaillement par saison en terre amie.',
    attrition: -0.25,
    supply: 10,
  },
  {
    id: 'maitre_cavalerie',
    name: 'Maître de cavalerie',
    branch: 'guerre',
    tier: 3,
    description: 'Tactique « Charge lourde » toujours en main ; +1 en Guerre.',
    tactic: 'charge_lourde',
    skills: { guerre: 1 },
  },
  {
    id: 'duelliste',
    name: 'Duelliste',
    branch: 'guerre',
    tier: 3,
    description: '+5 en duel, +5 de santé.',
    duel: 5,
    health: 5,
  },
  {
    id: 'conquerant',
    name: 'Conquérant',
    branch: 'guerre',
    tier: 4,
    description: '+3 en Guerre en commandement, levées +15 %, tactique « Percée » en main.',
    commander: 3,
    levies: 0.15,
    tactic: 'percee',
  },
  // --- Gestion ---
  {
    id: 'comptable',
    name: 'Comptable',
    branch: 'gestion',
    tier: 1,
    description: 'Revenus du domaine +8 %.',
    income: 0.08,
  },
  {
    id: 'batisseur',
    name: 'Bâtisseur',
    branch: 'gestion',
    tier: 2,
    description: 'Bâtiments −20 % de coût.',
    buildCost: -0.2,
  },
  {
    id: 'recruteur',
    name: 'Recruteur',
    branch: 'gestion',
    tier: 2,
    description: 'Levées +15 %.',
    levies: 0.15,
  },
  {
    id: 'agronome',
    name: 'Agronome',
    branch: 'gestion',
    tier: 3,
    description: 'Développement des comtés +50 %.',
    development: 0.5,
  },
  {
    id: 'fiscaliste',
    name: 'Fiscaliste',
    branch: 'gestion',
    tier: 3,
    description: 'Revenus du domaine +12 %.',
    income: 0.12,
  },
  {
    id: 'grand_intendant',
    name: 'Grand intendant',
    branch: 'gestion',
    tier: 4,
    description: '+3 en Gestion, revenus +10 %, bâtiments −10 %.',
    skills: { gestion: 3 },
    income: 0.1,
    buildCost: -0.1,
  },
  // --- Ruse ---
  {
    id: 'mille_oreilles',
    name: 'Mille oreilles',
    branch: 'ruse',
    tier: 1,
    description: '+4 % par saison de découvrir les complots contre lui.',
    plotDefense: 0.04,
  },
  {
    id: 'conspirateur',
    name: 'Conspirateur',
    branch: 'ruse',
    tier: 2,
    description: 'Complots +25 % plus rapides.',
    plotPower: 0.25,
  },
  {
    id: 'menteur',
    name: 'Langue d’argent',
    branch: 'ruse',
    tier: 2,
    description: '+2 en Ruse.',
    skills: { ruse: 2 },
  },
  {
    id: 'empoisonneur',
    name: 'Empoisonneur',
    branch: 'ruse',
    tier: 3,
    description: 'Complots +25 % plus rapides, +1 en Ruse.',
    plotPower: 0.25,
    skills: { ruse: 1 },
  },
  {
    id: 'maitre_feintes',
    name: 'Maître des feintes',
    branch: 'ruse',
    tier: 3,
    description: 'Tactique « Feux trompeurs » toujours en main.',
    tactic: 'feux_trompeurs',
  },
  {
    id: 'araignee',
    name: 'Araignée',
    branch: 'ruse',
    tier: 4,
    description: '+2 en Ruse, +6 % de découverte des complots, tactique « Diversion » en main.',
    skills: { ruse: 2 },
    plotDefense: 0.06,
    tactic: 'diversion',
  },
  // --- Savoir ---
  {
    id: 'curiosite',
    name: 'Curiosité',
    branch: 'savoir',
    tier: 1,
    description: 'Expérience +20 %.',
    xpGain: 0.2,
  },
  {
    id: 'medecine',
    name: 'Médecine',
    branch: 'savoir',
    tier: 2,
    description: '+10 de santé, fertilité +15 %.',
    health: 10,
    fertility: 0.15,
  },
  {
    id: 'theologie',
    name: 'Théologie',
    branch: 'savoir',
    tier: 2,
    description: '+1 piété par saison.',
    piety: 1,
  },
  {
    id: 'serenite',
    name: 'Sérénité',
    branch: 'savoir',
    tier: 3,
    description: 'Stress gagné −30 %, le stress retombe plus vite.',
    stressGain: -0.3,
    stressDecay: 2,
  },
  {
    id: 'astronomie',
    name: 'Astronomie',
    branch: 'savoir',
    tier: 3,
    description: '+2 en Savoir, développement +30 %.',
    skills: { savoir: 2 },
    development: 0.3,
  },
  {
    id: 'sage',
    name: 'Sage',
    branch: 'savoir',
    tier: 4,
    description: '+3 en Savoir, expérience +25 %, +0,5 renommée par saison.',
    skills: { savoir: 3 },
    xpGain: 0.25,
    renown: 0.5,
  },
];

export const PERKS: Record<string, PerkDef> = Object.fromEntries(list.map((p) => [p.id, p]));

// ---------------------------------------------------------------------------
// Héritages de la maison
// ---------------------------------------------------------------------------

export interface LegacyDef extends PerkEffects {
  id: string;
  name: string;
  branch: SkillKey;
  tier: 1 | 2 | 3;
  description: string;
}

export const LEGACY_BRANCH_NAMES: Record<SkillKey, string> = {
  diplomatie: 'Sang bleu',
  guerre: 'Sang de fer',
  gestion: 'Bâtisseurs',
  ruse: 'Ombres de la maison',
  savoir: 'Érudition',
};

const legacies: LegacyDef[] = [
  {
    id: 'bonnes_manieres',
    name: 'Bonnes manières',
    branch: 'diplomatie',
    tier: 1,
    description: 'Les enfants de la maison gagnent +2 en Diplomatie à leur majorité.',
    education: { diplomatie: 2 },
  },
  {
    id: 'reseau_familial',
    name: 'Réseau familial',
    branch: 'diplomatie',
    tier: 2,
    description: '+15 d’acceptation pour les mariages et alliances.',
    acceptance: 15,
  },
  {
    id: 'prestige_ancien',
    name: 'Prestige ancien',
    branch: 'diplomatie',
    tier: 3,
    description: '+1 prestige par saison, +5 d’opinion des vassaux.',
    prestige: 1,
    vassalOpinion: 5,
  },
  {
    id: 'tradition_martiale',
    name: 'Tradition martiale',
    branch: 'guerre',
    tier: 1,
    description: 'Les enfants de la maison gagnent +2 en Guerre à leur majorité.',
    education: { guerre: 2 },
  },
  {
    id: 'bannieres',
    name: 'Bannières de la maison',
    branch: 'guerre',
    tier: 2,
    description: '+5 de moral de départ, levées +10 %.',
    morale: 5,
    levies: 0.1,
  },
  {
    id: 'lignee_conquerants',
    name: 'Lignée de conquérants',
    branch: 'guerre',
    tier: 3,
    description: '+2 en Guerre en commandement, tactique « Cri de guerre » en main.',
    commander: 2,
    tactic: 'cri_de_guerre',
  },
  {
    id: 'sens_affaires',
    name: 'Sens des affaires',
    branch: 'gestion',
    tier: 1,
    description: 'Les enfants de la maison gagnent +2 en Gestion à leur majorité.',
    education: { gestion: 2 },
  },
  {
    id: 'tresor_familial',
    name: 'Trésor familial',
    branch: 'gestion',
    tier: 2,
    description: 'Revenus du domaine +8 %.',
    income: 0.08,
  },
  {
    id: 'grands_chantiers',
    name: 'Grands chantiers',
    branch: 'gestion',
    tier: 3,
    description: 'Bâtiments −20 %, développement +30 %.',
    buildCost: -0.2,
    development: 0.3,
  },
  {
    id: 'secrets_famille',
    name: 'Secrets de famille',
    branch: 'ruse',
    tier: 1,
    description: 'Les enfants de la maison gagnent +2 en Ruse à leur majorité.',
    education: { ruse: 2 },
  },
  {
    id: 'espions_maison',
    name: 'Espions de la maison',
    branch: 'ruse',
    tier: 2,
    description: '+5 % de découverte des complots, complots +15 %.',
    plotDefense: 0.05,
    plotPower: 0.15,
  },
  {
    id: 'loi_du_silence',
    name: 'Loi du silence',
    branch: 'ruse',
    tier: 3,
    description: 'Complots +25 %, +5 % de découverte, stress −15 %.',
    plotPower: 0.25,
    plotDefense: 0.05,
    stressGain: -0.15,
  },
  {
    id: 'precepteurs',
    name: 'Précepteurs',
    branch: 'savoir',
    tier: 1,
    description: 'Les enfants de la maison gagnent +2 en Savoir à leur majorité.',
    education: { savoir: 2 },
  },
  {
    id: 'sang_robuste',
    name: 'Sang robuste',
    branch: 'savoir',
    tier: 2,
    description: 'Risque de décès −15 %, fertilité +15 %.',
    deathChance: -0.15,
    fertility: 0.15,
  },
  {
    id: 'longevite',
    name: 'Longévité',
    branch: 'savoir',
    tier: 3,
    description: 'Risque de décès −20 %, stress −20 %, expérience +15 %.',
    deathChance: -0.2,
    stressGain: -0.2,
    xpGain: 0.15,
  },
];

export const LEGACIES: Record<string, LegacyDef> = Object.fromEntries(
  legacies.map((p) => [p.id, p]),
);
