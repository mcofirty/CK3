/**
 * Négociation de paix : celui qui propose choisit le camp vainqueur, les comtés cédés et l'or.
 * L'autre chef de guerre accepte selon l'état de la guerre (score, lassitude, capitale
 * occupée, rapport de force) et la valeur de ce qu'il gagne ou perd. L'IA formule aussi ses
 * propositions au joueur, qu'il peut accepter, refuser ou contre-proposer.
 */
import { BALANCE } from '../data/balance';
import { capitalOf, countyRuler } from './realm';
import { newId, notify } from './context';
import type { Ctx } from './context';
import type { Acceptance, Factor } from './diplomacy';
import type { EventDef } from './events/types';
import type { County, GameState, PeaceTerms, War } from './state';
import { warSide } from './characters';
import { endWar, militaryStrength, scoreFor } from './war';

const P = BALANCE.peace;

export type PeaceMode = 'victoire' | 'blanche' | 'reddition';

/** Acceptation d'une paix ; `sure` : l'adversaire retrouve ses propres conditions. */
export interface PeaceAcceptance extends Acceptance {
  sure?: boolean;
}

export interface PeaceCandidate {
  id: string;
  value: number;
  status: 'occupe' | 'objectif' | 'eloigne';
  capital: boolean;
}

/** Les deux chefs de guerre. */
const leaders = (w: War) => [w.attackerId, w.defenderId];
const otherLeader = (w: War, id: string) => (w.attackerId === id ? w.defenderId : w.attackerId);

/** Camp (attaquant ou défenseur) d'un chef de guerre. */
function sideOfLeader(w: War, id: string): 'attaquant' | 'defenseur' {
  return w.attackerId === id ? 'attaquant' : 'defenseur';
}

/** Conditions d'usage selon le mode choisi par `proposerId`. */
export function modeOutcome(w: War, proposerId: string, mode: PeaceMode): PeaceTerms['outcome'] {
  if (mode === 'blanche') return 'blanche';
  const mine = sideOfLeader(w, proposerId);
  return mode === 'victoire' ? mine : mine === 'attaquant' ? 'defenseur' : 'attaquant';
}

/** Mode vu de `proposerId` pour des conditions données. */
export function termsMode(w: War, proposerId: string, t: PeaceTerms): PeaceMode {
  if (t.outcome === 'blanche') return 'blanche';
  return t.outcome === sideOfLeader(w, proposerId) ? 'victoire' : 'reddition';
}

const fixedStakes = (w: War) => w.cb === 'independance' || w.cb === 'dynastique';

/** Valeur d'un comté en points d'acceptation, pour le camp `winner`. */
export function countyPeaceValue(
  state: GameState,
  w: War,
  c: County,
  winner: 'attaquant' | 'defenseur',
): number {
  const base = P.countyBase + c.development * P.countyPerDev;
  const occupied =
    c.occupation?.warId === w.id &&
    warSide(state, w.id, c.occupation.byRulerId) ===
      (winner === 'attaquant' ? 'attacker' : 'defender');
  const status = occupied
    ? P.occupiedMult
    : w.targetCountyId === c.id
      ? P.objectiveMult
      : P.farMult;
  const capital = c.seatOf === c.holderId && c.seatOf ? P.capitalMult : 1;
  return Math.round(base * capital * status);
}

/**
 * Comtés que le vainqueur peut réclamer : tout le royaume du vaincu. Une capitale libre coûte très
 * cher en points d'acceptation (`capitalMult`, `farMult`) : on peut la demander, rarement l'obtenir.
 */
export function peaceCandidates(
  state: GameState,
  warId: string,
  outcome: PeaceTerms['outcome'],
): PeaceCandidate[] {
  const w = state.wars[warId];
  if (!w || outcome === 'blanche' || fixedStakes(w)) return [];
  const loser = outcome === 'attaquant' ? w.defenderId : w.attackerId;
  const winnerSide = warSide(state, w.id, outcome === 'attaquant' ? w.attackerId : w.defenderId);
  const out: PeaceCandidate[] = [];
  for (const c of Object.values(state.counties)) {
    if (countyRuler(state, c) !== loser) continue;
    const capital = !!c.seatOf && c.seatOf === c.holderId;
    const occupied =
      c.occupation?.warId === w.id && warSide(state, w.id, c.occupation.byRulerId) === winnerSide;
    out.push({
      id: c.id,
      value: countyPeaceValue(state, w, c, outcome),
      status: occupied ? 'occupe' : w.targetCountyId === c.id ? 'objectif' : 'eloigne',
      capital,
    });
  }
  return out.sort((a, b) => a.value - b.value);
}

