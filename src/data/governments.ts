/**
 * Gouvernements et lois de succession. Le gouvernement d'un souverain fixe ses forces (revenus,
 * levées, loyauté des vassaux) et les lois de succession qu'il peut adopter.
 */
import type { GovernmentId, SuccessionLaw } from '../engine/state';

export interface GovernmentDef {
  name: string;
  description: string;
  /** Revenus du domaine et levées : part en plus ou en moins. */
  income: number;
  levies: number;
  /** Opinion des vassaux envers leur suzerain. */
  vassalOpinion: number;
  laws: SuccessionLaw[];
  defaultLaw: SuccessionLaw;
}

export const GOVERNMENTS: Record<GovernmentId, GovernmentDef> = {
  tribal: {
    name: 'Tribu',
    description:
      'Un chef de guerre entouré de ses fidèles : levées nombreuses, mais peu d’impôts. La terre se partage, ou va au plus ancien, ou au plus digne.',
    income: -0.2,
    levies: 0.25,
    vassalOpinion: 5,
    laws: ['partage', 'seniorite', 'elective'],
    defaultLaw: 'partage',
  },
  feodal: {
    name: 'Féodalité',
    description:
      'Le suzerain et ses vassaux, liés par l’hommage : l’équilibre ordinaire des royaumes, et le plus grand choix de lois.',
    income: 0,
    levies: 0,
    vassalOpinion: 0,
    laws: ['partage', 'primogeniture', 'ultimogeniture', 'elective'],
    defaultLaw: 'partage',
  },
  centralise: {
    name: 'Monarchie centralisée',
    description:
      'Des baillis et des juristes au service de la couronne : l’impôt rentre mieux, mais les levées s’amenuisent et les vassaux supportent mal la tutelle.',
    income: 0.15,
    levies: -0.1,
    vassalOpinion: -5,
    laws: ['primogeniture', 'ultimogeniture', 'elective'],
    defaultLaw: 'primogeniture',
  },
};

export interface ReformDef {
  from: GovernmentId;
  to: GovernmentId;
  label: string;
  prestige: number;
  gold: number;
  /** Développement minimal de la capitale. */
  minCapitalDev?: number;
  /** Faut-il porter une couronne royale ? */
  needsKingdom?: boolean;
  /** Opinion des vassaux après la réforme. */
  vassalOpinion: number;
}

export const REFORMS: ReformDef[] = [
  {
    from: 'tribal',
    to: 'feodal',
    label: 'Adopter la féodalité',
    prestige: 250,
    gold: 100,
    minCapitalDev: 4,
    vassalOpinion: -10,
  },
  {
    from: 'feodal',
    to: 'centralise',
    label: 'Centraliser la couronne',
    prestige: 500,
    gold: 300,
    needsKingdom: true,
    vassalOpinion: -20,
  },
  {
    from: 'centralise',
    to: 'feodal',
    label: 'Rendre leurs libertés aux vassaux',
    prestige: 100,
    gold: 0,
    vassalOpinion: 10,
  },
];

export interface LawDef {
  name: string;
  description: string;
  /** Prestige pour l'adopter. */
  cost: number;
}

export const SUCCESSION_LAWS: Record<SuccessionLaw, LawDef> = {
  partage: {
    name: 'Partage',
    description:
      'Les comtés sont répartis entre les enfants ; l’aîné garde la capitale et les titres. Le domaine s’émiette à chaque génération.',
    cost: 50,
  },
  primogeniture: {
    name: 'Primogéniture',
    description: 'Tout va à l’aîné : le domaine reste entier, les cadets restent sans terre.',
    cost: 400,
  },
  ultimogeniture: {
    name: 'Ultimogéniture',
    description: 'Tout va au plus jeune des enfants, que l’on garde auprès de soi.',
    cost: 300,
  },
  seniorite: {
    name: 'Séniorité',
    description:
      'Le plus âgé de la maison hérite, frère ou cousin plutôt que fils : jamais d’enfant sur le trône.',
    cost: 150,
  },
  elective: {
    name: 'Élective',
    description:
      'Les vassaux et le souverain élisent l’héritier parmi les adultes de la maison, selon leur opinion et leurs talents.',
    cost: 250,
  },
};

/** Délai (saisons) entre deux changements de loi de succession. */
export const LAW_COOLDOWN = 40;
/** Opinion des vassaux quand la loi change. */
export const LAW_CHANGE_OPINION = -10;
