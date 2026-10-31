/** Guerre de campagne : armées, déplacements, ravitaillement, sièges, score, paix (section 8). */
import { BALANCE } from '../../data/balance';
import { TERRAINS } from '../../data/terrain';
import { UNIT_TYPES, UNITS } from '../../data/units';
import { autoResolve, createBattle, sideMen } from '../battle/engine';
import type { BattleState, Commander, SideKey } from '../battle/types';
import {
  addOpinion,
  addTrait,
  allied,
  atWar,
  allyKey,
  displayName,
  hasTrait,
  heldCounties,
  isAdult,
  perkBonus,
  perkTactics,
  skill,
  warSide,
} from '../characters';
import type { TacticId } from '../../data/tactics';
import { TRAITS } from '../../data/traits';
import { gainXp, record } from '../progression';
import { seasonMercenaries, tryNegotiate } from './campaignExtras';
import { killCharacter } from '../characters/lifecycle';
import { chronicle, clamp, newId, notify, seasonOf, type Ctx } from '../context';
import {
  availableLevies,
  capitalOf,
  countyRuler,
  countySupplyBonus,
  fortLevel,
  hasRoad,
  rankOf,
  realmCounties,
  realmName,
  recruitCapacity,
  standingOf,
} from '../realm';
import type { Army, CasusBelliType, County, GameState, UnitType, War } from '../state';
import { addUnits, armyStrength, emptyUnits, totalMen } from '../units';

const W = BALANCE.war;

// ---------------------------------------------------------------------------
// Territoire et hostilité
// ---------------------------------------------------------------------------

export function armyOf(state: GameState, ownerId: string): Army | undefined {
  return Object.values(state.armies).find((a) => a.ownerId === ownerId);
}

export function warBetween(state: GameState, a: string, b: string): War | undefined {
  return Object.values(state.wars).find((w) => {
    const sa = warSide(state, w.id, a);
    const sb = warSide(state, w.id, b);
    return sa && sb && sa !== sb;
  });
}

export function warsOf(state: GameState, id: string): War[] {
  return Object.values(state.wars).filter((w) => warSide(state, w.id, id));
}

/** Le comté est-il ami pour ce propriétaire d'armée ? */
export function isFriendlyCounty(state: GameState, ownerId: string, c: County): boolean {
  if (c.occupation) {
    const side = warSide(state, c.occupation.warId, ownerId);
    const occSide = warSide(state, c.occupation.warId, c.occupation.byRulerId);
    return !!side && side === occSide;
  }
  if (c.holderId === ownerId) return true;
  if (atWar(state, ownerId, c.holderId)) return false;
  const r = countyRuler(state, c);
  if (r === ownerId) return true;
  if (allied(state, ownerId, r)) return !atWar(state, ownerId, r);
  const owner = state.characters[ownerId];
  if (owner?.liegeId === r && !atWar(state, ownerId, r)) return true;
  return false;
}

export function isHostileCounty(state: GameState, ownerId: string, c: County): boolean {
  if (isFriendlyCounty(state, ownerId, c)) return false;
  if (c.occupation) return !!warSide(state, c.occupation.warId, ownerId);
  return atWar(state, ownerId, countyRuler(state, c)) || atWar(state, ownerId, c.holderId);
}

export function canEnter(state: GameState, ownerId: string, c: County): boolean {
  return isFriendlyCounty(state, ownerId, c) || isHostileCounty(state, ownerId, c);
}

export function findPath(state: GameState, ownerId: string, from: string, to: string): string[] {
  if (from === to) return [];
  const prev = new Map<string, string>();
  const queue = [from];
  const seen = new Set([from]);
  while (queue.length) {
    const cur = queue.shift()!;
    for (const n of state.counties[cur].adjacent) {
      if (seen.has(n)) continue;
      if (!canEnter(state, ownerId, state.counties[n])) continue;
      seen.add(n);
      prev.set(n, cur);
      if (n === to) {
        const path = [n];
        let p = cur;
        while (p !== from) {
          path.unshift(p);
          p = prev.get(p)!;
        }
        return path;
      }
      queue.push(n);
    }
  }
  return [];
}

export function armiesHostile(state: GameState, a: Army, b: Army): boolean {
  return a.ownerId !== b.ownerId && atWar(state, a.ownerId, b.ownerId);
}

// ---------------------------------------------------------------------------
// Levée, dissolution, recrutement
// ---------------------------------------------------------------------------

export function defaultCommander(state: GameState, rulerId: string): string | undefined {
  if (rulerId === state.playerId) {
    const m = state.council.marechal.holderId;
    if (m && state.characters[m]?.alive && !state.characters[m].imprisonedBy) return m;
  }
  const court = courtiersOf(state, rulerId).filter((c) => isAdult(state, c) && !c.imprisonedBy);
  const ruler = state.characters[rulerId];
  const best = [...court, ruler].sort((a, b) => skill(b, 'guerre') - skill(a, 'guerre'))[0];
  return best?.id;
}

export function courtiersOf(state: GameState, rulerId: string) {
  return Object.values(state.characters).filter(
    (c) =>
      c.alive && c.id !== rulerId && c.courtId === rulerId && !heldCounties(state, c.id).length,
  );
}

