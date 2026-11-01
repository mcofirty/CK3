import { describe, expect, it } from 'vitest';
import { BALANCE } from '../src/data/balance';
import { applyAction } from '../src/engine/actions';
import { runAi } from '../src/engine/ai';
import { applyEffects } from '../src/engine/events/engine';
import { addOpinion, allied } from '../src/engine/characters';
import { makeAlliance } from '../src/engine/diplomacy';
import { callToArmsAcceptance } from '../src/engine/diplomacy';
import {
  balanceOffer,
  cession,
  countyValue,
  emptyOffer,
  proposeTrade,
  tradableCounties,
  tradeAcceptance,
} from '../src/engine/diplomacy/trade';
import { isCapital } from '../src/engine/economy/local';
import { bordersPlayer, independentRulers } from '../src/engine/realm';
import { Rng } from '../src/engine/rng';
import { canDeclareWar, declareWar } from '../src/engine/war';
import { newGame } from '../src/engine/world';
import { clearEvents } from './helpers';

function setup(seed: number) {
  const s = newGame({ seed });
  clearEvents(s);
  const rival = independentRulers(s).find((id) => id !== s.playerId && bordersPlayer(s, id))!;
  return { s, rival, ctx: { state: s, rng: new Rng(seed) } };
}

describe('Traités de terres', () => {
  it('estime un comté : contigu, il vaut plus que s’il est isolé', () => {
    const { s, rival } = setup(41);
    const c = tradableCounties(s, rival)[0];
    expect(countyValue(s, c)).toBeGreaterThan(50);
    const far = Object.values(s.counties).find(
      (k) => k.holderId !== rival && !k.adjacent.some((n) => s.counties[n].holderId === rival),
    )!;
    expect(countyValue(s, far, rival)).toBeLessThan(countyValue(s, far));
  });

  it('une capitale ne se vend pas ; chacun garde un minimum de terres', () => {
    const { s, rival } = setup(42);
    expect(tradableCounties(s, rival).some(isCapital)).toBe(false);
    const all = tradableCounties(s, rival).map((c) => c.id);
    const acc = tradeAcceptance(s, s.playerId, { ...emptyOffer(rival), takeCounties: all });
    expect(acc.blocked).toBeTruthy();
  });

  it('acheter un comté au juste prix : refus si l’offre est trop basse, puis délai', () => {
    const { s, rival, ctx } = setup(43);
    s.characters[s.playerId].gold = 5000;
    const c = tradableCounties(s, rival)[0];
    const low = { ...emptyOffer(rival), takeCounties: [c.id], giveGold: 10 };
    expect(tradeAcceptance(s, s.playerId, low).accept).toBe(false);
    const fair = balanceOffer(s, s.playerId, low);
    expect(fair.giveGold).toBeGreaterThan(10);
    expect(tradeAcceptance(s, s.playerId, fair).accept).toBe(true);
    const gold = s.characters[s.playerId].gold;
    expect(proposeTrade(ctx, s.playerId, fair)).toBe(true);
    expect(s.counties[c.id].holderId).toBe(s.playerId);
    expect(s.characters[s.playerId].gold).toBe(gold - fair.giveGold);
    // Un refus impose un délai avant de renégocier.
    const other = tradableCounties(s, rival)[0];
    if (other) {
      const cheap = { ...emptyOffer(rival), takeCounties: [other.id], giveGold: 1 };
      expect(proposeTrade(ctx, s.playerId, cheap)).toBe(false);
      expect(tradeAcceptance(s, s.playerId, cheap).blocked).toMatch(/refusé/);
    }
  });

  it('échanger deux comtés, avec soulte, passe par l’action du joueur', () => {
    const { s, rival } = setup(44);
    s.characters[s.playerId].gold = 5000;
    const mine = tradableCounties(s, s.playerId)[0];
    const theirs = tradableCounties(s, rival)[0];
    const offer = balanceOffer(s, s.playerId, {
      ...emptyOffer(rival),
      giveCounties: [mine.id],
      takeCounties: [theirs.id],
    });
    const next = applyAction(s, { type: 'proposeTrade', offer });
    expect(next.counties[theirs.id].holderId).toBe(s.playerId);
    expect(next.counties[mine.id].holderId).toBe(rival);
  });

  it('une cession proposée par l’IA s’exécute comté contre or', () => {
    const { s, rival, ctx } = setup(45);
    const c = tradableCounties(s, s.playerId)[0];
    s.characters[rival].gold = 1000;
    const gold = s.characters[s.playerId].gold;
    expect(cession(ctx, c.id, s.playerId, rival, 300)).toBe(true);
    expect(s.counties[c.id].holderId).toBe(rival);
    expect(s.characters[s.playerId].gold).toBe(gold + 300);
  });
});

