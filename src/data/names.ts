/**
 * Syllabes de la culture fictive des Marches d'Aveline.
 * Les noms sont composés à partir de ces listes ; aucun nom n'est repris d'une œuvre existante.
 */
export const NAMES = {
  starts: [
    'Al', 'Am', 'Ber', 'Bo', 'Ca', 'Cor', 'Da', 'Del', 'E', 'Er', 'Fa', 'Fol', 'Ga', 'Gil',
    'Ha', 'Hu', 'I', 'Is', 'Jo', 'La', 'Lo', 'Ma', 'Mor', 'Na', 'No', 'O', 'Or', 'Pe', 'Ra',
    'Ro', 'Sa', 'Se', 'Ta', 'Ti', 'U', 'Va', 'Vi', 'Ys',
  ],
  middles: ['', '', '', 'r', 'l', 'n', 'ra', 'li', 'de', 'mo', 'ver', 'ta', 'ri', 'gan'],
  male: ['ric', 'bert', 'ald', 'ouin', 'ien', 'ard', 'o', 'ens', 'mond', 'ran', 'aud', 'el', 'is', 'an'],
  female: ['ine', 'ilde', 'aude', 'ia', 'elle', 'erine', 'ise', 'ane', 'ore', 'ette', 'ée', 'ys'],
  dynastyStarts: [
    'Aub', 'Bel', 'Bran', 'Cal', 'Dor', 'Esc', 'Fen', 'Gar', 'Hal', 'Isc', 'Lan', 'Mal', 'Mir',
    'Nar', 'Orv', 'Pel', 'Quen', 'Ros', 'Sar', 'Tor', 'Var', 'Ver',
  ],
  dynastyEnds: ['ac', 'ennes', 'mont', 'val', 'brac', 'ieu', 'ande', 'or', 'ez', 'aux', 'ignac', 'oisse'],
  placeStarts: [
    'Ave', 'Bar', 'Bris', 'Cam', 'Cler', 'Cor', 'Dun', 'Ell', 'Fal', 'Gor', 'Hau', 'Ister',
    'Kar', 'Lor', 'Mon', 'Mer', 'Nev', 'Ost', 'Pra', 'Quer', 'Riv', 'Sal', 'Ten', 'Ul', 'Vel',
    'Vor', 'Ys', 'Thal',
  ],
  placeEnds: [
    'mont', 'val', 'brac', 'ennes', 'ac', 'ieu', 'ande', 'or', 'ez', 'ine', 'ais', 'ouse',
    'ard', 'erre', 'agne', 'ois', 'euil', 'onne',
  ],
};

export const REGION_NAME = "les Marches d'Aveline";
export const SEASON_NAMES = ['Printemps', 'Été', 'Automne', 'Hiver'] as const;
export const SEASON_KEYS = ['printemps', 'ete', 'automne', 'hiver'] as const;