export function canRaise(state: GameState, rulerId: string): { ok: boolean; reason?: string } {
  if (armyOf(state, rulerId)) return { ok: false, reason: 'Une armée est déjà levée' };
  const lv = availableLevies(state, rulerId).total;
  const st = totalMen(standingOf(state, rulerId));
  if (lv + st < 100) return { ok: false, reason: 'Aucune troupe disponible' };
  return { ok: true };
}

export function raiseArmy(ctx: Ctx, rulerId: string, countyId?: string): Army | undefined {
  const { state } = ctx;
  if (!canRaise(state, rulerId).ok) return undefined;
  const lv = availableLevies(state, rulerId);
  const men = addUnits(emptyUnits(), standingOf(state, rulerId));
  state.standing[rulerId] = emptyUnits();
  men.levees += lv.total;
  for (const [cid, n] of Object.entries(lv.byCounty)) {
    const c = state.counties[cid];
    c.levyPool = Math.max(0, c.levyPool - n);
  }
  const loc = countyId ?? capitalOf(state, rulerId)?.id;
  if (!loc) return undefined;
  const cmd = defaultCommander(state, rulerId);
  const army: Army = {
    id: newId(state, 'a'),
    ownerId: rulerId,
    location: loc,
    men,
    baseMen: totalMen(men),
    levyFrom: lv.byCounty,
    supply: 100,
    commanderId: cmd,
    frontCommanders: [],
    path: [],
    seasonsRaised: 0,
  };
  state.armies[army.id] = army;
  return army;
}

export function disbandArmy(ctx: Ctx, armyId: string): void {
  const { state } = ctx;
  const a = state.armies[armyId];
  if (!a) return;
  const levyTotal = Object.values(a.levyFrom).reduce((s, n) => s + n, 0);
  if (levyTotal > 0) {
    const ratio = a.men.levees / levyTotal;
    for (const [cid, n] of Object.entries(a.levyFrom)) {
      const c = state.counties[cid];
      if (c) c.levyPool += n * Math.min(1, ratio);
    }
  }
  const pros = { ...a.men, levees: 0 };
  for (const k of UNIT_TYPES) pros[k] = Math.round(pros[k]);
  if (state.characters[a.ownerId]?.alive)
    state.standing[a.ownerId] = addUnits(standingOf(state, a.ownerId), pros);
  for (const c of Object.values(state.counties))
    if (c.siege?.armyId === armyId) c.siege = undefined;
  delete state.armies[armyId];
}

export interface RecruitCheck {
  ok: boolean;
  reason?: string;
  cost: number;
}

export function canRecruit(
  state: GameState,
  rulerId: string,
  unit: UnitType,
  companies: number,
): RecruitCheck {
  const r = state.characters[rulerId];
  const cost = UNITS[unit].recruit * companies;
  if (unit === 'levees') return { ok: false, reason: 'Les levées viennent des comtés', cost };
  const cap = recruitCapacity(state, rulerId);
  if (!cap.unlocked.has(unit))
    return { ok: false, reason: `Il faut ${bldName(UNITS[unit].building)}`, cost };
  const done = r.recruitedThisSeason ?? 0;
  if (done + companies > cap.cap)
    return {
      ok: false,
      reason: `Capacité de recrutement : ${cap.cap - done} compagnie(s) cette saison`,
      cost,
    };
  if (r.gold < cost) return { ok: false, reason: `Il faut ${cost} or`, cost };
  return { ok: true, cost };
}

function bldName(b: string | null): string {
  return b === 'caserne'
    ? 'une Caserne'
    : b === 'archerie'
      ? 'une Archerie'
      : b === 'ecuries'
        ? 'des Écuries'
        : 'un bâtiment';
}

export function recruit(ctx: Ctx, rulerId: string, unit: UnitType, companies: number): boolean {
  const { state } = ctx;
  const chk = canRecruit(state, rulerId, unit, companies);
  if (!chk.ok) return false;
  const r = state.characters[rulerId];
  r.gold -= chk.cost;
  r.recruitedThisSeason = (r.recruitedThisSeason ?? 0) + companies;
  const army = armyOf(state, rulerId);
  if (army && isFriendlyCounty(state, rulerId, state.counties[army.location])) {
    army.men[unit] += companies * 100;
    army.baseMen += companies * 100;
  } else {
    standingOf(state, rulerId)[unit] += companies * 100;
  }
  return true;
}

export function dismissCompanies(
  ctx: Ctx,
  rulerId: string,
  unit: UnitType,
  companies: number,
): void {
  const st = standingOf(ctx.state, rulerId);
  st[unit] = Math.max(0, st[unit] - companies * 100);
}

export function setArmyTarget(ctx: Ctx, armyId: string, target: string): boolean {
  const { state } = ctx;
  const a = state.armies[armyId];
  if (!a) return false;
  const path = findPath(state, a.ownerId, a.location, target);
  if (target !== a.location && !path.length) return false;
  a.path = path;
  return true;
}

