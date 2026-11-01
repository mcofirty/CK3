/** Diplomatie et conseil (section 7). */
import { BALANCE } from '../../data/balance';
import { TRAITS } from '../../data/traits';
import {
  addOpinion,
  ageOf,
  allied,
  allyKey,
  atWar,
  closeFamily,
  displayName,
  isAdult,
  livingChildren,
  marry,
  opinion,
  perkBonus,
  player,
  skill,
  topLiege,
  warSide,
} from '../characters';
import { gainXp } from '../progression';
import { clauseFactors, hasFamilyPact, type MarriageClause } from '../crowns';
import { gainInfluence, influenceFactor } from '../influence';
import { chronicle, notify, worldNews, type Ctx } from '../context';
import { capitalOf, countyRuler, independentRulers, rankOf, rankValue } from '../realm';
import type { Character, CouncilPost, GameState } from '../state';
import { joinWar, militaryStrength, truceWith, warsOf } from '../war';

const D = BALANCE.diplomacy;

export interface Factor {
  label: string;
  value: number;
}
export interface Acceptance {
  score: number;
  factors: Factor[];
  accept: boolean;
  blocked?: string;
}

function traitFactors(target: Character): Factor[] {
  const res: Factor[] = [];
  for (const t of target.traits) {
    const v = (D.traitModifiers as Record<string, number>)[t];
    if (v) res.push({ label: `Trait : ${TRAITS[t].name}`, value: v });
  }
  return res;
}

function finish(factors: Factor[], blocked?: string): Acceptance {
  const score = Math.round(factors.reduce((s, f) => s + f.value, 0));
  return {
    score,
    factors: factors.map((f) => ({ ...f, value: Math.round(f.value) })),
    accept: !blocked && score >= D.acceptThreshold,
    blocked,
  };
}

/** Peut-on marier ces deux personnages ? */
export function marriageBlock(state: GameState, a: Character, b: Character): string | undefined {
  if (!a.alive || !b.alive) return 'Personnage décédé';
  if (a.spouseId || b.spouseId) return 'Déjà marié';
  if (a.female === b.female) return 'Union impossible';
  if (!isAdult(state, a) || !isAdult(state, b)) return 'Trop jeune';
  if (a.dynastyId && a.dynastyId === b.dynastyId) return 'Même dynastie';
  if (a.imprisonedBy || b.imprisonedBy) return 'Prisonnier';
  if (a.visitor || b.visitor) return 'De passage';
  return undefined;
}

/** Acceptation d'un mariage proposé par le joueur ; `b` est à la cour de son souverain. */
export function marriageAcceptance(
  state: GameState,
  a: Character,
  b: Character,
  clause: MarriageClause = 'aucune',
  dowry = 0,
): Acceptance {
  const pl = state.playerId;
  const theirRuler = topLiege(state, b.id);
  const f: Factor[] = [{ label: 'Base', value: D.marriage.base }];
  f.push({
    label: `Opinion de ${state.characters[theirRuler]?.name ?? '—'}`,
    value: opinion(state, theirRuler, pl) * D.marriage.perOpinion,
  });
  const rd = rankValue(rankOf(state, pl)) - rankValue(rankOf(state, theirRuler));
  if (rd) f.push({ label: 'Rang de votre maison', value: rd * D.marriage.rankBonus });
  if (theirRuler !== pl && !allied(state, pl, theirRuler))
    f.push({ label: 'Intérêt d’une alliance', value: D.marriage.allianceInterest });
  if (a.id === pl || (a.childrenIds.length === 0 && ageOf(state, a) < 30))
    f.push({
      label: 'Prestige du prétendant',
      value: Math.min(15, state.characters[pl].prestige / 50),
    });
  if (atWar(state, pl, theirRuler)) f.push({ label: 'En guerre', value: -100 });
  const ageGap = Math.abs(ageOf(state, a) - ageOf(state, b));
  if (ageGap > 15) f.push({ label: 'Grande différence d’âge', value: -ageGap / 2 });
  f.push(...traitFactors(state.characters[theirRuler] ?? b));
  const pb = perkBonus(state, state.characters[pl], 'acceptance');
  if (pb) f.push({ label: 'Talents et héritages', value: pb });
  f.push(...influenceFactor(state, theirRuler));
  const cl = clauseFactors(state, a, b, clause, dowry);
  f.push(...cl.factors);
  return finish(f, marriageBlock(state, a, b) ?? cl.blocked);
}

