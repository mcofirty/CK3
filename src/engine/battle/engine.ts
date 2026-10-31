/**
 * Moteur de bataille à trois fronts (section 9 du cahier des charges).
 * Les fonctions modifient l'objet BattleState reçu : l'appelant (applyAction) travaille
 * toujours sur une copie de l'état.
 */
import { BALANCE } from '../../data/balance';
import { TERRAINS, RIVER } from '../../data/terrain';
import { TRAITS, type BattleAbility } from '../../data/traits';
import { COUNTERS, UNIT_TYPES, UNITS } from '../../data/units';
import { Rng } from '../rng';
import type { UnitCounts, UnitType } from '../state';
import { emptyUnits, totalMen } from '../units';
import {
  FRONTS,
  FRONT_LABELS,
  ORDER_LABELS,
  type BattleResult,
  type BattleSetup,
  type BattleSetupSide,
  type BattleSide,
  type BattleState,
  type Commander,
  type Front,
  type FrontId,
  type Order,
  type Preset,
  type SideKey,
  type SideOrders,
} from './types';

const B = BALANCE.battle;

export const other = (s: SideKey): SideKey => (s === 'attacker' ? 'defender' : 'attacker');

export function adjacentFronts(f: FrontId): FrontId[] {
  return f === 'center' ? ['left', 'right'] : ['center'];
}

export function hasAbility(c: Commander | undefined, a: BattleAbility): boolean {
  return !!c && c.traits.some((t) => TRAITS[t]?.battle === a);
}

export function frontCommander(side: BattleSide, f: FrontId): Commander | undefined {
  const id = side.fronts[f].commanderId;
  return id ? side.commanders.find((c) => c.id === id) : undefined;
}

/** Commandant effectif d'un front : le sien, sinon le commandant principal. */
export function effectiveCommander(side: BattleSide, f: FrontId): Commander | undefined {
  return (
    frontCommander(side, f) ??
    (side.mainCommanderId ? side.commanders.find((c) => c.id === side.mainCommanderId) : undefined)
  );
}

export function isActive(fr: Front): boolean {
  return !fr.broken && !fr.withdrawn && totalMen(fr.men) > 0.5;
}

function weightedBaseMorale(u: UnitCounts): number {
  const t = totalMen(u);
  if (t <= 0) return 0;
  let m = 0;
  for (const k of UNIT_TYPES) m += u[k] * UNITS[k].morale;
  return m / t;
}

function moraleModifiers(side: BattleSide, season: number): number {
  let mod = 0;
  if (side.sovereignPresent) mod += B.sovereignMorale;
  if (season === 3) mod += B.winterMorale;
  return mod;
}

function emptyFront(): Front {
  return {
    men: emptyUnits(),
    startMen: 0,
    morale: 0,
    broken: false,
    withdrawn: false,
    volleys: B.orders.shoot.volleys,
    lastLoss: 0,
    lastMoraleLoss: 0,
  };
}

function createSide(s: BattleSetupSide): BattleSide {
  const main = s.mainCommanderId
    ? s.commanders.find((c) => c.id === s.mainCommanderId)
    : s.commanders[0];
  let recon = 0;
  if (s.friendlyTerritory) recon++;
  if (s.spied) recon++;
  if (s.commanders.some((c) => hasAbility(c, 'stratege'))) recon++;
  const side: BattleSide = {
    name: s.name,
    rulerId: s.rulerId,
    armyId: s.armyId,
    isPlayer: s.isPlayer,
    ai: s.ai,
    fronts: { left: emptyFront(), center: emptyFront(), right: emptyFront() },
    reserve: { ...s.men },
    reserveMorale: 0,
    commanders: s.commanders,
    mainCommanderId: main?.id,
    sovereignPresent: !!main?.isSovereign,
    recon: Math.min(2, recon) as 0 | 1 | 2,
    rallyUsed: false,
    initialMen: totalMen(s.men),
    baseMorale: 0,
  };
  // Commandants : le principal au centre, les autres sur les ailes.
  if (main) side.fronts.center.commanderId = main.id;
  const others = s.commanders.filter((c) => c.id !== main?.id).slice(0, 2);
  if (others[0]) side.fronts.left.commanderId = others[0].id;
  if (others[1]) side.fronts.right.commanderId = others[1].id;
  return side;
}

export function createBattle(setup: BattleSetup, rng: Rng): BattleState {
  const attacker = createSide(setup.attacker);
  const defender = createSide(setup.defender);
  const battle: BattleState = {
    id: setup.id,
    countyId: setup.countyId,
    countyName: setup.countyName,
    terrain: setup.terrain,
    river: setup.river,
    season: setup.season,
    rain: setup.season !== 1 && rng.chance(B.rainChance),
    attacker,
    defender,
    round: 0,
    maxRounds: B.maxRounds,
    phase: 'deploiement',
    log: [],
    warId: setup.warId,
    playerSide: setup.attacker.isPlayer ? 'attacker' : setup.defender.isPlayer ? 'defender' : undefined,
    estimate: 0,
    casualties: { killed: [], wounded: [] },
  };
  for (const key of ['attacker', 'defender'] as SideKey[]) deployPreset(battle, key, aiPreset(battle, key));
  // Embuscade en forêt.
  const ambushRuse = TERRAINS[battle.terrain].ambushRuse;
  const defMain = effectiveCommander(defender, 'center');
  if (ambushRuse !== null && defMain && defMain.ruse >= ambushRuse) {
    battle.ambush = rng.pick(FRONTS);
  }
  // Estimation (reconnaissance 0).
  if (battle.playerSide) {
    const enemy = battle[other(battle.playerSide)];
    battle.estimate = Math.round((enemy.initialMen * (1 + rng.range(-0.25, 0.25))) / 10) * 10;
  }
  return battle;
}