/** Facteurs de lassitude et de situation de celui qui doit accepter (hors conditions). */
export function willingnessFactors(state: GameState, w: War, id: string): Factor[] {
  const f: Factor[] = [];
  const s = scoreFor(state, w, id);
  f.push({
    label: `État de la guerre (score ${Math.round(s)} de son point de vue)`,
    value: -s * P.scoreWeight,
  });
  const age = state.turn - w.startTurn;
  if (age > P.exhaustionStart)
    f.push({
      label: 'La guerre s’éternise',
      value: Math.min(P.exhaustionMax, (age - P.exhaustionStart) * P.exhaustionPerSeason),
    });
  const cap = capitalOf(state, id);
  if (cap?.occupation?.warId === w.id && cap.occupation.byRulerId !== id)
    f.push({ label: 'Sa capitale est occupée', value: P.capitalOccupied });
  const other = otherLeader(w, id);
  const ratio = militaryStrength(state, other) / Math.max(1, militaryStrength(state, id));
  const strength = Math.max(
    -P.strengthWeight,
    Math.min(P.strengthWeight, (ratio - 1) * P.strengthWeight),
  );
  if (Math.abs(strength) >= 1) f.push({ label: 'Rapport de force', value: strength });
  return f;
}

const sum = (f: Factor[]) => f.reduce((s, x) => s + x.value, 0);

/** Conditions d'usage (comme avant la négociation) : objectif, comtés occupés si conquête. */
export function defaultTerms(
  state: GameState,
  warId: string,
  outcome: PeaceTerms['outcome'],
): PeaceTerms {
  const w = state.wars[warId];
  const t: PeaceTerms = { warId, outcome, counties: [], gold: 0 };
  if (!w || outcome === 'blanche') return t;
  if (outcome === 'defenseur') {
    t.gold = Math.max(0, Math.min(Math.floor(state.characters[w.attackerId]?.gold ?? 0), 100));
    return t;
  }
  const cands = peaceCandidates(state, warId, outcome);
  const ids = new Set<string>();
  if (w.targetCountyId && cands.some((c) => c.id === w.targetCountyId)) ids.add(w.targetCountyId);
  if (w.cb === 'conquete') for (const c of cands) if (c.status === 'occupe') ids.add(c.id);
  t.counties = [...ids];
  return t;
}

/** Ce que réclame l'IA lorsqu'elle est le camp vainqueur : l'usage, plus des réparations. */
export function aiTerms(state: GameState, warId: string, aiId: string): PeaceTerms {
  const w = state.wars[warId];
  const outcome = w ? sideOfLeader(w, aiId) : 'attaquant';
  const t = defaultTerms(state, warId, outcome);
  if (!w || fixedStakes(w)) return t;
  const loser = otherLeader(w, aiId);
  const budget =
    sum(willingnessFactors(state, w, loser)) -
    t.counties.reduce((s, id) => s + countyPeaceValue(state, w, state.counties[id], outcome), 0);
  const cap = Math.max(0, state.characters[loser]?.gold ?? 0) * P.maxGoldShare;
  const gold = Math.min(cap, Math.max(0, budget * P.goldPerPoint));
  t.gold = Math.max(t.gold, Math.floor(gold / 10) * 10);
  return t;
}

/** Retire de la proposition ce qui n'est pas valable (comtés hors du royaume visé, or négatif). */
export function cleanTerms(state: GameState, t: PeaceTerms): PeaceTerms {
  const ok = new Set(peaceCandidates(state, t.warId, t.outcome).map((c) => c.id));
  return {
    ...t,
    counties: t.counties.filter((id) => ok.has(id)),
    gold: Math.max(0, Math.round(t.gold) || 0),
  };
}

/**
 * L'autre chef de guerre accepte-t-il ces conditions proposées par `proposerId` ?
 * Score ≥ 0 : accepté. Un vainqueur accepte aussi toujours ses propres conditions.
 */
