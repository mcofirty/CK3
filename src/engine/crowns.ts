/**
 * Couronnes et maisons : unions personnelles (deux couronnes sur une tête, puis fusion),
 * droits dynastiques transmis par le sang (revendications, prétendants, guerre de succession),
 * clauses de mariage, protection (vassalité par la famille), pactes de famille et successoraux.
 */
import { BALANCE } from '../data/balance';
import { TRAITS } from '../data/traits';
import {
  addOpinion,
  ageOf,
  allied,
  allyKey,
  atWar,
  createCharacter,
  displayName,
  isAdult,
  livingChildren,
  opinion,
  topLiege,
} from './characters';
import { chronicle, clamp, newId, notify, worldNews, type Ctx } from './context';
import type { Acceptance, Factor } from './diplomacy';
import { contentmentOf } from './economy/local';
import { backedByGrandees, influenceFactor } from './influence';
import type { EventDef } from './events/types';
import {
  capitalOf,
  countyRuler,
  ensureCapitals,
  independentRulers,
  isIndependent,
  realmCounties,
  realmName,
} from './realm';
import type { Character, County, GameState, PersonalUnion } from './state';
import { militaryStrength, transferCounty, warsOf } from './war';

const K = BALANCE.crowns;

function finish(factors: Factor[], blocked?: string): Acceptance {
  const score = Math.round(factors.reduce((s, x) => s + x.value, 0));
  return {
    score,
    factors: factors.map((x) => ({ ...x, value: Math.round(x.value) })),
    accept: !blocked && score >= BALANCE.diplomacy.acceptThreshold,
    blocked,
  };
}

function traitFactors(c: Character | undefined): Factor[] {
  const res: Factor[] = [];
  for (const t of c?.traits ?? []) {
    const v = (BALANCE.diplomacy.traitModifiers as Record<string, number>)[t];
    if (v) res.push({ label: `Trait : ${TRAITS[t].name}`, value: v });
  }
  return res;
}

/** Événement généré (sans passer par le moteur d'événements, pour éviter les cycles). */
function pushEvent(state: GameState, def: Omit<EventDef, 'declencheur' | 'categorie'>, scope = {}) {
  const full: EventDef = { categorie: 'systeme', declencheur: { type: 'suite' }, poids: 0, ...def };
  if (state.pendingEvents.some((e) => e.eventId === full.id)) return;
  state.pendingEvents.push({ uid: newId(state, 'e'), eventId: full.id, scope, inline: full });
}

// ---------------------------------------------------------------------------
// Liens de famille entre souverains
// ---------------------------------------------------------------------------

/** Les deux souverains sont-ils liés par le sang ou le mariage (famille proche) ? */
export function familyTie(state: GameState, a: string, b: string): boolean {
  const A = state.characters[a];
  const B = state.characters[b];
  if (!A || !B) return false;
  const kin = (x: Character) => {
    const ids = new Set<string>([x.id]);
    if (x.spouseId) ids.add(x.spouseId);
    for (const id of [x.fatherId, x.motherId, ...x.childrenIds]) if (id) ids.add(id);
    for (const k of x.childrenIds) {
      const c = state.characters[k];
      if (c?.spouseId) ids.add(c.spouseId);
    }
    return ids;
  };
  const ka = kin(A);
  return [...kin(B)].some((id) => ka.has(id));
}

// ---------------------------------------------------------------------------
// Unions personnelles
// ---------------------------------------------------------------------------

export const unionsOf = (state: GameState, rulerId: string): PersonalUnion[] =>
  (state.unions ?? []).filter((u) => u.rulerId === rulerId);

/** Union dont fait partie ce comté (s'il relève toujours du même souverain). */
export function unionOfCounty(state: GameState, c: County): PersonalUnion | undefined {
  return (state.unions ?? []).find(
    (u) => u.counties.includes(c.id) && countyRuler(state, c) === u.rulerId,
  );
}

/**
 * Comté d'une couronne où le souverain ne réside pas : sa capitale est dans l'autre royaume
 * de l'union. Renvoie le facteur d'éloignement (0 si présent, 1 normal, réduit si privilèges).
 */
