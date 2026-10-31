/**
 * Migrations de sauvegarde : chaque fonction fait passer une sauvegarde de la version N à N+1.
 * Une sauvegarde d'une version précédente se charge toujours.
 */
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
};

export class SaveError extends Error {}

export function migrate(raw: unknown): GameState {
  if (!raw || typeof raw !== 'object') throw new SaveError('Fichier de sauvegarde illisible.');
  let s = raw as AnySave;
  let v = typeof s.version === 'number' ? s.version : 0;
  if (v > SAVE_VERSION) throw new SaveError('Cette sauvegarde vient d’une version plus récente du jeu.');
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
