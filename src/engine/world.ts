/** Création d'une nouvelle partie : carte générée, origine et aléas propres à chaque graine. */
import { BALANCE } from '../data/balance';
import MAP from '../data/map.json';
import { ORIGINS, type Origin } from '../data/origins';
import { addOpinion, addTrait, allyKey, createCharacter, dynastyName, marry } from './characters';
import { emptyStats, recordRuler, type Ctx } from './context';
import { offerAmbition } from './court';
import { ALL_EVENTS } from '../data/events';
import { autoFillCouncil } from './diplomacy';
import { generateCandidates } from './entourage';
import { UNIT_TYPES, UNITS } from '../data/units';
import { generateMap, type MapData } from './mapgen';
import { economyOf, countyMaxLevies, countyRuler } from './realm';
import { Rng } from './rng';
import {
  SAVE_VERSION,
  type BuildingType,
  type Character,
  type County,
  type Difficulty,
  type GameState,
  type Terrain,
} from './state';
import { emptyUnits } from './units';
import { declareWar } from './war';

export type { MapData };
/** Carte historique (fichier) : utilisée pour les sauvegardes antérieures aux cartes générées. */
export const LEGACY_MAP = MAP as unknown as MapData;

export interface NewGameOptions {
  seed?: number;
  difficulty?: Difficulty;
  female?: boolean;
  /** Force une origine (tests). */
  originId?: string;
}

export function emptyState(seed: number, difficulty: Difficulty): GameState {
  return {
    version: SAVE_VERSION,
    map: LEGACY_MAP,
    seed,
    rng: seed,
    turn: 0,
    startYear: BALANCE.game.startYear,
    difficulty,
    playerId: '',
    playerDynastyId: '',
    characters: {},
    dynasties: {},
    counties: {},
    duchies: {},
    kingdoms: {},
    armies: {},
    standing: {},
    wars: {},
    plots: {},
    council: {
      chancelier: { task: 'relations' },
      marechal: { task: 'entrainement' },
      intendant: { task: 'impots' },
      espion: { task: 'demasquer' },
      chapelain: { task: 'piete' },
    },
    spied: {},
    alliances: [],
    truces: {},
    pendingEvents: [],
    pendingTriggers: [],
    eventCooldowns: {},
    eventOnce: {},
    chronicle: [],
    notifications: [],
    worldNews: [],
    pendingBattles: [],
    phase: 'saison',
    nextId: 0,
    ledger: { gold: [], prestige: [], piety: [] },
    tutorialSeen: false,
    flags: {},
    scheduled: [],
    decisionsUsed: {},
    mercenaries: [],
    mercCooldown: {},
    rulers: [],
    achievements: [],
    stats: emptyStats(),
    candidates: [],
    treasury: 'prudent',
  };
}

