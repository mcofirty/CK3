/** Stress : agir contre sa nature use l'esprit ; au-delà de 100, c'est la crise. */
import { BALANCE } from '../data/balance';
import { TRAITS } from '../data/traits';
import { hasTrait, perkBonus } from './characters';
import { clamp } from './context';
import type { Character, GameState } from './state';

const S = BALANCE.stress;

export function stressOf(c: Character | undefined): number {
  return Math.round(c?.stress ?? 0);
}

/** 0 : serein, 1 : tendu, 2 : accablé, 3 : au bord de la crise. */
export function stressLevel(c: Character | undefined): 0 | 1 | 2 | 3 {
  const s = stressOf(c);
  if (s >= S.crisis) return 3;
  if (s >= S.overwhelmed) return 2;
  if (s >= S.tense) return 1;
  return 0;
}

export const STRESS_LABELS = ['Serein', 'Tendu', 'Accablé', 'En crise'] as const;

/** Ajoute (ou retire) du stress ; les talents réduisent les gains. */
export function addStress(state: GameState, c: Character | undefined, n: number): number {
  if (!c?.alive || !n) return 0;
  const v = n > 0 ? n * Math.max(0.2, 1 + perkBonus(state, c, 'stressGain')) : n;
  c.stress = clamp((c.stress ?? 0) + v, 0, S.crisis + 50);
  return v;
}

/** Stress d'un effet : un nombre, ou par trait (« * » = toujours). */
export function stressFromSpec(
  c: Character,
  spec: number | Record<string, number>,
): { value: number; reasons: string[] } {
  if (typeof spec === 'number') return { value: spec, reasons: [] };
  let value = 0;
  const reasons: string[] = [];
  for (const [t, v] of Object.entries(spec)) {
    if (t === '*' || hasTrait(c, t)) {
      value += v;
      if (t !== '*') reasons.push(TRAITS[t]?.name ?? t);
    }
  }
  return { value, reasons };
}

/** Baisse naturelle du stress par saison. */
export function stressDecay(state: GameState, c: Character): number {
  let d = S.decay + perkBonus(state, c, 'stressDecay');
  for (const t of c.traits) d += TRAITS[t]?.stressDecay ?? 0;
  return d;
}