export function distantFactor(state: GameState, c: County): number {
  const u = unionOfCounty(state, c);
  if (!u) return 0;
  const cap = capitalOf(state, u.rulerId);
  if (cap && u.counties.includes(cap.id)) {
    // Le souverain réside dans la couronne héritée : c'est l'ancien royaume qui est délaissé.
    return c.id === cap.id || u.counties.includes(c.id) ? 0 : 1;
  }
  return u.privileges === 'confirmes' ? K.confirmedDistantFactor : 1;
}

/** Saisons de règne commun nécessaires avant la fusion. */
export function fuseDelay(u: PersonalUnion): number {
  return (
    K.fuseSeasons +
    (u.privileges === 'confirmes' ? K.confirmedFuseExtra : 0) -
    (u.privileges === 'imposes' ? K.imposedFuseReduce : 0)
  );
}

export function canFuse(
  state: GameState,
  rulerId: string,
  unionId: string,
): { ok: boolean; reason?: string } {
  const u = (state.unions ?? []).find((x) => x.id === unionId && x.rulerId === rulerId);
  if (!u) return { ok: false, reason: 'Union introuvable' };
  const left = fuseDelay(u) - (state.turn - u.since);
  if (left > 0) return { ok: false, reason: `Encore ${Math.ceil(left / 4)} an(s) de règne commun` };
  if (warsOf(state, rulerId).length) return { ok: false, reason: 'Pas pendant une guerre' };
  if (state.characters[rulerId].prestige < K.fuseCost)
    return { ok: false, reason: `Il faut ${K.fuseCost} prestige` };
  return { ok: true };
}

/** Fond les deux couronnes en un seul royaume. */
export function fuseCrowns(state: GameState, rulerId: string, unionId: string): boolean {
  if (!canFuse(state, rulerId, unionId).ok) return false;
  const u = state.unions!.find((x) => x.id === unionId)!;
  const r = state.characters[rulerId];
  r.prestige -= K.fuseCost;
  if (r.dynastyId) state.dynasties[r.dynastyId].renown += K.fuseRenown;
  const vassals = new Set(
    u.counties
      .map((id) => state.counties[id]?.holderId)
      .filter((h): h is string => !!h && h !== rulerId),
  );
  for (const v of vassals)
    addOpinion(state, v, rulerId, 'Couronnes fondues', K.fuseVassalOpinion, 16);
  state.unions = state.unions!.filter((x) => x.id !== unionId);
  const text = `${displayName(state, r)} fond la couronne de ${u.name} dans son royaume.`;
  if (rulerId === state.playerId) chronicle(state, text, 'titre');
  else worldNews(state, text, 'titre', rulerId);
  return true;
}

/** Crée une union : `counties` (couronne héritée) passent sous `rulerId` sans se fondre. */
export function createUnion(
  state: GameState,
  rulerId: string,
  name: string,
  counties: string[],
): PersonalUnion | undefined {
  if (!counties.length) return undefined;
  const u: PersonalUnion = {
    id: newId(state, 'u'),
    rulerId,
    name,
    counties: [...counties],
    since: state.turn,
  };
  (state.unions ??= []).push(u);
  const r = state.characters[rulerId];
  if (rulerId === state.playerId) {
    chronicle(state, `${r.name} ceint aussi la couronne de ${name} : union personnelle.`, 'titre');
    pushEvent(
      state,
      {
        id: `sys_union_${u.id}`,
        titre: 'Les Grands d’une couronne nouvelle',
        texte: `Les seigneurs de ${name} vous reconnaissent pour roi, mais redoutent un souverain lointain. Ils réclament le maintien de leurs coutumes et de leurs privilèges.`,
        choix: [
          {
            libelle: 'Confirmer leurs privilèges.',
            effets: [{ union_privileges: { union: u.id, mode: 'confirmes' } }],
          },
          {
            libelle: 'Imposer votre autorité.',
            effets: [{ union_privileges: { union: u.id, mode: 'imposes' } }],
          },
        ],
      },
      { souverain: rulerId },
    );
  } else
    worldNews(
      state,
      `${displayName(state, r)} réunit sous sa tête la couronne de ${name}.`,
      'titre',
      rulerId,
    );
  return u;
}