/** Préréglage choisi par l'IA. */
export function aiPreset(battle: BattleState, key: SideKey): Preset {
  const side = battle[key];
  const all = sideMen(side);
  const tot = totalMen(all);
  const enemyTot = battle[other(key)].initialMen;
  if (tot > 0 && all.cavalerie / tot >= 0.25) return 'ailes';
  if (key === 'defender' && tot < enemyTot * 0.85) return 'profondeur';
  if (tot >= 2000) return 'centre';
  return 'equilibre';
}

/** Toutes les troupes d'un camp (fronts + réserve). */
export function sideMen(side: BattleSide): UnitCounts {
  const r = { ...side.reserve };
  for (const f of FRONTS) for (const k of UNIT_TYPES) r[k] += side.fronts[f].men[k];
  return r;
}

const PRESET_SHARES: Record<Preset, (u: UnitType) => [number, number, number, number]> = {
  // [gauche, centre, droite, réserve]
  equilibre: () => [0.3, 0.3, 0.3, 0.1],
  centre: (u) => (u === 'cavalerie' ? [0.35, 0.15, 0.35, 0.15] : [0.2, 0.45, 0.2, 0.15]),
  ailes: (u) =>
    u === 'cavalerie'
      ? [0.5, 0, 0.5, 0]
      : u === 'archers'
        ? [0.2, 0.5, 0.2, 0.1]
        : [0.2, 0.5, 0.2, 0.1],
  profondeur: () => [0.22, 0.24, 0.22, 0.32],
};

/** Répartit les compagnies selon un préréglage (méthode du plus fort reste). */
export function deployPreset(battle: BattleState, key: SideKey, preset: Preset): void {
  const side = battle[key];
  const all = sideMen(side);
  const slots: (FrontId | 'reserve')[] = ['left', 'center', 'right', 'reserve'];
  for (const f of FRONTS) side.fronts[f].men = emptyUnits();
  side.reserve = emptyUnits();
  for (const u of UNIT_TYPES) {
    const men = all[u];
    if (men <= 0) continue;
    const companies = Math.max(1, Math.round(men / B.companySize));
    const perCompany = men / companies;
    const shares = PRESET_SHARES[preset](u);
    const raw = shares.map((s) => s * companies);
    const alloc = raw.map(Math.floor);
    let left = companies - alloc.reduce((a, b) => a + b, 0);
    const order = raw
      .map((r, i) => ({ i, rem: r - Math.floor(r), w: shares[i] }))
      .filter((o) => o.w > 0)
      .sort((a, b) => b.rem - a.rem || b.w - a.w);
    for (let j = 0; left > 0; j = (j + 1) % order.length, left--) alloc[order[j].i]++;
    alloc.forEach((c, i) => {
      const slot = slots[i];
      if (slot === 'reserve') side.reserve[u] += c * perCompany;
      else side.fronts[slot].men[u] += c * perCompany;
    });
  }
}

/** Déplace une compagnie (100 hommes au plus) d'un emplacement à un autre pendant le déploiement. */
export function moveCompany(
  battle: BattleState,
  key: SideKey,
  unit: UnitType,
  from: FrontId | 'reserve',
  to: FrontId | 'reserve',
): void {
  if (battle.phase !== 'deploiement' || from === to) return;
  const side = battle[key];
  const src = from === 'reserve' ? side.reserve : side.fronts[from].men;
  const dst = to === 'reserve' ? side.reserve : side.fronts[to].men;
  const amount = Math.min(src[unit], B.companySize);
  if (amount <= 0) return;
  src[unit] -= amount;
  dst[unit] += amount;
}

export function setFrontCommander(
  battle: BattleState,
  key: SideKey,
  front: FrontId,
  commanderId: string | undefined,
): void {
  const side = battle[key];
  for (const f of FRONTS) if (side.fronts[f].commanderId === commanderId) side.fronts[f].commanderId = undefined;
  side.fronts[front].commanderId = commanderId;
}

/** Fin du déploiement : fixe effectifs et moraux de départ. */
export function startBattle(battle: BattleState, rng: Rng): void {
  if (battle.phase !== 'deploiement') return;
  for (const key of ['attacker', 'defender'] as SideKey[]) {
    const side = battle[key];
    const mod = moraleModifiers(side, battle.season);
    side.baseMorale = weightedBaseMorale(sideMen(side)) + mod;
    for (const f of FRONTS) {
      const fr = side.fronts[f];
      fr.startMen = totalMen(fr.men);
      fr.morale = fr.startMen > 0 ? weightedBaseMorale(fr.men) + mod : 0;
      if (fr.startMen <= 0) fr.withdrawn = true;
    }
    side.reserveMorale = totalMen(side.reserve) > 0 ? weightedBaseMorale(side.reserve) + mod : 0;
  }
  battle.phase = 'rounds';
  // Stratège : les ordres ennemis du round 1 sont connus.
  if (battle.playerSide) {
    const mine = battle[battle.playerSide];
    if (mine.commanders.some((c) => hasAbility(c, 'stratege'))) {
      const o = aiOrders(battle, other(battle.playerSide), rng);
      battle.precomputedOrders = o;
      battle.revealedOrders = o.orders;
    }
  }
}

// ---------------------------------------------------------------------------
// IA de bataille (section 9.9)
// ---------------------------------------------------------------------------

