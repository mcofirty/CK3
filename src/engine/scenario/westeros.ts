/**
 * Mode Trône de fer : Westeros au début de la saison 1 (an 298 après la Conquête).
 * Robert Baratheon règne ; les grandes maisons sont ses vassales, avec leurs bannerets.
 */
import { BALANCE } from '../../data/balance';
import {
  HOUSES,
  MINOR_HOUSES,
  WESTEROS_NAMES,
  type WHouse,
  type WMember,
} from '../../data/westeros/houses';
import { openingEvents } from '../../data/westeros/opening';
import { addOpinion, addTrait, allyKey, createCharacter, marry } from '../characters';
import { recordRuler, type Ctx } from '../context';
import { offerAmbition } from '../court';
import { autoEducate, autoFillCouncil } from '../diplomacy';
import { generateCandidates } from '../entourage';
import { assignHouseColors } from '../heraldry';
import { countyMaxLevies, economyOf, ensureCapitals } from '../realm';
import { Rng } from '../rng';
import {
  SKILL_KEYS,
  type BuildingType,
  type Character,
  type County,
  type Difficulty,
  type GameState,
  type Terrain,
} from '../state';
import { emptyUnits } from '../units';
import { emptyState, rollEventBias, trimStanding } from '../world';
import { buildWesterosMap } from './westerosMap';
import { initWall } from './wall';
import { initEssos } from './essos';

export interface WesterosOptions {
  seed?: number;
  difficulty?: Difficulty;
  /** Maison jouée (identifiant de `HOUSES`). */
  houseId: string;
}

export const START_YEAR = 298;

/** Maisons proposées au joueur. */
export const PLAYABLE_HOUSES = HOUSES.filter((h) => h.playable);

/** Titres de Westeros : ce que porte le titulaire, et le nom de son domaine. */
const KINGDOM_LABELS: Record<string, { label: [string, string]; realm: string }> = {
  k_couronnes: {
    label: ['Roi des Sept Couronnes', 'Reine des Sept Couronnes'],
    realm: 'Les Sept Couronnes',
  },
  k_nord: { label: ['Roi du Nord', 'Reine du Nord'], realm: 'Royaume du Nord' },
  k_iles: { label: ['Roi des Îles de Fer', 'Reine des Îles de Fer'], realm: 'Royaume des Îles' },
  k_trident: { label: ['Roi du Trident', 'Reine du Trident'], realm: 'Royaume du Trident' },
  k_val: {
    label: ['Roi de la Montagne et du Val', 'Reine de la Montagne et du Val'],
    realm: 'Royaume de la Montagne et du Val',
  },
  k_roc: { label: ['Roi du Roc', 'Reine du Roc'], realm: 'Royaume du Roc' },
  k_bief: { label: ['Roi du Bief', 'Reine du Bief'], realm: 'Royaume du Bief' },
  k_orage: { label: ['Roi de l’Orage', 'Reine de l’Orage'], realm: 'Royaume de l’Orage' },
  k_dorne: { label: ['Roi de Dorne', 'Reine de Dorne'], realm: 'Royaume de Dorne' },
};
const DUCHY_LABELS: Record<string, { label: [string, string]; realm: string }> = {
  d_nord: { label: ['Gouverneur du Nord', 'Gouvernante du Nord'], realm: 'Le Nord' },
  d_conflans: {
    label: ['Seigneur suzerain du Trident', 'Dame suzeraine du Trident'],
    realm: 'Les Conflans',
  },
  d_iles: { label: ['Seigneur des Îles de Fer', 'Dame des Îles de Fer'], realm: 'Les Îles de Fer' },
  d_val: { label: ['Gouverneur de l’Est', 'Gouvernante de l’Est'], realm: 'Le Val d’Arryn' },
  d_ouest: { label: ['Gouverneur de l’Ouest', 'Gouvernante de l’Ouest'], realm: 'L’Ouest' },
  d_couronne: {
    label: ['Seigneur des terres de la Couronne', 'Dame des terres de la Couronne'],
    realm: 'Les terres de la Couronne',
  },
  d_bief: { label: ['Gouverneur du Sud', 'Gouvernante du Sud'], realm: 'Le Bief' },
  d_orage: {
    label: ['Seigneur suzerain de l’Orage', 'Dame suzeraine de l’Orage'],
    realm: 'Les terres de l’Orage',
  },
  d_dorne: { label: ['Prince de Dorne', 'Princesse de Dorne'], realm: 'Principauté de Dorne' },
};