/** Effet d'événement : privilèges confirmés (or) ou autorité imposée (grogne). */
export function setUnionPrivileges(
  state: GameState,
  unionId: string,
  mode: 'confirmes' | 'imposes',
): void {
  const u = (state.unions ?? []).find((x) => x.id === unionId);
  if (!u) return;
  const r = state.characters[u.rulerId];
  u.privileges = mode;
  const counties = u.counties.map((id) => state.counties[id]).filter(Boolean);
  if (mode === 'confirmes') {
    r.gold -= K.privilegesGold;
    for (const c of counties)
      c.contentment = clamp(contentmentOf(c) + K.privilegesContentment, 0, 100);
  } else {
    for (const c of counties) c.contentment = clamp(contentmentOf(c) + K.imposeContentment, 0, 100);
    for (const v of new Set(counties.map((c) => c.holderId)))
      if (v !== u.rulerId)
        addOpinion(state, v, u.rulerId, 'Privilèges bafoués', K.imposeOpinion, 16);
  }
}

/** Unions périmées (couronne perdue, souverain mort) : nettoyées. L'IA fond ses couronnes. */
export function seasonUnions(state: GameState): void {
  const list = state.unions ?? [];
  for (const u of list) {
    u.counties = u.counties.filter(
      (id) => state.counties[id] && countyRuler(state, state.counties[id]) === u.rulerId,
    );
  }
  state.unions = list.filter((u) => u.counties.length && state.characters[u.rulerId]?.alive);
  for (const u of [...state.unions]) {
    if (u.rulerId === state.playerId) continue;
    const r = state.characters[u.rulerId];
    if (r.prestige >= K.fuseCost && canFuse(state, u.rulerId, u.id).ok)
      fuseCrowns(state, u.rulerId, u.id);
  }
}

/** À la mort d'un souverain : ses unions passent à l'héritier (ou à un cadet par partage). */
export function inheritUnions(
  state: GameState,
  deadId: string,
  heirId: string,
  cadetId?: string,
): void {
  for (const u of state.unions ?? []) {
    if (u.rulerId !== deadId) continue;
    u.rulerId = cadetId ?? heirId;
    u.since = state.turn;
  }
  // Un cadet qui reçoit la couronne entière règne seul : plus d'union.
  if (cadetId) state.unions = (state.unions ?? []).filter((u) => u.rulerId !== cadetId);
}

// ---------------------------------------------------------------------------
// Loi agnatique
// ---------------------------------------------------------------------------

export function setAgnatic(state: GameState, rulerId: string, on: boolean): boolean {
  const r = state.characters[rulerId];
  if (!r || !!r.agnatic === on) return false;
  if (on) {
    if (r.prestige < K.agnaticCost) return false;
    r.prestige -= K.agnaticCost;
  }
  r.agnatic = on;
  return true;
}

// ---------------------------------------------------------------------------
// Droits dynastiques
// ---------------------------------------------------------------------------

/** Souverain indépendant de cette maison (le plus étendu). */
export function houseRuler(state: GameState, houseId: string): string | undefined {
  return independentRulers(state)
    .filter((r) => state.characters[r]?.dynastyId === houseId)
    .sort((a, b) => realmCounties(state, b).length - realmCounties(state, a).length)[0];
}

/** Droits reçus à la naissance : maisons régnantes des parents (sauf renonciation), et leurs droits. */
export function grantHouseClaims(state: GameState, child: Character): void {
  const set = new Set(child.houseClaims ?? []);
  for (const pid of [child.motherId, child.fatherId]) {
    const p = pid ? state.characters[pid] : undefined;
    if (!p) continue;
    if (
      p.dynastyId &&
      p.dynastyId !== child.dynastyId &&
      !p.renounced &&
      houseRuler(state, p.dynastyId)
    )
      set.add(p.dynastyId);
    for (const h of p.houseClaims ?? []) set.add(h);
  }
  if (child.dynastyId) set.delete(child.dynastyId);
  const list = [...set].slice(0, K.maxClaims);
  child.houseClaims = list.length ? list : undefined;
}

export interface ClaimInfo {
  claimantId: string;
  houseId: string;
  rulerId: string;
  strong: boolean;
  reasons: string[];
}

