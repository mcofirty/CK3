/** Complots du joueur et de l'IA (section 7). */
import { BALANCE } from '../../data/balance';
import {
  addOpinion,
  ageOf,
  closeFamily,
  displayName,
  hasTrait,
  opinion,
  perkBonus,
  skill,
  topLiege,
} from '../characters';
import { gainXp, record } from '../progression';
import { addMemory } from '../relations';
import { addStress, stressFromSpec } from '../stress';
import { killCharacter } from '../characters/lifecycle';
import { chronicle, newId, notify, type Ctx } from '../context';
import { vassalsOf } from '../realm';
import type { Character, GameState, Plot, PlotType } from '../state';
import { declareWar } from '../war';

const I = BALANCE.intrigue;

export const PLOT_INFO: Record<PlotType, { label: string; description: string }> = {
  assassiner: { label: 'Assassiner', description: 'Faire disparaître la cible.' },
  discrediter: {
    label: 'Discréditer',
    description: 'Baisse le prestige de la cible et l’opinion qu’on a d’elle.',
  },
  amitie: { label: 'Gagner l’amitié', description: 'La cible devient favorable, voire amie.' },
  revolte: {
    label: 'Inciter à la révolte',
    description: 'Pousse un vassal d’un rival à se soulever contre son suzerain.',
  },
};

export interface PlotOdds {
  progressPerSeason: number;
  seasons: number;
  discoveryPerSeason: number;
  success: number;
  reasons: { label: string; value: string }[];
}

/**
 * Ruse défensive d'une cible : la sienne, celle du seigneur qui la garde (enfants, conjoints,
 * courtisans sans terre sont protégés par leur cour), ou celle de l'espion du joueur.
 */
export function defenseRuse(state: GameState, target: Character): number {
  let r = skill(target, 'ruse');
  const holds = Object.values(state.counties).some((c) => c.holderId === target.id);
  const guardian =
    !holds && target.courtId !== target.id ? state.characters[target.courtId] : undefined;
  if (guardian?.alive) r = Math.max(r, skill(guardian, 'ruse'));
  if (topLiege(state, target.id) === state.playerId) {
    const seat = state.council.espion;
    const h = seat.holderId ? state.characters[seat.holderId] : undefined;
    if (h?.alive) r = Math.max(r, skill(h, 'ruse') + (seat.task === 'demasquer' ? 4 : 0));
  }
  return r;
}

export function plotOdds(
  state: GameState,
  ownerId: string,
  targetId: string,
  agents: number,
  progress = 0,
): PlotOdds {
  const owner = state.characters[ownerId];
  const target = state.characters[targetId];
  const ruse = skill(owner, 'ruse');
  const power = 1 + perkBonus(state, owner, 'plotPower');
  const prog = (I.progressBase + ruse * I.progressPerRuse + agents * I.progressPerAgent) * power;
  const tr = defenseRuse(state, target);
  const vigilance = perkBonus(state, target, 'plotDefense');
  const disc = Math.max(
    0.01,
    I.discoveryBase +
      agents * I.discoveryPerAgent +
      tr * I.discoveryPerTargetRuse +
      ruse * I.discoveryPerOwnRuse +
      vigilance,
  );
  const seasons = Math.max(1, Math.ceil((100 - progress) / prog));
  const success = Math.pow(1 - disc, seasons);
  return {
    progressPerSeason: Math.round(prog),
    seasons,
    discoveryPerSeason: disc,
    success,
    reasons: [
      {
        label: `Votre Ruse (${ruse})`,
        value: `+${Math.round(ruse * I.progressPerRuse)} progrès/saison`,
      },
      {
        label: `Agents (${agents})`,
        value: `+${agents * I.progressPerAgent} progrès, +${Math.round(agents * I.discoveryPerAgent * 100)} % risque`,
      },
      {
        label: `Vigilance de la cible (${tr})`,
        value: `+${Math.round(tr * I.discoveryPerTargetRuse * 100)} % risque`,
      },
      { label: 'Risque de base', value: `${Math.round(I.discoveryBase * 100)} %` },
      ...(power > 1
        ? [{ label: 'Talents et héritages', value: `×${power.toFixed(2)} progrès` }]
        : []),
      ...(vigilance > 0
        ? [{ label: 'Espions de la cible', value: `+${Math.round(vigilance * 100)} % risque` }]
        : []),
    ],
  };
}

