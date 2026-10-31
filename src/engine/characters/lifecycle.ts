/** Cycle de vie : santé, naissances, éducation, décès, succession. */
import { BALANCE } from '../../data/balance';
import { HEREDITARY_TRAITS, TRAITS, educationTrait } from '../../data/traits';
import { chronicle, notify, seasonOf, type Ctx } from '../context';
import { isIndependent } from '../realm';
import type { Character, GameState } from '../state';
import {
  addOpinion,
  addRandomPersonality,
  addTrait,
  ageOf,
  createCharacter,
  displayName,
  dynastyName,
  hasTrait,
  healthOf,
  heldCounties,
  livingChildren,
  removeTrait,
  siblingsOf,
  skill,
} from './index';

const C = BALANCE.characters;

export function deathChance(state: GameState, c: Character): number {
  const age = ageOf(state, c);
  if (age < 16) return C.childDeath;
  let p = C.deathBase;
  if (age > C.deathAgeStart) p += (age - C.deathAgeStart) * C.deathAgePerYear;
  const h = healthOf(c);
  if (h < C.deathHealthThreshold) p += C.deathLowHealth * (1 - h / C.deathHealthThreshold) * 2;
  return p;
}

export function birthChance(state: GameState, mother: Character, father: Character): number {
  if (!mother.alive || !father.alive || mother.imprisonedBy || father.imprisonedBy) return 0;
  const ma = ageOf(state, mother);
  const fa = ageOf(state, father);
  if (ma < C.adulthood || fa < C.adulthood || ma > C.womanFertileUntil || fa > 70) return 0;
  const kids = mother.childrenIds.filter((id) => father.childrenIds.includes(id)).length;
  if (kids >= C.maxChildren) return 0;
  let p = C.birthChance - Math.max(0, ma - 25) * C.birthAgeDecline;
  for (const t of [...mother.traits, ...father.traits]) p *= TRAITS[t]?.fertility ?? 1;
  p *= 1 - kids * 0.08;
  return Math.max(0, p);
}

/** Naissance d'un enfant (utilisée aussi par l'effet « naissance »). */
export function giveBirth(ctx: Ctx, mother: Character, father: Character): Character {
  const { state, rng } = ctx;
  const dynastyId = father.dynastyId ?? mother.dynastyId;
  const courtId = father.dynastyId === dynastyId ? father.courtId : mother.courtId;
  const child = createCharacter(ctx, {
    age: 0,
    dynastyId,
    courtId,
    fatherId: father.id,
    motherId: mother.id,
    skillBase: Math.round((avgSkill(mother) + avgSkill(father)) / 2) - 2,
    traits: [],
    personalityCount: 1,
    education: false,
  });
  child.birthTurn = state.turn;
  // Traits héréditaires.
  for (const t of HEREDITARY_TRAITS) {
    const carriers = [mother, father].filter((p) => p.traits.includes(t)).length;
    for (let i = 0; i < carriers; i++) if (rng.chance(C.hereditaryChance)) addTrait(child, t);
  }
  if (rng.chance(0.03)) addTrait(child, rng.pick(HEREDITARY_TRAITS));
  const isPlayerFamily = dynastyId === state.playerDynastyId;
  if (isPlayerFamily) {
    chronicle(
      state,
      `Naissance de ${child.name}, ${child.female ? 'fille' : 'fils'} de ${father.name} et ${mother.name}.`,
      'naissance',
    );
    notify(
      state,
      `${child.female ? 'Une fille' : 'Un fils'}, ${child.name}, est né${child.female ? 'e' : ''}.`,
    );
  }
  return child;
}

function avgSkill(c: Character): number {
  return (
    (c.skills.diplomatie + c.skills.guerre + c.skills.gestion + c.skills.ruse + c.skills.savoir) / 5
  );
}

