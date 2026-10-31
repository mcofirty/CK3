/** Création d'une nouvelle partie à partir de la carte et des données. */
import { BALANCE } from '../data/balance';
import MAP from '../data/map.json';
import { addTrait, createCharacter, dynastyName, marry } from './characters';
import type { Ctx } from './context';
import { autoFillCouncil } from './diplomacy';
import { economyOf, countyMaxLevies } from './realm';
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

export interface MapData {
  width: number;
  height: number;
  counties: {
    id: string;
    name: string;
    terrain: string;
    duchy: string;
    x: number;
    y: number;
    polygon: [number, number][];
    adjacent: string[];
    rivers: string[];
    coastal: boolean;
  }[];
  duchies: { id: string; name: string; kingdom: string; counties: string[] }[];
  kingdoms: { id: string; name: string; duchies: string[] }[];
  realms: string[][];
  rivers: { a: string; b: string; path: [number, number][] }[];
  sea: [number, number][][];
}

export const MAP_DATA = MAP as unknown as MapData;

export interface NewGameOptions {
  seed?: number;
  difficulty?: Difficulty;
  female?: boolean;
}

export function emptyState(seed: number, difficulty: Difficulty): GameState {
  return {
    version: SAVE_VERSION,
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
    pendingBattles: [],
    phase: 'saison',
    nextId: 0,
    ledger: { gold: [], prestige: [], piety: [] },
    tutorialSeen: false,
  };
}