/** Force d'un droit : fort si la maison visée est fragile (enfant, captif, sans héritier…). */
export function claimInfo(
  state: GameState,
  claimantId: string,
  houseId: string,
): ClaimInfo | undefined {
  const rulerId = houseRuler(state, houseId);
  if (!rulerId || rulerId === claimantId) return undefined;
  const r = state.characters[rulerId];
  const reasons: string[] = [];
  if (ageOf(state, r) < BALANCE.characters.adulthood) reasons.push('Souverain enfant');
  if (r.imprisonedBy) reasons.push('Souverain captif');
  if (!livingChildren(state, r).length) reasons.push('Aucun enfant pour lui succéder');
  if (r.female && r.agnatic) reasons.push('Une femme règne malgré la loi agnatique');
  if (backedByGrandees(state, rulerId, claimantId)) reasons.push('Les Grands le soutiennent');
  return { claimantId, houseId, rulerId, strong: reasons.length > 0, reasons };
}

/** Droits que ce souverain peut faire valoir : les siens, ceux de sa maison et de sa cour. */
export function pressableClaims(state: GameState, rulerId: string): ClaimInfo[] {
  const r = state.characters[rulerId];
  if (!r) return [];
  const people = Object.values(state.characters).filter(
    (c) =>
      c.alive &&
      c.houseClaims?.length &&
      !c.imprisonedBy &&
      (c.id === rulerId || (r.dynastyId && c.dynastyId === r.dynastyId) || c.courtId === rulerId),
  );
  const out: ClaimInfo[] = [];
  for (const c of people)
    for (const h of c.houseClaims ?? []) {
      if (h === r.dynastyId) continue;
      const info = claimInfo(state, c.id, h);
      // Ni contre son conjoint, ni contre les parents du prétendant (il en héritera).
      if (
        info &&
        info.rulerId !== rulerId &&
        info.rulerId !== r.spouseId &&
        info.rulerId !== c.motherId &&
        info.rulerId !== c.fatherId
      )
        out.push(info);
    }
  return out.sort((a, b) => Number(b.strong) - Number(a.strong));
}

/** Droits d'autres personnages sur la maison de ce souverain (menaces). */
export function claimsOnHouse(state: GameState, rulerId: string): ClaimInfo[] {
  const h = state.characters[rulerId]?.dynastyId;
  if (!h) return [];
  return Object.values(state.characters)
    .filter((c) => c.alive && c.houseClaims?.includes(h) && c.dynastyId !== h)
    .map((c) => claimInfo(state, c.id, h))
    .filter((x): x is ClaimInfo => !!x && x.rulerId === rulerId);
}

/** Vérifications propres au casus belli « droit dynastique ». */
export function dynasticCheck(
  state: GameState,
  attackerId: string,
  defenderId: string,
  claimantId: string | undefined,
): { reasons: string[]; prestige: number } {
  const reasons: string[] = [];
  const a = state.characters[attackerId];
  const d = state.characters[defenderId];
  const c = claimantId ? state.characters[claimantId] : undefined;
  if (!c?.alive) return { reasons: ['Choisir un prétendant'], prestige: 0 };
  if (!d?.dynastyId || !c.houseClaims?.includes(d.dynastyId))
    reasons.push(`${c.name} n’a aucun droit sur la maison de ${d?.name ?? '—'}`);
  const ours =
    c.id === attackerId || (a.dynastyId && c.dynastyId === a.dynastyId) || c.courtId === attackerId;
  if (!ours) reasons.push('Le prétendant doit être de votre maison ou de votre cour');
  if (c.imprisonedBy) reasons.push('Le prétendant est prisonnier');
  if (!isAdult(state, c) && c.id !== attackerId) reasons.push('Le prétendant est trop jeune');
  const info = d?.dynastyId ? claimInfo(state, c.id, d.dynastyId) : undefined;
  if (info && info.rulerId !== defenderId)
    reasons.push('Ce souverain ne tient pas l’héritage visé');
  const prestige = info?.strong ? K.strongClaimPrestige : K.weakClaimPrestige;
  if (a.prestige < prestige) reasons.push(`${prestige} prestige requis (droit faible)`);
  return { reasons, prestige };
}

/**
 * Victoire dans une guerre de droit dynastique : le prétendant reçoit le domaine propre et
 * les titres du vaincu. Si c'est l'attaquant lui-même : union personnelle ; sinon le
 * prétendant devient son vassal. Les vassaux du vaincu passent à l'attaquant.
 */