export function newGame(opts: NewGameOptions = {}): GameState {
  const seed = (opts.seed ?? Math.floor(Math.random() * 2 ** 31)) >>> 0;
  const state = emptyState(seed, opts.difficulty ?? 'normal');
  const rng = new Rng(seed);
  const ctx: Ctx = { state, rng };
  const MAP_DATA = generateMap(rng);
  state.map = MAP_DATA;
  state.startYear = rng.int(1040, 1095);
  const origin: Origin = ORIGINS.find((o) => o.id === opts.originId) ?? rng.pick(ORIGINS);
  state.origin = { id: origin.id, titre: origin.titre, texte: origin.texte };
  // Biais d'événements propre à la partie : certains reviennent souvent, d'autres jamais.
  state.eventBias = {};
  for (const e of ALL_EVENTS) {
    if (e.declencheur.type !== 'aleatoire') continue;
    state.eventBias[e.id] = rng.chance(0.12) ? 0 : Math.round(rng.range(0.4, 1.8) * 100) / 100;
  }
  // Le joueur reçoit un domaine de taille moyenne ; les autres vont du petit au grand.
  const fair = MAP_DATA.realms
    .map((r, i) => (r.length >= 5 && r.length <= 7 ? i : -1))
    .filter((i) => i >= 0);
  const playerRealm = fair.length ? rng.pick(fair) : rng.int(0, MAP_DATA.realms.length - 1);

  // Comtés, duchés, royaumes.
  for (const k of MAP_DATA.kingdoms)
    state.kingdoms[k.id] = { id: k.id, name: k.name, duchies: [...k.duchies] };
  for (const d of MAP_DATA.duchies)
    state.duchies[d.id] = {
      id: d.id,
      name: d.name,
      kingdomId: d.kingdom,
      counties: [...d.counties],
    };
  for (const m of MAP_DATA.counties) {
    const terrain = m.terrain as Terrain;
    const c: County = {
      id: m.id,
      name: m.name,
      terrain,
      duchyId: m.duchy,
      kingdomId: state.duchies[m.duchy].kingdomId,
      holderId: '',
      development: rng.int(2, 5),
      baseFort: terrain === 'montagne' ? 1 : terrain === 'colline' && rng.chance(0.4) ? 1 : 0,
      buildings: [],
      slots: rng.int(BALANCE.economy.titleBaseSlots.min, BALANCE.economy.titleBaseSlots.max),
      levyPool: 0,
      rivers: [...m.rivers],
      adjacent: [...m.adjacent],
    };
    state.counties[c.id] = c;
  }

  const usedDyn = new Set<string>();
  MAP_DATA.realms.forEach((realm, idx) => {
    const isPlayer = idx === playerRealm;
    // Dynastie et souverain.
    const dynId = `y${++state.nextId}`;
    const ageRange = isPlayer ? (origin.age ?? [22, 34]) : [20, 50];
    const ruler = createCharacter(ctx, {
      age: rng.int(ageRange[0], ageRange[1]),
      female: isPlayer ? (opts.female ?? false) : rng.chance(0.2),
      dynastyId: dynId,
      skillBase: isPlayer ? 9 : 8,
    });
    state.dynasties[dynId] = {
      id: dynId,
      name: dynastyName(rng, usedDyn),
      renown: 50,
      seed: rng.seed(),
      founderId: ruler.id,
    };
    ruler.gold = isPlayer ? 150 + (origin.or ?? 0) : rng.int(60, 260);
    ruler.prestige = isPlayer ? 150 + (origin.prestige ?? 0) : rng.int(60, 220);
    ruler.piety = isPlayer ? 50 + (origin.piete ?? 0) : rng.int(20, 120);
    if (isPlayer) {
      ruler.health += origin.sante ?? 0;
      for (const t of origin.traits ?? []) addTrait(ruler, t);
    }
    // Conjoint et enfants.
    const married = isPlayer ? !origin.celibataire : rng.chance(0.85);
    if (married) {
      const spouse = createCharacter(ctx, {
        age: Math.max(18, rng.int(18, 30)),
        female: !ruler.female,
        dynastyId: null,
        courtId: ruler.id,
        skillBase: 7,
      });
      marry(state, ruler, spouse);
      const range = isPlayer ? (origin.enfants ?? [1, 3]) : [0, 3];
      const kids = rng.int(range[0], range[1]);
      const rulerAge = Math.floor(-ruler.birthTurn / 4);
      const maxKidAge = Math.max(0, Math.min(rulerAge - 18, 30));
      for (let k = 0; k < kids; k++) {
        const [mother, father] = ruler.female ? [ruler, spouse] : [spouse, ruler];
        const adult = isPlayer && origin.heritierAdulte && k === 0;
        createCharacter(ctx, {
          age: adult ? rng.int(18, Math.max(18, maxKidAge)) : rng.int(0, Math.min(10, maxKidAge)),
          education: adult ? true : undefined,
          dynastyId: dynId,
          courtId: ruler.id,
          fatherId: father.id,
          motherId: mother.id,
          skillBase: 6,
        });
      }
    }
    // Courtisans (conseil, commandants).
    for (let k = 0; k < BALANCE.characters.courtSize; k++) {
      const c = createCharacter(ctx, {
        age: rng.int(20, 50),
        dynastyId: null,
        courtId: ruler.id,
        skillBase: 8,
      });
      if (k === 0 && rng.chance(0.3))
        addTrait(c, rng.pick(['stratege', 'cavalier', 'inebranlable', 'inspirant']));
    }
    // Comtés : capitale au centre du domaine, 4 en propre, le reste aux vassaux.
    const counties = realm.map((id) => state.counties[id]);
    const centrality = (c: County) => c.adjacent.filter((n) => realm.includes(n)).length;
    counties.sort((a, b) => centrality(b) - centrality(a));
    const capital = counties[0];
    capital.development += 1;
    const rest = counties
      .slice(1)
      .sort((a, b) => dist(a, capital, MAP_DATA) - dist(b, capital, MAP_DATA));
    const demesne = [capital, ...rest.slice(0, 3)];
    for (const c of demesne) c.holderId = ruler.id;
    for (const c of rest.slice(3)) {
      const v = createVassal(ctx, ruler, usedDyn);
      c.holderId = v.id;
    }
    // Titre ducal de la capitale.
    const duchy = state.duchies[capital.duchyId];
    if (!duchy.holderId) duchy.holderId = ruler.id;
    else {
      const other = Object.values(state.duchies).find(
        (d) => !d.holderId && d.counties.some((id) => demesne.some((c) => c.id === id)),
      );
      if (other) other.holderId = ruler.id;
    }
    // Bâtiments de départ et compagnies.
    const starts: BuildingType[] = isPlayer
      ? ['caserne', 'marche']
      : [rng.pick(['caserne', 'archerie', 'marche'] as BuildingType[]), 'ferme'];
    starts.forEach((t, i) =>
      (i === 0 ? capital : demesne[1]).buildings.push({ type: t, level: 1 }),
    );
    if (isPlayer) demesne[2].buildings.push({ type: 'archerie', level: 1 });
    if (isPlayer && origin.citadelle) {
      capital.buildings = capital.buildings.filter((b) => b.type !== 'caserne');
      capital.buildings.push({ type: 'muraille', level: 2 }, { type: 'caserne', level: 2 });
      capital.slots = Math.max(capital.slots, capital.buildings.length + 1);
    }
    const st = emptyUnits();
    st.piquiers = rng.pick([100, 200, 300]);
    st.archers = rng.pick([100, 200, 300]);
    st.infanterie = isPlayer ? 100 : rng.pick([0, 100, 200]);
    st.cavalerie = rng.pick([0, 100, 200]);
    if (isPlayer && origin.troupes) {
      st.infanterie += Math.round(origin.troupes / 200) * 100;
      st.cavalerie += Math.round(origin.troupes / 300) * 100;
      st.piquiers += Math.round(origin.troupes / 300) * 100;
    }
    state.standing[ruler.id] = st;
    if (isPlayer) {
      state.playerId = ruler.id;
      state.playerDynastyId = dynId;
    }
  });

  for (const c of Object.values(state.counties)) c.levyPool = countyMaxLevies(c);
  // Les compagnies de départ ne doivent pas ruiner leur seigneur : on retire les plus chères
  // jusqu'à ce que le revenu net soit positif (un peu négatif pour une origine guerrière).
  for (const id of Object.keys(state.standing)) {
    const floor = id === state.playerId && origin.troupes ? -4 : BALANCE.economy.startNetFloor;
    trimStanding(state, id, floor);
  }

  // Revendications de départ du joueur sur des comtés voisins.
  const pl = state.characters[state.playerId];
  const mine = new Set(MAP_DATA.realms[playerRealm]);
  const border = rng.shuffle(
    Object.values(state.counties).filter(
      (c) => !mine.has(c.id) && c.adjacent.some((n) => mine.has(n)),
    ),
  );
  for (const c of border.slice(0, 1 + (origin.revendications ?? 0))) pl.claims.push(c.id);
  // Quelques revendications pour les rivaux.
  MAP_DATA.realms.forEach((realm, idx) => {
    if (idx === playerRealm) return;
    const holder = state.counties[realm[0]].holderId;
    const ruler = state.characters[holder]?.liegeId ?? holder;
    const own = new Set(realm);
    const b = Object.values(state.counties).filter(
      (c) => !own.has(c.id) && c.adjacent.some((n) => own.has(n)),
    );
    if (b.length && rng.chance(0.6)) state.characters[ruler].claims.push(rng.pick(b).id);
  });

  applyOriginWorld(ctx, origin, border);
  worldTwists(ctx);

  autoFillCouncil(state);
  // Le chancelier cultive d'emblée un voisin.
  const neighbor = border[0] ? state.counties[border[0].id].holderId : undefined;
  const nr = neighbor ? (state.characters[neighbor]?.liegeId ?? neighbor) : undefined;
  if (nr) state.council.chancelier.targetId = nr;

  const eco = economyOf(state, state.playerId);
  state.ledger = { gold: eco.gold, prestige: eco.prestige, piety: eco.piety };
  state.rng = rng.s;
  state.chronicle.unshift({
    turn: 0,
    text: `Au printemps ${state.startYear}, ${pl.name} ${state.dynasties[state.playerDynastyId].name} tient ses terres dans les Marches d’Aveline. ${origin.titre}.`,
    kind: 'divers',
  });
  // Carte d'introduction : l'origine de cette partie.
  state.pendingEvents.push({
    uid: `e${++state.nextId}`,
    eventId: 'intro_origine',
    scope: { souverain: state.playerId },
    inline: {
      id: 'intro_origine',
      titre: origin.titre,
      texte: `${origin.texte}\n\nNous sommes au printemps ${state.startYear}.`,
      categorie: 'systeme',
      declencheur: { type: 'suite' },
      poids: 0,
      choix: [{ libelle: 'Ainsi commence la chronique', effets: [] }],
    },
  });
  recordRuler(state, state.playerId);
  generateCandidates(ctx);
  offerAmbition(ctx);
  state.rng = rng.s;
  return state;
}

