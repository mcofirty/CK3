/** Personnages : compétences, santé, opinion, noms, création. */
import { distantFactor } from '../crowns';
import { BALANCE } from '../../data/balance';
import { NAMES } from '../../data/names';
import { LEGACIES, PERKS, type PerkKey } from '../../data/perks';
import { HEREDITARY_TRAITS, PERSONALITY_TRAITS, TRAITS } from '../../data/traits';
import { clamp, newId, type Ctx } from '../context';
import type { Rng } from '../rng';
import { SKILL_KEYS, type Character, type GameState, type SkillKey, type Skills } from '../state';

const C = BALANCE.characters;
const O = BALANCE.opinion;

export function ageOf(state: GameState, c: Character): number {
  const end = c.alive ? state.turn : (c.deathTurn ?? state.turn);
  return Math.floor((end - c.birthTurn) / 4);
}

export function isAdult(state: GameState, c: Character): boolean {
  return ageOf(state, c) >= C.adulthood;
}

export function skill(c: Character, k: SkillKey): number {
  let v = c.skills[k];
  for (const t of c.traits) v += TRAITS[t]?.skills?.[k] ?? 0;
  for (const p of c.perks ?? []) v += PERKS[p]?.skills?.[k] ?? 0;
  return clamp(Math.round(v), 0, C.skillCap);
}

/** Somme d'un bonus des talents du personnage et des héritages de sa maison. */
export function perkBonus(state: GameState, c: Character | undefined, key: PerkKey): number {
  if (!c) return 0;
  let v = 0;
  for (const p of c.perks ?? []) v += PERKS[p]?.[key] ?? 0;
  const d = c.dynastyId ? state.dynasties[c.dynastyId] : undefined;
  for (const l of d?.legacies ?? []) v += LEGACIES[l]?.[key] ?? 0;
  return v;
}

/** Tactiques garanties par les talents et héritages. */
export function perkTactics(state: GameState, c: Character | undefined): string[] {
  if (!c) return [];
  const out: string[] = [];
  for (const p of c.perks ?? []) if (PERKS[p]?.tactic) out.push(PERKS[p].tactic!);
  const d = c.dynastyId ? state.dynasties[c.dynastyId] : undefined;
  for (const l of d?.legacies ?? []) if (LEGACIES[l]?.tactic) out.push(LEGACIES[l].tactic!);
  return [...new Set(out)];
}

export function skillsOf(c: Character): Skills {
  return Object.fromEntries(SKILL_KEYS.map((k) => [k, skill(c, k)])) as Skills;
}

export function healthOf(c: Character): number {
  let h = c.health;
  for (const t of c.traits) h += TRAITS[t]?.health ?? 0;
  for (const p of c.perks ?? []) h += PERKS[p]?.health ?? 0;
  return clamp(Math.round(h), 0, 100);
}

export function hasTrait(c: Character | undefined, t: string): boolean {
  return !!c && c.traits.includes(t);
}

export function addTrait(c: Character, t: string): void {
  if (!TRAITS[t] || c.traits.includes(t)) return;
  const opp = TRAITS[t].opposite;
  if (opp) c.traits = c.traits.filter((x) => x !== opp);
  // Un seul trait d'éducation.
  if (TRAITS[t].category === 'education')
    c.traits = c.traits.filter((x) => TRAITS[x]?.category !== 'education');
  c.traits.push(t);
}

export function removeTrait(c: Character, t: string): void {
  c.traits = c.traits.filter((x) => x !== t);
}

export function char(state: GameState, id: string | undefined): Character | undefined {
  return id ? state.characters[id] : undefined;
}

export function player(state: GameState): Character {
  return state.characters[state.playerId];
}

export function displayName(state: GameState, c: Character | undefined): string {
  if (!c) return '—';
  const d = c.dynastyId ? state.dynasties[c.dynastyId] : undefined;
  return d ? `${c.name} ${d.name}` : c.name;
}

// --- Noms ---
export function firstName(rng: Rng, female: boolean): string {
  const s = rng.pick(NAMES.starts) + rng.pick(NAMES.middles);
  const end = rng.pick(female ? NAMES.female : NAMES.male);
  // Évite les triples voyelles disgracieuses.
  const name = (s + end).replace(/([aeiouy])\1+/g, '$1');
  return name.charAt(0).toUpperCase() + name.slice(1);
}

