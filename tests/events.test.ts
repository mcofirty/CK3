import { describe, expect, it } from 'vitest';
import { ALL_EVENTS } from '../src/data/events';
import { TRAITS } from '../src/data/traits';
import { EVENTS, applyEffects, buildScope, chooseEvent, effectLabels, renderText, rolesOf } from '../src/engine/events/engine';
import type { Ctx } from '../src/engine/context';
import { Rng } from '../src/engine/rng';
import { newGame } from '../src/engine/world';

describe('Événements (section 6)', () => {
  it('contient 40 événements valides aux identifiants uniques', () => {
    expect(ALL_EVENTS.length).toBe(40);
    expect(new Set(ALL_EVENTS.map((e) => e.id)).size).toBe(40);
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
    expect([count('cour'), count('famille'), count('vassaux'), count('religion'), count('guerre'), count('intrigue')]).toEqual([10, 8, 8, 5, 5, 4]);
  });

  it('remplit les variables du texte avec les rôles tirés', () => {
    const state = newGame({ seed: 2 });
    const ctx: Ctx = { state, rng: new Rng(2) };
    const def = EVENTS.vassal_banquet_01;
    expect(rolesOf(def)).toContain('vassal');
    const scope = buildScope(ctx, { ...def, conditions: [] })!;
    const text = renderText(state, def.texte, scope);
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
});
