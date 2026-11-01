import { describe, expect, it } from 'vitest';
import { BALANCE } from '../src/data/balance';
import { addOpinion, createCharacter, marry } from '../src/engine/characters';
import { giveBirth, heirsOf, killCharacter } from '../src/engine/characters/lifecycle';
import {
  applyClause,
  breakPacts,
  claimInfo,
  fuseCrowns,
  offerProtection,
  pressableClaims,
  proposePact,
  protectionAcceptance,
  unionsOf,
} from '../src/engine/crowns';
import { makeAlliance } from '../src/engine/diplomacy';
import { contentmentDelta } from '../src/engine/economy/local';
import { independentRulers, realmCounties } from '../src/engine/realm';
import { Rng } from '../src/engine/rng';
import { migrate } from '../src/save/migrations';
import { canDeclareWar, declareWar, endWar } from '../src/engine/war';
import { newGame } from '../src/engine/world';
import { clearEvents } from './helpers';

function setup(seed: number) {
  const s = newGame({ seed });
  clearEvents(s);
  const ctx = { state: s, rng: new Rng(seed) };
  const rival = independentRulers(s).find((id) => id !== s.playerId)!;
  return { s, ctx, rival, pl: s.characters[s.playerId] };
}

/** Fait du joueur l'unique héritier du rival. */
function makePlayerHeirOf(s: ReturnType<typeof newGame>, rival: string) {
  const r = s.characters[rival];
  for (const k of r.childrenIds) if (s.characters[k]) s.characters[k].alive = false;
  r.childrenIds = [s.playerId];
  for (const c of Object.values(s.characters))
    if (c.alive && c.id !== rival && c.dynastyId === r.dynastyId) c.dynastyId = null;
}

describe('Union personnelle', () => {
  it('un souverain qui hérite d’un autre royaume le tient en union, à part', () => {
    const { s, ctx, rival } = setup(61);
    const theirs = realmCounties(s, rival).length;
    makePlayerHeirOf(s, rival);
    killCharacter(ctx, rival, 'de maladie');
    const [u] = unionsOf(s, s.playerId);
    expect(u).toBeDefined();
    expect(u.counties.length).toBe(theirs);
    expect(s.pendingEvents.some((e) => e.eventId === `sys_union_${u.id}`)).toBe(true);
    // Les terres de la couronne lointaine grognent.
    const c = s.counties[u.counties[0]];
    expect(
      contentmentDelta(s, c).reasons.some((r) => r.label.startsWith('Souverain lointain')),
    ).toBe(true);
  });

  it('après des années de règne commun, les couronnes se fondent', () => {
    const { s, ctx, rival, pl } = setup(62);
    makePlayerHeirOf(s, rival);
    killCharacter(ctx, rival, 'de maladie');
    const [u] = unionsOf(s, s.playerId);
    pl.prestige = 1000;
    expect(fuseCrowns(s, s.playerId, u.id)).toBe(false);
    u.since = s.turn - 200;
    const renown = s.dynasties[pl.dynastyId!].renown;
    expect(fuseCrowns(s, s.playerId, u.id)).toBe(true);
    expect(unionsOf(s, s.playerId)).toHaveLength(0);
    expect(s.dynasties[pl.dynastyId!].renown).toBe(renown + BALANCE.crowns.fuseRenown);
  });

  it('le partage rend la couronne héritée au cadet, qui règne seul', () => {
    const { s, ctx, rival, pl } = setup(63);
    makePlayerHeirOf(s, rival);
    killCharacter(ctx, rival, 'de maladie');
    const [u] = unionsOf(s, s.playerId);
    pl.successionLaw = 'partage';
    const wife =
      (pl.spouseId && s.characters[pl.spouseId]) ||
      createCharacter(ctx, { age: 25, female: !pl.female, dynastyId: null, skillBase: 7 });
    if (!pl.spouseId) marry(s, pl, wife);
    for (const k of [...pl.childrenIds]) if (s.characters[k]) s.characters[k].alive = false;
    const [mother, father] = pl.female ? [pl, wife] : [wife, pl];
    const a = giveBirth(ctx, mother, father);
    const b = giveBirth(ctx, mother, father);
    a.birthTurn = s.turn - 100;
    b.birthTurn = s.turn - 90;
    const crown = [...u.counties];
    killCharacter(ctx, s.playerId, 'de vieillesse');
    expect(s.characters[b.id].liegeId).toBeUndefined();
    expect(crown.every((id) => s.counties[id].holderId !== a.id)).toBe(true);
    expect(crown.some((id) => s.counties[id].holderId === b.id)).toBe(true);
  });
});