export function armySpeed(state: GameState, a: Army): number {
  const tot = totalMen(a.men);
  const allCav = tot > 0 && a.men.cavalerie >= tot - 0.5;
  return allCav || hasRoad(state.counties[a.location]) ? 2 : 1;
}

// ---------------------------------------------------------------------------
// Résolution militaire d'une saison
// ---------------------------------------------------------------------------

export interface PendingBattle {
  countyId: string;
  attackerArmyId: string;
  defenderArmyId: string;
}

/** Déplacements, puis détection des batailles. Les batailles entre IA sont résolues ici. */
export function moveAndDetect(ctx: Ctx): PendingBattle[] {
  const { state } = ctx;
  const moved = new Set<string>();
  for (const a of Object.values(state.armies)) {
    a.assault = a.assault ?? false;
    if (!a.path.length) continue;
    let steps = armySpeed(state, a);
    while (steps-- > 0 && a.path.length) {
      const next = a.path[0];
      if (!canEnter(state, a.ownerId, state.counties[next])) {
        a.path = [];
        break;
      }
      a.path.shift();
      a.cameFrom = a.location;
      a.location = next;
      moved.add(a.id);
      for (const c of Object.values(state.counties))
        if (c.siege?.armyId === a.id) c.siege = undefined;
      // Arrêt au contact d'une armée hostile.
      const hostile = Object.values(state.armies).some(
        (b) => b.location === next && armiesHostile(state, a, b),
      );
      if (hostile) {
        a.path = [];
        break;
      }
    }
  }
  return detectBattles(ctx, moved);
}

export function detectBattles(ctx: Ctx, moved: Set<string>): PendingBattle[] {
  const { state } = ctx;
  const pending: PendingBattle[] = [];
  const byCounty = new Map<string, Army[]>();
  for (const a of Object.values(state.armies)) {
    if (!byCounty.has(a.location)) byCounty.set(a.location, []);
    byCounty.get(a.location)!.push(a);
  }
  for (const [countyId, armies] of byCounty) {
    const sorted = armies.sort((x, y) => totalMen(y.men) - totalMen(x.men));
    for (const a of sorted) {
      const b = sorted.find((x) => x !== a && armiesHostile(state, a, x));
      if (!b) continue;
      // L'attaquant est celui qui vient d'arriver ; sinon l'attaquant de la guerre.
      let att = a;
      let def = b;
      if (moved.has(b.id) && !moved.has(a.id)) [att, def] = [b, a];
      else if (moved.has(a.id) === moved.has(b.id)) {
        const w = warBetween(state, a.ownerId, b.ownerId);
        if (w && warSide(state, w.id, b.ownerId) === 'attacker') [att, def] = [b, a];
      }
      if (pending.some((p) => p.countyId === countyId)) break;
      if (att.ownerId === state.playerId || def.ownerId === state.playerId) {
        pending.push({ countyId, attackerArmyId: att.id, defenderArmyId: def.id });
      } else {
        const battle = setupBattle(ctx, countyId, att.id, def.id);
        autoResolve(battle, ctx.rng);
        applyBattleResult(ctx, battle);
      }
      break;
    }
  }
  return pending;
}

export function toCommander(
  state: GameState,
  id: string | undefined,
  ownerId: string,
): Commander | undefined {
  const c = id ? state.characters[id] : undefined;
  if (!c?.alive || c.imprisonedBy) return undefined;
  return {
    id: c.id,
    name: c.name,
    guerre: skill(c, 'guerre') + marshalTraining(state, ownerId) + perkBonus(state, c, 'commander'),
    ruse: skill(c, 'ruse'),
    traits: [...c.traits],
    isSovereign: c.id === ownerId,
    morale: perkBonus(state, c, 'morale'),
    tactics: perkTactics(state, c) as TacticId[],
    duel: perkBonus(state, c, 'duel'),
  };
}

/** Maréchal : entraînement des troupes (+ moral via bonus de commandement). */
function marshalTraining(state: GameState, ownerId: string): number {
  if (ownerId !== state.playerId) return 0;
  const seat = state.council.marechal;
  const h = seat.holderId ? state.characters[seat.holderId] : undefined;
  if (!h?.alive || seat.task !== 'entrainement') return 0;
  return Math.round((skill(h, 'guerre') / 10) * BALANCE.council.trainTroopsMorale);
}

export function setupBattle(
  ctx: Ctx,
  countyId: string,
  attArmyId: string,
  defArmyId: string,
): BattleState {
  const { state, rng } = ctx;
  const county = state.counties[countyId];
  const att = state.armies[attArmyId];
  const def = state.armies[defArmyId];
  const side = (a: Army) => {
    const ids = [a.commanderId, ...a.frontCommanders];
    const commanders = ids
      .map((id) => toCommander(state, id, a.ownerId))
      .filter((x): x is Commander => !!x);
    const isPlayer = a.ownerId === state.playerId;
    const enemy = a === att ? def : att;
    const spiedTurn = state.spied[enemy.ownerId];
    return {
      name: realmName(state, a.ownerId).replace(/^(Royaume|Duché|Comté) de /, ''),
      rulerId: a.ownerId,
      armyId: a.id,
      men: { ...a.men },
      commanders,
      mainCommanderId: commanders[0]?.id,
      isPlayer,
      ai: isPlayer
        ? ('normal' as const)
        : enemy.ownerId === state.playerId
          ? state.difficulty
          : ('normal' as const),
      friendlyTerritory: isFriendlyCounty(state, a.ownerId, county),
      spied:
        isPlayer &&
        spiedTurn !== undefined &&
        state.turn - spiedTurn <= BALANCE.council.spyDuration,
    };
  };
  const war = warBetween(state, att.ownerId, def.ownerId);
  return createBattle(
    {
      id: newId(state, 'b'),
      countyId,
      countyName: county.name,
      terrain: county.terrain,
      river: !!att.cameFrom && county.rivers.includes(att.cameFrom),
      season: seasonOf(state.turn),
      attacker: side(att),
      defender: side(def),
      warId: war?.id,
    },
    rng,
  );
}

