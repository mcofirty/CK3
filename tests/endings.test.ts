import { describe, expect, it } from 'vitest';
import { ACHIEVEMENTS, checkAchievements, computeEnding } from '../src/engine/endings';
import { newGame } from '../src/engine/world';

describe('Fins multiples', () => {
  it('la couronne, puis l’empire, selon les titres royaux de la maison', () => {
    const s = newGame({ seed: 51 });
    expect(['survie', 'puissance', 'legende']).toContain(computeEnding(s));
    const ks = Object.values(s.kingdoms);
    ks[0].holderId = s.playerId;
    expect(computeEnding(s)).toBe('couronne');
    if (ks[1]) {
      ks[1].holderId = s.playerId;
      expect(computeEnding(s)).toBe('empire');
    }
  });

  it('une maison sans terre ni couronne mais célèbre devient une légende', () => {
    const s = newGame({ seed: 52 });
    for (const k of Object.values(s.kingdoms)) k.holderId = undefined;
    s.dynasties[s.playerDynastyId].renown = 2000;
    expect(['legende', 'puissance']).toContain(computeEnding(s));
  });
});

describe('Succès', () => {
  it('se débloquent une seule fois', () => {
    const s = newGame({ seed: 53 });
    expect(ACHIEVEMENTS.length).toBeGreaterThanOrEqual(20);
    s.stats!.battlesWon = 1;
    s.characters[s.playerId].gold = 1500;
    const fresh = checkAchievements(s);
    expect(fresh).toEqual(expect.arrayContaining(['premier_sang', 'riche']));
    expect(checkAchievements(s)).toEqual([]);
    expect(s.achievements).toEqual(expect.arrayContaining(['premier_sang', 'riche']));
  });
});