function frontStrength(fr: Front, enemy: Front | undefined): number {
  const n = totalMen(fr.men);
  if (n <= 0) return 0;
  const enemyMen = enemy ? enemy.men : fr.men;
  const et = totalMen(enemyMen) || 1;
  let off = 0;
  let def = 0;
  for (const u of UNIT_TYPES) {
    if (fr.men[u] <= 0) continue;
    let counter = 0;
    for (const v of UNIT_TYPES) counter += (enemyMen[v] / et) * COUNTERS[u][v];
    off += fr.men[u] * UNITS[u].attack * (et > 1 ? counter : 1);
    def += fr.men[u] * UNITS[u].defense;
  }
  return ((off + def) / 2) * (0.5 + Math.max(0, fr.morale) / 100);
}

export function canFeint(side: BattleSide, f: FrontId): boolean {
  const fr = side.fronts[f];
  const t = totalMen(fr.men);
  const c = effectiveCommander(side, f);
  if (hasAbility(c, 'cavalier')) return t > 0;
  return t > 0 && fr.men.cavalerie / t >= B.orders.feint.minCavalry && !!c && c.guerre >= B.orders.feint.minGuerre;
}

export function canShoot(fr: Front): boolean {
  return fr.men.archers > 0.5 && fr.volleys > 0;
}

export function isFree(battle: BattleState, key: SideKey, f: FrontId): boolean {
  return !isActive(battle[other(key)].fronts[f]);
}

/** Cibles de flanc possibles pour un front libre. */
export function flankTargets(battle: BattleState, key: SideKey, f: FrontId): FrontId[] {
  if (!isFree(battle, key, f)) return [];
  const enemy = battle[other(key)];
  return adjacentFronts(f).filter((g) => isActive(enemy.fronts[g]));
}

export function validOrders(battle: BattleState, key: SideKey, f: FrontId): Order[] {
  const side = battle[key];
  const fr = side.fronts[f];
  if (!isActive(fr)) return [];
  const res: Order[] = ['charger', 'tenir'];
  if (canShoot(fr)) res.push('tirer');
  res.push('feindre');
  if (!hasAbility(effectiveCommander(side, f), 'impetueux')) res.push('replier');
  if (flankTargets(battle, key, f).length > 0) res.push('flanc');
  return res;
}

/** Règles déterministes de l'IA pour un front (sans aléa, sans contre). */
function ruleOrder(
  battle: BattleState,
  key: SideKey,
  f: FrontId,
  reserveSentTo: FrontId | undefined,
): { order: Order; rule: number } {
  const side = battle[key];
  const enemy = battle[other(key)];
  const fr = side.fronts[f];
  const opp = enemy.fronts[f];
  const ai = B.ai;
  // 1. Front libre : prendre de flanc.
  if (flankTargets(battle, key, f).length > 0) return { order: 'flanc', rule: 1 };
  if (!isActive(opp)) return { order: 'tenir', rule: 6 };
  // 2. Cavalerie en face et piquiers chez nous : tenir.
  const ot = totalMen(opp.men);
  if (ot > 0 && opp.men.cavalerie / ot >= ai.holdVsCavalryShare && fr.men.piquiers > 0)
    return { order: 'tenir', rule: 2 };
  // 3. Moral bas : réserve, sinon repli si les voisins tiennent.
  if (fr.morale < ai.lowMorale) {
    if (reserveSentTo === f) return { order: 'tenir', rule: 3 };
    const neighborsHold = adjacentFronts(f).every((g) => isActive(side.fronts[g]));
    if (neighborsHold && !hasAbility(effectiveCommander(side, f), 'impetueux'))
      return { order: 'replier', rule: 3 };
  }
  // 4. Rapport de force favorable : charger.
  const ratio = frontStrength(fr, opp) / Math.max(1, frontStrength(opp, fr));
  if (ratio >= ai.chargeRatio) return { order: 'charger', rule: 4 };
  // 5. Archers : tirer.
  const t = totalMen(fr.men);
  if (t > 0 && fr.men.archers / t >= ai.shootArcherShare && canShoot(fr)) return { order: 'tirer', rule: 5 };
  // 6. Sinon : tenir.
  return { order: 'tenir', rule: 6 };
}

export function aiOrders(battle: BattleState, key: SideKey, rng: Rng): SideOrders {
  const side = battle[key];
  const enemyKey = other(key);
  const level = side.ai;
  const orders = {} as Record<FrontId, Order>;
  const flank: Partial<Record<FrontId, FrontId>> = {};
  const reserve: Partial<Record<FrontId, Partial<UnitCounts>>> = {};
  let reserveSentTo: FrontId | undefined;
  const reserveMen = totalMen(side.reserve);

  // Réserve : centre brisé en priorité, sinon le front au moral le plus bas (< seuil).
  if (reserveMen > 0.5) {
    let target: FrontId | undefined;
    if (!isActive(side.fronts.center)) target = 'center';
    else {
      const low = FRONTS.filter((f) => isActive(side.fronts[f]) && side.fronts[f].morale < B.ai.lowMorale).sort(
        (a, b) => side.fronts[a].morale - side.fronts[b].morale,
      );
      if (low.length) target = low[0];
      else {
        const broken = FRONTS.filter((f) => side.fronts[f].broken);
        if (broken.length === 1) target = broken[0];
      }
    }
    if (target) {
      reserve[target] = { ...side.reserve };
      reserveSentTo = target;
    }
  }

  // Ralliement (Inspirant).
  let rally: FrontId | undefined;
  if (!side.rallyUsed && side.commanders.some((c) => hasAbility(c, 'inspirant'))) {
    const low = FRONTS.filter((f) => isActive(side.fronts[f]) && side.fronts[f].morale < 35);
    if (low.length) rally = low[0];
  }

  const randomP = B.ai.randomOrders[level];
  for (const f of FRONTS) {
    const valid = validOrders(battle, key, f);
    if (valid.length === 0) {
      orders[f] = 'tenir';
      continue;
    }
    const { order } = ruleOrder(battle, key, f, reserveSentTo);
    let chosen = order;
    if (randomP > 0 && rng.chance(randomP)) {
      chosen = rng.pick(valid);
    }
    if (!valid.includes(chosen)) chosen = 'tenir';
    orders[f] = chosen;
    if (chosen === 'flanc') {
      const targets = flankTargets(battle, key, f);
      const enemy = battle[enemyKey];
      targets.sort((a, b) => enemy.fronts[a].morale - enemy.fronts[b].morale);
      flank[f] = targets[0];
    }
  }
  const result: SideOrders = { orders, flankTargets: flank, reserve, rally };
  if (level === 'difficile' && !lookahead) return bestResponse(battle, key, result);
  return result;
}