export function resolveDynasticWar(
  state: GameState,
  attackerId: string,
  defenderId: string,
  claimantId: string,
): string {
  const claimant = state.characters[claimantId];
  const d = state.characters[defenderId];
  if (!claimant?.alive || !d) return '';
  const name = realmName(state, defenderId).replace(/^(Royaume|Duché|Comté) de /, '');
  const own = Object.values(state.counties).filter((c) => c.holderId === defenderId);
  for (const k of Object.values(state.kingdoms))
    if (k.holderId === defenderId) k.holderId = claimantId;
  for (const k of Object.values(state.duchies))
    if (k.holderId === defenderId) k.holderId = claimantId;
  for (const c of own) transferCounty(state, c.id, claimantId);
  for (const v of Object.values(state.characters))
    if (v.alive && v.liegeId === defenderId) {
      v.liegeId = attackerId;
      addOpinion(state, v.id, attackerId, 'Nouveau suzerain', BALANCE.opinion.newLiege, 12);
    }
  d.liegeId = undefined;
  d.courtId = claimantId;
  if (claimantId === attackerId) {
    createUnion(
      state,
      attackerId,
      name,
      own.map((c) => c.id),
    );
  } else {
    claimant.liegeId = attackerId;
    claimant.courtId = claimantId;
    addOpinion(state, claimantId, attackerId, 'M’a fait roi', 30, 0);
  }
  ensureCapitals(state);
  return `${claimant.name} monte sur le trône de ${name}.`;
}

/** Un prétendant demande asile (rare) : un parent par les femmes d'une maison fragile. */
export function seasonPretenders(ctx: Ctx): void {
  const { state, rng } = ctx;
  if (!rng.chance(K.pretenderChance)) return;
  const pl = state.playerId;
  const me = state.characters[pl];
  const targets = independentRulers(state).filter((r) => {
    const c = state.characters[r];
    return r !== pl && c?.dynastyId && c.dynastyId !== me.dynastyId && !atWar(state, pl, r);
  });
  if (!targets.length) return;
  // Les maisons fragiles attirent les prétendants.
  const weak = targets.filter((r) => claimInfo(state, '_', state.characters[r].dynastyId!)?.strong);
  const rulerId = rng.pick(weak.length ? weak : targets);
  const ruler = state.characters[rulerId];
  const p = createCharacter(ctx, {
    age: rng.int(18, 34),
    female: rng.chance(0.2),
    dynastyId: null,
    courtId: undefined,
    skillBase: 8,
  });
  p.houseClaims = [ruler.dynastyId!];
  const dyn = state.dynasties[ruler.dynastyId!];
  const strong = claimInfo(state, p.id, ruler.dynastyId!)?.strong;
  pushEvent(
    state,
    {
      id: `sys_pretendant_${p.id}`,
      titre: 'Un prétendant demande asile',
      texte: `${p.name}, issu par les femmes de la maison ${dyn.name}, se présente à votre cour. ${p.female ? 'Elle' : 'Il'} se dit l’héritier légitime de ${displayName(state, ruler)}${strong ? ', dont la succession est fragile' : ''}, et demande votre protection.`,
      choix: [
        {
          libelle: `L’accueillir à votre cour (ses droits pourront servir).`,
          effets: [{ pretendant: { id: p.id, action: 'accueillir', souverain: rulerId } }],
        },
        {
          libelle: `Le livrer à ${ruler.name}.`,
          effets: [{ pretendant: { id: p.id, action: 'livrer', souverain: rulerId } }],
        },
        {
          libelle: 'Le congédier.',
          effets: [{ pretendant: { id: p.id, action: 'congedier', souverain: rulerId } }],
        },
      ],
    },
    { pretendant: p.id, souverain_vise: rulerId },
  );
}

/** Effet d'événement : sort du prétendant. */
export function settlePretender(
  state: GameState,
  id: string,
  action: 'accueillir' | 'livrer' | 'congedier',
  rulerId: string,
): void {
  const p = state.characters[id];
  if (!p?.alive) return;
  const pl = state.playerId;
  if (action === 'accueillir') {
    p.courtId = pl;
    addOpinion(state, p.id, pl, 'M’a accueilli', 25, 0);
    addOpinion(state, rulerId, pl, 'Abrite un prétendant', -20, 16);
    notify(state, `${p.name} rejoint votre cour avec ses prétentions.`);
  } else if (action === 'livrer') {
    p.imprisonedBy = rulerId;
    p.courtId = rulerId;
    addOpinion(state, rulerId, pl, 'M’a livré un prétendant', 25, 20);
  } else {
    p.alive = false;
    p.deathTurn = state.turn;
    p.deathCause = 'parti en exil';
  }
}