export function newGame(opts: NewGameOptions = {}): GameState {
  const seed = (opts.seed ?? Math.floor(Math.random() * 2 ** 31)) >>> 0;
  const state = emptyState(seed, opts.difficulty ?? 'normal');
  const rng = new Rng(seed);
  const ctx: Ctx = { state, rng };

  // Comtés, duchés, royaumes.
  for (const k of MAP_DATA.kingdoms) state.kingdoms[k.id] = { id: k.id, name: k.name, duchies: [...k.duchies] };
  for (const d of MAP_DATA.duchies) state.duchies[d.id] = { id: d.id, name: d.name, kingdomId: d.kingdom, counties: [...d.counties] };
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
    const isPlayer = idx === 0;
    // Dynastie et souverain.
    const dynId = `y${++state.nextId}`;
    const ruler = createCharacter(ctx, {
      age: isPlayer ? rng.int(24, 30) : rng.int(22, 45),
      female: isPlayer ? (opts.female ?? false) : rng.chance(0.2),
      dynastyId: dynId,
      skillBase: isPlayer ? 9 : 8,
    });
    state.dynasties[dynId] = { id: dynId, name: dynastyName(rng, usedDyn), renown: 50, seed: rng.seed(), founderId: ruler.id };
    ruler.gold = isPlayer ? 150 : 120;
    ruler.prestige = isPlayer ? 150 : 120;
    ruler.piety = 50;
    // Conjoint et enfants.
    if (rng.chance(isPlayer ? 1 : 0.85)) {
      const spouse = createCharacter(ctx, { age: Math.max(18, rng.int(18, 30)), female: !ruler.female, dynastyId: null, courtId: ruler.id, skillBase: 7 });
      marry(state, ruler, spouse);
      const kids = rng.int(isPlayer ? 1 : 0, 3);
      for (let k = 0; k < kids; k++) {
        const [mother, father] = ruler.female ? [ruler, spouse] : [spouse, ruler];
        createCharacter(ctx, {
          age: rng.int(0, 10),
          dynastyId: dynId,
          courtId: ruler.id,
          fatherId: father.id,
          motherId: mother.id,
          skillBase: 6,
          education: false,
        });
      }
    }
    // Courtisans (conseil, commandants).
    for (let k = 0; k < BALANCE.characters.courtSize; k++) {
      const c = createCharacter(ctx, { age: rng.int(20, 50), dynastyId: null, courtId: ruler.id, skillBase: 8 });
      if (k === 0 && rng.chance(0.3)) addTrait(c, rng.pick(['stratege', 'cavalier', 'inebranlable', 'inspirant']));
    }
    // Comtés : capitale au centre du domaine, 4 en propre, le reste aux vassaux.
    const counties = realm.map((id) => state.counties[id]);
    const centrality = (c: County) => c.adjacent.filter((n) => realm.includes(n)).length;
    counties.sort((a, b) => centrality(b) - centrality(a));
    const capital = counties[0];
    capital.development += 1;
    const rest = counties.slice(1).sort((a, b) => dist(a, capital) - dist(b, capital));
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
      const other = Object.values(state.duchies).find((d) => !d.holderId && d.counties.some((id) => demesne.some((c) => c.id === id)));
      if (other) other.holderId = ruler.id;
    }
    // Bâtiments de départ et compagnies.
    const starts: BuildingType[] = isPlayer ? ['caserne', 'marche'] : [rng.pick(['caserne', 'archerie', 'marche'] as BuildingType[]), 'ferme'];
    starts.forEach((t, i) => (i === 0 ? capital : demesne[1]).buildings.push({ type: t, level: 1 }));
    if (isPlayer) demesne[2].buildings.push({ type: 'archerie', level: 1 });
    const st = emptyUnits();
    st.piquiers = 200;
    st.archers = 200;
    st.infanterie = isPlayer ? 100 : rng.pick([0, 100]);
    st.cavalerie = rng.pick([0, 100]);
    state.standing[ruler.id] = st;
    if (isPlayer) {
      state.playerId = ruler.id;
      state.playerDynastyId = dynId;
    }
  });

  for (const c of Object.values(state.counties)) c.levyPool = countyMaxLevies(c);

  // Une revendication de départ pour le joueur sur un comté voisin.
  const pl = state.characters[state.playerId];
  const mine = new Set(MAP_DATA.realms[0]);
  const border = Object.values(state.counties).filter((c) => !mine.has(c.id) && c.adjacent.some((n) => mine.has(n)));
  if (border.length) pl.claims.push(rng.pick(border).id);
  // Quelques revendications pour les rivaux.
  MAP_DATA.realms.slice(1).forEach((realm) => {
    const holder = state.counties[realm[0]].holderId;
    const ruler = state.characters[holder]?.liegeId ?? holder;
    const own = new Set(realm);
    const b = Object.values(state.counties).filter((c) => !own.has(c.id) && c.adjacent.some((n) => own.has(n)));
    if (b.length && rng.chance(0.6)) state.characters[ruler].claims.push(rng.pick(b).id);
  });

  autoFillCouncil(state);
  // Le chancelier cultive d'emblée un voisin.
  const neighbor = border[0] ? state.counties[border[0].id].holderId : undefined;
  const nr = neighbor ? state.characters[neighbor]?.liegeId ?? neighbor : undefined;
  if (nr) state.council.chancelier.targetId = nr;

  const eco = economyOf(state, state.playerId);
  state.ledger = { gold: eco.gold, prestige: eco.prestige, piety: eco.piety };
  state.rng = rng.s;
  state.chronicle.push({
    turn: 0,
    text: `Au printemps ${state.startYear}, ${pl.name} ${state.dynasties[state.playerDynastyId].name} tient ses terres dans les Marches d’Aveline.`,
    kind: 'divers',
  });
  return state;
}

function createVassal(ctx: Ctx, liege: Character, used: Set<string>): Character {
  const { state, rng } = ctx;
  const dynId = `y${++state.nextId}`;
  const v = createCharacter(ctx, { age: rng.int(22, 55), dynastyId: dynId, skillBase: 7 });
  state.dynasties[dynId] = { id: dynId, name: dynastyName(rng, used), renown: 10, seed: rng.seed(), founderId: v.id };
  v.liegeId = liege.id;
  v.courtId = v.id;
  v.gold = 30;
  v.prestige = 30;
  if (rng.chance(0.7)) {
    const s = createCharacter(ctx, { age: rng.int(20, 45), female: !v.female, dynastyId: null, courtId: v.id, skillBase: 5 });
    marry(state, v, s);
    if (rng.chance(0.6)) {
      const [mother, father] = v.female ? [v, s] : [s, v];
      createCharacter(ctx, { age: rng.int(0, 15), dynastyId: dynId, courtId: v.id, fatherId: father.id, motherId: mother.id, education: false });
    }
  }
  return v;
}

function dist(a: County, b: County): number {
  const pa = MAP_DATA.counties.find((c) => c.id === a.id)!;
  const pb = MAP_DATA.counties.find((c) => c.id === b.id)!;
  return Math.hypot(pa.x - pb.x, pa.y - pb.y);
}