/** Éducation à 16 ans selon l'éducateur et la compétence travaillée. */
export function educate(ctx: Ctx, child: Character): void {
  const { state, rng } = ctx;
  const focus =
    child.educationFocus ??
    rng.pick(['diplomatie', 'guerre', 'gestion', 'ruse', 'savoir'] as const);
  const educator = child.educatorId ? state.characters[child.educatorId] : undefined;
  let level = educator?.alive ? skill(educator, focus) : rng.int(3, 8);
  // Le chapelain qui éduque l'héritier.
  const seat = state.council.chapelain;
  const chap = seat.holderId ? state.characters[seat.holderId] : undefined;
  if (seat.task === 'eduquer' && seat.targetId === child.id && chap?.alive) {
    level += skill(chap, 'savoir') * BALANCE.council.educateBonus;
  }
  child.skills[focus] += Math.round(level * C.educationSkillGain);
  const p2 = level >= C.educationTier2Skill ? 0.5 + (level - C.educationTier2Skill) * 0.08 : 0.1;
  addTrait(child, educationTrait(focus, rng.chance(p2) ? 2 : 1));
  addRandomPersonality(rng, child, 2);
  child.educatorId = undefined;
  if (child.dynastyId === state.playerDynastyId) {
    const t = child.traits.find((x) => TRAITS[x]?.category === 'education');
    chronicle(
      state,
      `${child.name} atteint sa majorité, ${t ? TRAITS[t].name.toLowerCase() : 'sans éducation notable'}.`,
      'divers',
    );
  }
}

/** Santé, maladies, naissances, morts : appelée en fin de saison. */
export function seasonLife(ctx: Ctx): void {
  const { state, rng } = ctx;
  const winter = seasonOf(state.turn) === 3;
  const alive = Object.values(state.characters).filter((c) => c.alive);
  for (const c of alive) {
    const age = ageOf(state, c);
    // Maladies et blessures.
    if (!hasTrait(c, 'malade') && rng.chance(C.sicknessChance * (age > 50 ? 2 : 1))) {
      addTrait(c, 'malade');
      if (isPlayerFamily(state, c)) notify(state, `${c.name} tombe malade.`);
    } else if (hasTrait(c, 'malade') && rng.chance(C.recoverChance)) removeTrait(c, 'malade');
    if (hasTrait(c, 'blesse') && rng.chance(C.woundRecoverChance)) removeTrait(c, 'blesse');
    if (winter) {
      if (age > C.healthDecayAfter) c.health -= C.healthDecayPerYear;
      else if (c.health < 80) c.health += C.healthRegen;
    }
  }
  // Naissances.
  for (const c of alive) {
    if (!c.female || !c.spouseId) continue;
    const f = state.characters[c.spouseId];
    if (!f || f.female) continue;
    if (rng.chance(birthChance(state, c, f))) giveBirth(ctx, c, f);
  }
  // Majorité.
  for (const c of alive) {
    if (
      ageOf(state, c) === C.adulthood &&
      (state.turn - c.birthTurn) % 4 === 0 &&
      (state.turn - c.birthTurn) / 4 === C.adulthood
    ) {
      educate(ctx, c);
    }
  }
  // Décès.
  for (const c of alive) {
    if (!c.alive) continue;
    if (rng.chance(deathChance(state, c))) {
      const age = ageOf(state, c);
      const cause = hasTrait(c, 'malade')
        ? 'de maladie'
        : age > 55
          ? 'de vieillesse'
          : age < 16
            ? 'en bas âge'
            : 'subitement';
      killCharacter(ctx, c.id, cause);
    }
  }
}

export function isPlayerFamily(state: GameState, c: Character): boolean {
  return (
    c.dynastyId === state.playerDynastyId || c.id === state.characters[state.playerId]?.spouseId
  );
}

/** Mort d'un personnage, avec succession s'il tenait des terres. */
export function killCharacter(ctx: Ctx, id: string, cause: string): void {
  const { state } = ctx;
  const c = state.characters[id];
  if (!c || !c.alive) return;
  c.alive = false;
  c.deathTurn = state.turn;
  c.deathCause = cause;
  const spouse = c.spouseId ? state.characters[c.spouseId] : undefined;
  if (spouse) spouse.spouseId = undefined;
  if (isPlayerFamily(state, c) || id === state.playerId) {
    chronicle(
      state,
      `Mort de ${displayName(state, c)} ${cause}, à ${ageOf(state, c)} ans.`,
      'deces',
    );
    if (id !== state.playerId) notify(state, `${c.name} est mort${c.female ? 'e' : ''} ${cause}.`);
  }
  // Conseil.
  for (const seat of Object.values(state.council))
    if (seat.holderId === id) seat.holderId = undefined;
  // Commandants.
  for (const a of Object.values(state.armies)) {
    if (a.commanderId === id) a.commanderId = undefined;
    a.frontCommanders = a.frontCommanders.filter((x) => x !== id);
  }
  // Complots.
  for (const p of Object.values(state.plots))
    if (p.ownerId === id || p.targetId === id) delete state.plots[p.id];
  if (heldCounties(state, id).length || titlesOf(state, id).length) succession(ctx, id);
  else if (id === state.playerId) succession(ctx, id);
}

