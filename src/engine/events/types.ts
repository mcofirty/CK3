import type { PlotType, SkillKey } from '../state';

export type SeasonKey = 'printemps' | 'ete' | 'automne' | 'hiver';

/** Rôles qu'un événement peut mobiliser ; ils deviennent des variables de texte ({vassal.nom}). */
export type Role =
  | 'souverain'
  | 'conjoint'
  | 'heritier'
  | 'enfant'
  | 'vassal'
  | 'rival'
  | 'courtisan'
  | 'comte'
  | 'comte_rival'
  | 'complotiste'
  | 'prisonnier';

export const ROLES: Role[] = [
  'souverain',
  'conjoint',
  'heritier',
  'enfant',
  'vassal',
  'rival',
  'courtisan',
  'comte',
  'comte_rival',
  'complotiste',
  'prisonnier',
];

export interface Trigger {
  /** aleatoire : tiré au début de saison ; complot_decouvert, naissance, bataille_gagnee… : déclenchés par le moteur ; suite : uniquement enchaîné. */
  type: 'aleatoire' | 'complot_decouvert' | 'naissance' | 'bataille_gagnee' | 'bataille_perdue' | 'suite';
  saisons?: SeasonKey[];
}

/** Une condition : toutes les clés présentes doivent être vraies. */
export interface Condition {
  or_min?: number;
  or_max?: number;
  prestige_min?: number;
  piete_min?: number;
  piete_max?: number;
  sante_max?: number;
  age_min?: number;
  age_max?: number;
  trait?: string;
  pas_trait?: string;
  en_guerre?: boolean;
  a_conjoint?: boolean;
  comtes_min?: number;
  competence_min?: { competence: SkillKey; valeur: number };
  competence_max?: { competence: SkillKey; valeur: number };
  opinion_vassal_max?: number;
  opinion_vassal_min?: number;
  vassal_trait?: string;
  enfant_age_min?: number;
  enfant_age_max?: number;
  heritier_age_max?: number;
  heritier_age_min?: number;
  conjoint_trait?: string;
  courtisan_trait?: string;
  rival_opinion_max?: number;
  comte_developpement_max?: number;
  comte_developpement_min?: number;
  armee_levee?: boolean;
  annee_min?: number;
}

export type OpinionTarget = Exclude<Role, 'souverain'>;

export interface Effect {
  or?: number;
  prestige?: number;
  piete?: number;
  renommee?: number;
  opinion?: { cible: OpinionTarget; valeur: number; raison?: string };
  /** Opinion de tous les vassaux envers le souverain. */
  opinion_vassaux?: number;
  trait_ajout?: string | { cible: Role; trait: string };
  trait_retrait?: string | { cible: Role; trait: string };
  sante?: number | { cible: Role; valeur: number };
  competence?: { competence: SkillKey; valeur: number; cible?: Role };
  /** Revendication du souverain sur le comté désigné par le rôle (comte_rival). */
  revendication?: 'comte_rival';
  /** Déclare une guerre de revendication contre le rôle (rival) — ou le rival déclare contre vous. */
  guerre?: { cible: 'rival'; attaquant?: 'souverain' | 'rival' };
  complot?: { type: PlotType; cible: Role };
  naissance?: boolean;
  deces?: Role;
  developpement?: number;
  ravitaillement?: number;
  levees?: number;
  ami?: Role;
  devient_rival?: Role;
  emprisonner?: Role;
  liberer?: Role;
  /** Exile le personnage hors de la cour. */
  exiler?: Role;
  // --- Effets internes (propositions générées par le moteur) ---
  mariage?: { a: string; b: string };
  alliance?: string;
  paix?: { warId: string; issue: 'attaquant' | 'defenseur' | 'blanche' };
  rejoindre_guerre?: { warId: string; allie: string; camp: 'attaquant' | 'defenseur' };
  tribut?: { de: string; a: string; montant: number };
}

export interface Choice {
  libelle: string;
  conditions?: Condition[];
  effets: Effect[];
  suite?: string;
  /** Texte d'issue facultatif. */
  issue?: string;
}

export interface EventDef {
  id: string;
  titre: string;
  texte: string;
  categorie?: 'cour' | 'famille' | 'vassaux' | 'religion' | 'guerre' | 'intrigue' | 'systeme';
  declencheur: Trigger;
  conditions?: Condition[];
  poids?: number;
  delai_retour?: number;
  /** partie : une seule fois par partie ; personnage : une fois par souverain. */
  unique?: 'partie' | 'personnage';
  choix: Choice[];
}