/** Maisons sans entrée à elles, citées comme maison de naissance. */
const EXTRA_DYNASTIES: Record<string, string> = {
  baelish: 'Baelish',
  selmy: 'Selmy',
  mervault: 'Mervault',
  cassel: 'Cassel',
  erenford: 'Erenford',
};

/** Maisons dont les femmes héritent (Dorne, l'Île-aux-Ours). */
const COGNATIC = new Set([
  'martell',
  'mormont',
  ...MINOR_HOUSES.filter((h) => h.liege === 'martell').map((h) => h.id),
]);

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

const dynId = (key: string) => `y_${key}`;

export function newWesterosGame(opts: WesterosOptions): GameState {
  const house = HOUSES.find((h) => h.id === opts.houseId && h.playable);
  if (!house) throw new Error(`Maison inconnue : ${opts.houseId}`);
  const seed = (opts.seed ?? Math.floor(Math.random() * 2 ** 31)) >>> 0;
  const state = emptyState(seed, opts.difficulty ?? 'normal');
  const rng = new Rng(seed);
  const ctx: Ctx = { state, rng };
  state.scenario = 'westeros';
  state.scenarioHouse = house.id;
  state.startYear = START_YEAR;
  const map = buildWesterosMap();
  state.map = map;
  state.origin = {
    id: 'westeros',
    titre: `Maison ${house.name}`,
    texte: house.blurb ?? '',
  };
  rollEventBias(state, rng);

  // --- Titres ---
  for (const k of map.kingdoms)
    state.kingdoms[k.id] = {
      id: k.id,
      name: k.name,
      duchies: [...k.duchies],
      label: KINGDOM_LABELS[k.id]?.label,
      realmLabel: KINGDOM_LABELS[k.id]?.realm,
    };
  for (const d of map.duchies)
    state.duchies[d.id] = {
      id: d.id,
      name: d.name,
      kingdomId: d.kingdom,
      counties: [...d.counties],
      label: DUCHY_LABELS[d.id]?.label,
      realmLabel: DUCHY_LABELS[d.id]?.realm,
    };
  for (const mc of map.counties) {
    const terrain = mc.terrain as Terrain;
    const c: County = {
      id: mc.id,
      name: mc.name,
      terrain,
      duchyId: mc.duchy,
      kingdomId: state.duchies[mc.duchy].kingdomId,
      holderId: '',
      development: rng.int(2, 4),
      baseFort: terrain === 'montagne' ? 1 : terrain === 'colline' && rng.chance(0.4) ? 1 : 0,
      buildings: [],
      slots: rng.int(BALANCE.economy.titleBaseSlots.min, BALANCE.economy.titleBaseSlots.max),
      levyPool: 0,
      rivers: [...mc.rivers],
      adjacent: [...mc.adjacent],
    };
    state.counties[c.id] = c;
  }

  // --- Maisons (dynasties) ---
  const dynName = (key: string): string =>
    HOUSES.find((h) => (h.dynasty ?? h.id) === key)?.name.replace(/ (de|d’) .*$/, '') ??
    MINOR_HOUSES.find((h) => h.id === key)?.name ??
    EXTRA_DYNASTIES[key] ??
    key;
  const ensureDynasty = (key: string, founder: string) => {
    const id = dynId(key);
    const h =
      HOUSES.find((x) => (x.dynasty ?? x.id) === key && x.color) ??
      HOUSES.find((x) => (x.dynasty ?? x.id) === key);
    if (!state.dynasties[id])
      state.dynasties[id] = {
        id,
        name: dynName(key),
        renown: h?.playable ? 60 : 15,
        seed: hash(key),
        founderId: founder,
        color: h?.color,
        sigil: h?.sigil,
        metal: h?.metal,
      };
    return id;
  };

  // --- Personnages nommés (deux passes : création, puis liens) ---
  const ids = new Map<string, string>();
  const specs = new Map<string, { m: WMember; h: WHouse }>();
  for (const h of HOUSES)
    for (const mem of h.members) {
      if (ids.has(mem.key)) throw new Error(`Personnage en double : ${mem.key}`);
      const houseKey = mem.house === undefined ? (h.dynasty ?? h.id) : mem.house;
      const dyn = houseKey ? ensureDynasty(houseKey, '') : null;
      const c = createCharacter(ctx, {
        age: mem.age,
        female: !!mem.female,
        dynastyId: dyn,
        traits: mem.traits ?? [],
        personalityCount: mem.traits ? 0 : undefined,
        education: mem.traits ? false : undefined,
        skillBase: mem.skills ? undefined : 7,
      });
      c.name = mem.name;
      c.birthTurn = -mem.age * 4 - (hash(mem.key) % 4);
      if (mem.skills) SKILL_KEYS.forEach((k, i) => (c.skills[k] = mem.skills![i]));
      if (mem.health !== undefined) c.health = mem.health;
      if (mem.vows) addTrait(c, 'voeux');
      if (mem.dead) {
        c.alive = false;
        c.deathTurn = -1;
        c.deathCause = mem.dead;
      }
      ids.set(mem.key, c.id);
      specs.set(mem.key, { m: mem, h });
    }
  const idOf = (key: string) => {
    const id = ids.get(key);
    if (!id) throw new Error(`Personnage inconnu : ${key}`);
    return id;
  };
  const ch = (key: string) => state.characters[idOf(key)];
  for (const [key, { m: mem, h }] of specs) {
    const c = ch(key);
    if (mem.father) {
      c.fatherId = idOf(mem.father);
      if (!mem.bastard) ch(mem.father).childrenIds.push(c.id);
    }
    if (mem.mother) {
      c.motherId = idOf(mem.mother);
      if (!mem.bastard) ch(mem.mother).childrenIds.push(c.id);
    }
    if (mem.spouse && c.alive && ch(mem.spouse).alive) marry(state, c, ch(mem.spouse));
    c.courtId = idOf(mem.court ?? h.head);
    if (mem.hostageOf) {
      c.hostageOf = idOf(mem.hostageOf);
      c.hostageSince = -36;
      c.hostageHome = mem.father ? idOf(mem.father) : undefined;
    }
  }
  // Fondateurs des dynasties : le chef de la maison, sinon le premier membre.
  for (const d of Object.values(state.dynasties)) {
    const head = HOUSES.find((h) => dynId(h.dynasty ?? h.id) === d.id);
    const member = Object.values(state.characters).find((c) => c.dynastyId === d.id);
    d.founderId = head ? idOf(head.head) : (member?.id ?? '');
  }

  // --- Seigneuries des maisons nommées ---
  const headOf = (houseId: string): string => {
    const h = HOUSES.find((x) => x.id === houseId);
    return h ? idOf(h.head) : minorHeads.get(houseId)!;
  };
  const minorHeads = new Map<string, string>();
  for (const h of HOUSES) {
    if (!h.counties.length) continue;
    const head = ch(h.head);
    head.courtId = head.id;
    head.gold = h.gold ?? 60;
    head.prestige = h.prestige ?? 80;
    head.piety = rng.int(30, 120);
    head.successionLaw = 'primogeniture';
    head.government = 'feodal';
    head.agnatic = h.agnatic ?? !COGNATIC.has(h.id);
    h.counties.forEach((cid, i) => {
      const county = state.counties[cid];
      county.holderId = head.id;
      if (i === 0) {
        county.seatOf = head.id;
        county.development = Math.max(county.development, h.development ?? 4);
      }
    });
    if (h.duchy) state.duchies[`d_${h.duchy}`].holderId = head.id;
    if (h.kingdom) state.kingdoms[h.kingdom].holderId = head.id;
    if (h.counties.length) {
      const st = emptyUnits();
      const want = h.standing ?? { piquiers: 100, archers: 100 };
      for (const [u, v] of Object.entries(want)) st[u as keyof typeof st] = v as number;
      state.standing[head.id] = st;
      const seat = state.counties[h.counties[0]];
      const starts: BuildingType[] = h.playable ? ['caserne', 'marche', 'muraille'] : ['ferme'];
      for (const t of starts) seat.buildings.push({ type: t, level: 1 });
      seat.slots = Math.max(seat.slots, seat.buildings.length + 1);
    }
  }
  // Bannerets mineurs : un seigneur (nommé ou tiré au sort) et parfois sa famille.
  for (const mh of MINOR_HOUSES) {
    const dyn = ensureDynasty(mh.id, '');
    const lord = createCharacter(ctx, {
      age: mh.head?.age ?? rng.int(25, 60),
      female: mh.head?.female ?? false,
      dynastyId: dyn,
      skillBase: 7,
    });
    if (mh.head) lord.name = mh.head.name;
    state.dynasties[dyn].founderId = lord.id;
    lord.gold = rng.int(20, 80);
    lord.prestige = rng.int(20, 60);
    lord.successionLaw = 'primogeniture';
    lord.government = 'feodal';
    lord.agnatic = !COGNATIC.has(mh.id);
    minorHeads.set(mh.id, lord.id);
    const county = state.counties[mh.county];
    county.holderId = lord.id;
    county.seatOf = lord.id;
    if (Math.floor(-lord.birthTurn / 4) >= 20 && rng.chance(0.7)) {
      const spouse = createCharacter(ctx, {
        age: Math.max(18, Math.floor(-lord.birthTurn / 4) - rng.int(0, 8)),
        female: !lord.female,
        dynastyId: null,
        courtId: lord.id,
        skillBase: 5,
      });
      marry(state, lord, spouse);
      if (rng.chance(0.75)) {
        const [mother, father] = lord.female ? [lord, spouse] : [spouse, lord];
        const kid = createCharacter(ctx, {
          age: rng.int(0, Math.min(20, Math.max(0, Math.floor(-lord.birthTurn / 4) - 18))),
          dynastyId: dyn,
          courtId: lord.id,
          fatherId: father.id,
          motherId: mother.id,
        });
        father.childrenIds.push(kid.id);
        mother.childrenIds.push(kid.id);
      }
    }
  }
  // Vassalité : chaque chef jure fidélité au chef de la maison suzeraine.
  for (const h of HOUSES) if (h.liege && h.counties.length) ch(h.head).liegeId = headOf(h.liege);
  for (const mh of MINOR_HOUSES)
    state.characters[minorHeads.get(mh.id)!].liegeId = headOf(mh.liege);

  // Courtisans anonymes : chaque maison jouable a de quoi former un conseil.
  for (const h of HOUSES.filter((x) => x.playable)) {
    const head = idOf(h.head);
    const present = Object.values(state.characters).filter(
      (c) => c.alive && c.courtId === head && c.id !== head && Math.floor(-c.birthTurn / 4) >= 16,
    ).length;
    for (let k = present; k < BALANCE.characters.courtSize + 1; k++)
      createCharacter(ctx, { age: rng.int(22, 55), dynastyId: null, courtId: head, skillBase: 8 });
  }

  // --- Relations de 298 ---
  const op = (a: string, b: string, why: string, v: number) =>
    addOpinion(state, idOf(a), idOf(b), why, v, 0);
  op('robert', 'ned', 'Frère d’armes de la Rébellion', 50);
  op('ned', 'robert', 'Frère d’armes de la Rébellion', 40);
  op('robert', 'cersei', 'Un mariage sans amour', -25);
  op('cersei', 'robert', 'Un mariage sans amour', -35);
  op('stannis', 'robert', 'Accalmie donnée à Renly', -15);
  op('stannis', 'renly', 'Un frère rival', -25);
  op('renly', 'stannis', 'Un frère rival', -20);
  op('balon', 'robert', 'La rébellion écrasée de 289', -35);
  op('balon', 'ned', 'Theon retenu en otage', -25);
  op('doran', 'tywin', 'Le meurtre d’Elia et de ses enfants', -50);
  op('oberyn', 'tywin', 'Le meurtre d’Elia et de ses enfants', -80);
  op('oberyn', 'gregor', 'Le bourreau d’Elia', -100);
  op('doran', 'robert', 'Il a récompensé les assassins d’Elia', -20);
  op('lysa', 'tywin', 'Elle soupçonne les Lannister', -40);
  op('lysa', 'cersei', 'Elle soupçonne les Lannister', -40);
  op('catelyn', 'cersei', 'Méfiance envers les Lannister', -15);
  op('ned', 'jaime', 'Le Régicide', -30);
  op('jaime', 'ned', 'L’homme qui le juge', -20);
  op('tyrion', 'cersei', 'Une sœur qui le hait', -30);
  op('cersei', 'tyrion', 'Il a tué leur mère en naissant', -50);
  op('walder', 'hoster', 'Le dédain des Tully', -20);
  op('hoster', 'ned', 'Liens du mariage', 25);
  op('ned', 'hoster', 'Liens du mariage', 20);
  op('mace', 'renly', 'Ami de Loras', 20);
  op('loras', 'renly', 'Amour secret', 60);
  op('renly', 'loras', 'Amour secret', 60);
  op('viserys', 'robert', 'L’Usurpateur', -100);
  op('daenerys', 'robert', 'L’Usurpateur', -60);
  op('robert', 'viserys', 'Le fils du Roi fou', -80);
  op('roose', 'ned', 'Une loyauté de façade', -10);
  op('greatjon', 'ned', 'Fidèle aux Stark', 30);
  op('wyman', 'ned', 'Fidèle aux Stark', 25);
  op('maege', 'ned', 'Fidèle aux Stark', 25);
  op('tywin', 'robert', 'Un roi qui lui doit tout', 5);
  op('randyll', 'mace', 'Un suzerain qu’il méprise', -10);
  op('gregor', 'tywin', 'Le chien de son maître', 20);
  const friends = (a: string, b: string) => {
    ch(a).friends.push(idOf(b));
    ch(b).friends.push(idOf(a));
  };
  const rivals = (a: string, b: string) => {
    ch(a).rivals.push(idOf(b));
    ch(b).rivals.push(idOf(a));
  };
  friends('robert', 'ned');
  friends('renly', 'loras');
  friends('jaime', 'tyrion');
  rivals('stannis', 'renly');
  rivals('cersei', 'tyrion');
  rivals('oberyn', 'gregor');
  rivals('sandor', 'gregor');
  const ally = (a: string, b: string) => state.alliances.push(allyKey(headOf(a), headOf(b)));
  ally('stark', 'tully');
  ally('stark', 'arryn');
  ally('tully', 'arryn');
  ally('baratheon', 'lannister');
  // Theon otage : les Greyjoy ne peuvent attaquer les Stark tant qu'il est à Winterfell.
  state.truces[allyKey(idOf('ned'), idOf('balon'))] = 40;
  // La Couronne doit des fortunes (Lannister, Banque de Fer).
  state.loans = [
    { id: 'l_couronne', ownerId: idOf('robert'), principal: 600, rate: 0.03, turn: -20 },
  ];

  // --- Couleurs, capitales, levées ---
  const named = HOUSES.filter((h) => h.color).map((h) => dynId(h.dynasty ?? h.id));
  assignHouseColors(state, named, new Rng(seed ^ 0x5eed));
  ensureCapitals(state);
  for (const c of Object.values(state.counties)) c.levyPool = countyMaxLevies(c);
  for (const id of Object.keys(state.standing))
    trimStanding(state, id, BALANCE.economy.startNetFloor);

  // --- Le joueur ---
  const player = ch(house.head);
  state.playerId = player.id;
  state.playerDynastyId = player.dynastyId!;
  autoFillCouncil(state);
  autoEducate(state);
  const eco = economyOf(state, state.playerId);
  state.ledger = { gold: eco.gold, prestige: eco.prestige, piety: eco.piety };
  state.chronicle.push({
    turn: 0,
    text: `En l’an ${START_YEAR} après la Conquête, ${player.name} ${state.dynasties[state.playerDynastyId].name} sert le roi Robert. Jon Arryn, la Main du Roi, vient de mourir.`,
    kind: 'divers',
  });
  state.chronicle.push({
    turn: 0,
    text: 'Jon Arryn, seigneur des Eyrié et Main du Roi, meurt d’une fièvre soudaine à Port-Réal.',
    kind: 'deces',
  });
  state.flags = { westeros: 0, [`maison_${house.id}`]: 0 };
  initWall(state, idOf('jeor'));
  initEssos(state);
  state.pendingEvents.push(...openingEvents(state, house.id, idOf));
  recordRuler(state, state.playerId);
  generateCandidates(ctx);
  offerAmbition(ctx);
  state.rng = rng.s;
  return state;
}

/** Personnages clés du scénario, retrouvés par leur nom de code (tests, interface). */
export function westerosCharacter(state: GameState, key: string): Character | undefined {
  const spec = HOUSES.flatMap((h) => h.members).find((x) => x.key === key);
  if (!spec) return undefined;
  return Object.values(state.characters).find(
    (c) => c.name === spec.name && Math.floor(-c.birthTurn / 4) === spec.age,
  );
}

export { WESTEROS_NAMES };
