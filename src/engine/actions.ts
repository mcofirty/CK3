/**
 * Point d'entrée unique du moteur : applyAction(état, action) → nouvel état.
 * L'état reçu n'est jamais modifié : on travaille sur une copie.
 */
import { BALANCE } from '../data/balance';
import {
  autoResolve,
  createBattle,
  deployPreset,
  moveCompany,
  resolveRound,
  setFrontCommander,
  startBattle,
} from './battle/engine';
import type { FrontId, Preset, SideOrders } from './battle/types';
import { ageOf, opinion } from './characters';
import { type Ctx, newId, notify } from './context';
import {
  allianceAcceptance,
  callToArms,
  celebrateMarriage,
  demandTribute,
  makeAlliance,
  marriageAcceptance,
  sendGift,
} from './diplomacy';
import { chooseEvent } from './events/engine';
import { addAgent, startPlot } from './intrigue';
import { createTitle, startBuilding, vassalsOf } from './realm';
import { Rng } from './rng';
import type {
  BuildingType,
  CasusBelliType,
  CouncilPost,
  GameState,
  PlotType,
  SkillKey,
  SuccessionLaw,
  UnitType,
} from './state';
import { closeBattle, continueSeason, endSeason } from './turn';
import { callAllies } from './ai';
import {
  declareWar,
  disbandArmy,
  dismissCompanies,
  endWar,
  loot,
  peaceAcceptance,
  raiseArmy,
  recruit,
  setArmyTarget,
  transferCounty,
} from './war';

export type Action =
  | { type: 'endSeason' }
  | { type: 'chooseEvent'; uid: string; choice: number }
  | { type: 'build'; countyId: string; building: BuildingType }
  | { type: 'setCouncil'; post: CouncilPost; holderId?: string; task: string; targetId?: string }
  | { type: 'setEducator'; childId: string; educatorId?: string; focus: SkillKey }
  | { type: 'raiseArmy' }
  | { type: 'disbandArmy'; armyId: string }
  | { type: 'moveArmy'; armyId: string; targetCountyId: string }
  | { type: 'setCommander'; armyId: string; slot: 'main' | 0 | 1; commanderId?: string }
  | { type: 'recruit'; unit: UnitType; companies: number }
  | { type: 'dismiss'; unit: UnitType; companies: number }
  | { type: 'loot'; armyId: string }
  | { type: 'assault'; armyId: string }
  | { type: 'declareWar'; targetId: string; cb: CasusBelliType; countyId?: string }
  | { type: 'peace'; warId: string; kind: 'exiger' | 'blanche' | 'capituler' }
  | { type: 'ransom'; characterId: string; kind: 'or' | 'comte' | 'liberer' }
  | { type: 'proposeMarriage'; aId: string; bId: string }
  | { type: 'proposeAlliance'; targetId: string }
  | { type: 'sendGift'; targetId: string }
  | { type: 'callToArms'; allyId: string; warId: string }
  | { type: 'demandTribute'; targetId: string }
  | { type: 'startPlot'; plotType: PlotType; targetId: string }
  | { type: 'addAgent'; plotId: string }
  | { type: 'abandonPlot'; plotId: string }
  | { type: 'createTitle'; titleId: string }
  | { type: 'changeLaw'; law: SuccessionLaw }
  | { type: 'grantCounty'; countyId: string; characterId: string }
  | { type: 'battleDeploy'; preset: Preset }
  | { type: 'battleMove'; unit: UnitType; from: FrontId | 'reserve'; to: FrontId | 'reserve' }
  | { type: 'battleCommander'; front: FrontId; commanderId?: string }
  | { type: 'battleStart' }
  | { type: 'battleRound'; orders: SideOrders }
  | { type: 'battleAuto' }
  | { type: 'battleClose' }
  | { type: 'dismissTutorial' }
  | { type: 'debugGold'; amount: number }
  | { type: 'debugAdvance'; years: number }
  | { type: 'debugBattle' };

export function applyAction(state: GameState, action: Action): GameState {
  const s = structuredClone(state);
  const ctx: Ctx = { state: s, rng: new Rng(s.rng) };
  dispatch(ctx, action);
  s.rng = ctx.rng.s;
  return s;
}

