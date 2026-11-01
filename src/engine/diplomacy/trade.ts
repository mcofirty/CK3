/**
 * Traités de terres : acheter, vendre ou échanger des comtés avec un souverain, avec de l'or
 * de part et d'autre. L'IA estime chaque comté (revenus, développement, bâtiments, défense,
 * contiguïté) et n'accepte que si elle y gagne, selon son opinion et son caractère.
 */
import { BALANCE } from '../../data/balance';
import { TRAITS } from '../../data/traits';
import { addOpinion, atWar, displayName, opinion } from '../characters';
import { chronicle, clamp, notify, worldNews, type Ctx } from '../context';
import { contentmentOf, countyIncomeMult, isCapital } from '../economy/local';
import {
  buildingLevel,
  countyIncome,
  countyRuler,
  ensureCapitals,
  fortLevel,
  isIndependent,
} from '../realm';
import type { County, GameState } from '../state';
import { transferCounty } from '../war';
import type { Acceptance, Factor } from './index';

const T = BALANCE.trade;

export interface TradeOffer {
  /** Souverain avec qui l'on traite. */
  targetId: string;
  /** Ce que l'on donne. */
  giveGold: number;
  giveCounties: string[];
  /** Ce que l'on demande. */
  takeGold: number;
  takeCounties: string[];
}

export const emptyOffer = (targetId: string): TradeOffer => ({
  targetId,
  giveGold: 0,
  giveCounties: [],
  takeGold: 0,
  takeCounties: [],
});

/** Comtés qu'un seigneur peut céder : tenus en propre, hors capitale, ni occupés ni assiégés. */
export function tradableCounties(state: GameState, id: string): County[] {
  return Object.values(state.counties).filter(
    (c) => c.holderId === id && !isCapital(c) && !c.occupation && !c.siege,
  );
}

/** Le comté touche-t-il le domaine de ce souverain ? */
function touches(state: GameState, c: County, rulerId: string): boolean {
  return c.adjacent.some((n) => {
    const k = state.counties[n];
    return !!k && (k.holderId === rulerId || countyRuler(state, k) === rulerId);
  });
}

/** Valeur d'un comté en or, telle que l'estime `forId` s'il le recevait. */
export function countyValue(state: GameState, c: County, forId?: string): number {
  const buildings = c.buildings.reduce((s, b) => s + buildingLevel(c, b.type), 0);
  const base =
    countyIncome(c) * countyIncomeMult(c) * T.incomeSeasons +
    c.development * T.perDevelopment +
    buildings * T.perBuildingLevel +
    fortLevel(c) * T.perFort;
  const contiguous = !forId || touches(state, c, forId);
  return Math.round(base * (contiguous ? 1 : T.exclave));
}

function traitTrade(state: GameState, id: string): Factor[] {
  const res: Factor[] = [];
  for (const t of state.characters[id]?.traits ?? []) {
    const v = (BALANCE.diplomacy.traitModifiers as Record<string, number>)[t];
    if (v) res.push({ label: `Trait : ${TRAITS[t].name}`, value: v });
  }
  return res;
}

/** Ce que l'autre partie gagne (en or) : reçu − cédé (avec l'attachement à sa terre). */
export function tradeBalance(state: GameState, fromId: string, offer: TradeOffer) {
  const t = offer.targetId;
  const received =
    offer.giveGold +
    offer.giveCounties.reduce((s, id) => s + countyValue(state, state.counties[id], t), 0);
  const given =
    offer.takeGold +
    offer.takeCounties.reduce(
      (s, id) => s + countyValue(state, state.counties[id], t) * T.attachment,
      0,
    );
  void fromId;
  return { received: Math.round(received), given: Math.round(given) };
}