/** Célèbre un mariage ; le conjoint rejoint la cour de la maison du joueur. */
export function celebrateMarriage(ctx: Ctx, aId: string, bId: string): void {
  const { state } = ctx;
  const a = state.characters[aId];
  const b = state.characters[bId];
  if (marriageBlock(state, a, b)) return;
  marry(state, a, b);
  const pd = state.playerDynastyId;
  const [mine, theirs] = a.dynastyId === pd ? [a, b] : b.dynastyId === pd ? [b, a] : [a, b];
  if (!countiesOf(state, theirs.id)) theirs.courtId = mine.courtId;
  const r1 = topLiege(state, mine.id);
  const r2 = topLiege(state, theirs.id);
  if (r1 !== r2) {
    addOpinion(state, r2, r1, 'Liens du mariage', 20, 0);
    addOpinion(state, r1, r2, 'Liens du mariage', 20, 0);
  }
  // Mariage prestigieux : avec un souverain ou son enfant.
  const prestigious = independentRulers(state).some(
    (r) => r === theirs.id || state.characters[r]?.childrenIds.includes(theirs.id),
  );
  if (mine.dynastyId === pd) {
    if (prestigious) {
      state.dynasties[pd].renown += BALANCE.characters.marriageRenown;
      state.characters[state.playerId].prestige += D.prestigeMarriage;
    }
    chronicle(state, `Mariage de ${mine.name} et ${displayName(state, theirs)}.`, 'mariage');
    gainXp(state, state.characters[state.playerId], 'diplomatie', BALANCE.progression.marriageXp);
  } else if (
    theirs.dynastyId !== pd &&
    (prestigious ||
      independentRulers(state).some(
        (r) => r === mine.id || state.characters[r]?.childrenIds.includes(mine.id),
      ))
  ) {
    worldNews(
      state,
      `Mariage de ${displayName(state, mine)} et ${displayName(state, theirs)}${r1 !== r2 ? ' : deux cours se rapprochent' : ''}.`,
      'mariage',
      r1,
    );
  }
}

function countiesOf(state: GameState, id: string): number {
  return Object.values(state.counties).filter((c) => c.holderId === id).length;
}

/** Lien de mariage entre la famille proche de deux souverains. */
export function marriageTie(state: GameState, a: string, b: string): boolean {
  const fa = [state.characters[a], ...closeFamily(state, state.characters[a])].filter(Boolean);
  const fbIds = new Set([b, ...closeFamily(state, state.characters[b]).map((c) => c.id)]);
  return fa.some((c) => c.spouseId && fbIds.has(c.spouseId));
}

export function allianceAcceptance(state: GameState, fromId: string, toId: string): Acceptance {
  const f: Factor[] = [{ label: 'Base', value: D.alliance.base }];
  f.push({ label: 'Opinion', value: opinion(state, toId, fromId) * D.alliance.perOpinion });
  const pb = perkBonus(state, state.characters[fromId], 'acceptance');
  if (pb) f.push({ label: 'Talents et héritages', value: pb });
  const threatened = warsOf(state, toId).length > 0;
  if (threatened) f.push({ label: 'Menacé par une guerre', value: D.alliance.threatInterest });
  const ratio = militaryStrength(state, fromId) / Math.max(1, militaryStrength(state, toId));
  f.push({ label: 'Rapport de force', value: Math.max(-20, Math.min(20, (ratio - 1) * 20)) });
  f.push(...influenceFactor(state, toId));
  f.push(...traitFactors(state.characters[toId]));
  let blocked: string | undefined;
  if (!marriageTie(state, fromId, toId)) blocked = 'Il faut un lien par mariage entre vos familles';
  if (allied(state, fromId, toId)) blocked = 'Déjà alliés';
  if (atWar(state, fromId, toId)) blocked = 'En guerre';
  return finish(f, blocked);
}