/** Applique le résultat d'une bataille terminée à la campagne. */
export function applyBattleResult(ctx: Ctx, battle: BattleState): void {
  const { state, rng } = ctx;
  const res = battle.result;
  if (!res) return;
  const sides: SideKey[] = ['attacker', 'defender'];
  for (const k of sides) {
    const bs = battle[k];
    const army = bs.armyId ? state.armies[bs.armyId] : undefined;
    if (!army) continue;
    const men = sideMen(bs);
    for (const u of UNIT_TYPES) army.men[u] = Math.max(0, Math.round(men[u]));
  }
  const winner = battle[res.winner];
  const loser = battle[res.winner === 'attacker' ? 'defender' : 'attacker'];
  const winnerId = winner.rulerId!;
  const loserId = loser.rulerId!;
  // Commandants.
  for (const id of res.wounded) {
    const c = state.characters[id];
    if (c?.alive) addTrait(c, 'blesse');
  }
  for (const id of res.killed) killCharacter(ctx, id, 'au combat');
  const war = battle.warId ? state.wars[battle.warId] : warBetween(state, winnerId, loserId);
  for (const id of res.captured) {
    const c = state.characters[id];
    if (!c?.alive) continue;
    c.imprisonedBy = winnerId;
    if (war) {
      war.captured.push(id);
      // Souverain ennemi capturé.
      if (id === loserId || id === war.attackerId || id === war.defenderId)
        adjustScore(state, war, winnerId, W.capture);
    }
    if (winnerId === state.playerId) notify(state, `${c.name} est votre prisonnier.`);
    if (c.id === state.playerId) notify(state, `Vous êtes capturé par l’ennemi !`);
  }
  // Faits d'armes des commandants : expérience, traits gagnés au feu.
  const P = BALANCE.progression;
  for (const k of sides) {
    const bs = battle[k];
    const won = k === res.winner;
    for (const cm of bs.commanders) {
      const c = state.characters[cm.id];
      if (!c?.alive) continue;
      const r = record(c);
      r.battles += 1;
      if (won) r.wins += 1;
      gainXp(state, c, 'guerre', P.battleXp + (won ? P.battleWinXp : 0));
      const gained = (t: string) => {
        if (hasTrait(c, t)) return;
        addTrait(c, t);
        if (bs.rulerId === state.playerId)
          notify(state, `${c.name} gagne le trait ${TRAITS[t]?.name ?? t}.`);
      };
      if (r.battles >= 5) gained('veteran');
      if (won && cm.id === bs.mainCommanderId) {
        const enemyLoss = res.losses[k === 'attacker' ? 'defender' : 'attacker'];
        const ownLoss = res.losses[k];
        if (r.wins >= 3 && rng.chance(0.25)) gained('tacticien');
        if (enemyLoss > 3 * Math.max(1, ownLoss) && res.pursuitLosses > 0 && rng.chance(0.2))
          gained('boucher');
        if (rng.chance(0.06))
          gained(rng.pick(['stratege', 'inebranlable', 'cavalier', 'inspirant']));
      }
    }
  }
  // Duel.
  if (res.duel) {
    const w = state.characters[res.duel.winnerId];
    if (w?.alive) {
      record(w).duels += 1;
      w.prestige += BALANCE.battle.duel.prestige;
      if (!hasTrait(w, 'heros')) addTrait(w, 'heros');
      if (battle[res.duel.winnerSide].rulerId === state.playerId && state.stats)
        state.stats.duelsWon += 1;
    }
  }
  if (state.stats && (winnerId === state.playerId || loserId === state.playerId)) {
    if (winnerId === state.playerId) state.stats.battlesWon += 1;
    else state.stats.battlesLost += 1;
  }
  if (war) adjustScore(state, war, winnerId, res.warScore);
  const wr = state.characters[winnerId];
  if (wr) wr.prestige += BALANCE.battle.prestigeWin;
  if (wr?.dynastyId) state.dynasties[wr.dynastyId].renown += BALANCE.battle.renownWin;
  // Le perdant se retire.
  const la = loser.armyId ? state.armies[loser.armyId] : undefined;
  if (la) {
    if (totalMen(la.men) < 100) disbandArmy(ctx, la.id);
    else retreat(state, la);
  }
  const playerInvolved = winnerId === state.playerId || loserId === state.playerId;
  const text = `Bataille de ${battle.countyName} : ${winner.name} bat ${loser.name} (${res.losses.attacker + res.losses.defender} morts).`;
  if (playerInvolved) {
    chronicle(state, text, 'bataille');
    state.lastBattleReport = {
      countyName: battle.countyName,
      attackerName: battle.attacker.name,
      defenderName: battle.defender.name,
      playerWon: winnerId === state.playerId,
      result: res,
    };
  } else if (
    war &&
    (warSide(state, war.id, state.playerId) || allied(state, state.playerId, winnerId))
  ) {
    notify(state, text);
  }
}

