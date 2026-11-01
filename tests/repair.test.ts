import { describe, expect, it } from 'vitest';
import { killCharacter, repairRealms } from '../src/engine/characters/lifecycle';
import { countyRuler, independentRulers, vassalsOf } from '../src/engine/realm';
import { Rng } from '../src/engine/rng';
import { migrate } from '../src/save/migrations';
import { newGame } from '../src/engine/world';
import { clearEvents } from './helpers';

const allRuled = (s: ReturnType<typeof newGame>) =>
  Object.values(s.counties).every((c) => {
    const r = s.characters[countyRuler(s, c)];
    return !!r?.alive && !r.liegeId && independentRulers(s).includes(r.id);
  });

function rivalWithVassals(s: ReturnType<typeof newGame>) {
  return independentRulers(s).find((id) => id !== s.playerId && vassalsOf(s, id).length > 0)!;
}

describe('Royaumes orphelins', () => {
  it('un suzerain sans terre propre mais avec des vassaux a une succession', () => {
    const s = newGame({ seed: 91 });
    clearEvents(s);
    const ctx = { state: s, rng: new Rng(1) };
    const r = rivalWithVassals(s);
    const vassals = vassalsOf(s, r);
    // Il a perdu tout son domaine propre (donné à un vassal).
    for (const c of Object.values(s.counties)) if (c.holderId === r) c.holderId = vassals[0];
    for (const t of [...Object.values(s.kingdoms), ...Object.values(s.duchies)])
      if (t.holderId === r) t.holderId = undefined;
    killCharacter(ctx, r, 'de maladie');
    for (const v of vassals) expect(s.characters[s.characters[v].liegeId ?? v]?.alive).toBe(true);
  });

  it('la réparation rattache chaque comté à un souverain vivant', () => {
    const s = newGame({ seed: 92 });
    clearEvents(s);
    const rivals = independentRulers(s).filter((id) => id !== s.playerId);
    // Suzerain mort sans succession, suzerain purgé, comté sans titulaire.
    s.characters[rivals[0]].alive = false;
    delete s.characters[rivals[1]];
    const lone = Object.values(s.counties).find((c) => c.holderId === rivals[2])!;
    lone.holderId = 'personne';
    expect(allRuled(s)).toBe(false);
    repairRealms({ state: s, rng: new Rng(3) });
    expect(allRuled(s)).toBe(true);
  });

  it('une sauvegarde v12 est réparée au chargement', () => {
    const s = newGame({ seed: 93 });
    const r = rivalWithVassals(s);
    s.characters[r].alive = false;
    const raw = JSON.parse(JSON.stringify({ ...s, version: 12 }));
    const m = migrate(raw);
    expect(allRuled(m)).toBe(true);
  });
});

describe('Héritier déjà vassal', () => {
  it('ne devient jamais son propre suzerain', () => {
    const s = newGame({ seed: 94 });
    clearEvents(s);
    const ctx = { state: s, rng: new Rng(4) };
    const r = rivalWithVassals(s);
    const ruler = s.characters[r];
    const v = s.characters[vassalsOf(s, r)[0]];
    // Le vassal devient l'unique héritier du souverain.
    for (const k of ruler.childrenIds) if (s.characters[k]) s.characters[k].alive = false;
    ruler.childrenIds = [v.id];
    killCharacter(ctx, r, 'de maladie');
    expect(s.characters[v.id].liegeId).not.toBe(v.id);
    expect(allRuled(s)).toBe(true);
  });

  it('la réparation libère un souverain vassal de lui-même', () => {
    const s = newGame({ seed: 95 });
    const r = independentRulers(s).find((id) => id !== s.playerId)!;
    s.characters[r].liegeId = r;
    repairRealms({ state: s, rng: new Rng(5) });
    expect(s.characters[r].liegeId).toBeUndefined();
    expect(allRuled(s)).toBe(true);
  });
});
