/**
 * Influence dans les cours étrangères et succession des royaumes : ligne de succession,
 * héritier attendu, soutien d'un candidat (acclamé par les Grands à la mort du souverain
 * si l'influence suffit), et poids de l'influence dans les négociations.
 */
import { BALANCE } from '../data/balance';
import {
  addOpinion,
  atWar,
  displayName,
  livingChildren,
  parentsOf,
  siblingsOf,
} from './characters';
import { heirsOf } from './characters/lifecycle';
import { clamp, notify, worldNews } from './context';
import type { Factor } from './diplomacy';
import { familyTie } from './crowns';
import { isIndependent, independentRulers } from './realm';
import type { Character, GameState } from './state';

const I = BALANCE.influence;

export const influenceOf = (state: GameState, rulerId: string): number =>
  state.influence?.[rulerId]?.points ?? 0;

export const supportOf = (state: GameState, rulerId: string): string | undefined =>
  state.influence?.[rulerId]?.supportId;

export function gainInfluence(state: GameState, rulerId: string, amount: number): void {
  if (rulerId === state.playerId || !isIndependent(state, rulerId)) return;
  const e = ((state.influence ??= {})[rulerId] ??= { points: 0 });
  e.points = clamp(e.points + amount, 0, I.max);
}

/** Lien de parenté de `c` avec le souverain `r`, pour la ligne de succession. */
export function kinLabel(state: GameState, r: Character, c: Character): string {
  const f = c.female;
  if (c.id === r.id) return f ? 'Souveraine' : 'Souverain';
  if (r.childrenIds.includes(c.id)) return f ? 'Fille' : 'Fils';
  if (r.childrenIds.some((k) => state.characters[k]?.childrenIds.includes(c.id)))
    return f ? 'Petite-fille' : 'Petit-fils';
  if (siblingsOf(state, r).some((s) => s.id === c.id)) return f ? 'Sœur' : 'Frère';
  if (siblingsOf(state, r).some((s) => s.childrenIds.includes(c.id))) return f ? 'Nièce' : 'Neveu';
  if (parentsOf(state, r).some((p) => p.id === c.id)) return f ? 'Mère' : 'Père';
  if (c.dynastyId && c.dynastyId === r.dynastyId) return 'Parent de la maison';
  return 'Parent éloigné';
}

/** Ligne de succession (sans les captifs d'autrui), dans l'ordre. */
export function successionLine(state: GameState, rulerId: string, n = I.lineLength): Character[] {
  const r = state.characters[rulerId];
  if (!r) return [];
  return heirsOf(state, r)
    .filter((h) => !h.imprisonedBy || h.imprisonedBy === rulerId)
    .slice(0, n);
}

/** Candidats que l'on peut soutenir : la ligne de succession et les prétendants de sang. */
export function supportCandidates(state: GameState, rulerId: string): Character[] {
  const r = state.characters[rulerId];
  if (!r) return [];
  const line = successionLine(state, rulerId);
  const claimants = Object.values(state.characters).filter(
    (c) =>
      c.alive &&
      c.id !== rulerId &&
      !!r.dynastyId &&
      c.houseClaims?.includes(r.dynastyId) &&
      !line.includes(c),
  );
  return [...line, ...claimants];
}

/** Seuil d'influence pour faire acclamer ce candidat. */
export function acclaimThreshold(state: GameState, rulerId: string, candidateId: string): number {
  const inLine = successionLine(state, rulerId).some((c) => c.id === candidateId);
  return inLine ? I.supportThreshold : I.outsiderThreshold;
}

export function setSupport(state: GameState, rulerId: string, candidateId?: string): boolean {
  if (candidateId && !supportCandidates(state, rulerId).some((c) => c.id === candidateId))
    return false;
  const e = ((state.influence ??= {})[rulerId] ??= { points: 0 });
  e.supportId = candidateId;
  return true;
}

