import { describe, expect, it } from 'vitest';
import { migrate, SaveError } from '../src/save/migrations';
import { exportJson, importJson } from '../src/save/storage';
import { SAVE_VERSION } from '../src/engine/state';
import { newGame } from '../src/engine/world';
import { applyAction } from '../src/engine/actions';

describe('Sauvegarde', () => {
  it('export puis import restitue la partie à l’identique', () => {
    let s = newGame({ seed: 9 });
    s = applyAction(s, { type: 'endSeason' });
    const back = importJson(exportJson(s));
    expect(back).toEqual(s);
  });

  it('la graine est stockée : rejouer depuis une sauvegarde donne le même résultat', () => {
    const s = newGame({ seed: 9 });
    const copy = importJson(exportJson(s));
    const a = applyAction(s, { type: 'debugAdvance', years: 2 });
    const b = applyAction(copy, { type: 'debugAdvance', years: 2 });
    expect(b).toEqual(a);
  });

  it('une sauvegarde de version précédente est migrée', () => {
    const s = newGame({ seed: 9 }) as unknown as Record<string, unknown>;
    const old = { ...s, version: 0 };
    delete old.pendingTriggers;
    delete old.tutorialSeen;
    const m = migrate(old);
    expect(m.version).toBe(SAVE_VERSION);
    expect(m.pendingTriggers).toEqual([]);
  });

  it('refuse une sauvegarde d’une version future ou illisible', () => {
    const s = newGame({ seed: 9 });
    expect(() => migrate({ ...s, version: SAVE_VERSION + 1 })).toThrow(SaveError);
    expect(() => migrate(null)).toThrow(SaveError);
    expect(() => importJson('{"app":"lignees","state":{"version":1}}')).toThrow(SaveError);
  });
});
