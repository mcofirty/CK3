import { describe, expect, it } from 'vitest';
import { BALANCE } from '../src/data/balance';
import { applyAction } from '../src/engine/actions';
import { isAdult, opinion } from '../src/engine/characters';
import {
  candidateAcceptance,
  courtCapacity,
  courtPayroll,
  courtRoster,
  generateCandidates,
  outsiders,
  poachAcceptance,
  poachTargets,
  rallyAcceptance,
  seasonEntourage,
  settleWard,
  wardAcceptance,
  wardCandidates,
  wardsAtCourt,
} from '../src/engine/entourage';
import { economyOf, vassalsOf } from '../src/engine/realm';
import { Rng } from '../src/engine/rng';
import { newGame } from '../src/engine/world';
import { clearEvents } from './helpers';

const ctxOf = (s: ReturnType<typeof newGame>, seed = 1) => ({ state: s, rng: new Rng(seed) });
const goldLine = (s: ReturnType<typeof newGame>, label: string) =>
  economyOf(s, s.playerId).gold.find((l) => l.label === label)?.value ?? 0;

/** Ajoute n courtisans extérieurs compétents à la cour du joueur. */
function addCourtiers(s: ReturnType<typeof newGame>, n: number) {
  const out: string[] = [];
  for (let i = 0; i < n; i++) {
    const id = `t${i}-${s.nextId++}`;
    s.characters[id] = {
      ...s.characters[s.playerId],
      id,
      name: `Courtisan ${i}`,
      dynastyId: null,
      spouseId: undefined,
      childrenIds: [],
      courtId: s.playerId,
      liegeId: undefined,
      opinions: {},
      friends: [],
      rivals: [],
      claims: [],
      traits: [],
      perks: [],
      skills: { diplomatie: 8 + i, guerre: 8, gestion: 8, ruse: 8, savoir: 8 },
      health: 80,
      alive: true,
      birthTurn: s.turn - 30 * 4,
      seed: i,
    };
    out.push(id);
  }
  return out;
}

describe('Candidats de passage', () => {
  it('une nouvelle partie propose 3 à 5 candidats aux profils variés', () => {
    const s = newGame({ seed: 91 });
    expect(s.candidates!.length).toBeGreaterThanOrEqual(3);
    expect(s.candidates!.length).toBeLessThanOrEqual(BALANCE.entourage.candidates.max);
    for (const cand of s.candidates!) {
      const c = s.characters[cand.id];
      expect(c.visitor).toBe(true);
      expect(c.courtId).toBe(c.id);
      expect(cand.fee).toBeGreaterThan(0);
    }
  });

  it('engager un candidat coûte la prime et l’ajoute à la cour', () => {
    let s = clearEvents(newGame({ seed: 92 }));
    const p = s.characters[s.playerId];
    p.gold = 1000;
    p.prestige = 800;
    const cand = s.candidates!.find((c) => candidateAcceptance(s, c).accept)!;
    expect(cand).toBeDefined();
    s = applyAction(s, { type: 'inviteCandidate', id: cand.id });
    const c = s.characters[cand.id];
    expect(c.courtId).toBe(s.playerId);
    expect(c.visitor).toBeFalsy();
    expect(s.characters[s.playerId].gold).toBe(1000 - cand.fee);
    expect(s.candidates!.some((x) => x.id === cand.id)).toBe(false);
  });

  it('un talent très recherché exige du prestige', () => {
    const s = clearEvents(newGame({ seed: 93 }));
    const cand = s.candidates![0];
    const c = s.characters[cand.id];
    c.traits = [];
    c.skills = { diplomatie: 5, guerre: 16, gestion: 5, ruse: 5, savoir: 5 };
    s.characters[s.playerId].skills.diplomatie = 10;
    s.characters[s.playerId].prestige = 0;
    s.characters[s.playerId].gold = 1000;
    expect(candidateAcceptance(s, cand).accept).toBe(false);
    s.characters[s.playerId].prestige = 2000;
    expect(candidateAcceptance(s, cand).accept).toBe(true);
  });

  it('les candidats sont renouvelés chaque printemps, sans laisser de visiteur orphelin', () => {
    const s = clearEvents(newGame({ seed: 94 }));
    const before = s.candidates!.map((c) => c.id);
    s.turn = 8;
    generateCandidates(ctxOf(s));
    for (const id of before) expect(s.characters[id]).toBeUndefined();
    expect(Object.values(s.characters).filter((c) => c.visitor).length).toBe(s.candidates!.length);
  });

  it('un visiteur n’est jamais un parti à marier', () => {
    const s = newGame({ seed: 95 });
    const v = s.characters[s.candidates![0].id];
    const other = Object.values(s.characters).find(
      (c) =>
        c.alive &&
        !c.visitor &&
        !c.spouseId &&
        c.female !== v.female &&
        c.dynastyId !== v.dynastyId &&
        isAdult(s, c),
    )!;
    // marriageBlock est la règle commune au joueur et à l'IA.
    return import('../src/engine/diplomacy').then(({ marriageBlock }) => {
      expect(marriageBlock(s, v, other)).toBe('De passage');
    });
  });
});

