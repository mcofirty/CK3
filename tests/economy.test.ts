import { describe, expect, it } from 'vitest';
import { addOpinion, demesneLimit, opinion } from '../src/engine/characters';
import {
  economyOf,
  vassalContribution,
  vassalsOf,
  countyIncome,
  canBuild,
} from '../src/engine/realm';
import { applyAction } from '../src/engine/actions';
import { newGame } from '../src/engine/world';
import { BALANCE } from '../src/data/balance';
import { clearEvents } from './helpers';

const goldLine = (s: ReturnType<typeof newGame>, label: string) =>
  economyOf(s, s.playerId).gold.find((l) => l.label === label)?.value ?? 0;

describe('Économie (section 5)', () => {
  it('un Marché augmente les revenus du comté', () => {
    const s = newGame({ seed: 5, originId: 'tresor' });
    const c = Object.values(s.counties).find(
      (k) => k.holderId === s.playerId && !k.buildings.some((b) => b.type === 'marche'),
    )!;
    const before = countyIncome(c);
    c.buildings.push({ type: 'marche', level: 1 });
    expect(countyIncome(c)).toBeGreaterThan(before);
  });

  it('une construction coûte de l’or et se termine après le nombre de saisons prévu', () => {
    let s = newGame({ seed: 5, originId: 'tresor' });
    const c = Object.values(s.counties).find(
      (k) => k.holderId === s.playerId && k.buildings.length < k.slots,
    )!;
    const chk = canBuild(s, s.playerId, c.id, 'chapelle');
    expect(chk.ok).toBe(true);
    const gold = s.characters[s.playerId].gold;
    s = applyAction(s, { type: 'build', countyId: c.id, building: 'chapelle' });
    expect(s.counties[c.id].construction?.remaining).toBe(chk.seasons);
    expect(s.characters[s.playerId].gold).toBe(gold - chk.cost);
    for (let i = 0; i < chk.seasons; i++) {
      s = clearEvents(s);
      s = applyAction(s, { type: 'endSeason' });
    }
    expect(s.counties[c.id].buildings.some((b) => b.type === 'chapelle')).toBe(true);
  });

  it('la contribution d’un vassal baisse avec son opinion', () => {
    expect(vassalContribution(-50)).toBeLessThan(vassalContribution(0));
    expect(vassalContribution(50)).toBeGreaterThan(vassalContribution(0));
    const s = newGame({ seed: 5, originId: 'tresor' });
    const v = vassalsOf(s, s.playerId)[0];
    const before = goldLine(s, 'Impôts des vassaux');
    addOpinion(s, v, s.playerId, 'Test', -80, 10);
    expect(opinion(s, v, s.playerId)).toBeLessThan(0);
    expect(goldLine(s, 'Impôts des vassaux')).toBeLessThan(before);
  });

  it('le domaine propre est limité par la Gestion (base 3, +1 tous les 5 points)', () => {
    const s = newGame({ seed: 5, originId: 'tresor' });
    const p = s.characters[s.playerId];
    p.traits = [];
    p.skills.gestion = 10;
    expect(demesneLimit(s, p.id)).toBe(BALANCE.economy.demesneBase + 2);
    p.skills.gestion = 4;
    expect(demesneLimit(s, p.id)).toBe(BALANCE.economy.demesneBase);
  });

  it('au-delà de la limite, les revenus baissent et les vassaux s’agacent', () => {
    const s = newGame({ seed: 5, originId: 'tresor' });
    const p = s.characters[s.playerId];
    const v = vassalsOf(s, p.id)[0];
    p.traits = [];
    p.skills.gestion = 20;
    const opBefore = opinion(s, v, p.id);
    p.skills.gestion = 0;
    expect(goldLine(s, 'Domaine propre trop étendu')).toBeLessThan(0);
    expect(opinion(s, v, p.id)).toBeLessThan(opBefore);
  });
});
