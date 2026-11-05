/**
 * Le récit de Westeros (mode Trône de fer) : un fil guidé qui peut dévier. Les grands moments
 * de la saison 1 à 4 arrivent presque toujours (Tyrion arrêté, la chasse de Robert, la chute
 * de Ned, les prétendants, le Nord et les Îles qui se proclament, l'ombre de Renly, les Noces
 * pourpres et rouges), mais seulement si leurs acteurs sont vivants et à leur place ; quand le
 * joueur est l'un d'eux, une carte de choix remplace le tirage et peut changer l'issue.
 *
 * L'avancement est gardé dans `state.flags` (clés `recit_*`, valeur : saison), et les guerres
 * du récit sous `recit_guerre:<id>` : la Guerre des Cinq Rois s'achève quand plus aucune ne dure.
 */
import { BALANCE } from '../../data/balance';
import { HOUSES } from '../../data/westeros/houses';
import { addOpinion, atWar } from '../characters';
import { killCharacter } from '../characters/lifecycle';
import { chronicle, clamp, notify, worldNews, type Ctx } from '../context';
import { celebrateMarriage, marriageBlock } from '../diplomacy';
import type { EventDef } from '../events/types';
import { countyRuler, vassalsOf } from '../realm';
import type { Character, GameState, War } from '../state';
import { declareWar, endWar, joinWar, transferCounty } from '../war';

const S = BALANCE.story;

// ---------------------------------------------------------------------------
// Outils
// ---------------------------------------------------------------------------

const flags = (state: GameState) => (state.flags ??= {});
export const storyHas = (state: GameState, k: string) => state.flags?.[`recit_${k}`] !== undefined;
const mark = (state: GameState, k: string) => (flags(state)[`recit_${k}`] = state.turn);
const since = (state: GameState, k: string) =>
  state.turn - (state.flags?.[`recit_${k}`] ?? state.turn);

/** Un personnage nommé du scénario, retrouvé par sa clé (vivant ou non). */
export function named(state: GameState, key: string): Character | undefined {
  const spec = HOUSES.flatMap((h) => h.members).find((x) => x.key === key);
  if (!spec) return undefined;
  return Object.values(state.characters).find(
    (c) => c.name === spec.name && Math.floor(-c.birthTurn / 4) === spec.age,
  );
}
const live = (state: GameState, key: string) => {
  const c = named(state, key);
  return c?.alive ? c : undefined;
};

const kingOf = (state: GameState) => {
  const id = state.kingdoms.k_couronnes?.holderId;
  const c = id ? state.characters[id] : undefined;
  return c?.alive ? c : undefined;
};

/** Le seigneur qui tient ce comté en propre, s'il est de cette maison. */
function lordAt(state: GameState, county: string, dyn: string): Character | undefined {
  const id = state.counties[county]?.holderId;
  const c = id ? state.characters[id] : undefined;
  return c?.alive && c.dynastyId === dyn ? c : undefined;
}
const starkLord = (state: GameState) => lordAt(state, 'winterfell', 'y_stark');
const tullyLord = (state: GameState) => lordAt(state, 'vivesaigues', 'y_tully');
const lannisterLord = (state: GameState) => lordAt(state, 'castral_roc', 'y_lannister');
const tyrellLord = (state: GameState) => lordAt(state, 'hautjardin', 'y_tyrell');
const greyjoyLord = (state: GameState) => lordAt(state, 'pyk', 'y_greyjoy');
const freyLord = (state: GameState) => lordAt(state, 'jumeaux', 'y_frey');

const isPlayer = (state: GameState, c: Character | undefined) => !!c && c.id === state.playerId;

/** Un fils ou une fille de Cersei sur le trône : celui que Stannis dit bâtard. */
function bastardKing(state: GameState): Character | undefined {
  const king = kingOf(state);
  const cersei = named(state, 'cersei');
  return king && cersei && king.motherId === cersei.id ? king : undefined;
}

/** Une guerre du récit ; `fiveKings` : elle compte dans la Guerre des Cinq Rois. */
function tagWar(state: GameState, w: War | undefined, fiveKings = true): War | undefined {
  if (!w) return undefined;
  flags(state)[`recit_guerre:${w.id}`] = state.turn;
  if (fiveKings && !storyHas(state, 'cinq_rois')) mark(state, 'cinq_rois');
  return w;
}

/** Guerres du récit encore en cours. */
export function storyWars(state: GameState): War[] {
  return Object.keys(state.flags ?? {})
    .filter((k) => k.startsWith('recit_guerre:'))
    .map((k) => state.wars[k.slice('recit_guerre:'.length)])
    .filter((w): w is War => !!w);
}

/** Daenerys attend que Westeros s'épuise : la guerre finie, ou jamais commencée. */
export function westerosExhausted(state: GameState): boolean {
  return storyHas(state, 'paix') || !storyHas(state, 'cinq_rois');
}

