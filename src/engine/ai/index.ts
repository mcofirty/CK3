/** IA des souverains rivaux et des vassaux : scores d'utilité évalués chaque saison (section 10). */
import { BALANCE } from '../../data/balance';
import { BUILDINGS, BUILDING_TYPES } from '../../data/buildings';
import { TRAITS } from '../../data/traits';
import { UNITS } from '../../data/units';
import {
  addOpinion,
  ageOf,
  allied,
  atWar,
  createCharacter,
  displayName,
  hasTrait,
  isAdult,
  livingChildren,
  marry,
  opinion,
  skill,
  warSide,
} from '../characters';
import { heirsOf } from '../characters/lifecycle';
import { notify, worldNews, type Ctx } from '../context';
import {
  allianceAcceptance,
  celebrateMarriage,
  makeAlliance,
  marriageBlock,
  marriageTie,
} from '../diplomacy';
import { queueEvent } from '../events/engine';
import type { EventDef } from '../events/types';
import { aiPlots } from '../intrigue';
import { aiLandOffer } from '../diplomacy/trade';
import {
  availableLevies,
  canBuild,
  capitalOf,
  countyRuler,
  economyOf,
  independentRulers,
  realmCounties,
  recruitCapacity,
  startBuilding,
  vassalsOf,
} from '../realm';
import type { Character, County, GameState, UnitType, War } from '../state';
import { armyUpkeep, totalMen } from '../units';
import { isCapital } from '../economy/local';
import {
  armyOf,
  canDeclareWar,
  capitalFallen,
  declareWar,
  disbandArmy,
  endWar,
  findPath,
  isFriendlyCounty,
  isHostileCounty,
  joinWar,
  militaryStrength,
  raiseArmy,
  recruit,
  scoreFor,
  sideStrength,
  truceWith,
  warsOf,
} from '../war';

const A = BALANCE.ai;

export function aggression(c: Character): number {
  let a = 0;
  for (const t of c.traits) a += TRAITS[t]?.aggression ?? 0;
  return a;
}

/** Saison complète de l'IA pour tous les souverains et vassaux non joueurs. */
export function runAi(ctx: Ctx): void {
  const { state, rng } = ctx;
  for (const id of rng.shuffle(independentRulers(state))) {
    if (id === state.playerId && !state.autoplay) continue;
    const r = state.characters[id];
    if (!r?.alive) continue;
    aiRuler(ctx, r);
  }
  aiVassals(ctx);
  aiRevoltingVassals(ctx);
}

function goldReserve(state: GameState, id: string): number {
  const eco = economyOf(state, id);
  const upkeep = -eco.gold.filter((l) => l.value < 0).reduce((s, l) => s + l.value, 0);
  return Math.max(30, upkeep * A.goldReserveSeasons);
}

