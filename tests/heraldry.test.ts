import { describe, expect, it } from 'vitest';
import { HOUSE_COLORS } from '../src/data/heraldry';
import { houseColorIndex } from '../src/engine/heraldry';
import { independentRulers } from '../src/engine/realm';
import { migrate } from '../src/save/migrations';
import { newGame } from '../src/engine/world';

describe('Couleurs de maison', () => {
  it('les maisons des souverains ont toutes une couleur différente', () => {
    for (let seed = 1; seed <= 15; seed++) {
      const s = newGame({ seed });
      const houses = [...new Set(independentRulers(s).map((r) => s.characters[r].dynastyId!))];
      const colors = houses.map((d) => houseColorIndex(s.dynasties[d]));
      expect(new Set(colors).size).toBe(houses.length);
    }
  });

  it('les couleurs sont réparties : aucune n’est portée par plus de 3 maisons au départ', () => {
    const s = newGame({ seed: 3 });
    const count = new Map<number, number>();
    for (const d of Object.values(s.dynasties)) {
      const i = houseColorIndex(d);
      expect(HOUSE_COLORS[i]).toBeDefined();
      count.set(i, (count.get(i) ?? 0) + 1);
    }
    expect(Math.max(...count.values())).toBeLessThanOrEqual(3);
  });

  it('une sauvegarde v7 reçoit des couleurs distinctes pour ses souverains', () => {
    const s = newGame({ seed: 4 }) as unknown as Record<string, unknown>;
    for (const d of Object.values(s.dynasties as Record<string, { color?: number }>))
      delete d.color;
    s.version = 7;
    const m = migrate(JSON.parse(JSON.stringify(s)));
    const houses = [...new Set(independentRulers(m).map((r) => m.characters[r].dynastyId!))];
    expect(new Set(houses.map((d) => m.dynasties[d].color)).size).toBe(houses.length);
  });
});
