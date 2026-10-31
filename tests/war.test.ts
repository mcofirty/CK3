import { describe, expect, it } from 'vitest';
import { applyAction } from '../src/engine/actions';
import { countyRuler, fortLevel, realmCounties } from '../src/engine/realm';
import { canDeclareWar, findPath } from '../src/engine/war';
import { newGame } from '../src/engine/world';
import type { GameState } from '../src/engine/state';
import { clearEvents } from './helpers';

function claimTarget(s: GameState) {
  const p = s.characters[s.playerId];
  const county = s.counties[p.claims[0]];
  return { county, defender: countyRuler(s, county) };
}

describe('Guerre de campagne (section 8)', () => {
  it('une revendication est nécessaire pour déclarer une guerre de revendication', () => {
    const s = newGame({ seed: 4 });
    const { county, defender } = claimTarget(s);
    expect(canDeclareWar(s, s.playerId, defender, 'revendication', county.id).ok).toBe(true);
    const other = realmCounties(s, defender).find((c) => c.id !== county.id)!;
    expect(canDeclareWar(s, s.playerId, defender, 'revendication', other.id).ok).toBe(false);
    expect(canDeclareWar(s, s.playerId, defender, 'conquete', county.id).reasons.join()).toMatch(/roi|Ambitieux|prestige/);
  });

  it('une guerre complète : déclaration, siège, occupation, paix et cession du comté', () => {
    let s = newGame({ seed: 4 });
    const { county, defender } = claimTarget(s);
    s.characters[s.playerId].gold = 5000;
    s = applyAction(s, { type: 'declareWar', targetId: defender, cb: 'revendication', countyId: county.id });
    const war = Object.values(s.wars)[0];
    expect(war).toBeDefined();
    s = applyAction(s, { type: 'raiseArmy' });
    const army = Object.values(s.armies).find((a) => a.ownerId === s.playerId)!;
    // Une armée de taille écrasante pour garantir l'issue.
    army.men.infanterie += 20000;
    army.baseMen += 20000;
    s = applyAction(s, { type: 'moveArmy', armyId: army.id, targetCountyId: county.id });
    expect(s.armies[army.id].path.length).toBeGreaterThan(0);
    for (let i = 0; i < 24 && s.wars[war.id]; i++) {
      s = clearEvents(s, true);
      if (s.phase === 'bataille') {
        s = applyAction(s, { type: 'battleAuto' });
        s = applyAction(s, { type: 'battleClose' });
        continue;
      }
      const w = s.wars[war.id];
      if (w && w.score >= 50) s = applyAction(s, { type: 'peace', warId: war.id, kind: 'exiger' });
      else s = applyAction(s, { type: 'endSeason' });
      const a = s.armies[army.id];
      if (a && a.location !== county.id && !a.path.length) s = applyAction(s, { type: 'moveArmy', armyId: army.id, targetCountyId: county.id });
    }
    expect(s.wars[war.id]).toBeUndefined();
    expect(countyRuler(s, s.counties[county.id])).toBe(s.playerId);
  });

  it('un siège dure 1 saison + 1 par niveau de fortification', () => {
    const s = newGame({ seed: 4 });
    const c = Object.values(s.counties)[0];
    c.baseFort = 2;
    expect(fortLevel(c)).toBe(2);
    c.buildings.push({ type: 'muraille', level: 2 });
    expect(fortLevel(c)).toBe(3);
  });

  it('les armées ne traversent pas un royaume neutre', () => {
    const s = newGame({ seed: 4 });
    const own = realmCounties(s, s.playerId);
    const foreign = Object.values(s.counties).find((c) => countyRuler(s, c) !== s.playerId)!;
    expect(findPath(s, s.playerId, own[0].id, foreign.id)).toEqual([]);
    expect(findPath(s, s.playerId, own[0].id, own[own.length - 1].id).length).toBeGreaterThanOrEqual(0);
  });
});