function aiRuler(ctx: Ctx, r: Character): void {
  const { state, rng } = ctx;
  const wars = warsOf(state, r.id);
  // 1. Menaces : guerres en cours.
  if (wars.length) {
    manageWar(ctx, r, wars);
  } else {
    const army = armyOf(state, r.id);
    if (army && A.disbandWhenPeace) disbandArmy(ctx, army.id);
  }
  // Marchandage de terres avec le joueur (rare).
  if (!wars.length && r.id !== state.playerId) {
    const o = aiLandOffer(ctx, r.id);
    if (o) {
      const c = state.counties[o.countyId];
      const buying = o.buyer === r.id;
      proposeToPlayer(
        ctx,
        {
          id: `sys_cession_${o.countyId}`,
          titre: buying ? 'Une offre pour vos terres' : 'Des terres à vendre',
          texte: buying
            ? `${displayName(state, r)} convoite ${c.name}, à sa frontière, et vous en offre ${o.price} or.`
            : `${displayName(state, r)}, à court d’argent, vous propose ${c.name}, à votre frontière, pour ${o.price} or.`,
          choix: [
            {
              libelle: buying
                ? `Vendre ${c.name} pour ${o.price} or`
                : `Acheter ${c.name} pour ${o.price} or`,
              effets: [
                { cession: { comte: c.id, vendeur: o.seller, acheteur: o.buyer, prix: o.price } },
              ],
            },
            { libelle: 'Décliner', effets: [] },
          ],
        },
        { proposant: r.id, comte: c.id },
      );
    }
  }
  // 2. Une action majeure au plus.
  const reserve = goldReserve(state, r.id);
  const options: { score: number; run: () => void }[] = [];
  const agg = aggression(r);
  // Guerre.
  if (!wars.length) {
    const target = pickWarTarget(state, r);
    if (target) {
      options.push({
        score: (A.warBaseChance + agg * 0.15) * (target.ratio / BALANCE.war.forceRatioToDeclare),
        run: () => {
          const w = declareWar(ctx, r.id, target.defender, target.cb, target.county);
          if (w) callAllies(ctx, w);
        },
      });
    }
  }
  // Mariage des héritiers.
  options.push({ score: A.marriageChance * (agg < 0 ? 1.5 : 1), run: () => aiMarriage(ctx, r) });
  // Alliance.
  options.push({ score: A.allianceChance * (agg < 0 ? 1.5 : 1), run: () => aiAlliance(ctx, r) });
  // Complot.
  options.push({ score: A.plotChance * (1 + agg), run: () => aiPlots(ctx, r.id) });
  // Construction.
  if (r.gold > reserve + 60) options.push({ score: A.buildChance, run: () => aiBuild(ctx, r) });
  // Recrutement.
  if (r.gold > reserve + 120)
    options.push({ score: wars.length ? 0.5 : 0.12, run: () => aiRecruit(ctx, r) });
  const roll = rng.next();
  let acc = 0;
  const total = options.reduce((s, o) => s + Math.max(0, o.score), 0);
  const scale = total > 1 ? 1 / total : 1;
  for (const o of options) {
    acc += Math.max(0, o.score) * scale;
    if (roll < acc) {
      o.run();
      break;
    }
  }
  // Revendications fabriquées par le chancelier de l'IA.
  if (rng.chance(0.03 + skill(r, 'diplomatie') * 0.002)) {
    const mine = new Set(realmCounties(state, r.id).map((c) => c.id));
    const border = Object.values(state.counties).filter(
      (c) => !mine.has(c.id) && c.adjacent.some((n) => mine.has(n)) && !r.claims.includes(c.id),
    );
    if (border.length) r.claims.push(rng.pick(border).id);
  }
  // Toujours garder un héritier : le souverain se marie.
  ensureSpouse(ctx, r);
}

/** Cible de guerre : revendication (ou conquête) avec un rapport de force suffisant. */
function pickWarTarget(
  state: GameState,
  r: Character,
):
  | { defender: string; cb: 'revendication' | 'conquete'; county: string; ratio: number }
  | undefined {
  const myAllies = state.alliances
    .filter((k) => k.split('|').includes(r.id))
    .map((k) => k.split('|').find((x) => x !== r.id)!);
  const myStr = sideStrength(state, [r.id, ...myAllies]);
  let best:
    | { defender: string; cb: 'revendication' | 'conquete'; county: string; ratio: number }
    | undefined;
  const tryTarget = (county: County, cb: 'revendication' | 'conquete') => {
    const def = countyRuler(state, county);
    if (def === r.id) return;
    if (!canDeclareWar(state, r.id, def, cb, county.id).ok) return;
    const defAllies = state.alliances
      .filter((k) => k.split('|').includes(def))
      .map((k) => k.split('|').find((x) => x !== def)!);
    const ratio = myStr / Math.max(1, sideStrength(state, [def, ...defAllies]));
    const need = BALANCE.war.forceRatioToDeclare * (1 - aggression(r) * 0.2);
    if (ratio >= need && (!best || ratio > best.ratio))
      best = { defender: def, cb, county: county.id, ratio };
  };
  for (const cid of r.claims) {
    const c = state.counties[cid];
    if (c) tryTarget(c, 'revendication');
  }
  if (
    !best &&
    (hasTrait(r, 'ambitieux') || Object.values(state.kingdoms).some((k) => k.holderId === r.id))
  ) {
    const mine = new Set(realmCounties(state, r.id).map((c) => c.id));
    for (const c of Object.values(state.counties)) {
      if (!mine.has(c.id) && c.adjacent.some((n) => mine.has(n))) tryTarget(c, 'conquete');
    }
  }
  return best;
}

