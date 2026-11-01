/**
 * Couleurs de maison : une couleur par maison, jamais deux fois la même. La palette
 * héraldique (data/heraldry) sert d'abord ; ensuite de nouvelles teintes sont créées, aussi
 * éloignées que possible de celles des maisons existantes.
 */
import { HOUSE_COLORS, HOUSE_COLOR_RANGE as R } from '../data/heraldry';
import { Rng } from './rng';
import type { Dynasty, GameState } from './state';

type RGB = [number, number, number];

const toRgb = (hex: string): RGB => {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};
const toHex = ([r, g, b]: RGB): string =>
  `#${[r, g, b].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('')}`;

/** Distance perceptive approchée (« redmean »). */
export function colorDistance(a: string, b: string): number {
  const [r1, g1, b1] = toRgb(a);
  const [r2, g2, b2] = toRgb(b);
  const rm = (r1 + r2) / 2;
  const dr = r1 - r2;
  const dg = g1 - g2;
  const db = b1 - b2;
  return Math.sqrt((2 + rm / 256) * dr * dr + 4 * dg * dg + (2 + (255 - rm) / 256) * db * db);
}

function hslToHex(h: number, s: number, l: number): string {
  const k = (n: number) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return toHex([f(0) * 255, f(8) * 255, f(4) * 255]);
}

/** Couleur d'une maison (hex). Anciennes parties : tirée de la graine. */
export function houseColorOf(d: Pick<Dynasty, 'seed' | 'color'>): string {
  if (d.color) return d.color;
  return HOUSE_COLORS[Math.floor(new Rng(d.seed).next() * HOUSE_COLORS.length)].hex;
}

/**
 * Choisit une couleur qu'aucune maison ne porte : d'abord dans la palette héraldique (la plus
 * éloignée des couleurs en vue), sinon une teinte créée parmi des candidates tirées au hasard.
 * `near` : couleurs à fuir (maisons vivantes) ; `taken` : couleurs interdites (toutes).
 */
export function freshColor(near: string[], taken: Set<string>, rng: Rng): string {
  const score = (hex: string) =>
    near.length ? Math.min(...near.map((n) => colorDistance(n, hex))) : rng.next();
  const palette = HOUSE_COLORS.map((c): string => c.hex).filter((h) => !taken.has(h));
  let candidates = palette;
  if (!candidates.length) {
    candidates = [];
    for (let i = 0; i < R.candidates; i++) {
      const hex = hslToHex(
        rng.range(0, 360),
        rng.range(R.saturation[0], R.saturation[1]),
        rng.range(R.lightness[0], R.lightness[1]),
      );
      if (!taken.has(hex)) candidates.push(hex);
    }
  }
  let best = candidates[0];
  let bestScore = -1;
  for (const c of candidates) {
    const s = score(c);
    if (s > bestScore) {
      bestScore = s;
      best = c;
    }
  }
  return best;
}

/** Maisons ayant au moins un membre vivant. */
function livingHouses(state: GameState): Set<string> {
  const set = new Set<string>();
  for (const c of Object.values(state.characters)) if (c.alive && c.dynastyId) set.add(c.dynastyId);
  return set;
}

/**
 * Donne une couleur unique à chaque maison : d'abord les souverains (contrastes maximaux),
 * puis les autres. Les couleurs déjà attribuées sont conservées si elles sont uniques.
 */
export function assignHouseColors(state: GameState, first: string[], rng: Rng): void {
  const order = [...new Set([...first, ...Object.keys(state.dynasties)])];
  const taken = new Set<string>();
  const near: string[] = [];
  const living = livingHouses(state);
  for (const id of order) {
    const d = state.dynasties[id];
    if (!d) continue;
    if (d.color && !taken.has(d.color)) {
      taken.add(d.color);
      if (living.has(id)) near.push(d.color);
      continue;
    }
    d.color = freshColor(near, taken, rng);
    taken.add(d.color);
    if (living.has(id)) near.push(d.color);
  }
}

/** Nouvelle maison en cours de partie : une couleur que personne ne porte. */
export function newHouseColor(state: GameState, rng: Rng): string {
  const living = livingHouses(state);
  const taken = new Set(Object.values(state.dynasties).map(houseColorOf));
  const near = Object.values(state.dynasties)
    .filter((d) => living.has(d.id))
    .map(houseColorOf);
  return freshColor(near, taken, rng);
}