function card(
  state: GameState,
  def: Omit<EventDef, 'declencheur' | 'poids'>,
  scope: Record<string, string> = {},
): void {
  state.pendingEvents.push({
    uid: `e${++state.nextId}`,
    eventId: def.id,
    scope: { souverain: state.playerId, ...scope },
    inline: { ...def, declencheur: { type: 'suite' }, poids: 0 },
  });
}

// ---------------------------------------------------------------------------
// Les faits du récit (appelés par le tirage ou par l'effet « recit » d'un choix)
// ---------------------------------------------------------------------------

/** Les Lannister lâchent la Montagne sur le Conflans. */
function lannisterRaid(ctx: Ctx): void {
  const { state } = ctx;
  const tywin = lannisterLord(state);
  const tully = tullyLord(state);
  if (!tywin || !tully || atWar(state, tywin.id, tully.id)) return;
  const target = state.counties.vierge_rose?.holderId === tully.id ? 'vierge_rose' : 'vivesaigues';
  const w = tagWar(state, declareWar(ctx, tywin.id, tully.id, 'conquete', target, true), false);
  if (!w) return;
  mark(state, 'raid');
  worldNews(
    state,
    `Pour venger l’enlèvement de Tyrion, ${tywin.name} Lannister lâche la Montagne sur le Conflans.`,
    'guerre',
    tywin.id,
  );
}

function robertDies(ctx: Ctx): void {
  const { state } = ctx;
  const robert = live(state, 'robert');
  mark(state, 'robert');
  if (!robert) return;
  killCharacter(ctx, robert.id, 'éventré par un sanglier lors d’une chasse');
  worldNews(
    state,
    'Le roi Robert est mort, éventré par un sanglier. On murmure que le vin de son écuyer était trop fort.',
    'deces',
  );
  chronicle(
    state,
    'Le roi Robert meurt à la chasse ; son fils aîné hérite du Trône de fer.',
    'deces',
  );
}

function nedExecuted(ctx: Ctx): void {
  const { state } = ctx;
  const ned = live(state, 'ned');
  mark(state, 'ned_mort');
  if (!ned) return;
  const king = kingOf(state);
  killCharacter(
    ctx,
    ned.id,
    `décapité sur les marches du Grand Septuaire${king ? `, sur ordre de ${king.name}` : ''}`,
  );
  worldNews(
    state,
    `Eddard Stark, accusé de trahison, est décapité sur les marches du Grand Septuaire de Baelor.`,
    'deces',
  );
}

/** Le Nord se proclame indépendant (le Conflans le suit). */
function northRises(ctx: Ctx): void {
  const { state } = ctx;
  const king = kingOf(state);
  const stark = starkLord(state);
  mark(state, 'nord');
  if (!king || !stark || stark.liegeId !== king.id) return;
  const w = tagWar(state, declareWar(ctx, stark.id, king.id, 'independance', undefined, true));
  if (!w) return;
  worldNews(
    state,
    `Les seigneurs du Nord tirent l’épée et acclament ${stark.name} Stark : « Le Roi du Nord ! »`,
    'revolte',
    stark.id,
  );
  const tully = tullyLord(state);
  if (tully && tully.id !== state.playerId && tully.liegeId === king.id) {
    joinWar(state, w.id, tully.id, 'attacker');
    worldNews(state, `${tully.name} Tully se range aux côtés du Nord.`, 'guerre', tully.id);
  } else if (isPlayer(state, tully))
    card(
      state,
      {
        id: 'got_tully_nord',
        titre: 'Le Conflans et le Nord',
        texte:
          '{rival.nom} Stark s’est proclamé Roi du Nord et marche vers le sud. Il vous demande vos épées : le Conflans brûle déjà sous les Lannister.',
        categorie: 'guerre',
        choix: [
          {
            libelle: 'Rejoindre le Roi du Nord',
            effets: [
              { recit: 'tully_nord' },
              { opinion: { cible: 'rival', valeur: 30, raison: 'Fidèle au Nord' } },
            ],
          },
          {
            libelle: 'Rester fidèle au Trône de fer',
            effets: [{ opinion: { cible: 'rival', valeur: -30, raison: 'A abandonné le Nord' } }],
          },
        ],
      },
      { rival: stark.id },
    );
}

