/**
 * Entourage : recruter à la cour (candidats de passage), rallier un prisonnier, accueillir des
 * pupilles, débaucher chez un rival, congédier ; et le trésorier qui évite le rouge.
 */
import { BALANCE } from '../../data/balance';
import { ARCHETYPES } from '../../data/entourage';
import {
  addOpinion,
  addTrait,
  createCharacter,
  displayName,
  hasTrait,
  heldCounties,
  isAdult,
  isCloseFamily,
  livingChildren,
  opinion,
  skill,
  topLiege,
} from '../characters';
import { chronicle, clamp, notify, type Ctx } from '../context';
import type { Acceptance, Factor } from '../diplomacy';
import { queueEvent } from '../events/engine';
import { economyOf, independentRulers, vassalsOf } from '../realm';
import type { Candidate, Character, GameState, TaxLevel } from '../state';
import { courtierFee, courtierValue, courtPayroll, courtRoster, bestSkill } from './roster';

export * from './roster';

const E = BALANCE.entourage;
const T = BALANCE.treasury;

// ---------------------------------------------------------------------------
// Utilitaires
// ---------------------------------------------------------------------------

function finish(factors: Factor[], blocked?: string): Acceptance {
  const score = Math.round(factors.reduce((s, f) => s + f.value, 0));
  return {
    score,
    factors: factors.map((f) => ({ ...f, value: Math.round(f.value) })),
    accept: !blocked && score >= 0,
    blocked,
  };
}

/** Probabilité d'accepter à partir d'un score (50 % à 0). */
export const chanceOf = (score: number): number => clamp(0.5 + score / 100, 0.05, 0.95);

const pl = (state: GameState) => state.characters[state.playerId];

// ---------------------------------------------------------------------------
// Candidats de passage
// ---------------------------------------------------------------------------

/** Chaque printemps, de nouveaux visages se présentent à la cour ; les anciens repartent. */
export function generateCandidates(ctx: Ctx): void {
  const { state, rng } = ctx;
  const p = pl(state);
  if (!p) return;
  for (const cand of state.candidates ?? []) {
    const c = state.characters[cand.id];
    if (c?.visitor) delete state.characters[cand.id];
  }
  const C = E.candidates;
  const n = Math.min(C.max, C.base + Math.floor(p.prestige / C.perPrestige));
  state.candidates = [];
  for (let i = 0; i < n; i++) {
    const a = rng.weighted(ARCHETYPES, (x) => x.weight)!;
    const female = rng.chance(0.4);
    const c = createCharacter(ctx, {
      female,
      age: rng.int(a.age[0], a.age[1]),
      dynastyId: null,
      skillBase: 6,
      traits: [],
      personalityCount: 1,
    });
    c.skills[a.skill] = clamp(c.skills[a.skill] + rng.int(a.boost[0], a.boost[1]), 0, 20);
    addTrait(c, rng.pick(a.traits));
    c.visitor = true;
    state.candidates.push({
      id: c.id,
      fee: courtierFee(c),
      profile: a.label[female ? 1 : 0],
      origin: rng.pick(a.origins),
      until: state.turn + C.expireSeasons,
    });
  }
}

export function candidateAcceptance(state: GameState, cand: Candidate): Acceptance {
  const c = state.characters[cand.id];
  const p = pl(state);
  const A = E.accept;
  const f: Factor[] = [{ label: 'Une place à la cour', value: A.base }];
  f.push({
    label: 'Votre prestige',
    value: Math.min(A.prestigeCap, Math.max(0, p.prestige) / A.prestigeDiv),
  });
  f.push({
    label: `Votre Diplomatie (${skill(p, 'diplomatie')})`,
    value: (skill(p, 'diplomatie') - 10) * A.diploPerPoint,
  });
  const best = c ? bestSkill(c) : 0;
  if (best >= A.fameFrom)
    f.push({
      label: 'Talent recherché par d’autres cours',
      value: -(best - A.fameFrom + 1) * A.famePerPoint,
    });
  let blocked: string | undefined;
  if (!c?.alive) blocked = 'Parti ailleurs';
  else if (p.gold < cand.fee) blocked = `Il faut ${cand.fee} or`;
  return finish(f, blocked);
}

