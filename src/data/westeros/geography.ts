/**
 * Géographie de Westeros (mode Trône de fer) : contours des terres, châteaux (un comté chacun),
 * fleuves, traversées maritimes et terres lointaines. Tracé approximatif, dessiné pour le jeu.
 * Repère : 1200 × 2000, x vers l'est, y vers le sud. Le Mur court le long de y = 150.
 */
import type { Terrain } from '../../engine/state';

export const WESTEROS_W = 1200;
export const WESTEROS_H = 2000;

type P = [number, number];

/** Le continent, du Mur à Dorne (sens horaire, depuis l'extrémité ouest du Mur). */
export const MAINLAND: P[] = [
  [300, 150],
  [800, 150],
  // Côte est du Nord : baie des Phoques, Karhold, la Veuve
  [822, 198],
  [782, 240],
  [764, 282],
  [804, 298],
  [838, 332],
  [868, 386],
  [896, 432],
  [882, 490],
  [862, 546],
  [886, 600],
  [862, 656],
  [800, 690],
  [722, 702],
  // Blancport et la Morsure
  [664, 722],
  [642, 762],
  [604, 800],
  [580, 840],
  [568, 884],
  // Rive sud de la Morsure jusqu'aux Doigts
  [604, 892],
  [662, 878],
  [722, 860],
  [782, 846],
  [842, 840],
  [902, 830],
  [952, 836],
  [948, 872],
  [926, 902],
  [934, 952],
  [926, 1010],
  [892, 1060],
  [852, 1086],
  // Baie des Crabes, pointe de la Griffe
  [800, 1098],
  [750, 1104],
  [722, 1120],
  [744, 1134],
  [796, 1146],
  [852, 1152],
  [884, 1172],
  [862, 1200],
  [822, 1214],
  [770, 1232],
  // Baie de la Néra, crochet de Massey
  [746, 1252],
  [782, 1272],
  [842, 1284],
  [898, 1290],
  [910, 1312],
  [872, 1336],
  [852, 1370],
  [890, 1402],
  [928, 1432],
  [952, 1482],
  [986, 1532],
  [1010, 1582],
  [1026, 1632],
  // Côte sud des terres de l'Orage (mer de Dorne)
  [990, 1650],
  [930, 1655],
  [860, 1660],
  [792, 1668],
  [742, 1690],
  // Côte nord de Dorne
  [790, 1730],
  [870, 1754],
  [950, 1768],
  [1020, 1790],
  [1072, 1814],
  [1084, 1852],
  [1042, 1892],
  [962, 1922],
  [862, 1932],
  [762, 1908],
  [652, 1896],
  [562, 1882],
  [472, 1862],
  [402, 1832],
  [370, 1790],
  [394, 1750],
  [362, 1722],
  // Côte sud du Bief, Villevieille
  [322, 1702],
  [272, 1692],
  [236, 1662],
  [214, 1610],
  [200, 1560],
  [190, 1480],
  [204, 1400],
  [214, 1332],
  [240, 1282],
  // L'Ouest : Port-Lannis, Castral Roc, la Crique
  [246, 1232],
  [214, 1182],
  [230, 1140],
  [224, 1092],
  [270, 1062],
  [300, 1032],
  [344, 1002],
  [330, 962],
  [362, 922],
  [386, 890],
  [382, 852],
  // Côte ouest du Nord : cap Kraken, côte Pierreuse, pointe du Dragon-de-Mer
  [340, 830],
  [300, 806],
  [260, 786],
  [204, 790],
  [160, 760],
  [170, 700],
  [214, 650],
  [240, 600],
  [224, 540],
  [250, 480],
  [254, 432],
  [190, 420],
  [170, 386],
  [240, 360],
  [284, 320],
  [262, 270],
  [276, 210],
];

/** Polygone approché d'une île : cercle déformé, déterministe. */
function island(cx: number, cy: number, r: number, n = 9, wobble = 0.22, phase = 0): P[] {
  const pts: P[] = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const k = 1 + wobble * Math.sin(3 * a + phase) * Math.cos(2 * a - phase);
    pts.push([Math.round(cx + Math.cos(a) * r * k), Math.round(cy + Math.sin(a) * r * k * 0.85)]);
  }
  return pts;
}