/** Un frère de Robert se proclame roi : il rompt son hommage et marche sur Port-Réal. */
function claimThrone(ctx: Ctx, key: 'stannis' | 'renly'): void {
  const { state } = ctx;
  const king = kingOf(state);
  const c = live(state, key);
  mark(state, key);
  if (!king || !c || c.id === king.id) return;
  c.liegeId = undefined;
  c.inFaction = false;
  const w = tagWar(state, declareWar(ctx, c.id, king.id, 'conquete', 'port_real', true));
  if (!w) return;
  if (key === 'stannis') {
    worldNews(
      state,
      `Stannis Baratheon se proclame roi et écrit à tout le royaume : ${king.name} est né de l’inceste de la reine et de son frère.`,
      'revolte',
      c.id,
    );
    const kin = state.characters[king.motherId ?? '']?.dynastyId;
    for (const v of vassalsOf(state, king.id))
      if (state.characters[v]?.dynastyId !== kin)
        addOpinion(state, v, king.id, 'Né de l’inceste, dit Stannis', S.bastardOpinion, 24);
  } else {
    worldNews(
      state,
      'Renly Baratheon se fait couronner à Hautjardin : le Bief et l’Orage l’acclament.',
      'revolte',
      c.id,
    );
    const mace = tyrellLord(state);
    if (mace && mace.id !== state.playerId && mace.liegeId === king.id) tyrellForRenly(ctx);
    else if (isPlayer(state, mace))
      card(
        state,
        {
          id: 'got_renly_tyrell',
          titre: 'Le roi de l’été',
          texte:
            'Renly s’est couronné à Hautjardin. Il vous demande vos cent mille épées, et la main de Margaery : votre petite-fille serait reine.',
          categorie: 'guerre',
          choix: [
            {
              libelle: 'Soutenir Renly : Margaery l’épousera',
              effets: [
                { recit: 'tyrell_renly' },
                { opinion: { cible: 'rival', valeur: 40, raison: 'Ses épées et sa reine' } },
              ],
            },
            {
              libelle: 'Rester fidèle au Trône de fer',
              effets: [{ opinion: { cible: 'rival', valeur: -30, raison: 'L’a éconduit' } }],
            },
          ],
        },
        { rival: c.id },
      );
  }
}

function tyrellForRenly(ctx: Ctx): void {
  const { state } = ctx;
  const renly = live(state, 'renly');
  const mace = tyrellLord(state);
  const king = kingOf(state);
  if (!renly || !mace || !king) return;
  const w = Object.values(state.wars).find(
    (x) => x.attackerId === renly.id && x.defenderId === king.id,
  );
  if (w) {
    mace.liegeId = renly.id;
    joinWar(state, w.id, mace.id, 'attacker');
  }
  const marg = live(state, 'margaery');
  if (marg && !marg.spouseId && !renly.spouseId) celebrateMarriage(ctx, renly.id, marg.id);
  worldNews(state, 'Les Tyrell jurent fidélité à Renly ; Margaery devient sa reine.', 'alliance');
}

/** Balon ceint la couronne de sel et lance ses boutres sur le Nord. */
function ironborn(ctx: Ctx): void {
  const { state } = ctx;
  const balon = greyjoyLord(state);
  mark(state, 'fer');
  if (!balon) return;
  balon.liegeId = undefined;
  balon.inFaction = false;
  worldNews(
    state,
    `${balon.name} Greyjoy ceint la couronne de sel : les boutres des Fer-nés font voile vers le Nord.`,
    'revolte',
    balon.id,
  );
  const target = ['cote_pierreuse', 'moat_cailin', 'bois_loups'].find((id) => {
    const c = state.counties[id];
    return c && countyRuler(state, c) !== balon.id;
  });
  if (!target) return;
  const victim = countyRuler(state, state.counties[target]);
  if (victim && victim !== balon.id)
    tagWar(state, declareWar(ctx, balon.id, victim, 'conquete', target, true));
}

/** Renly meurt, et les Tyrell passent aux Lannister. */
function shadowKills(ctx: Ctx): void {
  const { state } = ctx;
  const renly = live(state, 'renly');
  mark(state, 'renly_mort');
  if (!renly) return;
  killCharacter(ctx, renly.id, 'poignardé par une ombre qui avait le visage de Stannis');
  worldNews(
    state,
    'Renly Baratheon est mort dans sa tente, poignardé par une ombre. Ses seigneurs se dispersent.',
    'deces',
  );
  const mace = tyrellLord(state);
  if (mace && mace.id !== state.playerId) tyrellToLannister(ctx);
  else if (isPlayer(state, mace)) {
    const king = kingOf(state);
    if (king)
      card(
        state,
        {
          id: 'got_alliance_lannister',
          titre: 'Une rose pour le lion',
          texte:
            'Renly est mort. Tywin Lannister vous propose la paix, et la couronne pour Margaery : elle épouserait {rival.nom}, le roi.',
          categorie: 'cour',
          choix: [
            {
              libelle: 'Marier Margaery au roi',
              effets: [
                { recit: 'mariage_margaery' },
                { prestige: 80 },
                { opinion: { cible: 'rival', valeur: 30, raison: 'Bientôt sa reine' } },
              ],
            },
            {
              libelle: 'Refuser : le Bief restera libre',
              effets: [{ opinion: { cible: 'rival', valeur: -20, raison: 'A refusé sa main' } }],
            },
          ],
        },
        { rival: king.id },
      );
  }
}

function tyrellToLannister(ctx: Ctx): void {
  const { state } = ctx;
  const mace = tyrellLord(state);
  const king = kingOf(state);
  if (!mace || !king) return;
  for (const w of Object.values(state.wars)) {
    w.attackerAllies = w.attackerAllies.filter((x) => x !== mace.id);
    if (w.attackerId === mace.id && w.defenderId === king.id) endWar(ctx, w.id, 'blanche');
  }
  mace.liegeId = king.id;
  const stannis = live(state, 'stannis');
  const sw = stannis
    ? Object.values(state.wars).find((x) => x.attackerId === stannis.id && x.defenderId === king.id)
    : undefined;
  if (sw) joinWar(state, sw.id, mace.id, 'defender');
  royalWedding(ctx);
  worldNews(
    state,
    `Les Tyrell rejoignent les Lannister${storyHas(state, 'margaery') ? ` : Margaery épouse ${king.name}` : ` : Margaery est promise à ${king.name}`}.`,
    'alliance',
    mace.id,
  );
}