/** Engage un candidat (la prime est payée, il rejoint la cour). Renvoie vrai s'il accepte. */
export function inviteCandidate(ctx: Ctx, candId: string): boolean {
  const { state } = ctx;
  const cand = (state.candidates ?? []).find((x) => x.id === candId);
  const c = cand ? state.characters[cand.id] : undefined;
  if (!cand || !c) return false;
  const acc = candidateAcceptance(state, cand);
  if (acc.blocked) return false;
  state.candidates = (state.candidates ?? []).filter((x) => x.id !== candId);
  if (!acc.accept) {
    notify(state, `${c.name} décline votre offre : votre cour ne l’attire pas assez.`);
    delete state.characters[c.id];
    return false;
  }
  pl(state).gold -= cand.fee;
  c.visitor = undefined;
  c.courtId = state.playerId;
  addOpinion(state, c.id, state.playerId, 'Engagé à la cour', 15, 0);
  notify(state, `${c.name} (${cand.profile.toLowerCase()}) rejoint votre cour.`);
  chronicle(state, `${c.name} rejoint la cour.`, 'divers');
  return true;
}

// ---------------------------------------------------------------------------
// Congédier
// ---------------------------------------------------------------------------

export function dismissCourtier(ctx: Ctx, id: string, reason = 'congédié'): boolean {
  const { state, rng } = ctx;
  const c = state.characters[id];
  if (!c?.alive || c.courtId !== state.playerId || c.dynastyId === state.playerDynastyId)
    return false;
  if (c.id === pl(state).spouseId || c.fosterOf || c.hostageOf) return false;
  for (const seat of Object.values(state.council))
    if (seat.holderId === id) seat.holderId = undefined;
  const others = independentRulers(state).filter((r) => r !== state.playerId);
  c.courtId = others.length ? rng.pick(others) : c.id;
  addOpinion(
    state,
    c.id,
    state.playerId,
    'Congédié',
    reason === 'congédié' ? E.leaveOpinion : E.arrearsOpinion,
    16,
  );
  return true;
}

// ---------------------------------------------------------------------------
// Rallier un prisonnier
// ---------------------------------------------------------------------------

export function rallyAcceptance(state: GameState, prisonerId: string): Acceptance {
  const c = state.characters[prisonerId];
  const p = pl(state);
  const R = E.rally;
  const f: Factor[] = [{ label: 'Une offre de service', value: R.base }];
  if (c) {
    f.push({
      label: `Opinion de ${c.name} envers vous`,
      value: opinion(state, c.id, p.id) * R.opinionFactor,
    });
    const t: [string, string, number][] = [
      ['lache', 'Lâche', 20],
      ['avare', 'Avare', 15],
      ['ambitieux', 'Ambitieux', 10],
      ['juste', 'Juste', -15],
      ['courageux', 'Courageux', -15],
      ['satisfait', 'Satisfait', -10],
    ];
    for (const [id, label, v] of t)
      if (hasTrait(c, id)) f.push({ label: `Trait : ${label}`, value: v });
  }
  f.push({
    label: `Votre Diplomatie (${skill(p, 'diplomatie')})`,
    value: (skill(p, 'diplomatie') - 10) * 1.5,
  });
  let blocked: string | undefined;
  if (!c?.alive || c.imprisonedBy !== p.id) blocked = 'Pas votre prisonnier';
  else if (heldCounties(state, c.id).length) blocked = 'Un seigneur titré ne se rallie pas';
  else if (c.rallyTried) blocked = 'Déjà tenté';
  else if (p.gold < R.fee) blocked = `Il faut ${R.fee} or`;
  const acc = finish(f, blocked);
  return { ...acc, accept: !blocked && acc.score >= 0 };
}

