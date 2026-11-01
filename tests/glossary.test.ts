import { describe, expect, it } from 'vitest';
import { GLOSSARY, searchGlossary } from '../src/data/glossary';
import { TRAITS } from '../src/data/traits';

describe('Glossaire', () => {
  it('couvre les grands domaines et ne contient ni doublon ni entrée vide', () => {
    expect(GLOSSARY.length).toBeGreaterThanOrEqual(15);
    for (const sec of GLOSSARY) {
      const terms = sec.entries.map((e) => e.term);
      expect(new Set(terms).size, sec.id).toBe(terms.length);
      for (const e of sec.entries) {
        expect(e.text.length, `${sec.id}/${e.term}`).toBeGreaterThan(10);
        expect(e.text, `${sec.id}/${e.term}`).not.toMatch(/undefined|NaN|\[object/);
      }
    }
  });

  it('explique tous les traits, sans accents ni casse dans la recherche', () => {
    const traits = GLOSSARY.find((s) => s.id === 'traits')!;
    expect(traits.entries.length).toBe(Object.keys(TRAITS).length);
    expect(searchGlossary('SIEGE').some((r) => r.entry.term === 'Siège')).toBe(true);
    expect(searchGlossary('jacquerie')[0].entry.term).toBe('Révolte paysanne');
    expect(searchGlossary('')).toEqual([]);
  });
});