describe('Capacité de la cour et salaires', () => {
  it('une cour dans la capacité ne coûte rien ; au-delà, chaque courtisan est payé', () => {
    const s = clearEvents(newGame({ seed: 96 }));
    const cap = courtCapacity(s, s.playerId);
    const have = outsiders(s, s.playerId).length;
    expect(goldLine(s, 'Salaires de la cour')).toBe(0);
    addCourtiers(s, Math.max(0, cap - have) + 2);
    const pay = courtPayroll(s, s.playerId);
    expect(pay.paid.length).toBe(2);
    expect(pay.total).toBeGreaterThan(0);
    expect(goldLine(s, 'Salaires de la cour')).toBeCloseTo(-pay.total, 5);
  });

  it('les places gratuites vont au conseil puis aux plus compétents', () => {
    const s = clearEvents(newGame({ seed: 97 }));
    const cap = courtCapacity(s, s.playerId);
    const ids = addCourtiers(s, cap + 3);
    // Un courtisan médiocre siège au conseil : il garde sa place gratuite.
    s.characters[ids[0]].skills = { diplomatie: 1, guerre: 1, gestion: 1, ruse: 1, savoir: 1 };
    s.council.chancelier.holderId = ids[0];
    const roster = courtRoster(s, s.playerId);
    expect(roster.find((e) => e.c.id === ids[0])!.free).toBe(true);
    expect(roster.filter((e) => !e.free).length).toBe(roster.length - cap);
  });

  it('congédier un courtisan le libère du salaire et vide son siège', () => {
    let s = clearEvents(newGame({ seed: 98 }));
    const cap = courtCapacity(s, s.playerId);
    const ids = addCourtiers(s, cap + 2);
    const paid = courtPayroll(s, s.playerId).paid[0].c.id;
    s.council.espion.holderId = paid;
    s = applyAction(s, { type: 'dismissCourtier', id: paid });
    expect(s.characters[paid].courtId).not.toBe(s.playerId);
    expect(s.council.espion.holderId).toBeUndefined();
    void ids;
  });
});

