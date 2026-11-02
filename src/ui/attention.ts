/**
 * Ce qui demande l'attention du joueur : liste « À faire » du Résumé et rappel de fin de saison.
 * Lecture seule de l'état ; chaque point dit où agir.
 */
import { opinion } from '../engine/characters';
import { wards } from '../engine/diplomacy';
import { perkPoints } from '../engine/progression';
import { capitalOccupied, economyOf, vassalsOf } from '../engine/realm';
import type { GameState } from '../engine/state';
import { warsOf } from '../engine/war';
import { signed } from './components/common';
import type { Inspected, Tab } from './store';

/** Où mène le bouton « Voir » d'un point d'attention. */
export type AttentionGo = { inspect: Inspected } | { tab: Tab; view?: string; anchor?: string };

export interface AttentionItem {
  text: string;
  /** Précision sous le texte (Résumé). */
  detail?: string;
  label: string;
  go: AttentionGo;
  /** Gravité : couleur du liseré dans le Résumé. */
  level: 'bad' | 'warn' | 'info';
  /** Rappelé aussi dans la fenêtre de fin de saison. */
  endSeason: boolean;
}

export function attention(g: GameState): AttentionItem[] {
  const res: AttentionItem[] = [];
  const pl = g.playerId;
  const me = g.characters[pl];
  const pts = perkPoints(me);
  if (pts > 0)
    res.push({
      text: `${pts} point${pts > 1 ? 's' : ''} de talent à dépenser`,
      detail: 'Arbre de talents du souverain',
      label: 'Ouvrir l’arbre',
      go: { inspect: { kind: 'perso', id: pl, tab: 'talents' } },
      level: 'info',
      endSeason: false,
    });
  for (const v of vassalsOf(g, pl)) {
    const op = opinion(g, v, pl);
    if (op < -30 || g.characters[v].inFaction)
      res.push({
        text: `${g.characters[v].name} est mécontent (opinion ${signed(op)}).`,
        detail: g.characters[v].inFaction ? 'Membre d’une faction' : 'Risque de faction',
        label: 'Voir sa fiche',
        go: { inspect: { kind: 'perso', id: v } },
        level: 'bad',
        endSeason: true,
      });
  }
  for (const a of Object.values(g.armies))
    if (a.ownerId === pl && a.supply < 20)
      res.push({
        text: `Votre armée manque de ravitaillement (${Math.round(a.supply)}).`,
        label: 'Voir l’armée',
        go: { inspect: { kind: 'armee', id: a.id } },
        level: 'bad',
        endSeason: true,
      });
  for (const k of wards(g))
    if (!k.educatorId && (g.turn - k.birthTurn) / 4 >= 3)
      res.push({
        text: `${k.name} n’a pas d’éducateur.`,
        detail: 'Cour › Maison',
        label: 'Choisir un éducateur',
        go: { tab: 'cour', view: 'maison', anchor: 'focus-education' },
        level: 'warn',
        endSeason: true,
      });
  const fallen = capitalOccupied(g, pl);
  if (fallen)
    res.push({
      text: `Votre capitale, ${fallen.name}, est occupée : revenus amputés, capitulation possible.`,
      label: 'Voir la capitale',
      go: { inspect: { kind: 'comte', id: fallen.id } },
      level: 'bad',
      endSeason: true,
    });
  const seatsEmpty = Object.values(g.council).filter((s) => !s.holderId).length;
  if (seatsEmpty)
    res.push({
      text: `${seatsEmpty} siège${seatsEmpty > 1 ? 's' : ''} du conseil vacant${seatsEmpty > 1 ? 's' : ''}.`,
      detail: (g.candidates ?? []).length
        ? 'Des candidats sont de passage à la cour'
        : 'Cour › Conseil',
      label: 'Ouvrir le conseil',
      go: { tab: 'cour', view: 'conseil', anchor: 'focus-conseil' },
      level: 'warn',
      endSeason: true,
    });
  const treasury: AttentionGo = { tab: 'royaume', view: 'tresor' };
  if (me.gold < 0)
    res.push({
      text: 'Votre trésor est dans le rouge.',
      label: 'Voir le trésor',
      go: treasury,
      level: 'bad',
      endSeason: true,
    });
  else {
    const eco = economyOf(g, pl);
    if (me.gold + eco.goldNet < 0)
      res.push({
        text: `Votre trésor passera dans le rouge à la saison prochaine (${Math.round(me.gold)} or, ${eco.goldNet > 0 ? '+' : ''}${Math.round(eco.goldNet)} par saison).`,
        label: 'Voir le trésor',
        go: treasury,
        level: 'bad',
        endSeason: true,
      });
  }
  if (
    (g.candidates ?? []).length &&
    g.turn % 4 === 0 &&
    Object.values(g.council).some((s) => !s.holderId)
  )
    res.push({
      text: 'Des candidats de passage sont à la cour et un poste du conseil est vacant.',
      label: 'Voir les candidats',
      go: { tab: 'cour', view: 'courtisans', anchor: 'focus-candidats' },
      level: 'info',
      endSeason: true,
    });
  const prisoners = Object.values(g.characters).filter((c) => c.alive && c.imprisonedBy === pl);
  if (prisoners.length)
    res.push({
      text: `${prisoners.length} prisonnier${prisoners.length > 1 ? 's attendent' : ' attend'} votre décision.`,
      detail: 'Rançon, otage, ralliement ou libération',
      label: 'Voir les prisonniers',
      go: { tab: 'cour', view: 'courtisans', anchor: 'focus-prisonniers' },
      level: 'info',
      endSeason: false,
    });
  return res;
}

/** Pastilles de la barre d'onglets : nombre (Règne) ou simple point. */
export function tabBadges(g: GameState): Partial<Record<Tab, number | 'dot'>> {
  const pl = g.playerId;
  const items = attention(g);
  const badges: Partial<Record<Tab, number | 'dot'>> = {};
  if (items.length) badges.regne = items.length;
  if (perkPoints(g.characters[pl]) > 0 || Object.values(g.council).some((s) => !s.holderId))
    badges.cour = 'dot';
  if (warsOf(g, pl).length) badges.armee = 'dot';
  return badges;
}