function dispatch(ctx: Ctx, a: Action): void {
  const { state } = ctx;
  const pl = state.playerId;
  const me = state.characters[pl];
  const inBattle = state.phase === 'bataille' && state.battle;
  const side = state.battle?.playerSide ?? 'attacker';
  switch (a.type) {
    case 'endSeason':
      endSeason(ctx);
      break;
    case 'chooseEvent':
      chooseEvent(ctx, a.uid, a.choice);
      break;
    case 'build':
      startBuilding(ctx, pl, a.countyId, a.building);
      break;
    case 'setCouncil': {
      const seat = state.council[a.post];
      // Un même personnage ne siège qu'à un poste.
      if (a.holderId)
        for (const s of Object.values(state.council))
          if (s.holderId === a.holderId) s.holderId = undefined;
      seat.holderId = a.holderId;
      seat.task = a.task;
      seat.targetId = a.targetId;
      break;
    }
    case 'setEducator': {
      const c = state.characters[a.childId];
      if (c && ageOf(state, c) < BALANCE.characters.adulthood) {
        c.educatorId = a.educatorId;
        c.educationFocus = a.focus;
      }
      break;
    }
    case 'raiseArmy':
      raiseArmy(ctx, pl);
      break;
    case 'disbandArmy':
      if (state.armies[a.armyId]?.ownerId === pl) disbandArmy(ctx, a.armyId);
      break;
    case 'moveArmy':
      if (state.armies[a.armyId]?.ownerId === pl) setArmyTarget(ctx, a.armyId, a.targetCountyId);
      break;
    case 'setCommander': {
      const army = state.armies[a.armyId];
      if (!army || army.ownerId !== pl) break;
      const ids = [army.commanderId, ...army.frontCommanders].filter((x) => x !== a.commanderId);
      if (a.slot === 'main') army.commanderId = a.commanderId;
      else {
        const fc = [...army.frontCommanders];
        fc[a.slot] = a.commanderId ?? '';
        army.frontCommanders = fc.filter(Boolean);
      }
      if (a.commanderId) {
        if (a.slot !== 'main' && army.commanderId === a.commanderId) army.commanderId = ids[0];
        if (a.slot === 'main')
          army.frontCommanders = army.frontCommanders.filter((x) => x !== a.commanderId);
      }
      break;
    }
    case 'recruit':
      recruit(ctx, pl, a.unit, a.companies);
      break;
    case 'dismiss':
      dismissCompanies(ctx, pl, a.unit, a.companies);
      break;
    case 'loot':
      if (state.armies[a.armyId]?.ownerId === pl) loot(ctx, a.armyId);
      break;
    case 'assault':
      if (state.armies[a.armyId]?.ownerId === pl) state.armies[a.armyId].assault = true;
      break;
    case 'declareWar': {
      const w = declareWar(ctx, pl, a.targetId, a.cb, a.countyId);
      if (w) callAllies(ctx, w);
      break;
    }
    case 'peace': {
      const w = state.wars[a.warId];
      if (!w) break;
      const acc = peaceAcceptance(state, a.warId, pl, a.kind);
      const iAmAttacker = w.attackerId === pl;
      if (!acc.accept) {
        notify(state, 'L’ennemi rejette votre proposition de paix.');
        break;
      }
      if (a.kind === 'exiger') endWar(ctx, a.warId, iAmAttacker ? 'attaquant' : 'defenseur');
      else if (a.kind === 'capituler')
        endWar(ctx, a.warId, iAmAttacker ? 'defenseur' : 'attaquant');
      else endWar(ctx, a.warId, 'blanche');
      break;
    }
    case 'ransom': {
      const c = state.characters[a.characterId];
      if (!c || c.imprisonedBy !== pl) break;
      const payer = state.characters[c.liegeId ?? c.courtId] ?? c;
      if (a.kind === 'or') {
        const amount = Math.min(payer.gold > 0 ? payer.gold : 0, BALANCE.war.ransomGold);
        payer.gold -= amount;
        me.gold += amount;
        notify(state, `${c.name} est libéré contre ${Math.round(amount)} or.`);
      } else if (a.kind === 'comte') {
        const theirs = Object.values(state.counties).filter((k) => k.holderId === c.id);
        if (!theirs.length) break;
        const pick = theirs.sort((x, y) => x.development - y.development)[0];
        transferCounty(state, pick.id, pl);
        notify(state, `${c.name} vous cède ${pick.name} pour sa liberté.`);
      } else {
        notify(state, `${c.name} est libéré.`);
      }
      c.imprisonedBy = undefined;
      for (const w of Object.values(state.wars)) w.captured = w.captured.filter((x) => x !== c.id);
      break;
    }
    case 'proposeMarriage': {
      const x = state.characters[a.aId];
      const y = state.characters[a.bId];
      if (!x || !y) break;
      const acc = marriageAcceptance(state, x, y);
      if (acc.accept) celebrateMarriage(ctx, x.id, y.id);
      else notify(state, `La demande en mariage pour ${x.name} est refusée.`);
      break;
    }
    case 'proposeAlliance': {
      const acc = allianceAcceptance(state, pl, a.targetId);
      if (acc.accept) makeAlliance(state, pl, a.targetId);
      else notify(state, `${state.characters[a.targetId]?.name} refuse l’alliance.`);
      break;
    }
    case 'sendGift':
      sendGift(ctx, pl, a.targetId);
      break;
    case 'callToArms':
      callToArms(ctx, pl, a.allyId, a.warId);
      break;
    case 'demandTribute':
      demandTribute(ctx, pl, a.targetId);
      break;
    case 'startPlot':
      startPlot(ctx, pl, a.plotType, a.targetId);
      break;
    case 'addAgent':
      addAgent(ctx, a.plotId);
      break;
    case 'abandonPlot':
      if (state.plots[a.plotId]?.ownerId === pl) delete state.plots[a.plotId];
      break;
    case 'createTitle':
      createTitle(ctx, pl, a.titleId);
      break;
    case 'changeLaw':
      if (
        a.law === 'primogeniture' &&
        me.successionLaw !== 'primogeniture' &&
        me.prestige >= BALANCE.characters.primogenitureCost
      ) {
        me.prestige -= BALANCE.characters.primogenitureCost;
        me.successionLaw = 'primogeniture';
        for (const v of vassalsOf(state, pl))
          if (opinion(state, v, pl) < 0)
            notify(state, `${state.characters[v].name} désapprouve la nouvelle loi.`);
      } else if (a.law === 'partage') me.successionLaw = 'partage';
      break;
    case 'grantCounty': {
      const c = state.counties[a.countyId];
      const v = state.characters[a.characterId];
      if (!c || c.holderId !== pl || !v?.alive || v.id === pl) break;
      if (Object.values(state.counties).filter((k) => k.holderId === pl).length <= 1) break;
      c.holderId = v.id;
      v.liegeId = pl;
      v.courtId = v.id;
      if (!v.opinions[pl]) v.opinions[pl] = [];
      v.opinions[pl].push({ reason: 'Terre accordée', value: 30, expires: state.turn + 40 });
      notify(state, `${v.name} reçoit ${c.name} et devient votre vassal.`);
      break;
    }
    // --- Bataille ---
    case 'battleDeploy':
      if (inBattle) deployPreset(state.battle!, side, a.preset);
      break;
    case 'battleMove':
      if (inBattle) moveCompany(state.battle!, side, a.unit, a.from, a.to);
      break;
    case 'battleCommander':
      if (inBattle) setFrontCommander(state.battle!, side, a.front, a.commanderId);
      break;
    case 'battleStart':
      if (inBattle) startBattle(state.battle!, ctx.rng);
      break;
    case 'battleRound':
      if (inBattle && state.battle!.phase !== 'fin')
        resolveRound(state.battle!, ctx.rng, { playerOrders: a.orders });
      break;
    case 'battleAuto':
      if (inBattle && state.battle!.phase !== 'fin') autoResolve(state.battle!, ctx.rng);
      break;
    case 'battleClose':
      closeBattle(ctx);
      break;
    case 'dismissTutorial':
      state.tutorialSeen = true;
      break;
    // --- Débogage ---
    case 'debugGold':
      me.gold += a.amount;
      me.prestige += a.amount;
      break;
    case 'debugAdvance': {
      const target = state.turn + a.years * 4;
      let guard = 0;
      while (state.turn < target && !state.gameOver && guard++ < a.years * 8) {
        // Les événements en attente prennent leur premier choix ; les batailles se résolvent seules.
        while (state.pendingEvents.length) {
          const e = state.pendingEvents[0];
          if (!chooseEvent(ctx, e.uid, 0)) state.pendingEvents.shift();
        }
        if (state.phase === 'bataille' && state.battle) {
          autoResolve(state.battle, ctx.rng);
          closeBattle(ctx);
          continue;
        }
        endSeason(ctx);
        if (state.phase === 'bataille' && state.battle) {
          autoResolve(state.battle, ctx.rng);
          closeBattle(ctx);
        }
      }
      void continueSeason;
      break;
    }
    case 'debugBattle': {
      const mk = (n: number) => ({
        levees: n * 6,
        piquiers: n * 2,
        archers: n * 2,
        infanterie: n,
        cavalerie: n,
      });
      const cmd = (id: string, name: string, guerre: number) => ({
        id,
        name,
        guerre,
        ruse: 10,
        traits: [] as string[],
        isSovereign: false,
      });
      state.battle = createBattle(
        {
          id: `debug${newId(state, '')}`,
          countyName: 'Champ d’essai',
          terrain: ctx.rng.pick(['plaine', 'colline', 'foret', 'marais', 'montagne'] as const),
          river: ctx.rng.chance(0.3),
          season: (state.turn % 4) as 0 | 1 | 2 | 3,
          attacker: {
            name: 'Vos troupes',
            men: mk(100),
            commanders: [cmd(pl, me.name, 12)],
            mainCommanderId: pl,
            isPlayer: true,
            ai: 'normal',
            friendlyTerritory: false,
            spied: false,
          },
          defender: {
            name: 'L’ennemi',
            men: mk(110),
            commanders: [cmd('debug-enemy', 'Capitaine ennemi', 10)],
            isPlayer: false,
            ai: state.difficulty,
            friendlyTerritory: true,
            spied: false,
          },
        },
        ctx.rng,
      );
      state.phase = 'bataille';
      break;
    }
  }
}
