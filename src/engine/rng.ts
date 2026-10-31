/**
 * Générateur pseudo-aléatoire à graine (mulberry32).
 * L'état interne est un entier 32 bits stocké dans la sauvegarde.
 */
export class Rng {
  constructor(public s: number) {
    this.s = s >>> 0;
  }

  /** Nombre dans [0, 1). */
  next(): number {
    this.s = (this.s + 0x6d2b79f5) >>> 0;
    let t = this.s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /** Vrai avec la probabilité p (0 à 1). */
  chance(p: number): boolean {
    return this.next() < p;
  }

  /** Entier dans [min, max] inclus. */
  int(min: number, max: number): number {
    return min + Math.floor(this.next() * (max - min + 1));
  }

  /** Réel dans [min, max). */
  range(min: number, max: number): number {
    return min + this.next() * (max - min);
  }

  pick<T>(items: readonly T[]): T {
    if (items.length === 0) throw new Error('pick: liste vide');
    return items[Math.floor(this.next() * items.length)];
  }

  /** Tirage pondéré ; renvoie undefined si tous les poids sont nuls. */
  weighted<T>(items: readonly T[], weight: (t: T) => number): T | undefined {
    const total = items.reduce((s, t) => s + Math.max(0, weight(t)), 0);
    if (total <= 0) return undefined;
    let r = this.next() * total;
    for (const t of items) {
      r -= Math.max(0, weight(t));
      if (r < 0) return t;
    }
    return items[items.length - 1];
  }

  shuffle<T>(items: T[]): T[] {
    for (let i = items.length - 1; i > 0; i--) {
      const j = Math.floor(this.next() * (i + 1));
      [items[i], items[j]] = [items[j], items[i]];
    }
    return items;
  }

  /** Nouvelle graine dérivée. */
  seed(): number {
    return Math.floor(this.next() * 4294967296) >>> 0;
  }
}

/** Hachage simple d'une chaîne en entier 32 bits (graines déterministes). */
export function hashString(str: string): number {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
