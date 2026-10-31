import type { Difficulty, SeasonIndex, Terrain, UnitCounts, UnitType } from '../state';

export type FrontId = 'left' | 'center' | 'right';
export const FRONTS: FrontId[] = ['left', 'center', 'right'];
export const FRONT_LABELS: Record<FrontId, string> = {
  left: 'Aile gauche',
  center: 'Centre',
  right: 'Aile droite',
};

export type Order = 'charger' | 'tenir' | 'tirer' | 'feindre' | 'replier' | 'flanc';
export const ORDER_LABELS: Record<Order, string> = {
  charger: 'Charger',
  tenir: 'Tenir',
  tirer: 'Tirer',
  feindre: 'Feindre la retraite',
  replier: 'Se replier',
  flanc: 'Prendre de flanc',
};

export type Preset = 'equilibre' | 'centre' | 'ailes' | 'profondeur';
export const PRESET_LABELS: Record<Preset, string> = {
  equilibre: 'Équilibré',
  centre: 'Centre solide',
  ailes: 'Ailes de cavalerie',
  profondeur: 'Défense en profondeur',
};

export type SideKey = 'attacker' | 'defender';

export interface Commander {
  id: string;
  name: string;
  guerre: number;
  ruse: number;
  traits: string[];
  isSovereign: boolean;
}

export interface Front {
  men: UnitCounts;
  /** Effectif au début de la bataille (E_B). */
  startMen: number;
  morale: number;
  commanderId?: string;
  broken: boolean;
  withdrawn: boolean;
  volleys: number;
  /** Derniers résultats (affichage et animations). */
  lastLoss: number;
  lastMoraleLoss: number;
}

export interface BattleSide {
  name: string;
  rulerId?: string;
  armyId?: string;
  isPlayer: boolean;
  ai: Difficulty;
  fronts: Record<FrontId, Front>;
  reserve: UnitCounts;
  reserveMorale: number;
  commanders: Commander[];
  mainCommanderId?: string;
  sovereignPresent: boolean;
  recon: 0 | 1 | 2;
  rallyUsed: boolean;
  initialMen: number;
  /** Morale de départ (pour les renforts). */
  baseMorale: number;
}

export interface SideOrders {
  orders: Record<FrontId, Order>;
  flankTargets?: Partial<Record<FrontId, FrontId>>;
  /** Hommes de la réserve envoyés sur chaque front. */
  reserve?: Partial<Record<FrontId, Partial<UnitCounts>>>;
  rally?: FrontId;
}

export interface RoundLog {
  round: number;
  lines: string[];
  orders: Record<SideKey, Record<FrontId, Order>>;
}

export interface BattleResult {
  winner: SideKey;
  reason: 'deroute' | 'retraite';
  rounds: number;
  losses: Record<SideKey, number>;
  pursuitLosses: number;
  killed: string[];
  wounded: string[];
  captured: string[];
  menEngaged: number;
  /** Score de guerre gagné par le vainqueur. */
  warScore: number;
}

export interface BattleState {
  id: string;
  countyId?: string;
  countyName: string;
  terrain: Terrain;
  river: boolean;
  season: SeasonIndex;
  rain: boolean;
  attacker: BattleSide;
  defender: BattleSide;
  round: number;
  maxRounds: number;
  phase: 'deploiement' | 'rounds' | 'fin';
  log: RoundLog[];
  result?: BattleResult;
  warId?: string;
  /** Front attaquant visé par une embuscade au round 1. */
  ambush?: FrontId;
  playerSide?: SideKey;
  /** Estimation de l'effectif ennemi (reconnaissance 0). */
  estimate: number;
  /** Ordres ennemis du round 1 révélés (Stratège). */
  revealedOrders?: Record<FrontId, Order>;
  /** Ordres complets de l'ennemi déjà calculés pour le round 1. */
  precomputedOrders?: SideOrders;
  /** Commandants tués et blessés au fil des rounds. */
  casualties: { killed: string[]; wounded: string[] };
}

export interface BattleReport {
  countyName: string;
  attackerName: string;
  defenderName: string;
  playerWon: boolean | null;
  result: BattleResult;
}

export type UnitShare = Partial<Record<UnitType, number>>;

export interface BattleSetupSide {
  name: string;
  rulerId?: string;
  armyId?: string;
  men: UnitCounts;
  commanders: Commander[];
  mainCommanderId?: string;
  isPlayer: boolean;
  ai: Difficulty;
  /** Bonus de reconnaissance : territoire ami, espionnage. */
  friendlyTerritory: boolean;
  spied: boolean;
}

export interface BattleSetup {
  id: string;
  countyId?: string;
  countyName: string;
  terrain: Terrain;
  river: boolean;
  season: SeasonIndex;
  attacker: BattleSetupSide;
  defender: BattleSetupSide;
  warId?: string;
}
