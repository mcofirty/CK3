import { describe, expect, it } from 'vitest';
import { GOVERNMENTS, LAW_COOLDOWN, SUCCESSION_LAWS } from '../src/data/governments';
import { applyAction } from '../src/engine/actions';
import { addOpinion, createCharacter, opinionOf } from '../src/engine/characters';
import { heirsOf } from '../src/engine/characters/lifecycle';
import { electionResults, governmentOf } from '../src/engine/government';
import { heirUnderLaw, lawCheck, reformCheck } from '../src/engine/laws';
import { countyLevyMult } from '../src/engine/economy/local';
import { incomeMultiplier, independentRulers } from '../src/engine/realm';
import { Rng } from '../src/engine/rng';
import { migrate } from '../src/save/migrations';
import { newGame } from '../src/engine/world';
import { clearEvents } from './helpers';

/** Joueur avec trois enfants adultes d'âges différents et un frère plus âgé. */
function family(seed: number) {
  const s = newGame({ seed });
  clearEvents(s);
  const ctx = { state: s, rng: new Rng(seed) };
  const p = s.characters[s.playerId];
  for (const k of p.childrenIds) if (s.characters[k]) s.characters[k].alive = false;
  p.childrenIds = [];
  const mk = (age: number) => {
    const k = createCharacter(ctx, {
      age,
      dynastyId: p.dynastyId,
      courtId: p.id,
      fatherId: p.female ? undefined : p.id,
      motherId: p.female ? p.id : undefined,
      skillBase: 8,
    });
    if (!p.childrenIds.includes(k.id)) p.childrenIds.push(k.id);
    return k;
  };
  const eldest = mk(24);
  const middle = mk(20);
  const youngest = mk(17);
  p.prestige = 2000;
  p.gold = 2000;
  return { s, ctx, p, eldest, middle, youngest };
}

describe('Lois de succession', () => {
  it('primogéniture : l’aîné ; ultimogéniture : le plus jeune', () => {
    const { s, p, eldest, youngest } = family(301);
    expect(heirUnderLaw(s, p, 'primogeniture')?.id).toBe(eldest.id);
    expect(heirUnderLaw(s, p, 'ultimogeniture')?.id).toBe(youngest.id);
  });

  it('séniorité : le plus âgé de la maison, même s’il n’est pas un enfant', () => {
    const { s, ctx, p } = family(302);
    const uncle = createCharacter(ctx, {
      age: 55,
      dynastyId: p.dynastyId,
      courtId: p.id,
      skillBase: 8,
    });
    expect(heirUnderLaw(s, p, 'seniorite')?.id).toBe(uncle.id);
  });

  it('élective : les vassaux élisent celui qu’ils préfèrent', () => {
    const { s, p, middle } = family(303);
    const vassals = Object.values(s.characters).filter((v) => v.alive && v.liegeId === p.id);
    expect(vassals.length).toBeGreaterThan(0);
    for (const v of vassals) addOpinion(s, v.id, middle.id, 'Ami', 200, 0);
    // Le souverain vote aussi : on lui fait préférer le cadet du milieu.
    addOpinion(s, p.id, middle.id, 'Préféré', 200, 0);
    const ballot = electionResults(s, p, heirsOf(s, p));
    expect(ballot[0].candidateId).toBe(middle.id);
    expect(heirUnderLaw(s, p, 'elective')?.id).toBe(middle.id);
  });

  it('changer de loi : permise par le gouvernement, payée en prestige, puis un délai', () => {
    const { s, p } = family(304);
    expect(governmentOf(s, p.id)).toBe('feodal');
    expect(lawCheck(s, p.id, 'seniorite').reason).toMatch(/Interdite/);
    const prestige = p.prestige;
    let next = applyAction(s, { type: 'changeLaw', law: 'ultimogeniture' });
    const me = next.characters[next.playerId];
    expect(me.successionLaw).toBe('ultimogeniture');
    expect(me.prestige).toBe(prestige - SUCCESSION_LAWS.ultimogeniture.cost);
    expect(lawCheck(next, me.id, 'primogeniture').reason).toMatch(/récemment/);
    // Les vassaux grognent.
    const v = Object.values(next.characters).find((x) => x.alive && x.liegeId === me.id)!;
    expect(
      opinionOf(next, v.id, me.id).reasons.some((r) => r.label.includes('Loi de succession')),
    ).toBe(true);
    next.turn += LAW_COOLDOWN;
    expect(lawCheck(next, me.id, 'primogeniture').ok).toBe(true);
    next = applyAction(next, { type: 'changeLaw', law: 'elective' });
    expect(next.characters[next.playerId].successionLaw).toBe('elective');
  });
});

describe('Gouvernements', () => {
  it('réformer exige ses conditions ; une loi interdite revient à la loi d’usage', () => {
    const { s, p } = family(305);
    expect(reformCheck(s, p.id, 'centralise').reason).toMatch(/couronne/);
    const k = Object.values(s.kingdoms)[0];
    k.holderId = p.id;
    p.successionLaw = 'partage';
    const next = applyAction(s, { type: 'reformGovernment', to: 'centralise' });
    const me = next.characters[next.playerId];
    expect(me.government).toBe('centralise');
    expect(me.successionLaw).toBe(GOVERNMENTS.centralise.defaultLaw);
  });

  it('le gouvernement pèse sur les revenus, les levées et la loyauté des vassaux', () => {
    const { s, p } = family(306);
    const c = Object.values(s.counties).find((x) => x.holderId === p.id)!;
    const inc = incomeMultiplier(s, p.id);
    const lev = countyLevyMult(s, c);
    p.government = 'tribal';
    expect(incomeMultiplier(s, p.id)).toBeCloseTo(inc * (1 + GOVERNMENTS.tribal.income));
    expect(countyLevyMult(s, c)).toBeCloseTo(lev * (1 + GOVERNMENTS.tribal.levies));
    const v = Object.values(s.characters).find((x) => x.alive && x.liegeId === p.id)!;
    expect(opinionOf(s, v.id, p.id).reasons.some((r) => r.label === 'Gouvernement : Tribu')).toBe(
      true,
    );
  });

  it('les souverains de l’IA ont des gouvernements variés et des lois permises', () => {
    const govs = new Set<string>();
    for (let seed = 1; seed <= 8; seed++) {
      const s = newGame({ seed });
      for (const id of independentRulers(s)) {
        const r = s.characters[id];
        const g = governmentOf(s, id);
        govs.add(g);
        expect(GOVERNMENTS[g].laws).toContain(r.successionLaw);
      }
    }
    expect(govs.size).toBeGreaterThanOrEqual(2);
  });

  it('une sauvegarde v13 se charge en féodalité', () => {
    const s = newGame({ seed: 307 }) as unknown as Record<string, unknown>;
    for (const c of Object.values(s.characters as Record<string, { government?: string }>))
      delete c.government;
    s.version = 13;
    const m = migrate(JSON.parse(JSON.stringify(s)));
    expect(governmentOf(m, m.playerId)).toBe('feodal');
  });
});