describe('Loi agnatique et droits par le sang', () => {
  it('la loi agnatique écarte les femmes de la succession', () => {
    const { s, pl } = setup(64);
    pl.agnatic = true;
    expect(heirsOf(s, pl).some((h) => h.female)).toBe(false);
  });

  it('un enfant reçoit des droits sur la maison régnante de sa mère, sauf renonciation', () => {
    const { s, ctx, rival, pl } = setup(65);
    const r = s.characters[rival];
    const princess = createCharacter(ctx, {
      age: 20,
      female: true,
      dynastyId: r.dynastyId,
      skillBase: 7,
    });
    const groom = pl.female
      ? createCharacter(ctx, { age: 22, female: false, dynastyId: pl.dynastyId, skillBase: 7 })
      : pl;
    if (groom.spouseId) s.characters[groom.spouseId].spouseId = undefined;
    groom.spouseId = undefined;
    marry(s, groom, princess);
    const kid = giveBirth(ctx, princess, groom);
    expect(kid.dynastyId).toBe(groom.dynastyId);
    expect(kid.houseClaims).toContain(r.dynastyId);
    princess.renounced = true;
    const kid2 = giveBirth(ctx, princess, groom);
    expect(kid2.houseClaims ?? []).not.toContain(r.dynastyId);
  });

  it('mariage matrilinéaire : les enfants prennent la maison de la mère', () => {
    const { s, ctx, pl } = setup(66);
    const daughter = createCharacter(ctx, {
      age: 20,
      female: true,
      dynastyId: pl.dynastyId,
      skillBase: 7,
    });
    const husband = createCharacter(ctx, { age: 22, female: false, dynastyId: null, skillBase: 7 });
    husband.dynastyId = Object.keys(s.dynasties).find((d) => d !== pl.dynastyId)!;
    marry(s, daughter, husband);
    applyClause(s, daughter, husband, 'matrilineaire', 0);
    expect(giveBirth(ctx, daughter, husband).dynastyId).toBe(pl.dynastyId);
  });

  it('un droit est fort quand le souverain visé n’a pas d’enfant', () => {
    const { s, rival } = setup(67);
    const r = s.characters[rival];
    for (const k of r.childrenIds) if (s.characters[k]) s.characters[k].alive = false;
    expect(claimInfo(s, 'x', r.dynastyId!)?.strong).toBe(true);
  });

  it('une guerre de droit dynastique gagnée fait monter le prétendant sur le trône', () => {
    const { s, ctx, rival, pl } = setup(68);
    const r = s.characters[rival];
    const claimant = createCharacter(ctx, {
      age: 24,
      female: false,
      dynastyId: pl.dynastyId,
      courtId: pl.id,
      skillBase: 8,
    });
    claimant.houseClaims = [r.dynastyId!];
    pl.prestige = 1000;
    expect(pressableClaims(s, pl.id).some((x) => x.claimantId === claimant.id)).toBe(true);
    expect(canDeclareWar(s, pl.id, rival, 'dynastique', undefined, claimant.id).ok).toBe(true);
    const w = declareWar(ctx, pl.id, rival, 'dynastique', undefined, false, claimant.id)!;
    const theirs = Object.values(s.counties)
      .filter((c) => c.holderId === rival)
      .map((c) => c.id);
    endWar(ctx, w.id, 'attaquant');
    expect(theirs.every((id) => s.counties[id].holderId === claimant.id)).toBe(true);
    expect(s.characters[claimant.id].liegeId).toBe(pl.id);
  });
});

