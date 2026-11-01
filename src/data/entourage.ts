/**
 * Profils des candidats de passage à la cour : une compétence mise en avant, des traits
 * possibles et des provenances. Le moteur en tire 3 à 5 chaque année.
 */
import type { SkillKey } from '../engine/state';

export interface ArchetypeDef {
  id: string;
  /** Intitulé masculin / féminin. */
  label: [string, string];
  skill: SkillKey;
  /** Bonus ajouté à la compétence mise en avant. */
  boost: [number, number];
  /** Traits d'éducation ou de caractère possibles (un seul est tiré). */
  traits: string[];
  origins: string[];
  age: [number, number];
  /** Pondération du tirage. */
  weight: number;
}

export const ARCHETYPES: ArchetypeDef[] = [
  {
    id: 'chevalier',
    label: ['Chevalier errant', 'Écuyère émérite'],
    skill: 'guerre',
    boost: [4, 8],
    traits: ['soldat', 'capitaine', 'courageux', 'fort'],
    origins: ['cadet sans terre', 'ancien compagnon d’armes', 'vétéran des guerres d’outre-mer'],
    age: [20, 42],
    weight: 3,
  },
  {
    id: 'lettre',
    label: ['Lettré itinérant', 'Savante de passage'],
    skill: 'savoir',
    boost: [4, 8],
    traits: ['lettre', 'erudit', 'prudent'],
    origins: ['ancien élève d’un monastère', 'copiste en rupture de ban', 'maître d’école renvoyé'],
    age: [22, 55],
    weight: 3,
  },
  {
    id: 'intendant',
    label: ['Intendant sans emploi', 'Gestionnaire avisée'],
    skill: 'gestion',
    boost: [4, 8],
    traits: ['econome', 'administrateur', 'avare'],
    origins: [
      'ancien régisseur d’un domaine ruiné',
      'marchand revenu de tout',
      'fils de percepteur',
    ],
    age: [25, 55],
    weight: 3,
  },
  {
    id: 'diplomate',
    label: ['Émissaire disgracié', 'Dame de compagnie'],
    skill: 'diplomatie',
    boost: [4, 8],
    traits: ['courtois', 'diplomate', 'genereux'],
    origins: ['ancien ambassadeur', 'cadet d’une grande maison', 'ménestrel apprécié des cours'],
    age: [18, 50],
    weight: 3,
  },
  {
    id: 'intrigant',
    label: ['Conseiller de l’ombre', 'Espionne repentie'],
    skill: 'ruse',
    boost: [4, 8],
    traits: ['intrigant', 'maitre_ombres', 'ambitieux'],
    origins: ['ancien agent d’un rival', 'valet aux oreilles fines', 'joueur d’échecs redouté'],
    age: [22, 50],
    weight: 2,
  },
  {
    id: 'polyvalent',
    label: ['Cadet bien né', 'Cadette bien née'],
    skill: 'diplomatie',
    boost: [1, 3],
    traits: ['courageux', 'genereux', 'prudent', 'satisfait'],
    origins: [
      'dernier fils d’un petit seigneur',
      'protégé d’un évêque',
      'orphelin d’une bonne famille',
    ],
    age: [18, 35],
    weight: 2,
  },
];
