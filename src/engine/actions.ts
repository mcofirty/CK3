/**
 * Point d'entrée unique du moteur : applyAction(état, action) → nouvel état.
 * L'état reçu n'est jamais modifié : on travaille sur une copie.
 */
import {
  applyClause,
  breakPacts,
  fuseCrowns,
  hasFamilyPact,
  offerProtection,
  proposePact,
  setAgnatic,
  type MarriageClause,
} from './crowns';
import { proposeTrade, type TradeOffer } from './diplomacy/trade';
import { courtGrandees, setSupport } from './influence';
import { autoEducate } from './diplomacy';
import { dropPeaceEvent, negotiatePeace } from './peace';
import { BALANCE } from '../data/balance';
import {
  answerDuel,
  autoResolve,
  createBattle,
  proposeDuel,
  deployPreset,
  moveCompany,
  resolveRound,
  setFrontCommander,
  startBattle,
} from './battle/engine';
import type { FrontId, Preset, SideOrders } from './battle/types';
import type { PeaceTerms } from './state';
import {
  addOpinion,
  ageOf,
  allyKey,
  displayName,
  heldCounties,
  opinion,
  topLiege,
} from './characters';
import { killCharacter } from './characters/lifecycle';
import { offerAmbition } from './court';
import { takeDecision } from './decisions';
import {
  dismissCourtier,
  inviteCandidate,
  poachCourtier,
  rallyPrisoner,
  requestWard,
} from './entourage';
import { repayLoan, setConscription, setTax, setTaxAll, takeLoan, toggleEdict } from './economy';
import { hireMercenaries } from './war/campaignExtras';
import { addMemory } from './relations';
import { addStress, stressFromSpec } from './stress';
import { chronicle, type Ctx, newId, notify } from './context';
import {
  allianceAcceptance,
  renounceAlliance,
  callToArms,
  celebrateMarriage,
  demandTribute,
  makeAlliance,
  marriageAcceptance,
  sendGift,
} from './diplomacy';
import { chooseEvent } from './events/engine';
import { addAgent, startPlot } from './intrigue';
import { takeLegacy, takePerk } from './progression';
import { createTitle, moveCapital, startBuilding, vassalsOf } from './realm';
import { Rng } from './rng';
import type {
  BuildingType,
  CasusBelliType,
  ConscriptionLevel,
  CouncilPost,
  GameState,
  PlotType,
  SkillKey,
  SuccessionLaw,
  TaxLevel,
  UnitType,
} from './state';
import { closeBattle, continueSeason, endSeason, finishGame } from './turn';
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
  | { type: 'moveCapital'; countyId: string }
  | { type: 'setCouncil'; post: CouncilPost; holderId?: string; task: string; targetId?: string }
  | {
      type: 'setEducator';
      childId: string;
      educatorId?: string;
      focus: SkillKey;
      /** Rend la main à l'attribution automatique (meilleur éducateur). */
      auto?: boolean;
    }
  | { type: 'raiseArmy' }
  | { type: 'disbandArmy'; armyId: string }
  | { type: 'moveArmy'; armyId: string; targetCountyId: string }
  | { type: 'setCommander'; armyId: string; slot: 'main' | 0 | 1; commanderId?: string }
  | { type: 'recruit'; unit: UnitType; companies: number }
  | { type: 'dismiss'; unit: UnitType; companies: number }
  | { type: 'loot'; armyId: string }
  | { type: 'assault'; armyId: string }
  | {
      type: 'declareWar';
      targetId: string;
      cb: CasusBelliType;
      countyId?: string;
      claimantId?: string;
    }
  | { type: 'peace'; warId: string; kind: 'exiger' | 'blanche' | 'capituler' }
  | { type: 'negotiatePeace'; terms: PeaceTerms; eventUid?: string }
  | { type: 'ransom'; characterId: string; kind: 'or' | 'comte' | 'liberer' | 'otage' | 'executer' }
  | { type: 'takeDecision'; id: string }
  | { type: 'siegeMode'; armyId: string; mode?: 'blocus' | 'negocier' }
  | { type: 'hireMercenaries'; id: string }
  | { type: 'inviteCandidate'; id: string }
  | { type: 'dismissCourtier'; id: string }
  | { type: 'rallyPrisoner'; id: string }
  | { type: 'requestWard'; childId: string }
  | { type: 'poachCourtier'; id: string }
  | { type: 'setTreasury'; policy: 'prudent' | 'manuel' }
  | { type: 'setTax'; countyId: string; level: TaxLevel }
  | { type: 'setTaxAll'; level: TaxLevel }
  | { type: 'setConscription'; countyId: string; level: ConscriptionLevel }
  | { type: 'toggleEdict'; id: string }
  | { type: 'takeLoan'; amount: number }
  | { type: 'repayLoan'; loanId: string }
  | { type: 'offerAmbition' }
  | { type: 'abandonAmbition' }
  | {
      type: 'proposeMarriage';
      aId: string;
      bId: string;
      clause?: MarriageClause;
      dowry?: number;
    }
  | { type: 'fuseCrowns'; unionId: string }
  | { type: 'setAgnatic'; on: boolean }
  | { type: 'offerProtection'; targetId: string }
  | { type: 'proposePact'; kind: 'famille' | 'succession'; targetId: string; gold?: number }
  | { type: 'breakPacts'; targetId: string }
  | { type: 'breakAlliance'; targetId: string }
  | { type: 'courtGrandees'; rulerId: string }
  | { type: 'supportHeir'; rulerId: string; candidateId?: string }
  | { type: 'proposeAlliance'; targetId: string }
  | { type: 'sendGift'; targetId: string }
  | { type: 'callToArms'; allyId: string; warId: string; gold?: number }
  | { type: 'proposeTrade'; offer: TradeOffer }
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
  | { type: 'battleDuel'; accept: boolean }
  | { type: 'battleChallenge' }
  | { type: 'battleClose' }
  | { type: 'dismissTutorial' }
  | { type: 'takePerk'; characterId: string; perkId: string }
  | { type: 'takeLegacy'; legacyId: string }
  | { type: 'debugGold'; amount: number }
  | { type: 'debugAdvance'; years: number }
  | { type: 'debugBattle' };