describe('Suzeraineté et pactes', () => {
  it('la protection exige un lien de famille ; acceptée, le souverain devient vassal', () => {
    const { s, ctx, rival, pl } = setup(69);
    expect(protectionAcceptance(s, pl.id, rival).blocked).toMatch(/famille/);
    const r = s.characters[rival];
    const kid = pl.childrenIds.map((k) => s.characters[k]).find((k) => k?.alive);
    const bride =
      kid ?? createCharacter(ctx, { age: 20, female: true, dynastyId: pl.dynastyId, skillBase: 7 });
    if (!kid) pl.childrenIds.push(bride.id);
    if (r.spouseId) s.characters[r.spouseId].spouseId = undefined;
    r.spouseId = undefined;
    bride.spouseId = undefined;
    marry(s, bride, r);
    addOpinion(s, rival, pl.id, 'Test', 200, 0);
    expect(protectionAcceptance(s, pl.id, rival).accept).toBe(true);
    expect(offerProtection(ctx, pl.id, rival)).toBe(true);
    expect(s.characters[rival].liegeId).toBe(pl.id);
  });

  it('pacte de famille : pas de guerre entre parents ; le rompre coûte cher', () => {
    const { s, ctx, rival, pl } = setup(70);
    const r = s.characters[rival];
    const bride = createCharacter(ctx, {
      age: 20,
      female: !r.female,
      dynastyId: pl.dynastyId,
      skillBase: 7,
    });
    pl.childrenIds.push(bride.id);
    if (r.spouseId) s.characters[r.spouseId].spouseId = undefined;
    r.spouseId = undefined;
    marry(s, bride, r);
    makeAlliance(s, pl.id, rival);
    addOpinion(s, rival, pl.id, 'Test', 200, 0);
    expect(proposePact(ctx, 'famille', pl.id, rival)).toBe(true);
    expect(
      canDeclareWar(s, pl.id, rival, 'conquete', realmCounties(s, rival)[0].id).reasons.join(),
    ).toMatch(/Pacte/);
    const prestige = pl.prestige;
    breakPacts(s, pl.id, rival);
    expect(s.characters[pl.id].prestige).toBe(prestige + BALANCE.crowns.perjuryPrestige);
  });

  it('pacte successoral : faute d’héritier, l’allié hérite et tient la couronne en union', () => {
    const { s, ctx, rival, pl } = setup(71);
    makeAlliance(s, pl.id, rival);
    addOpinion(s, rival, pl.id, 'Test', 200, 0);
    pl.gold = 1000;
    expect(proposePact(ctx, 'succession', pl.id, rival, 200)).toBe(true);
    const r = s.characters[rival];
    for (const k of r.childrenIds) if (s.characters[k]) s.characters[k].alive = false;
    for (const c of Object.values(s.characters))
      if (c.id !== rival && c.dynastyId === r.dynastyId) c.alive = false;
    const theirs = Object.values(s.counties)
      .filter((c) => c.holderId === rival)
      .map((c) => c.id);
    killCharacter(ctx, rival, 'de maladie');
    expect(theirs.every((id) => s.counties[id].holderId === pl.id)).toBe(true);
    expect(unionsOf(s, pl.id)).toHaveLength(1);
  });

  it('une sauvegarde v10 reçoit unions, pactes et droits par le sang', () => {
    const s = newGame({ seed: 72 }) as unknown as Record<string, unknown>;
    delete s.unions;
    s.version = 10;
    const m = migrate(JSON.parse(JSON.stringify(s)));
    expect(m.unions).toEqual([]);
    expect(m.familyPacts).toEqual([]);
  });
});

describe('Couple de souverains', () => {
  it('les enfants d’une reine héritent de ses droits, sans guerre proposée contre leur mère', () => {
    const { s, ctx, rival, pl } = setup(73);
    const r = s.characters[rival];
    if (r.female === pl.female) return;
    if (pl.spouseId) s.characters[pl.spouseId].spouseId = undefined;
    if (r.spouseId) s.characters[r.spouseId].spouseId = undefined;
    pl.spouseId = undefined;
    r.spouseId = undefined;
    marry(s, pl, r);
    const [mother, father] = pl.female ? [pl, r] : [r, pl];
    const kid = giveBirth(ctx, mother, father);
    const otherHouse = kid.dynastyId === pl.dynastyId ? r.dynastyId : pl.dynastyId;
    expect(kid.houseClaims).toContain(otherHouse);
    expect(pressableClaims(s, pl.id).some((x) => x.rulerId === rival)).toBe(false);
  });
});