// Anticipation en cours (évite la récursion).
let lookahead = false;

/** Ordres prévus d'un camp : règles de l'IA, sans aléa. */
function predictedOrders(battle: BattleState, key: SideKey): SideOrders {
  const side = battle[key];
  const saved = side.ai;
  side.ai = 'normal';
  lookahead = true;
  const o = aiOrders(battle, key, neutralRng());
  lookahead = false;
  side.ai = saved;
  return o;
}

/** Générateur neutre pour les anticipations (pas d'ordres aléatoires, aléa médian). */
function neutralRng(): Rng {
  const r = new Rng(0);
  r.next = () => 0.5;
  return r;
}

/** Valeur d'une position pour un camp : puissance restante (effectif × moral). */
function positionValue(battle: BattleState, key: SideKey): number {
  const val = (s: BattleSide): number => {
    let v = 0;
    for (const f of FRONTS) {
      const fr = s.fronts[f];
      if (isActive(fr)) v += totalMen(fr.men) * Math.max(0, fr.morale);
    }
    v += totalMen(s.reserve) * Math.max(0, s.reserveMorale) * 0.9;
    return v / Math.max(1, s.initialMen);
  };
  let score = val(battle[key]) - val(battle[other(key)]);
  if (battle.result) score += battle.result.winner === key ? 1000 : -1000;
  return score;
}

/**
 * IA Difficile : pour chaque front, essaie chaque ordre valide contre l'ordre le plus probable
 * de l'adversaire, simule le round et garde le meilleur.
 */
function bestResponse(battle: BattleState, key: SideKey, base: SideOrders): SideOrders {
  const enemyKey = other(key);
  const predicted = predictedOrders(battle, enemyKey);
  const best: SideOrders = { ...base, orders: { ...base.orders }, flankTargets: { ...base.flankTargets } };
  const evaluate = (candidate: SideOrders): number => {
    const clone = structuredClone(battle);
    clone.precomputedOrders = undefined;
    lookahead = true;
    resolveRound(clone, neutralRng(), { forced: { [key]: candidate, [enemyKey]: predicted } });
    // Deuxième round avec les règles, pour voir les conséquences.
    if (clone.phase === 'rounds') {
      resolveRound(clone, neutralRng(), {
        forced: { [key]: predictedOrders(clone, key), [enemyKey]: predictedOrders(clone, enemyKey) },
      });
    }
    lookahead = false;
    return positionValue(clone, key);
  };
  let bestScore = evaluate(best);
  for (const f of FRONTS) {
    for (const o of validOrders(battle, key, f)) {
      if (o === best.orders[f]) continue;
      const cand: SideOrders = { ...best, orders: { ...best.orders, [f]: o }, flankTargets: { ...best.flankTargets } };
      if (o === 'flanc') cand.flankTargets![f] = flankTargets(battle, key, f)[0];
      const sc = evaluate(cand);
      if (sc > bestScore + 1e-6) {
        bestScore = sc;
        best.orders[f] = o;
        best.flankTargets = cand.flankTargets;
      }
    }
  }
  return best;
}

// ---------------------------------------------------------------------------
// Résolution d'un round (section 9.6)
// ---------------------------------------------------------------------------

interface Effective {
  order: Order;
  target?: FrontId;
  feintFailed?: boolean;
}

function unitAttackMod(
  battle: BattleState,
  key: SideKey,
  f: FrontId,
  u: UnitType,
  eff: Effective,
  feintTriggered: boolean,
): number {
  const side = battle[key];
  const cmd = effectiveCommander(side, f);
  const terrain = TERRAINS[battle.terrain];
  const O = B.orders;
  // Modificateur d'ordre O_u.
  let o = 1;
  switch (eff.order) {
    case 'charger': {
      const imp = hasAbility(cmd, 'impetueux');
      if (u === 'cavalerie') o = imp ? O.chargeImpetueux.cavalryAttack : O.charge.cavalryAttack;
      else o = imp ? O.chargeImpetueux.attack : O.charge.attack;
      if (key === 'attacker') o *= terrain.attackerCharge;
      break;
    }
    case 'tenir':
      o = O.hold.attack;
      break;
    case 'tirer':
      o = u === 'archers' ? O.shoot.archerAttack : 0;
      break;
    case 'feindre':
      o = feintTriggered && !eff.feintFailed ? 1 : O.feint.idleAttack;
      break;
    case 'flanc':
      o = O.flank.attack;
      break;
    case 'replier':
      o = 0;
      break;
  }
  // Modificateur de terrain et météo T_u.
  let t = terrain.allAttack;
  if (u === 'cavalerie') t *= terrain.cavalryAttack;
  if (u === 'archers') {
    t *= terrain.archerAttack;
    if (key === 'defender') t *= terrain.defenderArcherAttack;
    if (battle.rain) t *= B.rainArchers;
  }
  if (battle.river && key === 'attacker' && battle.round <= RIVER.rounds) t *= RIVER.attackerAttack;
  if (u === 'cavalerie' && hasAbility(cmd, 'cavalier')) t *= B.traits.cavalierCavalry;
  return o * t;
}

