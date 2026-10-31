/** Moteur d'événements narratifs et langage d'effets (section 6). */
import { BALANCE } from '../../data/balance';
import { ALL_EVENTS } from '../../data/events';
import { SEASON_KEYS } from '../../data/names';
import { TRAITS } from '../../data/traits';
import {
  addOpinion,
  addTrait,
  ageOf,
  allied,
  char,
  displayName,
  hasTrait,
  healthOf,
  isAdult,
  livingChildren,
  opinion,
  player,
  removeTrait,
  skill,
} from '../characters';
import { giveBirth, heirsOf, killCharacter } from '../characters/lifecycle';
import { chronicle, clamp, newId, notify, seasonOf, yearOf, type Ctx } from '../context';
import { celebrateMarriage, makeAlliance } from '../diplomacy';
import { startPlot } from '../intrigue';
import { countyRuler, independentRulers, realmCounties, vassalsOf } from '../realm';
import { SKILL_LABELS, type GameState } from '../state';
import { armyOf, courtiersOf, declareWar, endWar, joinWar, warBetween } from '../war';
import type { Condition, Effect, EventDef, Role } from './types';

export const EVENTS: Record<string, EventDef> = Object.fromEntries(
  ALL_EVENTS.map((e) => [e.id, e]),
);

export function eventDef(
  _state: GameState,
  inst: { eventId: string; inline?: EventDef },
): EventDef | undefined {
  return inst.inline ?? EVENTS[inst.eventId];
}

// ---------------------------------------------------------------------------
// Rôles
// ---------------------------------------------------------------------------