function retreat(state: GameState, a: Army): void {
  a.path = [];
  const cur = state.counties[a.location];
  const options = cur.adjacent
    .map((id) => state.counties[id])
    .filter(
      (c) =>
        isFriendlyCounty(state, a.ownerId, c) &&
        !Object.values(state.armies).some((b) => b.location === c.id && armiesHostile(state, a, b)),
    );
  const cap = capitalOf(state, a.ownerId);
  const target = options.sort((x, y) => (x.id === cap?.id ? -1 : y.id === cap?.id ? 1 : 0))[0];
  if (target) {
    a.cameFrom = a.location;
    a.location = target.id;
  }
  a.supply = Math.max(0, a.supply - 10);
}

/** Ajoute des points au camp du personnage (score vu de l'attaquant). */
export function adjustScore(state: GameState, war: War, rulerId: string, points: number): void {
  const side = warSide(state, war.id, rulerId);
  if (!side) return;
  war.score = clamp(war.score + (side === 'attacker' ? points : -points), -100, 100);
}

/** Sièges, ravitaillement et usure, objectifs tenus. */
export function seasonCampaign(ctx: Ctx): void {
  const { state, rng } = ctx;
  const winter = seasonOf(state.turn) === 3;
  for (const a of Object.values(state.armies)) {
    const c = state.counties[a.location];
    a.seasonsRaised += 1;
    const hostilePresent = Object.values(state.armies).some(
      (b) => b.location === c.id && armiesHostile(state, a, b),
    );
    // Siège.
    const besiegeable =
      !hostilePresent &&
      ((isHostileCounty(state, a.ownerId, c) && !isOccupiedBySideOf(state, c, a.ownerId)) ||
        (c.occupation && isFriendlyLand(state, a.ownerId, c)));
    if (besiegeable) {
      if (!c.siege || c.siege.armyId !== a.id) c.siege = { armyId: a.id, progress: 0 };
      const required = W.siegeBase + fortLevel(c);
      if (tryNegotiate(ctx, a.id)) {
        c.siege.progress = required;
      } else if (a.assault) {
        const loss = W.assaultLosses + W.assaultLossesPerFort * fortLevel(c);
        for (const u of UNIT_TYPES) a.men[u] = Math.round(a.men[u] * (1 - loss));
        c.siege.progress = required;
        a.assault = false;
        if (a.ownerId === state.playerId)
          notify(state, `Assaut sur ${c.name} : ${Math.round(loss * 100)} % de pertes.`);
      } else c.siege.progress += 1;
      if (c.siege.progress >= required) {
        c.siege = undefined;
        if (c.occupation && isFriendlyLand(state, a.ownerId, c)) liberate(state, c, a.ownerId);
        else occupy(state, c, a.ownerId);
      }
    } else if (c.siege?.armyId === a.id && hostilePresent) {
      c.siege = undefined;
    }
    a.assault = false;
    // Ravitaillement.
    if (isFriendlyCounty(state, a.ownerId, c))
      a.supply = Math.min(
        100,
        a.supply +
          W.supplyFriendly +
          countySupplyBonus(c) +
          perkBonus(state, state.characters[a.ownerId], 'supply'),
      );
    else a.supply = Math.max(0, a.supply + (winter ? W.supplyEnemyWinter : W.supplyEnemy));
    // Usure.
    let rate = W.attritionBase;
    if (winter) rate *= W.attritionWinter;
    rate *= TERRAINS[c.terrain].attrition;
    if (a.supply <= 0) rate *= W.attritionNoSupply;
    if (marshalTrainingActive(state, a.ownerId)) rate *= 0.75;
    rate *= Math.max(0.2, 1 + perkBonus(state, state.characters[a.ownerId], 'attrition'));
    // Blocus : l'armée se retranche autour de la place.
    if (a.siegeMode === 'blocus' && c.siege?.armyId === a.id)
      rate *= BALANCE.siege.blockadeAttrition;
    const lost = a.baseMen * rate;
    const tot = totalMen(a.men);
    if (tot > 0)
      for (const u of UNIT_TYPES) a.men[u] = Math.max(0, a.men[u] - (lost * a.men[u]) / tot);
    // Levées gardées trop longtemps.
    if (a.seasonsRaised > W.leviesDecayAfter) a.men.levees *= 1 - W.leviesDecayRate;
    for (const u of UNIT_TYPES) a.men[u] = Math.round(a.men[u]);
    if (totalMen(a.men) < 50) disbandArmy(ctx, a.id);
  }
  seasonMercenaries(state);
  // Objectifs tenus.
  for (const w of Object.values(state.wars)) {
    if (!w.targetCountyId) continue;
    const t = state.counties[w.targetCountyId];
    if (
      t.occupation?.warId === w.id &&
      warSide(state, w.id, t.occupation.byRulerId) === 'attacker'
    ) {
      w.objectiveHeldSeasons += 1;
      if (w.objectiveHeldSeasons >= W.objectiveHeldSeasons)
        w.score = clamp(w.score + W.objectiveHeld, -100, 100);
    } else w.objectiveHeldSeasons = 0;
  }
  void rng;
}

