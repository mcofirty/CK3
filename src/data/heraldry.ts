/**
 * Couleurs de maison : champ du blason et fond des portraits. Émaux classiques et teintes
 * d'usage, toutes assez soutenues pour porter l'or ou l'argent.
 */
export const HOUSE_COLORS = [
  { name: 'Gueules', hex: '#b3261e' },
  { name: 'Azur', hex: '#1f4e8c' },
  { name: 'Sinople', hex: '#2f6b2f' },
  { name: 'Pourpre', hex: '#5b2a7a' },
  { name: 'Sable', hex: '#1b1b1b' },
  { name: 'Or', hex: '#c99a1d' },
  { name: 'Tanné', hex: '#b0611f' },
  { name: 'Sanguine', hex: '#7a1f1f' },
  { name: 'Mûre', hex: '#7a2850' },
  { name: 'Bleu céleste', hex: '#4a80b4' },
  { name: 'Vert d’eau', hex: '#2b6f6b' },
  { name: 'Rose', hex: '#b4546f' },
  { name: 'Brun', hex: '#6b4a2a' },
  { name: 'Acier', hex: '#55606c' },
] as const;

/** Teintes créées une fois la palette épuisée : assez soutenues pour l'or et l'argent. */
export const HOUSE_COLOR_RANGE = {
  saturation: [0.25, 0.5] as const,
  lightness: [0.24, 0.42] as const,
  /** Nombre de candidates tirées pour trouver la plus distincte. */
  candidates: 160,
};
