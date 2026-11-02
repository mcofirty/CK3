import { describe, expect, it } from 'vitest';
import { applyAction } from '../src/engine/actions';
import { seasonDigest } from '../src/engine/digest';
import { vassalsOf } from '../src/engine/realm';
import { newGame } from '../src/engine/world';

describe('Bilan de saison', () => {
  it('aucun bilan avant la première fin de saison', () => {
    const s = newGame({ seed: 3 });
    expect(s.lastSnapshot).toBeUndefined();
    expect(seasonDigest(s)).toBeUndefined();
  });

  it('la fin de saison photographie le royaume et le bilan compare', () => {
    let s = newGame({ seed: 3 });
    s = { ...s, pendingEvents: [] };
    const gold = s.characters[s.playerId].gold;
    s = applyAction(s, { type: 'endSeason' });
    expect(s.lastSnapshot?.turn).toBe(s.turn - 1);
    expect(s.lastSnapshot?.gold).toBe(gold);
    const d = seasonDigest(s)!;
    expect(d).toBeDefined();
    expect(d.newRuler).toBe(false);
    expect(d.gold).toBeCloseTo(s.characters[s.playerId].gold - gold, 6);
    // Aucun fait ordinaire d'événement dans les faits marquants.
    expect(d.facts.every((f) => f.kind !== 'evenement')).toBe(true);
  });

  it('signale un vassal dont l’opinion a nettement bougé et un comté perdu', () => {
    let s = newGame({ seed: 3 });
    s = { ...s, pendingEvents: [] };
    s = applyAction(s, { type: 'endSeason' });
    const v = vassalsOf(s, s.playerId)[0];
    expect(v).toBeDefined();
    const snap = s.lastSnapshot!;
    s.lastSnapshot = {
      ...snap,
      opinions: { ...snap.opinions, [v]: (snap.opinions[v] ?? 0) + 40 },
      counties: [...snap.counties, 'comte-fantome'],
    };
    const d = seasonDigest(s)!;
    expect(d.opinions.some((o) => o.id === v)).toBe(true);
    expect(d.lost).toContain('comte-fantome');
  });
});