export function titlesOf(state: GameState, id: string): string[] {
  return [
    ...Object.values(state.kingdoms)
      .filter((k) => k.holderId === id)
      .map((k) => k.id),
    ...Object.values(state.duchies)
      .filter((d) => d.holderId === id)
      .map((d) => d.id),
  ];
}

/** Ordre de succession : enfants par âge, puis frères et sœurs et leurs enfants, puis la dynastie. */
export function heirsOf(state: GameState, c: Character): Character[] {
  const res: Character[] = [];
  const add = (x: Character) => x.alive && x.id !== c.id && !res.includes(x) && res.push(x);
  livingChildren(state, c).forEach(add);
  for (const k of c.childrenIds.map((id) => state.characters[id]).filter(Boolean))
    if (!k.alive) livingChildren(state, k).forEach(add);
  siblingsOf(state, c)
    .sort((a, b) => a.birthTurn - b.birthTurn)
    .forEach((s) => {
      add(s);
      livingChildren(state, s).forEach(add);
    });
  if (c.dynastyId)
    Object.values(state.characters)
      .filter((x) => x.alive && x.dynastyId === c.dynastyId)
      .sort((a, b) => a.birthTurn - b.birthTurn)
      .forEach(add);
  return res;
}

export function succession(ctx: Ctx, id: string): void {
  const { state, rng } = ctx;
  const dead = state.characters[id];
  const heirs = heirsOf(state, dead).filter((h) => !h.imprisonedBy || h.imprisonedBy === dead.id);
  const wasPlayer = id === state.playerId;
  const independent = !dead.liegeId;
  let heir = heirs[0];
  if (!heir) {
    if (wasPlayer) {
      state.gameOver = {
        reason: `La lignée s'éteint avec ${displayName(state, dead)} : aucun héritier titré.`,
        score: { renown: 0, titles: 0, years: 0, total: 0 },
      };
      chronicle(state, `Avec ${dead.name} s'éteint la lignée.`, 'succession');
      state.phase = 'fin';
      // Les terres reviennent à un nouveau seigneur.
    }
    // Un parent éloigné, d'une autre maison, recueille l'héritage.
    heir = createCharacter(ctx, {
      age: rng.int(20, 40),
      dynastyId: null,
      courtId: undefined,
      skillBase: 7,
    });
    heir.dynastyId = newMinorDynasty(ctx, heir);
  }
  const counties = Object.values(state.counties).filter((c) => c.holderId === id);
  const heirWasLanded = Object.values(state.counties).some((c) => c.holderId === heir.id);
  const titles = titlesOf(state, id);
  const children = livingChildren(state, dead).filter((k) => k.id !== heir.id);
  const law = dead.successionLaw;

  // Titre principal et capitale à l'héritier.
  for (const t of titles) {
    if (state.kingdoms[t]) state.kingdoms[t].holderId = heir.id;
    if (state.duchies[t]) state.duchies[t].holderId = heir.id;
  }
  const sorted = counties.sort((a, b) => b.development - a.development);
  const capital =
    sorted.find((c) => titles.some((t) => state.duchies[t]?.counties.includes(c.id))) ?? sorted[0];
  const shares = new Map<string, string>();
  if (law === 'partage' && children.length && heirIsChild(dead, heir)) {
    const others = sorted.filter((c) => c !== capital);
    // L'aîné garde la capitale et la moitié des autres comtés ; le reste est partagé.
    const keep = Math.ceil(others.length / 2);
    others.forEach((c, i) => {
      if (i < keep) shares.set(c.id, heir.id);
      else shares.set(c.id, children[(i - keep) % children.length].id);
    });
  }
  for (const c of counties) {
    const to = shares.get(c.id) ?? heir.id;
    c.holderId = to;
    c.siege = undefined;
  }
  // Statut féodal de l'héritier et des cadets.
  const liege = dead.liegeId;
  // Un héritier déjà titré garde son rang ; sinon il prend la place du défunt.
  if (!heirWasLanded) heir.liegeId = liege;
  if (heir.liegeId === heir.id) heir.liegeId = undefined;
  heir.courtId = heir.id;
  heir.successionLaw = law;
  heir.imprisonedBy = undefined;
  heir.claims = [...new Set([...heir.claims, ...dead.claims])];
  for (const [, to] of shares) {
    if (to === heir.id) continue;
    const k = state.characters[to];
    k.liegeId = independent ? heir.id : liege;
    if (k.liegeId === k.id) k.liegeId = undefined;
    k.courtId = k.id;
    // Pas de vassalité à deux niveaux : les vassaux du cadet passent à l'héritier.
    for (const v of Object.values(state.characters))
      if (v.alive && v.liegeId === k.id) v.liegeId = k.liegeId;
    addOpinion(state, to, heir.id, 'Partage de l’héritage', -10, 16);
  }
  if (!heir.liegeId) heir.gold += dead.gold;
  heir.prestige += dead.prestige * 0.5;
  heir.piety += dead.piety * 0.5;
  // Vassaux, cour, armées, guerres.
  for (const v of Object.values(state.characters)) {
    if (!v.alive) continue;
    if (v.liegeId === id) {
      v.liegeId = heir.id;
      addOpinion(state, v.id, heir.id, 'Nouveau suzerain', BALANCE.opinion.newLiege, 12);
    }
    if (v.courtId === id) v.courtId = heir.id;
  }
  if (state.standing[id]) {
    state.standing[heir.id] = state.standing[id];
    delete state.standing[id];
  }
  for (const a of Object.values(state.armies)) if (a.ownerId === id) a.ownerId = heir.id;
  for (const w of Object.values(state.wars)) {
    if (w.attackerId === id) w.attackerId = heir.id;
    if (w.defenderId === id) w.defenderId = heir.id;
    w.attackerAllies = w.attackerAllies.map((x) => (x === id ? heir.id : x));
    w.defenderAllies = w.defenderAllies.map((x) => (x === id ? heir.id : x));
  }
  state.alliances = state.alliances
    .map((k) => k.split('|').map((x) => (x === id ? heir.id : x)))
    .filter(([a, b]) => a !== b)
    .map(([a, b]) => (a < b ? `${a}|${b}` : `${b}|${a}`));
  for (const [k, end] of Object.entries(state.truces)) {
    if (k.includes(id)) {
      const [a, b] = k.split('|').map((x) => (x === id ? heir.id : x));
      delete state.truces[k];
      if (a !== b) state.truces[a < b ? `${a}|${b}` : `${b}|${a}`] = end;
    }
  }
  if (wasPlayer && !state.gameOver) {
    state.playerId = heir.id;
    state.playerDynastyId = heir.dynastyId ?? state.playerDynastyId;
    chronicle(
      state,
      `${heir.name} succède à ${dead.name}${shares.size && [...shares.values()].some((v) => v !== heir.id) ? ' ; l’héritage est partagé entre les enfants' : ''}.`,
      'succession',
    );
    notify(state, `${dead.name} est mort. Vous incarnez désormais ${heir.name}.`);
    // L'héritier choisit son conseil parmi l'ancien.
    for (const seat of Object.values(state.council))
      if (seat.holderId === heir.id) seat.holderId = undefined;
  } else if (
    independent &&
    isIndependent(state, heir.id) &&
    heir.dynastyId === state.playerDynastyId
  ) {
    chronicle(state, `${heir.name} hérite des terres de ${dead.name}.`, 'succession');
  }
}

