/**
 * Personnes et comtés concernés par un événement, pour afficher leur fiche avant de choisir :
 * les rôles de la portée, puis ceux que citent les effets des choix (événements générés).
 */
import type { GameState } from '../state';
import type { EventDef } from './types';

export interface EventSubject {
  kind: 'perso' | 'comte';
  id: string;
  /** Rôle dans l'événement (« Pupille », « Ennemi »…), si connu. */
  role?: string;
}

const ROLE_LABELS: Record<string, string> = {
  enfant: 'Enfant',
  conjoint: 'Conjoint',
  vassal: 'Vassal',
  proche: 'Proche',
  etranger: 'Étranger',
  ennemi: 'Ennemi',
  heritier: 'Héritier',
  rival: 'Rival',
  courtisan: 'Courtisan',
  ami: 'Ami',
  amant: 'Amant',
  complotiste: 'Complotiste',
  comte: 'Comté',
  comte_rival: 'Comté rival',
  pupille: 'Pupille',
  parent: 'Sa famille',
  allie: 'Allié',
  proposant: 'Proposant',
  pretendant: 'Prétendant',
  promis: 'Promis',
  otage: 'Otage',
  famille: 'Sa famille',
};

export function eventSubjects(
  state: GameState,
  def: EventDef | undefined,
  scope: Record<string, string>,
): EventSubject[] {
  const out: EventSubject[] = [];
  const seen = new Set<string>([state.playerId]);
  const add = (id: string, role?: string) => {
    if (seen.has(id)) return;
    if (state.characters[id]) out.push({ kind: 'perso', id, role });
    else if (state.counties[id]) out.push({ kind: 'comte', id, role });
    else return;
    seen.add(id);
  };
  for (const [key, id] of Object.entries(scope))
    if (key !== 'souverain') add(id, ROLE_LABELS[key] ?? undefined);
  // Identifiants cités dans les effets (mariage proposé, pupille, otage…).
  const scan = (v: unknown): void => {
    if (typeof v === 'string') add(v);
    else if (Array.isArray(v)) v.forEach(scan);
    else if (v && typeof v === 'object') Object.values(v).forEach(scan);
  };
  for (const c of def?.choix ?? []) scan(c.effets);
  return out;
}
