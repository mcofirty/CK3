import { describe, expect, it } from 'vitest';
import { seasonAbroad } from '../src/engine/abroad';
import { killCharacter } from '../src/engine/characters/lifecycle';
import { independentRulers, bordersPlayer, realmCounties } from '../src/engine/realm';
import { Rng } from '../src/engine/rng';
import { migrate } from '../src/save/migrations';
import { declareWar } from '../src/engine/war';
import { newGame } from '../src/engine/world';

const rivals = (s: ReturnType<typeof newGame>) =>
  independentRulers(s).filter((id) => id !== s.playerId);

describe('Le monde vit chez les autres', () => {
  it('la carte compte 8 souverains dont le joueur', () => {
    const s = newGame({ seed: 5 });
    expect(Object.keys(s.counties)).toHaveLength(48);
    expect(independentRulers(s)).toHaveLength(8);
    expect(Object.keys(s.kingdoms)).toHaveLength(3);
    const own = realmCounties(s, s.playerId).length;
    expect(own).toBeGreaterThanOrEqual(5);
    expect(own).toBeLessThanOrEqual(8);
  });

  it('les faits de saison touchent les domaines de l’IA et paraissent dans les nouvelles', () => {
    const s = newGame({ seed: 6 });
    s.worldNews = [];
    const rng = new Rng(3);
    for (let i = 0; i < 40; i++) {
      s.turn++;
      seasonAbroad({ state: s, rng });
    }
    const facts = s.worldNews.filter((n) => n.kind === 'fait');
    // ~7 souverains × 12 % × 40 saisons ≈ 34 faits : raisonnable, ni silence ni déluge.
    expect(facts.length).toBeGreaterThan(15);
    expect(facts.length).toBeLessThan(60);
    for (const n of facts) {
      expect(n.rulerId).not.toBe(s.playerId);
      expect(n.text).not.toMatch(/\{/);
    }
  });

  it('une guerre entre souverains de l’IA est une nouvelle du monde', () => {
    const s = newGame({ seed: 7 });
    s.worldNews = [];
    const [a, b] = rivals(s);
    const target = realmCounties(s, b)[0];
    declareWar({ state: s, rng: new Rng(1) }, a, b, 'conquete', target.id, true);
    expect(s.worldNews.some((n) => n.kind === 'guerre' && n.rulerId === a)).toBe(true);
    expect(s.chronicle.some((c) => c.kind === 'guerre')).toBe(false);
  });

  it('la mort d’un souverain étranger et sa succession sont annoncées', () => {
    const s = newGame({ seed: 8 });
    s.worldNews = [];
    const r = rivals(s)[0];
    killCharacter({ state: s, rng: new Rng(2) }, r, 'de vieillesse');
    expect(s.worldNews.some((n) => n.kind === 'deces')).toBe(true);
    expect(s.worldNews.some((n) => n.kind === 'succession')).toBe(true);
  });

  it('le voisinage du joueur est détecté', () => {
    const s = newGame({ seed: 9 });
    const near = rivals(s).filter((id) => bordersPlayer(s, id));
    expect(near.length).toBeGreaterThan(0);
    expect(near.length).toBeLessThan(rivals(s).length);
  });

  it('une sauvegarde v5 reçoit des nouvelles vides', () => {
    const s = newGame({ seed: 10 }) as unknown as Record<string, unknown>;
    delete s.worldNews;
    s.version = 5;
    const m = migrate(JSON.parse(JSON.stringify(s)));
    expect(m.worldNews).toEqual([]);
  });
});
