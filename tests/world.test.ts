import { describe, expect, it } from 'vitest';
import { ORIGINS } from '../src/data/origins';
import { generateMap } from '../src/engine/mapgen';
import { countyRuler } from '../src/engine/realm';
import { Rng } from '../src/engine/rng';
import { migrate } from '../src/save/migrations';
import { SAVE_VERSION } from '../src/engine/state';
import { newGame } from '../src/engine/world';

describe('Variété des parties', () => {
  it('génère des cartes jouables et toutes différentes', () => {
    const rng = new Rng(99);
    const names = new Set<string>();
    for (let i = 0; i < 25; i++) {
      const m = generateMap(rng);
      expect(m.counties).toHaveLength(30);
      expect(m.realms).toHaveLength(5);
      for (const r of m.realms) expect(r.length).toBeGreaterThanOrEqual(5);
      // Graphe connexe et adjacences symétriques.
      const byId = new Map(m.counties.map((c) => [c.id, c]));
      for (const c of m.counties) for (const n of c.adjacent) expect(byId.get(n)!.adjacent).toContain(c.id);
      names.add(m.counties.map((c) => c.name).join());
    }
    expect(names.size).toBe(25);
  });

  it('deux graines donnent des débuts de partie différents', () => {
    const a = newGame({ seed: 10 });
    const b = newGame({ seed: 11 });
    expect(a.map.counties.map((c) => c.name)).not.toEqual(b.map.counties.map((c) => c.name));
    const sig = (s: typeof a) => [s.startYear, s.origin?.id, s.characters[s.playerId].name].join();
    expect(sig(a)).not.toEqual(sig(b));
  });

  it('chaque origine produit une partie valide', () => {
    for (const o of ORIGINS) {
      const s = newGame({ seed: 7, originId: o.id });
      expect(s.origin?.id).toBe(o.id);
      const own = Object.values(s.counties).filter((c) => countyRuler(s, c) === s.playerId);
      expect(own.length).toBeGreaterThanOrEqual(5);
      expect(s.pendingEvents[0].eventId).toBe('intro_origine');
      if (o.guerreVoisin) expect(Object.values(s.wars).some((w) => w.defenderId === s.playerId)).toBe(true);
      if (o.age) {
        const age = Math.floor(-s.characters[s.playerId].birthTurn / 4);
        expect(age).toBeGreaterThanOrEqual(o.age[0]);
        expect(age).toBeLessThanOrEqual(o.age[1] + 1);
      }
    }
  });

  it('une sauvegarde de version 1 reçoit la carte historique', () => {
    const s = newGame({ seed: 5 }) as unknown as Record<string, unknown>;
    const v1: Record<string, unknown> = { ...s, version: 1 };
    delete v1.map;
    const m = migrate(v1);
    expect(m.version).toBe(SAVE_VERSION);
    expect(m.map.counties.length).toBe(30);
  });
});