function marshalTrainingActive(state: GameState, ownerId: string): boolean {
  if (ownerId !== state.playerId) return false;
  const s = state.council.marechal;
  return s.task === 'entrainement' && !!s.holderId && !!state.characters[s.holderId]?.alive;
}

function isOccupiedBySideOf(state: GameState, c: County, ownerId: string): boolean {
  if (!c.occupation) return false;
  return (
    warSide(state, c.occupation.warId, ownerId) ===
    warSide(state, c.occupation.warId, c.occupation.byRulerId)
  );
}

/** Terre propre ou alliée (hors occupation). */
function isFriendlyLand(state: GameState, ownerId: string, c: County): boolean {
  const r = countyRuler(state, c);
  return r === ownerId || c.holderId === ownerId || allied(state, ownerId, r);
}

function occupy(state: GameState, c: County, ownerId: string): void {
  const war =
    warBetween(state, ownerId, countyRuler(state, c)) ?? warBetween(state, ownerId, c.holderId);
  if (!war) return;
  c.occupation = { warId: war.id, byRulerId: ownerId, since: state.turn };
  const pts = war.targetCountyId === c.id ? W.occupationObjective : W.occupation;
  adjustScore(state, war, ownerId, pts);
  if (ownerId === state.playerId) notify(state, `${c.name} est occupé par vos troupes.`);
  else if (countyRuler(state, c) === state.playerId)
    notify(state, `${c.name} est tombé aux mains de l’ennemi.`);
}

function liberate(state: GameState, c: County, ownerId: string): void {
  const occ = c.occupation;
  if (!occ) return;
  const war = state.wars[occ.warId];
  if (war) {
    const pts = war.targetCountyId === c.id ? W.occupationObjective : W.occupation;
    adjustScore(state, war, occ.byRulerId, -pts);
  }
  c.occupation = undefined;
  if (ownerId === state.playerId) notify(state, `${c.name} est libéré.`);
}

/** Pillage : ravitaillement contre opinion et développement. */
export function canLoot(state: GameState, a: Army): { ok: boolean; reason?: string } {
  const c = state.counties[a.location];
  if (!isHostileCounty(state, a.ownerId, c))
    return { ok: false, reason: 'Seulement en territoire ennemi' };
  if (c.lootedTurn !== undefined && state.turn - c.lootedTurn < 4)
    return { ok: false, reason: 'Déjà pillé récemment' };
  return { ok: true };
}

export function loot(ctx: Ctx, armyId: string): boolean {
  const { state } = ctx;
  const a = state.armies[armyId];
  if (!a || !canLoot(state, a).ok) return false;
  const c = state.counties[a.location];
  a.supply = Math.min(100, a.supply + W.lootSupply);
  c.lootedTurn = state.turn;
  c.development = Math.max(1, c.development - W.lootDevelopment);
  state.characters[a.ownerId].gold += W.lootGold;
  addOpinion(state, c.holderId, a.ownerId, 'A pillé mes terres', W.lootOpinion, 20);
  return true;
}

// ---------------------------------------------------------------------------
// Déclaration de guerre
// ---------------------------------------------------------------------------

export interface WarCheck {
  ok: boolean;
  reasons: string[];
  prestigeCost: number;
}

export function truceWith(state: GameState, a: string, b: string): number | undefined {
  const end = state.truces[allyKey(a, b)];
  return end !== undefined && end > state.turn ? end : undefined;
}

export function canDeclareWar(
  state: GameState,
  attackerId: string,
  defenderId: string,
  cb: CasusBelliType,
  countyId?: string,
): WarCheck {
  const a = state.characters[attackerId];
  const reasons: string[] = [];
  let prestigeCost = 0;
  if (attackerId === defenderId) reasons.push('Cible invalide');
  if (atWar(state, attackerId, defenderId)) reasons.push('Déjà en guerre');
  if (truceWith(state, attackerId, defenderId)) reasons.push('Trêve en cours');
  if (allied(state, attackerId, defenderId)) reasons.push('Vous êtes alliés');
  if (a.imprisonedBy) reasons.push('Vous êtes prisonnier');
  if (
    Object.values(state.characters).some(
      (h) => h.alive && h.hostageOf === defenderId && h.hostageHome === attackerId,
    )
  )
    reasons.push('Un otage de votre maison est retenu à sa cour');
  if (cb === 'independance') {
    if (a.liegeId !== defenderId) reasons.push('Seul un vassal peut réclamer son indépendance');
  } else {
    if (a.liegeId) reasons.push('Un vassal ne peut pas déclarer cette guerre');
    const county = countyId ? state.counties[countyId] : undefined;
    if (!county) reasons.push('Choisir un comté objectif');
    else if (countyRuler(state, county) !== defenderId)
      reasons.push('Le comté n’appartient pas à ce souverain');
    if (cb === 'revendication' && county && !a.claims.includes(county.id))
      reasons.push('Aucune revendication sur ce comté');
    if (cb === 'conquete') {
      prestigeCost = W.conquestPrestige;
      if (rankOf(state, attackerId) !== 'roi' && !hasTrait(a, 'ambitieux'))
        reasons.push('Rang de roi ou trait Ambitieux requis');
      if (a.prestige < prestigeCost) reasons.push(`${prestigeCost} prestige requis`);
      if (
        county &&
        !county.adjacent.some((n) => countyRuler(state, state.counties[n]) === attackerId)
      )
        reasons.push('Le comté doit border votre royaume');
    }
    if (cb === 'defense') reasons.push('La défense d’un allié passe par l’appel aux armes');
  }
  return { ok: reasons.length === 0, reasons, prestigeCost };
}

