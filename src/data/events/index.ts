/**
 * Charge automatiquement tous les fichiers JSON de ce dossier.
 * Ajouter un événement = ajouter un objet dans un fichier JSON (ou un nouveau fichier) : aucune ligne de code.
 */
import type { EventDef } from '../../engine/events/types';

const modules = import.meta.glob<{ default: EventDef[] }>('./*.json', { eager: true });

export const ALL_EVENTS: EventDef[] = Object.entries(modules)
  .sort(([a], [b]) => a.localeCompare(b))
  .flatMap(([file, m]) => {
    const categorie = file.replace('./', '').replace('.json', '') as EventDef['categorie'];
    return m.default.map((e) => ({ categorie, ...e }));
  });