export function makeAlliance(state: GameState, a: string, b: string): void {
  const k = allyKey(a, b);
  if (!state.alliances.includes(k)) state.alliances.push(k);
  if (a === state.playerId || b === state.playerId) {
    const other = a === state.playerId ? b : a;
    chronicle(
      state,
      `Alliance conclue avec ${displayName(state, state.characters[other])}.`,
      'divers',
    );
  } else
    worldNews(
      state,
      `Alliance entre ${displayName(state, state.characters[a])} et ${displayName(state, state.characters[b])}.`,
      'alliance',
      a,
    );
}

export function breakAlliance(state: GameState, a: string, b: string): void {
  state.alliances = state.alliances.filter((k) => k !== allyKey(a, b));
}

/** Le joueur (ou l'IA) dénonce une alliance : prestige et rancune ; on s'en souvient. */
export function renounceAlliance(state: GameState, fromId: string, allyId: string): boolean {
  if (!allied(state, fromId, allyId)) return false;
  const B = D.breakAlliance;
  breakAlliance(state, fromId, allyId);
  state.characters[fromId].prestige += B.prestige;
  addOpinion(state, allyId, fromId, 'A rompu notre alliance', B.opinion, B.opinionSeasons);
  (state.brokenAlliances ??= {})[allyKey(fromId, allyId)] = state.turn;
  const text = `${displayName(state, state.characters[fromId])} rompt son alliance avec ${displayName(state, state.characters[allyId])}.`;
  if (fromId === state.playerId || allyId === state.playerId) chronicle(state, text, 'divers');
  else worldNews(state, text, 'alliance', fromId);
  return true;
}

/** Attaquer un allié tout juste renié : traîtrise. */
export function recentlyBetrayed(state: GameState, a: string, b: string): boolean {
  const t = state.brokenAlliances?.[allyKey(a, b)];
  return t !== undefined && state.turn - t < D.breakAlliance.treacherySeasons;
}

/** Ennemi principal de `fromId` dans cette guerre. */
function warEnemy(state: GameState, fromId: string, warId: string): string | undefined {
  const w = state.wars[warId];
  if (!w) return undefined;
  return w.attackerId === fromId || w.attackerAllies.includes(fromId) ? w.defenderId : w.attackerId;
}

/**
 * Appel aux armes : un allié, ou tout autre souverain (plus difficile), éventuellement
 * convaincu par un subside en or (`gold`, versé s'il accepte).
 */