export function canStartPlot(
  state: GameState,
  ownerId: string,
  type: PlotType,
  targetId: string,
): { ok: boolean; reason?: string } {
  const t = state.characters[targetId];
  if (!t?.alive) return { ok: false, reason: 'Cible invalide' };
  if (targetId === ownerId) return { ok: false, reason: 'Cible invalide' };
  if (Object.values(state.plots).some((p) => p.ownerId === ownerId))
    return { ok: false, reason: 'Un seul complot à la fois' };
  if (type === 'revolte') {
    if (!t.liegeId || t.liegeId === ownerId)
      return { ok: false, reason: 'La cible doit être le vassal d’un rival' };
  }
  return { ok: true };
}

export function startPlot(
  ctx: Ctx,
  ownerId: string,
  type: PlotType,
  targetId: string,
): Plot | undefined {
  const { state } = ctx;
  if (!canStartPlot(state, ownerId, type, targetId).ok) return undefined;
  const plot: Plot = {
    id: newId(state, 'x'),
    ownerId,
    type,
    targetId,
    progress: 0,
    agents: 0,
    startTurn: state.turn,
    discovered: false,
  };
  state.plots[plot.id] = plot;
  return plot;
}

export function addAgent(ctx: Ctx, plotId: string): boolean {
  const { state } = ctx;
  const p = state.plots[plotId];
  if (!p || p.agents >= I.maxAgents) return false;
  const o = state.characters[p.ownerId];
  if (o.gold < I.agentCost) return false;
  o.gold -= I.agentCost;
  p.agents += 1;
  return true;
}

/** Progression saisonnière de tous les complots. */
export function seasonPlots(ctx: Ctx): void {
  const { state, rng } = ctx;
  for (const p of Object.values(state.plots)) {
    const owner = state.characters[p.ownerId];
    const target = state.characters[p.targetId];
    if (!owner?.alive || !target?.alive) {
      delete state.plots[p.id];
      continue;
    }
    const odds = plotOdds(state, p.ownerId, p.targetId, p.agents, p.progress);
    // Le maître-espion du joueur peut démasquer les complots contre lui.
    let disc = odds.discoveryPerSeason;
    if (p.ownerId !== state.playerId && topLiege(state, p.targetId) === state.playerId) {
      const seat = state.council.espion;
      const h = seat.holderId ? state.characters[seat.holderId] : undefined;
      if (h?.alive && seat.task === 'demasquer')
        disc += BALANCE.council.discoverPlotChance + skill(h, 'ruse') * 0.012;
    }
    if (rng.chance(disc)) {
      discoverPlot(ctx, p);
      continue;
    }
    p.progress += odds.progressPerSeason;
    if (p.progress >= 100) completePlot(ctx, p);
  }
}

function discoverPlot(ctx: Ctx, p: Plot): void {
  const { state } = ctx;
  const owner = state.characters[p.ownerId];
  const target = state.characters[p.targetId];
  delete state.plots[p.id];
  addOpinion(state, p.targetId, p.ownerId, 'A comploté contre moi', I.discoveredOpinion, 40);
  owner.prestige += I.discoveredPrestige;
  if (p.ownerId === state.playerId) {
    notify(
      state,
      `Votre complot contre ${target.name} est découvert ! (${I.discoveredPrestige} prestige)`,
    );
    chronicle(state, `Le complot contre ${displayName(state, target)} est découvert.`, 'intrigue');
  } else if (topLiege(state, p.targetId) === state.playerId) {
    // Événement de choix : pardonner, emprisonner, exécuter.
    queueTriggered(state, 'complot_decouvert', { complotiste: p.ownerId });
  }
}