export function dynastyName(rng: Rng, used: Set<string>): string {
  for (let i = 0; i < 50; i++) {
    const n = rng.pick(NAMES.dynastyStarts) + rng.pick(NAMES.dynastyEnds);
    const full = /^[AEIOUY]/.test(n) ? `d'${n}` : `de ${n}`;
    if (!used.has(full)) {
      used.add(full);
      return full;
    }
  }
  return `de ${rng.pick(NAMES.dynastyStarts)}${rng.int(2, 9)}`;
}

// --- Création ---
export interface NewCharacterOpts {
  female?: boolean;
  age: number;
  dynastyId: string | null;
  courtId?: string;
  fatherId?: string;
  motherId?: string;
  skillBase?: number;
  traits?: string[];
  personalityCount?: number;
  education?: boolean;
}

export function createCharacter(ctx: Ctx, opts: NewCharacterOpts): Character {
  const { state, rng } = ctx;
  const id = newId(state, 'p');
  const female = opts.female ?? rng.chance(0.5);
  const base = opts.skillBase ?? 6;
  const skills = Object.fromEntries(
    SKILL_KEYS.map((k) => [k, clamp(base + rng.int(-3, 4), 0, 20)]),
  ) as Skills;
  const c: Character = {
    id,
    name: firstName(rng, female),
    female,
    dynastyId: opts.dynastyId,
    birthTurn: state.turn - opts.age * 4 - rng.int(0, 3),
    alive: true,
    skills,
    traits: [],
    health: rng.int(70, 90),
    fatherId: opts.fatherId,
    motherId: opts.motherId,
    childrenIds: [],
    courtId: opts.courtId ?? id,
    gold: 0,
    prestige: 0,
    piety: 0,
    opinions: {},
    friends: [],
    rivals: [],
    claims: [],
    successionLaw: 'partage',
    seed: rng.seed(),
  };
  for (const t of opts.traits ?? []) addTrait(c, t);
  const nPers =
    opts.personalityCount ?? (opts.age >= C.adulthood ? C.traitsAtStart : opts.age >= 6 ? 1 : 0);
  addRandomPersonality(rng, c, nPers);
  if (opts.education ?? opts.age >= C.adulthood) {
    const focus = rng.pick(SKILL_KEYS);
    const tier = rng.chance(0.3) ? 2 : 1;
    const t = Object.values(TRAITS).find(
      (d) => d.education?.skill === focus && d.education.tier === tier,
    );
    if (t) addTrait(c, t.id);
  }
  if (!opts.traits && rng.chance(0.15)) addTrait(c, rng.pick(HEREDITARY_TRAITS));
  state.characters[id] = c;
  if (opts.fatherId) state.characters[opts.fatherId]?.childrenIds.push(id);
  if (opts.motherId) state.characters[opts.motherId]?.childrenIds.push(id);
  return c;
}

export function addRandomPersonality(rng: Rng, c: Character, n: number): void {
  let guard = 0;
  while (
    c.traits.filter((t) => TRAITS[t]?.category === 'personnalite').length < n &&
    guard++ < 30
  ) {
    const t = rng.pick(PERSONALITY_TRAITS);
    const opp = TRAITS[t].opposite;
    if (c.traits.includes(t) || (opp && c.traits.includes(opp))) continue;
    addTrait(c, t);
  }
}

export function marry(_state: GameState, a: Character, b: Character): void {
  a.spouseId = b.id;
  b.spouseId = a.id;
}

// --- Famille ---
export function parentsOf(state: GameState, c: Character): Character[] {
  return [c.fatherId, c.motherId].map((id) => char(state, id)).filter((x): x is Character => !!x);
}

export function siblingsOf(state: GameState, c: Character): Character[] {
  const ids = new Set<string>();
  for (const p of parentsOf(state, c)) for (const k of p.childrenIds) if (k !== c.id) ids.add(k);
  return [...ids].map((id) => state.characters[id]).filter(Boolean);
}

