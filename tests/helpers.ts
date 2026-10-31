import { createBattle, startBattle } from '../src/engine/battle/engine';
import type {
  BattleSetup,
  BattleSetupSide,
  BattleState,
  Commander,
  FrontId,
} from '../src/engine/battle/types';
import { Rng } from '../src/engine/rng';
import { applyAction } from '../src/engine/actions';
import type { GameState } from '../src/engine/state';
import type { Terrain, UnitCounts } from '../src/engine/state';
import { emptyUnits } from '../src/engine/units';

/** Générateur constant : aléa médian (R = 1), aucun événement improbable. */
export function fixedRng(value = 0.5): Rng {
  const r = new Rng(1);
  r.next = () => value;
  return r;
}

export function units(u: Partial<UnitCounts>): UnitCounts {
  return { ...emptyUnits(), ...u };
}

export function cmd(
  id: string,
  guerre = 10,
  traits: string[] = [],
  extra: Partial<Commander> = {},
): Commander {
  return { id, name: id, guerre, ruse: 8, traits, isSovereign: false, ...extra };
}

export function side(men: UnitCounts, extra: Partial<BattleSetupSide> = {}): BattleSetupSide {
  return {
    name: extra.name ?? 'X',
    men,
    commanders: [],
    isPlayer: false,
    ai: 'normal',
    friendlyTerritory: false,
    spied: false,
    ...extra,
  };
}

export function battle(
  att: BattleSetupSide,
  def: BattleSetupSide,
  extra: Partial<BattleSetup> = {},
  rng = fixedRng(),
): BattleState {
  return createBattle(
    {
      id: 't',
      countyName: 'Test',
      terrain: 'plaine' as Terrain,
      river: false,
      season: 1,
      attacker: att,
      defender: def,
      ...extra,
    },
    rng,
  );
}

/** Place toutes les troupes d'un camp sur un seul front. */
export function allOn(b: BattleState, key: 'attacker' | 'defender', front: FrontId): void {
  const s = b[key];
  const all = emptyUnits();
  for (const f of ['left', 'center', 'right'] as FrontId[]) {
    for (const k of Object.keys(all) as (keyof UnitCounts)[]) {
      all[k] += s.fronts[f].men[k];
      s.fronts[f].men[k] = 0;
    }
  }
  for (const k of Object.keys(all) as (keyof UnitCounts)[]) {
    all[k] += s.reserve[k];
    s.reserve[k] = 0;
  }
  s.fronts[front].men = all;
}

export function start(b: BattleState): BattleState {
  startBattle(b, fixedRng());
  return b;
}

/** Résout les événements en attente en prenant le premier choix disponible. */
export function clearEvents(s: GameState, refuseOffers = false): GameState {
  for (let guard = 0; s.pendingEvents.length && guard < 20; guard++) {
    const uid = s.pendingEvents[0].uid;
    const first = refuseOffers && s.pendingEvents[0].eventId.startsWith('sys_') ? 1 : 0;
    for (const c of [first, 0, 1, 2, 3])
      if (s.pendingEvents[0]?.uid === uid)
        s = applyAction(s, { type: 'chooseEvent', uid, choice: c });
  }
  return s;
}
