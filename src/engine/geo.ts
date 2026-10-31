/** Géographie dérivée de la carte (mise en cache par partie) : côtes et royaumes étrangers. */
import { foreignLands } from './mapgen';
import { Rng } from './rng';
import type { GameState } from './state';

const coastCache = new Map<string, Set<string>>();
const foreignCache = new Map<string, string[]>();

const keyOf = (state: GameState) => state.map.counties.map((c) => c.id).join('|') + state.seed;

/** Comtés qui touchent la mer. */
export function coastalCounties(state: GameState): Set<string> {
  const key = keyOf(state);
  let set = coastCache.get(key);
  if (!set) {
    set = new Set(state.map.counties.filter((c) => c.coastal).map((c) => c.id));
    coastCache.set(key, set);
  }
  return set;
}

/** Noms des royaumes d'outre-mer (hors carte jouable). */
export function foreignKingdoms(state: GameState): string[] {
  const key = keyOf(state);
  let names = foreignCache.get(key);
  if (!names) {
    names = foreignLands(state.map, Rng)
      .filter((f) => f.kind === 'royaume')
      .map((f) => f.name);
    if (!names.length) names = ['les Terres d’au-delà des mers'];
    foreignCache.set(key, names);
  }
  return names;
}
