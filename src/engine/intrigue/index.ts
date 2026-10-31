/** Complots du joueur et de l'IA (section 7). */
import { BALANCE } from '../../data/balance';
import {
  addOpinion,
  displayName,
  hasTrait,
  opinion,
  skill,
  topLiege,
} from '../characters';
import { killCharacter } from '../characters/lifecycle';
import { chronicle, newId, notify, type Ctx } from '../context';
import { vassalsOf } from '../realm';
import type { Character, GameState, Plot, PlotType } from '../state';
import { declareWar } from '../war';

const I = BALANCE.intrigue;

export const PLOT_INFO: Record<PlotType, { label: string; description: string }> = {
  assassiner: { label: 'Assassiner', description: 'Faire disparaître la cible.' },
  discrediter: { label: 'Discréditer', description: 'Baisse le prestige de la cible et l’opinion qu’on a d’elle.' },
  amitie: { label: 'Gagner l’amitié', description: 'La cible devient favorable, voire amie.' },
  revolte: { label: 'Inciter à la révolte', description: 'Pousse un vassal d’un rival à se soulever contre son suzerain.' },
};

export interface PlotOdds {
  progressPerSeason: number;
  seasons: number;
  discoveryPerSeason: number;
  success: number;
  reasons: { label: string; value: string }[];
}

/** Ruse défensive d'une cible : la sienne ou celle de l'espion de sa cour. */
function defenseRuse(state: GameState, target: Character): number {
  let r = skill(target, 'ruse');
  if (topLiege(state, target.id) === state.playerId) {
    const seat = state.council.espion;
    const h = seat.holderId ? state.characters[seat.holderId] : undefined;
    if (h?.alive) r = Math.max(r, skill(h, 'ruse') + (seat.task === 'demasquer' ? 4 : 0));
  }
  return r;
}

export function plotOdds(state: GameState, ownerId: string, targetId: string, agents: number, progress = 0): PlotOdds {
  const owner = state.characters[ownerId];
  const target = state.characters[targetId];
  const ruse = skill(owner, 'ruse');
  const prog = I.progressBase + ruse * I.progressPerRuse + agents * I.progressPerAgent;
  const tr = defenseRuse(state, target);
  const disc = Math.max(0.01, I.discoveryBase + agents * I.discoveryPerAgent + tr * I.discoveryPerTargetRuse + ruse * I.discoveryPerOwnRuse);
  const seasons = Math.max(1, Math.ceil((100 - progress) / prog));
  const success = Math.pow(1 - disc, seasons);
  return {
    progressPerSeason: Math.round(prog),
    seasons,
    discoveryPerSeason: disc,
    success,
    reasons: [
      { label: `Votre Ruse (${ruse})`, value: `+${Math.round(ruse * I.progressPerRuse)} progrès/saison` },
      { label: `Agents (${agents})`, value: `+${agents * I.progressPerAgent} progrès, +${Math.round(agents * I.discoveryPerAgent * 100)} % risque` },
      { label: `Vigilance de la cible (${tr})`, value: `+${Math.round(tr * I.discoveryPerTargetRuse * 100)} % risque` },
      { label: 'Risque de base', value: `${Math.round(I.discoveryBase * 100)} %` },
    ],
  };
}

export function canStartPlot(state: GameState, ownerId: string, type: PlotType, targetId: string): { ok: boolean; reason?: string } {
  const t = state.characters[targetId];
  if (!t?.alive) return { ok: false, reason: 'Cible invalide' };
  if (targetId === ownerId) return { ok: false, reason: 'Cible invalide' };
  if (Object.values(state.plots).some((p) => p.ownerId === ownerId)) return { ok: false, reason: 'Un seul complot à la fois' };
  if (type === 'revolte') {
    if (!t.liegeId || t.liegeId === ownerId) return { ok: false, reason: 'La cible doit être le vassal d’un rival' };
  }
  return { ok: true };
}

export function startPlot(ctx: Ctx, ownerId: string, type: PlotType, targetId: string): Plot | undefined {
  const { state } = ctx;
  if (!canStartPlot(state, ownerId, type, targetId).ok) return undefined;
  const plot: Plot = { id: newId(state, 'x'), ownerId, type, targetId, progress: 0, agents: 0, startTurn: state.turn, discovered: false };
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
      if (h?.alive && seat.task === 'demasquer') disc += BALANCE.council.discoverPlotChance + skill(h, 'ruse') * 0.012;
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
    notify(state, `Votre complot contre ${target.name} est découvert ! (${I.discoveredPrestige} prestige)`);
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
  switch (p.type) {
    case 'assassiner':
      if (rng.chance(I.assassinKillChance)) {
        if (mine) chronicle(state, `${displayName(state, target)} meurt dans des circonstances troubles.`, 'intrigue');
        if (againstMe && !mine) notify(state, `${target.name} a été assassiné.`);
        killCharacter(ctx, target.id, 'assassiné');
      } else {
        addOpinion(state, p.targetId, p.ownerId, 'Tentative d’assassinat', -60, 60);
        if (mine) notify(state, `L’attentat contre ${target.name} échoue ; on soupçonne votre main.`);
        if (againstMe) notify(state, `${target.name} échappe à un attentat commandité par ${owner.name}.`);
      }
      break;
    case 'discrediter':
      target.prestige += I.discreditPrestige;
      for (const v of [...vassalsOf(state, target.id), target.liegeId].filter((x): x is string => !!x))
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
  if (!rng.chance(p)) return;
  const pl = state.playerId;
  let type: PlotType = 'discrediter';
  if (op < -40 && (hasTrait(r, 'cruel') || hasTrait(r, 'ambitieux'))) type = 'assassiner';
  else if (rng.chance(0.3)) type = 'amitie';
  const target = type === 'amitie' ? rng.pick(vassalsOf(state, pl).length ? vassalsOf(state, pl) : [pl]) : pl;
  const plot = startPlot(ctx, rulerId, type, target);
  if (plot) plot.agents = rng.int(0, 3);
}

/** Met en file un événement déclenché par le moteur (résolu par le module d'événements). */
export function queueTriggered(state: GameState, trigger: string, scope: Record<string, string>): void {
  state.pendingTriggers = state.pendingTriggers ?? [];
  state.pendingTriggers.push({ trigger, scope });
}
