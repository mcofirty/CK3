import { describe, expect, it } from 'vitest';
import { BALANCE } from '../src/data/balance';
import { applyAction } from '../src/engine/actions';
import { ambitionStatus } from '../src/engine/ambitions';
import { opinion } from '../src/engine/characters';
import { completeAmbition, seasonCourt } from '../src/engine/court';
import { decisionCheck } from '../src/engine/decisions';
import { applyEffects, drawSeasonEvents, effectLabels } from '../src/engine/events/engine';
import { hasGrudge } from '../src/engine/intrigue';
import { seasonPlague, startPlague } from '../src/engine/plague';
import { makeLovers } from '../src/engine/relations';
import { Rng } from '../src/engine/rng';
import { addStress, stressLevel } from '../src/engine/stress';
import { canDeclareWar } from '../src/engine/war';
import { newGame } from '../src/engine/world';
import { clearEvents } from './helpers';

const ctxOf = (s: ReturnType<typeof newGame>, seed = 1) => ({ state: s, rng: new Rng(seed) });

describe('Ambitions', () => {
  it('une ambition est proposée dès le début de la partie', () => {
    const s = newGame({ seed: 21 });
    expect(s.pendingEvents.some((e) => e.eventId === 'sys_ambition')).toBe(true);
  });

  it('se choisit, progresse et récompense', () => {
    let s = newGame({ seed: 22 });
    const inst = s.pendingEvents.find((e) => e.eventId === 'sys_ambition')!;
    s.pendingEvents = s.pendingEvents.filter((e) => e !== inst);
    s.pendingEvents.push({
      ...inst,
      inline: {
        ...inst.inline!,
        choix: [{ libelle: 'Trésor', effets: [{ ambition: 'tresor' }] }],
      },
    });
    s = applyAction(s, { type: 'chooseEvent', uid: inst.uid, choice: 0 });
    const p = s.characters[s.playerId];
    expect(p.ambition?.id).toBe('tresor');
    const st = ambitionStatus(s, p)!;
    expect(st.target).toBe(600);
    const prestige = p.prestige;
    p.gold = 700;
    completeAmbition(s, p);
    expect(p.ambition).toBeUndefined();
    expect(p.prestige).toBeGreaterThan(prestige);
    expect(p.traits).toContain('accompli');
    expect(s.rulers?.[0].ambitions).toContain('Remplir le trésor');
  });

  it('échouer ajoute du stress', () => {
    const s = newGame({ seed: 23 });
    const p = s.characters[s.playerId];
    s.pendingEvents = [];
    p.ambition = { id: 'couronne', startTurn: -1000, base: 0, counter: 0 };
    seasonCourt(ctxOf(s));
    expect(p.ambition).toBeUndefined();
    expect(p.stress).toBeGreaterThanOrEqual(BALANCE.stress.ambitionFail - BALANCE.stress.decay * 2);
  });
});

describe('Stress', () => {
  it('agir contre sa nature stresse ; le stress retombe ; la crise survient au-delà de 100', () => {
    const s = newGame({ seed: 24 });
    const p = s.characters[s.playerId];
    p.traits = [...p.traits.filter((t) => t !== 'cruel'), 'juste'];
    applyEffects(ctxOf(s), [{ stress: { juste: 30, cruel: -10 } }], { souverain: p.id });
    expect(p.stress).toBe(30);
    expect(effectLabels(s, [{ stress: { juste: 30 } }], {})[0]).toContain('Juste');
    s.pendingEvents = [];
    seasonCourt(ctxOf(s));
    expect(p.stress).toBeLessThan(30);
    addStress(s, p, 200);
    expect(stressLevel(p)).toBe(3);
    seasonCourt(ctxOf(s));
    expect(s.pendingEvents.some((e) => e.eventId === 'sys_crise')).toBe(true);
  });
});

describe('Relations et souvenirs', () => {
  it('un amant apprécie le souverain', () => {
    const s = newGame({ seed: 25 });
    const p = s.characters[s.playerId];
    const other = Object.values(s.characters).find(
      (c) => c.alive && c.id !== p.id && c.id !== p.spouseId,
    )!;
    const before = opinion(s, other.id, p.id);
    makeLovers(p, other);
    expect(opinion(s, other.id, p.id)).toBe(Math.min(100, before + BALANCE.relations.loverOpinion));
  });

  it('faire périr quelqu’un laisse un souvenir sanglant à sa famille', () => {
    const s = newGame({ seed: 26 });
    const p = s.characters[s.playerId];
    const victim = Object.values(s.characters).find(
      (c) =>
        c.alive &&
        c.id !== p.id &&
        c.childrenIds.some((k) => s.characters[k]?.alive) &&
        c.dynastyId !== p.dynastyId,
    )!;
    const child = s.characters[victim.childrenIds.find((k) => s.characters[k]?.alive)!];
    applyEffects(ctxOf(s), [{ deces: 'courtisan' }], { souverain: p.id, courtisan: victim.id });
    expect(victim.alive).toBe(false);
    expect(hasGrudge(s, child, p.id)).toBe(true);
  });
});