export function rallyPrisoner(ctx: Ctx, id: string): boolean {
  const { state, rng } = ctx;
  const acc = rallyAcceptance(state, id);
  const c = state.characters[id];
  if (acc.blocked || !c) return false;
  const R = E.rally;
  c.rallyTried = true;
  if (!rng.chance(chanceOf(acc.score))) {
    addOpinion(state, c.id, state.playerId, 'Offre insultante', R.failOpinion, 20);
    notify(state, `${c.name} refuse de vous servir.`);
    return false;
  }
  const lord = topLiege(state, c.id);
  pl(state).gold -= R.fee;
  c.imprisonedBy = undefined;
  c.courtId = state.playerId;
  c.liegeId = undefined;
  for (const w of Object.values(state.wars)) w.captured = w.captured.filter((x) => x !== c.id);
  addOpinion(state, c.id, state.playerId, 'Rallié à votre cause', 25, 0);
  if (lord && lord !== state.playerId)
    addOpinion(state, lord, state.playerId, 'A rallié mon commandant', R.formerLordOpinion, 20);
  notify(state, `${c.name} se rallie à votre cause et entre à votre cour.`);
  chronicle(state, `${displayName(state, c)}, prisonnier, se rallie à la maison.`, 'divers');
  return true;
}

// ---------------------------------------------------------------------------
// Pupilles de vassaux
// ---------------------------------------------------------------------------

/** Parent d'un pupille qui est vassal du joueur (sinon père, puis mère). */
function wardParent(state: GameState, k: Character | undefined): Character | undefined {
  if (!k) return undefined;
  const parents = [k.fatherId, k.motherId]
    .map((id) => (id ? state.characters[id] : undefined))
    .filter((x): x is Character => !!x);
  return parents.find((x) => x.alive && x.liegeId === state.playerId) ?? parents[0];
}

/** Enfants mineurs de vos vassaux directs qui pourraient être confiés à votre cour. */
export function wardCandidates(state: GameState): { vassal: Character; child: Character }[] {
  const out: { vassal: Character; child: Character }[] = [];
  for (const vid of vassalsOf(state, state.playerId)) {
    const v = state.characters[vid];
    if (!v?.alive || v.liegeId !== state.playerId) continue;
    for (const k of livingChildren(state, v))
      if (!isAdult(state, k) && !k.fosterOf && k.courtId !== state.playerId)
        out.push({ vassal: v, child: k });
  }
  return out;
}

/** Pupilles actuellement à votre cour. */
export function wardsAtCourt(state: GameState): Character[] {
  return Object.values(state.characters).filter(
    (c) => c.alive && c.fosterOf === state.playerId && !isAdult(state, c),
  );
}

export function wardAcceptance(state: GameState, childId: string): Acceptance {
  const k = state.characters[childId];
  const holder = wardParent(state, k);
  const W = E.ward;
  const p = pl(state);
  const f: Factor[] = [{ label: 'Confier son enfant', value: W.base }];
  let blocked: string | undefined;
  if (!k?.alive || !holder?.alive || holder.liegeId !== p.id) blocked = 'Enfant introuvable';
  else if (isAdult(state, k)) blocked = 'Déjà adulte';
  else if (k.fosterOf || k.courtId === p.id) blocked = 'Déjà à votre cour';
  else if (holder.inFaction) blocked = 'Il conteste votre autorité';
  if (holder) {
    f.push({
      label: `Opinion de ${holder.name}`,
      value: opinion(state, holder.id, p.id) * W.opinionFactor,
    });
    if (hasTrait(holder, 'ambitieux'))
      f.push({ label: 'Trait : Ambitieux (veut du poids à la cour)', value: 6 });
  }
  f.push({
    label: 'Votre prestige',
    value: Math.min(W.prestigeCap, Math.max(0, p.prestige) / W.prestigeDiv),
  });
  return finish(f, blocked);
}

