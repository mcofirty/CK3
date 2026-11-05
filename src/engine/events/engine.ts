/** Moteur d'événements narratifs et langage d'effets (section 6). */
import { applyWallEffect, takeTheBlack, wallEffectLabels } from '../scenario/wall';
import { applyEssosEffect, essosEffectLabels } from '../scenario/essos';
import { applyStoryEffect, STORY_EFFECTS } from '../scenario/story';
import { gainInfluence } from '../influence';
import { cession } from '../diplomacy/trade';
import { setUnionPrivileges, settlePretender } from '../crowns';
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
import { createCharacter } from '../characters';
import { giveBirth, heirsOf, killCharacter } from '../characters/lifecycle';
import { ambitionStatus, startAmbition } from '../ambitions';
import { coastalCounties, foreignKingdoms } from '../geo';
import { contentmentOf, TAX_LABELS } from '../economy/local';
import { settleWard } from '../entourage';
import { playerRealmPlagued, startPlague } from '../plague';
import { gainXp } from '../progression';
import {
  addMemory,
  companions,
  endLovers,
  makeFriends,
  makeLovers,
  makeRivals,
  reconcile,
} from '../relations';
import { addStress, stressFromSpec, stressOf } from '../stress';
import { startEventBattle } from '../war/eventBattle';
import { chronicle, clamp, newId, notify, seasonOf, yearOf, type Ctx } from '../context';
import { celebrateMarriage, makeAlliance } from '../diplomacy';
import { startPlot } from '../intrigue';
import { capitalOf, countyRuler, independentRulers, realmCounties, vassalsOf } from '../realm';
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
  ami: /(\{ami\.|:"ami")/,
  ennemi: /(\{ennemi\.|:"ennemi")/,
  amant: /(\{amant\.|:"amant")/,
  proche: /(\{proche\.|:"proche")/,
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

/** Rôles qui désignent un personnage libre (le rôle « prisonnier » vise justement un captif). */
const FREE_ROLES: readonly Role[] = [
  'conjoint',
  'heritier',
  'enfant',
  'vassal',
  'rival',
  'courtisan',
  'complotiste',
  'ami',
  'ennemi',
  'amant',
  'proche',
];

/**
 * Candidats d'un rôle. Un personnage emprisonné ne peut pas banqueter, comploter
 * ni courtiser : il n'est retenu que pour le rôle « prisonnier ».
 */
function candidates(ctx: Ctx, role: Role): string[] {
  const list = roleCandidates(ctx, role);
  if (!FREE_ROLES.includes(role)) return list;
  return list.filter((id) => !ctx.state.characters[id]?.imprisonedBy);
}

/**
 * Retire les événements en attente dont un protagoniste est entre-temps jeté au cachot
 * (par un autre événement de la même saison, ou dans une ancienne sauvegarde).
 */
export function dropStaleEvents(state: GameState): void {
  state.pendingEvents = state.pendingEvents.filter((e) => {
    if (e.inline || e.eventId.startsWith('sys_')) return true;
    return !FREE_ROLES.some((r) => {
      const id = e.scope[r];
      return id !== undefined && !!state.characters[id]?.imprisonedBy;
    });
  });
}

function roleCandidates(ctx: Ctx, role: Role): string[] {
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
    case 'ami':
      return p.friends.filter((id) => state.characters[id]?.alive);
    case 'ennemi':
      return p.rivals.filter((id) => state.characters[id]?.alive);
    case 'amant':
      return (p.lovers ?? []).filter((id) => state.characters[id]?.alive);
    case 'proche':
      return companions(state).map((c) => c.id);
    default:
      return [];
  }
}

/** Tous les rôles de l'événement ont-ils au moins un candidat ? */
export function rolesAvailable(state: GameState, def: EventDef): boolean {
  const ctx = { state } as Ctx;
  return rolesOf(def).every((r) => candidates(ctx, r).length > 0);
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
      case 'drapeau':
        if (state.flags?.[v as string] === undefined) return false;
        break;
      case 'pas_drapeau':
        if (state.flags?.[v as string] !== undefined) return false;
        break;
      case 'stress_min':
        if (stressOf(p) < (v as number)) return false;
        break;
      case 'stress_max':
        if (stressOf(p) > (v as number)) return false;
        break;
      case 'a_ambition':
        if (!!p.ambition !== v) return false;
        break;
      case 'epidemie':
        if (playerRealmPlagued(state) !== v) return false;
        break;
      case 'comte_contentement_max': {
        const c = scope.comte ? state.counties[scope.comte] : undefined;
        if (!c || contentmentOf(c) > (v as number)) return false;
        break;
      }
      case 'comte_contentement_min': {
        const c = scope.comte ? state.counties[scope.comte] : undefined;
        if (!c || contentmentOf(c) < (v as number)) return false;
        break;
      }
      case 'comte_impots': {
        const c = scope.comte ? state.counties[scope.comte] : undefined;
        if (!c || (c.tax ?? 'normal') !== v) return false;
        break;
      }
      case 'contentement_moyen_max':
      case 'contentement_moyen_min': {
        const own = Object.values(state.counties).filter((c) => c.holderId === p.id);
        const avg = own.length ? own.reduce((s2, c) => s2 + contentmentOf(c), 0) / own.length : 50;
        if (k === 'contentement_moyen_max' ? avg > (v as number) : avg < (v as number))
          return false;
        break;
      }
      case 'edit':
        if (!(state.edicts?.[p.id] ?? []).includes(v as string)) return false;
        break;
      case 'pas_edit':
        if ((state.edicts?.[p.id] ?? []).includes(v as string)) return false;
        break;
      case 'dette':
        if ((state.loans ?? []).some((l) => l.ownerId === p.id) !== v) return false;
        break;
      case 'maison':
        if (!(v as string[]).some((h) => p.dynastyId === `y_${h}`)) return false;
        break;
      case 'region': {
        const cap = capitalOf(state, p.id);
        if (!cap || !(v as string[]).some((r) => cap.duchyId === `d_${r}`)) return false;
        break;
      }
      case 'cotier':
        if (
          Object.values(state.counties).some(
            (c) => c.holderId === p.id && coastalCounties(state).has(c.id),
          ) !== v
        )
          return false;
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
  return elide(renderRaw(state, text, scope));
}

/** Élision devant un nom propre commençant par une voyelle : « de Ardesse » → « d'Ardesse ». */
function elide(t: string): string {
  return t.replace(/\b([dD])e ([AEIOUYÉÈÊÂÎÔ][a-zà-ÿ])/g, '$1’$2');
}

function renderRaw(state: GameState, text: string, scope: Record<string, string>): string {
  return text.replace(
    /\{(\w+)\.(\w+)\}|\{(annee|saison|etranger|etranger2)\}/g,
    (m, role: string, field: string, special: string) => {
      if (special === 'annee') return String(yearOf(state));
      if (special === 'etranger' || special === 'etranger2') {
        const names = foreignKingdoms(state);
        const i = Number(scope._e ?? 0) + (special === 'etranger2' ? 1 : 0);
        return names[i % names.length];
      }
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
      const pct = Math.round(hasardChance(state, e.hasard) * 100);
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
    if (e.influence)
      out.push(`Influence à la cour de ${name(e.influence.cible)} : ${sign(e.influence.valeur)}`);
    if (e.mur) out.push(...wallEffectLabels(e.mur, scope.comte ? name('comte') : undefined));
    if (e.essos) out.push(...essosEffectLabels(e.essos));
    if (e.recit && STORY_EFFECTS[e.recit]) out.push(STORY_EFFECTS[e.recit]);
    if (e.prendre_le_noir) out.push(`${name(e.prendre_le_noir)} prend le noir et part pour le Mur`);
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
    if (e.guerre) {
      const rid = scope.rival;
      const ally = !!rid && allied(state, state.playerId, rid);
      out.push(
        e.guerre.attaquant === 'rival'
          ? `${name('rival')} ${ally ? 'rompt votre alliance et ' : ''}vous déclare la guerre`
          : `Guerre contre ${name('rival')}${ally ? ' (rompt votre alliance : traîtrise)' : ''}`,
      );
    }
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
    if (e.stress !== undefined) {
      const st = stressFromSpec(player(state), e.stress);
      if (st.value)
        out.push(
          `Stress ${sign(st.value)}${st.reasons.length ? ` (${st.reasons.join(', ')})` : ''}`,
        );
    }
    if (e.xp)
      out.push(
        `Expérience ${SKILL_LABELS[e.xp.competence]}${e.xp.cible && e.xp.cible !== 'souverain' ? ` de ${name(e.xp.cible)}` : ''} : ${sign(e.xp.valeur)}`,
      );
    if (e.suite_differee) out.push('Cela aura des suites…');
    if (e.amant)
      out.push(
        `${name(e.amant)} devient votre amant${state.characters[scope[e.amant]]?.female ? 'e' : ''}`,
      );
    if (e.fin_amant) out.push(`Fin de la liaison avec ${name(e.fin_amant)}`);
    if (e.reconciliation) out.push(`Réconciliation avec ${name(e.reconciliation)}`);
    if (e.epidemie) out.push('Une épidémie éclate');
    if (e.quarantaine) out.push(`Quarantaine à ${name('comte')}`);
    if (e.bataille)
      out.push(
        `⚔️ Bataille contre ${renderText(state, e.bataille.ennemi, scope)} (force ×${String(e.bataille.force).replace('.', ',')})`,
      );
    if (e.nouveau_courtisan)
      out.push(
        e.nouveau_courtisan.pupille
          ? 'Un enfant est confié à votre cour'
          : 'Un nouveau venu rejoint la cour (salaire au-delà des places gratuites)',
      );
    if (e.pupille)
      out.push(e.pupille.action === 'retour' ? 'Il retourne chez les siens' : 'Il reste à la cour');
    if (e.contentement)
      out.push(
        `Contentement${scope.comte ? ` de ${name('comte')}` : ' du domaine'} : ${sign(e.contentement)}`,
      );
    if (e.impots) out.push(`Impôts ${TAX_LABELS[e.impots].toLowerCase()} à ${name('comte')}`);
    if (e.rendre_otage)
      out.push(
        `${state.characters[e.rendre_otage.otage]?.name} rentre chez les siens (+${e.rendre_otage.montant} or)`,
      );
    if (e.mariage)
      out.push(
        `Mariage de ${state.characters[e.mariage.a]?.name} et ${state.characters[e.mariage.b]?.name}`,
      );
    if (e.alliance) out.push(`Alliance avec ${state.characters[e.alliance]?.name}`);
    if (e.union_privileges)
      out.push(
        e.union_privileges.mode === 'confirmes'
          ? `−${BALANCE.crowns.privilegesGold} or · contentement +${BALANCE.crowns.privilegesContentment} · fusion plus lointaine`
          : `Vassaux de la couronne ${BALANCE.crowns.imposeOpinion} d’opinion · contentement ${BALANCE.crowns.imposeContentment} · fusion plus proche`,
      );
    if (e.pretendant)
      out.push(
        e.pretendant.action === 'accueillir'
          ? `Rejoint votre cour avec ses droits · ${state.characters[e.pretendant.souverain]?.name} −20 d’opinion`
          : e.pretendant.action === 'livrer'
            ? `${state.characters[e.pretendant.souverain]?.name} +25 d’opinion`
            : 'Il repart en exil',
      );
    if (e.cession) {
      const c = state.counties[e.cession.comte]?.name;
      out.push(
        e.cession.acheteur === state.playerId
          ? `Vous obtenez ${c} · −${e.cession.prix} or`
          : `Vous cédez ${c} · +${e.cession.prix} or`,
      );
    }
    if (e.paix) {
      const t = e.paix.termes;
      const parts = [e.paix.issue === 'blanche' ? 'Paix blanche' : 'Fin de la guerre'];
      if (t?.comtes.length)
        parts.push(
          t.comtes
            .map((id) => state.counties[id]?.name)
            .filter(Boolean)
            .join(', '),
        );
      if (t && t.or > 0) parts.push(`${t.or} or`);
      out.push(parts.join(' · '));
    }
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
      const win = rng.chance(hasardChance(state, e.hasard));
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
    if (e.influence) {
      const c = who(e.influence.cible);
      if (c) gainInfluence(state, c.id, e.influence.valeur);
    }
    if (e.mur) applyWallEffect(state, e.mur, scope.comte);
    if (e.essos) applyEssosEffect(ctx, e.essos);
    if (e.recit) applyStoryEffect(ctx, e.recit);
    if (e.prendre_le_noir) {
      const c = who(e.prendre_le_noir);
      if (c) {
        takeTheBlack(state, c.id);
        if (state.wall) state.wall.men += 1;
      }
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
          // Un allié qui déclare la guerre rompt d'abord l'alliance (déclarer la guerre le fait).
          declareWar(ctx, a, d, 'revendication', target.id, true);
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
      if (c) {
        if (c.id !== p.id) addMemory(state, c.id, p.id, 'mort');
        killCharacter(ctx, c.id, 'tragiquement');
      }
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
      if (c) makeFriends(p, c);
    }
    if (e.devient_rival) {
      const c = who(e.devient_rival);
      if (c) makeRivals(p, c);
    }
    if (e.emprisonner) {
      const c = who(e.emprisonner);
      if (c) {
        c.imprisonedBy = p.id;
        addMemory(state, c.id, p.id, 'prison');
      }
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
    if (e.stress !== undefined) addStress(state, p, stressFromSpec(p, e.stress).value);
    if (e.xp) gainXp(state, who(e.xp.cible ?? 'souverain'), e.xp.competence, e.xp.valeur);
    if (e.drapeau) (state.flags ??= {})[e.drapeau] = state.turn;
    if (e.retirer_drapeau && state.flags) delete state.flags[e.retirer_drapeau];
    if (e.suite_differee)
      (state.scheduled ??= []).push({
        turn: state.turn + Math.max(1, e.suite_differee.saisons),
        eventId: e.suite_differee.id,
        scope: { ...scope },
      });
    if (e.amant) {
      const c = who(e.amant);
      if (c) makeLovers(p, c);
    }
    if (e.fin_amant) {
      const c = who(e.fin_amant);
      if (c) endLovers(p, c);
    }
    if (e.reconciliation) {
      const c = who(e.reconciliation);
      if (c) reconcile(p, c);
    }
    if (e.epidemie) {
      const own = Object.values(state.counties).filter((c) => c.holderId === p.id);
      const cid = scope.comte ?? (own.length ? rng.pick(own).id : undefined);
      if (cid) startPlague(state, cid);
    }
    if (e.quarantaine && scope.comte && state.counties[scope.comte]) {
      const c = state.counties[scope.comte];
      c.quarantine = true;
    }
    if (e.contentement) {
      const targets = scope.comte
        ? [state.counties[scope.comte]].filter(Boolean)
        : Object.values(state.counties).filter((c) => c.holderId === p.id);
      for (const c of targets) c.contentment = clamp(contentmentOf(c) + e.contentement, 0, 100);
    }
    if (e.impots && scope.comte && state.counties[scope.comte])
      state.counties[scope.comte].tax = e.impots;
    if (e.nouveau_courtisan) {
      const n = e.nouveau_courtisan;
      const c = createCharacter(ctx, {
        age: rng.int(n.age_min, n.age_max),
        female: n.femme,
        dynastyId: null,
        courtId: p.id,
        skillBase: 7,
      });
      if (n.trait) addTrait(c, n.trait);
      if (n.guerre) c.skills.guerre = clamp(c.skills.guerre + n.guerre, 0, 20);
      if (n.competence)
        c.skills[n.competence.competence] = clamp(
          c.skills[n.competence.competence] + n.competence.valeur,
          0,
          20,
        );
      if (n.pupille) c.fosterOf = p.id;
      notify(
        state,
        n.pupille ? `${c.name} grandit désormais à votre cour.` : `${c.name} rejoint votre cour.`,
      );
    }
    if (e.pupille) settleWard(state, e.pupille.id, e.pupille.action);
    if (e.ambition) {
      startAmbition(state, p, e.ambition);
      const st = ambitionStatus(state, p);
      if (st) notify(state, `Ambition : ${st.def.name}.`);
    }
    if (e.rendre_otage) {
      const h = state.characters[e.rendre_otage.otage];
      if (h?.hostageOf === p.id) {
        const home = h.hostageHome ?? h.fatherId ?? h.motherId;
        h.hostageOf = undefined;
        h.hostageHome = undefined;
        h.hostageSince = undefined;
        const payer = home ? state.characters[home] : undefined;
        const amount = Math.min(e.rendre_otage.montant, Math.max(0, payer?.gold ?? 0));
        if (payer) payer.gold -= amount;
        p.gold += amount;
        if (payer) h.courtId = payer.courtId === payer.id ? payer.id : payer.courtId;
      }
    }
    if (e.bataille) startEventBattle(ctx, e.bataille, scope);
    // Effets internes.
    if (e.mariage) celebrateMarriage(ctx, e.mariage.a, e.mariage.b);
    if (e.alliance) makeAlliance(state, p.id, e.alliance);
    if (e.cession)
      cession(ctx, e.cession.comte, e.cession.vendeur, e.cession.acheteur, e.cession.prix);
    if (e.union_privileges)
      setUnionPrivileges(state, e.union_privileges.union, e.union_privileges.mode);
    if (e.pretendant)
      settlePretender(state, e.pretendant.id, e.pretendant.action, e.pretendant.souverain);
    if (e.paix && state.wars[e.paix.warId]) {
      const t = e.paix.termes;
      endWar(
        ctx,
        e.paix.warId,
        e.paix.issue,
        t
          ? {
              warId: e.paix.warId,
              outcome: e.paix.issue,
              counties: t.comtes,
              gold: t.or,
              payerId: t.payeur,
            }
          : undefined,
      );
    }
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
  if (def.scenario && def.scenario !== state.scenario) return false;
  if (def.unique === 'partie' && state.eventOnce[def.id]) return false;
  if (def.unique === 'personnage' && state.eventOnce[`${def.id}:${state.playerId}`]) return false;
  const last = state.eventCooldowns[def.id];
  if (last !== undefined && state.turn - last < (def.delai_retour ?? 8)) return false;
  return true;
}

function weightOf(state: GameState, def: EventDef): number {
  let w = (def.poids ?? 10) * (state.eventBias?.[def.id] ?? 1);
  if (state.scenario === 'westeros')
    w *= def.scenario ? BALANCE.westeros.eventWeight : BALANCE.westeros.genericEventWeight;
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
  const sc = { ...scope };
  if (Array.isArray(def.texte) && sc._v === undefined)
    sc._v = String(ctx.rng.int(0, def.texte.length - 1));
  if (sc._e === undefined) sc._e = String(ctx.rng.int(0, 9));
  state.pendingEvents.push({
    uid: newId(state, 'e'),
    eventId: def.id,
    scope: sc,
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
  // Suites différées arrivées à échéance.
  const due = (state.scheduled ?? []).filter((x) => x.turn <= state.turn);
  state.scheduled = (state.scheduled ?? []).filter((x) => x.turn > state.turn);
  for (const x of due) {
    const def = EVENTS[x.eventId];
    if (!def) continue;
    const alive = Object.fromEntries(
      Object.entries(x.scope).filter(
        ([k, id]) =>
          k.startsWith('_') ||
          state.counties[id] ||
          (state.characters[id]?.alive && (k !== 'souverain' || id === state.playerId)),
      ),
    );
    const scope = buildScope(ctx, def, alive);
    if (scope) queueEvent(ctx, def, scope);
  }
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

/** Probabilité effective d'une issue incertaine (la compétence du souverain peut l'infléchir). */
export function hasardChance(
  state: GameState,
  h: { chance: number; competence?: keyof typeof SKILL_LABELS },
): number {
  if (!h.competence) return h.chance;
  const E = BALANCE.events;
  return clamp(
    h.chance + (skill(player(state), h.competence) - 10) * E.skillChancePerPoint,
    E.chanceMin,
    E.chanceMax,
  );
}