describe('Appel à l’aide', () => {
  it('un souverain non allié peut être convaincu par un subside', () => {
    const { s, ctx } = setup(46);
    const [enemy, helper] = independentRulers(s).filter((id) => id !== s.playerId);
    const target = Object.values(s.counties).find((c) => c.holderId === enemy)!;
    const w = declareWar(ctx, s.playerId, enemy, 'conquete', target.id, true)!;
    s.characters[s.playerId].gold = 5000;
    const free = callToArmsAcceptance(s, s.playerId, helper, w.id);
    expect(free.blocked).toBeUndefined();
    expect(free.factors.some((f) => f.label === 'Aucune alliance')).toBe(true);
    const need = Math.max(0, -free.score) * BALANCE.diplomacy.callToArms.goldPerPoint + 50;
    const paid = callToArmsAcceptance(s, s.playerId, helper, w.id, need);
    expect(paid.accept).toBe(true);
    const next = applyAction(s, { type: 'callToArms', allyId: helper, warId: w.id, gold: need });
    expect(next.wars[w.id].attackerAllies).toContain(helper);
    expect(next.characters[s.playerId].gold).toBe(5000 - need);
  });

  it('un refus hors alliance ne rompt rien mais impose un délai', () => {
    const { s, ctx } = setup(47);
    const [enemy, helper] = independentRulers(s).filter((id) => id !== s.playerId);
    const target = Object.values(s.counties).find((c) => c.holderId === enemy)!;
    const w = declareWar(ctx, s.playerId, enemy, 'conquete', target.id, true)!;
    addOpinion(s, helper, s.playerId, 'Test', -100, 0);
    const next = applyAction(s, { type: 'callToArms', allyId: helper, warId: w.id });
    expect(next.wars[w.id].attackerAllies).not.toContain(helper);
    expect(callToArmsAcceptance(next, s.playerId, helper, w.id).blocked).toMatch(/refusé/);
  });
});

describe('Marchandage', () => {
  it('l’équilibrage ne promet jamais plus d’or que le trésor', () => {
    const s = newGame({ seed: 48 });
    clearEvents(s);
    const rival = independentRulers(s).find((id) => id !== s.playerId && bordersPlayer(s, id))!;
    s.characters[s.playerId].gold = 20;
    const c = tradableCounties(s, rival).sort((a, b) => b.development - a.development)[0];
    const o = balanceOffer(s, s.playerId, { ...emptyOffer(rival), takeCounties: [c.id] });
    expect(o.giveGold).toBeLessThanOrEqual(20);
    expect(tradeAcceptance(s, s.playerId, o).blocked).toBeUndefined();
  });
});

describe('Rompre une alliance', () => {
  it('rompre puis déclarer la guerre : possible, mais attaquer aussitôt est une traîtrise', () => {
    const s = newGame({ seed: 49 });
    clearEvents(s);
    const rival = independentRulers(s).find((id) => id !== s.playerId)!;
    const target = Object.values(s.counties).find((c) => c.holderId === rival)!;
    s.characters[s.playerId].claims.push(target.id);
    makeAlliance(s, s.playerId, rival);
    expect(canDeclareWar(s, s.playerId, rival, 'revendication', target.id).ok).toBe(false);
    const prestige = s.characters[s.playerId].prestige;
    let next = applyAction(s, { type: 'breakAlliance', targetId: rival });
    expect(allied(next, next.playerId, rival)).toBe(false);
    expect(next.characters[next.playerId].prestige).toBe(
      prestige + BALANCE.diplomacy.breakAlliance.prestige,
    );
    expect(canDeclareWar(next, next.playerId, rival, 'revendication', target.id).ok).toBe(true);
    const before = next.characters[next.playerId].prestige;
    next = applyAction(next, {
      type: 'declareWar',
      targetId: rival,
      cb: 'revendication',
      countyId: target.id,
    });
    expect(Object.values(next.wars).some((w) => w.defenderId === rival)).toBe(true);
    expect(next.characters[next.playerId].prestige).toBe(
      before + BALANCE.diplomacy.breakAlliance.treacheryPrestige,
    );
  });
});

describe('Allié devenu ennemi', () => {
  it('un allié insultant qui déclare la guerre par événement rompt l’alliance et la guerre a lieu', () => {
    const s = newGame({ seed: 50 });
    clearEvents(s);
    const rival = independentRulers(s).find((id) => id !== s.playerId && bordersPlayer(s, id))!;
    makeAlliance(s, s.playerId, rival);
    applyEffects(
      { state: s, rng: new Rng(1) },
      [{ guerre: { cible: 'rival', attaquant: 'rival' } }],
      {
        souverain: s.playerId,
        rival,
      },
    );
    expect(allied(s, s.playerId, rival)).toBe(false);
    expect(
      Object.values(s.wars).some((w) => w.attackerId === rival && w.defenderId === s.playerId),
    ).toBe(true);
  });

  it('une IA qui vous méprise rompt d’elle-même votre alliance', () => {
    const s = newGame({ seed: 51 });
    clearEvents(s);
    const rival = independentRulers(s).find((id) => id !== s.playerId)!;
    makeAlliance(s, s.playerId, rival);
    addOpinion(s, rival, s.playerId, 'Insulte', -200, 0);
    runAi({ state: s, rng: new Rng(2) });
    expect(allied(s, s.playerId, rival)).toBe(false);
  });
});