/** Margaery épouse le roi, ou lui est promise s'il est trop jeune (les noces viendront). */
function royalWedding(ctx: Ctx): void {
  const { state } = ctx;
  const king = kingOf(state);
  const marg = live(state, 'margaery');
  if (!king || !marg) return;
  const block = marriageBlock(state, king, marg);
  if (!block) {
    celebrateMarriage(ctx, king.id, marg.id);
    mark(state, 'margaery');
  } else if (block === 'Trop jeune') mark(state, 'fiance');
}

function purpleWedding(ctx: Ctx): void {
  const { state } = ctx;
  const king = kingOf(state);
  mark(state, 'pourpres');
  if (!king) return;
  killCharacter(ctx, king.id, 'empoisonné à son propre festin de noces');
  worldNews(
    state,
    `${king.name} meurt à son festin de noces, le visage violet, une coupe de vin à la main. Tyrion est accusé.`,
    'deces',
  );
  const tyrion = live(state, 'tyrion');
  const heir = kingOf(state);
  if (tyrion && heir && tyrion.id !== state.playerId) tyrion.imprisonedBy = heir.id;
}

function redWedding(ctx: Ctx): void {
  const { state } = ctx;
  const stark = starkLord(state);
  const king = kingOf(state);
  mark(state, 'rouges');
  if (!stark) return;
  const w = Object.values(state.wars).find(
    (x) => x.attackerId === stark.id && x.cb === 'independance',
  );
  const cat = live(state, 'catelyn');
  killCharacter(ctx, stark.id, 'assassiné aux Noces rouges');
  if (cat) killCharacter(ctx, cat.id, 'égorgée aux Noces rouges');
  worldNews(
    state,
    `Aux Jumeaux, les Frey massacrent leurs invités : ${stark.name} Stark meurt aux Noces rouges.`,
    'deces',
  );
  if (w && state.wars[w.id]) endWar(ctx, w.id, 'defenseur');
  const roose = live(state, 'roose');
  if (!roose || !king || !state.counties.winterfell) return;
  const heirId = state.counties.winterfell.holderId;
  transferCounty(state, 'winterfell', roose.id);
  if (state.duchies.d_nord) state.duchies.d_nord.holderId = roose.id;
  roose.liegeId = king.id;
  for (const v of Object.values(state.characters))
    if (v.alive && v.liegeId === heirId && v.id !== roose.id) v.liegeId = roose.id;
  worldNews(
    state,
    `Pour prix de sa trahison, Roose Bolton reçoit Winterfell et devient Gouverneur du Nord.`,
    'titre',
    roose.id,
  );
}

// ---------------------------------------------------------------------------
// Effet « recit » : les choix du joueur
// ---------------------------------------------------------------------------

export const STORY_EFFECTS: Record<string, string> = {
  tyrion_arrete: 'Tyrion est arrêté ; les Lannister ripostent',
  lannister_conflans: 'Guerre contre les Tully',
  robert_mort: 'Le roi meurt',
  ned_execute: 'Eddard Stark est décapité',
  ned_fuite: 'Fuite vers le Nord',
  ned_genou: 'Le Nord reste fidèle',
  nord_independance: 'Guerre d’indépendance du Nord',
  tully_nord: 'Rejoindre la guerre du Nord',
  stannis_roi: 'Se proclamer roi : guerre pour le Trône de fer',
  renly_roi: 'Se proclamer roi : guerre pour le Trône de fer',
  tyrell_renly: 'Rejoindre Renly ; Margaery l’épouse',
  mariage_margaery: 'Margaery épouse le roi',
  fer_roi: 'Indépendance des Îles et guerre contre le Nord',
  renly_ombre: 'Renly meurt',
  joffrey_poison: 'Le roi meurt empoisonné',
  noces_rouges: 'Les Noces rouges',
};

