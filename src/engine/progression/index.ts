/**
 * Progression : expérience et talents des personnages (perdus à leur mort),
 * héritages de la maison achetés avec la renommée (conservés jusqu'à la fin).
 */
import { BALANCE } from '../../data/balance';
import { LEGACIES, PERKS, type PerkDef } from '../../data/perks';
import { isAdult, perkBonus, skill } from '../characters';
import { clamp, notify, type Ctx } from '../context';
import {
  SKILL_KEYS,
  type Character,
  type CharacterRecord,
  type GameState,
  type SkillKey,
} from '../state';

const P = BALANCE.progression;

// ---------------------------------------------------------------------------
// Expérience et talents
// ---------------------------------------------------------------------------

export function xpTotal(c: Character): number {
  return SKILL_KEYS.reduce((s, k) => s + (c.xp?.[k] ?? 0), 0);
}

/** Points de talent encore à dépenser. */
export function perkPoints(c: Character): number {
  return Math.max(0, Math.floor(xpTotal(c) / P.xpPerPoint) - (c.perks?.length ?? 0));
}

/** Progression vers le prochain point (0 à 1). */
export function xpProgress(c: Character): number {
  return (xpTotal(c) % P.xpPerPoint) / P.xpPerPoint;
}

export function gainXp(state: GameState, c: Character | undefined, k: SkillKey, n: number): void {
  if (!c?.alive || n <= 0) return;
  const before = perkPoints(c);
  const xp = (c.xp ??= {});
  xp[k] = (xp[k] ?? 0) + n * (1 + perkBonus(state, c, 'xpGain'));
  if (c.id === state.playerId && perkPoints(c) > before)
    notify(state, 'Un nouveau talent peut être choisi dans votre arbre de compétences.');
}

export function record(c: Character): CharacterRecord {
  return (c.record ??= { battles: 0, wins: 0, duels: 0, plots: 0, buildings: 0, ambitions: 0 });
}

export function canTakePerk(c: Character, id: string): { ok: boolean; reason?: string } {
  const p = PERKS[id];
  if (!p) return { ok: false, reason: 'Talent inconnu' };
  if (c.perks?.includes(id)) return { ok: false, reason: 'Déjà acquis' };
  if (
    p.tier > 1 &&
    !(c.perks ?? []).some((x) => PERKS[x]?.branch === p.branch && PERKS[x].tier === p.tier - 1)
  )
    return { ok: false, reason: `Demande un talent de rang ${p.tier - 1}` };
  if (perkPoints(c) < 1) return { ok: false, reason: 'Aucun point disponible' };
  return { ok: true };
}

export function takePerk(state: GameState, c: Character, id: string): boolean {
  if (!canTakePerk(c, id).ok) return false;
  (c.perks ??= []).push(id);
  if (c.id === state.playerId) notify(state, `Talent acquis : ${PERKS[id].name}.`);
  return true;
}

/** Les personnages non joueurs dépensent leurs points dans leurs meilleures branches. */
export function autoPerks(ctx: Ctx, c: Character): void {
  let guard = 0;
  while (perkPoints(c) > 0 && guard++ < 6) {
    const options = Object.values(PERKS).filter((p) => canTakePerk(c, p.id).ok);
    if (!options.length) return;
    const pick = ctx.rng.weighted(
      options,
      (p: PerkDef) => 1 + skill(c, p.branch) + (c.xp?.[p.branch] ?? 0) / 50,
    );
    if (!pick) return;
    (c.perks ??= []).push(pick.id);
  }
}

// ---------------------------------------------------------------------------
// Héritages de la maison
// ---------------------------------------------------------------------------

export function renownAvailable(state: GameState, dynastyId: string): number {
  const d = state.dynasties[dynastyId];
  return d ? Math.max(0, Math.floor(d.renown - (d.renownSpent ?? 0))) : 0;
}

export function legacyCost(id: string): number {
  const l = LEGACIES[id];
  return l ? P.legacyCost[l.tier - 1] : Infinity;
}