/** L'autre partie accepte-t-elle ? (blocage si l'offre est impossible) */
export function tradeAcceptance(state: GameState, fromId: string, offer: TradeOffer): Acceptance {
  const t = offer.targetId;
  const them = state.characters[t];
  const me = state.characters[fromId];
  const { received, given } = tradeBalance(state, fromId, offer);
  const f: Factor[] = [];
  if (received)
    f.push({ label: `Ce qu’il reçoit (${received} or)`, value: received / T.goldPerPoint });
  if (given) f.push({ label: `Ce qu’il cède (${given} or)`, value: -given / T.goldPerPoint });
  f.push({ label: 'Opinion', value: opinion(state, t, fromId) * T.perOpinion });
  f.push(...traitTrade(state, t));
  let blocked: string | undefined;
  const empty =
    !offer.giveGold && !offer.takeGold && !offer.giveCounties.length && !offer.takeCounties.length;
  const mineOk = new Set(tradableCounties(state, fromId).map((c) => c.id));
  const theirsOk = new Set(tradableCounties(state, t).map((c) => c.id));
  const theirOwn = Object.values(state.counties).filter((c) => c.holderId === t).length;
  if (!them?.alive || !isIndependent(state, t) || t === fromId) blocked = 'Souverain invalide';
  else if (empty) blocked = 'Offre vide';
  else if (atWar(state, fromId, t)) blocked = 'Vous êtes en guerre';
  else if (offer.giveCounties.some((id) => !mineOk.has(id)))
    blocked = 'Vous ne pouvez céder que des comtés tenus en propre (hors capitale)';
  else if (offer.takeCounties.some((id) => !theirsOk.has(id)))
    blocked = 'Il ne cède que ses propres comtés (hors capitale)';
  else if (theirOwn - offer.takeCounties.length < T.minKeep)
    blocked = `Il veut garder au moins ${T.minKeep} comtés`;
  else if (
    Object.values(state.counties).filter((c) => c.holderId === fromId).length -
      offer.giveCounties.length <
    1
  )
    blocked = 'Vous devez garder au moins un comté';
  else if (offer.giveGold > me.gold) blocked = `Il vous faut ${offer.giveGold} or`;
  else if (offer.takeGold > Math.max(0, them.gold))
    blocked = `Son trésor ne compte que ${Math.max(0, Math.round(them.gold))} or`;
  const refused = state.tradeRefused?.[t];
  if (!blocked && refused !== undefined && refused > state.turn)
    blocked = `Il a refusé récemment (encore ${refused - state.turn} saison(s))`;
  return finish(f, blocked);
}

function finish(factors: Factor[], blocked?: string): Acceptance {
  const score = Math.round(factors.reduce((s, x) => s + x.value, 0));
  return {
    score,
    factors: factors.map((x) => ({ ...x, value: Math.round(x.value) })),
    accept: !blocked && score >= BALANCE.diplomacy.acceptThreshold,
    blocked,
  };
}

/**
 * Marchandage : or à ajouter à l'offre (positif) pour la faire accepter, ou or que l'on peut
 * encore demander (négatif). Arrondi à la dizaine.
 */
export function goldToBalance(state: GameState, fromId: string, offer: TradeOffer): number {
  const acc = tradeAcceptance(state, fromId, { ...offer, targetId: offer.targetId });
  const need = (BALANCE.diplomacy.acceptThreshold - acc.score) * T.goldPerPoint;
  return need > 0 ? Math.ceil(need / 10) * 10 : -Math.floor(-need / 10) * 10;
}

/**
 * Ajuste l'or de l'offre pour la rendre tout juste acceptable, sans dépasser le trésor de
 * chacun (l'offre peut alors rester insuffisante : ajoutez une terre).
 */
export function balanceOffer(state: GameState, fromId: string, offer: TradeOffer): TradeOffer {
  const delta = goldToBalance(state, fromId, offer);
  const o = { ...offer };
  if (delta > 0) {
    // Réduire d'abord l'or demandé, puis offrir de l'or.
    const cut = Math.min(o.takeGold, delta);
    o.takeGold -= cut;
    o.giveGold += delta - cut;
  } else if (delta < 0) {
    const cut = Math.min(o.giveGold, -delta);
    o.giveGold -= cut;
    o.takeGold += -delta - cut;
  }
  const mine = Math.max(0, Math.floor(state.characters[fromId].gold / 10) * 10);
  const theirs = Math.max(0, Math.floor((state.characters[offer.targetId]?.gold ?? 0) / 10) * 10);
  o.giveGold = Math.min(o.giveGold, mine);
  o.takeGold = Math.min(o.takeGold, theirs);
  return o;
}

/** Cède un comté sans guerre (traité). */
function cede(state: GameState, countyId: string, to: string): void {
  transferCounty(state, countyId, to);
  const c = state.counties[countyId];
  c.contentment = clamp(contentmentOf(c) + T.newLordContentment, 0, 100);
}

