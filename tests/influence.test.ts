import { describe, expect, it } from 'vitest';
import { BALANCE } from '../src/data/balance';
import { applyAction } from '../src/engine/actions';
import { createCharacter, opinion } from '../src/engine/characters';
import { killCharacter } from '../src/engine/characters/lifecycle';
import { allianceAcceptance, seasonCouncil } from '../src/engine/diplomacy';
import {
  influenceOf,
  kinLabel,
  seasonInfluence,
  setSupport,
  successionLine,
} from '../src/engine/influence';
import { independentRulers } from '../src/engine/realm';
import { Rng } from '../src/engine/rng';
import { newGame } from '../src/engine/world';
import { clearEvents } from './helpers';

const I = BALANCE.influence;

function setup(seed: number) {
  const s = newGame({ seed });
  clearEvents(s);
  const ctx = { state: s, rng: new Rng(seed) };
  // Un rival avec au moins deux enfants vivants.
  const rival =
    independentRulers(s).find(
      (id) =>
        id !== s.playerId &&
        s.characters[id].childrenIds.filter((k) => s.characters[k]?.alive).length >= 2,
    ) ?? independentRulers(s).find((id) => id !== s.playerId)!;
  const r = s.characters[rival];
  while (r.childrenIds.filter((k) => s.characters[k]?.alive).length < 2) {
    const k = createCharacter(ctx, {
      age: 18,
      dynastyId: r.dynastyId,
      fatherId: r.female ? undefined : r.id,
      motherId: r.female ? r.id : undefined,
      courtId: r.id,
      skillBase: 7,
    });
    if (!r.childrenIds.includes(k.id)) r.childrenIds.push(k.id);
  }
  r.agnatic = false;
  return { s, ctx, rival, r };
}

describe('Ligne de succession', () => {
  it('liste les héritiers dans l’ordre, avec leur lien de parenté', () => {
    const { s, rival, r } = setup(81);
    const line = successionLine(s, rival);
    expect(line.length).toBeGreaterThanOrEqual(2);
    expect(['Fils', 'Fille']).toContain(kinLabel(s, r, line[0]));
  });
});

describe('Influence', () => {
  it('se gagne en courtisant les Grands et s’érode chaque saison', () => {
    const { s, rival } = setup(82);
    s.characters[s.playerId].gold = 500;
    const next = applyAction(s, { type: 'courtGrandees', rulerId: rival });
    expect(influenceOf(next, rival)).toBe(I.courtGain);
    expect(next.characters[next.playerId].gold).toBe(500 - I.courtGold);
    const before = influenceOf(next, rival);
    seasonInfluence(next);
    expect(influenceOf(next, rival)).toBeLessThanOrEqual(before);
  });

  it('le chancelier gagne de l’influence dans la cour visée', () => {
    const { s, ctx, rival } = setup(83);
    s.council.chancelier.task = 'influence';
    s.council.chancelier.targetId = rival;
    if (!s.council.chancelier.holderId) {
      const c = createCharacter(ctx, {
        age: 30,
        dynastyId: null,
        courtId: s.playerId,
        skillBase: 10,
      });
      s.council.chancelier.holderId = c.id;
    }
    seasonCouncil(ctx);
    expect(influenceOf(s, rival)).toBeGreaterThan(0);
  });

  it('pèse dans les négociations', () => {
    const { s, rival } = setup(84);
    const before = allianceAcceptance(s, s.playerId, rival).score;
    (s.influence ??= {})[rival] = { points: 60 };
    expect(allianceAcceptance(s, s.playerId, rival).score).toBe(
      before + Math.round(60 * I.acceptancePerPoint),
    );
  });
});

describe('Acclamation', () => {
  it('avec assez d’influence, les Grands acclament le candidat soutenu', () => {
    const { s, ctx, rival } = setup(85);
    const [first, second] = successionLine(s, rival);
    expect(setSupport(s, rival, second.id)).toBe(true);
    s.influence![rival].points = I.supportThreshold + 5;
    killCharacter(ctx, rival, 'de maladie');
    const ruled = Object.values(s.counties).some((c) => c.holderId === second.id);
    expect(ruled).toBe(true);
    expect(opinion(s, second.id, s.playerId)).toBeGreaterThan(0);
    expect(opinion(s, first.id, s.playerId)).toBeLessThan(0);
    expect(influenceOf(s, second.id)).toBe(I.supportThreshold + 5 - I.acclaimCost);
  });

  it('sans assez d’influence, l’héritier attendu succède', () => {
    const { s, ctx, rival } = setup(86);
    const [first, second] = successionLine(s, rival);
    setSupport(s, rival, second.id);
    s.influence![rival].points = I.supportThreshold - 10;
    killCharacter(ctx, rival, 'de maladie');
    expect(Object.values(s.counties).some((c) => c.holderId === first.id)).toBe(true);
  });

  it('un prétendant d’une autre maison exige une influence plus forte', () => {
    const { s, ctx, rival, r } = setup(87);
    const outsider = createCharacter(ctx, { age: 25, dynastyId: null, skillBase: 8 });
    outsider.dynastyId = Object.keys(s.dynasties).find((d) => d !== r.dynastyId)!;
    outsider.houseClaims = [r.dynastyId!];
    expect(setSupport(s, rival, outsider.id)).toBe(true);
    s.influence![rival].points = I.outsiderThreshold;
    killCharacter(ctx, rival, 'de maladie');
    expect(Object.values(s.counties).some((c) => c.holderId === outsider.id)).toBe(true);
  });
});