export function declareWar(
  ctx: Ctx,
  attackerId: string,
  defenderId: string,
  cb: CasusBelliType,
  countyId?: string,
  force = false,
): War | undefined {
  const { state } = ctx;
  const chk = canDeclareWar(state, attackerId, defenderId, cb, countyId);
  if (!chk.ok && !force) return undefined;
  const a = state.characters[attackerId];
  a.prestige -= chk.prestigeCost;
  const cbLabel = {
    revendication: 'Revendication',
    conquete: 'Conquête',
    independance: 'Indépendance',
    defense: 'Défense',
  }[cb];
  const target = countyId ? state.counties[countyId] : undefined;
  const war: War = {
    id: newId(state, 'w'),
    name: target ? `${cbLabel} de ${target.name}` : `${cbLabel} de ${displayName(state, a)}`,
    attackerId,
    defenderId,
    attackerAllies: [],
    defenderAllies: [],
    cb,
    targetCountyId: countyId,
    score: 0,
    objectiveHeldSeasons: 0,
    startTurn: state.turn,
    captured: [],
  };
  state.wars[war.id] = war;
  const d = state.characters[defenderId];
  const involvesPlayer = attackerId === state.playerId || defenderId === state.playerId;
  if (involvesPlayer)
    chronicle(
      state,
      `${displayName(state, a)} déclare la guerre à ${displayName(state, d)} (${war.name}).`,
      'guerre',
    );
  else notify(state, `${a.name} déclare la guerre à ${d.name} (${war.name}).`);
  addOpinion(state, defenderId, attackerId, 'M’a déclaré la guerre', -30, 40);
  return war;
}

/** Ajoute un allié à un camp. */
export function joinWar(
  state: GameState,
  warId: string,
  allyId: string,
  side: 'attacker' | 'defender',
): void {
  const w = state.wars[warId];
  if (!w || warSide(state, warId, allyId)) return;
  if (side === 'attacker') w.attackerAllies.push(allyId);
  else w.defenderAllies.push(allyId);
}

// ---------------------------------------------------------------------------
// Paix
// ---------------------------------------------------------------------------

export type PeaceOutcome = 'attaquant' | 'defenseur' | 'blanche';

export function transferCounty(state: GameState, countyId: string, newHolder: string): void {
  const c = state.counties[countyId];
  const old = c.holderId;
  c.holderId = newHolder;
  c.occupation = undefined;
  c.siege = undefined;
  // Duché perdu si on n'y tient plus rien.
  for (const d of Object.values(state.duchies)) {
    if (
      d.holderId === old &&
      !d.counties.some(
        (id) =>
          state.counties[id].holderId === old || countyRuler(state, state.counties[id]) === old,
      )
    )
      d.holderId = undefined;
  }
  for (const ch of Object.values(state.characters))
    ch.claims = ch.claims.filter((x) => !(x === countyId && ch.id === newHolder));
  // Un vassal sans terre rejoint la cour de son ancien suzerain.
  const oldC = state.characters[old];
  if (oldC && !heldCounties(state, old).length && oldC.liegeId) {
    oldC.courtId = oldC.liegeId;
    oldC.liegeId = undefined;
  }
}

