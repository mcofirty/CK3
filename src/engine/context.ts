import type { Rng } from './rng';
import type { ChronicleEntry, GameState } from './state';

/** Contexte d'exécution d'une action : état (copie modifiable) et générateur à graine. */
export interface Ctx {
  state: GameState;
  rng: Rng;
}

export function newId(state: GameState, prefix: string): string {
  state.nextId += 1;
  return `${prefix}${state.nextId}`;
}

export function chronicle(state: GameState, text: string, kind: ChronicleEntry['kind']): void {
  state.chronicle.push({ turn: state.turn, text, kind });
}

export function notify(state: GameState, text: string): void {
  state.notifications.push({ turn: state.turn, text });
  if (state.notifications.length > 60)
    state.notifications.splice(0, state.notifications.length - 60);
}

export const seasonOf = (turn: number): 0 | 1 | 2 | 3 => (turn % 4) as 0 | 1 | 2 | 3;
export const yearOf = (state: GameState, turn = state.turn): number =>
  state.startYear + Math.floor(turn / 4);

export const clamp = (v: number, min: number, max: number): number =>
  Math.max(min, Math.min(max, v));

/** Livre de la dynastie : clôt le règne en cours et ouvre celui du nouveau souverain. */
export function recordRuler(state: GameState, newRulerId: string): void {
  const list = (state.rulers ??= []);
  const cur = list.find((r) => r.to === undefined);
  if (cur?.id === newRulerId) return;
  if (cur) cur.to = state.turn;
  list.push({ id: newRulerId, from: state.turn, ambitions: [] });
}

export function emptyStats(): import('./state').GameStats {
  return {
    battlesWon: 0,
    battlesLost: 0,
    duelsWon: 0,
    plotsDone: 0,
    decisions: 0,
    maxCounties: 0,
    wars: 0,
    crises: 0,
    hostages: 0,
    plaguesSurvived: 0,
  };
}
