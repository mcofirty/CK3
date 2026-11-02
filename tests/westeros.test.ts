import { describe, expect, it } from 'vitest';
import { applyAction } from '../src/engine/actions';
import { heirsOf } from '../src/engine/characters/lifecycle';
import { realmName, titleOf } from '../src/engine/realm';
import {
  PLAYABLE_HOUSES,
  newWesterosGame,
  westerosCharacter,
} from '../src/engine/scenario/westeros';
import { buildWesterosMap } from '../src/engine/scenario/westerosMap';
import { exportJson, importJson } from '../src/save/storage';
import type { GameState } from '../src/engine/state';

const key = (s: GameState, k: string) => westerosCharacter(s, k)!;

/** Règle les événements en attente (premier choix possible). */
function settle(s: GameState): GameState {
  for (let i = 0; i < 40 && s.pendingEvents.length; i++)
    s = applyAction(s, { type: 'chooseEvent', uid: s.pendingEvents[0].uid, choice: 0 });
  return s;
}

describe('Westeros : la carte', () => {
  it('86 comtés d’un seul tenant (îles reliées par mer), chacun avec des voisins', () => {
    const m = buildWesterosMap();
    expect(m.counties.length).toBe(86);
    const byId = new Map(m.counties.map((c) => [c.id, c]));
    const seen = new Set([m.counties[0].id]);
    const q = [m.counties[0].id];
    while (q.length)
      for (const n of byId.get(q.shift()!)!.adjacent)
        if (!seen.has(n)) {
          seen.add(n);
          q.push(n);
        }
    expect(seen.size).toBe(86);
    for (const c of m.counties) {
      expect(c.adjacent.length).toBeGreaterThanOrEqual(2);
      expect(c.polygon.length).toBeGreaterThanOrEqual(3);
      for (const n of c.adjacent) expect(byId.get(n)!.adjacent).toContain(c.id);
    }
  });
});

describe('Westeros : le scénario de 298', () => {
  it('chaque maison jouable donne une partie valide', () => {
    expect(PLAYABLE_HOUSES.length).toBeGreaterThanOrEqual(20);
    for (const h of PLAYABLE_HOUSES) {
      const s = newWesterosGame({ seed: 7, houseId: h.id });
      expect(s.scenario).toBe('westeros');
      expect(s.characters[s.playerId].alive).toBe(true);
      expect(Object.values(s.counties).every((c) => s.characters[c.holderId]?.alive)).toBe(true);
      expect(s.pendingEvents[0].eventId).toBe('got_intro');
    }
  }, 30000);

  it('Robert règne ; les grandes maisons et leurs bannerets lui sont liés', () => {
    const s = newWesterosGame({ seed: 1, houseId: 'stark' });
    const robert = key(s, 'robert');
    const ned = key(s, 'ned');
    const roose = key(s, 'roose');
    expect(s.playerId).toBe(ned.id);
    expect(titleOf(s, robert.id)).toBe('Roi des Sept Couronnes');
    expect(titleOf(s, ned.id)).toBe('Gouverneur du Nord');
    expect(titleOf(s, roose.id)).toBe('Seigneur de Fort-Terreur');
    expect(realmName(s, robert.id)).toBe('Les Sept Couronnes');
    expect(ned.liegeId).toBe(robert.id);
    expect(roose.liegeId).toBe(ned.id);
    expect(robert.liegeId).toBeUndefined();
    expect(s.kingdoms.k_couronnes.holderId).toBe(robert.id);
    expect(s.duchies.d_nord.holderId).toBe(ned.id);
    // Theon, otage à Winterfell : les Greyjoy ne peuvent attaquer les Stark.
    expect(key(s, 'theon').hostageOf).toBe(ned.id);
  });

  it('les vœux écartent de la succession et du mariage ; les bâtards n’héritent pas', () => {
    const s = newWesterosGame({ seed: 2, houseId: 'lannister' });
    const tywin = key(s, 'tywin');
    expect(heirsOf(s, tywin)[0].id).toBe(key(s, 'tyrion').id);
    expect(heirsOf(s, tywin).map((c) => c.id)).not.toContain(key(s, 'jaime').id);
    const ned = key(s, 'ned');
    expect(heirsOf(s, ned)[0].id).toBe(key(s, 'robb').id);
    expect(heirsOf(s, ned).map((c) => c.id)).not.toContain(key(s, 'jon').id);
    expect(key(s, 'jon').fatherId).toBe(ned.id);
  });

  it('les événements d’ouverture désignent leurs personnages et s’appliquent', () => {
    let s = newWesterosGame({ seed: 3, houseId: 'stark' });
    const ids = s.pendingEvents.map((e) => e.eventId);
    expect(ids).toEqual(
      expect.arrayContaining(['got_roi_winterfell', 'got_fiancailles', 'got_rumeurs_essos']),
    );
    const robert = key(s, 'robert');
    s = settle(s);
    expect(s.flags?.main_du_roi).toBe(0);
    expect(s.influence?.[robert.id]?.points ?? 0).toBeGreaterThanOrEqual(40);
  });

  it('plusieurs années de jeu sans erreur, et la partie reste sérialisable', () => {
    for (const houseId of ['stark', 'baratheon', 'bolton']) {
      let s = settle(newWesterosGame({ seed: 11, houseId }));
      s = applyAction(s, { type: 'debugAdvance', years: 3 });
      expect(s.turn).toBeGreaterThan(8);
      const back = importJson(exportJson(s));
      expect(back.scenario).toBe('westeros');
    }
  }, 30000);
});

describe('Westeros : les grands seigneurs face au roi', () => {
  it('un grand seigneur qui méprise un roi nouveau peut se soulever', async () => {
    const { seasonWesteros } = await import('../src/engine/scenario/westerosSeason');
    const { fixedRng } = await import('./helpers');
    const { addOpinion } = await import('../src/engine/characters');
    const s = settle(newWesterosGame({ seed: 4, houseId: 'stark' }));
    const robert = key(s, 'robert');
    const balon = key(s, 'balon');
    s.turn = 1;
    addOpinion(s, balon.id, robert.id, 'Test', -100, 0);
    seasonWesteros({ state: s, rng: fixedRng(0) });
    const w = Object.values(s.wars).find((x) => x.attackerId === balon.id);
    expect(w?.cb).toBe('independance');
    expect(w?.defenderId).toBe(robert.id);
  });

  it('libre, il ceint la couronne de son ancien royaume', async () => {
    const { seasonWesteros } = await import('../src/engine/scenario/westerosSeason');
    const { fixedRng } = await import('./helpers');
    const s = settle(newWesterosGame({ seed: 4, houseId: 'stark' }));
    const ned = key(s, 'ned');
    ned.liegeId = undefined;
    seasonWesteros({ state: s, rng: fixedRng(0.99) });
    expect(s.kingdoms.k_nord.holderId).toBe(ned.id);
    expect(titleOf(s, ned.id)).toBe('Roi du Nord');
  });
});