export function endWar(ctx: Ctx, warId: string, outcome: PeaceOutcome): void {
  const { state } = ctx;
  const w = state.wars[warId];
  if (!w) return;
  const att = state.characters[w.attackerId];
  const def = state.characters[w.defenderId];
  const winnerId =
    outcome === 'attaquant' ? w.attackerId : outcome === 'defenseur' ? w.defenderId : undefined;
  const loserId =
    outcome === 'attaquant' ? w.defenderId : outcome === 'defenseur' ? w.attackerId : undefined;
  let detail = '';
  if (outcome === 'attaquant') {
    if (w.cb === 'independance') {
      for (const id of [w.attackerId, ...w.attackerAllies]) {
        const c = state.characters[id];
        if (c?.liegeId === w.defenderId) {
          c.liegeId = undefined;
          c.inFaction = false;
        }
      }
      detail = `${att.name} obtient son indépendance.`;
    } else {
      const gained: string[] = [];
      if (
        w.targetCountyId &&
        countyRuler(state, state.counties[w.targetCountyId]) === w.defenderId
      ) {
        transferCounty(state, w.targetCountyId, w.attackerId);
        gained.push(state.counties[w.targetCountyId].name);
      }
      if (w.cb === 'conquete') {
        for (const c of Object.values(state.counties)) {
          if (
            c.occupation?.warId === w.id &&
            warSide(state, w.id, c.occupation.byRulerId) === 'attacker' &&
            countyRuler(state, c) === w.defenderId
          ) {
            transferCounty(state, c.id, w.attackerId);
            gained.push(c.name);
          }
        }
      }
      detail = gained.length ? `${att.name} obtient ${gained.join(', ')}.` : '';
    }
  } else if (outcome === 'defenseur') {
    const pay = Math.max(0, Math.min(att.gold, 100));
    att.gold -= pay;
    def.gold += pay;
    if (w.cb === 'independance') {
      for (const id of [w.attackerId, ...w.attackerAllies]) {
        const c = state.characters[id];
        if (c) {
          c.inFaction = false;
          c.opinions[w.defenderId] = [];
          addOpinion(state, id, w.defenderId, 'Révolte matée', 10, 20);
        }
      }
    }
    detail = pay ? `${att.name} verse ${pay} or de réparations.` : '';
  }
  if (winnerId && loserId) {
    state.characters[winnerId].prestige += W.peaceWinnerPrestige;
    state.characters[loserId].prestige += W.peaceLoserPrestige;
    const wd = state.characters[winnerId].dynastyId;
    if (wd) state.dynasties[wd].renown += 10;
  }
  // Prisonniers libérés, occupations levées.
  for (const id of w.captured) {
    const c = state.characters[id];
    if (c) c.imprisonedBy = undefined;
  }
  for (const c of Object.values(state.counties)) {
    if (c.occupation?.warId === w.id) c.occupation = undefined;
  }
  const participants = [w.attackerId, w.defenderId, ...w.attackerAllies, ...w.defenderAllies];
  delete state.wars[warId];
  for (const a of Object.values(state.armies)) {
    if (!participants.includes(a.ownerId)) continue;
    const c = state.counties[a.location];
    if (c.siege?.armyId === a.id) c.siege = undefined;
    if (!isFriendlyCounty(state, a.ownerId, c) && !isHostileCounty(state, a.ownerId, c)) {
      const cap = capitalOf(state, a.ownerId);
      if (cap) a.location = cap.id;
      a.path = [];
    }
  }
  state.truces[allyKey(w.attackerId, w.defenderId)] = state.turn + BALANCE.game.truceSeasons;
  const text =
    outcome === 'blanche'
      ? `Paix blanche : fin de la guerre « ${w.name} ».`
      : `Fin de la guerre « ${w.name} » : victoire de ${state.characters[winnerId!].name}. ${detail}`;
  if (participants.includes(state.playerId)) chronicle(state, text.trim(), 'guerre');
  else notify(state, text.trim());
}

/** Score de guerre vu d'un participant (positif = favorable). */
export function scoreFor(state: GameState, w: War, id: string): number {
  return warSide(state, w.id, id) === 'defender' ? -w.score : w.score;
}

export interface PeaceCheck {
  accept: boolean;
  reasons: string[];
}

/** L'adversaire IA accepte-t-il la paix proposée par `fromId` ? */
export function peaceAcceptance(
  state: GameState,
  warId: string,
  fromId: string,
  kind: 'exiger' | 'blanche' | 'capituler',
): PeaceCheck {
  const w = state.wars[warId];
  if (!w) return { accept: false, reasons: ['Guerre introuvable'] };
  const my = scoreFor(state, w, fromId);
  const age = state.turn - w.startTurn;
  if (kind === 'capituler')
    return { accept: true, reasons: ['L’ennemi accepte toujours votre reddition'] };
  if (kind === 'exiger') {
    const ok = my >= W.peaceThreshold;
    return {
      accept: ok,
      reasons: [`Score de guerre ${Math.round(my)} (il faut ${W.peaceThreshold})`],
    };
  }
  const reasons = [`Score de guerre ${Math.round(my)} de votre point de vue`];
  if (my >= 0) reasons.push('L’ennemi ne perd rien à signer');
  if (age >= 12) reasons.push('La guerre s’éternise');
  const ok = my >= 0 || (my > -25 && age >= 12);
  return { accept: ok, reasons };
}

/** Force relative d'un souverain et de ses alliés (levées + compagnies + armées). */
export function militaryStrength(state: GameState, id: string): number {
  const lv = availableLevies(state, id).total;
  const st = standingOf(state, id);
  const army = armyOf(state, id);
  const men = addUnits(addUnits(emptyUnits(), st), army ? army.men : {});
  men.levees += lv;
  return armyStrength(men);
}

export function sideStrength(state: GameState, ids: string[]): number {
  return ids.reduce((s, id) => s + militaryStrength(state, id), 0);
}

export function realmSize(state: GameState, id: string): number {
  return realmCounties(state, id).length;
}
