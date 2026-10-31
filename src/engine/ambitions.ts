/** Ambitions du règne : mesure de la progression, choix et récompenses. */
import { AMBITIONS, AMBITION_BY_ID, type AmbitionDef } from '../data/ambitions';
import { livingChildren, skill } from './characters';
import type { EventDef } from './events/types';
import { realmCounties } from './realm';
import type { Rng } from './rng';
import type { AmbitionState, Character, GameState } from './state';

export function ambitionValue(
  state: GameState,
  c: Character,
  def: AmbitionDef,
  amb?: AmbitionState,
): number {
  switch (def.kind) {
    case 'comtes':
      return realmCounties(state, c.id).length;
    case 'or':
      return Math.floor(c.gold);
    case 'batiments':
      return c.record?.buildings ?? 0;
    case 'victoires':
      return c.record?.wins ?? 0;
    case 'royaume':
      return Object.values(state.kingdoms).some((k) => k.holderId === c.id) ? 1 : 0;
    case 'duche':
      return Object.values(state.duchies).filter((d) => d.holderId === c.id).length;
    case 'piete':
      return Math.floor(c.piety);
    case 'enfants':
      return livingChildren(state, c).length;
    case 'developpement':
      return Object.values(state.counties)
        .filter((k) => k.holderId === c.id)
        .reduce((s, k) => s + k.development, 0);
    case 'paix':
      return amb?.counter ?? 0;
    case 'alliances':
      return state.alliances.filter((k) => k.split('|').includes(c.id)).length;
    case 'amis':
      return c.friends.filter((f) => state.characters[f]?.alive).length;
    case 'complots':
      return c.record?.plots ?? 0;
    case 'savoir':
      return skill(c, 'savoir');
    case 'renommee':
      return Math.floor(c.dynastyId ? (state.dynasties[c.dynastyId]?.renown ?? 0) : 0);
  }
}

export function ambitionTarget(def: AmbitionDef, base: number): number {
  return def.absolute ?? base + (def.delta ?? 1);
}

export interface AmbitionStatus {
  def: AmbitionDef;
  value: number;
  target: number;
  done: boolean;
  /** Saisons restantes avant l'échec. */
  seasonsLeft: number;
}

export function ambitionStatus(state: GameState, c: Character): AmbitionStatus | undefined {
  const amb = c.ambition;
  const def = amb ? AMBITION_BY_ID[amb.id] : undefined;
  if (!amb || !def) return undefined;
  const value = ambitionValue(state, c, def, amb);
  const target = ambitionTarget(def, amb.base);
  return {
    def,
    value,
    target,
    done: value >= target,
    seasonsLeft: Math.max(0, amb.startTurn + def.years * 4 - state.turn),
  };
}

/** Ambitions qui ont un sens pour ce souverain (pas déjà atteintes). */
export function availableAmbitions(state: GameState, c: Character): AmbitionDef[] {
  return AMBITIONS.filter((d) => {
    const v = ambitionValue(state, c, d);
    if (v >= ambitionTarget(d, v) && d.absolute !== undefined) return false;
    if (d.kind === 'enfants' && !(c.spouseId && state.characters[c.spouseId]?.alive)) return false;
    if (d.kind === 'royaume' && realmCounties(state, c.id).length < 4) return false;
    return true;
  });
}

export function startAmbition(state: GameState, c: Character, id: string): void {
  const def = AMBITION_BY_ID[id];
  if (!def) return;
  const amb: AmbitionState = { id, startTurn: state.turn, base: 0, counter: 0 };
  amb.base = ambitionValue(state, c, def, amb);
  c.ambition = amb;
}

/** Événement de choix : trois ambitions tirées au sort, ou remettre à plus tard. */
export function ambitionOffer(state: GameState, c: Character, rng: Rng): EventDef | undefined {
  const pool = rng.shuffle([...availableAmbitions(state, c)]).slice(0, 3);
  if (!pool.length) return undefined;
  const label = (d: AmbitionDef) =>
    `${d.icon} ${d.name} — ${d.description.replace('{n}', String(ambitionTarget(d, ambitionValue(state, c, d))))} (${d.years} ans)`;
  return {
    id: 'sys_ambition',
    titre: 'L’ambition d’un règne',
    texte: `${c.name} contemple l’avenir. Quel grand dessein marquera ce règne ?\nRéussir rapporte prestige, renommée et expérience ; échouer pèse sur l’esprit.`,
    categorie: 'systeme',
    declencheur: { type: 'suite' },
    choix: [
      ...pool.map((d) => ({
        libelle: label(d),
        effets: [{ ambition: d.id }],
      })),
      { libelle: 'Rien ne presse : j’y songerai plus tard.', effets: [] },
    ],
  };
}