/** Propose le traité ; renvoie vrai s'il est conclu. */
export function proposeTrade(ctx: Ctx, fromId: string, offer: TradeOffer): boolean {
  const { state } = ctx;
  const acc = tradeAcceptance(state, fromId, offer);
  if (acc.blocked) return false;
  const t = offer.targetId;
  const them = state.characters[t];
  const me = state.characters[fromId];
  if (!acc.accept) {
    (state.tradeRefused ??= {})[t] = state.turn + T.refusalCooldown;
    if (acc.score <= T.insultScore)
      addOpinion(state, t, fromId, 'Marchandage insultant', T.insultOpinion, 8);
    if (fromId === state.playerId) notify(state, `${them.name} rejette votre proposition.`);
    return false;
  }
  me.gold += offer.takeGold - offer.giveGold;
  them.gold += offer.giveGold - offer.takeGold;
  for (const id of offer.giveCounties) cede(state, id, t);
  for (const id of offer.takeCounties) cede(state, id, fromId);
  ensureCapitals(state);
  if (acc.score >= 20) addOpinion(state, t, fromId, 'Marché avantageux', 10, 12);
  const names = (ids: string[]) => ids.map((id) => state.counties[id].name).join(', ');
  const parts: string[] = [];
  if (offer.takeCounties.length) parts.push(`obtient ${names(offer.takeCounties)}`);
  if (offer.giveCounties.length) parts.push(`cède ${names(offer.giveCounties)}`);
  const net = offer.giveGold - offer.takeGold;
  if (net > 0) parts.push(`verse ${net} or`);
  if (net < 0) parts.push(`reçoit ${-net} or`);
  const text = `Traité entre ${displayName(state, me)} et ${displayName(state, them)} : ${me.name} ${parts.join(', ')}.`;
  if (fromId === state.playerId || t === state.playerId) chronicle(state, text, 'titre');
  else worldNews(state, text, 'titre', fromId);
  return true;
}

/**
 * L'IA propose parfois au joueur d'acheter un de ses comtés frontaliers, ou de lui en vendre
 * un quand elle manque d'or. Renvoie la proposition (comté, acheteur, vendeur, prix).
 */
export function aiLandOffer(
  ctx: Ctx,
  aiId: string,
): { countyId: string; buyer: string; seller: string; price: number } | undefined {
  const { state, rng } = ctx;
  const pl = state.playerId;
  const ai = state.characters[aiId];
  if (!ai?.alive || atWar(state, aiId, pl) || !rng.chance(T.aiOfferChance)) return undefined;
  const [lo, hi] = T.aiPriceRange;
  if (ai.gold < 0) {
    // Vendre : un comté frontalier du joueur, au prix qu'il vaut pour le joueur.
    const own = tradableCounties(state, aiId).filter((c) => touches(state, c, pl));
    if (
      own.length &&
      Object.values(state.counties).filter((c) => c.holderId === aiId).length > T.minKeep
    ) {
      const c = rng.pick(own);
      const price = Math.round((countyValue(state, c, pl) * rng.range(lo, hi)) / 10) * 10;
      return { countyId: c.id, buyer: pl, seller: aiId, price };
    }
    return undefined;
  }
  const mine = tradableCounties(state, pl).filter((c) => touches(state, c, aiId));
  if (!mine.length || Object.values(state.counties).filter((c) => c.holderId === pl).length < 3)
    return undefined;
  const c = rng.pick(mine);
  const price =
    Math.round((countyValue(state, c, aiId) * T.attachment * rng.range(lo, hi)) / 10) * 10;
  if (price > ai.gold) return undefined;
  return { countyId: c.id, buyer: aiId, seller: pl, price };
}

/** Exécute une cession négociée par événement (comté contre or). */
export function cession(
  ctx: Ctx,
  countyId: string,
  seller: string,
  buyer: string,
  price: number,
): boolean {
  const { state } = ctx;
  const c = state.counties[countyId];
  const b = state.characters[buyer];
  const s = state.characters[seller];
  if (!c || !b || !s || c.holderId !== seller || isCapital(c) || b.gold < price) {
    if (buyer === state.playerId || seller === state.playerId)
      notify(state, 'La cession n’a pu se faire : les conditions ont changé.');
    return false;
  }
  b.gold -= price;
  s.gold += price;
  cede(state, countyId, buyer);
  ensureCapitals(state);
  chronicle(
    state,
    `${displayName(state, s)} cède ${c.name} à ${displayName(state, b)} pour ${price} or.`,
    'titre',
  );
  return true;
}
