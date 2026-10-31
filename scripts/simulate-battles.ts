/**
 * Simulation de batailles IA contre IA pour l'équilibrage (section 9.11).
 * Usage : npm run simulate [-- --n 10000]
 */
import { UNITS, UNIT_TYPES } from '../src/data/units';
import { autoResolve, createBattle } from '../src/engine/battle/engine';
import type { BattleSetup, Commander } from '../src/engine/battle/types';
import { Rng } from '../src/engine/rng';
import type { Difficulty, Terrain, UnitCounts, UnitType } from '../src/engine/state';
import { emptyUnits } from '../src/engine/units';

const argN = process.argv.indexOf('--n');
const TOTAL = argN > 0 ? Number(process.argv[argN + 1]) : 10000;
const TERRAINS: Terrain[] = ['plaine', 'colline', 'foret', 'marais', 'montagne'];

function cmd(id: string, guerre: number): Commander {
  return { id, name: id, guerre, ruse: 8, traits: [], isSovereign: false };
}

/** Armée d'une valeur donnée en or, selon des parts de budget par type. */
function armyFromBudget(budget: number, shares: Partial<Record<UnitType, number>>): UnitCounts {
  const u = emptyUnits();
  for (const k of UNIT_TYPES) {
    const s = shares[k] ?? 0;
    if (s <= 0) continue;
    const cost = UNITS[k].recruit || 20;
    u[k] = Math.round((budget * s) / cost) * 100;
  }
  return u;
}

const BALANCED = { piquiers: 0.25, archers: 0.2, infanterie: 0.3, cavalerie: 0.25 };
const MIXED_MEN: UnitCounts = { levees: 1000, piquiers: 300, archers: 300, infanterie: 200, cavalerie: 200 };

interface Fight {
  a: UnitCounts;
  d: UnitCounts;
  terrain: Terrain;
  aGuerre?: number;
  dGuerre?: number;
  aAi?: Difficulty;
  dAi?: Difficulty;
  season?: 0 | 1 | 2 | 3;
}

function fight(f: Fight, rng: Rng): { attackerWon: boolean; rounds: number } {
  const setup: BattleSetup = {
    id: 'sim',
    countyName: 'Simulation',
    terrain: f.terrain,
    river: false,
    season: f.season ?? 1,
    attacker: {
      name: 'A', men: f.a, commanders: [cmd('a', f.aGuerre ?? 10)], isPlayer: false,
      ai: f.aAi ?? 'normal', friendlyTerritory: false, spied: false,
    },
    defender: {
      name: 'D', men: f.d, commanders: [cmd('d', f.dGuerre ?? 10)], isPlayer: false,
      ai: f.dAi ?? 'normal', friendlyTerritory: false, spied: false,
    },
  };
  const b = createBattle(setup, rng);
  autoResolve(b, rng);
  return { attackerWon: b.result!.winner === 'attacker', rounds: b.result!.rounds };
}

const rng = new Rng(20261031);
const per = Math.max(50, Math.floor(TOTAL / 20));
let roundsSum = 0;
let battles = 0;
const results: { name: string; value: string; ok: boolean; detail?: string }[] = [];

/** Taux de victoire du camp X, en alternant attaque et défense, terrains variés. */
function winRate(
  n: number,
  make: (xAttacks: boolean, terrain: Terrain) => Fight,
  terrains: Terrain[] = TERRAINS,
): number {
  let wins = 0;
  for (let i = 0; i < n; i++) {
    const xAttacks = i % 2 === 0;
    const terrain = terrains[i % terrains.length];
    const r = fight(make(xAttacks, terrain), rng);
    roundsSum += r.rounds;
    battles++;
    if (r.attackerWon === xAttacks) wins++;
  }
  return wins / n;
}

