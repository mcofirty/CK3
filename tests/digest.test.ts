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

describe('Personnages suivis', () => {
  it('suivre puis cesser de suivre ; jamais soi-même ; au plus la limite', async () => {
    const { BALANCE } = await import('../src/data/balance');
    let s = newGame({ seed: 4 });
    const others = Object.values(s.characters)
      .filter((c) => c.alive && c.id !== s.playerId)
      .map((c) => c.id);
    s = applyAction(s, { type: 'toggleFollow', id: s.playerId });
    expect(s.followed ?? []).toEqual([]);
    s = applyAction(s, { type: 'toggleFollow', id: others[0] });
    expect(s.followed).toEqual([others[0]]);
    s = applyAction(s, { type: 'toggleFollow', id: others[0] });
    expect(s.followed).toEqual([]);
    for (const id of others.slice(0, BALANCE.digest.maxFollowed + 3))
      s = applyAction(s, { type: 'toggleFollow', id });
    expect(s.followed?.length).toBe(BALANCE.digest.maxFollowed);
  });

  it('signale la mort et le mariage d’un personnage suivi', async () => {
    const { followedChanges } = await import('../src/engine/digest');
    let s = newGame({ seed: 4 });
    s = { ...s, pendingEvents: [] };
    const single = Object.values(s.characters).find(
      (c) => c.alive && c.id !== s.playerId && !c.spouseId,
    )!;
    const doomed = Object.values(s.characters).find(
      (c) => c.alive && c.id !== s.playerId && c.id !== single.id,
    )!;
    s = applyAction(s, { type: 'toggleFollow', id: single.id });
    s = applyAction(s, { type: 'toggleFollow', id: doomed.id });
    s = applyAction(s, { type: 'endSeason' });
    s.characters[doomed.id] = { ...s.characters[doomed.id], alive: false };
    s.characters[single.id] = { ...s.characters[single.id], spouseId: doomed.id };
    const ch = followedChanges(s);
    expect(ch.find((c) => c.id === doomed.id)?.died).toBe(true);
    expect(ch.find((c) => c.id === single.id)?.married).toBe(true);
  });
});

describe('Courbe du trésor', () => {
  it('note l’or à chaque saison et ne garde que les dernières', async () => {
    const { BALANCE } = await import('../src/data/balance');
    let s = newGame({ seed: 6 });
    s = applyAction(s, { type: 'debugAdvance', years: 7 });
    const h = s.treasuryHistory ?? [];
    expect(h.length).toBe(BALANCE.digest.treasurySeasons);
    const last = h[h.length - 1];
    expect(last.turn).toBe(s.turn);
    // Strictement croissant, sans doublon de saison.
    for (let i = 1; i < h.length; i++) expect(h[i].turn).toBeGreaterThan(h[i - 1].turn);
  });
});