export function peaceTermsAcceptance(
  state: GameState,
  terms: PeaceTerms,
  proposerId: string,
): PeaceAcceptance {
  const w = state.wars[terms.warId];
  const threshold = BALANCE.diplomacy.acceptThreshold;
  if (!w || !leaders(w).includes(proposerId))
    return { score: 0, factors: [], accept: false, blocked: 'Guerre introuvable' };
  const acceptor = otherLeader(w, proposerId);
  const winnerSide = terms.outcome;
  const acceptorWins = winnerSide !== 'blanche' && winnerSide === sideOfLeader(w, acceptor);
  const acceptorLoses = winnerSide !== 'blanche' && !acceptorWins;
  const f: Factor[] = willingnessFactors(state, w, acceptor);
  let blocked: string | undefined;
  let sure = false;

  // Comtés : ce qu'il gagne ou ce qu'il perd.
  const valid = new Set(peaceCandidates(state, terms.warId, terms.outcome).map((c) => c.id));
  const counties = terms.counties.filter((id) => valid.has(id));
  if (counties.length !== terms.counties.length) blocked = 'Un comté demandé n’est plus réclamable';
  if (counties.length && winnerSide !== 'blanche') {
    const value = counties.reduce(
      (s, id) => s + countyPeaceValue(state, w, state.counties[id], winnerSide),
      0,
    );
    const names = counties.map((id) => state.counties[id].name).join(', ');
    f.push(
      acceptorLoses
        ? { label: `Il cède ${names}`, value: -value }
        : { label: `Il reçoit ${names}`, value },
    );
  }

  // Or : qui paie.
  const gold = Math.max(0, Math.round(terms.gold));
  const payer =
    winnerSide === 'blanche'
      ? terms.payerId
      : winnerSide === 'attaquant'
        ? w.defenderId
        : w.attackerId;
  if (gold > 0 && payer) {
    const payerGold = Math.max(0, Math.floor(state.characters[payer]?.gold ?? 0));
    if (gold > payerGold)
      blocked = `${state.characters[payer].name} n’a que ${payerGold} or dans son trésor`;
    f.push(
      payer === acceptor
        ? { label: `Il verse ${gold} or`, value: -gold / P.goldPerPoint }
        : { label: `Il reçoit ${gold} or`, value: gold / P.goldPerPoint },
    );
  }
  if (gold > 0 && winnerSide === 'blanche' && payer !== proposerId && payer !== acceptor)
    blocked = 'Seul l’un des deux chefs peut verser de l’or';

  // Le vainqueur accepte toujours ce qu'il aurait lui-même réclamé.
  if (acceptorWins && !fixedStakes(w)) {
    const asked = aiTerms(state, terms.warId, acceptor);
    // (à 15 % près : la situation évolue un peu entre sa proposition et votre réponse)
    if (
      asked.counties.every((id) => counties.includes(id)) &&
      gold >= Math.floor(asked.gold * 0.85)
    )
      sure = true;
  }
  const score = Math.round(sum(f));
  return {
    score,
    factors: f.map((x) => ({ ...x, value: Math.round(x.value) })),
    accept: !blocked && (sure || score >= threshold),
    blocked,
    sure: sure && !blocked,
  };
}

/**
 * Ajuste l'or pour que la proposition soit tout juste acceptée (dans les limites des
 * trésors) : on verse de quoi convaincre, ou l'on réclame ce que l'autre est prêt à payer.
 */
export function balanceTerms(state: GameState, terms: PeaceTerms, proposerId: string): PeaceTerms {
  const w = state.wars[terms.warId];
  if (!w) return terms;
  const t = cleanTerms(state, terms);
  const acc = peaceTermsAcceptance(state, { ...t, gold: 0 }, proposerId);
  const acceptor = otherLeader(w, proposerId);
  // Points manquants (+) ou en trop (−), hors or.
  const missing = BALANCE.diplomacy.acceptThreshold - acc.score;
  const treasury = (id: string) => Math.max(0, Math.floor(state.characters[id]?.gold ?? 0));
  const up = (pts: number) => Math.ceil((Math.max(0, pts) * P.goldPerPoint) / 10) * 10;
  const down = (pts: number) => Math.floor((Math.max(0, pts) * P.goldPerPoint) / 10) * 10;
  if (t.outcome === 'blanche') {
    t.payerId = proposerId;
    t.gold = Math.min(treasury(proposerId), up(missing));
  } else if (t.outcome === sideOfLeader(w, proposerId)) {
    // Il réclame de l'or : au plus ce que l'autre peut payer sans refuser.
    t.gold = Math.min(treasury(acceptor), down(-missing));
  } else {
    // Il offre de l'or pour acheter la paix.
    t.gold = Math.min(treasury(proposerId), up(missing));
  }
  return t;
}