/** Effets de l'origine qui touchent le reste du monde. */
function applyOriginWorld(ctx: Ctx, origin: Origin, border: County[]): void {
  const { state, rng } = ctx;
  const pl = state.characters[state.playerId];
  if (origin.vassalAmbitieux) {
    const v = Object.values(state.characters).find((c) => c.alive && c.liegeId === pl.id);
    if (v) {
      v.traits = v.traits.filter((t) => t !== 'satisfait');
      addTrait(v, 'ambitieux');
      v.skills.guerre += 3;
      addOpinion(state, v.id, pl.id, 'Méprise votre jeunesse ou votre faiblesse', -50, 40);
    }
  }
  const neighborRuler = border.length ? countyRuler(state, border[0]) : undefined;
  if (origin.allianceVoisin && neighborRuler && neighborRuler !== pl.id) {
    const nr = state.characters[neighborRuler];
    const spouse = pl.spouseId ? state.characters[pl.spouseId] : undefined;
    if (spouse) {
      spouse.dynastyId = nr.dynastyId;
      spouse.fatherId = nr.id;
      nr.childrenIds.push(spouse.id);
      spouse.birthTurn = Math.max(spouse.birthTurn, nr.birthTurn + 4 * 18);
    }
    const k = allyKey(pl.id, nr.id);
    if (!state.alliances.includes(k)) state.alliances.push(k);
    addOpinion(state, nr.id, pl.id, 'Liens du mariage', 25, 0);
    addOpinion(state, pl.id, nr.id, 'Liens du mariage', 25, 0);
  }
  if (origin.guerreVoisin && neighborRuler && neighborRuler !== pl.id) {
    const nr = state.characters[neighborRuler];
    const target = Object.values(state.counties).find(
      (c) =>
        countyRuler(state, c) === pl.id &&
        c.adjacent.some((n) => countyRuler(state, state.counties[n]) === nr.id),
    );
    if (target) {
      nr.claims.push(target.id);
      declareWar(ctx, nr.id, pl.id, 'revendication', target.id, true);
    }
  }
  void rng;
}

