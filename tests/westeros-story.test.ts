import { describe, expect, it } from 'vitest';
import { applyAction } from '../src/engine/actions';
import { ALL_EVENTS } from '../src/data/events';
import { BALANCE } from '../src/data/balance';
import { checkCondition } from '../src/engine/events/engine';
import { Rng } from '../src/engine/rng';
import { newWesterosGame } from '../src/engine/scenario/westeros';
import { applyStoryEffect, named, storyHas, storyWars } from '../src/engine/scenario/story';
import type { GameState } from '../src/engine/state';
import { newGame } from '../src/engine/world';

/** Avance d'une saison ; les cartes en attente prennent le choix donné (par défaut le premier). */
function season(s: GameState, pick: (id: string) => number = () => 0): GameState {
  for (let i = 0; i < 40 && s.pendingEvents.length; i++) {
    const e = s.pendingEvents[0];
    const next = applyAction(s, { type: 'chooseEvent', uid: e.uid, choice: pick(e.eventId) });
    s =
      next.pendingEvents.length === s.pendingEvents.length
        ? { ...next, pendingEvents: next.pendingEvents.slice(1) }
        : next;
  }
  return applyAction(s, { type: 'debugAdvance', years: 0.25 });
}

function play(house: string, seed: number, seasons: number, pick?: (id: string) => number) {
  let s = newWesterosGame({ houseId: house, seed });
  for (let t = 0; t < seasons && !s.gameOver; t++) s = season(s, pick);
  return s;
}

describe('Westeros : le récit', () => {
  it('Tyrion est arrêté, Robert meurt à la chasse avant l’an 3, et les prétendants se lèvent', () => {
    for (const seed of [1, 2]) {
      const s = play('martell', seed, 13);
      expect(storyHas(s, 'tyrion')).toBe(true);
      expect(storyHas(s, 'raid')).toBe(true);
      expect(s.flags!.recit_robert).toBeLessThan(12);
      expect(named(s, 'robert')!.alive).toBe(false);
      expect(storyHas(s, 'stannis') && storyHas(s, 'renly')).toBe(true);
      expect(storyHas(s, 'cinq_rois')).toBe(true);
    }
  }, 60000);

  it('Robert joué peut refuser la chasse et rester en vie', () => {
    const s = play('baratheon', 1, 12, (id) => (id === 'got_chasse' ? 1 : 0));
    const robert = named(s, 'robert')!;
    expect(robert.alive || !robert.deathCause?.includes('sanglier')).toBe(true);
    expect(storyHas(s, 'cinq_rois')).toBe(false);
  }, 30000);

  it('Ned joué qui plie le genou ne soulève pas le Nord', () => {
    let s = newWesterosGame({ houseId: 'stark', seed: 2 });
    let saw = false;
    for (let t = 0; t < 16; t++)
      s = season(s, (id) => {
        if (id === 'got_trahison_ned') {
          saw = true;
          return 2;
        }
        return 0;
      });
    expect(saw).toBe(true);
    expect(storyHas(s, 'ned_genou')).toBe(true);
    const ned = named(s, 'ned')!;
    expect(ned.alive).toBe(true);
    expect(
      Object.values(s.wars).some((w) => w.attackerId === ned.id && w.cb === 'independance'),
    ).toBe(false);
  }, 30000);

  it('les Noces rouges donnent Winterfell et le Nord à Roose Bolton', () => {
    const s = newWesterosGame({ houseId: 'martell', seed: 4 });
    const ctx = { state: s, rng: new Rng(4) };
    applyStoryEffect(ctx, 'noces_rouges');
    const roose = named(s, 'roose')!;
    expect(named(s, 'ned')!.alive).toBe(false);
    expect(named(s, 'catelyn')!.alive).toBe(false);
    expect(s.counties.winterfell.holderId).toBe(roose.id);
    expect(s.duchies.d_nord.holderId).toBe(roose.id);
  });

  it('les guerres du récit s’épuisent : aucune ne dure plus de quatre ans', () => {
    const s = play('martell', 5, 32);
    for (const w of storyWars(s))
      expect(s.turn - w.startTurn).toBeLessThanOrEqual(BALANCE.story.warExhaustion);
    expect(storyHas(s, 'paix')).toBe(true);
  }, 60000);
});

describe('Westeros : Daenerys', () => {
  it('ne débarque pas avant l’an 10', () => {
    for (const seed of [1]) {
      let s = newWesterosGame({ houseId: 'tyrell', seed });
      for (let t = 0; t < 39; t++) s = season(s, (id) => (id === 'essos_dragons' ? 2 : 0));
      expect(s.essos!.stage).toBeLessThan(6);
    }
  }, 60000);

  it('un émissaire hâte son parcours ; un assassin manqué le retarde', () => {
    let s = newWesterosGame({ houseId: 'tyrell', seed: 3 });
    s.characters[s.playerId].gold = 1000;
    const before = s.essos!.stageTurn;
    s = applyAction(s, { type: 'essosAct', action: { kind: 'emissaire' } });
    expect(s.essos!.stageTurn).toBe(before - BALANCE.essos.emissaryHaste);
  });
});

describe('Westeros : les événements de saison', () => {
  it('sont réservés au mode Trône de fer', () => {
    const w = ALL_EVENTS.filter((e) => e.id.startsWith('w_'));
    expect(w.length).toBeGreaterThanOrEqual(20);
    for (const e of w) expect(e.scenario).toBe('westeros');
    let s = newGame({ seed: 3 });
    s.autoplay = true;
    for (let t = 0; t < 16; t++) {
      expect(s.pendingEvents.some((e) => e.eventId.startsWith('w_'))).toBe(false);
      s = applyAction(s, { type: 'debugAdvance', years: 0.25 });
    }
  }, 30000);

  it('les conditions de maison et de région suivent le souverain', () => {
    const s = newWesterosGame({ houseId: 'stark', seed: 1 });
    expect(checkCondition(s, { maison: ['stark'] }, {})).toBe(true);
    expect(checkCondition(s, { maison: ['greyjoy'] }, {})).toBe(false);
    expect(checkCondition(s, { region: ['nord'] }, {})).toBe(true);
    expect(checkCondition(s, { region: ['bief'] }, {})).toBe(false);
  });
});