export function livingChildren(state: GameState, c: Character): Character[] {
  return c.childrenIds
    .map((id) => state.characters[id])
    .filter((k) => k && k.alive)
    .sort((a, b) => a.birthTurn - b.birthTurn);
}

export function isCloseFamily(state: GameState, a: Character, b: Character): boolean {
  if (a.spouseId === b.id) return true;
  if (a.fatherId === b.id || a.motherId === b.id || b.fatherId === a.id || b.motherId === a.id)
    return true;
  return siblingsOf(state, a).some((s) => s.id === b.id);
}

/** Famille proche du joueur (conjoint, enfants, frères et sœurs, petits-enfants vivants). */
export function closeFamily(state: GameState, c: Character): Character[] {
  const set = new Map<string, Character>();
  const add = (x?: Character) => x && x.alive && x.id !== c.id && set.set(x.id, x);
  add(char(state, c.spouseId));
  for (const k of livingChildren(state, c)) {
    add(k);
    for (const g of livingChildren(state, k)) add(g);
  }
  for (const s of siblingsOf(state, c)) add(s);
  return [...set.values()];
}

// --- Opinion ---
export interface OpinionBreakdown {
  total: number;
  reasons: { label: string; value: number }[];
}

export function opinionOf(state: GameState, fromId: string, toId: string): OpinionBreakdown {
  const from = state.characters[fromId];
  const to = state.characters[toId];
  const reasons: { label: string; value: number }[] = [];
  if (!from || !to || fromId === toId) return { total: 0, reasons };
  const push = (label: string, value: number) =>
    value !== 0 && reasons.push({ label, value: Math.round(value) });

  push(`Diplomatie de ${to.name}`, (skill(to, 'diplomatie') - 10) * O.diplomacyPerPoint);
  for (const t of from.traits) {
    const def = TRAITS[t];
    if (def?.category !== 'personnalite') continue;
    if (to.traits.includes(t)) push(`Trait commun : ${def.name}`, O.sameTrait);
    if (def.opposite && to.traits.includes(def.opposite))
      push(`Traits opposés : ${def.name} / ${TRAITS[def.opposite].name}`, O.oppositeTrait);
  }
  push('Réputation personnelle', perkBonus(state, to, 'opinionAll'));
  if (from.lovers?.includes(toId)) push('Amant', BALANCE.relations.loverOpinion);
  if (from.liegeId === toId) {
    push('Vassal', O.vassalBase);
    push('Talents et héritages du suzerain', perkBonus(state, to, 'vassalOpinion'));
    for (const t of to.traits) {
      const v = TRAITS[t]?.vassalOpinion;
      if (v) push(`Réputation : ${TRAITS[t].name}`, v);
    }
    if (isOverDemesne(state, toId)) push('Domaine propre trop étendu', O.overDemesne);
  }
  // Un seigneur dont l'enfant grandit à la cour de son suzerain y est attaché.
  if (
    from.liegeId === toId &&
    from.childrenIds.some(
      (k) => state.characters[k]?.alive && state.characters[k].fosterOf === toId,
    )
  )
    push('Enfant confié à votre cour', BALANCE.entourage.ward.vassalOpinion);
  if (from.spouseId === toId) push('Conjoint', O.spouse);
  else if (isCloseFamily(state, from, to)) push('Famille', O.family);
  if (from.friends.includes(toId)) push('Ami', O.friend);
  if (from.rivals.includes(toId)) push('Rival', O.rival);
  const fromTop = topLiege(state, fromId);
  const toTop = topLiege(state, toId);
  if (fromTop !== toTop && fromId === fromTop && toId === toTop) {
    if (atWar(state, fromId, toId)) push('En guerre', O.atWar);
    else if (allied(state, fromId, toId)) push('Alliés', O.allied);
  }
  // Revendications sur mes terres.
  const myCounties = Object.values(state.counties)
    .filter((c) => c.holderId === fromId)
    .map((c) => c.id);
  if (to.claims.some((cl) => myCounties.includes(cl)))
    push('Revendique mes terres', O.claimOnHolding);
  // Vassal d'une couronne où le souverain ne réside pas (union personnelle).
  if (from.liegeId === toId) {
    const far = Math.max(
      0,
      ...Object.values(state.counties)
        .filter((c) => c.holderId === fromId)
        .map((c) => distantFactor(state, c)),
    );
    if (far) push('Souverain lointain', BALANCE.crowns.distantOpinion * far);
  }
  // Droits dynastiques sur ma maison.
  if (from.dynastyId && to.houseClaims?.includes(from.dynastyId) && !from.liegeId)
    push('Prétend à ma couronne', -15);
  if (to.imprisonedBy === fromId) push('Mon prisonnier', -10);
  if (from.imprisonedBy === toId) push('Me retient prisonnier', -50);
  for (const m of from.opinions[toId] ?? []) {
    if (m.expires === undefined || m.expires > state.turn) push(m.reason, m.value);
  }
  const total = clamp(
    reasons.reduce((s, r) => s + r.value, 0),
    O.min,
    O.max,
  );
  return { total, reasons };
}