function defenseOf(
  battle: BattleState,
  key: SideKey,
  f: FrontId,
  eff: Effective,
  chargedBy: boolean,
): number {
  const side = battle[key];
  const fr = side.fronts[f];
  const t = totalMen(fr.men);
  if (t <= 0) return 1;
  const cmd = effectiveCommander(side, f);
  const terrain = TERRAINS[battle.terrain];
  let orderDef = 1;
  if (eff.order === 'charger') orderDef = B.orders.charge.defense;
  if (eff.order === 'tenir') orderDef = hasAbility(cmd, 'prudent') ? B.orders.hold.prudentDefense : B.orders.hold.defense;
  const terrainDef = key === 'defender' ? terrain.defenderDefense : 1;
  let d = 0;
  for (const v of UNIT_TYPES) {
    if (fr.men[v] <= 0) continue;
    let dv = UNITS[v].defense * orderDef * terrainDef;
    if (v === 'archers' && eff.order === 'tirer' && chargedBy) dv *= B.orders.shoot.archerDefenseVsCharge;
    d += (fr.men[v] / t) * dv;
  }
  return Math.max(0.1, d);
}

function commanderCoef(c: Commander | undefined): number {
  if (!c) return 1;
  return 1 + B.commanderPerPoint * (c.guerre - B.commanderBase);
}

function validateOrders(battle: BattleState, key: SideKey, so: SideOrders): Record<FrontId, Effective> {
  const side = battle[key];
  const res = {} as Record<FrontId, Effective>;
  for (const f of FRONTS) {
    const fr = side.fronts[f];
    let order = so.orders[f] ?? 'tenir';
    const eff: Effective = { order };
    if (!isActive(fr)) {
      res[f] = { order: 'tenir' };
      continue;
    }
    const valid = validOrders(battle, key, f);
    if (order !== 'feindre' && !valid.includes(order)) order = 'tenir';
    eff.order = order;
    if (order === 'flanc') {
      const targets = flankTargets(battle, key, f);
      const wanted = so.flankTargets?.[f];
      eff.target = wanted && targets.includes(wanted) ? wanted : targets[0];
    } else if (order !== 'replier') {
      eff.target = f;
    }
    if (order === 'feindre' && !canFeint(side, f)) eff.feintFailed = true;
    res[f] = eff;
  }
  return res;
}

function mergeMorale(m1: number, n1: number, m2: number, n2: number): number {
  return n1 + n2 > 0 ? (m1 * n1 + m2 * n2) / (n1 + n2) : 0;
}

function applyReserve(battle: BattleState, key: SideKey, so: SideOrders, lines: string[]): void {
  const side = battle[key];
  if (!so.reserve) return;
  for (const f of FRONTS) {
    const req = so.reserve[f];
    if (!req) continue;
    const send = emptyUnits();
    for (const u of UNIT_TYPES) send[u] = Math.min(side.reserve[u], Math.max(0, req[u] ?? 0));
    const n = totalMen(send);
    if (n < 1) continue;
    const fr = side.fronts[f];
    const reinforcementMorale = side.reserveMorale + B.reserveBonusMorale;
    if (!isActive(fr)) {
      // Le front est reformé par la réserve.
      for (const u of UNIT_TYPES) fr.men[u] = send[u];
      fr.morale = reinforcementMorale;
      fr.broken = false;
      fr.withdrawn = false;
      fr.startMen = n;
    } else {
      fr.morale = mergeMorale(fr.morale, totalMen(fr.men), reinforcementMorale, n);
      for (const u of UNIT_TYPES) fr.men[u] += send[u];
      fr.startMen += n;
    }
    for (const u of UNIT_TYPES) side.reserve[u] -= send[u];
    if (totalMen(side.reserve) < 1) side.reserveMorale = 0;
    lines.push(`${side.name} engage ${Math.round(n)} hommes de réserve (${FRONT_LABELS[f].toLowerCase()}).`);
  }
}

export interface RoundOptions {
  /** Ordres du joueur (sinon l'IA décide pour tous les camps). */
  playerOrders?: SideOrders;
  /** Force l'IA à jouer le camp du joueur (résolution automatique). */
  autoPlayer?: boolean;
  /** Ordres imposés (anticipation de l'IA Difficile). */
  forced?: Partial<Record<SideKey, SideOrders>>;
}

