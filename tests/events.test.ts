import { describe, expect, it } from 'vitest';
import { ALL_EVENTS } from '../src/data/events';
import { TRAITS } from '../src/data/traits';
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
      applyEffects(ctx, [{ hasard: { chance: 0.5, succes: [{ or: 100 }], echec: [{ or: -100 }] } }], { souverain: p.id });
      outcomes.add(p.gold - gold);
    }
    expect([...outcomes].sort()).toEqual([-100, 100]);
    const state = newGame({ seed: 2 });
    const label = effectLabels(state, [{ hasard: { chance: 0.6, succes: [{ prestige: 10 }], echec: [] } }], {});
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
