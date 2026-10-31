/**
 * Origines de départ : une est tirée au hasard à chaque nouvelle partie.
 * Chaque champ est interprété par src/engine/world.ts ; ajouter une origine ne demande
 * que d'ajouter un objet ici.
 */
export interface Origin {
  id: string;
  titre: string;
  texte: string;
  /** Or, prestige et piété ajoutés au départ. */
  or?: number;
  prestige?: number;
  piete?: number;
  /** Âge du souverain [min, max]. */
  age?: [number, number];
  /** Santé ajoutée au souverain. */
  sante?: number;
  traits?: string[];
  /** Nombre d'enfants [min, max]. */
  enfants?: [number, number];
  /** L'aîné est déjà adulte. */
  heritierAdulte?: boolean;
  celibataire?: boolean;
  /** Un vassal ambitieux et hostile. */
  vassalAmbitieux?: boolean;
  /** Un voisin déclare la guerre dès le premier printemps. */
  guerreVoisin?: boolean;
  /** Le conjoint vient de la maison d'un voisin, déjà allié. */
  allianceVoisin?: boolean;
  /** La capitale est fortifiée. */
  citadelle?: boolean;
  /** Revendications supplémentaires sur des comtés voisins. */
  revendications?: number;
  /** Compagnies professionnelles en plus (hommes). */
  troupes?: number;
}

export const ORIGINS: Origin[] = [
  {
    id: 'maison_endettee',
    titre: 'Une maison endettée',
    texte:
      'Votre père a vécu au-dessus de ses moyens : les coffres sont presque vides, mais le nom de votre maison impressionne encore les cours voisines.',
    or: -110,
    prestige: 80,
  },
  {
    id: 'tresor',
    titre: 'Le trésor des ancêtres',
    texte:
      'Sous la grande salle dort un trésor patiemment amassé par trois générations. À vous d’en faire bon usage.',
    or: 260,
  },
  {
    id: 'vieux_lion',
    titre: 'Le vieux lion',
    texte:
      'Vous avez régné longtemps et gagné bien des batailles. Votre héritier est un homme fait ; le temps vous est compté.',
    age: [52, 58],
    sante: -15,
    traits: ['stratege'],
    heritierAdulte: true,
    prestige: 100,
  },
  {
    id: 'jeune_heritier',
    titre: 'Un trône trop grand',
    texte:
      'La mort soudaine de votre parent vous a placé sur le trône à peine sorti de l’enfance. Les vassaux vous jaugent.',
    age: [16, 18],
    celibataire: true,
    enfants: [0, 0],
    prestige: -50,
    vassalAmbitieux: true,
  },
  {
    id: 'frontiere_en_feu',
    titre: 'La frontière en feu',
    texte:
      'Un voisin réclame depuis longtemps une de vos terres. Ce printemps, ses bannières franchissent la frontière.',
    guerreVoisin: true,
    troupes: 300,
  },
  {
    id: 'vassal_puissant',
    titre: 'Un vassal trop puissant',
    texte:
      'L’un de vos vassaux ne cache plus son ambition. Sa loyauté est à reconquérir… ou à briser.',
    vassalAmbitieux: true,
    or: 60,
  },
  {
    id: 'alliance_de_sang',
    titre: 'Une alliance de sang',
    texte:
      'Votre mariage a uni votre maison à celle d’un voisin. Ce lien vous protège, et vous engage.',
    allianceVoisin: true,
  },
  {
    id: 'famille_nombreuse',
    titre: 'Une famille nombreuse',
    texte:
      'Votre maison grouille d’enfants. L’avenir de la lignée semble assuré, mais le Partage risque de morceler vos terres.',
    enfants: [4, 5],
  },
  {
    id: 'citadelle',
    titre: 'La citadelle',
    texte:
      'Vos ancêtres ont fait de votre capitale une forteresse et de ses casernes une école de soldats.',
    citadelle: true,
    or: -40,
  },
  {
    id: 'vieux_droits',
    titre: 'De vieux droits',
    texte:
      'Les archives de votre maison regorgent de chartes : bien des terres voisines vous reviennent, à qui saura les prendre.',
    revendications: 3,
    prestige: 40,
  },
  {
    id: 'saint_homme',
    titre: 'Un saint dans la famille',
    texte:
      'Un de vos aïeux est vénéré comme un saint. Le clergé vous est acquis, et le peuple vous regarde avec respect.',
    piete: 160,
    traits: ['juste'],
  },
  {
    id: 'mercenaires',
    titre: 'L’épée louée',
    texte:
      'Votre maison s’est enrichie en louant ses lances aux princes voisins. Il en reste des compagnies aguerries.',
    troupes: 600,
    or: -60,
  },
];