export function callToArmsAcceptance(
  state: GameState,
  fromId: string,
  allyId: string,
  warId: string,
  gold = 0,
): Acceptance {
  const C = D.callToArms;
  const f: Factor[] = [{ label: 'Base', value: C.base }];
  f.push({ label: 'Opinion', value: opinion(state, allyId, fromId) * C.perOpinion });
  const w = state.wars[warId];
  const enemy = warEnemy(state, fromId, warId);
  const isAlly = allied(state, fromId, allyId);
  if (!isAlly) f.push({ label: 'Aucune alliance', value: C.noAlliance });
  else if (marriageTie(state, fromId, allyId))
    f.push({ label: 'Liens du mariage', value: C.marriageTie });
  if (hasFamilyPact(state, fromId, allyId))
    f.push({ label: 'Pacte de famille', value: BALANCE.crowns.familyPact.callBonus });
  if (enemy) {
    const hate = opinion(state, allyId, enemy);
    if (hate < 0) f.push({ label: 'Hostile à l’ennemi', value: -hate * C.perEnemyHatred });
    if (allied(state, allyId, enemy)) f.push({ label: 'Allié de l’ennemi', value: -100 });
  }
  if (warsOf(state, allyId).length) f.push({ label: 'Déjà en guerre', value: -30 });
  if (gold > 0) f.push({ label: `Subside de ${gold} or`, value: gold / C.goldPerPoint });
  f.push(...traitFactors(state.characters[allyId]));
  let blocked: string | undefined;
  const refused = state.callRefused?.[allyId];
  if (allyId === fromId || !state.characters[allyId]?.alive) blocked = 'Cible invalide';
  if (!w) blocked = 'Guerre introuvable';
  if (w && warSide(state, warId, allyId)) blocked = 'Déjà engagé';
  if (enemy && truceWith(state, allyId, enemy)) blocked = 'Trêve avec l’ennemi';
  if (enemy && atWar(state, allyId, fromId)) blocked = 'En guerre contre vous';
  if (gold > state.characters[fromId].gold) blocked = `Il vous faut ${gold} or`;
  if (!isAlly && refused !== undefined && refused > state.turn)
    blocked = `A déjà refusé (encore ${refused - state.turn} saison(s))`;
  return finish(f, blocked);
}

export function callToArms(
  ctx: Ctx,
  fromId: string,
  allyId: string,
  warId: string,
  gold = 0,
): boolean {
  const { state } = ctx;
  const acc = callToArmsAcceptance(state, fromId, allyId, warId, gold);
  const w = state.wars[warId];
  if (!w || acc.blocked) return false;
  const side =
    w.attackerId === fromId || w.attackerAllies.includes(fromId) ? 'attacker' : 'defender';
  const ally = state.characters[allyId];
  if (acc.accept) {
    if (gold > 0) {
      state.characters[fromId].gold -= gold;
      ally.gold += gold;
    }
    joinWar(state, warId, allyId, side);
    addOpinion(state, allyId, fromId, 'A répondu à l’appel', 5, 20);
    if (fromId === state.playerId)
      notify(state, `${ally.name} répond à votre appel et entre en guerre à vos côtés.`);
    return true;
  }
  if (allied(state, fromId, allyId)) {
    breakAlliance(state, fromId, allyId);
    addOpinion(state, fromId, allyId, 'A trahi l’alliance', -40, 40);
    if (fromId === state.playerId)
      notify(state, `${ally.name} refuse l’appel aux armes : l’alliance est rompue.`);
  } else {
    (state.callRefused ??= {})[allyId] = state.turn + D.callToArms.refusalCooldown;
    if (fromId === state.playerId) notify(state, `${ally.name} décline votre appel à l’aide.`);
  }
  return false;
}

export function giftCheck(state: GameState, fromId: string): { ok: boolean; cost: number } {
  const cost = BALANCE.economy.giftCost;
  return { ok: state.characters[fromId].gold >= cost, cost };
}

export function sendGift(ctx: Ctx, fromId: string, toId: string): boolean {
  const { state } = ctx;
  const chk = giftCheck(state, fromId);
  if (!chk.ok) return false;
  state.characters[fromId].gold -= chk.cost;
  state.characters[toId].gold += chk.cost;
  addOpinion(state, toId, fromId, 'Cadeau', BALANCE.economy.giftOpinion, 16);
  if (fromId === state.playerId)
    gainInfluence(state, topLiege(state, toId), BALANCE.influence.giftGain);
  return true;
}