const ROLE_PATTERNS: Record<Role, RegExp> = {
  souverain: /\{souverain\./,
  conjoint: /(\{conjoint\.|"conjoint"|"conjoint_)/,
  heritier: /(\{heritier\.|"heritier"|"heritier_)/,
  enfant: /(\{enfant\.|"enfant"|"enfant_)/,
  vassal: /(\{vassal\.|"vassal"|_vassal_|"vassal_)/,
  rival: /(\{rival\.|"rival"|"rival_opinion)/,
  courtisan: /(\{courtisan\.|"courtisan"|"courtisan_)/,
  comte: /(\{comte\.|"comte"|"comte_developpement)/,
  comte_rival: /(\{comte_rival\.|"comte_rival")/,
  complotiste: /(\{complotiste\.|"complotiste")/,
  prisonnier: /(\{prisonnier\.|"prisonnier")/,
};

const roleCache = new Map<string, Role[]>();
export function rolesOf(def: EventDef): Role[] {
  const cached = roleCache.get(def.id);
  if (cached && !def.id.startsWith('sys_')) return cached;
  const json = JSON.stringify({ t: def.texte, c: def.conditions, ch: def.choix });
  const roles = (Object.keys(ROLE_PATTERNS) as Role[]).filter(
    (r) => r !== 'souverain' && ROLE_PATTERNS[r].test(json),
  );
  roleCache.set(def.id, roles);
  return roles;
}

function candidates(ctx: Ctx, role: Role): string[] {
  const { state } = ctx;
  const p = player(state);
  switch (role) {
    case 'souverain':
      return [p.id];
    case 'conjoint':
      return p.spouseId && state.characters[p.spouseId]?.alive ? [p.spouseId] : [];
    case 'heritier': {
      const h = heirsOf(state, p)[0];
      return h && p.childrenIds.includes(h.id) ? [h.id] : [];
    }
    case 'enfant':
      return livingChildren(state, p).map((c) => c.id);
    case 'vassal':
      return vassalsOf(state, p.id);
    case 'rival':
      return independentRulers(state).filter((r) => r !== p.id);
    case 'courtisan':
      return courtiersOf(state, p.id)
        .filter((c) => isAdult(state, c) && c.dynastyId !== p.dynastyId && c.id !== p.spouseId)
        .map((c) => c.id);
    case 'comte':
      return Object.values(state.counties)
        .filter((c) => c.holderId === p.id)
        .map((c) => c.id);
    case 'comte_rival': {
      const mine = new Set(realmCounties(state, p.id).map((c) => c.id));
      return Object.values(state.counties)
        .filter(
          (c) =>
            !mine.has(c.id) &&
            c.adjacent.some((n) => mine.has(n)) &&
            countyRuler(state, c) !== p.id,
        )
        .map((c) => c.id);
    }
    default:
      return [];
  }
}

// ---------------------------------------------------------------------------
// Conditions
// ---------------------------------------------------------------------------

export function checkCondition(
  state: GameState,
  cond: Condition,
  scope: Record<string, string>,
): boolean {
  const p = player(state);
  const sc = (r: string) => (scope[r] ? state.characters[scope[r]] : undefined);
  for (const [k, v] of Object.entries(cond)) {
    switch (k) {
      case 'or_min':
        if (p.gold < (v as number)) return false;
        break;
      case 'or_max':
        if (p.gold > (v as number)) return false;
        break;
      case 'prestige_min':
        if (p.prestige < (v as number)) return false;
        break;
      case 'piete_min':
        if (p.piety < (v as number)) return false;
        break;
      case 'piete_max':
        if (p.piety > (v as number)) return false;
        break;
      case 'sante_max':
        if (healthOf(p) > (v as number)) return false;
        break;
      case 'age_min':
        if (ageOf(state, p) < (v as number)) return false;
        break;
      case 'age_max':
        if (ageOf(state, p) > (v as number)) return false;
        break;
      case 'trait':
        if (!hasTrait(p, v as string)) return false;
        break;
      case 'pas_trait':
        if (hasTrait(p, v as string)) return false;
        break;
      case 'en_guerre':
        if (
          Object.values(state.wars).some((w) =>
            [w.attackerId, w.defenderId, ...w.attackerAllies, ...w.defenderAllies].includes(p.id),
          ) !== v
        )
          return false;
        break;
      case 'a_conjoint':
        if (!!(p.spouseId && state.characters[p.spouseId]?.alive) !== v) return false;
        break;
      case 'comtes_min':
        if (realmCounties(state, p.id).length < (v as number)) return false;
        break;
      case 'competence_min': {
        const c = v as { competence: keyof typeof SKILL_LABELS; valeur: number };
        if (skill(p, c.competence) < c.valeur) return false;
        break;
      }
      case 'competence_max': {
        const c = v as { competence: keyof typeof SKILL_LABELS; valeur: number };
        if (skill(p, c.competence) > c.valeur) return false;
        break;
      }
      case 'opinion_vassal_max': {
        const x = sc('vassal');
        if (!x || opinion(state, x.id, p.id) > (v as number)) return false;
        break;
      }
      case 'opinion_vassal_min': {
        const x = sc('vassal');
        if (!x || opinion(state, x.id, p.id) < (v as number)) return false;
        break;
      }
      case 'vassal_trait': {
        const x = sc('vassal');
        if (!x || !hasTrait(x, v as string)) return false;
        break;
      }
      case 'enfant_age_min': {
        const x = sc('enfant');
        if (!x || ageOf(state, x) < (v as number)) return false;
        break;
      }
      case 'enfant_age_max': {
        const x = sc('enfant');
        if (!x || ageOf(state, x) > (v as number)) return false;
        break;
      }
      case 'heritier_age_min': {
        const x = sc('heritier');
        if (!x || ageOf(state, x) < (v as number)) return false;
        break;
      }
      case 'heritier_age_max': {
        const x = sc('heritier');
        if (!x || ageOf(state, x) > (v as number)) return false;
        break;
      }
      case 'conjoint_trait': {
        const x = sc('conjoint');
        if (!x || !hasTrait(x, v as string)) return false;
        break;
      }
      case 'courtisan_trait': {
        const x = sc('courtisan');
        if (!x || !hasTrait(x, v as string)) return false;
        break;
      }
      case 'rival_opinion_max': {
        const x = sc('rival');
        if (!x || opinion(state, x.id, p.id) > (v as number)) return false;
        break;
      }
      case 'comte_developpement_max': {
        const c = scope.comte ? state.counties[scope.comte] : undefined;
        if (!c || c.development > (v as number)) return false;
        break;
      }
      case 'comte_developpement_min': {
        const c = scope.comte ? state.counties[scope.comte] : undefined;
        if (!c || c.development < (v as number)) return false;
        break;
      }
      case 'armee_levee':
        if (!!armyOf(state, p.id) !== v) return false;
        break;
      case 'annee_min':
        if (state.turn / 4 < (v as number)) return false;
        break;
      default:
        break;
    }
  }
  return true;
}

export function checkAll(
  state: GameState,
  conds: Condition[] | undefined,
  scope: Record<string, string>,
): boolean {
  return (conds ?? []).every((c) => checkCondition(state, c, scope));
}

/** Construit un contexte de rôles satisfaisant les conditions, ou null. */
export function buildScope(
  ctx: Ctx,
  def: EventDef,
  preset: Record<string, string> = {},
): Record<string, string> | null {
  const scope: Record<string, string> = { souverain: ctx.state.playerId, ...preset };
  const roles = rolesOf(def).filter((r) => !scope[r]);
  // Tirage de candidats ; plusieurs essais pour satisfaire les conditions.
  for (let attempt = 0; attempt < 6; attempt++) {
    const s = { ...scope };
    let ok = true;
    for (const r of roles) {
      const list = candidates(ctx, r);
      if (!list.length) {
        ok = false;
        break;
      }
      s[r] = ctx.rng.pick(list);
    }
    if (!ok) return null;
    if (checkAll(ctx.state, def.conditions, s)) return s;
    if (!roles.length) return null;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Texte
// ---------------------------------------------------------------------------

/** Texte d'un événement (variante tirée au sort lors de sa mise en file). */
export function eventText(def: EventDef, scope: Record<string, string>): string {
  if (typeof def.texte === 'string') return def.texte;
  const i = Number(scope._v ?? 0);
  return def.texte[Math.min(def.texte.length - 1, Math.max(0, i))] ?? '';
}

export function renderText(state: GameState, text: string, scope: Record<string, string>): string {
  return text.replace(
    /\{(\w+)\.(\w+)\}|\{(annee|saison)\}/g,
    (m, role: string, field: string, special: string) => {
      if (special === 'annee') return String(yearOf(state));
      if (special === 'saison')
        return ['printemps', 'été', 'automne', 'hiver'][seasonOf(state.turn)];
      const id = scope[role];
      if (!id) return m;
      if (state.counties[id]) return field === 'nom' ? state.counties[id].name : m;
      const c = state.characters[id];
      if (!c) return '—';
      if (field === 'nom') return c.name;
      if (field === 'nom_complet') return displayName(state, c);
      if (field === 'age') return String(ageOf(state, c));
      if (field === 'il') return c.female ? 'elle' : 'il';
      if (field === 'Il') return c.female ? 'Elle' : 'Il';
      if (field === 'le') return c.female ? 'la' : 'le';
      if (field === 'fils') return c.female ? 'fille' : 'fils';
      if (field === 'e') return c.female ? 'e' : '';
      return m;
    },
  );
}

const sign = (n: number) => (n > 0 ? `+${n}` : `${n}`);

/** Effets connus d'un choix, affichés avant validation. */
export function effectLabels(
  state: GameState,
  effects: Effect[],
  scope: Record<string, string>,
): string[] {
  const name = (r: string) => {
    const id = scope[r];
    if (!id) return r;
    return state.counties[id]?.name ?? state.characters[id]?.name ?? r;
  };
  const out: string[] = [];
  for (const e of effects) {
    if (e.hasard) {
      const pct = Math.round(e.hasard.chance * 100);
      const ok = effectLabels(state, e.hasard.succes, scope).join(', ') || 'rien';
      const ko = effectLabels(state, e.hasard.echec, scope).join(', ') || 'rien';
      out.push(`🎲 ${pct} % : ${ok} — sinon : ${ko}`);
    }
    if (e.or) out.push(`${sign(e.or)} or`);
    if (e.prestige) out.push(`${sign(e.prestige)} prestige`);
    if (e.piete) out.push(`${sign(e.piete)} piété`);
    if (e.renommee) out.push(`${sign(e.renommee)} renommée`);
    if (e.opinion) out.push(`Opinion de ${name(e.opinion.cible)} : ${sign(e.opinion.valeur)}`);
    if (e.opinion_vassaux) out.push(`Opinion des vassaux : ${sign(e.opinion_vassaux)}`);
    if (e.trait_ajout) {
      const t =
        typeof e.trait_ajout === 'string'
          ? { cible: 'souverain', trait: e.trait_ajout }
          : e.trait_ajout;
      out.push(
        `${t.cible === 'souverain' ? 'Vous gagnez' : `${name(t.cible)} gagne`} le trait ${TRAITS[t.trait]?.name ?? t.trait}`,
      );
    }
    if (e.trait_retrait) {
      const t =
        typeof e.trait_retrait === 'string'
          ? { cible: 'souverain', trait: e.trait_retrait }
          : e.trait_retrait;
      out.push(
        `${t.cible === 'souverain' ? 'Vous perdez' : `${name(t.cible)} perd`} le trait ${TRAITS[t.trait]?.name ?? t.trait}`,
      );
    }
    if (e.sante !== undefined) {
      const s = typeof e.sante === 'number' ? { cible: 'souverain', valeur: e.sante } : e.sante;
      out.push(`Santé${s.cible === 'souverain' ? '' : ` de ${name(s.cible)}`} : ${sign(s.valeur)}`);
    }
    if (e.competence)
      out.push(
        `${SKILL_LABELS[e.competence.competence]}${e.competence.cible && e.competence.cible !== 'souverain' ? ` de ${name(e.competence.cible)}` : ''} : ${sign(e.competence.valeur)}`,
      );
    if (e.revendication) out.push(`Revendication sur ${name(e.revendication)}`);
    if (e.guerre)
      out.push(
        e.guerre.attaquant === 'rival'
          ? `${name('rival')} vous déclare la guerre`
          : `Guerre contre ${name('rival')}`,
      );
    if (e.complot) out.push(`Complot contre ${name(e.complot.cible)}`);
    if (e.naissance) out.push('Un enfant pourrait naître');
    if (e.deces) out.push(`Mort de ${name(e.deces)}`);
    if (e.developpement) out.push(`Développement de ${name('comte')} : ${sign(e.developpement)}`);
    if (e.ravitaillement) out.push(`Ravitaillement : ${sign(e.ravitaillement)}`);
    if (e.levees) out.push(`Levées : ${sign(e.levees)} hommes`);
    if (e.ami) out.push(`${name(e.ami)} devient votre ami`);
    if (e.devient_rival) out.push(`${name(e.devient_rival)} devient votre rival`);
    if (e.emprisonner) out.push(`${name(e.emprisonner)} est emprisonné`);
    if (e.liberer) out.push(`${name(e.liberer)} est libéré`);
    if (e.exiler) out.push(`${name(e.exiler)} quitte la cour`);
    if (e.mariage)
      out.push(
        `Mariage de ${state.characters[e.mariage.a]?.name} et ${state.characters[e.mariage.b]?.name}`,
      );
    if (e.alliance) out.push(`Alliance avec ${state.characters[e.alliance]?.name}`);
    if (e.paix) out.push(e.paix.issue === 'blanche' ? 'Paix blanche' : 'Fin de la guerre');
    if (e.rejoindre_guerre) out.push('Vous entrez en guerre');
    if (e.tribut)
      out.push(`${e.tribut.de === state.playerId ? '-' : '+'}${e.tribut.montant} or (tribut)`);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Application des effets
// ---------------------------------------------------------------------------

export function applyEffects(ctx: Ctx, effects: Effect[], scope: Record<string, string>): void {
  const { state, rng } = ctx;
  const p = player(state);
  const who = (r: Role | string) => (r === 'souverain' ? p : char(state, scope[r]));
  for (const e of effects) {
    if (e.hasard) {
      const win = rng.chance(e.hasard.chance);
      applyEffects(ctx, win ? e.hasard.succes : e.hasard.echec, scope);
      const t = win ? e.hasard.texte_succes : e.hasard.texte_echec;
      notify(
        state,
        renderText(
          state,
          t ?? (win ? 'La fortune vous sourit.' : 'Le sort en a décidé autrement.'),
          scope,
        ),
      );
      state.lastOutcome = {
        id: (state.lastOutcome?.id ?? 0) + 1,
        win,
        text: renderText(
          state,
          t ?? (win ? 'La fortune vous sourit.' : 'Le sort en a décidé autrement.'),
          scope,
        ),
      };
    }
    if (e.or) p.gold += e.or;
    if (e.prestige) p.prestige += e.prestige;
    if (e.piete) p.piety += e.piete;
    if (e.renommee && p.dynastyId) state.dynasties[p.dynastyId].renown += e.renommee;
    if (e.opinion) {
      const c = who(e.opinion.cible);
      if (c) addOpinion(state, c.id, p.id, e.opinion.raison ?? 'Événement', e.opinion.valeur, 24);
    }
    if (e.opinion_vassaux)
      for (const v of vassalsOf(state, p.id))
        addOpinion(state, v, p.id, 'Événement', e.opinion_vassaux, 24);
    if (e.trait_ajout) {
      const t =
        typeof e.trait_ajout === 'string'
          ? { cible: 'souverain', trait: e.trait_ajout }
          : e.trait_ajout;
      const c = who(t.cible);
      if (c) addTrait(c, t.trait);
    }
    if (e.trait_retrait) {
      const t =
        typeof e.trait_retrait === 'string'
          ? { cible: 'souverain', trait: e.trait_retrait }
          : e.trait_retrait;
      const c = who(t.cible);
      if (c) removeTrait(c, t.trait);
    }
    if (e.sante !== undefined) {
      const s = typeof e.sante === 'number' ? { cible: 'souverain', valeur: e.sante } : e.sante;
      const c = who(s.cible);
      if (c) c.health = clamp(c.health + s.valeur, 0, 100);
    }
    if (e.competence) {
      const c = who(e.competence.cible ?? 'souverain');
      if (c)
        c.skills[e.competence.competence] = clamp(
          c.skills[e.competence.competence] + e.competence.valeur,
          0,
          20,
        );
    }
    if (e.revendication) {
      const cid = scope[e.revendication];
      if (cid && !p.claims.includes(cid)) p.claims.push(cid);
    }
    if (e.guerre) {
      const rival = who('rival');
      if (rival) {
        const attackerIsRival = e.guerre.attaquant === 'rival';
        const [a, d] = attackerIsRival ? [rival.id, p.id] : [p.id, rival.id];
        const target =
          Object.values(state.counties).find(
            (c) =>
              countyRuler(state, c) === d &&
              c.adjacent.some((n) => countyRuler(state, state.counties[n]) === a),
          ) ?? realmCounties(state, d)[0];
        if (target) {
          const att = state.characters[a];
          if (!att.claims.includes(target.id)) att.claims.push(target.id);
          if (!allied(state, a, d)) declareWar(ctx, a, d, 'revendication', target.id, true);
        }
      }
    }
    if (e.complot) {
      const t = who(e.complot.cible);
      if (t) startPlot(ctx, p.id, e.complot.type, t.id);
    }
    if (e.naissance) {
      const s = p.spouseId ? state.characters[p.spouseId] : undefined;
      if (s?.alive) {
        const [m, f] = p.female ? [p, s] : [s, p];
        if (ageOf(state, m) <= BALANCE.characters.womanFertileUntil) giveBirth(ctx, m, f);
      }
    }
    if (e.deces) {
      const c = who(e.deces);
      if (c) killCharacter(ctx, c.id, 'tragiquement');
    }
    if (e.developpement) {
      const cid =
        scope.comte ??
        rng.pick(Object.values(state.counties).filter((c) => c.holderId === p.id)).id;
      const c = state.counties[cid];
      if (c) c.development = clamp(c.development + e.developpement, 1, 10);
    }
    if (e.ravitaillement) {
      const a = armyOf(state, p.id);
      if (a) a.supply = clamp(a.supply + e.ravitaillement, 0, 100);
    }
    if (e.levees) {
      const own = Object.values(state.counties).filter((c) => c.holderId === p.id);
      for (const c of own)
        c.levyPool = Math.max(0, c.levyPool + e.levees / Math.max(1, own.length));
    }
    if (e.ami) {
      const c = who(e.ami);
      if (c && !c.friends.includes(p.id)) {
        c.friends.push(p.id);
        p.friends.push(c.id);
        c.rivals = c.rivals.filter((x) => x !== p.id);
        p.rivals = p.rivals.filter((x) => x !== c.id);
      }
    }
    if (e.devient_rival) {
      const c = who(e.devient_rival);
      if (c && !c.rivals.includes(p.id)) {
        c.rivals.push(p.id);
        p.rivals.push(c.id);
        c.friends = c.friends.filter((x) => x !== p.id);
        p.friends = p.friends.filter((x) => x !== c.id);
      }
    }
    if (e.emprisonner) {
      const c = who(e.emprisonner);
      if (c) c.imprisonedBy = p.id;
    }
    if (e.liberer) {
      const c = who(e.liberer);
      if (c) c.imprisonedBy = undefined;
    }
    if (e.exiler) {
      const c = who(e.exiler);
      if (c) {
        const dest = rng.pick(independentRulers(state).filter((r) => r !== p.id));
        c.courtId = dest;
        c.imprisonedBy = undefined;
        for (const seat of Object.values(state.council))
          if (seat.holderId === c.id) seat.holderId = undefined;
      }
    }
    // Effets internes.
    if (e.mariage) celebrateMarriage(ctx, e.mariage.a, e.mariage.b);
    if (e.alliance) makeAlliance(state, p.id, e.alliance);
    if (e.paix && state.wars[e.paix.warId]) endWar(ctx, e.paix.warId, e.paix.issue);
    if (e.rejoindre_guerre && state.wars[e.rejoindre_guerre.warId]) {
      joinWar(
        state,
        e.rejoindre_guerre.warId,
        p.id,
        e.rejoindre_guerre.camp === 'attaquant' ? 'attacker' : 'defender',
      );
    }
    if (e.tribut) {
      const from = state.characters[e.tribut.de];
      const to = state.characters[e.tribut.a];
      const amount = Math.min(from.gold, e.tribut.montant);
      from.gold -= amount;
      to.gold += amount;
    }
  }
}

// ---------------------------------------------------------------------------
// Tirage
// ---------------------------------------------------------------------------

function eligible(state: GameState, def: EventDef): boolean {
  if (def.unique === 'partie' && state.eventOnce[def.id]) return false;
  if (def.unique === 'personnage' && state.eventOnce[`${def.id}:${state.playerId}`]) return false;
  const last = state.eventCooldowns[def.id];
  if (last !== undefined && state.turn - last < (def.delai_retour ?? 8)) return false;
  return true;
}

function weightOf(state: GameState, def: EventDef): number {
  let w = (def.poids ?? 10) * (state.eventBias?.[def.id] ?? 1);
  const p = player(state);
  for (const t of p.traits) w *= TRAITS[t]?.eventWeights?.[def.categorie ?? ''] ?? 1;
  return w;
}

export function queueEvent(
  ctx: Ctx,
  def: EventDef,
  scope: Record<string, string>,
  inline = false,
): void {
  const { state } = ctx;
  state.pendingEvents.push({
    uid: newId(state, 'e'),
    eventId: def.id,
    scope,
    inline: inline ? def : undefined,
  });
  state.eventCooldowns[def.id] = state.turn;
  if (def.unique === 'partie') state.eventOnce[def.id] = true;
  if (def.unique === 'personnage') state.eventOnce[`${def.id}:${state.playerId}`] = true;
}

/** Début de saison : événements déclenchés puis 0 à 3 événements aléatoires. */
export function drawSeasonEvents(ctx: Ctx): void {
  const { state, rng } = ctx;
  if (state.gameOver) return;
  // Déclenchés par le moteur.
  for (const t of state.pendingTriggers ?? []) {
    const pool = ALL_EVENTS.filter((e) => e.declencheur.type === t.trigger && eligible(state, e));
    for (const def of rng.shuffle([...pool])) {
      const scope = buildScope(ctx, def, t.scope);
      if (scope) {
        queueEvent(ctx, def, scope);
        break;
      }
    }
  }
  state.pendingTriggers = [];
  const season = SEASON_KEYS[seasonOf(state.turn)];
  const max = BALANCE.game.maxEventsPerSeason;
  let drawn = state.pendingEvents.length;
  const used = new Set(state.pendingEvents.map((e) => e.eventId));
  for (let slot = 0; slot < max && drawn < max; slot++) {
    if (!rng.chance(BALANCE.game.eventSlotChance)) continue;
    const pool = ALL_EVENTS.filter(
      (e) =>
        e.declencheur.type === 'aleatoire' &&
        !used.has(e.id) &&
        eligible(state, e) &&
        (!e.declencheur.saisons || e.declencheur.saisons.includes(season)),
    );
    for (let tries = 0; tries < 5; tries++) {
      const def = rng.weighted(pool, (e) => weightOf(state, e));
      if (!def) break;
      const scope = buildScope(ctx, def);
      if (scope) {
        queueEvent(ctx, def, scope);
        used.add(def.id);
        drawn++;
        break;
      }
      pool.splice(pool.indexOf(def), 1);
    }
  }
}

/** Le joueur choisit une option d'un événement en attente. */
export function chooseEvent(ctx: Ctx, uid: string, index: number): boolean {
  const { state } = ctx;
  const i = state.pendingEvents.findIndex((e) => e.uid === uid);
  if (i < 0) return false;
  const inst = state.pendingEvents[i];
  const def = eventDef(state, inst);
  const choice = def?.choix[index];
  if (!def || !choice) return false;
  if (!checkAll(state, choice.conditions, inst.scope)) return false;
  state.pendingEvents.splice(i, 1);
  applyEffects(ctx, choice.effets, inst.scope);
  if (def.categorie && def.categorie !== 'systeme' && def.declencheur.type !== 'suite') {
    const text = renderText(state, def.titre, inst.scope);
    if ((def.poids ?? 10) <= 6 || def.unique)
      chronicle(state, `${text} — ${choice.libelle}.`, 'evenement');
  }
  if (choice.suite) {
    const next = EVENTS[choice.suite];
    if (next) {
      const scope = buildScope(ctx, next, inst.scope) ?? inst.scope;
      queueEvent(ctx, next, scope);
    }
  }
  if (choice.issue) notify(state, renderText(state, choice.issue, inst.scope));
  return true;
}

export { warBetween };
