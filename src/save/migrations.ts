/**
 * Migrations de sauvegarde : chaque fonction fait passer une sauvegarde de la version N à N+1.
 * Une sauvegarde d'une version précédente se charge toujours.
 */
import MAP from '../data/map.json';
import { emptyStats } from '../engine/context';
import { SAVE_VERSION, type GameState } from '../engine/state';

type AnySave = Record<string, unknown> & { version?: number };

/** MIGRATIONS[n] transforme une sauvegarde de version n en version n+1. */
export const MIGRATIONS: Record<number, (s: AnySave) => AnySave> = {
  // Version 0 (prototype) → 1 : champs ajoutés depuis.
  0: (s) => ({
    pendingTriggers: [],
    tutorialSeen: true,
    pendingBattles: [],
    truces: {},
    alliances: [],
    spied: {},
    ...s,
    version: 1,
  }),
  // Version 1 → 2 : la carte est stockée dans la partie (cartes générées) ; les anciennes
  // parties gardent la carte historique.
  1: (s) => ({
    eventBias: {},
    ...s,
    map: s.map ?? MAP,
    version: 2,
  }),
  // Version 2 → 3 : progression, ambitions, stress, décisions, mercenaires, livre, succès.
  // Le souverain en place ouvre le livre de la dynastie ; une ambition lui sera proposée.
  2: (s) => ({
    flags: {},
    scheduled: [],
    decisionsUsed: {},
    mercenaries: [],
    mercCooldown: {},
    rulers: [{ id: s.playerId, from: s.turn, ambitions: [] }],
    achievements: [],
    stats: emptyStats(),
    ...s,
    // Une bataille en cours reçoit météo, tactiques et élan.
    battle: s.battle ? upgradeBattle(s.battle as AnySave) : s.battle,
    version: 3,
  }),
  // Version 3 → 4 : économie locale (impôts, contentement, édits, emprunts).
  3: (s) => ({
    edicts: {},
    edictCooldown: {},
    loans: [],
    ...s,
    version: 4,
  }),
};

function upgradeBattle(b: AnySave): AnySave {
  const side = (x: unknown) => ({ tactics: [], usedTactics: [], elan: 0, ...(x as AnySave) });
  return {
    weather: b.rain ? 'pluie' : 'clair',
    ...b,
    attacker: side(b.attacker),
    defender: side(b.defender),
  };
}

export class SaveError extends Error {}

export function migrate(raw: unknown): GameState {
  if (!raw || typeof raw !== 'object') throw new SaveError('Fichier de sauvegarde illisible.');
  let s = raw as AnySave;
  let v = typeof s.version === 'number' ? s.version : 0;
  if (v > SAVE_VERSION)
    throw new SaveError('Cette sauvegarde vient d’une version plus récente du jeu.');
  while (v < SAVE_VERSION) {
    const m = MIGRATIONS[v];
    if (!m) throw new SaveError(`Aucune migration depuis la version ${v}.`);
    s = m(s);
    v = s.version as number;
  }
  for (const k of ['characters', 'counties', 'playerId', 'turn'] as const) {
    if (!(k in s)) throw new SaveError('Sauvegarde incomplète.');
  }
  return s as unknown as GameState;
}
