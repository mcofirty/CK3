/** Types de l'état de jeu. Tout l'état est sérialisable en JSON. */

export type SkillKey = 'diplomatie' | 'guerre' | 'gestion' | 'ruse' | 'savoir';
export type Skills = Record<SkillKey, number>;
export const SKILL_KEYS: SkillKey[] = ['diplomatie', 'guerre', 'gestion', 'ruse', 'savoir'];
export const SKILL_LABELS: Record<SkillKey, string> = {
  diplomatie: 'Diplomatie',
  guerre: 'Guerre',
  gestion: 'Gestion',
  ruse: 'Ruse',
  savoir: 'Savoir',
};

export type SeasonIndex = 0 | 1 | 2 | 3;
export type Terrain = 'plaine' | 'colline' | 'foret' | 'marais' | 'montagne';
export type UnitType = 'levees' | 'piquiers' | 'archers' | 'infanterie' | 'cavalerie';
export type UnitCounts = Record<UnitType, number>;
export type Difficulty = 'facile' | 'normal' | 'difficile';
export type CouncilPost = 'chancelier' | 'marechal' | 'intendant' | 'espion' | 'chapelain';
export type BuildingType =
  'marche' | 'ferme' | 'caserne' | 'ecuries' | 'archerie' | 'muraille' | 'chapelle' | 'route';
export type SuccessionLaw = 'partage' | 'primogeniture';
export type TaxLevel = 'faible' | 'normal' | 'eleve' | 'ecrasant';
export type ConscriptionLevel = 'legere' | 'normale' | 'lourde';

export interface OpinionModifier {
  reason: string;
  value: number;
  /** Tour d'expiration (exclu). Absent = permanent. */
  expires?: number;
}

export interface Character {
  id: string;
  name: string;
  female: boolean;
  dynastyId: string | null;
  birthTurn: number;
  alive: boolean;
  deathTurn?: number;
  deathCause?: string;
  /** Compétences de base (sans les traits). */
  skills: Skills;
  traits: string[];
  /** Santé de base (sans les traits), 0 à 100. */
  health: number;
  fatherId?: string;
  motherId?: string;
  spouseId?: string;
  childrenIds: string[];
  /** Cour où vit le personnage (identifiant d'un souverain ou d'un vassal titré). */
  courtId: string;
  /** Suzerain direct d'un vassal titré. */
  liegeId?: string;
  gold: number;
  prestige: number;
  piety: number;
  /** Modificateurs d'opinion envers d'autres personnages. */
  opinions: Record<string, OpinionModifier[]>;
  friends: string[];
  rivals: string[];
  educatorId?: string;
  educationFocus?: SkillKey;
  /** Revendications sur des comtés. */
  claims: string[];
  successionLaw: SuccessionLaw;
  imprisonedBy?: string;
  /** Graine pour le portrait. */
  seed: number;
  /** Membre d'une faction contre son suzerain. */
  inFaction?: boolean;
  /** Recrutements professionnels effectués cette saison (limite par bâtiments). */
  recruitedThisSeason?: number;
  // --- Progression (perdue à la mort) ---
  /** Expérience accumulée par branche. */
  xp?: Partial<Record<SkillKey, number>>;
  /** Talents choisis dans l'arbre de compétences. */
  perks?: string[];
  /** Stress, 0 à 100 (crise au-delà). */
  stress?: number;
  /** Amants et amantes. */
  lovers?: string[];
  /** Ambition du règne en cours. */
  ambition?: AmbitionState;
  /** Faits d'armes et de cour. */
  record?: CharacterRecord;
  /** Otage retenu à la cour de ce souverain. */
  hostageOf?: string;
  /** Tour depuis lequel il est otage. */
  hostageSince?: number;
  /** Souverain de sa famille, qui ne peut attaquer tant que l'otage est retenu. */
  hostageHome?: string;
  /** Une ambition a déjà été proposée à ce souverain. */
  ambitionOffered?: boolean;
  /** Candidat de passage : personne n'est son seigneur tant qu'il n'est pas engagé. */
  visitor?: boolean;
  /** Pupille : enfant confié à la cour de ce souverain. */
  fosterOf?: string;
  /** Une tentative pour rallier ce prisonnier a déjà eu lieu. */
  rallyTried?: boolean;
}

export interface AmbitionState {
  id: string;
  startTurn: number;
  /** Valeur de référence au moment du choix. */
  base: number;
  /** Compteur propre à l'ambition (saisons de paix…). */
  counter: number;
}

export interface CharacterRecord {
  battles: number;
  wins: number;
  duels: number;
  plots: number;
  buildings: number;
  ambitions: number;
}

export interface Dynasty {
  id: string;
  name: string;
  renown: number;
  seed: number;
  founderId: string;
  /** Héritages achetés avec la renommée (conservés jusqu'à la fin). */
  legacies?: string[];
  /** Renommée déjà dépensée (la renommée totale compte pour le score). */
  renownSpent?: number;
}