// 1. Armées d'un seul type contre une armée équilibrée, à coût égal.
const BUDGET = 1800;
let worst = 0;
const mono: string[] = [];
for (const t of ['levees', 'piquiers', 'archers', 'infanterie', 'cavalerie'] as UnitType[]) {
  const single = armyFromBudget(BUDGET, { [t]: 1 });
  const bal = armyFromBudget(BUDGET, BALANCED);
  const w = winRate(per, (xa, terrain) => (xa ? { a: single, d: bal, terrain } : { a: bal, d: single, terrain }));
  worst = Math.max(worst, w);
  mono.push(`${UNITS[t].label} ${(w * 100).toFixed(0)} %`);
}
results.push({ name: 'Armée mono-type vs équilibrée (max ≤ 60 %)', value: `${(worst * 100).toFixed(1)} %`, ok: worst <= 0.6, detail: mono.join(', ') });

// 2. Avantage défensif du terrain : défenseur sur colline / montagne vs plaine.
function defenderRate(terrain: Terrain): number {
  let wins = 0;
  for (let i = 0; i < per; i++) {
    const r = fight({ a: MIXED_MEN, d: MIXED_MEN, terrain }, rng);
    roundsSum += r.rounds;
    battles++;
    if (!r.attackerWon) wins++;
  }
  return wins / per;
}
const plain = defenderRate('plaine');
for (const t of ['colline', 'montagne'] as Terrain[]) {
  const d = (defenderRate(t) - plain) * 100;
  results.push({ name: `Avantage défensif ${t} (+10 à +20 pts)`, value: `${d >= 0 ? '+' : ''}${d.toFixed(1)} pts`, ok: d >= 10 && d <= 20, detail: `plaine ${(plain * 100).toFixed(0)} %` });
}

// 3. Commandant à 18 contre commandant à 8.
const wc = winRate(per * 2, (xa, terrain) =>
  xa ? { a: MIXED_MEN, d: MIXED_MEN, terrain, aGuerre: 18, dGuerre: 8 } : { a: MIXED_MEN, d: MIXED_MEN, terrain, aGuerre: 8, dGuerre: 18 },
);
const dc = (wc - 0.5) * 100;
results.push({ name: 'Commandant 18 vs 8 (+10 à +15 pts)', value: `+${dc.toFixed(1)} pts`, ok: dc >= 10 && dc <= 15 });

// 4. IA Difficile avec 30 % d'effectif en moins contre IA Facile.
const small: UnitCounts = { ...MIXED_MEN };
for (const k of UNIT_TYPES) small[k] = Math.round((MIXED_MEN[k] * 0.7) / 100) * 100;
const wd = winRate(per * 2, (xa, terrain) =>
  xa ? { a: small, d: MIXED_MEN, terrain, aAi: 'difficile', dAi: 'facile' } : { a: MIXED_MEN, d: small, terrain, aAi: 'facile', dAi: 'difficile' },
);
results.push({ name: 'IA Difficile −30 % vs IA Facile (≥ 33 %)', value: `${(wd * 100).toFixed(1)} %`, ok: wd >= 1 / 3 });

// 5. Remplissage jusqu'à TOTAL batailles (mélanges aléatoires), durée moyenne.
while (battles < TOTAL) {
  const mk = (): UnitCounts => {
    const u = emptyUnits();
    for (const k of UNIT_TYPES) u[k] = rng.int(0, k === 'levees' ? 15 : 5) * 100;
    if (u.levees + u.piquiers + u.archers + u.infanterie + u.cavalerie === 0) u.levees = 500;
    return u;
  };
  const r = fight({ a: mk(), d: mk(), terrain: rng.pick(TERRAINS), season: rng.int(0, 3) as 0 | 1 | 2 | 3 }, rng);
  roundsSum += r.rounds;
  battles++;
}
const avgRounds = roundsSum / battles;
results.push({ name: 'Durée moyenne (4 à 6 rounds)', value: avgRounds.toFixed(2), ok: avgRounds >= 4 && avgRounds <= 6 });

console.log(`\nSimulation de ${battles} batailles IA contre IA\n`);
for (const r of results) {
  console.log(`${r.ok ? '✔' : '✘'} ${r.name} : ${r.value}${r.detail ? `  [${r.detail}]` : ''}`);
}
const failed = results.filter((r) => !r.ok).length;
console.log(failed ? `\n${failed} cible(s) non tenue(s) — ajuster src/data/balance.ts` : '\nToutes les cibles sont tenues.');
process.exitCode = failed ? 1 : 0;