describe('Trésorier et impayés', () => {
  it('le trésorier prudent relève les impôts puis réduit la cour quand l’or va passer sous zéro', () => {
    const s = clearEvents(newGame({ seed: 99 }));
    s.treasury = 'prudent';
    const cap = courtCapacity(s, s.playerId);
    addCourtiers(s, cap + 6);
    s.characters[s.playerId].gold = -5;
    for (const c of Object.values(s.counties)) if (c.holderId === s.playerId) c.contentment = 80;
    const before = courtPayroll(s, s.playerId).paid.length;
    const taxes0 = Object.values(s.counties).filter(
      (c) => c.holderId === s.playerId && c.tax === 'eleve',
    ).length;
    seasonEntourage(ctxOf(s));
    const taxes1 = Object.values(s.counties).filter(
      (c) => c.holderId === s.playerId && c.tax === 'eleve',
    ).length;
    expect(taxes1).toBeGreaterThan(taxes0);
    expect(courtPayroll(s, s.playerId).paid.length).toBeLessThan(before);
  });

  it('en politique manuelle, seuls les impayés font partir un courtisan par saison', () => {
    const s = clearEvents(newGame({ seed: 100 }));
    s.treasury = 'manuel';
    const cap = courtCapacity(s, s.playerId);
    addCourtiers(s, cap + 3);
    s.characters[s.playerId].gold = 50;
    const n0 = courtPayroll(s, s.playerId).paid.length;
    seasonEntourage(ctxOf(s));
    expect(courtPayroll(s, s.playerId).paid.length).toBe(n0);
    s.characters[s.playerId].gold = -20;
    seasonEntourage(ctxOf(s));
    expect(courtPayroll(s, s.playerId).paid.length).toBe(n0 - 1);
  });
});

describe('Rallier un prisonnier', () => {
  it('un commandant capturé peut se rallier ; une seule tentative', () => {
    let s = clearEvents(newGame({ seed: 101 }));
    const p = s.characters[s.playerId];
    p.gold = 500;
    const rival = Object.values(s.characters).find(
      (c) =>
        c.alive &&
        c.id !== s.playerId &&
        c.dynastyId !== s.playerDynastyId &&
        !Object.values(s.counties).some((k) => k.holderId === c.id) &&
        c.courtId !== s.playerId,
    )!;
    rival.imprisonedBy = s.playerId;
    rival.traits = ['lache'];
    const acc = rallyAcceptance(s, rival.id);
    expect(acc.blocked).toBeUndefined();
    expect(acc.factors.some((f) => f.label.includes('Lâche'))).toBe(true);
    s = applyAction(s, { type: 'rallyPrisoner', id: rival.id });
    const r2 = s.characters[rival.id];
    expect(r2.rallyTried).toBe(true);
    if (!r2.imprisonedBy) {
      expect(r2.courtId).toBe(s.playerId);
      expect(s.characters[s.playerId].gold).toBe(500 - BALANCE.entourage.rally.fee);
    } else {
      expect(rallyAcceptance(s, rival.id).blocked).toBe('Déjà tenté');
    }
  });

  it('un seigneur titré ne se rallie pas', () => {
    const s = clearEvents(newGame({ seed: 102 }));
    const lord = Object.values(s.characters).find(
      (c) =>
        c.alive &&
        c.id !== s.playerId &&
        Object.values(s.counties).some((k) => k.holderId === c.id),
    )!;
    lord.imprisonedBy = s.playerId;
    expect(rallyAcceptance(s, lord.id).blocked).toMatch(/titré/);
  });
});