export interface BuildingSlot {
  type: BuildingType;
  level: 1 | 2;
}

export interface Construction {
  type: BuildingType;
  level: 1 | 2;
  remaining: number;
}

export interface County {
  id: string;
  name: string;
  terrain: Terrain;
  duchyId: string;
  kingdomId: string;
  holderId: string;
  development: number;
  /** Fortification de base (sans muraille). */
  baseFort: number;
  buildings: BuildingSlot[];
  slots: number;
  construction?: Construction;
  /** Levées disponibles (hommes). */
  levyPool: number;
  /** Comtés adjacents séparés par une rivière. */
  rivers: string[];
  adjacent: string[];
  /** Occupation militaire en cours. */
  occupation?: { warId: string; byRulerId: string; since: number };
  /** Siège en cours. */
  siege?: { armyId: string; progress: number };
  /** Pillé récemment (tour). */
  lootedTurn?: number;
  /** Épidémie : saisons restantes. */
  plague?: number;
  /** Tour de fin de la dernière épidémie (immunité). */
  plagueEnded?: number;
  /** Quarantaine décrétée. */
  quarantine?: boolean;
  // --- Économie locale ---
  /** Taux d'imposition fixé par le seigneur du comté. */
  tax?: TaxLevel;
  /** Conscription : part des hommes appelés aux levées. */
  conscription?: ConscriptionLevel;
  /** Contentement du peuple, 0 à 100. */
  contentment?: number;
}

export interface Duchy {
  id: string;
  name: string;
  kingdomId: string;
  counties: string[];
  holderId?: string;
}

export interface Kingdom {
  id: string;
  name: string;
  duchies: string[];
  holderId?: string;
}

export interface Army {
  id: string;
  ownerId: string;
  location: string;
  /** Comté d'où l'armée vient d'arriver (pour les rivières). */
  cameFrom?: string;
  men: UnitCounts;
  /** Effectif de base au moment de la levée (pour l'usure). */
  baseMen: number;
  /** Levées prélevées par comté (rendues à la dissolution). */
  levyFrom: Record<string, number>;
  supply: number;
  commanderId?: string;
  frontCommanders: string[];
  path: string[];
  seasonsRaised: number;
  /** Ordre d'assaut au prochain tour. */
  assault?: boolean;
  /** Conduite du siège : blocus (moins d'usure) ou négociation (une tentative). */
  siegeMode?: 'blocus' | 'negocier';
  /** Négociation déjà tentée sur ce comté. */
  negotiated?: string;
}

export type CasusBelliType = 'revendication' | 'conquete' | 'independance' | 'defense';

export interface War {
  id: string;
  name: string;
  attackerId: string;
  defenderId: string;
  attackerAllies: string[];
  defenderAllies: string[];
  cb: CasusBelliType;
  /** Comté objectif (revendication / conquête). */
  targetCountyId?: string;
  /** Score de guerre du point de vue de l'attaquant, -100 à +100. */
  score: number;
  objectiveHeldSeasons: number;
  startTurn: number;
  /** Prisonniers capturés : id → camp qui le détient. */
  captured: string[];
}

export type PlotType = 'assassiner' | 'discrediter' | 'amitie' | 'revolte';

export interface Plot {
  id: string;
  ownerId: string;
  type: PlotType;
  targetId: string;
  progress: number;
  agents: number;
  startTurn: number;
  /** Découvert par la cible. */
  discovered: boolean;
}

export interface CouncilSeat {
  holderId?: string;
  task: string;
  targetId?: string;
}

export interface ChronicleEntry {
  turn: number;
  text: string;
  kind:
    | 'naissance'
    | 'deces'
    | 'succession'
    | 'guerre'
    | 'bataille'
    | 'titre'
    | 'mariage'
    | 'evenement'
    | 'intrigue'
    | 'divers';
}

/** Nouvelle du monde : ce qui se passe chez les autres souverains. */
export interface NewsEntry {
  turn: number;
  text: string;
  kind:
    | 'guerre'
    | 'paix'
    | 'deces'
    | 'succession'
    | 'mariage'
    | 'alliance'
    | 'titre'
    | 'revolte'
    | 'fait';
  /** Souverain principalement concerné. */
  rulerId?: string;
}

/** Instance d'événement en attente de choix. */
export interface EventInstance {
  uid: string;
  eventId: string;
  /** Rôles : vassal, enfant, conjoint, rival, comte… → identifiant. */
  scope: Record<string, string>;
  /** Définition embarquée (propositions générées par le moteur). */
  inline?: import('./events/types').EventDef;
}

export interface Notification {
  turn: number;
  text: string;
}