// ---------------------------------------------------------------------------
// Clauses de mariage
// ---------------------------------------------------------------------------

export type MarriageClause = 'aucune' | 'renonciation' | 'matrilineaire' | 'hommage';

/** Facteurs ajoutés à l'acceptation d'un mariage par une clause et une dot. */
export function clauseFactors(
  state: GameState,
  mine: Character,
  theirs: Character,
  clause: MarriageClause,
  dowry: number,
): { factors: Factor[]; blocked?: string } {
  const f: Factor[] = [];
  let blocked: string | undefined;
  const pl = state.playerId;
  if (dowry > 0) f.push({ label: `Dot de ${dowry} or`, value: dowry / K.dowryGoldPerPoint });
  if (dowry > state.characters[pl].gold) blocked = `Il vous faut ${dowry} or`;
  if (clause === 'renonciation')
    f.push({ label: 'Renonciation à ses droits', value: K.clauseRenunciation });
  if (clause === 'matrilineaire') {
    if (!mine.female) blocked = 'Le mariage matrilinéaire se conclut par une femme de votre maison';
    const lower = rankScore(state, pl) > rankScore(state, topLiege(state, theirs.id));
    f.push({
      label: 'Enfants de votre maison',
      value: lower ? K.clauseMatrilinealLower : K.clauseMatrilineal,
    });
  }
  if (clause === 'hommage') {
    if (!isIndependent(state, theirs.id))
      blocked = 'L’hommage se demande à un souverain qui épouse votre famille';
    f.push({ label: 'Hommage : il tiendra ses terres de vous', value: K.clauseHomage });
    const ratio = militaryStrength(state, pl) / Math.max(1, militaryStrength(state, theirs.id));
    f.push({ label: 'Rapport de force', value: clamp((ratio - 1) * 20, -20, 40) });
  }
  return { factors: f, blocked };
}

function rankScore(state: GameState, id: string): number {
  if (Object.values(state.kingdoms).some((k) => k.holderId === id)) return 3;
  if (Object.values(state.duchies).some((k) => k.holderId === id)) return 2;
  return Object.values(state.counties).some((k) => k.holderId === id) ? 1 : 0;
}

/** Applique la clause une fois le mariage célébré. */
export function applyClause(
  state: GameState,
  mine: Character,
  theirs: Character,
  clause: MarriageClause,
  dowry: number,
): void {
  const pl = state.playerId;
  if (dowry > 0) {
    state.characters[pl].gold -= dowry;
    const recv = state.characters[topLiege(state, theirs.id)];
    if (recv) recv.gold += dowry;
  }
  if (clause === 'renonciation') mine.renounced = true;
  if (clause === 'matrilineaire' && mine.female) mine.matrilineal = true;
  if (clause === 'hommage' && isIndependent(state, theirs.id)) {
    theirs.liegeId = pl;
    for (const v of Object.values(state.characters))
      if (v.alive && v.liegeId === theirs.id) v.liegeId = pl;
    addOpinion(state, theirs.id, pl, 'Hommage par mariage', K.protection.opinionAfter, 0);
    chronicle(
      state,
      `${displayName(state, theirs)} prête hommage à ${state.characters[pl].name} par mariage.`,
      'titre',
    );
  }
}

// ---------------------------------------------------------------------------
// Protection : un souverain lié par la famille devient vassal
// ---------------------------------------------------------------------------

/** Ce souverain est-il menacé (voisin bien plus fort et hostile, ou droit fort contre lui) ? */
function threatened(state: GameState, id: string): boolean {
  const mine = militaryStrength(state, id);
  const near = new Set<string>();
  for (const c of realmCounties(state, id))
    for (const n of c.adjacent) {
      const r = countyRuler(state, state.counties[n]);
      if (r && r !== id) near.add(r);
    }
  if ([...near].some((r) => militaryStrength(state, r) > mine * 1.5 && opinion(state, r, id) < 0))
    return true;
  return claimsOnHouse(state, id).some((x) => x.strong);
}

