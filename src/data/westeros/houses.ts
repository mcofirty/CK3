/**
 * Maisons de Westeros au début de la saison 1 (an 298 après la Conquête) : familles, âges
 * (ceux de la série), sièges et liens de vassalité. Compétences : diplomatie, guerre, gestion,
 * ruse, savoir.
 */
import type { UnitCounts } from '../../engine/state';
import type { RegionId } from './geography';

export interface WMember {
  /** Identifiant unique dans tout le scénario. */
  key: string;
  name: string;
  female?: boolean;
  age: number;
  /** Maison de naissance (dynastie) ; `null` : sans maison (bâtard, roturier). Défaut : la maison de l'entrée. */
  house?: string | null;
  father?: string;
  mother?: string;
  spouse?: string;
  /** Enfant illégitime : son père est connu mais il n'hérite pas. */
  bastard?: boolean;
  traits?: string[];
  skills?: [number, number, number, number, number];
  health?: number;
  /** Cour où il vit (clé d'un seigneur). Défaut : le chef de l'entrée. */
  court?: string;
  /** Mort avant le début de la partie (figure dans l'arbre). */
  dead?: string;
  /** A prononcé des vœux (Garde de Nuit, Garde royale, mestre) : n'hérite pas, ne se marie pas. */
  vows?: boolean;
  /** Otage retenu à la cour de ce seigneur. */
  hostageOf?: string;
}

export interface WHouse {
  id: string;
  /** Dynastie (défaut : `id`) ; les trois Baratheon partagent la même. */
  dynasty?: string;
  name: string;
  region: RegionId;
  /** Maison dont le chef est le suzerain du chef de celle-ci. */
  liege?: string;
  head: string;
  /** Comtés tenus en propre ; le premier est le siège. */
  counties: string[];
  /** Région dont le chef est le seigneur suzerain (duché du jeu). */
  duchy?: RegionId;
  /** Royaume tenu (le Trône de fer). */
  kingdom?: string;
  playable?: boolean;
  /** Présentation dans l'écran de choix. */
  blurb?: string;
  words?: string;
  color?: string;
  sigil?: string;
  metal?: string;
  gold?: number;
  prestige?: number;
  /** Loi agnatique (les femmes n'héritent pas). Défaut : oui, sauf à Dorne. */
  agnatic?: boolean;
  standing?: Partial<UnitCounts>;
  development?: number;
  members: WMember[];
}

const m = (key: string, name: string, age: number, extra: Partial<WMember> = {}): WMember => ({
  key,
  name,
  age,
  ...extra,
});
const f = (key: string, name: string, age: number, extra: Partial<WMember> = {}): WMember => ({
  key,
  name,
  age,
  female: true,
  ...extra,
});