export function applyAction(state: GameState, action: Action): GameState {
  const s = structuredClone(state);
  const ctx: Ctx = { state: s, rng: new Rng(s.rng) };
  dispatch(ctx, action);
  // Tout enfant arrivé à la cour (naissance, pupille, événement) reçoit son éducateur.
  autoEducate(s);
  // Une partie peut s'achever hors de la fin de saison (mort pendant un événement, une bataille).
  if (s.gameOver && !s.gameOver.done) finishGame(s);
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
    case 'moveCapital':
      if (moveCapital(state, pl, a.countyId))
        notify(state, `La cour s’installe à ${state.counties[a.countyId].name}.`);
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
        if (a.auto) {
          c.educatorId = undefined;
          c.educationFocus = undefined;
          c.educationManual = false;
        } else {
          c.educatorId = a.educatorId;
          c.educationFocus = a.focus;
          c.educationManual = true;
        }
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
      const w = declareWar(ctx, pl, a.targetId, a.cb, a.countyId, false, a.claimantId);
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
    case 'negotiatePeace': {
      const w = state.wars[a.terms.warId];
      if (!w || (w.attackerId !== pl && w.defenderId !== pl)) break;
      if (negotiatePeace(ctx, pl, a.terms) && a.eventUid) dropPeaceEvent(state, a.eventUid);
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
      } else if (a.kind === 'otage') {
        if (heldCounties(state, c.id).length) break;
        c.hostageHome = topLiege(state, c.id);
        c.hostageOf = pl;
        c.hostageSince = state.turn;
        c.courtId = pl;
        if (c.hostageHome && c.hostageHome !== pl)
          state.truces[allyKey(pl, c.hostageHome)] = Math.max(
            state.truces[allyKey(pl, c.hostageHome)] ?? 0,
            state.turn + BALANCE.hostage.truceSeasons,
          );
        if (state.stats) state.stats.hostages += 1;
        notify(
          state,
          `${c.name} reste à votre cour comme otage : sa famille n’osera plus vous attaquer.`,
        );
      } else if (a.kind === 'executer') {
        const H = BALANCE.hostage;
        addStress(state, me, stressFromSpec(me, H.executeStress).value);
        me.prestige += H.executePrestige;
        for (const v of vassalsOf(state, pl))
          addOpinion(state, v, pl, 'A fait exécuter un prisonnier', H.executeVassalOpinion, 20);
        addMemory(state, c.id, pl, 'mort');
        for (const w of Object.values(state.wars))
          w.captured = w.captured.filter((x) => x !== c.id);
        chronicle(state, `${me.name} fait exécuter ${displayName(state, c)}.`, 'intrigue');
        killCharacter(ctx, c.id, 'exécuté');
        break;
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
      const clause = a.clause ?? 'aucune';
      const dowry = Math.max(0, Math.round(a.dowry ?? 0));
      const acc = marriageAcceptance(state, x, y, clause, dowry);
      if (acc.accept) {
        celebrateMarriage(ctx, x.id, y.id);
        applyClause(state, x, y, clause, dowry);
      } else notify(state, `La demande en mariage pour ${x.name} est refusée.`);
      break;
    }
    case 'fuseCrowns':
      fuseCrowns(state, pl, a.unionId);
      break;
    case 'setAgnatic':
      setAgnatic(state, pl, a.on);
      break;
    case 'offerProtection':
      offerProtection(ctx, pl, a.targetId);
      break;
    case 'proposePact':
      proposePact(ctx, a.kind, pl, a.targetId, Math.max(0, Math.round(a.gold ?? 0)));
      break;
    case 'breakPacts':
      breakPacts(state, pl, a.targetId);
      break;
    case 'courtGrandees':
      courtGrandees(state, pl, a.rulerId);
      break;
    case 'supportHeir':
      setSupport(state, a.rulerId, a.candidateId);
      break;
    case 'breakAlliance':
      // Avec un pacte de famille, rompre l'alliance est un parjure.
      if (hasFamilyPact(state, pl, a.targetId)) breakPacts(state, pl, a.targetId);
      else renounceAlliance(state, pl, a.targetId);
      break;
    case 'proposeAlliance': {
      const acc = allianceAcceptance(state, pl, a.targetId);
      if (acc.accept) makeAlliance(state, pl, a.targetId);
      else notify(state, `${state.characters[a.targetId]?.name} refuse l’alliance.`);
      break;
    }
    case 'sendGift':
      sendGift(ctx, pl, a.targetId);
      break;
    case 'proposeTrade':
      proposeTrade(ctx, pl, a.offer);
      break;
    case 'callToArms':
      callToArms(ctx, pl, a.allyId, a.warId, Math.max(0, Math.round(a.gold ?? 0)));
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
    case 'battleDuel':
      if (inBattle) answerDuel(state.battle!, a.accept, ctx.rng);
      break;
    case 'battleChallenge':
      if (inBattle && state.battle!.phase === 'rounds') proposeDuel(state.battle!, side, ctx.rng);
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
    case 'siegeMode': {
      const army = state.armies[a.armyId];
      if (army?.ownerId === pl && !(a.mode === 'negocier' && army.negotiated === army.location))
        army.siegeMode = a.mode;
      break;
    }
    case 'setTax':
      setTax(state, pl, a.countyId, a.level);
      break;
    case 'setTaxAll':
      setTaxAll(state, pl, a.level);
      break;
    case 'setConscription':
      setConscription(state, pl, a.countyId, a.level);
      break;
    case 'toggleEdict':
      toggleEdict(state, pl, a.id);
      break;
    case 'takeLoan':
      takeLoan(state, pl, a.amount);
      break;
    case 'repayLoan':
      repayLoan(state, pl, a.loanId);
      break;
    case 'inviteCandidate':
      inviteCandidate(ctx, a.id);
      break;
    case 'dismissCourtier':
      if (dismissCourtier(ctx, a.id))
        notify(state, `${state.characters[a.id]?.name} quitte votre cour.`);
      break;
    case 'rallyPrisoner':
      rallyPrisoner(ctx, a.id);
      break;
    case 'requestWard':
      requestWard(ctx, a.childId);
      break;
    case 'poachCourtier':
      poachCourtier(ctx, a.id);
      break;
    case 'setTreasury':
      state.treasury = a.policy;
      break;
    case 'hireMercenaries':
      hireMercenaries(ctx, pl, a.id);
      break;
    case 'takeDecision':
      takeDecision(ctx, a.id);
      break;
    case 'offerAmbition':
      if (state.phase === 'saison') offerAmbition(ctx);
      break;
    case 'abandonAmbition':
      if (me.ambition) {
        me.ambition = undefined;
        me.ambitionOffered = false;
        addStress(state, me, BALANCE.stress.ambitionFail / 2);
        notify(state, 'Vous renoncez à votre ambition.');
      }
      break;
    case 'takePerk': {
      const c = state.characters[a.characterId];
      if (c?.alive && c.dynastyId === state.playerDynastyId) takePerk(state, c, a.perkId);
      break;
    }
    case 'takeLegacy':
      takeLegacy(state, state.playerDynastyId, a.legacyId);
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