export function requestWard(ctx: Ctx, childId: string): boolean {
  const { state } = ctx;
  const acc = wardAcceptance(state, childId);
  const k = state.characters[childId];
  if (acc.blocked || !k) return false;
  const holder = wardParent(state, k);
  if (!acc.accept) {
    if (holder) addOpinion(state, holder.id, state.playerId, 'Demande refusée', -5, 8);
    notify(state, `${holder?.name ?? 'Son parent'} refuse de vous confier ${k.name}.`);
    return false;
  }
  k.fosterOf = state.playerId;
  k.courtId = state.playerId;
  addOpinion(state, k.id, state.playerId, 'Pupille de la cour', 10, 0);
  notify(
    state,
    `${k.name}, ${k.female ? 'fille' : 'fils'} de ${holder?.name ?? 'votre vassal'}, grandit à votre cour.`,
  );
  return true;
}

/** Renvoi d'un pupille chez les siens, ou maintien à la cour. */
export function settleWard(state: GameState, id: string, action: 'retour' | 'garder'): void {
  const k = state.characters[id];
  if (!k?.alive || k.fosterOf !== state.playerId) return;
  const home = wardParent(state, k);
  const W = E.ward;
  k.fosterOf = undefined;
  if (action === 'retour') {
    k.courtId = home?.courtId ?? home?.id ?? k.id;
    if (home)
      addOpinion(state, home.id, state.playerId, 'Pupille bien éduqué', W.returnOpinion, 24);
    addOpinion(state, k.id, state.playerId, 'Éduqué à la cour', 20, 80);
    notify(
      state,
      `${k.name} retourne chez ${home?.name ?? 'les siens'}, instruit${k.female ? 'e' : ''} à votre cour.`,
    );
  } else {
    k.courtId = state.playerId;
    if (home)
      addOpinion(state, home.id, state.playerId, 'Enfant retenu à la cour', W.keepOpinion, 24);
    addOpinion(state, k.id, state.playerId, 'Pupille loyal', W.keepLoyalty, 0);
    notify(state, `${k.name} reste à votre cour comme conseiller${k.female ? 'ère' : ''}.`);
  }
}

/** Un pupille qui atteint la majorité demande à votre décision son avenir. */
function seasonWards(ctx: Ctx): void {
  const { state } = ctx;
  for (const k of Object.values(state.characters)) {
    if (!k.alive || k.fosterOf !== state.playerId || !isAdult(state, k)) continue;
    if (state.pendingEvents.some((e) => e.eventId === `sys_pupille_${k.id}`)) continue;
    const home = wardParent(state, k);
    queueEvent(
      ctx,
      {
        id: `sys_pupille_${k.id}`,
        titre: 'Un pupille devient adulte',
        texte: `${k.name} a atteint ses seize ans : l’éducation reçue à votre cour s’achève. ${home?.name ?? 'Sa famille'} attend son retour, mais ${k.female ? 'elle' : 'il'} vous est attaché${k.female ? 'e' : ''}.`,
        categorie: 'systeme',
        declencheur: { type: 'suite' },
        choix: [
          {
            libelle: `Le renvoyer chez ${home?.name ?? 'les siens'}, avec honneur.`,
            effets: [{ pupille: { id: k.id, action: 'retour' } }],
          },
          {
            libelle: 'Le garder à la cour comme conseiller.',
            effets: [{ pupille: { id: k.id, action: 'garder' } }],
          },
        ],
      },
      home ? { pupille: k.id, parent: home.id } : { pupille: k.id },
      true,
    );
  }
}

// ---------------------------------------------------------------------------
// Débaucher
// ---------------------------------------------------------------------------