/** Îles : chacune porte un ou plusieurs comtés. */
export const ISLANDS: Record<string, P[]> = {
  ours: island(205, 296, 34, 9, 0.2, 1),
  vieux_wyk: island(126, 926, 30, 8, 0.2, 2),
  grand_wyk: island(108, 1010, 40, 10, 0.18, 0.5),
  pyk: island(176, 984, 28, 8, 0.2, 1.4),
  harlaw: island(248, 940, 30, 8, 0.2, 2.2),
  belle_ile: island(172, 1152, 24, 8, 0.2, 0.8),
  peyredragon: island(944, 1182, 28, 8, 0.25, 1.1),
  lamarck: island(940, 1240, 20, 8, 0.2, 2.6),
  tarth: island(1012, 1396, 34, 9, 0.18, 0.3),
  treille: island(164, 1732, 36, 9, 0.2, 1.7),
};

export interface WesterosSite {
  id: string;
  name: string;
  /** Région (duché du jeu). */
  region: RegionId;
  terrain: Terrain;
  x: number;
  y: number;
  /** Île portant ce comté (sinon le continent). */
  island?: keyof typeof ISLANDS;
}

export type RegionId =
  'nord' | 'conflans' | 'iles' | 'val' | 'ouest' | 'couronne' | 'bief' | 'orage' | 'dorne';

const s = (
  id: string,
  name: string,
  region: RegionId,
  terrain: Terrain,
  x: number,
  y: number,
  isl?: keyof typeof ISLANDS,
): WesterosSite => ({ id, name, region, terrain, x, y, island: isl });