/** Courtiser les Grands d'une cour : or contre influence. */
export function courtGrandees(state: GameState, fromId: string, rulerId: string): boolean {
  const me = state.characters[fromId];
  if (!me || me.gold < I.courtGold || !isIndependent(state, rulerId) || rulerId === fromId)
    return false;
  if (atWar(state, fromId, rulerId)) return false;
  me.gold -= I.courtGold;
  state.characters[rulerId].gold += I.courtGold / 2;
  gainInfluence(state, rulerId, I.courtGain);
  return true;
}

/** Facteur d'acceptation : votre influence à la cour de ce souverain. */
export function influenceFactor(state: GameState, rulerId: string): Factor[] {
  const p = influenceOf(state, rulerId);
  return p >= 5 ? [{ label: 'Votre influence à sa cour', value: p * I.acceptancePerPoint }] : [];
}

/** Saison : l'influence s'érode ; les liens de famille l'entretiennent. */
export function seasonInfluence(state: GameState): void {
  const pl = state.playerId;
  for (const r of independentRulers(state)) {
    if (r === pl) continue;
    if (familyTie(state, pl, r)) gainInfluence(state, r, I.familyTie);
  }
  for (const [id, e] of Object.entries(state.influence ?? {})) {
    if (!isIndependent(state, id) || id === pl) {
      delete state.influence![id];
      continue;
    }
    e.points = clamp(e.points - I.decay, 0, I.max);
    const s = e.supportId ? state.characters[e.supportId] : undefined;
    if (e.supportId && !s?.alive) e.supportId = undefined;
  }
}

/** À la mort d'un souverain : le candidat soutenu est-il acclamé par les Grands ? */
export function acclaimedHeir(state: GameState, dead: Character): Character | undefined {
  const e = state.influence?.[dead.id];
  const c = e?.supportId ? state.characters[e.supportId] : undefined;
  if (!e || !c?.alive || (c.imprisonedBy && c.imprisonedBy !== dead.id)) return undefined;
  const ok = supportCandidates(state, dead.id).some((x) => x.id === c.id);
  if (!ok || e.points < acclaimThreshold(state, dead.id, c.id)) return undefined;
  return c;
}

/**
 * Applique une acclamation : l'élu doit sa couronne au joueur, l'héritier écarté lui en veut.
 * L'influence se transfère au nouveau souverain, diminuée du coût de l'acclamation.
 */
export function afterSuccession(
  state: GameState,
  deadId: string,
  heir: Character,
  passedOver?: Character,
): void {
  const e = state.influence?.[deadId];
  if (!e) return;
  delete state.influence![deadId];
  const pl = state.playerId;
  if (passedOver) {
    addOpinion(state, heir.id, pl, 'Me doit sa couronne', I.owedCrownOpinion, 0);
    addOpinion(state, passedOver.id, pl, 'M’a volé ma couronne', I.passedOverOpinion, 0);
    addOpinion(state, passedOver.id, heir.id, 'Usurpateur', I.passedOverOpinion, 0);
    const text = `Les Grands acclament ${displayName(state, heir)} au lieu de ${displayName(state, passedOver)}.`;
    if (heir.id === pl) notify(state, `${text} Votre influence vous a valu une couronne.`);
    else notify(state, `${text} Votre influence a fait un roi.`);
    worldNews(state, text, 'succession', heir.id);
    e.points -= I.acclaimCost;
  }
  if (heir.id !== pl && isIndependent(state, heir.id)) {
    (state.influence ??= {})[heir.id] = { points: Math.max(0, e.points) };
  }
}

/** Un droit soutenu par une forte influence devient fort (claimInfo). */
export function backedByGrandees(state: GameState, rulerId: string, claimantId: string): boolean {
  const e = state.influence?.[rulerId];
  return !!e && e.supportId === claimantId && e.points >= I.supportThreshold;
}

/** Nombre d'enfants vivants (affichage). */
export const childrenCount = (state: GameState, c: Character): number =>
  livingChildren(state, c).length;
