import { describe, expect, it } from 'vitest';
import { eventSubjects } from '../src/engine/events/subjects';
import { independentRulers } from '../src/engine/realm';
import type { EventDef } from '../src/engine/events/types';
import { newGame } from '../src/engine/world';

describe('Fiches utiles avant une décision', () => {
  it('liste les rôles de la portée et les personnes citées par les effets, sans le joueur', () => {
    const s = newGame({ seed: 12 });
    const rival = independentRulers(s).find((id) => id !== s.playerId)!;
    const county = Object.keys(s.counties)[0];
    const kid = Object.values(s.characters).find(
      (c) => c.alive && c.id !== s.playerId && c.id !== rival,
    )!;
    const def = {
      id: 'x',
      titre: 't',
      texte: 't',
      categorie: 'systeme',
      declencheur: { type: 'suite' },
      choix: [{ libelle: 'a', effets: [{ mariage: { a: kid.id, b: s.playerId } }] }],
    } as unknown as EventDef;
    const subj = eventSubjects(s, def, { souverain: s.playerId, ennemi: rival, comte: county });
    expect(subj.map((x) => x.id)).toEqual([rival, county, kid.id]);
    expect(subj[0]).toMatchObject({ kind: 'perso', role: 'Ennemi' });
    expect(subj[1]).toMatchObject({ kind: 'comte', role: 'Comté' });
    expect(subj.some((x) => x.id === s.playerId)).toBe(false);
  });
});