describe('Pupilles de vassaux', () => {
  function vassalWithChild(s: ReturnType<typeof newGame>) {
    const v = vassalsOf(s, s.playerId)
      .map((id) => s.characters[id])
      .find((x) => x.childrenIds.some((k) => s.characters[k]?.alive));
    if (!v) return undefined;
    const kid = s.characters[v.childrenIds.find((k) => s.characters[k]?.alive)!];
    kid.birthTurn = s.turn - 8 * 4;
    kid.courtId = v.id;
    return { v, kid };
  }

  it('un vassal content confie son enfant, qui grandit à la cour', () => {
    let s = clearEvents(newGame({ seed: 103 }));
    const x = vassalWithChild(s);
    if (!x) return;
    s.characters[s.playerId].prestige = 400;
    x.v.opinions[s.playerId] = [{ reason: 'test', value: 60 }];
    expect(wardCandidates(s).some((w) => w.child.id === x.kid.id)).toBe(true);
    expect(wardAcceptance(s, x.kid.id).accept).toBe(true);
    const op0 = opinion(s, x.v.id, s.playerId);
    s = applyAction(s, { type: 'requestWard', childId: x.kid.id });
    expect(s.characters[x.kid.id].fosterOf).toBe(s.playerId);
    expect(s.characters[x.kid.id].courtId).toBe(s.playerId);
    expect(wardsAtCourt(s).map((k) => k.id)).toContain(x.kid.id);
    expect(opinion(s, x.v.id, s.playerId)).toBe(op0 + BALANCE.entourage.ward.vassalOpinion);
  });

  it('un vassal mécontent refuse', () => {
    const s = clearEvents(newGame({ seed: 104 }));
    const x = vassalWithChild(s);
    if (!x) return;
    x.v.opinions[s.playerId] = [{ reason: 'test', value: -70 }];
    expect(wardAcceptance(s, x.kid.id).accept).toBe(false);
  });

  it('à sa majorité, le pupille retourne chez lui ou reste à la cour', () => {
    const s = clearEvents(newGame({ seed: 105 }));
    const x = vassalWithChild(s);
    if (!x) return;
    x.kid.fosterOf = s.playerId;
    x.kid.courtId = s.playerId;
    const op0 = opinion(s, x.v.id, s.playerId);
    settleWard(s, x.kid.id, 'retour');
    expect(s.characters[x.kid.id].fosterOf).toBeUndefined();
    expect(s.characters[x.kid.id].courtId).not.toBe(s.playerId);
    expect(opinion(s, x.v.id, s.playerId)).toBeGreaterThan(op0);
    x.kid.fosterOf = s.playerId;
    x.kid.courtId = s.playerId;
    settleWard(s, x.kid.id, 'garder');
    expect(s.characters[x.kid.id].courtId).toBe(s.playerId);
    expect(s.characters[x.kid.id].fosterOf).toBeUndefined();
  });
});

describe('Débaucher', () => {
  it('les courtisans des cours rivales sont des cibles, pas leur famille', () => {
    const s = clearEvents(newGame({ seed: 106 }));
    const groups = poachTargets(s);
    expect(groups.length).toBeGreaterThan(0);
    for (const g of groups)
      for (const m of g.members) {
        expect(m.courtId).toBe(g.ruler.id);
        expect(m.id).not.toBe(g.ruler.spouseId);
        expect(g.ruler.childrenIds.includes(m.id)).toBe(false);
      }
  });

  it('un courtisan mécontent de son seigneur est plus facile à débaucher', () => {
    const s = clearEvents(newGame({ seed: 107 }));
    const t = poachTargets(s)[0].members[0];
    const ruler = s.characters[t.courtId];
    s.characters[s.playerId].gold = 1000;
    const base = poachAcceptance(s, t.id).score;
    t.opinions[ruler.id] = [{ reason: 'test', value: -60 }];
    expect(poachAcceptance(s, t.id).score).toBeGreaterThan(base);
  });

  it('une offre réussie déplace le courtisan et fâche son seigneur ; un échec aussi', () => {
    let s = clearEvents(newGame({ seed: 108 }));
    s.characters[s.playerId].gold = 2000;
    s.characters[s.playerId].prestige = 2000;
    const t = poachTargets(s)[0].members[0];
    const ruler = s.characters[t.courtId];
    t.opinions[ruler.id] = [{ reason: 'test', value: -100 }];
    t.traits = ['ambitieux', 'avare'];
    const op0 = opinion(s, ruler.id, s.playerId);
    s = applyAction(s, { type: 'poachCourtier', id: t.id });
    expect(opinion(s, ruler.id, s.playerId)).toBeLessThan(op0);
    const moved = s.characters[t.id].courtId === s.playerId;
    if (moved) expect(s.characters[s.playerId].gold).toBeLessThan(2000);
  });
});
