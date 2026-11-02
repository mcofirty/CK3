import { describe, expect, it } from 'vitest';
import { SCREEN_TIPS } from '../src/data/screenTips';

/** Les sous-vues de chaque onglet (ui/screens) : chacune a sa bulle de premier passage. */
const VIEWS: Record<string, string[]> = {
  regne: ['resume', 'journal', 'livre'],
  cour: ['souverain', 'maison', 'conseil', 'courtisans'],
  royaume: ['carte', 'domaine', 'tresor', 'lois'],
  armee: ['troupes', 'guerres'],
  monde: ['cours', 'complots', 'nouvelles', 'mur', 'essos'],
};

describe('Aides au premier passage', () => {
  it('une aide par sous-vue, et aucune en trop', () => {
    const expected = Object.entries(VIEWS).flatMap(([t, vs]) => vs.map((v) => `${t}/${v}`));
    expect(Object.keys(SCREEN_TIPS).sort()).toEqual(expected.sort());
    for (const text of Object.values(SCREEN_TIPS)) expect(text.length).toBeGreaterThan(20);
  });
});