export function applyStoryEffect(ctx: Ctx, id: string): void {
  const { state } = ctx;
  switch (id) {
    case 'tyrion_arrete':
      worldNews(
        state,
        'Catelyn Stark fait arrêter Tyrion Lannister à l’auberge du Carrefour.',
        'fait',
      );
      lannisterRaid(ctx);
      break;
    case 'lannister_conflans':
      lannisterRaid(ctx);
      break;
    case 'robert_mort':
      robertDies(ctx);
      break;
    case 'ned_execute':
      nedExecuted(ctx);
      break;
    case 'ned_fuite':
      mark(state, 'ned_fuite');
      break;
    case 'ned_genou':
      mark(state, 'ned_genou');
      mark(state, 'nord');
      break;
    case 'nord_independance':
      northRises(ctx);
      break;
    case 'tully_nord': {
      const stark = starkLord(state);
      const w = stark
        ? Object.values(state.wars).find(
            (x) => x.attackerId === stark.id && x.cb === 'independance',
          )
        : undefined;
      if (w) joinWar(state, w.id, state.playerId, 'attacker');
      break;
    }
    case 'stannis_roi':
      claimThrone(ctx, 'stannis');
      break;
    case 'renly_roi':
      claimThrone(ctx, 'renly');
      break;
    case 'tyrell_renly':
      tyrellForRenly(ctx);
      break;
    case 'mariage_margaery':
      tyrellToLannister(ctx);
      break;
    case 'fer_roi':
      ironborn(ctx);
      break;
    case 'renly_ombre':
      shadowKills(ctx);
      break;
    case 'joffrey_poison':
      purpleWedding(ctx);
      break;
    case 'noces_rouges':
      redWedding(ctx);
      break;
  }
}

// ---------------------------------------------------------------------------
// La saison du récit
// ---------------------------------------------------------------------------

