import { describe, expect, it } from 'vitest';
import { Rng } from '../src/engine/rng';

describe('Aléatoire à graine (mulberry32)', () => {
  it('reproduit la même suite à graine égale', () => {
    const a = new Rng(123);
    const b = new Rng(123);
    for (let i = 0; i < 100; i++) expect(a.next()).toBe(b.next());
  });
  it('produit des valeurs dans [0, 1) et des entiers bornés', () => {
    const r = new Rng(5);
    for (let i = 0; i < 1000; i++) {
      const v = r.next();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
      const n = r.int(2, 4);
      expect(n).toBeGreaterThanOrEqual(2);
      expect(n).toBeLessThanOrEqual(4);
    }
  });
});