export const HOUSES: WHouse[] = [
  // -------------------------------------------------------------------------
  // La Couronne
  // -------------------------------------------------------------------------
  {
    id: 'baratheon',
    name: 'Baratheon',
    region: 'couronne',
    head: 'robert',
    counties: ['port_real', 'bois_du_roi'],
    duchy: 'couronne',
    kingdom: 'k_couronnes',
    playable: true,
    blurb:
      'Robert Ier, roi des Sept Couronnes depuis quinze ans. Sa Main vient de mourir, le trésor est vide et la reine le hait.',
    words: 'Nôtre est la fureur',
    color: '#d9a520',
    sigil: 'stag',
    metal: '#1b1712',
    gold: 60,
    prestige: 900,
    standing: { piquiers: 600, archers: 400, infanterie: 400, cavalerie: 300 },
    development: 8,
    members: [
      m('robert', 'Robert', 38, {
        father: 'steffon',
        traits: ['ivrogne', 'courageux', 'genereux', 'impetueux', 'heros'],
        skills: [9, 16, 4, 4, 5],
        health: 52,
        spouse: 'cersei',
      }),
      f('cersei', 'Cersei', 34, {
        house: 'lannister',
        father: 'tywin',
        traits: ['ambitieux', 'cruel', 'intrigant'],
        skills: [11, 4, 9, 15, 8],
        court: 'robert',
      }),
      m('joffrey', 'Joffrey', 13, {
        father: 'robert',
        mother: 'cersei',
        traits: ['cruel', 'lache'],
        skills: [4, 6, 3, 6, 4],
      }),
      f('myrcella', 'Myrcella', 10, { father: 'robert', mother: 'cersei', traits: ['courtois'] }),
      m('tommen', 'Tommen', 8, { father: 'robert', mother: 'cersei', traits: ['genereux'] }),
      m('varys', 'Varys', 45, {
        house: null,
        traits: ['maitre_ombres', 'prudent'],
        skills: [14, 2, 10, 20, 15],
      }),
      m('baelish', 'Petyr', 33, {
        house: 'baelish',
        traits: ['ambitieux', 'intrigant', 'econome'],
        skills: [13, 4, 18, 18, 11],
      }),
      m('pycelle', 'Pycelle', 70, {
        house: null,
        vows: true,
        traits: ['erudit', 'lache'],
        skills: [8, 1, 9, 12, 16],
      }),
      m('barristan', 'Barristan', 60, {
        house: 'selmy',
        vows: true,
        traits: ['heros', 'juste', 'courageux'],
        skills: [8, 18, 6, 5, 8],
      }),
      m('jaime', 'Jaime', 34, {
        house: 'lannister',
        father: 'tywin',
        vows: true,
        traits: ['cavalier', 'courageux', 'impetueux'],
        skills: [8, 18, 7, 8, 6],
      }),
      m('sandor', 'Sandor', 30, {
        house: 'clegane',
        father: 'clegane_pere',
        traits: ['balafre', 'soldat', 'irascible'],
        skills: [3, 16, 3, 6, 4],
      }),
      m('lancel', 'Lancel', 16, { house: 'lannister', father: 'kevan' }),
      m('gendry', 'Gendry', 16, {
        house: null,
        father: 'robert',
        bastard: true,
        traits: ['fort'],
        skills: [4, 11, 5, 4, 6],
      }),
    ],
  },
  {
    id: 'peyredragon',
    dynasty: 'baratheon',
    name: 'Baratheon de Peyredragon',
    region: 'couronne',
    liege: 'baratheon',
    head: 'stannis',
    counties: ['peyredragon'],
    playable: true,
    blurb:
      'Stannis, frère cadet du roi, tient l’île austère de Peyredragon. Avec Jon Arryn, il enquêtait sur un secret qui pourrait faire de lui l’héritier du trône.',
    gold: 200,
    prestige: 300,
    standing: { piquiers: 300, archers: 200, infanterie: 200 },
    development: 5,
    members: [
      m('stannis', 'Stannis', 36, {
        father: 'steffon',
        traits: ['juste', 'inebranlable', 'stratege'],
        skills: [5, 16, 13, 8, 10],
        spouse: 'selyse',
      }),
      f('selyse', 'Selyse', 35, { house: 'florent', traits: ['melancolique', 'pelerin'] }),
      f('shireen', 'Shireen', 10, {
        father: 'stannis',
        mother: 'selyse',
        traits: ['balafre', 'erudit'],
      }),
      m('davos', 'Davos', 45, {
        house: 'mervault',
        traits: ['juste', 'prudent'],
        skills: [12, 9, 10, 12, 6],
      }),
      m('steffon', 'Steffon', 55, { dead: 'noyé dans la baie des Naufrageurs' }),
    ],
  },
  {
    id: 'accalmie',
    dynasty: 'baratheon',
    name: 'Baratheon d’Accalmie',
    region: 'orage',
    liege: 'baratheon',
    head: 'renly',
    counties: ['accalmie', 'lestival_ete'],
    duchy: 'orage',
    playable: true,
    blurb:
      'Renly, le plus jeune des frères du roi, seigneur d’Accalmie et maître des lois. Charmeur, aimé des seigneurs de l’Orage et des Tyrell.',
    gold: 300,
    prestige: 350,
    standing: { piquiers: 300, archers: 300, cavalerie: 200 },
    development: 6,
    members: [
      m('renly', 'Renly', 21, {
        father: 'steffon',
        traits: ['courtois', 'ambitieux', 'genereux'],
        skills: [16, 8, 11, 9, 9],
      }),
    ],
  },

  // -------------------------------------------------------------------------
  // Les grandes maisons
  // -------------------------------------------------------------------------
  {
    id: 'stark',
    name: 'Stark',
    region: 'nord',
    liege: 'baratheon',
    head: 'ned',
    counties: ['winterfell', 'bois_loups', 'moat_cailin', 'cote_pierreuse'],
    duchy: 'nord',
    playable: true,
    blurb:
      'Eddard Stark, seigneur de Winterfell et gouverneur du Nord. Le roi, son vieil ami, chevauche vers le nord pour lui demander de devenir sa Main.',
    words: 'L’hiver vient',
    color: '#8a98a6',
    sigil: 'wolf',
    metal: '#f4f1ea',
    gold: 220,
    prestige: 450,
    standing: { piquiers: 400, archers: 300, infanterie: 200, cavalerie: 200 },
    development: 5,
    members: [
      m('ned', 'Eddard', 40, {
        traits: ['juste', 'courageux', 'inebranlable', 'soldat'],
        skills: [9, 14, 10, 3, 8],
        spouse: 'catelyn',
      }),
      f('catelyn', 'Catelyn', 38, {
        house: 'tully',
        father: 'hoster',
        traits: ['prudent', 'diplomate'],
        skills: [13, 4, 10, 8, 9],
      }),
      m('robb', 'Robb', 17, {
        father: 'ned',
        mother: 'catelyn',
        traits: ['courageux', 'juste', 'stratege'],
        skills: [9, 13, 7, 6, 6],
      }),
      f('sansa', 'Sansa', 13, { father: 'ned', mother: 'catelyn', traits: ['courtois'] }),
      f('arya', 'Arya', 11, { father: 'ned', mother: 'catelyn', traits: ['impetueux'] }),
      m('bran', 'Bran', 10, { father: 'ned', mother: 'catelyn', traits: ['courageux'] }),
      m('rickon', 'Rickon', 6, { father: 'ned', mother: 'catelyn' }),
      m('jon', 'Jon Snow', 17, {
        house: null,
        father: 'ned',
        bastard: true,
        traits: ['juste', 'courageux'],
        skills: [6, 13, 5, 5, 7],
      }),
      m('benjen', 'Benjen', 35, {
        vows: true,
        court: 'jeor',
        traits: ['courageux'],
        skills: [6, 13, 6, 8, 7],
      }),
      m('luwin', 'Luwin', 60, {
        house: null,
        vows: true,
        traits: ['erudit', 'genereux'],
        skills: [10, 3, 11, 7, 16],
      }),
      m('rodrik_cassel', 'Rodrik Cassel', 55, {
        house: 'cassel',
        traits: ['veteran', 'juste'],
        skills: [6, 14, 7, 4, 6],
      }),
      m('theon', 'Theon', 19, {
        house: 'greyjoy',
        father: 'balon',
        mother: 'alannys',
        hostageOf: 'ned',
        traits: ['ambitieux', 'impetueux'],
        skills: [7, 11, 5, 9, 5],
      }),
    ],
  },
  {
    id: 'lannister',
    name: 'Lannister',
    region: 'ouest',
    liege: 'baratheon',
    head: 'tywin',
    counties: ['castral_roc', 'port_lannis'],
    duchy: 'ouest',
    playable: true,
    blurb:
      'Tywin Lannister, seigneur de Castral Roc, la maison la plus riche du royaume. Sa fille est reine, son fils aîné garde le roi, et la Couronne lui doit des fortunes.',
    words: 'Je rugis !',
    color: '#9e1b24',
    sigil: 'lion',
    metal: '#e8c547',
    gold: 1400,
    prestige: 700,
    standing: { piquiers: 700, archers: 500, infanterie: 500, cavalerie: 500 },
    development: 7,
    members: [
      m('tywin', 'Tywin', 60, {
        father: 'lannister_pere',
        traits: ['ambitieux', 'cruel', 'administrateur', 'stratege'],
        skills: [13, 16, 18, 15, 11],
      }),
      m('tyrion', 'Tyrion', 28, {
        father: 'tywin',
        traits: ['erudit', 'genie', 'ivrogne'],
        skills: [14, 5, 12, 14, 16],
        court: 'tywin',
      }),
      m('kevan', 'Kevan', 55, {
        father: 'lannister_pere',
        traits: ['prudent', 'juste'],
        skills: [10, 12, 13, 8, 9],
      }),
      m('lannister_pere', 'Tytos', 62, { dead: 'mort de chagrin et de dettes' }),
    ],
  },
  {
    id: 'arryn',
    name: 'Arryn',
    region: 'val',
    liege: 'baratheon',
    head: 'robin',
    counties: ['eyrie', 'monts_lune', 'doigts'],
    duchy: 'val',
    playable: true,
    blurb:
      'Robin Arryn, huit ans, seigneur des Eyrié depuis la mort soudaine de son père Jon, la Main du Roi. Sa mère Lysa soupçonne les Lannister et ferme le Val.',
    words: 'Aussi haut que l’honneur',
    color: '#5b8fc9',
    sigil: 'falcon',
    metal: '#f4f1ea',
    gold: 400,
    prestige: 400,
    standing: { piquiers: 400, archers: 300, cavalerie: 400 },
    development: 5,
    members: [
      m('robin', 'Robin', 8, {
        father: 'jon_arryn',
        mother: 'lysa',
        traits: ['faible', 'lache'],
        health: 45,
        skills: [3, 2, 3, 3, 4],
      }),
      f('lysa', 'Lysa', 34, {
        house: 'tully',
        father: 'hoster',
        spouse: 'jon_arryn',
        traits: ['melancolique', 'cruel'],
        skills: [8, 3, 7, 10, 6],
      }),
      m('jon_arryn', 'Jon', 70, { dead: 'mort de fièvre (ou empoisonné ?)' }),
      m('brynden', 'Brynden', 55, {
        house: 'tully',
        father: 'tully_pere',
        traits: ['heros', 'stratege', 'courageux'],
        skills: [8, 17, 8, 10, 8],
      }),
    ],
  },
  {
    id: 'tully',
    name: 'Tully',
    region: 'conflans',
    liege: 'baratheon',
    head: 'hoster',
    counties: ['vivesaigues', 'vierge_rose'],
    duchy: 'conflans',
    playable: true,
    blurb:
      'Hoster Tully, seigneur de Vivesaigues, se meurt. Ses filles ont épousé Stark et Arryn ; son fils Edmure brûle de faire ses preuves.',
    words: 'Famille, devoir, honneur',
    color: '#2b5aa0',
    sigil: 'trout',
    metal: '#d9dee4',
    gold: 300,
    prestige: 350,
    standing: { piquiers: 400, archers: 400, cavalerie: 200 },
    development: 5,
    members: [
      m('hoster', 'Hoster', 65, {
        father: 'tully_pere',
        traits: ['malade', 'prudent'],
        skills: [11, 9, 10, 9, 8],
        health: 22,
      }),
      m('edmure', 'Edmure', 28, {
        father: 'hoster',
        traits: ['impetueux', 'courageux', 'genereux'],
        skills: [8, 10, 7, 4, 6],
      }),
      m('tully_pere', 'Lord Tully', 80, { dead: 'mort de vieillesse' }),
    ],
  },
  {
    id: 'greyjoy',
    name: 'Greyjoy',
    region: 'iles',
    liege: 'baratheon',
    head: 'balon',
    counties: ['pyk', 'grand_wyk'],
    duchy: 'iles',
    playable: true,
    blurb:
      'Balon Greyjoy, seigneur de Pyk, n’a pas oublié sa rébellion écrasée. Son dernier fils, Theon, est otage à Winterfell depuis neuf ans.',
    words: 'Nous ne semons pas',
    color: '#2b2a30',
    sigil: 'kraken',
    metal: '#d8b444',
    gold: 160,
    prestige: 250,
    standing: { infanterie: 600, archers: 200 },
    development: 3,
    members: [
      m('balon', 'Balon', 55, {
        traits: ['ambitieux', 'cruel', 'irascible'],
        skills: [5, 14, 7, 9, 5],
        spouse: 'alannys',
      }),
      f('alannys', 'Alannys', 52, { house: 'harlaw', traits: ['melancolique'] }),
      f('yara', 'Yara', 22, {
        father: 'balon',
        mother: 'alannys',
        traits: ['courageux', 'soldat'],
        skills: [8, 14, 8, 9, 6],
      }),
      m('victarion', 'Victarion', 45, {
        traits: ['courageux', 'veteran'],
        skills: [4, 15, 5, 3, 4],
      }),
      m('aeron', 'Aeron', 40, { traits: ['pelerin', 'cruel'], skills: [6, 9, 4, 6, 9] }),
    ],
  },
  {
    id: 'tyrell',
    name: 'Tyrell',
    region: 'bief',
    liege: 'baratheon',
    head: 'mace',
    counties: ['hautjardin', 'pont_amer'],
    duchy: 'bief',
    playable: true,
    blurb:
      'Mace Tyrell, seigneur de Hautjardin, règne sur le Bief, la région la plus riche en blé et en chevaliers. Sa mère Olenna tire les ficelles ; sa fille Margaery rêve de couronne.',
    words: 'Plus haut, plus fort',
    color: '#3f8a3c',
    sigil: 'rose',
    metal: '#e8c547',
    gold: 800,
    prestige: 450,
    standing: { piquiers: 600, archers: 500, cavalerie: 600 },
    development: 7,
    agnatic: true,
    members: [
      m('mace', 'Mace', 45, {
        traits: ['satisfait', 'genereux'],
        skills: [9, 8, 11, 5, 7],
        spouse: 'alerie',
      }),
      f('alerie', 'Alerie', 42, { house: 'hightower', father: 'leyton' }),
      f('olenna', 'Olenna', 70, {
        house: 'redwyne',
        traits: ['intrigant', 'prudent'],
        skills: [16, 3, 12, 18, 12],
      }),
      m('loras', 'Loras', 18, {
        father: 'mace',
        mother: 'alerie',
        traits: ['cavalier', 'courageux', 'impetueux'],
        skills: [9, 15, 4, 5, 6],
      }),
      f('margaery', 'Margaery', 18, {
        father: 'mace',
        mother: 'alerie',
        traits: ['ambitieux', 'diplomate'],
        skills: [16, 3, 8, 13, 9],
      }),
    ],
  },
  {
    id: 'martell',
    name: 'Martell',
    region: 'dorne',
    liege: 'baratheon',
    head: 'doran',
    counties: ['lancehelion', 'jardins'],
    duchy: 'dorne',
    playable: true,
    blurb:
      'Doran Martell, prince de Dorne, ronge sa goutte et sa rancune : sa sœur Elia et ses enfants ont été massacrés par les hommes de Tywin Lannister.',
    words: 'Insoumis, invaincus, intacts',
    color: '#d8661c',
    sigil: 'sun',
    metal: '#f2d36b',
    gold: 450,
    prestige: 400,
    agnatic: false,
    standing: { piquiers: 400, archers: 500, cavalerie: 400 },
    development: 5,
    members: [
      m('doran', 'Doran', 52, {
        traits: ['prudent', 'intrigant', 'malade'],
        skills: [15, 6, 14, 16, 13],
        health: 38,
      }),
      m('trystane', 'Trystane', 14, { father: 'doran', traits: ['courtois'] }),
      m('oberyn', 'Oberyn', 40, {
        traits: ['impetueux', 'courageux', 'erudit'],
        skills: [11, 15, 6, 14, 15],
      }),
      f('ellaria', 'Ellaria Sand', 35, { house: null, traits: ['ambitieux'], court: 'doran' }),
    ],
  },

  // -------------------------------------------------------------------------
  // Bannerets jouables
  // -------------------------------------------------------------------------
  {
    id: 'bolton',
    name: 'Bolton',
    region: 'nord',
    liege: 'stark',
    head: 'roose',
    counties: ['fort_terreur'],
    playable: true,
    blurb:
      'Roose Bolton, seigneur de Fort-Terreur, à la voix douce et aux sangsues. Sa maison écorchait jadis ses ennemis ; son bâtard Ramsay n’a pas perdu l’habitude.',
    words: 'Nos lames sont acérées',
    color: '#8c3b4a',
    sigil: 'flayed',
    metal: '#f1d6cf',
    gold: 150,
    prestige: 150,
    standing: { piquiers: 200, archers: 200, cavalerie: 100 },
    members: [
      m('roose', 'Roose', 45, {
        traits: ['cruel', 'prudent', 'intrigant'],
        skills: [9, 12, 11, 16, 9],
      }),
      m('ramsay', 'Ramsay Snow', 22, {
        house: null,
        father: 'roose',
        bastard: true,
        traits: ['cruel', 'boucher', 'chasseur'],
        skills: [3, 13, 4, 12, 4],
      }),
    ],
  },
  {
    id: 'karstark',
    name: 'Karstark',
    region: 'nord',
    liege: 'stark',
    head: 'rickard_karstark',
    counties: ['karhold'],
    playable: true,
    blurb:
      'Rickard Karstark, seigneur de Karhold, cousin lointain des Stark, fier et prompt à la colère, père de trois fils et d’une fille.',
    color: '#3d3a36',
    sigil: 'sunburst',
    metal: '#f4f1ea',
    gold: 90,
    prestige: 100,
    members: [
      m('rickard_karstark', 'Rickard', 50, {
        traits: ['irascible', 'courageux'],
        skills: [5, 13, 7, 5, 5],
      }),
      m('harrion', 'Harrion', 25, { father: 'rickard_karstark' }),
      m('eddard_k', 'Eddard', 22, { father: 'rickard_karstark' }),
      m('torrhen_k', 'Torrhen', 20, { father: 'rickard_karstark' }),
      f('alys_k', 'Alys', 14, { father: 'rickard_karstark' }),
    ],
  },
  {
    id: 'umber',
    name: 'Omble',
    region: 'nord',
    liege: 'stark',
    head: 'greatjon',
    counties: ['atre'],
    playable: true,
    blurb:
      'Jon Omble, le Lard-Jon, seigneur d’Âtre-les-Confins aux portes du Mur : un géant tonitruant, fidèle jusqu’à l’os aux Stark.',
    color: '#7a5230',
    sigil: 'chains',
    metal: '#f4f1ea',
    gold: 70,
    prestige: 100,
    members: [
      m('greatjon', 'Jon', 50, {
        traits: ['fort', 'courageux', 'impetueux'],
        skills: [5, 15, 5, 3, 4],
      }),
      m('smalljon', 'Jon le Petit', 25, { father: 'greatjon', traits: ['fort'] }),
      m('mors', 'Mors', 70, { traits: ['ivrogne'] }),
    ],
  },
  {
    id: 'manderly',
    name: 'Manderly',
    region: 'nord',
    liege: 'stark',
    head: 'wyman',
    counties: ['blancport'],
    playable: true,
    blurb:
      'Wyman Manderly, seigneur de Blancport, le port le plus riche du Nord. Énorme, rusé, plus dangereux qu’il n’en a l’air.',
    color: '#2e8b85',
    sigil: 'merman',
    metal: '#f4f1ea',
    gold: 400,
    prestige: 120,
    development: 6,
    standing: { piquiers: 200, archers: 200, infanterie: 200 },
    members: [
      m('wyman', 'Wyman', 60, {
        traits: ['prudent', 'econome', 'intrigant'],
        skills: [13, 6, 14, 14, 9],
        health: 55,
      }),
      m('wylis', 'Wylis', 35, { father: 'wyman' }),
      m('wendel', 'Wendel', 32, { father: 'wyman', traits: ['courageux'] }),
      f('wylla', 'Wylla', 14, { father: 'wylis' }),
    ],
  },
  {
    id: 'mormont',
    name: 'Mormont',
    region: 'nord',
    liege: 'stark',
    head: 'maege',
    counties: ['ile_ours'],
    playable: true,
    blurb:
      'Maege Mormont, dame de l’Île-aux-Ours, et ses filles guerrières. Son neveu Jorah, chassé pour avoir vendu des braconniers, sert les Targaryen en exil.',
    words: 'Ici nous résistons',
    color: '#2f4f2a',
    sigil: 'bear',
    metal: '#1b1712',
    agnatic: false,
    gold: 50,
    prestige: 80,
    members: [
      f('maege', 'Maege', 50, {
        traits: ['courageux', 'inebranlable'],
        skills: [7, 13, 7, 6, 6],
      }),
      f('dacey', 'Dacey', 25, { father: 'mormont_pere', mother: 'maege', traits: ['soldat'] }),
      f('alysane', 'Alysane', 20, { father: 'mormont_pere', mother: 'maege' }),
      f('lyanna_m', 'Lyanna', 6, { father: 'mormont_pere', mother: 'maege' }),
      m('mormont_pere', 'Brandon', 52, { house: null, dead: 'mort à la mer' }),
      m('jeor', 'Jeor', 70, {
        vows: true,
        court: 'jeor',
        traits: ['juste', 'veteran'],
        skills: [10, 14, 9, 7, 9],
      }),
      m('jorah', 'Jorah', 45, {
        father: 'jeor',
        court: 'drogo',
        traits: ['courageux', 'melancolique'],
        skills: [8, 15, 6, 9, 9],
      }),
    ],
  },
  {
    id: 'frey',
    name: 'Frey',
    region: 'conflans',
    liege: 'tully',
    head: 'walder',
    counties: ['jumeaux'],
    playable: true,
    blurb:
      'Walder Frey, nonagénaire, seigneur du Pont des Jumeaux : quiconque veut franchir la Verfleuve doit lui payer son péage. Il a eu huit épouses et une centaine de descendants.',
    color: '#6f6a9a',
    sigil: 'towers',
    metal: '#d9dee4',
    gold: 600,
    prestige: 120,
    development: 5,
    standing: { piquiers: 500, archers: 300, cavalerie: 200 },
    members: [
      m('walder', 'Walder', 91, {
        traits: ['avare', 'intrigant', 'ambitieux'],
        skills: [7, 6, 14, 15, 8],
        health: 40,
        spouse: 'joyeuse',
      }),
      f('joyeuse', 'Joyeuse', 16, { house: 'erenford' }),
      m('stevron', 'Stevron', 70, { father: 'walder', traits: ['prudent'] }),
      m('lothar', 'Lothar', 40, { father: 'walder', traits: ['intrigant'] }),
      m('black_walder', 'Walder le Noir', 38, { father: 'walder', traits: ['cruel'] }),
      m('olyvar', 'Olyvar', 18, { father: 'walder' }),
      f('roslin', 'Roslin', 16, { father: 'walder', traits: ['courtois'] }),
    ],
  },
  {
    id: 'tarly',
    name: 'Tarly',
    region: 'bief',
    liege: 'tyrell',
    head: 'randyll',
    counties: ['corcolline'],
    playable: true,
    blurb:
      'Randyll Tarly, seigneur de Corcolline, le meilleur capitaine du Bief. Il a obligé son fils aîné, Samwell, trop doux à son goût, à prendre le noir.',
    color: '#6b8e23',
    sigil: 'hunter',
    metal: '#8b1e1e',
    gold: 150,
    prestige: 180,
    standing: { piquiers: 300, archers: 300, cavalerie: 200 },
    members: [
      m('randyll', 'Randyll', 50, {
        traits: ['stratege', 'cruel', 'inebranlable'],
        skills: [6, 17, 9, 7, 7],
        spouse: 'melessa',
      }),
      f('melessa', 'Melessa', 45, { house: 'florent' }),
      m('samwell', 'Samwell', 18, {
        father: 'randyll',
        mother: 'melessa',
        vows: true,
        court: 'jeor',
        traits: ['erudit', 'lache'],
        skills: [8, 2, 8, 6, 15],
      }),
      m('dickon', 'Dickon', 15, { father: 'randyll', mother: 'melessa', traits: ['courageux'] }),
      f('talla', 'Talla', 14, { father: 'randyll', mother: 'melessa' }),
    ],
  },
  {
    id: 'clegane',
    name: 'Clegane',
    region: 'ouest',
    liege: 'lannister',
    head: 'gregor',
    counties: ['fort_clegane'],
    playable: true,
    blurb:
      'Ser Gregor Clegane, la Montagne, le chevalier le plus redouté de l’Ouest et le chien de guerre de Tywin Lannister. Son frère Sandor, le Limier, garde le prince Joffrey.',
    color: '#c2b03c',
    sigil: 'dogs',
    metal: '#1b1712',
    gold: 80,
    prestige: 120,
    standing: { infanterie: 300, cavalerie: 200 },
    members: [
      m('gregor', 'Gregor', 35, {
        traits: ['fort', 'cruel', 'boucher', 'soldat'],
        skills: [2, 17, 3, 5, 2],
        father: 'clegane_pere',
      }),
      m('clegane_pere', 'Lord Clegane', 60, { dead: 'mort d’un accident de chasse' }),
    ],
  },
  {
    id: 'royce',
    name: 'Royce',
    region: 'val',
    liege: 'arryn',
    head: 'yohn',
    counties: ['pierre_runes'],
    playable: true,
    blurb:
      'Yohn Royce, Bronze Yohn, seigneur de Pierre-aux-Runes, la plus ancienne maison du Val. Son fils Waymar vient de disparaître au-delà du Mur.',
    color: '#8a6a3b',
    sigil: 'runes',
    metal: '#1b1712',
    gold: 180,
    prestige: 160,
    members: [
      m('yohn', 'Yohn', 55, {
        traits: ['juste', 'courageux', 'veteran'],
        skills: [9, 14, 9, 6, 8],
      }),
      m('andar', 'Andar', 30, { father: 'yohn' }),
      m('robar', 'Robar', 26, { father: 'yohn', traits: ['cavalier'] }),
      m('waymar', 'Waymar', 22, { father: 'yohn', dead: 'disparu au-delà du Mur' }),
    ],
  },
  {
    id: 'hightower',
    name: 'Hightower',
    region: 'bief',
    liege: 'tyrell',
    head: 'leyton',
    counties: ['villevieille'],
    playable: true,
    blurb:
      'Leyton Hightower, la Voix de Villevieille, seigneur de la plus ancienne cité de Westeros, entre la Citadelle des mestres et le Grand Septuaire étoilé.',
    color: '#c9c3b5',
    sigil: 'tower',
    metal: '#7a1f1f',
    gold: 700,
    prestige: 220,
    development: 7,
    standing: { piquiers: 300, archers: 300, infanterie: 200 },
    members: [
      m('leyton', 'Leyton', 70, {
        traits: ['erudit', 'prudent'],
        skills: [12, 7, 13, 10, 16],
      }),
      m('baelor_h', 'Baelor', 40, { father: 'leyton', traits: ['courtois'] }),
      f('malora', 'Malora', 35, { father: 'leyton', traits: ['erudit', 'melancolique'] }),
    ],
  },

  // -------------------------------------------------------------------------
  // En exil : les derniers Targaryen, de l'autre côté du détroit
  // -------------------------------------------------------------------------
  {
    id: 'targaryen',
    name: 'Targaryen',
    region: 'couronne',
    head: 'viserys',
    counties: [],
    color: '#3a0d0d',
    sigil: 'dragon',
    metal: '#b0151b',
    members: [
      m('viserys', 'Viserys', 22, {
        traits: ['ambitieux', 'cruel', 'lache'],
        skills: [6, 4, 3, 7, 5],
        court: 'drogo',
      }),
      f('daenerys', 'Daenerys', 16, {
        spouse: 'drogo',
        traits: ['courageux', 'juste'],
        skills: [10, 4, 6, 7, 8],
        court: 'drogo',
      }),
      m('drogo', 'Drogo', 30, {
        house: null,
        traits: ['fort', 'courageux', 'heros'],
        skills: [4, 18, 3, 5, 3],
        court: 'drogo',
      }),
    ],
  },
];