export interface GameState {
  version: number;
  /** Carte de la partie (générée à partir de la graine). */
  map: import('./mapgen').MapData;
  /** Origine tirée au début de la partie. */
  origin?: { id: string; titre: string; texte: string };
  /** Dernière issue tirée au sort (affichée à l'écran). */
  lastOutcome?: { win: boolean; text: string; id?: number };
  /** Biais d'événements propre à la partie (identifiant → multiplicateur de poids). */
  eventBias?: Record<string, number>;
  seed: number;
  rng: number;
  turn: number;
  startYear: number;
  difficulty: Difficulty;
  playerId: string;
  playerDynastyId: string;
  characters: Record<string, Character>;
  dynasties: Record<string, Dynasty>;
  counties: Record<string, County>;
  duchies: Record<string, Duchy>;
  kingdoms: Record<string, Kingdom>;
  armies: Record<string, Army>;
  /** Compagnies professionnelles hors campagne, par souverain (hommes). */
  standing: Record<string, UnitCounts>;
  wars: Record<string, War>;
  plots: Record<string, Plot>;
  council: Record<CouncilPost, CouncilSeat>;
  /** Cours espionnées par le maître-espion : souverain → tour. */
  spied: Record<string, number>;
  /** Alliances : paires triées "a|b". */
  alliances: string[];
  /** Trêves : "a|b" → tour de fin. */
  truces: Record<string, number>;
  pendingEvents: EventInstance[];
  /** Déclencheurs d'événements posés par le moteur (complot découvert, naissance…). */
  pendingTriggers?: { trigger: string; scope: Record<string, string> }[];
  eventCooldowns: Record<string, number>;
  eventOnce: Record<string, boolean>;
  chronicle: ChronicleEntry[];
  notifications: Notification[];
  /** Nouvelles du monde (royaumes de l'IA), les plus récentes à la fin. */
  worldNews: NewsEntry[];
  battle?: import('./battle/types').BattleState;
  /** Batailles du joueur encore à jouer cette saison. */
  pendingBattles: { countyId: string; attackerArmyId: string; defenderArmyId: string }[];
  phase: 'saison' | 'bataille' | 'fin';
  gameOver?: { reason: string; score: LineageScore; ending?: EndingId; done?: boolean };
  nextId: number;
  /** Bilan de la saison précédente, pour l'infobulle des ressources. */
  ledger: Ledger;
  tutorialSeen: boolean;
  /** Simulation : l'IA joue aussi le royaume du joueur. */
  autoplay?: boolean;
  /** Dernière bataille terminée (affichage du bilan). */
  lastBattleReport?: import('./battle/types').BattleReport;
  /** Drapeaux narratifs posés par les événements (identifiant → tour). */
  flags?: Record<string, number>;
  /** Suites d'événements différées. */
  scheduled?: { turn: number; eventId: string; scope: Record<string, string> }[];
  /** Décisions prises : identifiant → tour. */
  decisionsUsed?: Record<string, number>;
  /** Contrats de mercenaires en cours. */
  mercenaries?: MercContract[];
  /** Fin de contrat des compagnies : identifiant → tour où elles redeviennent disponibles. */
  mercCooldown?: Record<string, number>;
  /** Souverains successifs de la lignée (livre de la dynastie). */
  rulers?: RulerEntry[];
  /** Succès débloqués pendant cette partie. */
  achievements?: string[];
  /** Statistiques de la partie (succès, fin). */
  stats?: GameStats;
  /** Édits en vigueur : souverain → identifiants. */
  edicts?: Record<string, string[]>;
  /** Édit abrogé : identifiant → tour où il peut être proclamé à nouveau. */
  edictCooldown?: Record<string, number>;
  /** Emprunts en cours. */
  loans?: Loan[];
  /** Candidats de passage à la cour du joueur. */
  candidates?: Candidate[];
  /** Politique de trésorerie du joueur : le trésorier évite le rouge, ou non. */
  treasury?: 'prudent' | 'manuel';
}

export interface Candidate {
  id: string;
  /** Prime d'engagement (or). */
  fee: number;
  /** Profil (« Chevalier errant »…) et provenance. */
  profile: string;
  origin: string;
  /** Tour d'expiration. */
  until: number;
}

export interface Loan {
  id: string;
  ownerId: string;
  principal: number;
  /** Intérêt par saison (part du principal). */
  rate: number;
  turn: number;
}

export interface MercContract {
  id: string;
  ownerId: string;
  men: UnitCounts;
  until: number;
}

export interface RulerEntry {
  id: string;
  from: number;
  to?: number;
  ambitions: string[];
}

export interface GameStats {
  battlesWon: number;
  battlesLost: number;
  duelsWon: number;
  plotsDone: number;
  decisions: number;
  maxCounties: number;
  wars: number;
  crises: number;
  hostages: number;
  plaguesSurvived: number;
}

export interface LedgerLine {
  label: string;
  value: number;
}
export interface Ledger {
  gold: LedgerLine[];
  prestige: LedgerLine[];
  piety: LedgerLine[];
}

export interface LineageScore {
  renown: number;
  titles: number;
  years: number;
  total: number;
}

export type EndingId =
  'empire' | 'couronne' | 'puissance' | 'legende' | 'survie' | 'extinction' | 'ruine';

export const SAVE_VERSION = 6;
