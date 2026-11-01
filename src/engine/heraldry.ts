/** Couleurs de maison : les maisons régnantes reçoivent des couleurs distinctes. */
import { HOUSE_COLORS } from '../data/heraldry';
import { Rng } from './rng';
import type { Dynasty, GameState } from './state';

/** Index de couleur d'une maison : attribué, sinon premier tirage de sa graine. */
export function houseColorIndex(d: Pick<Dynasty, 'seed' | 'color'>): number {
  if (d.color !== undefined && HOUSE_COLORS[d.color]) return d.color;
  return Math.floor(new Rng(d.seed).next() * HOUSE_COLORS.length);
}

/**
 * Donne aux maisons des souverains indépendants des couleurs toutes différentes, puis aux
 * autres maisons la couleur la moins répandue (au hasard parmi les ex æquo).
 */
export function assignHouseColors(state: GameState, rulerDynasties: string[], rng: Rng): void {
  const used = new Map<number, number>();
  const take = (d: Dynasty) => {
    const min = Math.min(...HOUSE_COLORS.map((_, i) => used.get(i) ?? 0));
    const options = HOUSE_COLORS.map((_, i) => i).filter((i) => (used.get(i) ?? 0) === min);
    d.color = rng.pick(options);
    used.set(d.color, (used.get(d.color) ?? 0) + 1);
  };
  for (const id of rulerDynasties) if (state.dynasties[id]) take(state.dynasties[id]);
  for (const d of Object.values(state.dynasties)) if (d.color === undefined) take(d);
}

/** Nouvelle maison en cours de partie : une couleur peu portée par les maisons vivantes. */
export function newHouseColor(state: GameState, rng: Rng): number {
  const used = new Map<number, number>();
  for (const d of Object.values(state.dynasties)) {
    const i = houseColorIndex(d);
    used.set(i, (used.get(i) ?? 0) + 1);
  }
  const min = Math.min(...HOUSE_COLORS.map((_, i) => used.get(i) ?? 0));
  return rng.pick(HOUSE_COLORS.map((_, i) => i).filter((i) => (used.get(i) ?? 0) === min));
}
