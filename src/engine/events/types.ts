import type { PlotType, SkillKey, TaxLevel } from '../state';

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
  | 'prisonnier'
  | 'ami'
  | 'ennemi'
  | 'amant'
  | 'proche';

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
  'ami',
  'ennemi',
  'amant',
  'proche',
];

export interface Trigger {
  /** aleatoire : tiré au début de saison ; complot_decouvert, naissance, bataille_gagnee… : déclenchés par le moteur ; suite : uniquement enchaîné. */
  type:
    | 'aleatoire'
    | 'complot_decouvert'
    | 'naissance'
    | 'bataille_gagnee'
    | 'bataille_perdue'
    | 'suite'
    | 'decision'
    | 'relation_ami'
    | 'relation_rival'
    | 'relation_amant'
    | 'peste'
    | 'revolte_paysanne';
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
  /** Drapeau narratif posé (ou absent). */
  drapeau?: string;
  pas_drapeau?: string;
  stress_min?: number;
  stress_max?: number;
  /** Le souverain a (ou n'a pas) d'ambition en cours. */
  a_ambition?: boolean;
  /** Une épidémie sévit dans le royaume du joueur. */
  epidemie?: boolean;
  /** Le joueur a au moins un comté côtier. */
  cotier?: boolean;
  /** Contentement du comté du rôle « comte ». */
  comte_contentement_max?: number;
  comte_contentement_min?: number;
  /** Taux d'imposition du comté du rôle « comte ». */
  comte_impots?: TaxLevel;
  /** Contentement moyen du domaine. */
  contentement_moyen_max?: number;
  contentement_moyen_min?: number;
  /** Édit en vigueur (ou non). */
  edit?: string;
  pas_edit?: string;
  /** Le souverain a des dettes. */
  dette?: boolean;
}

export type OpinionTarget = Exclude<Role, 'souverain'>;

export interface Hasard {
  /** Probabilité de réussite (0 à 1). */
  chance: number;
  /** La compétence du souverain modifie la chance (±2,5 % par point autour de 10). */
  competence?: SkillKey;
  succes: Effect[];
  echec: Effect[];
  /** Texte d'issue facultatif (variables autorisées). */
  texte_succes?: string;
  texte_echec?: string;
}

export interface Effect {
  /** Issue incertaine : tirée au moment du choix, probabilité affichée avant validation. */
  hasard?: Hasard;
  or?: number;
  prestige?: number;
  piete?: number;
  renommee?: number;
  opinion?: { cible: OpinionTarget; valeur: number; raison?: string };
  /** Opinion de tous les vassaux envers le souverain. */
  opinion_vassaux?: number;
  /** Le Mur (mode Trône de fer) : frères, vivres, menace, sauvageons, verredragon ; le comté du rôle « comte » tombe aux morts ou est libéré. */
  mur?: {
    hommes?: number;
    vivres?: number;
    menace?: number;
    sauvageons?: number;
    verredragon?: number;
    submerger?: boolean;
    liberer?: boolean;
  };
  /** Daenerys en Essos (mode Trône de fer). */
  essos?: { armee?: number; mort?: boolean };
  /** Le personnage du rôle prend le noir (vœux, départ pour le Mur). */
  prendre_le_noir?: Role;
  /** Influence du souverain à la cour du rôle désigné (un souverain indépendant). */
  influence?: { cible: OpinionTarget; valeur: number };
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
  /** Stress du souverain : nombre, ou par trait (« * » = toujours). */
  stress?: number | Record<string, number>;
  /** Expérience dans une branche (souverain par défaut). */
  xp?: { competence: SkillKey; valeur: number; cible?: Role };
  drapeau?: string;
  retirer_drapeau?: string;
  /** Événement qui surviendra plus tard, avec les mêmes rôles. */
  suite_differee?: { id: string; saisons: number };
  amant?: Role;
  fin_amant?: Role;
  /** Met fin à une rivalité. */
  reconciliation?: Role;
  /** Une épidémie éclate dans le comté du rôle (ou au hasard dans le domaine). */
  epidemie?: boolean;
  /** Quarantaine du comté : l'épidémie y faiblit et ne s'étend plus. */
  quarantaine?: boolean;
  /** Bataille livrée sur-le-champ contre une troupe ennemie. */
  bataille?: EventBattle;
  /** Contentement du comté du rôle « comte », ou de tout le domaine. */
  contentement?: number;
  /** Fixe les impôts du comté du rôle « comte ». */
  impots?: TaxLevel;
  /** Un enfant illégitime, ou un prétendant, rejoint la cour. */
  nouveau_courtisan?: {
    age_min: number;
    age_max: number;
    guerre?: number;
    trait?: string;
    /** Compétence mise en avant. */
    competence?: { competence: SkillKey; valeur: number };
    femme?: boolean;
    /** Un enfant confié à la cour (pupille) plutôt qu'un adulte. */
    pupille?: boolean;
  };
  // --- Effets internes (propositions générées par le moteur) ---
  ambition?: string;
  mariage?: { a: string; b: string };
  alliance?: string;
  /** Union personnelle : privilèges confirmés ou autorité imposée. */
  union_privileges?: { union: string; mode: 'confirmes' | 'imposes' };
  /** Prétendant demandant asile. */
  pretendant?: { id: string; action: 'accueillir' | 'livrer' | 'congedier'; souverain: string };
  /** Cession d'un comté contre or (négociée par l'IA). */
  cession?: { comte: string; vendeur: string; acheteur: string; prix: number };
  paix?: {
    warId: string;
    issue: 'attaquant' | 'defenseur' | 'blanche';
    /** Conditions négociées (comtés, or) ; absentes : conditions d'usage. */
    termes?: { comtes: string[]; or: number; payeur?: string };
  };
  rejoindre_guerre?: { warId: string; allie: string; camp: 'attaquant' | 'defenseur' };
  tribut?: { de: string; a: string; montant: number };
  /** Avenir d'un pupille devenu adulte. */
  pupille?: { id: string; action: 'retour' | 'garder' };
  /** Rend un otage contre de l'or. */
  rendre_otage?: { otage: string; montant: number };
}

export interface EventBattle {
  /** Nom de la troupe ennemie. */
  ennemi: string;
  /** Effectif ennemi relatif à vos forces (1 = égal). */
  force: number;
  /** Composition : part de chaque unité. */
  composition?: Partial<
    Record<'levees' | 'piquiers' | 'archers' | 'infanterie' | 'cavalerie', number>
  >;
  /** Vous attaquez (sinon vous défendez). */
  attaque?: boolean;
  victoire: Effect[];
  defaite: Effect[];
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
  /** Un texte, ou plusieurs variantes dont une est tirée au sort. */
  texte: string | string[];
  categorie?:
    | 'cour'
    | 'famille'
    | 'vassaux'
    | 'religion'
    | 'guerre'
    | 'intrigue'
    | 'systeme'
    | 'etranger'
    | 'education'
    | 'relations'
    | 'saisons'
    | 'decisions'
    | 'chroniques'
    | 'economie'
    | 'arrivees';
  declencheur: Trigger;
  conditions?: Condition[];
  poids?: number;
  delai_retour?: number;
  /** partie : une seule fois par partie ; personnage : une fois par souverain. */
  unique?: 'partie' | 'personnage';
  choix: Choice[];
}