/** Courtisans des cours rivales qu'on pourrait tenter de débaucher. */
export function poachTargets(state: GameState): { ruler: Character; members: Character[] }[] {
  const out: { ruler: Character; members: Character[] }[] = [];
  for (const rid of independentRulers(state)) {
    if (rid === state.playerId) continue;
    const ruler = state.characters[rid];
    const members = Object.values(state.characters).filter(
      (c) =>
        c.alive &&
        c.courtId === rid &&
        c.id !== rid &&
        !c.visitor &&
        !c.imprisonedBy &&
        !c.hostageOf &&
        isAdult(state, c) &&
        !heldCounties(state, c.id).length &&
        !isCloseFamily(state, ruler, c) &&
        (!ruler.dynastyId || c.dynastyId !== ruler.dynastyId),
    );
    if (members.length)
      out.push({ ruler, members: members.sort((a, b) => courtierValue(b) - courtierValue(a)) });
  }
  return out;
}

export function poachAcceptance(state: GameState, targetId: string): Acceptance {
  const t = state.characters[targetId];
  const p = pl(state);
  const P = E.poach;
  const ruler = t ? state.characters[t.courtId] : undefined;
  const f: Factor[] = [{ label: 'Quitter son seigneur', value: P.base }];
  let blocked: string | undefined;
  if (!t?.alive || !ruler) blocked = 'Introuvable';
  else if (ruler.id === p.id) blocked = 'Déjà à votre cour';
  else if (t.courtId === t.id || heldCounties(state, ruler.id).length === 0)
    blocked = 'Sans seigneur';
  else if (!isAdult(state, t)) blocked = 'Trop jeune';
  else if (isCloseFamily(state, ruler, t)) blocked = 'Parent de son souverain';
  else if (heldCounties(state, t.id).length) blocked = 'Seigneur titré';
  else if (t.imprisonedBy || t.hostageOf) blocked = 'Prisonnier';
  const fee = t ? courtierFee(t) : 0;
  if (!blocked && p.gold < fee) blocked = `Il faut ${fee} or`;
  if (t && ruler) {
    f.push({
      label: `Opinion de ${t.name} envers ${ruler.name}`,
      value: -opinion(state, t.id, ruler.id) * P.opinionFactor,
    });
    if (hasTrait(t, 'ambitieux')) f.push({ label: 'Trait : Ambitieux', value: P.ambitieux });
    if (hasTrait(t, 'avare'))
      f.push({ label: 'Trait : Avare (la prime le tente)', value: P.avare });
    if (hasTrait(t, 'lache')) f.push({ label: 'Trait : Lâche', value: P.lache });
    if (
      ruler.id !== p.id &&
      Object.values(state.alliances).length &&
      state.alliances.some((k) => k.split('|').includes(ruler.id) && k.split('|').includes(p.id))
    )
      f.push({ label: 'Allié de son seigneur', value: -P.allyPenalty });
    if (t.friends.includes(ruler.id))
      f.push({ label: 'Ami de son seigneur', value: -P.friendPenalty });
  }
  f.push({
    label: 'Votre prestige',
    value: Math.min(P.prestigeCap, Math.max(0, p.prestige) / P.prestigeDiv),
  });
  f.push({
    label: `Votre Diplomatie (${skill(p, 'diplomatie')})`,
    value: (skill(p, 'diplomatie') - 10) * P.diploPerPoint,
  });
  const acc = finish(f, blocked);
  return acc;
}

export function poachCourtier(ctx: Ctx, targetId: string): boolean {
  const { state, rng } = ctx;
  const acc = poachAcceptance(state, targetId);
  const t = state.characters[targetId];
  if (acc.blocked || !t) return false;
  const P = E.poach;
  const ruler = state.characters[t.courtId];
  const p = pl(state);
  if (!rng.chance(chanceOf(acc.score))) {
    addOpinion(state, ruler.id, p.id, 'Tentative de débauchage', P.failLordOpinion, 12);
    p.prestige += P.failPrestige;
    notify(state, `${t.name} décline votre offre ; ${ruler.name} en est informé.`);
    return false;
  }
  p.gold -= courtierFee(t);
  t.courtId = p.id;
  addOpinion(state, t.id, p.id, 'Engagé à la cour', 15, 0);
  addOpinion(
    state,
    ruler.id,
    p.id,
    'A débauché mon courtisan',
    P.lordOpinion,
    P.lordOpinionSeasons,
  );
  notify(state, `${t.name} quitte la cour de ${ruler.name} pour la vôtre.`);
  chronicle(
    state,
    `${displayName(state, t)} passe de la cour de ${ruler.name} à celle de la maison.`,
    'divers',
  );
  return true;
}