/** Bannerets non jouables : seigneur connu, ou nom tiré au sort. */
export interface WMinor {
  id: string;
  name: string;
  liege: string;
  county: string;
  head?: { name: string; age: number; female?: boolean };
  color?: string;
}

const n = (
  id: string,
  name: string,
  liege: string,
  county: string,
  head?: string,
  age?: number,
  female?: boolean,
): WMinor => ({
  id,
  name,
  liege,
  county,
  head: head ? { name: head, age: age ?? 45, female } : undefined,
});

export const MINOR_HOUSES: WMinor[] = [
  // Le Nord
  n('glover', 'Glover', 'stark', 'motte', 'Galbart', 45),
  n('flint', 'Flint', 'stark', 'veuve'),
  n('hornwood', 'Corbois', 'stark', 'hornwood', 'Halys', 50),
  n('cerwyn', 'Cerwyn', 'stark', 'cerwyn', 'Medger', 50),
  n('tallhart', 'Tallhart', 'stark', 'quart_torrhen', 'Helman', 45),
  n('ryswell', 'Ryswell', 'stark', 'rus', 'Rodrik', 55),
  n('dustin', 'Dustin', 'stark', 'tertres', 'Barbrey', 40, true),
  n('reed', 'Reed', 'stark', 'griseaux', 'Howland', 40),
  // Les Conflans
  n('mallister', 'Mallister', 'tully', 'salvemer', 'Jason', 55),
  n('blackwood', 'Nerbosc', 'tully', 'corneilla', 'Tytos', 50),
  n('whent', 'Whent', 'tully', 'harrenhal', 'Shella', 60, true),
  n('bracken', 'Bracken', 'tully', 'haie_pierre', 'Jonos', 45),
  n('darry', 'Darry', 'tully', 'darry', 'Raymun', 30),
  n('mooton', 'Mooton', 'tully', 'viergetang', 'William', 45),
  // Les Îles de Fer
  n('drumm', 'Drumm', 'greyjoy', 'vieux_wyk', 'Dunstan', 60),
  n('harlaw', 'Harlaw', 'greyjoy', 'harlaw', 'Rodrik', 50),
  // Le Val
  n('corbray', 'Corbray', 'arryn', 'coeurfoyer', 'Lyonel', 45),
  n('grafton', 'Grafton', 'arryn', 'goeville', 'Gerold', 50),
  n('hunter', 'Hunter', 'arryn', 'arc_long', 'Eon', 70),
  // L'Ouest
  n('banefort', 'Banefort', 'lannister', 'banefort', 'Quenten', 45),
  n('westerling', 'Westerling', 'lannister', 'crique', 'Gawen', 40),
  n('marbrand', 'Marbrand', 'lannister', 'cendremark', 'Damon', 50),
  n('lefford', 'Lefford', 'lannister', 'dent_or', 'Alysanne', 45, true),
  n('farman', 'Farman', 'lannister', 'belle_ile', 'Sebaston', 50),
  // La Couronne
  n('rykker', 'Rykker', 'baratheon', 'sombreval', 'Renfred', 45),
  n('rosby', 'Rosby', 'baratheon', 'rosby', 'Gyles', 60),
  n('stokeworth', 'Stokeworth', 'baratheon', 'stokeworth', 'Tanda', 55, true),
  n('celtigar', 'Celtigar', 'peyredragon', 'griffe', 'Ardrian', 60),
  n('velaryon', 'Velaryon', 'peyredragon', 'lamarck', 'Monford', 40),
  // Le Bief
  n('rowan', 'Rowan', 'tyrell', 'goldengrove', 'Mathis', 45),
  n('oakheart', 'Chênecœur', 'tyrell', 'vieux_chene', 'Arwyn', 45, true),
  n('merryweather', 'Merryweather', 'tyrell', 'longuetable', 'Orton', 40),
  n('fossoway', 'Fossovoie', 'tyrell', 'cidre'),
  n('ashford', 'Ashford', 'tyrell', 'ashford'),
  n('florent', 'Florent', 'tyrell', 'brightwater', 'Alester', 50),
  n('redwyne', 'Redwyne', 'tyrell', 'treille', 'Paxter', 50),
  // L'Orage
  n('buckler', 'Buckler', 'accalmie', 'bronzegate', 'Ralph', 40),
  n('fell', 'Fell', 'accalmie', 'felwood'),
  n('massey', 'Massey', 'accalmie', 'pierremasse'),
  n('tarth', 'Tarth', 'accalmie', 'tarth', 'Selwyn', 55),
  n('connington', 'Connington', 'accalmie', 'nid_griffon'),
  n('wylde', 'Wylde', 'accalmie', 'bois_pluie'),
  n('dondarrion', 'Dondarrion', 'accalmie', 'havrenoir', 'Beric', 30),
  n('swann', 'Swann', 'accalmie', 'pierreheaume', 'Gulian', 55),
  n('caron', 'Caron', 'accalmie', 'chant_nuit', 'Bryce', 25),
  // Dorne
  n('dayne', 'Dayne', 'martell', 'lestival', 'Edric', 12),
  n('manwoody', 'Manwoody', 'martell', 'tombe_roi'),
  n('fowler', 'Fowler', 'martell', 'haut_ciel'),
  n('uller', 'Uller', 'martell', 'enfer_creux', 'Harmen', 50),
  n('yronwood', 'Ferboys', 'martell', 'bois_fer', 'Anders', 50),
  n('dalt', 'Dalt', 'martell', 'vaith'),
  n('jordayne', 'Jordayne', 'martell', 'tor', 'Myria', 45, true),
  n('gargalen', 'Gargalen', 'martell', 'cote_sel'),
  n('toland', 'Toland', 'martell', 'colline_fantome'),
];