/** Conditions de départ pour un mode (fenêtre de négociation). */
export function termsForMode(
  state: GameState,
  warId: string,
  proposerId: string,
  mode: PeaceMode,
): PeaceTerms {
  const w = state.wars[warId];
  if (!w) return { warId, outcome: 'blanche', counties: [], gold: 0 };
  const outcome = modeOutcome(w, proposerId, mode);
  if (outcome === 'blanche') return { warId, outcome, counties: [], gold: 0, payerId: proposerId };
  if (outcome !== sideOfLeader(w, proposerId)) {
    // Reddition : ce que réclamerait l'adversaire.
    return aiTerms(state, warId, otherLeader(w, proposerId));
  }
  // Victoire : l'usage, sans les comtés trop chers pour l'état de la guerre.
  const t = defaultTerms(state, warId, outcome);
  const value = (id: string) => countyPeaceValue(state, w, state.counties[id], outcome);
  t.counties.sort((a, b) => value(a) - value(b));
  while (t.counties.length && !peaceTermsAcceptance(state, t, proposerId).accept) t.counties.pop();
  return t;
}

/** Conclut la paix si l'autre chef accepte ; renvoie vrai si la guerre prend fin. */
export function negotiatePeace(ctx: Ctx, proposerId: string, terms: PeaceTerms): boolean {
  const { state } = ctx;
  const w = state.wars[terms.warId];
  if (!w) return false;
  const t = cleanTerms(state, terms);
  const acc = peaceTermsAcceptance(state, t, proposerId);
  if (!acc.accept) {
    if (proposerId === state.playerId)
      notify(
        state,
        `${state.characters[otherLeader(w, proposerId)].name} rejette votre proposition de paix.`,
      );
    return false;
  }
  endWar(ctx, terms.warId, t.outcome, t);
  return true;
}

/** Proposition de paix de l'IA au joueur : un événement avec conditions modifiables. */
export function proposePeaceToPlayer(ctx: Ctx, w: War, aiId: string, terms: PeaceTerms): void {
  const { state } = ctx;
  const id = `sys_paix_${w.id}`;
  if (state.pendingEvents.some((e) => e.eventId === id)) return;
  const ai = state.characters[aiId];
  const demands = terms.outcome !== 'blanche' && terms.outcome === sideOfLeader(w, aiId);
  const def: EventDef = {
    id,
    titre: demands ? 'Exigences de l’ennemi' : 'Une offre de paix',
    texte: demands
      ? `${ai.name} juge la guerre « ${w.name} » gagnée et propose la paix à ses conditions. Vous pouvez les accepter, les refuser, ou négocier : à 100 de score, la paix vous serait imposée.`
      : `${ai.name}, en mauvaise posture dans la guerre « ${w.name} », propose la paix. Vous pouvez l’accepter, la refuser, ou négocier de meilleures conditions.`,
    categorie: 'systeme',
    declencheur: { type: 'suite' },
    poids: 0,
    choix: [
      {
        libelle: 'Accepter ses conditions',
        effets: [
          {
            paix: {
              warId: w.id,
              issue: terms.outcome,
              termes: { comtes: terms.counties, or: terms.gold, payeur: terms.payerId },
            },
          },
        ],
      },
      { libelle: 'Refuser et poursuivre la guerre', effets: demands ? [{ prestige: 5 }] : [] },
    ],
  };
  state.pendingEvents.push({
    uid: newId(state, 'e'),
    eventId: id,
    scope: { ennemi: aiId },
    inline: def,
    peace: { proposerId: aiId, terms },
  });
  state.eventCooldowns[id] = state.turn;
}

/** Retire un événement de proposition de paix déjà réglé par contre-proposition. */
export function dropPeaceEvent(state: GameState, uid: string): void {
  state.pendingEvents = state.pendingEvents.filter((e) => e.uid !== uid);
}
