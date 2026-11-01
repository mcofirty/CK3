import { describe, expect, it } from 'vitest';
import { BALANCE } from '../src/data/balance';
import { applyAction } from '../src/engine/actions';
import { debtOf, edictCheck, loanCap, seasonLocalEconomy } from '../src/engine/economy';
import {
  contentmentDelta,
  contentmentOf,
  countyDevMult,
  countyIncomeMult,
  countyLevyMult,
  revoltChance,
} from '../src/engine/economy/local';
import { applyEffects, effectLabels } from '../src/engine/events/engine';
import { economyOf } from '../src/engine/realm';
import { Rng } from '../src/engine/rng';
import { newGame } from '../src/engine/world';
import { SAVE_VERSION } from '../src/engine/state';
import { migrate } from '../src/save/migrations';
import { clearEvents } from './helpers';

const own = (s: ReturnType<typeof newGame>) =>
  Object.values(s.counties).filter((c) => c.holderId === s.playerId);
const goldLine = (s: ReturnType<typeof newGame>, label: string) =>
  economyOf(s, s.playerId).gold.find((l) => l.label === label)?.value ?? 0;

describe('Impôts et contentement', () => {
  it('des impôts élevés rapportent plus mais fâchent le peuple', () => {
    let s = clearEvents(newGame({ seed: 61 }));
    const before = goldLine(s, 'Domaine propre');
    s = applyAction(s, { type: 'setTaxAll', level: 'eleve' });
    expect(goldLine(s, 'Domaine propre')).toBeCloseTo(before * 1.3, 0);
    const c = own(s)[0];
    const d = contentmentDelta(s, c);
    expect(d.reasons.find((r) => r.label.startsWith('Impôts'))?.value).toBe(-3);
    const v0 = contentmentOf(c);
    seasonLocalEconomy({ state: s, rng: new Rng(1) });
    expect(contentmentOf(s.counties[c.id])).toBeLessThan(v0);
  });

  it('le contentement agit sur revenus, levées et développement', () => {
    const s = newGame({ seed: 62 });
    const c = own(s)[0];
    c.contentment = 90;
    const high = [countyIncomeMult(c), countyLevyMult(s, c), countyDevMult(s, c)];
    c.contentment = 10;
    const low = [countyIncomeMult(c), countyLevyMult(s, c), countyDevMult(s, c)];
    high.forEach((h, i) => expect(h).toBeGreaterThan(low[i]));
  });

  it('un peuple à bout se révolte : un événement de jacquerie est déclenché', () => {
    const s = newGame({ seed: 63 });
    s.pendingTriggers = [];
    const c = own(s)[0];
    c.contentment = 0;
    c.tax = 'ecrasant';
    expect(revoltChance(c)).toBeGreaterThan(0.2);
    let triggered = false;
    for (let i = 0; i < 30 && !triggered; i++) {
      c.contentment = 0;
      seasonLocalEconomy({ state: s, rng: new Rng(i + 1) });
      triggered = (s.pendingTriggers ?? []).some((t) => t.trigger === 'revolte_paysanne');
    }
    expect(triggered).toBe(true);
  });

  it('la conscription lourde donne plus de levées et freine le développement', () => {
    let s = clearEvents(newGame({ seed: 64 }));
    const c = own(s)[0];
    const l0 = countyLevyMult(s, c);
    const d0 = countyDevMult(s, c);
    s = applyAction(s, { type: 'setConscription', countyId: c.id, level: 'lourde' });
    const c2 = s.counties[c.id];
    expect(countyLevyMult(s, c2)).toBeCloseTo(l0 * BALANCE.local.conscription.lourde.levies, 5);
    expect(countyDevMult(s, c2)).toBeLessThan(d0);
  });
});

describe('Édits', () => {
  it('se proclament contre de l’or, s’entretiennent, et ne reviennent pas tout de suite', () => {
    let s = clearEvents(newGame({ seed: 65 }));
    s.characters[s.playerId].gold = 500;
    s = applyAction(s, { type: 'toggleEdict', id: 'greniers' });
    expect(s.edicts?.[s.playerId]).toEqual(['greniers']);
    expect(s.characters[s.playerId].gold).toBe(440);
    expect(goldLine(s, 'Édits : entretien')).toBe(-6);
    expect(
      contentmentDelta(s, own(s)[0]).reasons.find((r) => r.label === 'Greniers publics')?.value,
    ).toBe(2);
    s = applyAction(s, { type: 'toggleEdict', id: 'greniers' });
    expect(s.edicts?.[s.playerId]).toEqual([]);
    expect(edictCheck(s, s.playerId, 'greniers').ok).toBe(false);
  });

  it('le cadastre augmente les revenus du domaine', () => {
    let s = clearEvents(newGame({ seed: 66 }));
    s.characters[s.playerId].gold = 500;
    const before = goldLine(s, 'Domaine propre');
    s = applyAction(s, { type: 'toggleEdict', id: 'cadastre' });
    expect(goldLine(s, 'Domaine propre')).toBeCloseTo(before * 1.1, 0);
  });
});

describe('Emprunts', () => {
  it('prêt plafonné, intérêts chaque saison, remboursement', () => {
    let s = clearEvents(newGame({ seed: 67 }));
    const cap = loanCap(s, s.playerId);
    expect(cap).toBeGreaterThan(BALANCE.local.loanMin);
    const gold = s.characters[s.playerId].gold;
    s = applyAction(s, { type: 'takeLoan', amount: cap + 100 });
    expect(debtOf(s, s.playerId)).toBe(0);
    s = applyAction(s, { type: 'takeLoan', amount: 100 });
    expect(s.characters[s.playerId].gold).toBe(gold + 100);
    expect(goldLine(s, 'Intérêts des emprunts')).toBeCloseTo(-100 * BALANCE.local.loanRate, 5);
    const loan = s.loans![0];
    s = applyAction(s, { type: 'repayLoan', loanId: loan.id });
    expect(debtOf(s, s.playerId)).toBe(0);
  });
});

describe('Événements économiques', () => {
  it('effets contentement et impôts sur le comté du rôle', () => {
    const s = newGame({ seed: 68 });
    const c = own(s)[0];
    c.contentment = 40;
    applyEffects({ state: s, rng: new Rng(1) }, [{ contentement: 20 }, { impots: 'faible' }], {
      souverain: s.playerId,
      comte: c.id,
    });
    expect(c.contentment).toBe(60);
    expect(c.tax).toBe('faible');
    expect(effectLabels(s, [{ impots: 'faible' }], { comte: c.id })[0]).toContain('faibles');
  });
});

describe('Sauvegarde', () => {
  it('une sauvegarde v3 passe à la version courante', () => {
    const s = newGame({ seed: 69 }) as unknown as Record<string, unknown>;
    s.version = 3;
    delete s.edicts;
    delete s.loans;
    const m = migrate(JSON.parse(JSON.stringify(s)));
    expect(m.version).toBe(SAVE_VERSION);
    expect(m.loans).toEqual([]);
    expect(m.edicts).toEqual({});
  });
});
