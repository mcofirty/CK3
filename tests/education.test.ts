import { describe, expect, it } from 'vitest';
import { applyAction } from '../src/engine/actions';
import { createCharacter, skill } from '../src/engine/characters';
import { giveBirth } from '../src/engine/characters/lifecycle';
import { bestEducator, bestSkillKey, educatorCandidates } from '../src/engine/diplomacy';
import { Rng } from '../src/engine/rng';
import { SKILL_KEYS } from '../src/engine/state';
import { newGame } from '../src/engine/world';
import { clearEvents } from './helpers';

function setup(seed: number) {
  const s = newGame({ seed });
  clearEvents(s);
  const ctx = { state: s, rng: new Rng(seed) };
  const pl = s.characters[s.playerId];
  // Un enfant du joueur qui vient de naître.
  const spouse =
    (pl.spouseId && s.characters[pl.spouseId]) ||
    createCharacter(ctx, {
      age: 24,
      female: !pl.female,
      dynastyId: null,
      courtId: pl.id,
      skillBase: 7,
    });
  pl.spouseId = spouse.id;
  spouse.spouseId = pl.id;
  const [mother, father] = pl.female ? [pl, spouse] : [spouse, pl];
  return { s, ctx, pl, mother, father };
}

describe('Éducation automatique', () => {
  it('un enfant reçoit l’éducateur le plus compétent dans sa plus haute compétence', () => {
    const { s, ctx, mother, father } = setup(101);
    const kid = giveBirth(ctx, mother, father);
    kid.skills = { diplomatie: 4, guerre: 12, gestion: 5, ruse: 3, savoir: 6 };
    // Un courtisan exceptionnel en guerre.
    const hero = createCharacter(ctx, {
      age: 35,
      dynastyId: null,
      courtId: s.playerId,
      skillBase: 8,
    });
    hero.skills = { diplomatie: 5, guerre: 25, gestion: 5, ruse: 5, savoir: 5 };
    const next = applyAction(s, { type: 'dismissTutorial' });
    const k = next.characters[kid.id];
    expect(k.educationFocus).toBe('guerre');
    expect(k.educatorId).toBe(hero.id);
    expect(next.notifications.some((n) => n.text.includes('éducation de ' + kid.name))).toBe(true);
  });

  it('le meilleur éducateur est celui dont le niveau est le plus haut dans la compétence visée', () => {
    const { s } = setup(102);
    for (const focus of SKILL_KEYS) {
      const best = bestEducator(s, focus)!;
      for (const e of educatorCandidates(s))
        expect(skill(best, focus)).toBeGreaterThanOrEqual(skill(e, focus));
    }
    expect(
      bestSkillKey({
        ...s.characters[s.playerId],
        skills: { diplomatie: 1, guerre: 1, gestion: 9, ruse: 1, savoir: 1 },
      }),
    ).toBe('gestion');
  });

  it('un réglage manuel est respecté ; « automatique » rend la main', () => {
    const { s, ctx, mother, father, pl } = setup(103);
    const kid = giveBirth(ctx, mother, father);
    let next = applyAction(s, {
      type: 'setEducator',
      childId: kid.id,
      educatorId: pl.id,
      focus: 'ruse',
    });
    expect(next.characters[kid.id]).toMatchObject({
      educatorId: pl.id,
      educationFocus: 'ruse',
      educationManual: true,
    });
    next = applyAction(next, {
      type: 'setEducator',
      childId: kid.id,
      educatorId: undefined,
      focus: 'ruse',
    });
    expect(next.characters[kid.id].educatorId).toBeUndefined();
    next = applyAction(next, { type: 'setEducator', childId: kid.id, focus: 'ruse', auto: true });
    expect(next.characters[kid.id].educatorId).toBeDefined();
    expect(next.characters[kid.id].educationManual).toBe(false);
  });

  it('un éducateur parti est remplacé automatiquement', () => {
    const { s, ctx, mother, father } = setup(104);
    const kid = giveBirth(ctx, mother, father);
    let next = applyAction(s, { type: 'dismissTutorial' });
    const first = next.characters[kid.id].educatorId!;
    next.characters[first].alive = false;
    next = applyAction(next, { type: 'dismissTutorial' });
    const now = next.characters[kid.id].educatorId!;
    expect(now).not.toBe(first);
    expect(next.characters[now].alive).toBe(true);
  });
});