export function tributeAcceptance(state: GameState, fromId: string, toId: string): Acceptance {
  const T = D.tribute;
  const f: Factor[] = [{ label: 'Base', value: T.base }];
  const ratio = militaryStrength(state, fromId) / Math.max(1, militaryStrength(state, toId));
  f.push({
    label: `Rapport de force (×${ratio.toFixed(1)})`,
    value: (ratio - 1) * T.perPowerRatio,
  });
  f.push({ label: 'Opinion', value: opinion(state, toId, fromId) * T.perOpinion });
  f.push(...traitFactors(state.characters[toId]));
  const blocked =
    state.characters[toId].gold < T.amount
      ? 'Trésor insuffisant'
      : atWar(state, fromId, toId)
        ? 'En guerre'
        : undefined;
  return finish(f, blocked);
}

export function demandTribute(ctx: Ctx, fromId: string, toId: string): boolean {
  const { state } = ctx;
  const acc = tributeAcceptance(state, fromId, toId);
  if (acc.accept) {
    const amount = D.tribute.amount;
    state.characters[toId].gold -= amount;
    state.characters[fromId].gold += amount;
    addOpinion(state, toId, fromId, 'Tribut exigé', -20, 20);
    if (fromId === state.playerId)
      notify(state, `${state.characters[toId].name} vous verse un tribut de ${amount} or.`);
    return true;
  }
  addOpinion(state, toId, fromId, 'Exigence insultante', -10, 12);
  if (fromId === state.playerId)
    notify(state, `${state.characters[toId].name} refuse de payer tribut.`);
  return false;
}

/** Candidats au mariage dans les autres cours (adultes non mariés). */
export function marriageCandidates(state: GameState, forChar: Character): Character[] {
  return Object.values(state.characters)
    .filter(
      (c) =>
        !marriageBlock(state, forChar, c) &&
        c.dynastyId !== forChar.dynastyId &&
        topLiege(state, c.id) !== state.playerId,
    )
    .sort(
      (x, y) =>
        rankValue(rankOf(state, topLiege(state, y.id))) -
        rankValue(rankOf(state, topLiege(state, x.id))),
    )
    .slice(0, 30);
}

// ---------------------------------------------------------------------------
// Conseil
// ---------------------------------------------------------------------------

export const COUNCIL_POSTS: CouncilPost[] = [
  'chancelier',
  'marechal',
  'intendant',
  'espion',
  'chapelain',
];
export const COUNCIL_INFO: Record<
  CouncilPost,
  {
    label: string;
    skill: 'diplomatie' | 'guerre' | 'gestion' | 'ruse' | 'savoir';
    tasks: {
      id: string;
      label: string;
      target?: 'cour' | 'comte_etranger' | 'comte' | 'heritier';
    }[];
  }
> = {
  chancelier: {
    label: 'Chancelier',
    skill: 'diplomatie',
    tasks: [
      { id: 'relations', label: 'Améliorer les relations', target: 'cour' },
      { id: 'revendication', label: 'Fabriquer une revendication', target: 'comte_etranger' },
      { id: 'influence', label: 'Gagner de l’influence', target: 'cour' },
    ],
  },
  marechal: {
    label: 'Maréchal',
    skill: 'guerre',
    tasks: [
      { id: 'entrainement', label: 'Entraîner les troupes' },
      { id: 'levees', label: 'Augmenter les levées' },
    ],
  },
  intendant: {
    label: 'Intendant',
    skill: 'gestion',
    tasks: [
      { id: 'impots', label: 'Collecter les impôts' },
      { id: 'developper', label: 'Développer un comté', target: 'comte' },
    ],
  },
  espion: {
    label: 'Maître-espion',
    skill: 'ruse',
    tasks: [
      { id: 'demasquer', label: 'Démasquer les complots' },
      { id: 'espionner', label: 'Espionner une cour', target: 'cour' },
    ],
  },
  chapelain: {
    label: 'Chapelain',
    skill: 'savoir',
    tasks: [
      { id: 'piete', label: 'Gagner de la piété' },
      { id: 'eduquer', label: 'Éduquer un héritier', target: 'heritier' },
    ],
  },
};