/** Appelle les alliés du défenseur et de l'attaquant. */
export function callAllies(ctx: Ctx, w: War): void {
  const { state } = ctx;
  for (const side of ['attacker', 'defender'] as const) {
    const leader = side === 'attacker' ? w.attackerId : w.defenderId;
    const enemy = side === 'attacker' ? w.defenderId : w.attackerId;
    const allies = state.alliances
      .filter((k) => k.split('|').includes(leader))
      .map((k) => k.split('|').find((x) => x !== leader)!);
    for (const ally of allies) {
      if (warSide(state, w.id, ally) || allied(state, ally, enemy)) continue;
      if (ally === state.playerId) {
        proposeToPlayer(
          ctx,
          {
            id: `sys_appel_${w.id}`,
            titre: 'Appel aux armes',
            texte: `${state.characters[leader].name}, votre allié, est en guerre contre ${state.characters[enemy].name} (« ${w.name} ») et vous appelle à ses côtés.`,
            choix: [
              {
                libelle: 'Honorer l’alliance',
                effets: [
                  {
                    rejoindre_guerre: {
                      warId: w.id,
                      allie: leader,
                      camp: side === 'attacker' ? 'attaquant' : 'defenseur',
                    },
                  },
                  { prestige: 10 },
                ],
              },
              { libelle: 'Refuser', effets: [{ prestige: -30 }] },
            ],
          },
          { allie: leader, ennemi: enemy },
        );
        continue;
      }
      if (truceWith(state, ally, enemy)) continue;
      if (opinion(state, ally, leader) >= -10) joinWar(state, w.id, ally, side);
    }
  }
}

/** Proposition de l'IA au joueur ; `scope` nomme les personnes concernées (fiches affichables). */
function proposeToPlayer(
  ctx: Ctx,
  def: Omit<EventDef, 'declencheur'>,
  scope: Record<string, string> = {},
): void {
  const full: EventDef = { categorie: 'systeme', declencheur: { type: 'suite' }, poids: 0, ...def };
  if (ctx.state.pendingEvents.some((e) => e.eventId === full.id)) return;
  queueEvent(ctx, full, { souverain: ctx.state.playerId, ...scope }, true);
}

// --- Guerre ---

