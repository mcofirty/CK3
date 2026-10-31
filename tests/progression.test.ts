import { describe, expect, it } from 'vitest';
import { BALANCE } from '../src/data/balance';
import { applyAction } from '../src/engine/actions';
import { opinion, skill } from '../src/engine/characters';
import { deathChance, killCharacter } from '../src/engine/characters/lifecycle';
import {
  canTakeLegacy,
  canTakePerk,
  gainXp,
  perkPoints,
  renownAvailable,
  seasonProgression,
} from '../src/engine/progression';
import { canBuild, incomeMultiplier, vassalsOf } from '../src/engine/realm';
import { Rng } from '../src/engine/rng';
import { newGame } from '../src/engine/world';

describe('Arbre de compétences du personnage', () => {
  it('l’expérience donne des points de talent', () => {
    const s = newGame({ seed: 5 });
    const p = s.characters[s.playerId];
    expect(perkPoints(p)).toBe(0);
    gainXp(s, p, 'guerre', BALANCE.progression.xpPerPoint * 2);
    expect(perkPoints(p)).toBe(2);
  });

  it('un talent de rang 2 exige un talent de rang 1 de la même branche', () => {
    const s = newGame({ seed: 5 });
    const p = s.characters[s.playerId];
    gainXp(s, p, 'diplomatie', 500);
    expect(canTakePerk(p, 'charisme').ok).toBe(false);
    expect(canTakePerk(p, 'bienseance').ok).toBe(true);
    const s2 = applyAction(
      applyAction(s, { type: 'takePerk', characterId: p.id, perkId: 'bienseance' }),
      {
        type: 'takePerk',
        characterId: p.id,
        perkId: 'charisme',
      },
    );
    const p2 = s2.characters[p.id];
    expect(p2.perks).toEqual(['bienseance', 'charisme']);
    expect(skill(p2, 'diplomatie')).toBe(skill(p, 'diplomatie') + 2);
    expect(perkPoints(p2)).toBe(3);
  });

  it('les talents agissent sur le moteur (revenus, coûts, opinion)', () => {
    const s = newGame({ seed: 6 });
    const p = s.characters[s.playerId];
    const v = vassalsOf(s, p.id)[0];
    const before = { inc: incomeMultiplier(s, p.id), op: v ? opinion(s, v, p.id) : 0 };
    const county = Object.values(s.counties).find((c) => c.holderId === p.id)!;
    const cost0 = canBuild(s, p.id, county.id, 'marche').cost;
    p.perks = ['comptable', 'batisseur', 'bienseance'];
    expect(incomeMultiplier(s, p.id)).toBeCloseTo(before.inc * 1.08, 5);
    expect(canBuild(s, p.id, county.id, 'marche').cost).toBeLessThan(cost0);
    if (v) expect(opinion(s, v, p.id)).toBeGreaterThan(before.op);
  });

  it('les talents disparaissent avec le personnage : l’héritier repart de son propre arbre', () => {
    const s = newGame({ seed: 7 });
    const dead = s.playerId;
    s.characters[dead].perks = ['discipline'];
    s.characters[dead].xp = { guerre: 100 };
    killCharacter({ state: s, rng: new Rng(3) }, dead, 'test');
    expect(s.playerId).not.toBe(dead);
    expect(s.characters[s.playerId].perks ?? []).not.toContain('discipline');
  });

  it('les personnages de l’IA dépensent leurs points', () => {
    const s = newGame({ seed: 8 });
    const other = Object.values(s.characters).find(
      (c) =>
        c.alive &&
        c.dynastyId !== s.playerDynastyId &&
        Object.values(s.counties).some((k) => k.holderId === c.id),
    )!;
    other.xp = { guerre: 250 };
    seasonProgression({ state: s, rng: new Rng(1) });
    expect(other.perks?.length).toBeGreaterThanOrEqual(2);
  });
});

describe('Héritages de la maison', () => {
  it('s’achètent avec la renommée et restent à la maison', () => {
    let s = newGame({ seed: 9 });
    const d = s.dynasties[s.playerDynastyId];
    d.renown = 1000;
    expect(canTakeLegacy(s, d.id, 'tresor_familial').ok).toBe(false);
    s = applyAction(s, { type: 'takeLegacy', legacyId: 'sens_affaires' });
    s = applyAction(s, { type: 'takeLegacy', legacyId: 'tresor_familial' });
    const d2 = s.dynasties[d.id];
    expect(d2.legacies).toEqual(['sens_affaires', 'tresor_familial']);
    expect(renownAvailable(s, d.id)).toBe(1000 - 120 - 280);
    // La renommée totale (score) n'est pas réduite.
    expect(d2.renown).toBe(1000);
  });

  it('agissent sur tous les membres, même après une succession', () => {
    const s = newGame({ seed: 10 });
    const d = s.dynasties[s.playerDynastyId];
    const p = s.characters[s.playerId];
    const base = deathChance(s, p);
    d.legacies = ['longevite'];
    expect(deathChance(s, p)).toBeLessThan(base);
  });

  it('la renommée augmente chaque saison', () => {
    const s = newGame({ seed: 11 });
    const r0 = s.dynasties[s.playerDynastyId].renown;
    seasonProgression({ state: s, rng: new Rng(1) });
    expect(s.dynasties[s.playerDynastyId].renown).toBeGreaterThan(r0);
  });
});
