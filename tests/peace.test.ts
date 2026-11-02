import { describe, expect, it } from 'vitest';
import { BALANCE } from '../src/data/balance';
import { applyAction } from '../src/engine/actions';
import { runAi } from '../src/engine/ai';
import { applyEffects } from '../src/engine/events/engine';
import {
  aiTerms,
  balanceTerms,
  defaultTerms,
  peaceCandidates,
  peaceTermsAcceptance,
  termsForMode,
} from '../src/engine/peace';
import { independentRulers } from '../src/engine/realm';
import { Rng } from '../src/engine/rng';
import { declareWar } from '../src/engine/war';
import { newGame } from '../src/engine/world';
import { clearEvents } from './helpers';

function setup(seed: number) {
  const s = newGame({ seed });
  clearEvents(s);
  const rival = independentRulers(s).find((id) => id !== s.playerId)!;
  const target = Object.values(s.counties).find((c) => c.holderId === rival)!;
  const ctx = { state: s, rng: new Rng(seed) };
  const w = declareWar(ctx, s.playerId, rival, 'conquete', target.id, true)!;
  s.characters[s.playerId].gold = 1000;
  s.characters[rival].gold = 1000;
  return { s, ctx, rival, w, target };
}

describe('Négociation de paix', () => {
  it('plus on gagne, plus on peut demander ; la barre suit le score de guerre', () => {
    const { s, w, rival } = setup(201);
    const cands = peaceCandidates(s, w.id, 'attaquant');
    expect(cands.length).toBeGreaterThan(1);
    const cheap = cands[0];
    const ask = { warId: w.id, outcome: 'attaquant' as const, counties: [cheap.id], gold: 0 };
    w.score = -40;
    const low = peaceTermsAcceptance(s, ask, s.playerId);
    w.score = 40;
    const high = peaceTermsAcceptance(s, ask, s.playerId);
    expect(low.accept).toBe(false);
    expect(high.score).toBeGreaterThan(low.score);
    expect(high.accept).toBe(true);
    // Beaucoup de comtés lointains : refusé même en position de force.
    const greedy = { ...ask, counties: cands.map((c) => c.id) };
    expect(peaceTermsAcceptance(s, greedy, s.playerId).accept).toBe(false);
    void rival;
  });

  it('un comté occupé coûte moins cher qu’un comté lointain', () => {
    const { s, w, rival } = setup(202);
    const [a, b] = peaceCandidates(s, w.id, 'attaquant').filter((c) => c.status === 'eloigne');
    const c = s.counties[a.id];
    c.occupation = { warId: w.id, byRulerId: s.playerId, since: s.turn };
    const occ = peaceCandidates(s, w.id, 'attaquant').find((x) => x.id === a.id)!;
    expect(occ.status).toBe('occupe');
    expect(occ.value).toBeLessThan(a.value);
    void b;
    void rival;
  });

  it('l’or achète la paix et « équilibrer » trouve la somme juste, dans les limites du trésor', () => {
    const { s, w, rival } = setup(203);
    w.score = -30; // le joueur perd
    const white = termsForMode(s, w.id, s.playerId, 'blanche');
    expect(peaceTermsAcceptance(s, white, s.playerId).accept).toBe(false);
    const paid = balanceTerms(s, white, s.playerId);
    expect(paid.gold).toBeGreaterThan(0);
    expect(paid.payerId).toBe(s.playerId);
    expect(peaceTermsAcceptance(s, paid, s.playerId).accept).toBe(true);
    // Un peu moins d'or : refusé.
    expect(peaceTermsAcceptance(s, { ...paid, gold: paid.gold - 20 }, s.playerId).accept).toBe(
      false,
    );
    // Trésor insuffisant : impossible.
    s.characters[s.playerId].gold = 5;
    expect(peaceTermsAcceptance(s, { ...paid, gold: 500 }, s.playerId).blocked).toMatch(/trésor/);
    void rival;
  });

  it('une paix acceptée transfère comtés et or', () => {
    const { s, w, rival } = setup(204);
    w.score = 60;
    const cands = peaceCandidates(s, w.id, 'attaquant');
    const pick = cands[0].id;
    const terms = { warId: w.id, outcome: 'attaquant' as const, counties: [pick], gold: 100 };
    expect(peaceTermsAcceptance(s, terms, s.playerId).accept).toBe(true);
    const g0 = s.characters[s.playerId].gold;
    const next = applyAction(s, { type: 'negotiatePeace', terms });
    expect(next.wars[w.id]).toBeUndefined();
    expect(next.counties[pick].holderId).toBe(s.playerId);
    expect(next.characters[s.playerId].gold).toBe(g0 + 100);
    expect(next.characters[rival].gold).toBe(900);
  });

  it('une proposition refusée ne change rien', () => {
    const { s, w } = setup(205);
    w.score = -50;
    const terms = defaultTerms(s, w.id, 'attaquant');
    const next = applyAction(s, { type: 'negotiatePeace', terms });
    expect(next.wars[w.id]).toBeDefined();
    expect(next.notifications.some((n) => n.text.includes('rejette'))).toBe(true);
  });

  it('se rendre : l’adversaire accepte ses propres conditions', () => {
    const { s, w } = setup(206);
    w.score = -60;
    const terms = termsForMode(s, w.id, s.playerId, 'reddition');
    expect(terms.outcome).toBe('defenseur');
    expect(peaceTermsAcceptance(s, terms, s.playerId).accept).toBe(true);
  });

  it('l’IA vainqueur propose des conditions que le joueur peut contre-proposer', () => {
    const { s, w, rival } = setup(207);
    // L'IA devient l'attaquante qui gagne : on retourne la guerre.
    w.attackerId = rival;
    w.defenderId = s.playerId;
    w.targetCountyId = Object.values(s.counties).find((c) => c.holderId === s.playerId)!.id;
    w.score = BALANCE.war.peaceThreshold + 10;
    runAi({ state: s, rng: new Rng(9) });
    const ev = s.pendingEvents.find((e) => e.peace);
    expect(ev).toBeDefined();
    expect(ev!.peace!.proposerId).toBe(rival);
    // Ses conditions sont toujours acceptées par elle ; si le joueur retire tout, elle refuse.
    expect(peaceTermsAcceptance(s, ev!.peace!.terms, s.playerId).accept).toBe(true);
    const soft = { ...ev!.peace!.terms, counties: [], gold: 0 };
    expect(peaceTermsAcceptance(s, soft, s.playerId).accept).toBe(false);
    // Contre-proposition acceptée : la guerre se termine et l'événement disparaît.
    const next = applyAction(s, {
      type: 'negotiatePeace',
      terms: ev!.peace!.terms,
      eventUid: ev!.uid,
    });
    expect(next.wars[w.id]).toBeUndefined();
    expect(next.pendingEvents.some((e) => e.uid === ev!.uid)).toBe(false);
    void aiTerms;
  });

  it('accepter l’événement applique les conditions de l’IA', () => {
    const { s, w } = setup(208);
    const pick = peaceCandidates(s, w.id, 'attaquant')[0].id;
    applyEffects(
      { state: s, rng: new Rng(1) },
      [{ paix: { warId: w.id, issue: 'attaquant', termes: { comtes: [pick], or: 50 } } }],
      {},
    );
    expect(s.wars[w.id]).toBeUndefined();
    expect(s.counties[pick].holderId).toBe(s.playerId);
  });
});

describe('Conditions de départ', () => {
  it('« victoire » propose d’emblée des conditions acceptées quand on est en tête', () => {
    const { s, w } = setup(209);
    for (const score of [15, 30, 60]) {
      w.score = score;
      const t = termsForMode(s, w.id, s.playerId, 'victoire');
      expect(peaceTermsAcceptance(s, t, s.playerId).accept).toBe(true);
    }
  });

  it('un vainqueur qui retrouve ses propres conditions est « sûr » d’accepter', () => {
    const { s, w, rival } = setup(210);
    w.attackerId = rival;
    w.defenderId = s.playerId;
    w.targetCountyId = Object.values(s.counties).find((c) => c.holderId === s.playerId)!.id;
    w.score = 55;
    const asked = aiTerms(s, w.id, rival);
    const acc = peaceTermsAcceptance(s, asked, s.playerId);
    expect(acc.accept).toBe(true);
    expect(acc.sure).toBe(true);
    expect(peaceTermsAcceptance(s, { ...asked, counties: [], gold: 0 }, s.playerId).sure).toBe(
      false,
    );
  });
});
