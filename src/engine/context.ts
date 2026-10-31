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
