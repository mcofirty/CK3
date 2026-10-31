/** Batailles nées d'un événement (pillards, invasions, révoltes paysannes…). */
import { BALANCE } from '../../data/balance';
import { UNIT_TYPES } from '../../data/units';
import { autoResolve, createBattle, sideMen } from '../battle/engine';
import type { BattleState, Commander } from '../battle/types';
import { addTrait } from '../characters';
import { killCharacter } from '../characters/lifecycle';
import { chronicle, newId, seasonOf, type Ctx } from '../context';
import { applyEffects, renderText } from '../events/engine';
import type { EventBattle } from '../events/types';
import { gainXp, record } from '../progression';
import { availableLevies, capitalOf, standingOf } from '../realm';
import type { UnitCounts } from '../state';
import { emptyUnits, totalMen } from '../units';
import { armyOf, toCommander } from './index';

const DEFAULT_MIX: Partial<Record<keyof UnitCounts, number>> = {
  levees: 0.45,
  infanterie: 0.2,
  archers: 0.15,
  cavalerie: 0.12,
  piquiers: 0.08,
};

/** Lance la bataille ; si une autre bataille est déjà à l'écran, celle-ci se résout seule. */
export function startEventBattle(ctx: Ctx, spec: EventBattle, scope: Record<string, string>): void {
  const { state, rng } = ctx;
  const p = state.characters[state.playerId];
  const army = armyOf(state, p.id);
  let men: UnitCounts;
  let levyFrom: Record<string, number> | undefined;
  let standing: UnitCounts | undefined;
  if (army) men = { ...army.men };
  else {
    men = emptyUnits();
    levyFrom = {};
    const lv = availableLevies(state, p.id);
    for (const [cid, n] of Object.entries(lv.byCounty)) {
      const take = Math.floor((n * BALANCE.events.emergencyLevies) / 100) * 100;
      if (take <= 0) continue;
      levyFrom[cid] = take;
      state.counties[cid].levyPool = Math.max(0, state.counties[cid].levyPool - take);
      men.levees += take;
    }
    standing = { ...standingOf(state, p.id) };
    state.standing[p.id] = emptyUnits();
    for (const u of UNIT_TYPES) men[u] += standing[u];
    if (totalMen(men) < BALANCE.events.militia) men.levees += BALANCE.events.militia;
  }
  const ours = totalMen(men);
  const theirsTotal = Math.max(100, Math.round((ours * spec.force) / 50) * 50);
  const mix = spec.composition ?? DEFAULT_MIX;
  const mixTotal = Object.values(mix).reduce((s, v) => s + (v ?? 0), 0) || 1;
  const enemy = emptyUnits();
  for (const u of UNIT_TYPES) enemy[u] = Math.round((theirsTotal * (mix[u] ?? 0)) / mixTotal);
  const cmdId = army?.commanderId ?? p.id;
  const mine = [toCommander(state, cmdId, p.id)].filter((x): x is Commander => !!x);
  const chief: Commander = {
    id: `evt-chef-${state.nextId + 1}`,
    name: `Chef de ${renderText(state, spec.ennemi, scope)}`,
    guerre: rng.int(7, 14),
    ruse: rng.int(6, 12),
    traits: [],
    isSovereign: false,
  };
  const county =
    (scope.comte && state.counties[scope.comte]) ||
    (army && state.counties[army.location]) ||
    capitalOf(state, p.id) ||
    Object.values(state.counties)[0];
  const mineSide = {
    name: 'Vos troupes',
    rulerId: p.id,
    men,
    commanders: mine,
    mainCommanderId: mine[0]?.id,
    isPlayer: true,
    ai: 'normal' as const,
    friendlyTerritory: true,
    spied: false,
  };
  const enemyName = renderText(state, spec.ennemi, scope);
  const theirSide = {
    name: enemyName,
    men: enemy,
    commanders: [chief],
    mainCommanderId: chief.id,
    isPlayer: false,
    ai: state.difficulty,
    friendlyTerritory: false,
    spied: false,
  };
  const battle = createBattle(
    {
      id: `evt${newId(state, '')}`,
      countyId: county.id,
      countyName: county.name,
      terrain: county.terrain,
      river: false,
      season: seasonOf(state.turn),
      attacker: spec.attaque ? mineSide : theirSide,
      defender: spec.attaque ? theirSide : mineSide,
    },
    rng,
  );
  battle.event = {
    victoire: spec.victoire,
    defaite: spec.defaite,
    scope,
    armyId: army?.id,
    levyFrom,
    standing,
  };
  if (state.battle) {
    autoResolve(battle, rng);
    applyEventBattle(ctx, battle);
    return;
  }
  state.battle = battle;
  state.phase = 'bataille';
}

/** Applique l'issue d'une bataille d'événement : pertes, commandants, effets. */
export function applyEventBattle(ctx: Ctx, battle: BattleState): boolean {
  const { state } = ctx;
  const ev = battle.event;
  const res = battle.result;
  if (!ev || !res) return false;
  const key = battle.playerSide ?? 'defender';
  const side = battle[key];
  const left = sideMen(side);
  const won = res.winner === key;
  if (ev.armyId && state.armies[ev.armyId]) {
    const a = state.armies[ev.armyId];
    for (const u of UNIT_TYPES) a.men[u] = Math.max(0, Math.round(left[u]));
  } else {
    // Les survivants rentrent chez eux.
    const startStanding = ev.standing ?? emptyUnits();
    const startTotal = side.initialMen || 1;
    const ratio = Math.min(1, totalMen(left) / startTotal);
    for (const [cid, n] of Object.entries(ev.levyFrom ?? {}))
      if (state.counties[cid]) state.counties[cid].levyPool += Math.round(n * ratio);
    const st = standingOf(state, state.playerId);
    for (const u of UNIT_TYPES) st[u] += Math.floor((startStanding[u] * ratio) / 100) * 100;
  }
  for (const id of res.wounded)
    if (state.characters[id]?.alive) addTrait(state.characters[id], 'blesse');
  for (const id of res.killed) if (state.characters[id]) killCharacter(ctx, id, 'au combat');
  const cmd = side.mainCommanderId ? state.characters[side.mainCommanderId] : undefined;
  if (cmd?.alive) {
    record(cmd).battles += 1;
    if (won) record(cmd).wins += 1;
    gainXp(
      state,
      cmd,
      'guerre',
      BALANCE.progression.battleXp + (won ? BALANCE.progression.battleWinXp : 0),
    );
  }
  if (state.stats) {
    if (won) state.stats.battlesWon += 1;
    else state.stats.battlesLost += 1;
  }
  chronicle(
    state,
    `Bataille de ${battle.countyName} contre ${battle[key === 'attacker' ? 'defender' : 'attacker'].name} : ${won ? 'victoire' : 'défaite'}.`,
    'bataille',
  );
  state.lastBattleReport = {
    countyName: battle.countyName,
    attackerName: battle.attacker.name,
    defenderName: battle.defender.name,
    playerWon: won,
    result: res,
  };
  applyEffects(ctx, won ? ev.victoire : ev.defaite, ev.scope);
  return won;
}