export function canTakeLegacy(
  state: GameState,
  dynastyId: string,
  id: string,
): { ok: boolean; reason?: string; cost: number } {
  const l = LEGACIES[id];
  const d = state.dynasties[dynastyId];
  const cost = legacyCost(id);
  if (!l || !d) return { ok: false, reason: 'Héritage inconnu', cost };
  if (d.legacies?.includes(id)) return { ok: false, reason: 'Déjà acquis', cost };
  if (
    l.tier > 1 &&
    !(d.legacies ?? []).some(
      (x) => LEGACIES[x]?.branch === l.branch && LEGACIES[x].tier === l.tier - 1,
    )
  )
    return { ok: false, reason: `Demande l’héritage de rang ${l.tier - 1}`, cost };
  if (renownAvailable(state, dynastyId) < cost)
    return { ok: false, reason: `Il faut ${cost} de renommée`, cost };
  return { ok: true, cost };
}

export function takeLegacy(state: GameState, dynastyId: string, id: string): boolean {
  const chk = canTakeLegacy(state, dynastyId, id);
  if (!chk.ok) return false;
  const d = state.dynasties[dynastyId];
  d.renownSpent = (d.renownSpent ?? 0) + chk.cost;
  (d.legacies ??= []).push(id);
  if (dynastyId === state.playerDynastyId)
    notify(state, `Héritage de la maison : ${LEGACIES[id].name}.`);
  return true;
}

/** Bonus d'éducation des héritages, appliqués à la majorité. */
export function legacyEducation(state: GameState, c: Character): void {
  const d = c.dynastyId ? state.dynasties[c.dynastyId] : undefined;
  for (const l of d?.legacies ?? []) {
    const ed = LEGACIES[l]?.education;
    if (!ed) continue;
    for (const k of SKILL_KEYS)
      if (ed[k]) c.skills[k] = clamp(c.skills[k] + ed[k]!, 0, BALANCE.characters.maxSkill);
  }
}

// ---------------------------------------------------------------------------
// Saison
// ---------------------------------------------------------------------------

function bestSkill(c: Character): SkillKey {
  return [...SKILL_KEYS].sort((a, b) => skill(c, b) - skill(c, a))[0];
}

/** Expérience de saison, talents de l'IA, renommée et bonus par saison. */
export function seasonProgression(ctx: Ctx): void {
  const { state } = ctx;
  const postSkill: Record<string, SkillKey> = {
    chancelier: 'diplomatie',
    marechal: 'guerre',
    intendant: 'gestion',
    espion: 'ruse',
    chapelain: 'savoir',
  };
  const rulers = new Set(Object.values(state.counties).map((c) => c.holderId));
  for (const c of Object.values(state.characters)) {
    if (!c.alive || !isAdult(state, c) || c.imprisonedBy) continue;
    // Les personnages lointains et sans terre progressent sans calcul inutile.
    const relevant =
      rulers.has(c.id) || c.dynastyId === state.playerDynastyId || c.courtId === state.playerId;
    if (!relevant) continue;
    gainXp(state, c, c.educationFocus ?? bestSkill(c), P.seasonXp);
    if (rulers.has(c.id)) gainXp(state, c, bestSkill(c), P.rulerSeasonXp);
    if (c.dynastyId !== state.playerDynastyId) autoPerks(ctx, c);
  }
  for (const [post, seat] of Object.entries(state.council)) {
    const h = seat.holderId ? state.characters[seat.holderId] : undefined;
    if (h) gainXp(state, h, postSkill[post], P.councilXp);
  }
  // Prestige, piété et renommée par saison des talents et héritages.
  for (const id of rulers) {
    const c = state.characters[id];
    if (!c?.alive) continue;
    c.prestige += perkBonus(state, c, 'prestige');
    c.piety += perkBonus(state, c, 'piety');
  }
  for (const d of Object.values(state.dynasties)) {
    const members = Object.values(state.characters).filter(
      (c) => c.alive && c.dynastyId === d.id && rulers.has(c.id),
    );
    if (!members.length) continue;
    const counties = Object.values(state.counties).filter((k) =>
      members.some((m) => m.id === k.holderId),
    ).length;
    const head = members.find((m) => m.id === state.playerId) ?? members[0];
    d.renown += Math.min(P.renownCap, P.renownBase + P.renownPerCounty * counties);
    d.renown += perkBonus(state, head, 'renown');
  }
}