// ---------------------------------------------------------------------------
// Saison : candidats, trésorier, impayés
// ---------------------------------------------------------------------------

const TAX_UP: Record<TaxLevel, TaxLevel> = {
  faible: 'normal',
  normal: 'eleve',
  eleve: 'eleve',
  ecrasant: 'ecrasant',
};

/** Or prévu à la saison suivante. */
function projected(state: GameState): number {
  const p = pl(state);
  return p.gold + economyOf(state, p.id).goldNet;
}

/** Retire le courtisan payé le moins précieux. Renvoie son nom, ou undefined. */
function releaseCheapest(ctx: Ctx, reason: 'congédié' | 'impayé'): string | undefined {
  const paid = courtPayroll(ctx.state, ctx.state.playerId).paid;
  const worst = [...paid].sort((a, b) => courtierValue(a.c) - courtierValue(b.c))[0];
  if (!worst) return undefined;
  const name = worst.c.name;
  return dismissCourtier(ctx, worst.c.id, reason) ? name : undefined;
}

/**
 * Trésorier prudent : si l'or prévu passe sous la réserve, il monte les impôts des comtés
 * contents, puis laisse partir le courtisan payé le moins utile. Une action par saison.
 */
function prudentTreasury(ctx: Ctx): void {
  const { state } = ctx;
  if (projected(state) >= T.reserve) return;
  const own = Object.values(state.counties)
    .filter((c) => c.holderId === state.playerId && !c.occupation)
    .filter(
      (c) =>
        (c.contentment ?? BALANCE.local.contentmentStart) >= T.taxMinContentment &&
        (c.tax ?? 'normal') !== 'eleve' &&
        c.tax !== 'ecrasant',
    )
    .sort((a, b) => (b.contentment ?? 0) - (a.contentment ?? 0))
    .slice(0, T.taxStepCounties);
  if (own.length) {
    for (const c of own) c.tax = TAX_UP[c.tax ?? 'normal'];
    notify(
      state,
      `Le trésorier relève les impôts dans ${own.length} comté(s) : le trésor allait passer dans le rouge.`,
    );
    if (projected(state) >= T.reserve) return;
  }
  const gone = releaseCheapest(ctx, 'congédié');
  if (gone)
    notify(state, `Faute de moyens, ${gone} quitte la cour (le trésorier a réduit les dépenses).`);
}

export function seasonEntourage(ctx: Ctx): void {
  const { state } = ctx;
  const p = pl(state);
  if (!p?.alive || state.gameOver) return;
  // Chaque printemps, de nouveaux candidats ; les anciens repartent.
  if (state.turn % 4 === 0 || !(state.candidates ?? []).length) generateCandidates(ctx);
  else {
    const stale = (state.candidates ?? []).filter((c) => c.until <= state.turn);
    for (const c of stale) if (state.characters[c.id]?.visitor) delete state.characters[c.id];
    state.candidates = (state.candidates ?? []).filter((c) => c.until > state.turn);
  }
  seasonWards(ctx);
  // Impayés : un courtisan payé part chaque saison tant que le trésor est négatif.
  if (p.gold < 0 && courtPayroll(state, p.id).paid.length) {
    const gone = releaseCheapest(ctx, 'impayé');
    if (gone) notify(state, `Impayé, ${gone} quitte la cour.`);
  }
  if ((state.treasury ?? 'prudent') === 'prudent') prudentTreasury(ctx);
}

/** Courtisans extérieurs au service d'un souverain, du plus au moins précieux. */
export function courtOf(state: GameState, rulerId: string): Character[] {
  return courtRoster(state, rulerId).map((e) => e.c);
}