export function opinion(state: GameState, fromId: string, toId: string): number {
  return opinionOf(state, fromId, toId).total;
}

export function addOpinion(
  state: GameState,
  fromId: string,
  toId: string,
  reason: string,
  value: number,
  seasons = 20,
): void {
  const from = state.characters[fromId];
  if (!from || fromId === toId) return;
  const list = (from.opinions[toId] ??= []);
  const existing = list.find(
    (m) => m.reason === reason && (m.expires === undefined || m.expires > state.turn),
  );
  if (existing) {
    existing.value = clamp(existing.value + value, -100, 100);
    existing.expires = seasons > 0 ? state.turn + seasons : undefined;
  } else {
    list.push({ reason, value, expires: seasons > 0 ? state.turn + seasons : undefined });
  }
}

export function cleanOpinions(state: GameState): void {
  for (const c of Object.values(state.characters)) {
    if (!c.alive) {
      c.opinions = {};
      continue;
    }
    for (const [k, list] of Object.entries(c.opinions)) {
      const kept = list.filter((m) => m.expires === undefined || m.expires > state.turn);
      if (kept.length && state.characters[k]?.alive) c.opinions[k] = kept;
      else delete c.opinions[k];
    }
  }
}

// --- Liens féodaux (utilisés aussi par l'opinion) ---
export function topLiege(state: GameState, id: string): string {
  const c = state.characters[id];
  if (!c) return id;
  if (c.liegeId) {
    let top = c.liegeId;
    for (let i = 0; i < 5; i++) {
      const l = state.characters[top]?.liegeId;
      if (!l || l === top) break;
      top = l;
    }
    return top;
  }
  // Un courtisan relève du souverain de sa cour.
  const holds = Object.values(state.counties).some((k) => k.holderId === id);
  if (!holds && c.courtId && c.courtId !== id) {
    const court = state.characters[c.courtId];
    return court?.liegeId ?? c.courtId;
  }
  return id;
}

export function heldCounties(state: GameState, id: string): string[] {
  return Object.values(state.counties)
    .filter((c) => c.holderId === id)
    .map((c) => c.id);
}

export function demesneLimit(state: GameState, id: string): number {
  const c = state.characters[id];
  if (!c) return 0;
  return (
    BALANCE.economy.demesneBase +
    Math.floor(skill(c, 'gestion') / BALANCE.economy.demesnePerGestion)
  );
}

export function isOverDemesne(state: GameState, id: string): boolean {
  return heldCounties(state, id).length > demesneLimit(state, id);
}

export function warSide(
  state: GameState,
  warId: string,
  rulerId: string,
): 'attacker' | 'defender' | undefined {
  const w = state.wars[warId];
  if (!w) return undefined;
  if (w.attackerId === rulerId || w.attackerAllies.includes(rulerId)) return 'attacker';
  if (w.defenderId === rulerId || w.defenderAllies.includes(rulerId)) return 'defender';
  return undefined;
}

export function atWar(state: GameState, a: string, b: string): boolean {
  for (const w of Object.values(state.wars)) {
    const sa = warSide(state, w.id, a);
    const sb = warSide(state, w.id, b);
    if (sa && sb && sa !== sb) return true;
  }
  return false;
}

export function allyKey(a: string, b: string): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

export function allied(state: GameState, a: string, b: string): boolean {
  return state.alliances.includes(allyKey(a, b));
}