export function resolveRound(battle: BattleState, rng: Rng, opts: RoundOptions = {}): void {
  if (battle.phase === 'deploiement') startBattle(battle, rng);
  if (battle.phase !== 'rounds') return;
  const lines: string[] = [];
  const sideOrders = {} as Record<SideKey, SideOrders>;
  for (const key of ['attacker', 'defender'] as SideKey[]) {
    const side = battle[key];
    const forced = opts.forced?.[key];
    if (forced) sideOrders[key] = forced;
    else if (side.isPlayer && opts.playerOrders && !opts.autoPlayer) sideOrders[key] = opts.playerOrders;
    else if (battle.precomputedOrders && battle.round === 0 && key !== battle.playerSide) {
      // Ordres déjà calculés et révélés au joueur (Stratège).
      sideOrders[key] = battle.precomputedOrders;
    } else {
      const savedAi = side.ai;
      if (side.isPlayer) side.ai = 'normal';
      sideOrders[key] = aiOrders(battle, key, rng);
      side.ai = savedAi;
    }
  }
  battle.round += 1;
  battle.revealedOrders = undefined;
  battle.precomputedOrders = undefined;
  const round = battle.round;

  // A. Réserve et ralliement.
  for (const key of ['attacker', 'defender'] as SideKey[]) {
    applyReserve(battle, key, sideOrders[key], lines);
    const side = battle[key];
    const rally = sideOrders[key].rally;
    if (rally && !side.rallyUsed && isActive(side.fronts[rally]) && side.commanders.some((c) => hasAbility(c, 'inspirant'))) {
      side.rallyUsed = true;
      side.fronts[rally].morale += B.traits.inspirantRally;
      lines.push(`${side.name} rallie son ${FRONT_LABELS[rally].toLowerCase()} (+${B.traits.inspirantRally} moral).`);
    }
  }

  // B. Validation des ordres.
  const eff = {
    attacker: validateOrders(battle, 'attacker', sideOrders.attacker),
    defender: validateOrders(battle, 'defender', sideOrders.defender),
  };

  // C. Replis.
  for (const key of ['attacker', 'defender'] as SideKey[]) {
    const side = battle[key];
    for (const f of FRONTS) {
      if (eff[key][f].order !== 'replier' || !isActive(side.fronts[f])) continue;
      const fr = side.fronts[f];
      const n = totalMen(fr.men);
      side.reserveMorale = mergeMorale(side.reserveMorale, totalMen(side.reserve), fr.morale + B.withdrawMorale, n);
      for (const u of UNIT_TYPES) {
        side.reserve[u] += fr.men[u];
        fr.men[u] = 0;
      }
      fr.withdrawn = true;
      fr.lastLoss = 0;
      fr.lastMoraleLoss = 0;
    }
  }

  // D. Combat.
  const losses: Record<SideKey, Record<FrontId, UnitCounts>> = {
    attacker: { left: emptyUnits(), center: emptyUnits(), right: emptyUnits() },
    defender: { left: emptyUnits(), center: emptyUnits(), right: emptyUnits() },
  };
  const moraleHit: Record<SideKey, Record<FrontId, number>> = {
    attacker: { left: 0, center: 0, right: 0 },
    defender: { left: 0, center: 0, right: 0 },
  };
  const chargedBy = (key: SideKey, f: FrontId): boolean => {
    const ek = other(key);
    return eff[ek][f].order === 'charger' && eff[ek][f].target === f && isActive(battle[ek].fronts[f]);
  };

  for (const key of ['attacker', 'defender'] as SideKey[]) {
    const side = battle[key];
    const ek = other(key);
    const enemy = battle[ek];
    for (const f of FRONTS) {
      const fr = side.fronts[f];
      const e = eff[key][f];
      if (!isActive(fr) || !e.target) continue;
      const tf = e.target;
      const target = enemy.fronts[tf];
      if (!isActive(target)) continue;
      const tMen = totalMen(target.men);
      // Feinte : déclenchée si le front adverse charge ce front.
      const feintTriggered = e.order === 'feindre' && chargedBy(key, f);
      const R = rng.range(B.randomMin, B.randomMax);
      const C = commanderCoef(effectiveCommander(side, f));
      let sum = 0;
      for (const u of UNIT_TYPES) {
        const n = fr.men[u];
        if (n <= 0) continue;
        let counter = 0;
        for (const v of UNIT_TYPES) counter += (target.men[v] / tMen) * COUNTERS[u][v];
        sum += n * UNITS[u].attack * unitAttackMod(battle, key, f, u, e, feintTriggered) * counter;
      }
      const D = R * C * sum;
      const P = (B.k * D) / defenseOf(battle, ek, tf, eff[ek][tf], chargedBy(ek, tf));
      // Répartition des pertes avec multiplicateurs.
      const targetEff = eff[ek][tf];
      // Mur de piques : la cavalerie qui charge un front qui tient avec assez de piquiers.
      const pikeWall =
        targetEff.order === 'charger' &&
        e.order === 'tenir' &&
        tf === f &&
        fr.men.piquiers / Math.max(1, totalMen(fr.men)) >= B.orders.pikeWallMinShare;
      const feintPunish = feintTriggered && !e.feintFailed && targetEff.order === 'charger';
      for (const v of UNIT_TYPES) {
        if (target.men[v] <= 0) continue;
        let mult = 1;
        if (pikeWall && v === 'cavalerie') mult *= B.orders.pikeWallCavalryLosses;
        if (feintPunish) mult *= B.orders.feint.chargerLosses;
        losses[ek][tf][v] += P * (target.men[v] / tMen) * mult;
      }
      if (e.order === 'flanc') moraleHit[ek][tf] += B.flankMorale;
      if (feintPunish) moraleHit[ek][tf] += B.orders.feint.chargerMorale;
    }
  }

  // Effets fixes : feinte ratée, marais, embuscade.
  for (const key of ['attacker', 'defender'] as SideKey[]) {
    for (const f of FRONTS) {
      if (!isActive(battle[key].fronts[f])) continue;
      if (eff[key][f].feintFailed) moraleHit[key][f] += B.orders.feint.failMorale;
      if (key === 'attacker') moraleHit[key][f] += TERRAINS[battle.terrain].attackerMoralePerRound;
      if (key === 'attacker' && round === 1 && battle.ambush === f) {
        moraleHit[key][f] += B.ambushMorale;
        lines.push(`Embuscade ! ${FRONT_LABELS[f]} de ${battle.attacker.name} surpris (-${B.ambushMorale} moral).`);
      }
    }
  }

  // Application des pertes et du moral.
  const lostThisRound: Record<SideKey, Record<FrontId, number>> = {
    attacker: { left: 0, center: 0, right: 0 },
    defender: { left: 0, center: 0, right: 0 },
  };
  for (const key of ['attacker', 'defender'] as SideKey[]) {
    const side = battle[key];
    for (const f of FRONTS) {
      const fr = side.fronts[f];
      if (!isActive(fr)) continue;
      let lost = 0;
      for (const u of UNIT_TYPES) {
        const l = Math.min(fr.men[u], losses[key][f][u]);
        fr.men[u] -= l;
        lost += l;
      }
      let mLoss = (B.moraleLossFactor * lost) / Math.max(1, fr.startMen);
      if (eff[key][f].order === 'tenir') mLoss *= B.orders.hold.moraleLoss;
      mLoss += moraleHit[key][f];
      fr.lastLoss = lost;
      lostThisRound[key][f] = applyMoraleLoss(side, f, mLoss, 0);
      // Lâche.
      const cmd = frontCommander(side, f);
      if (hasAbility(cmd, 'lache') && fr.morale < B.traits.lacheThreshold && rng.chance(B.traits.lacheChance)) {
        lostThisRound[key][f] = applyMoraleLoss(side, f, B.traits.lacheMorale, lostThisRound[key][f]);
        lines.push(`${cmd!.name} perd son sang-froid (${FRONT_LABELS[f].toLowerCase()}).`);
      }
    }
  }

  // E. Fronts brisés, risques des commandants, chocs.
  const killed: string[] = [];
  const wounded: string[] = [];
  const justBroken: Record<SideKey, FrontId[]> = { attacker: [], defender: [] };
  const checkBreaks = (key: SideKey): FrontId[] => {
    const side = battle[key];
    const newly: FrontId[] = [];
    for (const f of FRONTS) {
      const fr = side.fronts[f];
      if (!isActive(fr)) continue;
      if (fr.morale <= B.breakMorale || totalMen(fr.men) < B.breakMenRatio * fr.startMen) {
        fr.broken = true;
        fr.morale = 0;
        let flee = 0;
        for (const u of UNIT_TYPES) {
          const l = fr.men[u] * B.breakFleeLosses;
          fr.men[u] -= l;
          flee += l;
        }
        fr.lastLoss += flee;
        newly.push(f);
      }
    }
    return newly;
  };
  for (const key of ['attacker', 'defender'] as SideKey[]) justBroken[key] = checkBreaks(key);

  // Risques des commandants.
  for (const key of ['attacker', 'defender'] as SideKey[]) {
    const side = battle[key];
    for (const f of FRONTS) {
      const fr = side.fronts[f];
      const cmd = frontCommander(side, f);
      if (!cmd || (!isActive(fr) && !justBroken[key].includes(f))) continue;
      const p = justBroken[key].includes(f) ? B.risks.woundBroken : B.risks.wound;
      if (rng.chance(p)) {
        if (rng.chance(B.risks.mortal)) {
          killed.push(cmd.id);
          fr.commanderId = undefined;
          if (side.mainCommanderId === cmd.id) side.mainCommanderId = undefined;
          lines.push(`${cmd.name} est tué au combat !`);
          if (isActive(fr)) lostThisRound[key][f] = applyMoraleLoss(side, f, B.shockCommanderLost, lostThisRound[key][f]);
        } else {
          wounded.push(cmd.id);
          lines.push(`${cmd.name} est blessé.`);
        }
      }
    }
  }
  // Chocs des fronts voisins brisés (en cascade).
  for (const key of ['attacker', 'defender'] as SideKey[]) {
    const side = battle[key];
    let queue = [...justBroken[key]];
    while (queue.length) {
      const next: FrontId[] = [];
      for (const bf of queue) {
        for (const g of adjacentFronts(bf)) {
          if (!isActive(side.fronts[g])) continue;
          lostThisRound[key][g] = applyMoraleLoss(side, g, B.shockNeighborBroken, lostThisRound[key][g]);
        }
      }
      const nb = checkBreaks(key);
      justBroken[key].push(...nb);
      next.push(...nb);
      queue = next;
    }
  }
  // Pertes de moral totales du round.
  for (const key of ['attacker', 'defender'] as SideKey[])
    for (const f of FRONTS) battle[key].fronts[f].lastMoraleLoss = lostThisRound[key][f];

  // Journal : une ligne par front.
  for (const f of FRONTS) lines.push(frontLine(battle, f, eff));
  for (const key of ['attacker', 'defender'] as SideKey[])
    for (const f of justBroken[key]) lines.push(`${FRONT_LABELS[f]} de ${battle[key].name} est brisé !`);

  battle.log.push({
    round,
    lines,
    orders: {
      attacker: { left: eff.attacker.left.order, center: eff.attacker.center.order, right: eff.attacker.right.order },
      defender: { left: eff.defender.left.order, center: eff.defender.center.order, right: eff.defender.right.order },
    },
  });
  battle.casualties.killed.push(...killed);
  battle.casualties.wounded.push(...wounded);

  // F. Déroute ?
  const routA = isRouted(battle.attacker);
  const routD = isRouted(battle.defender);
  if (routA || routD) {
    let winner: SideKey;
    if (routA && routD) {
      winner = remainingPower(battle.attacker) > remainingPower(battle.defender) ? 'attacker' : 'defender';
    } else winner = routA ? 'defender' : 'attacker';
    finishBattle(battle, winner, 'deroute', rng);
  } else if (round >= battle.maxRounds) {
    finishBattle(battle, 'defender', 'retraite', rng);
  }
}