/** Prénoms de Westeros pour les naissances et les personnages tirés au sort. */
export const WESTEROS_NAMES = {
  male: [
    'Aemon',
    'Alester',
    'Alyn',
    'Arthur',
    'Benfred',
    'Brandon',
    'Brynden',
    'Cley',
    'Cortnay',
    'Daemon',
    'Dagmer',
    'Donnel',
    'Edwyn',
    'Elbert',
    'Gawen',
    'Gerold',
    'Harwin',
    'Hallis',
    'Hugh',
    'Jaremy',
    'Jonos',
    'Jory',
    'Lyonel',
    'Lucas',
    'Mallor',
    'Medger',
    'Merrett',
    'Owen',
    'Patrek',
    'Quentyn',
    'Raymun',
    'Rickard',
    'Robett',
    'Rodrik',
    'Rolland',
    'Ronnel',
    'Symond',
    'Tallad',
    'Theomar',
    'Torrhen',
    'Tybolt',
    'Ulmer',
    'Walton',
    'Waymar',
    'Willem',
    'Wyl',
  ],
  female: [
    'Alys',
    'Alysanne',
    'Arwyn',
    'Bethany',
    'Cassana',
    'Cerenna',
    'Dacey',
    'Delena',
    'Elinor',
    'Ellyn',
    'Erena',
    'Gwynesse',
    'Jeyne',
    'Jonella',
    'Lyra',
    'Lyessa',
    'Maege',
    'Meera',
    'Melara',
    'Minisa',
    'Myranda',
    'Perra',
    'Raelle',
    'Rhaella',
    'Rohanne',
    'Rowena',
    'Sarella',
    'Shierle',
    'Taena',
    'Tysane',
    'Wenda',
    'Wylla',
    'Ysilla',
  ],
  houses: [
    'Bolling',
    'Blount',
    'Brax',
    'Bulwer',
    'Cafferen',
    'Crakehall',
    'Dustin',
    'Errol',
    'Footly',
    'Grandison',
    'Hasty',
    'Hogg',
    'Kenning',
    'Lydden',
    'Mertyns',
    'Morrigen',
    'Norcross',
    'Penrose',
    'Piper',
    'Roxton',
    'Sarsfield',
    'Smallwood',
    'Staunton',
    'Strong',
    'Trant',
    'Vance',
    'Vypren',
    'Wode',
    'Woodwright',
    'Yew',
  ],
};