describe('Décisions', () => {
  it('coûtent, ouvrent un événement et ont un délai', () => {
    let s = clearEvents(newGame({ seed: 27 }));
    const gold = s.characters[s.playerId].gold;
    expect(decisionCheck(s, 'chasse').ok).toBe(true);
    s = applyAction(s, { type: 'takeDecision', id: 'chasse' });
    expect(s.characters[s.playerId].gold).toBe(gold - 25);
    expect(s.pendingEvents[0]?.eventId).toBe('dec_chasse');
    s = applyAction(s, { type: 'chooseEvent', uid: s.pendingEvents[0].uid, choice: 1 });
    expect(decisionCheck(s, 'chasse').ok).toBe(false);
    expect(decisionCheck(s, 'chasse').wait).toBeGreaterThan(0);
  });
});

describe('Chaînes d’événements', () => {
  it('drapeaux et suites différées', () => {
    const s = clearEvents(newGame({ seed: 28 }));
    const ctx = ctxOf(s);
    applyEffects(
      ctx,
      [{ drapeau: 'prophetie' }, { suite_differee: { id: 'dec_retraite', saisons: 2 } }],
      {
        souverain: s.playerId,
      },
    );
    expect(s.flags?.prophetie).toBe(s.turn);
    expect(s.scheduled?.length).toBe(1);
    s.turn += 2;
    s.pendingEvents = [];
    drawSeasonEvents(ctx);
    expect(s.pendingEvents.some((e) => e.eventId === 'dec_retraite')).toBe(true);
    expect(s.scheduled?.length).toBe(0);
  });
});

describe('Épidémies', () => {
  it('se propagent aux comtés voisins puis s’éteignent', () => {
    const s = newGame({ seed: 29 });
    const c = Object.values(s.counties)[0];
    expect(startPlague(s, c.id)).toBe(true);
    const ctx = ctxOf(s, 3);
    for (let i = 0; i < 30; i++) {
      seasonPlague(ctx);
      s.turn += 1;
    }
    expect(
      Object.values(s.counties).filter((k) => k.plagueEnded !== undefined).length,
    ).toBeGreaterThan(1);
    expect(c.plague).toBeUndefined();
    // Immunité : pas de nouvelle épidémie tout de suite.
    expect(startPlague(s, c.id)).toBe(false);
  });
});

describe('Otages et exécutions', () => {
  it('un otage empêche sa famille de vous attaquer', () => {
    let s = clearEvents(newGame({ seed: 30 }));
    const other = Object.values(s.characters).find(
      (c) =>
        c.alive &&
        !c.liegeId &&
        c.id !== s.playerId &&
        Object.values(s.counties).some((k) => k.holderId === c.id) &&
        c.childrenIds.length,
    )!;
    const kid = s.characters[other.childrenIds[0]];
    kid.imprisonedBy = s.playerId;
    s = applyAction(s, { type: 'ransom', characterId: kid.id, kind: 'otage' });
    expect(s.characters[kid.id].hostageOf).toBe(s.playerId);
    const mine = Object.values(s.counties).find((k) => k.holderId === s.playerId)!;
    const chk = canDeclareWar(s, other.id, s.playerId, 'conquete', mine.id);
    expect(chk.reasons.join(' ')).toContain('otage');
  });

  it('exécuter un prisonnier : stress pour un souverain juste, vengeance de la famille', () => {
    let s = clearEvents(newGame({ seed: 31 }));
    const p = s.characters[s.playerId];
    p.traits = [...p.traits.filter((t) => t !== 'cruel'), 'juste'];
    const victim = Object.values(s.characters).find(
      (c) =>
        c.alive &&
        c.id !== p.id &&
        c.dynastyId !== p.dynastyId &&
        c.childrenIds.some((k) => s.characters[k]?.alive),
    )!;
    victim.imprisonedBy = p.id;
    s = applyAction(s, { type: 'ransom', characterId: victim.id, kind: 'executer' });
    expect(s.characters[victim.id].alive).toBe(false);
    expect(s.characters[p.id].stress ?? 0).toBeGreaterThan(20);
    const kid = s.characters[victim.childrenIds.find((k) => s.characters[k]?.alive)!];
    expect(hasGrudge(s, kid, p.id)).toBe(true);
  });
});