function heirIsChild(dead: Character, heir: Character): boolean {
  return dead.childrenIds.includes(heir.id);
}

export function newMinorDynasty(ctx: Ctx, founder: Character): string {
  const { state, rng } = ctx;
  const used = new Set(Object.values(state.dynasties).map((d) => d.name));
  const id = `y${++state.nextId}`;
  const name = dynastyName(rng, used);
  state.dynasties[id] = { id, name, renown: 0, seed: rng.seed(), founderId: founder.id };
  return id;
}

/** Retire les personnages morts sans importance pour alléger la sauvegarde. */
export function pruneCharacters(state: GameState): void {
  const keepDynasty = state.playerDynastyId;
  for (const c of Object.values(state.characters)) {
    if (c.alive || c.dynastyId === keepDynasty) continue;
    if ((c.deathTurn ?? 0) > state.turn - 40) continue;
    const hasLivingChild = c.childrenIds.some((k) => state.characters[k]?.alive);
    if (hasLivingChild) continue;
    // Gardé s'il est parent d'un membre de la dynastie du joueur.
    if (c.childrenIds.some((k) => state.characters[k]?.dynastyId === keepDynasty)) continue;
    if (c.spouseId && state.characters[c.spouseId]?.dynastyId === keepDynasty) continue;
    delete state.characters[c.id];
  }
}
