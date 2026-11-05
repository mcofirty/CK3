import { describe, expect, it } from 'vitest';
import { ALL_EVENTS } from '../src/data/events';
import { DECISIONS } from '../src/data/decisions';
import { TRAITS } from '../src/data/traits';
import type { Effect } from '../src/engine/events/types';
import {
  EVENTS,
  applyEffects,
  buildScope,
  chooseEvent,
  effectLabels,
  eventText,
  renderText,
  rolesOf,
} from '../src/engine/events/engine';
import type { Ctx } from '../src/engine/context';
import { Rng } from '../src/engine/rng';
import { newGame } from '../src/engine/world';

describe('Événements (section 6)', () => {
  it('contient au moins 40 événements valides aux identifiants uniques', () => {
    expect(ALL_EVENTS.length).toBeGreaterThanOrEqual(40);
    expect(new Set(ALL_EVENTS.map((e) => e.id)).size).toBe(ALL_EVENTS.length);
    for (const e of ALL_EVENTS) {
      expect(e.choix.length, e.id).toBeGreaterThanOrEqual(2);
      expect(e.choix.length, e.id).toBeLessThanOrEqual(4);
      for (const c of e.choix) {
        if (c.suite) expect(EVENTS[c.suite], `${e.id} → ${c.suite}`).toBeDefined();
        for (const eff of c.effets) {
          const t = eff.trait_ajout ?? eff.trait_retrait;
          if (t) expect(TRAITS[typeof t === 'string' ? t : t.trait], e.id).toBeDefined();
        }
      }
    }
  });

  it('plus de cent événements ; traits, suites et rôles des effets imbriqués sont valides', () => {
    expect(ALL_EVENTS.length).toBeGreaterThanOrEqual(100);
    const walk = (id: string, effs: Effect[]): void => {
      for (const eff of effs) {
        const t = eff.trait_ajout ?? eff.trait_retrait;
        if (t) expect(TRAITS[typeof t === 'string' ? t : t.trait], id).toBeDefined();
        if (eff.suite_differee)
          expect(EVENTS[eff.suite_differee.id], `${id} → ${eff.suite_differee.id}`).toBeDefined();
        if (eff.hasard) {
          walk(id, eff.hasard.succes);
          walk(id, eff.hasard.echec);
        }
        if (eff.bataille) {
          walk(id, eff.bataille.victoire);
          walk(id, eff.bataille.defaite);
        }
      }
    };
    for (const e of ALL_EVENTS) for (const c of e.choix) walk(e.id, c.effets);
    // Les événements de décision sont bien reliés.
    for (const d of DECISIONS) expect(EVENTS[d.event], d.id).toBeDefined();
  });

  it('répartit les événements selon les catégories du cahier', () => {
    const count = (c: string) => ALL_EVENTS.filter((e) => e.categorie === c).length;
    const counts = [
      count('cour'),
      count('famille'),
      count('vassaux'),
      count('religion'),
      count('guerre'),
      count('intrigue'),
    ];
    // Au moins le contenu initial du cahier dans chaque catégorie.
    [10, 8, 8, 5, 5, 4].forEach((min, i) => expect(counts[i]).toBeGreaterThanOrEqual(min));
  });

  it('remplit les variables du texte avec les rôles tirés', () => {
    const state = newGame({ seed: 2 });
    const ctx: Ctx = { state, rng: new Rng(2) };
    const def = EVENTS.vassal_banquet_01;
    expect(rolesOf(def)).toContain('vassal');
    const scope = buildScope(ctx, { ...def, conditions: [] })!;
    const text = renderText(state, eventText(def, scope), scope);
    expect(text).toContain(state.characters[scope.vassal].name);
    expect(text).not.toContain('{');
  });

  it('applique les effets et affiche les effets connus', () => {
    const state = newGame({ seed: 2 });
    const ctx: Ctx = { state, rng: new Rng(2) };
    const p = state.characters[state.playerId];
    const gold = p.gold;
    applyEffects(ctx, [{ or: -50 }, { prestige: 10 }], { souverain: p.id });
    expect(p.gold).toBe(gold - 50);
    expect(effectLabels(state, [{ or: -50 }], {})).toEqual(['-50 or']);
  });

  it('un choix enchaîne l’événement suivant', () => {
    const state = newGame({ seed: 2 });
    const ctx: Ctx = { state, rng: new Rng(2) };
    const scope = buildScope(ctx, { ...EVENTS.vassal_banquet_01, conditions: [] })!;
    state.pendingEvents.push({ uid: 'u1', eventId: 'vassal_banquet_01', scope });
    expect(chooseEvent(ctx, 'u1', 1)).toBe(true);
    expect(state.pendingEvents.map((e) => e.eventId)).toContain('vassal_banquet_02');
  });

  it('refuse un choix dont les conditions ne sont pas remplies', () => {
    const state = newGame({ seed: 2 });
    const ctx: Ctx = { state, rng: new Rng(2) };
    state.characters[state.playerId].gold = 0;
    const scope = buildScope(ctx, { ...EVENTS.vassal_banquet_01, conditions: [] })!;
    state.pendingEvents.push({ uid: 'u1', eventId: 'vassal_banquet_01', scope });
    expect(chooseEvent(ctx, 'u1', 0)).toBe(false);
  });

  it('l’effet hasard tire une issue et affiche sa probabilité', () => {
    const outcomes = new Set<number>();
    for (let seed = 1; seed < 40; seed++) {
      const state = newGame({ seed: 2 });
      const ctx: Ctx = { state, rng: new Rng(seed) };
      const p = state.characters[state.playerId];
      const gold = p.gold;
      applyEffects(
        ctx,
        [{ hasard: { chance: 0.5, succes: [{ or: 100 }], echec: [{ or: -100 }] } }],
        { souverain: p.id },
      );
      outcomes.add(p.gold - gold);
    }
    expect([...outcomes].sort()).toEqual([-100, 100]);
    const state = newGame({ seed: 2 });
    const label = effectLabels(
      state,
      [{ hasard: { chance: 0.6, succes: [{ prestige: 10 }], echec: [] } }],
      {},
    );
    expect(label[0]).toContain('60 %');
  });

  it('chaque tirage reçoit un identifiant distinct (bandeau affiché une seule fois)', () => {
    const state = newGame({ seed: 2 });
    const ctx: Ctx = { state, rng: new Rng(1) };
    const eff = [{ hasard: { chance: 0.5, succes: [], echec: [] } }];
    applyEffects(ctx, eff, { souverain: state.playerId });
    const first = state.lastOutcome!.id;
    applyEffects(ctx, eff, { souverain: state.playerId });
    expect(state.lastOutcome!.id).toBe((first ?? 0) + 1);
  });

  it('chaque partie a ses propres fréquences d’événements', () => {
    const a = newGame({ seed: 3 }).eventBias!;
    const b = newGame({ seed: 4 }).eventBias!;
    expect(Object.keys(a).length).toBeGreaterThan(30);
    expect(a).not.toEqual(b);
  });
});