/** Un château par comté. */
export const SITES: WesterosSite[] = [
  // Le Nord
  s('winterfell', 'Winterfell', 'nord', 'plaine', 500, 470),
  s('bois_loups', 'Bois-aux-Loups', 'nord', 'foret', 370, 420),
  s('motte', 'Motte-la-Forêt', 'nord', 'foret', 340, 290),
  s('ile_ours', 'Île-aux-Ours', 'nord', 'foret', 205, 296, 'ours'),
  s('atre', 'Âtre-les-Confins', 'nord', 'colline', 560, 230),
  s('karhold', 'Karhold', 'nord', 'colline', 760, 345),
  s('fort_terreur', 'Fort-Terreur', 'nord', 'colline', 660, 420),
  s('veuve', 'Guet-de-la-Veuve', 'nord', 'colline', 820, 560),
  s('hornwood', 'Corbois', 'nord', 'foret', 690, 570),
  s('cerwyn', 'Cerwyn', 'nord', 'plaine', 550, 570),
  s('quart_torrhen', 'Quart-Torrhen', 'nord', 'colline', 410, 590),
  s('rus', 'Les Rus', 'nord', 'plaine', 290, 640),
  s('cote_pierreuse', 'Côte Pierreuse', 'nord', 'colline', 220, 740),
  s('blancport', 'Blancport', 'nord', 'plaine', 640, 690),
  s('tertres', 'Les Tertres', 'nord', 'plaine', 480, 690),
  s('moat_cailin', 'Moat Cailin', 'nord', 'marais', 450, 800),
  s('griseaux', 'Griseaux', 'nord', 'marais', 490, 862),
  // Les Conflans
  s('jumeaux', 'Les Jumeaux', 'conflans', 'plaine', 450, 935),
  s('salvemer', 'Salvemer', 'conflans', 'plaine', 375, 975),
  s('corneilla', 'Corneilla', 'conflans', 'foret', 530, 960),
  s('vivesaigues', 'Vivesaigues', 'conflans', 'plaine', 440, 1075),
  s('vierge_rose', 'Vierge-Rose', 'conflans', 'colline', 385, 1040),
  s('harrenhal', 'Harrenhal', 'conflans', 'plaine', 560, 1060),
  s('haie_pierre', 'Haie-Pierre', 'conflans', 'colline', 480, 1150),
  s('darry', 'Darry', 'conflans', 'plaine', 600, 1145),
  s('viergetang', 'Viergétang', 'conflans', 'plaine', 680, 1110),
  // Les Îles de Fer
  s('pyk', 'Pyk', 'iles', 'colline', 176, 984, 'pyk'),
  s('grand_wyk', 'Grand Wyk', 'iles', 'colline', 108, 1010, 'grand_wyk'),
  s('vieux_wyk', 'Vieux Wyk', 'iles', 'montagne', 126, 926, 'vieux_wyk'),
  s('harlaw', 'Harlaw', 'iles', 'colline', 248, 940, 'harlaw'),
  // Le Val
  s('eyrie', 'Les Eyrié', 'val', 'montagne', 760, 975),
  s('monts_lune', 'Montagnes de la Lune', 'val', 'montagne', 650, 950),
  s('doigts', 'Les Doigts', 'val', 'colline', 885, 875),
  s('coeurfoyer', 'Cœurfoyer', 'val', 'colline', 800, 915),
  s('pierre_runes', 'Pierre-aux-Runes', 'val', 'colline', 885, 990),
  s('goeville', 'Goëville', 'val', 'plaine', 835, 1060),
  s('arc_long', 'Arc-Long', 'val', 'colline', 720, 1050),
  // L'Ouest
  s('banefort', 'Banefort', 'ouest', 'colline', 300, 1070),
  s('crique', 'La Crique', 'ouest', 'colline', 252, 1115),
  s('cendremark', 'Cendremark', 'ouest', 'colline', 330, 1150),
  s('dent_or', 'La Dent-d’Or', 'ouest', 'montagne', 400, 1160),
  s('castral_roc', 'Castral Roc', 'ouest', 'colline', 250, 1185),
  s('port_lannis', 'Port-Lannis', 'ouest', 'plaine', 280, 1245),
  s('fort_clegane', 'Fort-Clegane', 'ouest', 'colline', 360, 1240),
  s('belle_ile', 'Belle-Île', 'ouest', 'plaine', 172, 1152, 'belle_ile'),
  // Les terres de la Couronne
  s('port_real', 'Port-Réal', 'couronne', 'plaine', 700, 1230),
  s('sombreval', 'Sombreval', 'couronne', 'plaine', 770, 1168),
  s('griffe', 'Pointe-de-la-Griffe', 'couronne', 'colline', 830, 1180),
  s('rosby', 'Rosby', 'couronne', 'plaine', 630, 1205),
  s('stokeworth', 'Castelfoyer', 'couronne', 'plaine', 640, 1270),
  s('bois_du_roi', 'Bois-du-Roi', 'couronne', 'foret', 760, 1320),
  s('peyredragon', 'Peyredragon', 'couronne', 'montagne', 944, 1182, 'peyredragon'),
  s('lamarck', 'Lamarck', 'couronne', 'plaine', 940, 1240, 'lamarck'),
  // Le Bief
  s('goldengrove', 'Bosquedoré', 'bief', 'foret', 440, 1320),
  s('vieux_chene', 'Vieux-Chêne', 'bief', 'foret', 300, 1360),
  s('longuetable', 'Longuetable', 'bief', 'plaine', 570, 1320),
  s('pont_amer', 'Pont-Amer', 'bief', 'plaine', 520, 1400),
  s('cidre', 'Château-Cidre', 'bief', 'plaine', 390, 1410),
  s('hautjardin', 'Hautjardin', 'bief', 'plaine', 340, 1490),
  s('ashford', 'Cendrebourg', 'bief', 'plaine', 470, 1490),
  s('brightwater', 'Clairfont', 'bief', 'plaine', 270, 1570),
  s('corcolline', 'Corcolline', 'bief', 'colline', 450, 1600),
  s('villevieille', 'Villevieille', 'bief', 'plaine', 255, 1645),
  s('treille', 'La Treille', 'bief', 'colline', 164, 1732, 'treille'),
  // Les terres de l'Orage
  s('bronzegate', 'Portebronze', 'orage', 'plaine', 790, 1385),
  s('felwood', 'Bois-Fell', 'orage', 'foret', 650, 1440),
  s('pierremasse', 'Pierredanse', 'orage', 'colline', 850, 1325),
  s('accalmie', 'Accalmie', 'orage', 'colline', 890, 1440),
  s('tarth', 'Tarth', 'orage', 'colline', 1012, 1396, 'tarth'),
  s('lestival_ete', 'Lestival-d’Été', 'orage', 'plaine', 730, 1490),
  s('nid_griffon', 'Nid-du-Griffon', 'orage', 'colline', 940, 1515),
  s('bois_pluie', 'Bois-de-la-Pluie', 'orage', 'foret', 890, 1590),
  s('havrenoir', 'Havrenoir', 'orage', 'colline', 640, 1570),
  s('pierreheaume', 'Pierreheaume', 'orage', 'montagne', 760, 1630),
  s('chant_nuit', 'Chant-de-Nuit', 'orage', 'montagne', 570, 1660),
  // Dorne
  s('lestival', 'Lestival', 'dorne', 'colline', 420, 1795),
  s('tombe_roi', 'Tombe-du-Roi', 'dorne', 'montagne', 500, 1745),
  s('haut_ciel', 'Hautciel', 'dorne', 'montagne', 600, 1745),
  s('enfer_creux', 'L’Enfer-Creux', 'dorne', 'plaine', 560, 1855),
  s('bois_fer', 'Bois-de-Fer', 'dorne', 'montagne', 720, 1765),
  s('vaith', 'Vaith', 'dorne', 'plaine', 700, 1870),
  s('tor', 'Le Tor', 'dorne', 'colline', 845, 1800),
  s('cote_sel', 'Rivage-du-Sel', 'dorne', 'plaine', 860, 1895),
  s('colline_fantome', 'Colline-Fantôme', 'dorne', 'colline', 950, 1790),
  s('jardins', 'Les Jardins Aquatiques', 'dorne', 'plaine', 975, 1880),
  s('lancehelion', 'Lancehélion', 'dorne', 'plaine', 1040, 1835),
];