/** Applique une perte de moral en respectant le plafond Inébranlable ; renvoie le total perdu ce round. */
function applyMoraleLoss(side: BattleSide, f: FrontId, amount: number, already: number): number {
  const fr = side.fronts[f];
  let a = amount;
  if (hasAbility(frontCommander(side, f), 'inebranlable')) {
    a = Math.max(0, Math.min(a, B.traits.inebranlableMaxLoss - already));
  }
  fr.morale -= a;
  return already + a;
}

function frontLine(battle: BattleState, f: FrontId, eff: Record<SideKey, Record<FrontId, Effective>>): string {
  const me: SideKey = battle.playerSide ?? 'attacker';
  const en = other(me);
  const a = battle[me].fronts[f];
  const b = battle[en].fronts[f];
  const oa = isActive(a) || a.lastLoss > 0 ? ORDER_LABELS[eff[me][f].order] : '—';
  const ob = isActive(b) || b.lastLoss > 0 ? ORDER_LABELS[eff[en][f].order] : '—';
  const flankA = eff[me][f].order === 'flanc' && eff[me][f].target ? ` (${FRONT_LABELS[eff[me][f].target!].toLowerCase()})` : '';
  const flankB = eff[en][f].order === 'flanc' && eff[en][f].target ? ` (${FRONT_LABELS[eff[en][f].target!].toLowerCase()})` : '';
  return `${FRONT_LABELS[f]} : ${oa}${flankA} contre ${ob}${flankB} — pertes ${Math.round(a.lastLoss)} / ${Math.round(b.lastLoss)}, moral −${Math.round(a.lastMoraleLoss)} / −${Math.round(b.lastMoraleLoss)}`;
}

