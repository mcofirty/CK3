import { describe, expect, it } from 'vitest';
import { livingChildren } from '../src/engine/characters';
import { heirsOf, killCharacter } from '../src/engine/characters/lifecycle';
import type { Ctx } from '../src/engine/context';
import { Rng } from '../src/engine/rng';
import { applyAction } from '../src/engine/actions';
import { newGame } from '../src/engine/world';

function setup(seed = 3) {
  const state = newGame({ seed });
  const ctx: Ctx = { state, rng: new Rng(seed) };
  const p = state.characters[state.playerId];
  // Deux enfants adultes connus.
  const kids = livingChildren(state, p);
  return { state, ctx, p, kids };
}

describe('Succession (section 4)', () => {
  it('l’héritier principal est l’aîné des enfants', () => {
    const { state, p } = setup();
    const heirs = heirsOf(state, p);
    const kids = livingChildren(state, p);
    expect(heirs[0].id).toBe(kids[0].id);
  });

  it('Partage : l’aîné garde le titre principal, les cadets deviennent ses vassaux', () => {
    const { state, ctx, p } = setup();
    const spouse = state.characters[p.spouseId!];
    // Garantit deux enfants.
    while (livingChildren(state, p).length < 2) {
      applyAction(state, { type: 'debugGold', amount: 0 });
      const id = `kid${livingChildren(state, p).length}`;
      state.characters[id] = { ...structuredClone(spouse), id, dynastyId: p.dynastyId, fatherId: p.id, motherId: spouse.id, spouseId: undefined, childrenIds: [], birthTurn: -40 - livingChildren(state, p).length, courtId: p.id, liegeId: undefined, opinions: {}, claims: [] };
      p.childrenIds.push(id);
    }
    const [eldest, second] = livingChildren(state, p);
    const duchy = Object.values(state.duchies).find((d) => d.holderId === p.id)!;
    const before = Object.values(state.counties).filter((c) => c.holderId === p.id).length;
    killCharacter(ctx, p.id, 'test');
    expect(state.playerId).toBe(eldest.id);
    expect(duchy.holderId).toBe(eldest.id);
    const eldestCounties = Object.values(state.counties).filter((c) => c.holderId === eldest.id).length;
    const secondCounties = Object.values(state.counties).filter((c) => c.holderId === second.id).length;
    expect(eldestCounties + secondCounties).toBe(before);
    expect(secondCounties).toBeGreaterThan(0);
    expect(state.characters[second.id].liegeId).toBe(eldest.id);
  });

  it('Primogéniture : tout revient à l’aîné', () => {
    const { state, ctx, p } = setup();
    p.successionLaw = 'primogeniture';
    const before = Object.values(state.counties).filter((c) => c.holderId === p.id).length;
    const heir = heirsOf(state, p)[0];
    killCharacter(ctx, p.id, 'test');
    expect(Object.values(state.counties).filter((c) => c.holderId === heir.id).length).toBe(before);
    expect(state.characters[heir.id].successionLaw).toBe('primogeniture');
  });

  it('les vassaux passent au nouveau souverain', () => {
    const { state, ctx, p } = setup();
    const vassals = Object.values(state.characters).filter((c) => c.liegeId === p.id).map((c) => c.id);
    const heir = heirsOf(state, p)[0];
    killCharacter(ctx, p.id, 'test');
    for (const v of vassals) expect(state.characters[v].liegeId).toBe(heir.id);
  });

  it('sans héritier, la partie s’arrête', () => {
    const { state, ctx, p } = setup();
    for (const c of Object.values(state.characters)) if (c.dynastyId === p.dynastyId && c.id !== p.id) c.alive = false;
    killCharacter(ctx, p.id, 'test');
    expect(state.gameOver).toBeDefined();
  });

  it('enchaîne 50 ans de jeu sans erreur, et la partie reste sérialisable', () => {
    let s = newGame({ seed: 11 });
    s.autoplay = true;
    for (let y = 0; y < 50 && !s.gameOver; y++) s = applyAction(s, { type: 'debugAdvance', years: 1 });
    expect(s.turn).toBeGreaterThan(40);
    expect(() => JSON.parse(JSON.stringify(s))).not.toThrow();
  });
});
