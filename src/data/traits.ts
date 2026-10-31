import type { SkillKey } from '../engine/state';

export type TraitCategory = 'personnalite' | 'education' | 'hereditaire' | 'acquis';
export type BattleAbility =
  | 'stratege'
  | 'impetueux'
  | 'prudent'
  | 'inebranlable'
  | 'cavalier'
  | 'inspirant'
  | 'lache';

export interface TraitDef {
  id: string;
  name: string;
  category: TraitCategory;
  description: string;
  opposite?: string;
  skills?: Partial<Record<SkillKey, number>>;
  /** Modificateur de santé (points). */
  health?: number;
  /** Fertilité (multiplicateur de la chance de naissance). */
  fertility?: number;
  /** Opinion des vassaux envers un suzerain portant ce trait. */
  vassalOpinion?: number;
  /** Agressivité de l'IA (positif = plus belliqueux). */
  aggression?: number;
  /** Multiplicateur de revenus du domaine propre. */
  income?: number;
  /** Poids d'événements : étiquette → multiplicateur. */
  eventWeights?: Record<string, number>;
  battle?: BattleAbility;
  /** Compétence et rang pour les traits d'éducation. */
  education?: { skill: SkillKey; tier: 1 | 2 };
}

export const TRAITS: Record<string, TraitDef> = {
  // --- Personnalité (paires opposées) ---
  courageux: { id: 'courageux', name: 'Courageux', category: 'personnalite', opposite: 'lache', description: 'Ne recule devant aucun danger.', skills: { guerre: 2 }, aggression: 0.1, vassalOpinion: 5, eventWeights: { guerre: 1.5 } },
  lache: { id: 'lache', name: 'Lâche', category: 'personnalite', opposite: 'courageux', description: 'Préfère la ruse au fer. En bataille, son front peut fuir sous 30 de moral.', skills: { guerre: -2, ruse: 1 }, aggression: -0.2, vassalOpinion: -5, battle: 'lache' },
  ambitieux: { id: 'ambitieux', name: 'Ambitieux', category: 'personnalite', opposite: 'satisfait', description: 'Veut toujours davantage. Peut déclarer des guerres de conquête.', skills: { diplomatie: 1, guerre: 1, gestion: 1, ruse: 1, savoir: 1 }, aggression: 0.35, vassalOpinion: -5, eventWeights: { intrigue: 1.5 } },
  satisfait: { id: 'satisfait', name: 'Satisfait', category: 'personnalite', opposite: 'ambitieux', description: 'Se contente de ce qu’il a.', skills: { ruse: -1 }, aggression: -0.35, vassalOpinion: 5 },
  juste: { id: 'juste', name: 'Juste', category: 'personnalite', opposite: 'cruel', description: 'Rend la justice sans faveur.', skills: { diplomatie: 1, savoir: 1, ruse: -2 }, vassalOpinion: 10, eventWeights: { religion: 1.3 } },
  cruel: { id: 'cruel', name: 'Cruel', category: 'personnalite', opposite: 'juste', description: 'Inspire la crainte plutôt que l’amour.', skills: { ruse: 1, guerre: 1, diplomatie: -2 }, aggression: 0.15, vassalOpinion: -10 },
  genereux: { id: 'genereux', name: 'Généreux', category: 'personnalite', opposite: 'avare', description: 'Distribue sans compter.', skills: { diplomatie: 2 }, vassalOpinion: 10, income: 0.9 },
  avare: { id: 'avare', name: 'Avare', category: 'personnalite', opposite: 'genereux', description: 'Compte chaque pièce.', skills: { gestion: 2, diplomatie: -1 }, vassalOpinion: -5, income: 1.1 },
  prudent: { id: 'prudent', name: 'Prudent', category: 'personnalite', opposite: 'impetueux', description: 'Mesure chaque risque. En bataille, Tenir donne défense ×1,55.', skills: { gestion: 1, savoir: 1 }, aggression: -0.2, battle: 'prudent' },
  impetueux: { id: 'impetueux', name: 'Impétueux', category: 'personnalite', opposite: 'prudent', description: 'Agit d’abord. En bataille, ses charges sont plus fortes mais il ne se replie jamais.', skills: { guerre: 2, gestion: -1 }, aggression: 0.25, battle: 'impetueux' },

  // --- Éducation (attribuée à 16 ans) ---
  courtois: { id: 'courtois', name: 'Courtois', category: 'education', description: 'Éducation diplomatique honnête.', skills: { diplomatie: 2 }, education: { skill: 'diplomatie', tier: 1 } },
  diplomate: { id: 'diplomate', name: 'Diplomate accompli', category: 'education', description: 'Éducation diplomatique brillante.', skills: { diplomatie: 4 }, education: { skill: 'diplomatie', tier: 2 } },
  soldat: { id: 'soldat', name: 'Soldat', category: 'education', description: 'Éducation martiale honnête.', skills: { guerre: 2 }, education: { skill: 'guerre', tier: 1 } },
  capitaine: { id: 'capitaine', name: 'Capitaine aguerri', category: 'education', description: 'Éducation martiale brillante.', skills: { guerre: 4 }, education: { skill: 'guerre', tier: 2 } },
  econome: { id: 'econome', name: 'Économe', category: 'education', description: 'Éducation de gestionnaire honnête.', skills: { gestion: 2 }, education: { skill: 'gestion', tier: 1 } },
  administrateur: { id: 'administrateur', name: 'Administrateur avisé', category: 'education', description: 'Éducation de gestionnaire brillante.', skills: { gestion: 4 }, education: { skill: 'gestion', tier: 2 } },
  intrigant: { id: 'intrigant', name: 'Intrigant', category: 'education', description: 'Éducation dans l’art du secret.', skills: { ruse: 2 }, education: { skill: 'ruse', tier: 1 } },
  maitre_ombres: { id: 'maitre_ombres', name: 'Maître des ombres', category: 'education', description: 'Brillante éducation dans l’art du secret.', skills: { ruse: 4 }, education: { skill: 'ruse', tier: 2 } },
  lettre: { id: 'lettre', name: 'Lettré', category: 'education', description: 'Éducation savante honnête.', skills: { savoir: 2 }, education: { skill: 'savoir', tier: 1 } },
  erudit: { id: 'erudit', name: 'Érudit', category: 'education', description: 'Éducation savante brillante.', skills: { savoir: 4 }, education: { skill: 'savoir', tier: 2 } },

  // --- Héréditaires ---
  fort: { id: 'fort', name: 'Fort', category: 'hereditaire', description: 'D’une force peu commune.', skills: { guerre: 2 }, health: 10, vassalOpinion: 3 },
  genie: { id: 'genie', name: 'Génie', category: 'hereditaire', description: 'Un esprit hors du commun.', skills: { diplomatie: 3, guerre: 3, gestion: 3, ruse: 3, savoir: 3 }, vassalOpinion: 5 },
  robuste: { id: 'robuste', name: 'Robuste', category: 'hereditaire', description: 'Rarement malade.', health: 15, fertility: 1.2 },
  faible: { id: 'faible', name: 'Faible', category: 'hereditaire', description: 'De constitution fragile.', skills: { guerre: -2 }, health: -10, vassalOpinion: -3 },
  lent: { id: 'lent', name: 'Lent', category: 'hereditaire', description: 'L’esprit peu vif.', skills: { diplomatie: -2, guerre: -2, gestion: -2, ruse: -2, savoir: -2 }, vassalOpinion: -5 },

  // --- Acquis ---
  blesse: { id: 'blesse', name: 'Blessé', category: 'acquis', description: 'Porte une blessure qui tarde à guérir.', skills: { guerre: -2 }, health: -15 },
  malade: { id: 'malade', name: 'Malade', category: 'acquis', description: 'Rongé par la maladie.', skills: { diplomatie: -1, guerre: -1, gestion: -1, ruse: -1, savoir: -1 }, health: -25, fertility: 0.5 },
  stratege: { id: 'stratege', name: 'Stratège', category: 'acquis', description: '+1 niveau de reconnaissance ; voit les ordres ennemis du premier round.', skills: { guerre: 2 }, battle: 'stratege' },
  cavalier: { id: 'cavalier', name: 'Cavalier émérite', category: 'acquis', description: 'Feindre la retraite toujours possible ; cavalerie ×1,1.', skills: { guerre: 1 }, battle: 'cavalier' },
  inebranlable: { id: 'inebranlable', name: 'Inébranlable', category: 'acquis', description: 'Son front ne perd jamais plus de 20 de moral par round.', battle: 'inebranlable', vassalOpinion: 3 },
  inspirant: { id: 'inspirant', name: 'Inspirant', category: 'acquis', description: 'Peut Rallier une fois par bataille : +25 de moral au front.', skills: { diplomatie: 1 }, battle: 'inspirant', vassalOpinion: 5 },
};

export const PERSONALITY_TRAITS = Object.values(TRAITS)
  .filter((t) => t.category === 'personnalite')
  .map((t) => t.id);
export const HEREDITARY_TRAITS = Object.values(TRAITS)
  .filter((t) => t.category === 'hereditaire')
  .map((t) => t.id);
export const EDUCATION_TRAITS = Object.values(TRAITS)
  .filter((t) => t.category === 'education')
  .map((t) => t.id);

export function educationTrait(skill: SkillKey, tier: 1 | 2): string {
  const t = Object.values(TRAITS).find(
    (d) => d.education?.skill === skill && d.education.tier === tier,
  );
  if (!t) throw new Error(`Trait d'éducation introuvable: ${skill} ${tier}`);
  return t.id;
}