function completePlot(ctx: Ctx, p: Plot): void {
  const { state, rng } = ctx;
  const owner = state.characters[p.ownerId];
  const target = state.characters[p.targetId];
  delete state.plots[p.id];
  const mine = p.ownerId === state.playerId;
  const againstMe = p.targetId === state.playerId || topLiege(state, p.targetId) === state.playerId;
  record(owner).plots += 1;
  gainXp(state, owner, 'ruse', BALANCE.progression.plotXp);
  if (mine && state.stats) state.stats.plotsDone += 1;
  switch (p.type) {
    case 'assassiner':
      if (rng.chance(I.assassinKillChance)) {
        if (mine)
          chronicle(
            state,
            `${displayName(state, target)} meurt dans des circonstances troubles.`,
            'intrigue',
          );
        if (againstMe && !mine) notify(state, `${target.name} a été assassiné.`);
        if (mine) {
          // Le poids du crime, plus lourd si la victime est un enfant.
          const child = ageOf(state, target) < BALANCE.characters.adulthood;
          addStress(state, owner, stressFromSpec(owner, I.assassinStress).value);
          if (child) addStress(state, owner, stressFromSpec(owner, I.assassinChildStress).value);
          // La famille peut deviner qui a frappé : elle n'oubliera pas.
          if (rng.chance(I.assassinSuspicion)) {
            addMemory(state, target.id, owner.id, 'mort');
            notify(state, `La famille de ${target.name} soupçonne votre main.`);
          }
        }
        killCharacter(ctx, target.id, 'assassiné');
      } else {
        addOpinion(state, p.targetId, p.ownerId, 'Tentative d’assassinat', -60, 60);
        if (mine)
          notify(state, `L’attentat contre ${target.name} échoue ; on soupçonne votre main.`);
        if (againstMe)
          notify(state, `${target.name} échappe à un attentat commandité par ${owner.name}.`);
      }
      break;
    case 'discrediter':
      target.prestige += I.discreditPrestige;
      for (const v of [...vassalsOf(state, target.id), target.liegeId].filter(
        (x): x is string => !!x,
      ))
        addOpinion(state, v, target.id, 'Rumeurs infamantes', I.discreditOpinion, 20);
      if (mine) notify(state, `${target.name} est discrédité : son prestige s’effondre.`);
      if (againstMe) notify(state, `Des rumeurs infamantes circulent sur ${target.name}.`);
      break;
    case 'amitie':
      addOpinion(state, p.targetId, p.ownerId, 'Amitié cultivée', I.friendshipOpinion, 40);
      if (opinion(state, p.targetId, p.ownerId) > 50 && !target.friends.includes(owner.id)) {
        target.friends.push(owner.id);
        owner.friends.push(target.id);
      }
      if (mine) notify(state, `${target.name} vous voit désormais d’un œil favorable.`);
      break;
    case 'revolte': {
      const liege = target.liegeId;
      if (!liege) break;
      addOpinion(state, target.id, liege, 'Excité à la révolte', -60, 20);
      target.inFaction = true;
      const war = declareWar(ctx, target.id, liege, 'independance', undefined, true);
      if (mine) notify(state, `${target.name} se soulève contre ${state.characters[liege].name} !`);
      if (war && liege === state.playerId) notify(state, `${target.name} se révolte contre vous !`);
      break;
    }
  }
}