/** Aléas du monde : guerre entre rivaux, souverains riches ou ruinés, alliances. */
function worldTwists(ctx: Ctx): void {
  const { state, rng } = ctx;
  const rivals = Object.values(state.characters)
    .filter(
      (c) =>
        c.alive &&
        !c.liegeId &&
        c.id !== state.playerId &&
        Object.values(state.counties).some((k) => k.holderId === c.id),
    )
    .map((c) => c.id);
  // Une guerre entre deux rivaux voisins.
  if (rivals.length >= 2 && rng.chance(0.45)) {
    const a = rng.pick(rivals);
    const target = rng.shuffle(Object.values(state.counties)).find((c) => {
      const r = countyRuler(state, c);
      return (
        r !== a &&
        r !== state.playerId &&
        c.adjacent.some((n) => countyRuler(state, state.counties[n]) === a)
      );
    });
    if (target) {
      state.characters[a].claims.push(target.id);
      declareWar(ctx, a, countyRuler(state, target), 'revendication', target.id, true);
    }
  }
  // Une alliance entre deux rivaux.
  if (rivals.length >= 2 && rng.chance(0.4)) {
    const [a, b] = rng.shuffle([...rivals]);
    const k = allyKey(a, b);
    if (
      !state.alliances.includes(k) &&
      !Object.values(state.wars).some(
        (w) => [w.attackerId, w.defenderId].includes(a) && [w.attackerId, w.defenderId].includes(b),
      )
    )
      state.alliances.push(k);
  }
  // Un rival au tempérament marqué.
  if (rivals.length && rng.chance(0.5)) {
    const r = state.characters[rng.pick(rivals)];
    addTrait(r, rng.pick(['ambitieux', 'cruel', 'impetueux', 'genereux', 'prudent']));
  }
}

