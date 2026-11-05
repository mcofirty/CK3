import { BALANCE } from '../src/data/balance';
import { describe, expect, it } from 'vitest';
import { applyAction } from '../src/engine/actions';
import { newWesterosGame, westerosCharacter } from '../src/engine/scenario/westeros';
import { seasonWall, wallDefense, nextToFall } from '../src/engine/scenario/wall';
import { seasonEssos } from '../src/engine/scenario/essos';
import { ironThrone } from '../src/engine/scenario/westerosSeason';
import { titleOf } from '../src/engine/realm';
import { atWar } from '../src/engine/characters';
import type { GameState } from '../src/engine/state';
import { fixedRng } from './helpers';

function settle(s: GameState): GameState {
  for (let i = 0; i < 40 && s.pendingEvents.length; i++)
    s = applyAction(s, { type: 'chooseEvent', uid: s.pendingEvents[0].uid, choice: 0 });
  return s;
}
const game = (houseId = 'stark') => settle(newWesterosGame({ seed: 8, houseId }));

describe('Le Mur', () => {
  it('la Garde de Nuit tient le Mur au départ, sous Jeor Mormont', () => {
    const s = game();
    expect(s.wall!.men).toBeGreaterThan(800);
    expect(s.characters[s.wall!.commanderId!].name).toBe('Jeor');
    expect(wallDefense(s)).toBeGreaterThan(s.wall!.threat);
    expect(westerosCharacter(s, 'benjen')!.courtId).toBe(s.wall!.commanderId);
  });

  it('envoyer des hommes, des vivres, un fils qui prend le noir', () => {
    let s = game();
    const men = s.wall!.men;
    s = applyAction(s, { type: 'wallAct', action: { kind: 'hommes' } });
    expect(s.wall!.men).toBe(men + 100);
    const supply = s.wall!.supply;
    s = applyAction(s, { type: 'wallAct', action: { kind: 'vivres' } });
    expect(s.wall!.supply).toBeGreaterThan(supply);
    const rickon = westerosCharacter(s, 'rickon')!;
    s = applyAction(s, { type: 'wallAct', action: { kind: 'noir', id: rickon.id } });
    const r = s.characters[rickon.id];
    expect(r.traits).toContain('voeux');
    expect(r.courtId).toBe(s.wall!.commanderId);
  });

  it('négligé face aux Autres, le Mur tombe ; les morts marchent sur le Nord', () => {
    const s = game();
    s.wall!.threat = 100;
    s.wall!.men = 100;
    for (let i = 0; i < 4; i++) seasonWall({ state: s, rng: fixedRng(0.99) });
    expect(s.wall!.fallenTurn).toBeDefined();
    expect(s.pendingEvents.some((e) => e.eventId === 'mur_chute')).toBe(true);
    // Le premier comté sur le chemin des morts est au nord du Nord.
    const next = nextToFall(s)!;
    expect(next.duchyId).toBe('d_nord');
    s.pendingEvents = [];
    seasonWall({ state: s, rng: fixedRng(0) });
    const ev = s.pendingEvents.find((e) => e.eventId === 'mur_morts_marchent');
    const blighted = Object.values(s.counties).filter((c) => c.blighted).length;
    expect(!!ev || blighted > 0).toBe(true);
  });

  it('quand la menace retombe, l’aube revient et la Garde se reforme', () => {
    const s = game();
    s.wall!.fallenTurn = 0;
    s.wall!.men = 0;
    s.counties.atre.blighted = true;
    s.wall!.threat = 5;
    seasonWall({ state: s, rng: fixedRng(0.99) });
    expect(s.wall!.fallenTurn).toBeUndefined();
    expect(s.wall!.men).toBeGreaterThan(0);
    expect(s.counties.atre.blighted).toBe(false);
  });
});

describe('Essos', () => {
  it('Daenerys avance d’étape en étape, et les dragons naissent', () => {
    const s = game('tyrell');
    s.turn = 6;
    seasonEssos({ state: s, rng: fixedRng(0) });
    expect(s.essos!.stage).toBe(1);
    expect(s.essos!.dragons).toBe(3);
    expect(s.pendingEvents.some((e) => e.eventId === 'essos_dragons')).toBe(true);
  });

  it('elle débarque à Peyredragon et fait la guerre au roi', () => {
    const s = game('tyrell');
    const dany = westerosCharacter(s, 'daenerys')!;
    const robert = westerosCharacter(s, 'robert')!;
    s.essos!.stage = 5;
    s.essos!.dragons = 3;
    s.essos!.stageTurn = 0;
    // Pas avant l'an 10…
    s.turn = 30;
    seasonEssos({ state: s, rng: fixedRng(0) });
    expect(s.essos!.stage).toBe(5);
    // … puis, Westeros n'ayant pas connu la guerre, elle débarque.
    s.turn = BALANCE.essos.landingTurn;
    seasonEssos({ state: s, rng: fixedRng(0) });
    expect(s.essos!.stage).toBe(6);
    expect(s.counties.peyredragon.holderId).toBe(dany.id);
    expect(atWar(s, dany.id, robert.id)).toBe(true);
    // Les bannerets de Stannis passent au roi : la route de Port-Réal reste ouverte.
    expect(s.characters[s.counties.lamarck.holderId].liegeId).toBe(robert.id);
  });

  it('un assassin peut mettre fin à son histoire', () => {
    let s = game('tyrell');
    s.characters[s.playerId].gold = 1000;
    s = applyAction(s, { type: 'essosAct', action: { kind: 'assassin' } });
    expect(s.essos!.assassinTurn).toBe(s.turn);
  });
});

describe('Le Trône de fer', () => {
  it('qui tient Port-Réal tient le Trône de fer', () => {
    const s = game('tyrell');
    const dany = westerosCharacter(s, 'daenerys')!;
    const ned = westerosCharacter(s, 'ned')!;
    s.counties.port_real.holderId = dany.id;
    ironThrone(s);
    expect(s.kingdoms.k_couronnes.holderId).toBe(dany.id);
    expect(titleOf(s, dany.id)).toBe('Reine des Sept Couronnes');
    expect(s.characters[ned.id].liegeId).toBe(dany.id);
  });
});