export function protectionAcceptance(
  state: GameState,
  fromId: string,
  targetId: string,
): Acceptance {
  const P = K.protection;
  const t = state.characters[targetId];
  const f: Factor[] = [{ label: 'Base', value: P.base }];
  f.push({ label: 'Opinion', value: opinion(state, targetId, fromId) * P.perOpinion });
  const ratio = militaryStrength(state, fromId) / Math.max(1, militaryStrength(state, targetId));
  f.push({ label: 'Rapport de force', value: clamp((ratio - 1) * P.perStrengthRatio, -20, 40) });
  if (threatened(state, targetId)) f.push({ label: 'Se sent menacé', value: P.threatened });
  f.push({
    label: 'Étendue de ses terres',
    value: realmCounties(state, targetId).length * P.perCounty,
  });
  if (familyTie(state, fromId, targetId)) f.push({ label: 'Liens de famille', value: P.familyTie });
  f.push(...influenceFactor(state, targetId));
  f.push(...traitFactors(t));
  if (t?.traits.includes('ambitieux')) f.push({ label: 'Refuse de plier', value: -25 });
  let blocked: string | undefined;
  if (!t?.alive || !isIndependent(state, targetId) || targetId === fromId)
    blocked = 'Souverain invalide';
  else if (state.characters[fromId].liegeId) blocked = 'Vous êtes vous-même vassal';
  else if (!familyTie(state, fromId, targetId))
    blocked = 'Il faut un lien de famille (mariage, sang)';
  else if (warsOf(state, targetId).length || atWar(state, fromId, targetId))
    blocked = 'Il est en guerre';
  return finish(f, blocked);
}

export function offerProtection(ctx: Ctx, fromId: string, targetId: string): boolean {
  const { state } = ctx;
  const acc = protectionAcceptance(state, fromId, targetId);
  if (acc.blocked) return false;
  const t = state.characters[targetId];
  if (!acc.accept) {
    if (fromId === state.playerId) notify(state, `${t.name} refuse votre protection.`);
    addOpinion(state, targetId, fromId, 'Me croit faible', -5, 8);
    return false;
  }
  t.liegeId = fromId;
  for (const v of Object.values(state.characters))
    if (v.alive && v.liegeId === targetId) v.liegeId = fromId;
  state.alliances = state.alliances.filter((k) => !k.split('|').includes(targetId));
  addOpinion(state, targetId, fromId, 'Sous votre protection', K.protection.opinionAfter, 0);
  const text = `${displayName(state, t)} se place sous la protection de ${displayName(state, state.characters[fromId])}.`;
  chronicle(state, text, 'titre');
  return true;
}

// ---------------------------------------------------------------------------
// Pactes de famille et pactes successoraux
// ---------------------------------------------------------------------------

export const hasFamilyPact = (state: GameState, a: string, b: string): boolean =>
  (state.familyPacts ?? []).includes(allyKey(a, b));
export const hasSuccessionPact = (state: GameState, a: string, b: string): boolean =>
  (state.successionPacts ?? []).includes(allyKey(a, b));

export function familyPactAcceptance(
  state: GameState,
  fromId: string,
  targetId: string,
): Acceptance {
  const P = K.familyPact;
  const f: Factor[] = [{ label: 'Base', value: P.base }];
  f.push({ label: 'Opinion', value: opinion(state, targetId, fromId) * P.perOpinion });
  if (familyTie(state, fromId, targetId)) f.push({ label: 'Liens de famille', value: P.familyTie });
  f.push(...influenceFactor(state, targetId));
  f.push(...traitFactors(state.characters[targetId]));
  let blocked: string | undefined;
  if (!isIndependent(state, targetId) || targetId === fromId) blocked = 'Souverain invalide';
  else if (!allied(state, fromId, targetId)) blocked = 'Il faut d’abord une alliance';
  else if (!familyTie(state, fromId, targetId)) blocked = 'Il faut un lien de famille';
  else if (hasFamilyPact(state, fromId, targetId)) blocked = 'Pacte déjà conclu';
  return finish(f, blocked);
}