function manageWar(ctx: Ctx, r: Character, wars: War[]): void {
  const { state, rng } = ctx;
  // Paix ?
  for (const w of wars) {
    const leader = w.attackerId === r.id || w.defenderId === r.id;
    if (!leader) continue;
    const my = scoreFor(state, w, r.id);
    const enemy = w.attackerId === r.id ? w.defenderId : w.attackerId;
    const age = state.turn - w.startTurn;
    // Capitale tombée et guerre mal engagée : la cour capitule.
    if (capitalFallen(state, w, r.id) && my <= BALANCE.capital.capitulateScore) {
      const text = `${displayName(state, r)} capitule : sa capitale est aux mains de l’ennemi.`;
      if (enemy === state.playerId) notify(state, text);
      else worldNews(state, text, 'paix', r.id);
      endWar(ctx, w.id, w.attackerId === r.id ? 'defenseur' : 'attaquant');
      continue;
    }
    const enemyFallen = capitalFallen(state, w, enemy);
    const demand = enemyFallen ? BALANCE.capital.demandScore : BALANCE.war.peaceThreshold;
    if (my >= 100 || (my >= demand && enemy !== state.playerId)) {
      endWar(ctx, w.id, w.attackerId === r.id ? 'attaquant' : 'defenseur');
      continue;
    }
    if (my >= demand && enemy === state.playerId) {
      proposeToPlayer(
        ctx,
        {
          id: `sys_exige_${w.id}`,
          titre: 'Exigences de l’ennemi',
          texte: `${r.name} juge la guerre « ${w.name} » gagnée (score ${Math.round(my)})${enemyFallen ? ', votre capitale étant entre ses mains,' : ''} et exige votre reddition. Refuser, c’est continuer à se battre : à 100, la paix vous sera imposée.`,
          choix: [
            {
              libelle: 'Accepter ses conditions',
              effets: [
                { paix: { warId: w.id, issue: w.attackerId === r.id ? 'attaquant' : 'defenseur' } },
              ],
            },
            { libelle: 'Refuser et combattre', effets: [{ prestige: 5 }] },
          ],
        },
        { ennemi: r.id },
      );
      continue;
    }
    if (my <= BALANCE.war.whitePeaceAi && age >= BALANCE.war.minWarSeasons) {
      if (enemy === state.playerId) {
        proposeToPlayer(
          ctx,
          {
            id: `sys_blanche_${w.id}`,
            titre: 'Une offre de paix',
            texte: `${r.name}, en mauvaise posture dans la guerre « ${w.name} », propose une paix blanche.`,
            choix: [
              {
                libelle: 'Accepter la paix blanche',
                effets: [{ paix: { warId: w.id, issue: 'blanche' } }],
              },
              { libelle: 'Refuser : poursuivre la guerre', effets: [] },
            ],
          },
          { ennemi: r.id },
        );
      } else if (scoreFor(state, w, enemy) < BALANCE.war.peaceThreshold && rng.chance(0.5)) {
        endWar(ctx, w.id, 'blanche');
      }
      continue;
    }
    // Guerres interminables.
    if (age > 40 && Math.abs(my) < 30 && enemy !== state.playerId) endWar(ctx, w.id, 'blanche');
  }
  if (!warsOf(state, r.id).length) return;
  // Armée.
  let army = armyOf(state, r.id);
  if (!army) army = raiseArmy(ctx, r.id);
  if (!army) return;
  const w = warsOf(state, r.id)[0];
  const enemies = [w.attackerId, ...w.attackerAllies].includes(r.id)
    ? [w.defenderId, ...w.defenderAllies]
    : [w.attackerId, ...w.attackerAllies];
  const myStr = totalMen(army.men);
  const enemyArmies = Object.values(state.armies).filter((a) => enemies.includes(a.ownerId));
  // Armée ennemie proche et plus faible : l'attaquer. Plus forte : se replier.
  const near = enemyArmies
    .map((a) => ({ a, d: findPath(state, r.id, army!.location, a.location).length }))
    .filter((x) => x.d > 0 || x.a.location === army!.location)
    .sort((x, y) => x.d - y.d)[0];
  if (near && near.d <= 3) {
    const ratio = myStr / Math.max(1, totalMen(near.a.men));
    if (ratio >= 1.1) {
      setPath(state, army.id, near.a.location);
      return;
    }
    if (ratio < 0.75) {
      const home = capitalOf(state, r.id);
      if (home && army.location !== home.id) setPath(state, army.id, home.id);
      return;
    }
  }
  // Libérer ses terres occupées, sinon assiéger l'objectif ou le comté ennemi le plus proche.
  const mineOccupied = realmCounties(state, r.id).filter((c) => c.occupation);
  const targets: County[] = mineOccupied.length
    ? mineOccupied
    : Object.values(state.counties).filter(
        (c) =>
          isHostileCounty(state, r.id, c) &&
          enemies.includes(countyRuler(state, c)) &&
          !(c.occupation && isFriendlyCounty(state, r.id, c)),
      );
  const objective = w.targetCountyId ? state.counties[w.targetCountyId] : undefined;
  const cur = state.counties[army.location];
  if (
    isHostileCounty(state, r.id, cur) &&
    !(cur.occupation && isFriendlyCounty(state, r.id, cur))
  ) {
    army.path = [];
    if (army.supply < 15 && cur.lootedTurn === undefined) army.supply += 0; // reste sur place
    return;
  }
  const ranked = targets
    .map((c) => ({
      c,
      d:
        findPath(state, r.id, army!.location, c.id).length +
        (c === objective ? -2 : 0) +
        (isCapital(c) && enemies.includes(c.holderId) ? -2 : 0),
    }))
    .filter((x) => x.d > -2)
    .sort((x, y) => x.d - y.d);
  if (ranked[0]) setPath(state, army.id, ranked[0].c.id);
}