describe('Texte des événements', () => {
  it('élide « de » devant un nom propre commençant par une voyelle', () => {
    const s = newGame({ seed: 77 });
    const c = Object.values(s.counties)[0];
    c.name = 'Ardesse';
    expect(renderText(s, 'Les pillards de {comte.nom} arrivent.', { comte: c.id })).toBe(
      'Les pillards d’Ardesse arrivent.',
    );
    c.name = 'Vyrgard';
    expect(renderText(s, 'Les pillards de {comte.nom}.', { comte: c.id })).toBe(
      'Les pillards de Vyrgard.',
    );
  });
});

describe('Protagonistes emprisonnés', () => {
  it('un vassal au cachot ne banquette pas, et un événement déjà tiré disparaît', async () => {
    const { vassalsOf } = await import('../src/engine/realm');
    const { dropStaleEvents } = await import('../src/engine/events/engine');
    const s = newGame({ seed: 3 });
    const ctx: Ctx = { state: s, rng: new Rng(5) };
    const vs = vassalsOf(s, s.playerId);
    expect(vs.length).toBeGreaterThan(0);
    for (const v of vs) s.characters[v].imprisonedBy = s.playerId;
    expect(buildScope(ctx, { ...EVENTS.vassal_banquet_01, conditions: [] })).toBeNull();
    s.pendingEvents = [
      { uid: 'x', eventId: 'vassal_banquet_01', scope: { souverain: s.playerId, vassal: vs[0] } },
    ];
    dropStaleEvents(s);
    expect(s.pendingEvents).toHaveLength(0);
    s.characters[vs[0]].imprisonedBy = undefined;
    const scope = buildScope(ctx, { ...EVENTS.vassal_banquet_01, conditions: [] });
    expect(scope?.vassal).toBe(vs[0]);
  });
});