function heirless(state: GameState, id: string): boolean {
  return !livingChildren(state, state.characters[id]).length;
}

export function successionPactAcceptance(
  state: GameState,
  fromId: string,
  targetId: string,
  gold = 0,
): Acceptance {
  const P = K.successionPact;
  const f: Factor[] = [{ label: 'Base', value: P.base }];
  f.push({ label: 'Opinion', value: opinion(state, targetId, fromId) * P.perOpinion });
  if (hasFamilyPact(state, fromId, targetId))
    f.push({ label: 'Pacte de famille', value: P.familyPact });
  if (heirless(state, targetId))
    f.push({ label: 'Lui n’a pas d’héritier direct', value: P.theyHaveNoHeir });
  if (heirless(state, fromId))
    f.push({ label: 'Vous n’avez pas d’héritier direct', value: P.youHaveNoHeir });
  if (gold > 0) f.push({ label: `${gold} or offerts`, value: gold / P.goldPerPoint });
  f.push(...influenceFactor(state, targetId));
  f.push(...traitFactors(state.characters[targetId]));
  let blocked: string | undefined;
  if (!isIndependent(state, targetId) || targetId === fromId) blocked = 'Souverain invalide';
  else if (!allied(state, fromId, targetId) && !hasFamilyPact(state, fromId, targetId))
    blocked = 'Il faut une alliance ou un pacte de famille';
  else if (hasSuccessionPact(state, fromId, targetId)) blocked = 'Pacte déjà conclu';
  else if (gold > state.characters[fromId].gold) blocked = `Il vous faut ${gold} or`;
  return finish(f, blocked);
}

export function proposePact(
  ctx: Ctx,
  kind: 'famille' | 'succession',
  fromId: string,
  targetId: string,
  gold = 0,
): boolean {
  const { state } = ctx;
  const acc =
    kind === 'famille'
      ? familyPactAcceptance(state, fromId, targetId)
      : successionPactAcceptance(state, fromId, targetId, gold);
  if (acc.blocked) return false;
  const t = state.characters[targetId];
  if (!acc.accept) {
    if (fromId === state.playerId) notify(state, `${t.name} refuse le pacte.`);
    return false;
  }
  const key = allyKey(fromId, targetId);
  if (kind === 'famille') (state.familyPacts ??= []).push(key);
  else {
    (state.successionPacts ??= []).push(key);
    if (gold > 0) {
      state.characters[fromId].gold -= gold;
      t.gold += gold;
    }
  }
  chronicle(
    state,
    `${kind === 'famille' ? 'Pacte de famille' : 'Pacte successoral'} conclu avec ${displayName(state, t)}.`,
    'divers',
  );
  return true;
}

/** Rompre un pacte : parjure aux yeux de toutes les cours. */
export function breakPacts(state: GameState, fromId: string, targetId: string): void {
  const key = allyKey(fromId, targetId);
  const had =
    (state.familyPacts ?? []).includes(key) || (state.successionPacts ?? []).includes(key);
  if (!had) return;
  state.familyPacts = (state.familyPacts ?? []).filter((k) => k !== key);
  state.successionPacts = (state.successionPacts ?? []).filter((k) => k !== key);
  state.alliances = state.alliances.filter((k) => k !== key);
  const r = state.characters[fromId];
  r.prestige += K.perjuryPrestige;
  if (r.dynastyId) state.dynasties[r.dynastyId].renown += K.perjuryRenown;
  for (const x of independentRulers(state))
    if (x !== fromId) addOpinion(state, x, fromId, 'Parjure', K.perjuryOpinion, 16);
  addOpinion(state, targetId, fromId, 'Pacte trahi', -50, 40);
  if (fromId === state.playerId)
    chronicle(
      state,
      `${r.name} rompt sa parole envers ${state.characters[targetId].name}.`,
      'divers',
    );
}

/** Pacte successoral : partenaire qui hérite d'un souverain mort sans héritier. */
export function pactHeir(state: GameState, deadId: string): Character | undefined {
  for (const key of state.successionPacts ?? []) {
    const [a, b] = key.split('|');
    if (a !== deadId && b !== deadId) continue;
    const other = a === deadId ? b : a;
    if (isIndependent(state, other)) return state.characters[other];
  }
  return undefined;
}
