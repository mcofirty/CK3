/** Orchestration d'une saison (section 3). */
import { BALANCE } from '../data/balance';
import { runAi } from './ai';
import { cleanOpinions } from './characters';
import { pruneCharacters, seasonLife } from './characters/lifecycle';
import { chronicle, recordRuler, seasonOf, type Ctx } from './context';
import { autoFillCouncil, seasonCouncil } from './diplomacy';
import { drawSeasonEvents } from './events/engine';
import { seasonPlots } from './intrigue';
import { seasonCourt } from './court';
import { seasonLocalEconomy } from './economy';
import { checkAchievements, computeEnding } from './endings';
import { realmCounties } from './realm';
import { seasonPlague } from './plague';
import { seasonProgression } from './progression';
import { applyEventBattle } from './war/eventBattle';
import { seasonIncome, seasonRealm } from './realm';
import type { GameState, LineageScore } from './state';
import {
  applyBattleResult,
  armiesHostile,
  moveAndDetect,
  seasonCampaign,
  setupBattle,
} from './war';

/** Bouton « Fin de saison » : résolution militaire, fin de saison, puis début de la suivante. */
export function endSeason(ctx: Ctx): void {
  const { state } = ctx;
  if (state.gameOver || state.phase !== 'saison') return;
  if (state.pendingEvents.length) return;
  state.pendingBattles = moveAndDetect(ctx);
  if (startNextBattle(ctx)) return;
  continueSeason(ctx);
}

/** Prépare la prochaine bataille du joueur ; renvoie vrai si une bataille attend. */
export function startNextBattle(ctx: Ctx): boolean {
  const { state } = ctx;
  while (state.pendingBattles.length) {
    const p = state.pendingBattles.shift()!;
    const a = state.armies[p.attackerArmyId];
    const d = state.armies[p.defenderArmyId];
    if (!a || !d || a.location !== d.location || !armiesHostile(state, a, d)) continue;
    state.battle = setupBattle(ctx, p.countyId, a.id, d.id);
    state.phase = 'bataille';
    return true;
  }
  return false;
}

/** Après une bataille jouée par le joueur. */
export function closeBattle(ctx: Ctx): void {
  const { state } = ctx;
  if (!state.battle || state.battle.phase !== 'fin') return;
  const debug = state.battle.id.startsWith('debug');
  const event = !!state.battle.event;
  if (event) applyEventBattle(ctx, state.battle);
  else if (!debug) applyBattleResult(ctx, state.battle);
  state.battle = undefined;
  state.phase = 'saison';
  checkAchievements(state);
  if (debug || event) return;
  if (startNextBattle(ctx)) return;
  continueSeason(ctx);
}

export function continueSeason(ctx: Ctx): void {
  const { state } = ctx;
  seasonCampaign(ctx);
  seasonPlague(ctx);
  seasonLocalEconomy(ctx);
  seasonLife(ctx);
  checkLandless(state);
  if (state.stats && state.characters[state.playerId])
    state.stats.maxCounties = Math.max(
      state.stats.maxCounties,
      realmCounties(state, state.playerId).length,
    );
  checkAchievements(state);
  if (state.gameOver) {
    finishGame(state);
    return;
  }
  if (seasonOf(state.turn) === 3) {
    pruneCharacters(state);
    cleanOpinions(state);
  }
  state.turn += 1;
  if (state.turn >= BALANCE.game.maxYears * BALANCE.game.seasonsPerYear) {
    state.gameOver = {
      reason: `${BALANCE.game.maxYears} ans ont passé : la chronique de votre lignée s’achève.`,
      score: lineageScore(state),
    };
    finishGame(state);
    return;
  }
  startSeason(ctx);
}

export function startSeason(ctx: Ctx): void {
  const { state } = ctx;
  for (const c of Object.values(state.characters))
    if (c.recruitedThisSeason) c.recruitedThisSeason = 0;
  seasonIncome(ctx);
  seasonProgression(ctx);
  seasonRealm(ctx);
  seasonCouncil(ctx);
  seasonPlots(ctx);
  runAi(ctx);
  autoFillCouncil(state);
  seasonCourt(ctx);
  drawSeasonEvents(ctx);
}

export function lineageScore(state: GameState): LineageScore {
  const dyn = state.dynasties[state.playerDynastyId];
  const members = new Set(
    Object.values(state.characters)
      .filter((c) => c.alive && c.dynastyId === state.playerDynastyId)
      .map((c) => c.id),
  );
  let titles = 0;
  for (const k of Object.values(state.kingdoms))
    if (k.holderId && members.has(k.holderId)) titles += 100;
  for (const d of Object.values(state.duchies))
    if (d.holderId && members.has(d.holderId)) titles += 30;
  for (const c of Object.values(state.counties)) if (members.has(c.holderId)) titles += 10;
  const renown = Math.round(dyn?.renown ?? 0);
  const years = Math.floor(state.turn / 4);
  return { renown, titles, years, total: renown + titles + years * 2 };
}

/** Le joueur sans terre continue avec un membre titré de sa dynastie ; sinon la partie s'arrête. */
function checkLandless(state: GameState): void {
  if (state.gameOver) return;
  const holds = (id: string) => Object.values(state.counties).some((c) => c.holderId === id);
  if (holds(state.playerId)) return;
  const titled = Object.values(state.characters)
    .filter((c) => c.alive && c.dynastyId === state.playerDynastyId && holds(c.id))
    .sort((a, b) => (a.liegeId ? 1 : 0) - (b.liegeId ? 1 : 0) || a.birthTurn - b.birthTurn)[0];
  if (titled) {
    chronicle(
      state,
      `Dépossédé de ses terres, ${state.characters[state.playerId].name} laisse la tête de la maison à ${titled.name}.`,
      'succession',
    );
    state.playerId = titled.id;
    recordRuler(state, titled.id);
    return;
  }
  state.gameOver = {
    reason: 'Votre maison a perdu toutes ses terres : la dynastie n’a plus d’héritier titré.',
    score: lineageScore(state),
    ending: 'ruine',
  };
}

function finishGame(state: GameState): void {
  if (!state.gameOver) return;
  state.gameOver.score = lineageScore(state);
  state.gameOver.ending ??= computeEnding(state);
  const cur = state.rulers?.find((r) => r.to === undefined);
  if (cur) cur.to = state.turn;
  checkAchievements(state);
  state.phase = 'fin';
  chronicle(state, state.gameOver.reason, 'succession');
}