describe('Cohérence avec les relations', () => {
  const setup = async () => {
    const { vassalsOf, independentRulers } = await import('../src/engine/realm');
    const { addOpinion } = await import('../src/engine/characters');
    const s = newGame({ seed: 3 });
    const ctx: Ctx = { state: s, rng: new Rng(5) };
    return { s, ctx, vassalsOf, independentRulers, addOpinion };
  };

  it('un vassal en faction ou qui vous déteste ne vient pas prêter serment', async () => {
    const { s, ctx, vassalsOf, addOpinion } = await setup();
    const def = { ...EVENTS.vassal_fidele, conditions: [] };
    expect(def.ton).toBe('amical');
    const vs = vassalsOf(s, s.playerId);
    expect(vs.length).toBeGreaterThan(0);
    expect(buildScope(ctx, def)?.vassal).toBeDefined();
    for (const v of vs) s.characters[v].inFaction = true;
    expect(buildScope(ctx, def)).toBeNull();
    for (const v of vs) s.characters[v].inFaction = false;
    expect(buildScope(ctx, def)).not.toBeNull();
    for (const v of vs) addOpinion(s, v, s.playerId, 'Offense', -80, 40);
    expect(buildScope(ctx, def)).toBeNull();
  });

  it('un ami avec qui l’on est en guerre ne propose plus de chasse', async () => {
    const { s, ctx, independentRulers } = await setup();
    const foe = independentRulers(s).find((r) => r !== s.playerId)!;
    s.characters[s.playerId].friends = [foe];
    const def = { ...EVENTS.rel_ami_chasse, conditions: [] };
    expect(buildScope(ctx, def)?.ami).toBe(foe);
    s.wars.w1 = {
      id: 'w1',
      name: 'Guerre',
      attackerId: s.playerId,
      defenderId: foe,
      attackerAllies: [],
      defenderAllies: [],
    } as never;
    expect(buildScope(ctx, def)).toBeNull();
  });

  it('la guerre rompt l’amitié entre deux camps, y compris par un allié qui rejoint', async () => {
    const { declareWar, joinWar } = await import('../src/engine/war');
    const { s, ctx, independentRulers } = await setup();
    const [foe, third] = independentRulers(s).filter((r) => r !== s.playerId);
    const p = s.characters[s.playerId];
    const link = (id: string) => {
      p.friends.push(id);
      s.characters[id].friends.push(s.playerId);
    };
    link(foe);
    const w = declareWar(ctx, s.playerId, foe, 'conquete', undefined, true)!;
    expect(p.friends).not.toContain(foe);
    expect(s.characters[foe].friends).not.toContain(s.playerId);
    link(third);
    joinWar(s, w.id, third, 'defender');
    expect(p.friends).not.toContain(third);
  });

  it('un événement hostile ne vise pas un allié', async () => {
    const { s, ctx, independentRulers } = await setup();
    const rivals = independentRulers(s).filter((r) => r !== s.playerId);
    const def = { ...EVENTS.intrigue_gouteur, conditions: [] };
    expect(def.ton).toBe('hostile');
    s.alliances = rivals.map((r) => (s.playerId < r ? `${s.playerId}|${r}` : `${r}|${s.playerId}`));
    for (const r of rivals) expect(buildScope(ctx, def, { rival: r })).toBeNull();
    expect(buildScope(ctx, def)).toBeNull();
    s.alliances = [];
    expect(buildScope(ctx, def)).not.toBeNull();
  });
});