export function isRouted(side: BattleSide): boolean {
  const broken = FRONTS.filter((f) => side.fronts[f].broken).length;
  const reserveEmpty = totalMen(side.reserve) < 1;
  if (broken >= 2) return true;
  if (side.fronts.center.broken && reserveEmpty) return true;
  const anyActive = FRONTS.some((f) => isActive(side.fronts[f]));
  if (!anyActive && reserveEmpty) return true;
  return false;
}

function remainingPower(side: BattleSide): number {
  let p = 0;
  for (const f of FRONTS) if (isActive(side.fronts[f])) p += totalMen(side.fronts[f].men) * Math.max(0, side.fronts[f].morale);
  return p;
}

function finishBattle(battle: BattleState, winner: SideKey, reason: 'deroute' | 'retraite', rng: Rng): void {
  const loserKey = other(winner);
  const loser = battle[loserKey];
  const win = battle[winner];
  let pursuit = 0;
  if (reason === 'deroute') {
    const wm = sideMen(win);
    const wt = totalMen(wm);
    const cavShare = wt > 0 ? wm.cavalerie / wt : 0;
    const rate = Math.min(B.pursuitCap, B.pursuitBase + B.pursuitCavalry * cavShare);
    for (const f of FRONTS) {
      for (const u of UNIT_TYPES) {
        const l = loser.fronts[f].men[u] * rate;
        loser.fronts[f].men[u] -= l;
        pursuit += l;
      }
    }
    for (const u of UNIT_TYPES) {
      const l = loser.reserve[u] * rate;
      loser.reserve[u] -= l;
      pursuit += l;
    }
  }
  // Captures : commandants du perdant dont le front est brisé.
  const captured: string[] = [];
  const killedSet = new Set(battle.casualties.killed);
  for (const f of FRONTS) {
    const cmd = frontCommander(loser, f);
    if (!cmd || killedSet.has(cmd.id)) continue;
    if (loser.fronts[f].broken && rng.chance(B.risks.capture)) captured.push(cmd.id);
  }
  const lossA = battle.attacker.initialMen - totalMen(sideMen(battle.attacker));
  const lossD = battle.defender.initialMen - totalMen(sideMen(battle.defender));
  const engaged = battle.attacker.initialMen + battle.defender.initialMen;
  const ws = B.warScore;
  let score = ws.min + (ws.max - ws.min) * Math.min(1, engaged / ws.menForMax);
  if (reason === 'retraite') score /= 2;
  const result: BattleResult = {
    winner,
    reason,
    rounds: battle.round,
    losses: { attacker: Math.round(lossA), defender: Math.round(lossD) },
    pursuitLosses: Math.round(pursuit),
    killed: [...killedSet],
    wounded: [...new Set(battle.casualties.wounded)].filter((id) => !killedSet.has(id)),
    captured,
    menEngaged: engaged,
    warScore: Math.round(score),
  };
  battle.result = result;
  battle.phase = 'fin';
  const lastLog = battle.log[battle.log.length - 1];
  const verdict =
    reason === 'deroute'
      ? `${loser.name} est en déroute. Victoire de ${win.name}.`
      : `Après ${battle.maxRounds} rounds, ${battle.attacker.name} se retire. Victoire de ${win.name}.`;
  lastLog?.lines.push(verdict);
}

/** Résout la bataille jusqu'au bout avec l'IA pour tous les camps. */
export function autoResolve(battle: BattleState, rng: Rng): void {
  if (battle.phase === 'deploiement') startBattle(battle, rng);
  let guard = 0;
  while (battle.phase === 'rounds' && guard++ < 20) resolveRound(battle, rng, { autoPlayer: true });
}

/** Ordres par défaut proposés au joueur (règles de l'IA, sans aléa). */
export function suggestedOrders(battle: BattleState, key: SideKey): SideOrders {
  const orders = {} as Record<FrontId, Order>;
  const flank: Partial<Record<FrontId, FrontId>> = {};
  for (const f of FRONTS) {
    const valid = validOrders(battle, key, f);
    if (!valid.length) {
      orders[f] = 'tenir';
      continue;
    }
    const o = ruleOrder(battle, key, f, undefined).order;
    orders[f] = o === 'replier' ? 'tenir' : o;
    if (orders[f] === 'flanc') flank[f] = flankTargets(battle, key, f)[0];
  }
  return { orders, flankTargets: flank, reserve: {} };
}

export { totalMen };
