import { describe, expect, it } from 'vitest';
import { newMinorDynasty } from '../src/engine/characters/lifecycle';
import { colorDistance, houseColorOf } from '../src/engine/heraldry';
import { independentRulers } from '../src/engine/realm';
import { Rng } from '../src/engine/rng';
import { migrate } from '../src/save/migrations';
import { newGame } from '../src/engine/world';

const colors = (s: ReturnType<typeof newGame>) => Object.values(s.dynasties).map(houseColorOf);

describe('Couleurs de maison', () => {
  it('chaque maison a sa propre couleur dès le départ', () => {
    for (let seed = 1; seed <= 10; seed++) {
      const s = newGame({ seed });
      const all = colors(s);
      expect(new Set(all).size).toBe(all.length);
    }
  });

  it('les souverains ont des couleurs bien distinctes', () => {
    const s = newGame({ seed: 2 });
    const cs = independentRulers(s).map((r) =>
      houseColorOf(s.dynasties[s.characters[r].dynastyId!]),
    );
    for (let i = 0; i < cs.length; i++)
      for (let j = i + 1; j < cs.length; j++)
        expect(colorDistance(cs[i], cs[j])).toBeGreaterThan(100);
  });

  it('les maisons nées en cours de partie reçoivent des couleurs nouvelles', () => {
    const s = newGame({ seed: 3 });
    const ctx = { state: s, rng: new Rng(9) };
    const founder = s.characters[s.playerId];
    for (let i = 0; i < 80; i++) {
      const id = newMinorDynasty(ctx, founder);
      const c = s.dynasties[id].color!;
      expect(c).toMatch(/^#[0-9a-f]{6}$/);
    }
    const all = colors(s);
    expect(new Set(all).size).toBe(all.length);
  });

  it('une sauvegarde v8 (couleurs numérotées) reçoit des couleurs uniques', () => {
    const s = newGame({ seed: 4 }) as unknown as Record<string, unknown>;
    for (const d of Object.values(s.dynasties as Record<string, { color?: unknown }>)) d.color = 1;
    s.version = 8;
    const m = migrate(JSON.parse(JSON.stringify(s)));
    const all = Object.values(m.dynasties).map(houseColorOf);
    expect(new Set(all).size).toBe(all.length);
  });
});