function setPath(state: GameState, armyId: string, target: string): void {
  const a = state.armies[armyId];
  a.path = findPath(state, a.ownerId, a.location, target);
}

// --- Diplomatie de l'IA ---

function aiMarriage(ctx: Ctx, r: Character): void {
  const { state, rng } = ctx;
  const singles = [r, ...livingChildren(state, r)].filter(
    (c) => !c.spouseId && isAdult(state, c) && ageOf(state, c) < 45,
  );
  if (!singles.length) return;
  const me = singles[0];
  const pool = Object.values(state.characters).filter(
    (c) => !marriageBlock(state, me, c) && c.dynastyId !== me.dynastyId && ageOf(state, c) < 40,
  );
  if (!pool.length) return;
  const target = rng.pick(pool);
  const theirCourt = target.courtId;
  const theirRuler = state.characters[theirCourt]?.liegeId ?? theirCourt;
  if (theirRuler === state.playerId) {
    proposeToPlayer(
      ctx,
      {
        id: `sys_mariage_${me.id}_${target.id}`,
        titre: 'Une demande en mariage',
        texte: `${r.name} propose d’unir ${me.id === r.id ? 'sa personne' : me.name} à ${target.name}, de votre maison. Une telle union rapprocherait vos deux cours.`,
        choix: [
          { libelle: 'Accepter l’union', effets: [{ mariage: { a: me.id, b: target.id } }] },
          { libelle: 'Refuser poliment', effets: [] },
        ],
      },
      { proposant: r.id, pretendant: me.id, promis: target.id },
    );
    return;
  }
  if (opinion(state, theirRuler, r.id) >= -20) celebrateMarriage(ctx, me.id, target.id);
}

function aiAlliance(ctx: Ctx, r: Character): void {
  const { state, rng } = ctx;
  const others = independentRulers(state).filter(
    (x) => x !== r.id && !allied(state, r.id, x) && marriageTie(state, r.id, x),
  );
  if (!others.length) return;
  const t = rng.pick(others);
  if (t === state.playerId) {
    proposeToPlayer(
      ctx,
      {
        id: `sys_alliance_${r.id}`,
        titre: 'Une proposition d’alliance',
        texte: `${r.name}, lié à votre maison par le mariage, propose une alliance : chacun viendrait au secours de l’autre en cas de guerre.`,
        choix: [
          { libelle: 'Sceller l’alliance', effets: [{ alliance: r.id }] },
          { libelle: 'Décliner', effets: [] },
        ],
      },
      { proposant: r.id },
    );
    return;
  }
  if (allianceAcceptance(state, r.id, t).accept) makeAlliance(state, r.id, t);
}

/** Un souverain IA sans conjoint ni héritier se marie (au besoin à une personne de petite noblesse). */
function ensureSpouse(ctx: Ctx, r: Character): void {
  const { state, rng } = ctx;
  if (r.spouseId || !isAdult(state, r) || ageOf(state, r) > 50) return;
  if (heirsOf(state, r).length > 1 && !rng.chance(0.1)) return;
  if (!rng.chance(0.25)) return;
  const spouse = createCharacter(ctx, {
    age: Math.max(16, ageOf(state, r) - rng.int(0, 8)),
    female: !r.female,
    dynastyId: null,
    courtId: r.id,
    skillBase: 5,
  });
  marry(state, r, spouse);
}

// --- Économie de l'IA ---