function createVassal(ctx: Ctx, liege: Character, used: Set<string>): Character {
  const { state, rng } = ctx;
  const dynId = `y${++state.nextId}`;
  const v = createCharacter(ctx, { age: rng.int(22, 55), dynastyId: dynId, skillBase: 7 });
  state.dynasties[dynId] = {
    id: dynId,
    name: dynastyName(rng, used),
    renown: 10,
    seed: rng.seed(),
    founderId: v.id,
  };
  v.liegeId = liege.id;
  v.courtId = v.id;
  v.gold = 30;
  v.prestige = 30;
  if (rng.chance(0.7)) {
    const s = createCharacter(ctx, {
      age: rng.int(20, 45),
      female: !v.female,
      dynastyId: null,
      courtId: v.id,
      skillBase: 5,
    });
    marry(state, v, s);
    if (rng.chance(0.6)) {
      const [mother, father] = v.female ? [v, s] : [s, v];
      createCharacter(ctx, {
        age: rng.int(0, 15),
        dynastyId: dynId,
        courtId: v.id,
        fatherId: father.id,
        motherId: mother.id,
        education: false,
      });
    }
  }
  return v;
}

function dist(a: County, b: County, map: MapData): number {
  const pa = map.counties.find((c) => c.id === a.id)!;
  const pb = map.counties.find((c) => c.id === b.id)!;
  return Math.hypot(pa.x - pb.x, pa.y - pb.y);
}

/** Retire des compagnies (les plus chères d'abord) jusqu'à un revenu net suffisant. */
function trimStanding(state: GameState, id: string, floor: number): void {
  const st = state.standing[id];
  if (!st) return;
  let guard = 0;
  while (economyOf(state, id).goldNet < floor && guard++ < 60) {
    const pick = [...UNIT_TYPES]
      .filter((u) => st[u] >= 100)
      .sort((a, b) => UNITS[b].upkeep - UNITS[a].upkeep)[0];
    if (!pick) break;
    st[pick] -= 100;
  }
}
