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
}

export interface Dynasty {
  id: string;
  name: string;
  renown: number;
  seed: number;
  founderId: string;
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
  battle?: import('./battle/types').BattleState;
  /** Batailles du joueur encore à jouer cette saison. */
  pendingBattles: { countyId: string; attackerArmyId: string; defenderArmyId: string }[];
  phase: 'saison' | 'bataille' | 'fin';
  gameOver?: { reason: string; score: LineageScore };
  nextId: number;
  /** Bilan de la saison précédente, pour l'infobulle des ressources. */
  ledger: Ledger;
  tutorialSeen: boolean;
  /** Simulation : l'IA joue aussi le royaume du joueur. */
  autoplay?: boolean;
  /** Dernière bataille terminée (affichage du bilan). */
  lastBattleReport?: import('./battle/types').BattleReport;
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

export const SAVE_VERSION = 1;
