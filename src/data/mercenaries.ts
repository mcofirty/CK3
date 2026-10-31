/** Compagnies de mercenaires à louer : chères, mais disponibles tout de suite. */
import type { UnitCounts } from '../engine/state';

export interface MercCompanyDef {
  id: string;
  name: string;
  origin: string;
  description: string;
  men: Partial<UnitCounts>;
  /** Prix du contrat (or), payé à la signature. */
  cost: number;
}

export const MERCENARIES: MercCompanyDef[] = [
  {
    id: 'lion_noir',
    name: 'Compagnie du Lion Noir',
    origin: 'Vétérans des guerres d’outre-mer',
    description: 'Infanterie lourde disciplinée, qui ne recule jamais.',
    men: { infanterie: 400, piquiers: 200 },
    cost: 260,
  },
  {
    id: 'arcs_gris',
    name: 'Les Arcs gris',
    origin: 'Chasseurs des forêts du nord',
    description: 'Archers redoutables, piquiers pour les couvrir.',
    men: { archers: 400, piquiers: 200 },
    cost: 210,
  },
  {
    id: 'lances_libres',
    name: 'Les Lances libres',
    origin: 'Chevaliers sans terre',
    description: 'Cavalerie lourde, la plus chère et la plus terrible.',
    men: { cavalerie: 300 },
    cost: 280,
  },
  {
    id: 'bande_corbeaux',
    name: 'La Bande des Corbeaux',
    origin: 'Routiers de mauvaise réputation',
    description: 'Une horde nombreuse et bon marché, peu fiable.',
    men: { levees: 600, infanterie: 150, archers: 100 },
    cost: 150,
  },
];

export const MERC_BY_ID: Record<string, MercCompanyDef> = Object.fromEntries(
  MERCENARIES.map((m) => [m.id, m]),
);