/** Complots lancés par l'IA contre le joueur et sa famille. */
export function aiPlots(ctx: Ctx, rulerId: string): void {
  const { state, rng } = ctx;
  const r = state.characters[rulerId];
  if (Object.values(state.plots).some((p) => p.ownerId === rulerId)) return;
  let p = I.aiPlotChance;
  if (hasTrait(r, 'ambitieux')) p *= 1.6;
  if (hasTrait(r, 'cruel')) p *= 1.4;
  if (hasTrait(r, 'juste')) p *= 0.4;
  const op = opinion(state, rulerId, state.playerId);
  if (op > 0) p *= 0.3;
  // Vengeance : un souvenir sanglant pousse à frapper.
  const grudge = hasGrudge(state, r, state.playerId);
  if (grudge) p += BALANCE.relations.vengeanceChance;
  if (!rng.chance(p)) return;
  const pl = state.playerId;
  let type: PlotType = 'discrediter';
  if (grudge || (op < -40 && (hasTrait(r, 'cruel') || hasTrait(r, 'ambitieux'))))
    type = 'assassiner';
  else if (rng.chance(0.3)) type = 'amitie';
  const target =
    type === 'amitie' ? rng.pick(vassalsOf(state, pl).length ? vassalsOf(state, pl) : [pl]) : pl;
  const plot = startPlot(ctx, rulerId, type, target);
  if (plot) plot.agents = rng.int(0, 3);
}

/** Met en file un événement déclenché par le moteur (résolu par le module d'événements). */
export function queueTriggered(
  state: GameState,
  trigger: string,
  scope: Record<string, string>,
): void {
  state.pendingTriggers = state.pendingTriggers ?? [];
  state.pendingTriggers.push({ trigger, scope });
}

/** Le personnage garde-t-il un souvenir sanglant de l'autre ? */
export function hasGrudge(state: GameState, c: Character, againstId: string): boolean {
  return (c.opinions[againstId] ?? []).some(
    (m) =>
      m.value <= BALANCE.relations.memoryKill &&
      (m.expires === undefined || m.expires > state.turn),
  );
}

export interface PlotTargetGroup {
  rulerId: string;
  members: { id: string; relation: string }[];
}

/** Lien d'un membre de la cour avec son souverain (« fille », « épouse », « vassal »…). */
function relationTo(state: GameState, ruler: Character, c: Character): string {
  if (c.id === ruler.id) return 'souverain';
  const f = c.female;
  if (ruler.spouseId === c.id) return f ? 'épouse' : 'époux';
  if (ruler.childrenIds.includes(c.id)) return f ? 'fille' : 'fils';
  if (ruler.childrenIds.some((k) => state.characters[k]?.childrenIds.includes(c.id)))
    return f ? 'petite-fille' : 'petit-fils';
  if (c.liegeId === ruler.id) return f ? 'vassale' : 'vassal';
  return f ? 'sœur' : 'frère';
}

/**
 * Cibles possibles d'un complot, regroupées par cour rivale : le souverain, sa famille proche
 * (conjoint, enfants, petits-enfants, frères et sœurs) et ses vassaux.
 */
export function plotTargets(state: GameState, ownerId: string, type: PlotType): PlotTargetGroup[] {
  const groups: PlotTargetGroup[] = [];
  const me = state.characters[ownerId];
  const ok = (c: Character | undefined): c is Character =>
    !!c?.alive && c.id !== ownerId && (!me?.dynastyId || c.dynastyId !== me.dynastyId);
  const rulers = Object.values(state.characters).filter(
    (c) =>
      c.alive &&
      !c.liegeId &&
      c.id !== ownerId &&
      Object.values(state.counties).some((k) => k.holderId === c.id),
  );
  for (const r of rulers) {
    const vassals = Object.values(state.characters).filter((c) => c.alive && c.liegeId === r.id);
    let list: Character[];
    if (type === 'revolte') list = vassals;
    else list = [r, ...closeFamily(state, r), ...vassals];
    const seen = new Set<string>();
    const members = list
      .filter((c) => ok(c) && !seen.has(c.id) && seen.add(c.id))
      .map((c) => ({ id: c.id, relation: relationTo(state, r, c) }));
    if (members.length) groups.push({ rulerId: r.id, members });
  }
  if (type === 'amitie') {
    const own = Object.values(state.characters).filter((c) => c.alive && c.liegeId === ownerId);
    if (own.length)
      groups.unshift({
        rulerId: ownerId,
        members: own.map((c) => ({ id: c.id, relation: c.female ? 'vassale' : 'vassal' })),
      });
  }
  return groups;
}