/** Fleuves : paires de comtés voisins séparés par un cours d'eau. */
export const RIVER_PAIRS: [string, string][] = [
  // Le Couteau Blanc
  ['blancport', 'cerwyn'],
  ['blancport', 'hornwood'],
  ['cerwyn', 'hornwood'],
  // La Verfleuve et le Trident
  ['jumeaux', 'corneilla'],
  ['jumeaux', 'salvemer'],
  ['corneilla', 'harrenhal'],
  ['vivesaigues', 'vierge_rose'],
  ['vivesaigues', 'harrenhal'],
  ['vivesaigues', 'haie_pierre'],
  ['harrenhal', 'darry'],
  ['darry', 'viergetang'],
  // La Néra
  ['port_real', 'rosby'],
  ['port_real', 'stokeworth'],
  ['haie_pierre', 'dent_or'],
  // La Mander
  ['pont_amer', 'longuetable'],
  ['hautjardin', 'cidre'],
  ['hautjardin', 'ashford'],
  ['cidre', 'pont_amer'],
];

/** Traversées par mer (îles), qui comptent comme des frontières. */
export const CROSSINGS: [string, string][] = [
  ['ile_ours', 'motte'],
  ['ile_ours', 'bois_loups'],
  ['vieux_wyk', 'grand_wyk'],
  ['vieux_wyk', 'harlaw'],
  ['grand_wyk', 'pyk'],
  ['pyk', 'harlaw'],
  ['pyk', 'banefort'],
  ['harlaw', 'salvemer'],
  ['harlaw', 'griseaux'],
  ['belle_ile', 'crique'],
  ['belle_ile', 'castral_roc'],
  ['peyredragon', 'griffe'],
  ['peyredragon', 'lamarck'],
  ['lamarck', 'port_real'],
  ['lamarck', 'pierremasse'],
  ['tarth', 'accalmie'],
  ['tarth', 'nid_griffon'],
  ['treille', 'villevieille'],
  ['treille', 'brightwater'],
];

/** Terres hors du jeu, autour de la carte. */
export const FOREIGN: { name: string; kind: 'royaume' | 'inexplore'; poly: P[]; label: P }[] = [
  {
    name: 'Au-delà du Mur',
    kind: 'inexplore',
    poly: [
      [180, 0],
      [960, 0],
      [960, 60],
      [880, 110],
      [822, 150],
      [300, 150],
      [250, 110],
      [180, 60],
    ],
    label: [560, 80],
  },
  {
    name: 'Essos — les Cités libres',
    kind: 'royaume',
    poly: [
      [1110, 700],
      [1200, 680],
      [1200, 1500],
      [1150, 1420],
      [1130, 1250],
      [1150, 1100],
      [1100, 960],
      [1120, 840],
    ],
    label: [1150, 1060],
  },
];

/** Le Mur, d'ouest en est. */
export const WALL: P[] = [
  [292, 150],
  [822, 150],
];