/** Personnages éligibles au conseil : adultes de la cour du joueur, famille et vassaux. */
export function councilCandidates(state: GameState): Character[] {
  const pl = state.playerId;
  return Object.values(state.characters).filter(
    (c) =>
      c.alive &&
      c.id !== pl &&
      !c.imprisonedBy &&
      isAdult(state, c) &&
      (c.courtId === pl || c.liegeId === pl),
  );
}

/** Effets saisonniers des tâches du conseil du joueur. */
export function seasonCouncil(ctx: Ctx): void {
  const { state, rng } = ctx;
  const pl = state.playerId;
  const C = BALANCE.council;
  for (const post of COUNCIL_POSTS) {
    const seat = state.council[post];
    const h = seat.holderId ? state.characters[seat.holderId] : undefined;
    if (!h?.alive || h.imprisonedBy) continue;
    const s = skill(h, COUNCIL_INFO[post].skill);
    switch (`${post}:${seat.task}`) {
      case 'chancelier:relations':
        if (seat.targetId && state.characters[seat.targetId]?.alive)
          addOpinion(
            state,
            seat.targetId,
            pl,
            'Chancelier : relations',
            C.improveRelations * (s / 10),
            8,
          );
        break;
      case 'chancelier:revendication': {
        const c = seat.targetId ? state.counties[seat.targetId] : undefined;
        const me = state.characters[pl];
        if (
          c &&
          countyRuler(state, c) !== pl &&
          !me.claims.includes(c.id) &&
          rng.chance(C.fabricateClaimChance + s * 0.004)
        ) {
          me.claims.push(c.id);
          notify(state, `Votre chancelier a fabriqué une revendication sur ${c.name}.`);
          chronicle(state, `Revendication obtenue sur ${c.name}.`, 'divers');
          seat.task = 'relations';
          seat.targetId = undefined;
        }
        break;
      }
      case 'chancelier:influence':
        if (seat.targetId)
          gainInfluence(state, seat.targetId, s * BALANCE.influence.chancellorPerDiplomacy);
        break;
      case 'espion:espionner':
        if (seat.targetId) state.spied[seat.targetId] = state.turn;
        break;
      default:
        break;
    }
  }
}

/** Remplit automatiquement les sièges vides (au début et après une succession). */
export function autoFillCouncil(state: GameState): void {
  const cands = councilCandidates(state);
  const used = new Set(
    Object.values(state.council)
      .map((s) => s.holderId)
      .filter(Boolean),
  );
  for (const post of COUNCIL_POSTS) {
    const seat = state.council[post];
    const h = seat.holderId ? state.characters[seat.holderId] : undefined;
    if (h?.alive && (h.courtId === state.playerId || h.liegeId === state.playerId)) continue;
    seat.holderId = undefined;
    const sk = COUNCIL_INFO[post].skill;
    const best = cands
      .filter((c) => !used.has(c.id))
      .sort((a, b) => skill(b, sk) - skill(a, sk))[0];
    if (best) {
      seat.holderId = best.id;
      used.add(best.id);
    }
  }
}

/** Enfants mineurs de la famille proche du joueur (pour l'éducation). */
export function wards(state: GameState): Character[] {
  const p = player(state);
  const fam = [p, ...closeFamily(state, p)];
  const kids = new Map<string, Character>();
  for (const f of fam)
    for (const k of livingChildren(state, f))
      if (!isAdult(state, k) && k.dynastyId === state.playerDynastyId) kids.set(k.id, k);
  // Pupilles confiés par les vassaux : le joueur les fait éduquer aussi.
  for (const k of Object.values(state.characters))
    if (k.alive && k.fosterOf === state.playerId && !isAdult(state, k)) kids.set(k.id, k);
  return [...kids.values()].sort((a, b) => a.birthTurn - b.birthTurn);
}

export function capitalName(state: GameState, id: string): string {
  return capitalOf(state, id)?.name ?? '—';
}
