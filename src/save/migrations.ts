/**
 * Migrations de sauvegarde : chaque fonction fait passer une sauvegarde de la version N à N+1.
 * Une sauvegarde d'une version précédente se charge toujours.
 */
import MAP from '../data/map.json';
import { emptyStats } from '../engine/context';
import { ensureCapitals, independentRulers } from '../engine/realm';
import { assignHouseColors } from '../engine/heraldry';
import { grantHouseClaims } from '../engine/crowns';
import { Rng } from '../engine/rng';
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
  // Version 4 → 5 : cour (candidats, pupilles, salaires) et trésorier.
  4: (s) => ({
    candidates: [],
    treasury: 'prudent',
    ...s,
    version: 5,
  }),
  // Version 5 → 6 : nouvelles du monde. Les anciennes parties gardent leur carte.
  5: (s) => ({
    worldNews: [],
    ...s,
    version: 6,
  }),
  // Version 6 → 7 : capitales (County.seatOf) et population (County.vitality, 1 par défaut).
  6: (s) => {
    const next: AnySave = { ...s, version: 7 };
    if (next.counties && next.characters) ensureCapitals(next as unknown as GameState);
    return next;
  },
  // Version 7 → 8 : couleurs de maison (14 teintes, distinctes pour les souverains).
  7: (s) => {
    const next: AnySave = { ...s, version: 8 };
    const g = next as unknown as GameState;
    if (g.counties && g.characters && g.dynasties) {
      const rulers = independentRulers(g)
        .map((id) => g.characters[id]?.dynastyId)
        .filter((d): d is string => !!d);
      assignHouseColors(g, [...new Set(rulers)], new Rng(4242 + (g.turn ?? 0)));
    }
    return next;
  },
  // Version 8 → 9 : une couleur unique par maison (hex), créée au besoin.
  8: (s) => {
    const next: AnySave = { ...s, version: 9 };
    const g = next as unknown as GameState;
    if (g.counties && g.characters && g.dynasties) {
      for (const d of Object.values(g.dynasties)) if (typeof d.color !== 'string') delete d.color;
      const rulers = independentRulers(g)
        .map((id) => g.characters[id]?.dynastyId)
        .filter((d): d is string => !!d);
      assignHouseColors(g, [...new Set(rulers)], new Rng(4243 + (g.turn ?? 0)));
    }
    return next;
  },
  // Version 9 → 10 : traités de terres et appels à l'aide (délais facultatifs).
  9: (s) => ({ callRefused: {}, tradeRefused: {}, ...s, version: 10 }),
  // Version 10 → 11 : couronnes (unions, pactes) ; droits par le sang des vivants.
  10: (s) => {
    const next: AnySave = { unions: [], familyPacts: [], successionPacts: [], ...s, version: 11 };
    const g = next as unknown as GameState;
    if (g.characters && g.counties && g.dynasties)
      for (const c of Object.values(g.characters)) if (c.alive) grantHouseClaims(g, c);
    return next;
  },
  // Version 11 → 12 : influence dans les cours étrangères.
  11: (s) => ({ influence: {}, ...s, version: 12 }),
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