export function seasonStory(ctx: Ctx): void {
  const { state, rng } = ctx;
  if (state.scenario !== 'westeros') return;
  const t = state.turn;

  // 1. Catelyn arrête Tyrion : le Conflans brûle.
  if (!storyHas(state, 'tyrion') && t >= S.tyrionFrom && rng.chance(S.tyrionChance)) {
    const tyrion = live(state, 'tyrion');
    const tywin = lannisterLord(state);
    const tully = tullyLord(state);
    if (tyrion && tywin && tully) {
      mark(state, 'tyrion');
      const stark = starkLord(state);
      if (isPlayer(state, stark))
        card(
          state,
          {
            id: 'got_tyrion_auberge',
            titre: 'Le Lutin à l’auberge',
            texte:
              'Sur la route du Conflans, Catelyn reconnaît Tyrion Lannister dans une auberge du Carrefour. Le poignard qui a failli tuer Bran lui appartenait, dit Littlefinger. Il suffit d’un mot pour que les chevaliers présents l’arrêtent.',
            categorie: 'intrigue',
            choix: [
              {
                libelle: 'Le faire arrêter',
                effets: [{ recit: 'tyrion_arrete' }, { prestige: 40 }],
              },
              {
                libelle: 'Le laisser passer : pas sans preuve',
                effets: [{ stress: { juste: -5, '*': 5 } }],
              },
            ],
          },
          { ennemi: tywin.id },
        );
      else if (isPlayer(state, tywin))
        card(state, {
          id: 'got_tyrion_enleve',
          titre: 'Votre fils enlevé',
          texte:
            'Catelyn Stark a fait arrêter Tyrion à l’auberge du Carrefour ; on l’emmène aux Eyrié, accusé d’avoir voulu tuer Bran. Une maison qui laisse enlever les siens n’est plus une maison.',
          categorie: 'guerre',
          choix: [
            {
              libelle: 'Lâcher la Montagne sur le Conflans',
              effets: [{ recit: 'lannister_conflans' }, { prestige: 30 }],
            },
            {
              libelle: 'Négocier sa libération',
              effets: [
                { or: -100 },
                { prestige: -40 },
                { xp: { competence: 'diplomatie', valeur: 30 } },
              ],
            },
          ],
        });
      else applyStoryEffect(ctx, 'tyrion_arrete');
    }
  }

  // 2. La chasse de Robert.
  const robert = named(state, 'robert');
  if (!storyHas(state, 'robert')) {
    if (robert && !robert.alive) mark(state, 'robert');
    else if (robert && kingOf(state)?.id === robert.id && t >= S.huntFrom) {
      if (isPlayer(state, robert)) {
        if ((t - S.huntFrom) % S.huntEvery === 0)
          card(state, {
            id: 'got_chasse',
            titre: 'La chasse au sanglier',
            texte:
              'Le Bois-du-Roi regorge de sangliers, et votre écuyer Lancel remplit votre coupe sans qu’on le lui demande. Une journée de chasse, voilà ce qu’il faut à un roi lassé des comptes de Littlefinger.',
            categorie: 'cour',
            choix: [
              {
                libelle: 'Partir chasser',
                effets: [
                  {
                    hasard: {
                      chance: S.huntSurvive,
                      competence: 'guerre',
                      succes: [{ prestige: 30 }, { stress: -15 }],
                      echec: [{ recit: 'robert_mort' }],
                      texte_succes: 'Le sanglier rôtit ce soir à la broche.',
                      texte_echec: 'Le sanglier vous a ouvert le ventre.',
                    },
                  },
                ],
              },
              {
                libelle: 'Rester à Port-Réal',
                effets: [{ stress: 15 }, { prestige: -10 }],
              },
            ],
          });
      } else {
        const p = clamp(S.huntBase + S.huntStep * (t - S.huntFrom), 0, 1);
        if (rng.chance(p)) robertDies(ctx);
      }
    }
  }
  if (!storyHas(state, 'robert')) return;

  // 3. La chute de Ned, la saison suivant la mort du roi.
  const fl = state.flags ?? {};
  const nedHand =
    fl.main_du_roi !== undefined ||
    fl.main_ned !== undefined ||
    (fl.main_tywin === undefined &&
      fl.main_lannister === undefined &&
      state.characters[state.playerId]?.dynastyId !== 'y_stark');
  if (!storyHas(state, 'ned') && since(state, 'robert') >= 1) {
    mark(state, 'ned');
    const ned = live(state, 'ned');
    const king = bastardKing(state);
    if (ned && king && ned.id !== king.id) {
      if (isPlayer(state, ned) && nedHand)
        card(
          state,
          {
            id: 'got_trahison_ned',
            titre: 'La vérité sur {rival.nom}',
            texte:
              'Robert est mort, et vous savez ce que Jon Arryn avait découvert : {rival.nom} n’est pas son fils. Les manteaux d’or de Littlefinger vous ont promis leur aide. La reine, elle, a déjà fait couronner son fils.',
            categorie: 'intrigue',
            choix: [
              {
                libelle: 'Dénoncer le bâtard devant la cour',
                effets: [
                  {
                    hasard: {
                      chance: S.nedEscape,
                      competence: 'ruse',
                      succes: [{ prestige: 60 }, { recit: 'ned_fuite' }],
                      echec: [{ recit: 'ned_execute' }],
                      texte_succes:
                        'Les manteaux d’or hésitent ; vous fendez la foule et chevauchez vers le nord.',
                      texte_echec:
                        'Littlefinger vous trahit : « Je vous avais dit de ne pas me faire confiance. »',
                    },
                  },
                ],
              },
              {
                libelle: 'Fuir vers le Nord avant le couronnement',
                effets: [{ prestige: -60 }, { recit: 'ned_fuite' }],
              },
              {
                libelle: 'Plier le genou et taire le secret',
                effets: [
                  { prestige: -100 },
                  { stress: { juste: 15, '*': 15 } },
                  { opinion: { cible: 'rival', valeur: 20, raison: 'A plié le genou' } },
                  { recit: 'ned_genou' },
                ],
              },
            ],
          },
          { rival: king.id },
        );
      else if (isPlayer(state, ned))
        card(
          state,
          {
            id: 'got_hommage_nord',
            titre: 'Le nouveau roi',
            texte:
              'Un corbeau de Port-Réal : {rival.nom} est roi et exige votre hommage. Un autre, de Peyredragon : Stannis affirme que ce roi est le bâtard de la reine et de son frère.',
            categorie: 'vassaux',
            choix: [
              { libelle: 'Se proclamer Roi du Nord', effets: [{ recit: 'nord_independance' }] },
              {
                libelle: 'Plier le genou',
                effets: [
                  { opinion: { cible: 'rival', valeur: 15, raison: 'Hommage du Nord' } },
                  { recit: 'ned_genou' },
                ],
              },
            ],
          },
          { rival: king.id },
        );
      else if (nedHand) {
        if (rng.chance(S.nedExecution)) nedExecuted(ctx);
        else {
          mark(state, 'ned_fuite');
          worldNews(state, 'Eddard Stark a fui Port-Réal et regagne le Nord.', 'fait', ned.id);
        }
      } else mark(state, 'ned_nord');
    } else if (!king) mark(state, 'nord');
    else mark(state, 'ned_nord');
  }

  // 4. Le Nord se soulève.
  const king = kingOf(state);
  if (storyHas(state, 'ned') && !storyHas(state, 'nord') && since(state, 'ned') >= 1) {
    const stark = starkLord(state);
    const rise =
      storyHas(state, 'ned_mort') ||
      storyHas(state, 'ned_fuite') ||
      (storyHas(state, 'ned_nord') && rng.chance(S.northRiseWithoutNed));
    if (!rise || !stark || !king || stark.liegeId !== king.id) mark(state, 'nord');
    else if (isPlayer(state, stark)) {
      mark(state, 'nord');
      card(
        state,
        {
          id: 'got_roi_nord',
          titre: 'Le Nord se souvient',
          texte: storyHas(state, 'ned_mort')
            ? 'Votre père a été décapité comme un traître devant tout Port-Réal. Dans la grande salle de Winterfell, le Lard-Jon frappe la table : « Pourquoi plier le genou devant un roi du Sud ? »'
            : 'Le Sud se déchire pour un trône de fer. Dans la grande salle de Winterfell, le Lard-Jon frappe la table : « Pourquoi plier le genou devant un roi du Sud ? »',
          categorie: 'guerre',
          choix: [
            { libelle: 'Se proclamer Roi du Nord', effets: [{ recit: 'nord_independance' }] },
            {
              libelle: 'Demander justice et rester fidèle',
              effets: [{ prestige: -40 }, { opinion_vassaux: -15 }],
            },
          ],
        },
        { rival: king.id },
      );
    } else northRises(ctx);
  }

  // 5. Les prétendants : Stannis et Renly.
  const bastard = bastardKing(state);
  if (bastard && since(state, 'robert') >= S.claimDelay)
    for (const key of ['stannis', 'renly'] as const) {
      if (storyHas(state, key)) continue;
      const c = live(state, key);
      if (!c || c.liegeId !== bastard.id) {
        mark(state, key);
        continue;
      }
      if (isPlayer(state, c)) {
        mark(state, key);
        card(
          state,
          {
            id: `got_pretendant_${key}`,
            titre: 'Le trône de votre frère',
            texte:
              key === 'stannis'
                ? 'Robert est mort, et le garçon qu’on a couronné est le bâtard de Jaime Lannister. Selon la loi, le Trône de fer vous revient. Mélisandre a vu votre victoire dans les flammes.'
                : 'Robert est mort, Stannis n’a pas d’amis et {rival.nom} n’a que treize ans. Les Tyrell vous offrent cent mille épées : pourquoi pas vous ?',
            categorie: 'guerre',
            choix: [
              { libelle: 'Se proclamer roi', effets: [{ recit: `${key}_roi` }, { prestige: 50 }] },
              {
                libelle: 'Plier le genou',
                effets: [{ opinion: { cible: 'rival', valeur: 20, raison: 'Un oncle loyal' } }],
              },
            ],
          },
          { rival: bastard.id },
        );
      } else if (rng.chance(key === 'stannis' ? S.stannisChance : S.renlyChance))
        claimThrone(ctx, key);
    }

  // 6. Les Îles de Fer.
  if (
    storyHas(state, 'cinq_rois') &&
    !storyHas(state, 'fer') &&
    since(state, 'cinq_rois') >= S.greyjoyDelay &&
    rng.chance(S.greyjoyChance)
  ) {
    const balon = greyjoyLord(state);
    if (!balon || !balon.liegeId) mark(state, 'fer');
    else if (isPlayer(state, balon)) {
      mark(state, 'fer');
      card(state, {
        id: 'got_couronne_sel',
        titre: 'La couronne de bois flotté',
        texte:
          'Le royaume se déchire : loups, lions et cerfs s’entre-tuent. Le Nord a vidé ses châteaux pour marcher au sud. Jamais le Fer-né n’aura de meilleure occasion de payer le prix du fer.',
        categorie: 'guerre',
        choix: [
          {
            libelle: 'Ceindre la couronne de sel et frapper le Nord',
            effets: [{ recit: 'fer_roi' }, { prestige: 60 }],
          },
          { libelle: 'Attendre son heure', effets: [{ stress: 10 }] },
        ],
      });
    } else ironborn(ctx);
  }

  // 7. L'ombre de Renly.
  const renly = live(state, 'renly');
  const stannis = live(state, 'stannis');
  if (
    !storyHas(state, 'ombre') &&
    renly &&
    stannis &&
    king &&
    atWar(state, renly.id, king.id) &&
    atWar(state, stannis.id, king.id) &&
    since(state, 'renly') >= S.shadowDelay &&
    rng.chance(S.shadowChance)
  ) {
    mark(state, 'ombre');
    if (isPlayer(state, renly))
      card(
        state,
        {
          id: 'got_ombre',
          titre: 'Une ombre dans la tente',
          texte:
            'À la veille de la bataille contre {rival.nom}, la flamme des chandelles se couche sans un souffle de vent. Brienne, à l’entrée de votre tente, jure avoir vu une ombre passer.',
          categorie: 'intrigue',
          choix: [
            {
              libelle: 'Faire fouiller le camp',
              effets: [
                {
                  hasard: {
                    chance: S.shadowSurvive,
                    competence: 'ruse',
                    succes: [{ prestige: 20 }],
                    echec: [{ recit: 'renly_ombre' }],
                    texte_succes: 'L’ombre s’est dissipée ; vous vivrez pour voir la bataille.',
                    texte_echec: 'L’ombre avait le visage de votre frère.',
                  },
                },
              ],
            },
          ],
        },
        { rival: stannis.id },
      );
    else shadowKills(ctx);
  }

  // 8. Les Noces pourpres (après les noces royales, différées si le roi était trop jeune).
  if (storyHas(state, 'fiance') && !storyHas(state, 'margaery')) royalWedding(ctx);
  const k2 = kingOf(state);
  const marg = live(state, 'margaery');
  if (
    storyHas(state, 'margaery') &&
    !storyHas(state, 'pourpres') &&
    k2 &&
    marg &&
    k2.spouseId === marg.id &&
    since(state, 'margaery') >= S.purpleDelay &&
    rng.chance(S.purpleChance)
  ) {
    if (isPlayer(state, k2)) {
      mark(state, 'pourpres');
      card(state, {
        id: 'got_noces_pourpres',
        titre: 'Le festin de noces',
        texte:
          'Le festin de vos noces dure depuis l’aube : soixante-dix-sept plats, des nains qui joutent, et une coupe de vin qu’on vous tend avec un sourire. Votre oncle Tyrion vous a servi lui-même.',
        categorie: 'cour',
        choix: [
          {
            libelle: 'Boire à la santé de la reine',
            effets: [
              {
                hasard: {
                  chance: S.purpleSurvive,
                  succes: [{ prestige: 20 }],
                  echec: [{ recit: 'joffrey_poison' }],
                  texte_succes: 'Le vin était bon.',
                  texte_echec: 'Vous portez la main à votre gorge : le vin brûle.',
                },
              },
            ],
          },
          { libelle: 'Faire goûter le vin', effets: [{ prestige: -30 }, { stress: 10 }] },
        ],
      });
    } else purpleWedding(ctx);
  }

  // 9. Les Noces rouges.
  const stark = starkLord(state);
  const walder = freyLord(state);
  const northWar =
    stark &&
    Object.values(state.wars).find((x) => x.attackerId === stark.id && x.cb === 'independance');
  if (
    northWar &&
    walder &&
    !storyHas(state, 'rouges') &&
    t - northWar.startTurn >= S.redDelay &&
    rng.chance(S.redChance)
  ) {
    mark(state, 'rouges');
    if (isPlayer(state, walder))
      card(
        state,
        {
          id: 'got_offre_tywin',
          titre: 'Une offre de Tywin',
          texte:
            '{rival.nom} Stark a rompu sa promesse d’épouser une de vos filles. Tywin Lannister vous écrit : si le Roi du Nord ne quittait jamais les Jumeaux, vous seriez seigneur du Conflans, et riche.',
          categorie: 'intrigue',
          choix: [
            {
              libelle: 'Préparer les noces',
              effets: [
                { recit: 'noces_rouges' },
                { or: S.redGold },
                { piete: -80 },
                { prestige: -50 },
              ],
            },
            {
              libelle: 'Un Frey ne trahit pas son hôte',
              effets: [{ opinion: { cible: 'rival', valeur: 30, raison: 'L’a reçu en ami' } }],
            },
          ],
        },
        { rival: stark.id },
      );
    else if (isPlayer(state, stark))
      card(
        state,
        {
          id: 'got_invitation_jumeaux',
          titre: 'L’invitation des Jumeaux',
          texte:
            '{rival.nom} Frey vous pardonne d’avoir rompu votre promesse : votre oncle Edmure épousera sa fille, et ses épées vous reviendront. Il vous invite aux noces, sous son toit, protégé par les lois de l’hospitalité.',
          categorie: 'intrigue',
          choix: [
            {
              libelle: 'Se rendre aux noces',
              effets: [
                {
                  hasard: {
                    chance: S.redSurvive,
                    competence: 'ruse',
                    succes: [{ prestige: 40 }, { levees: 400 }],
                    echec: [{ recit: 'noces_rouges' }],
                    texte_succes:
                      'Vous avez flairé le piège à temps : les musiciens portaient des cottes de mailles.',
                    texte_echec: 'On joue « Les Pluies de Castamere ». Les portes se ferment.',
                  },
                },
              ],
            },
            {
              libelle: 'Décliner l’invitation',
              effets: [
                { opinion: { cible: 'rival', valeur: -40, raison: 'A refusé ses noces' } },
                { prestige: -20 },
              ],
            },
          ],
        },
        { rival: walder.id },
      );
    else redWedding(ctx);
  }

  // 10. Les guerres s'épuisent : au bout de quelques années, chacun rentre chez soi.
  for (const w of storyWars(state)) {
    if (w.attackerId === w.defenderId) {
      endWar(ctx, w.id, 'blanche');
      continue;
    }
    if (t - w.startTurn < S.warExhaustion) continue;
    const outcome =
      w.score >= S.exhaustionScore
        ? 'attaquant'
        : w.score <= -S.exhaustionScore
          ? 'defenseur'
          : 'blanche';
    worldNews(state, `Épuisés, les belligérants mettent fin à la guerre : ${w.name}.`, 'paix');
    endWar(ctx, w.id, outcome);
  }

  // 11. Fin de la Guerre des Cinq Rois.
  if (storyHas(state, 'cinq_rois') && !storyHas(state, 'paix') && !storyWars(state).length) {
    mark(state, 'paix');
    const k = kingOf(state);
    worldNews(
      state,
      `La Guerre des Cinq Rois s’achève${k ? ` : ${k.name} tient le Trône de fer` : ''}. Le royaume est exsangue.`,
      'paix',
    );
    if (k?.id === state.playerId || state.characters[state.playerId]?.liegeId === k?.id)
      notify(
        state,
        'La Guerre des Cinq Rois est finie ; on dit qu’en Essos, des dragons grandissent.',
      );
  }
}

/** Quelques mots pour l'écran Monde : où en est le royaume. */
export function storyStatus(state: GameState): string[] {
  const out: string[] = [];
  if (!storyHas(state, 'robert')) out.push('Le roi Robert règne encore.');
  else if (storyHas(state, 'cinq_rois') && !storyHas(state, 'paix')) {
    const n = storyWars(state).length;
    out.push(`La Guerre des Cinq Rois fait rage (${n} guerre${n > 1 ? 's' : ''} en cours).`);
  } else if (storyHas(state, 'paix')) out.push('La Guerre des Cinq Rois est finie.');
  return out;
}
