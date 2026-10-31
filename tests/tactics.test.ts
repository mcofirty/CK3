import { describe, expect, it } from 'vitest';
import { BALANCE } from '../src/data/balance';
import {
  answerDuel,
  drawHand,
  duelPower,
  eligibleTactics,
  proposeDuel,
  resolveRound,
} from '../src/engine/battle/engine';
import type { BattleState, SideOrders } from '../src/engine/battle/types';
import { allOn, battle, cmd, fixedRng, side, start, units } from './helpers';

const hold: SideOrders = { orders: { left: 'tenir', center: 'tenir', right: 'tenir' } };
const withTactic = (t: SideOrders['tactic']): SideOrders => ({ ...hold, tactic: t });
const duelOf = (b: BattleState) => b.duel;
const forced = (a: SideOrders, d: SideOrders) => ({ forced: { attacker: a, defender: d } });

describe('Tactiques de bataille', () => {
  it('la main dépend de l’armée et du commandant', () => {
    const b = battle(
      side(units({ archers: 600, levees: 400 }), { commanders: [cmd('a', 14, [], { ruse: 15 })] }),
      side(units({ levees: 1000 })),
    );
    const el = eligibleTactics(b.attacker);
    expect(el).toContain('pluie_fleches');
    expect(el).toContain('diversion');
    expect(el).not.toContain('charge_lourde');
    expect(eligibleTactics(b.defender)).not.toContain('pluie_fleches');
    expect(b.attacker.tactics.length).toBe(BALANCE.battle.tacticHand);
  });

  it('les talents garantissent une tactique, un Tacticien en tient une de plus', () => {
    const b = battle(
      side(units({ levees: 400, archers: 300, cavalerie: 300 }), {
        commanders: [cmd('a', 14, ['tacticien'], { tactics: ['harangue'], ruse: 15 })],
      }),
      side(units({ levees: 1000 })),
    );
    const hand = drawHand(b.attacker, fixedRng());
    expect(hand[0]).toBe('harangue');
    expect(hand.length).toBe(BALANCE.battle.tacticHand + 1);
  });

  it('une tactique jouée agit une fois et quitte la main', () => {
    const run = (t?: SideOrders['tactic']) => {
      const b = battle(side(units({ levees: 1000 })), side(units({ levees: 1000 })));
      allOn(b, 'attacker', 'center');
      allOn(b, 'defender', 'center');
      b.attacker.tactics = ['harangue'];
      start(b);
      resolveRound(b, fixedRng(), forced(withTactic(t), hold));
      return b;
    };
    const plain = run();
    const rallied = run('harangue');
    expect(rallied.attacker.fronts.center.morale).toBeCloseTo(
      plain.attacker.fronts.center.morale + 12,
      5,
    );
    expect(rallied.attacker.tactics).toEqual([]);
    expect(rallied.attacker.usedTactics).toEqual(['harangue']);
    expect(rallied.log[0].tactics?.attacker).toBe('harangue');
  });

  it('la diversion annule la tactique adverse', () => {
    const b = battle(side(units({ levees: 1000 })), side(units({ levees: 1000 })));
    allOn(b, 'attacker', 'center');
    allOn(b, 'defender', 'center');
    b.attacker.tactics = ['harangue'];
    b.defender.tactics = ['diversion'];
    start(b);
    const m0 = b.attacker.fronts.center.morale;
    resolveRound(b, fixedRng(), forced(withTactic('harangue'), withTactic('diversion')));
    expect(b.attacker.fronts.center.morale).toBeLessThan(m0);
    expect(b.log[0].lines.join(' ')).toContain('déjoue');
  });
});

describe('Météo, élan, duels', () => {
  it('la météo est tirée au début de la bataille', () => {
    const b = battle(
      side(units({ levees: 100 })),
      side(units({ levees: 100 })),
      { season: 3 },
      fixedRng(0.01),
    );
    expect(b.weather).toBe('neige');
    const c = battle(
      side(units({ levees: 100 })),
      side(units({ levees: 100 })),
      { season: 1 },
      fixedRng(0.99),
    );
    expect(c.weather).toBe('clair');
  });

  it('le camp qui domine l’échange gagne de l’élan', () => {
    const b = battle(side(units({ infanterie: 1000 })), side(units({ levees: 1000 })));
    allOn(b, 'attacker', 'center');
    allOn(b, 'defender', 'center');
    start(b);
    resolveRound(
      b,
      fixedRng(),
      forced({ orders: { left: 'tenir', center: 'charger', right: 'tenir' } }, hold),
    );
    expect(b.attacker.elan).toBe(1);
    expect(b.defender.elan).toBe(0);
  });

  it('un duel se gagne à la Guerre ; le vainqueur galvanise ses troupes', () => {
    const b = battle(
      side(units({ levees: 1000 }), {
        commanders: [cmd('fort', 20, ['courageux'])],
        isPlayer: true,
      }),
      side(units({ levees: 1000 }), { commanders: [cmd('faible', 4)] }),
    );
    allOn(b, 'attacker', 'center');
    allOn(b, 'defender', 'center');
    start(b);
    delete b.duel;
    expect(duelPower(b.attacker.commanders[0])).toBeGreaterThan(
      duelPower(b.defender.commanders[0]),
    );
    const m0 = b.attacker.fronts.center.morale;
    // Le joueur défie ; l'IA, bien plus faible, refuse : ses rangs murmurent.
    expect(proposeDuel(b, 'attacker', fixedRng())).toBe(true);
    expect(duelOf(b)?.status).toBe('refuse');
    expect(b.defender.fronts.center.morale).toBeLessThan(b.attacker.fronts.center.morale);
    // Un défi de l'IA attend la réponse du joueur.
    const c = battle(
      side(units({ levees: 1000 }), { commanders: [cmd('j', 20)], isPlayer: true }),
      side(units({ levees: 1000 }), { commanders: [cmd('ia', 6)] }),
    );
    allOn(c, 'attacker', 'center');
    allOn(c, 'defender', 'center');
    start(c);
    delete c.duel;
    c.defender.challenged = false;
    proposeDuel(c, 'defender', fixedRng());
    expect(duelOf(c)?.status).toBe('propose');
    answerDuel(c, true, fixedRng());
    expect(duelOf(c)?.status).toBe('fini');
    expect(duelOf(c)?.winner).toBe('attacker');
    expect(c.attacker.fronts.center.morale).toBeGreaterThan(m0 - 1);
  });
});