function aiBuild(ctx: Ctx, r: Character): void {
  const { state, rng } = ctx;
  const own = Object.values(state.counties).filter((c) => c.holderId === r.id && !c.construction);
  if (!own.length) return;
  const c = rng.pick(own);
  const options = BUILDING_TYPES.filter((t) => canBuild(state, r.id, c.id, t).ok);
  if (!options.length) return;
  const t = rng.weighted(options, (b) =>
    b === 'marche' ? 3 : b === 'ferme' ? 2 : BUILDINGS[b].unlocks ? 1.5 : 1,
  );
  if (t) startBuilding(ctx, r.id, c.id, t);
}

function aiRecruit(ctx: Ctx, r: Character): void {
  const { state, rng } = ctx;
  const cap = recruitCapacity(state, r.id);
  const units = [...cap.unlocked] as UnitType[];
  if (!units.length) return;
  const u = rng.pick(units);
  const income = economyOf(state, r.id).goldNet;
  if (income - UNITS[u].upkeep < 2) return;
  recruit(ctx, r.id, u, 1);
}

// --- Vassaux : opinion, factions, révoltes ---

function aiVassals(ctx: Ctx): void {
  const { state, rng } = ctx;
  for (const liege of independentRulers(state)) {
    const vassals = vassalsOf(state, liege);
    for (const v of vassals) {
      const c = state.characters[v];
      const op = opinion(state, v, liege);
      if (op < BALANCE.opinion.factionThreshold && !atWar(state, v, liege)) {
        if (!c.inFaction) {
          c.inFaction = true;
          if (liege === state.playerId) notify(state, `${c.name} rejoint une faction contre vous.`);
        }
      } else if (op > BALANCE.opinion.factionThreshold + 15 && c.inFaction) c.inFaction = false;
    }
    const faction = vassals.filter((v) => state.characters[v].inFaction && !atWar(state, v, liege));
    if (!faction.length) continue;
    const fStr = faction.reduce((s, v) => s + factionStrength(state, v), 0);
    const lStr = militaryStrength(state, liege) - fStr;
    if (fStr > lStr * A.revoltFactionRatio && rng.chance(0.5)) {
      const leader = faction.sort(
        (a, b) => factionStrength(state, b) - factionStrength(state, a),
      )[0];
      const w = declareWar(ctx, leader, liege, 'independance', undefined, true);
      if (w) {
        for (const v of faction) if (v !== leader) joinWar(state, w.id, v, 'attacker');
        if (liege === state.playerId)
          notify(
            state,
            `Révolte ! ${state.characters[leader].name} et sa faction prennent les armes.`,
          );
        else
          worldNews(
            state,
            `Révolte chez ${state.characters[liege].name} : ${state.characters[leader].name} et ${faction.length - 1 ? `${faction.length - 1} autre${faction.length > 2 ? 's' : ''} vassa${faction.length > 2 ? 'ux' : 'l'}` : 'ses fidèles'} réclament leur indépendance.`,
            'revolte',
            liege,
          );
      }
    }
  }
}

function factionStrength(state: GameState, id: string): number {
  return (
    (Object.values(state.counties)
      .filter((c) => c.holderId === id)
      .reduce((s, c) => s + c.levyPool, 0) /
      100) *
    4
  );
}

/** Les vassaux en révolte lèvent leurs propres armées. */
function aiRevoltingVassals(ctx: Ctx): void {
  const { state } = ctx;
  for (const w of Object.values(state.wars)) {
    if (w.cb !== 'independance') continue;
    for (const id of [w.attackerId, ...w.attackerAllies]) {
      const c = state.characters[id];
      if (!c?.alive || id === state.playerId) continue;
      if (!c.liegeId) continue; // déjà traité comme souverain
      manageWar(ctx, c, [w]);
    }
  }
}

// Utilitaire pour le joueur et l'IA.
export function revoltLevies(state: GameState, id: string): number {
  return availableLevies(state, id).total;
}

export { addOpinion, armyUpkeep };
