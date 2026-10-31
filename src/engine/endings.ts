/** Fins de partie et succès. */
import type { EndingId, GameState } from './state';
import { notify } from './context';
import { realmCounties } from './realm';

export interface EndingDef {
  id: EndingId;
  title: string;
  text: string;
  icon: string;
}

export const ENDINGS: Record<EndingId, EndingDef> = {
  empire: {
    id: 'empire',
    title: 'L’Empire',
    icon: '🦅',
    text: 'Plusieurs couronnes sur une seule tête : votre maison a forgé un empire dont on parlera pendant mille ans.',
  },
  couronne: {
    id: 'couronne',
    title: 'La Couronne',
    icon: '👑',
    text: 'Votre maison porte la couronne. Les chroniqueurs la nomment désormais « la lignée royale ».',
  },
  puissance: {
    id: 'puissance',
    title: 'La Puissance',
    icon: '🏰',
    text: 'Sans couronne, mais nul roi n’ose rien sans l’avis de votre maison, maîtresse de vastes terres.',
  },
  legende: {
    id: 'legende',
    title: 'La Légende',
    icon: '📜',
    text: 'Vos terres sont modestes, mais votre nom brille dans toutes les chansons : une maison de légende.',
  },
  survie: {
    id: 'survie',
    title: 'La Survie',
    icon: '🕯️',
    text: 'À travers guerres, pestes et trahisons, votre maison a tenu. Ce n’est pas rien.',
  },
  extinction: {
    id: 'extinction',
    title: 'L’Extinction',
    icon: '⚱️',
    text: 'Le dernier héritier s’en est allé. Il ne reste de votre maison que des tombeaux et des chroniques.',
  },
  ruine: {
    id: 'ruine',
    title: 'La Ruine',
    icon: '🏚️',
    text: 'Dépossédée de ses terres, votre maison s’efface de l’histoire des Marches.',
  },
};

/** Fin atteinte, d'après l'état final (sauf extinction et ruine, fixées au moment où elles arrivent). */
export function computeEnding(state: GameState): EndingId {
  const members = new Set(
    Object.values(state.characters)
      .filter((c) => c.alive && c.dynastyId === state.playerDynastyId)
      .map((c) => c.id),
  );
  const kingdoms = Object.values(state.kingdoms).filter(
    (k) => k.holderId && members.has(k.holderId),
  ).length;
  if (kingdoms >= 2) return 'empire';
  if (kingdoms >= 1) return 'couronne';
  const p = state.characters[state.playerId];
  if (p && realmCounties(state, p.id).length >= 12) return 'puissance';
  if ((state.dynasties[state.playerDynastyId]?.renown ?? 0) >= 1500) return 'legende';
  return 'survie';
}

// ---------------------------------------------------------------------------
// Succès
// ---------------------------------------------------------------------------

export interface AchievementDef {
  id: string;
  name: string;
  description: string;
  icon: string;
  check: (s: GameState) => boolean;
}

const st = (s: GameState) => s.stats;
const holdsKingdoms = (s: GameState) =>
  Object.values(s.kingdoms).filter(
    (k) => k.holderId && s.characters[k.holderId]?.dynastyId === s.playerDynastyId,
  ).length;

export const ACHIEVEMENTS: AchievementDef[] = [
  {
    id: 'premier_sang',
    name: 'Premier sang',
    icon: '⚔️',
    description: 'Remporter une bataille.',
    check: (s) => (st(s)?.battlesWon ?? 0) >= 1,
  },
  {
    id: 'general',
    name: 'Grand capitaine',
    icon: '🎖️',
    description: 'Remporter dix batailles.',
    check: (s) => (st(s)?.battlesWon ?? 0) >= 10,
  },
  {
    id: 'duel',
    name: 'Champion',
    icon: '🤺',
    description: 'Remporter un duel devant les armées.',
    check: (s) => (st(s)?.duelsWon ?? 0) >= 1,
  },
  {
    id: 'couronne',
    name: 'Couronné',
    icon: '👑',
    description: 'Tenir un titre royal.',
    check: (s) => holdsKingdoms(s) >= 1,
  },
  {
    id: 'empire',
    name: 'Empereur',
    icon: '🦅',
    description: 'Tenir deux titres royaux.',
    check: (s) => holdsKingdoms(s) >= 2,
  },
  {
    id: 'lignee',
    name: 'Une lignée',
    icon: '🌳',
    description: 'Voir régner trois souverains de votre maison.',
    check: (s) => (s.rulers?.length ?? 0) >= 3,
  },
  {
    id: 'centenaire',
    name: 'Centenaire',
    icon: '⏳',
    description: 'Faire durer la maison cent ans.',
    check: (s) => s.turn >= 400 && !s.gameOver?.ending?.match(/extinction|ruine/),
  },
  {
    id: 'chronique',
    name: 'Cent cinquante ans',
    icon: '📖',
    description: 'Achever la chronique de la maison.',
    check: (s) => s.turn >= 600,
  },
  {
    id: 'ambitions',
    name: 'Grands desseins',
    icon: '🎯',
    description: 'Accomplir trois ambitions.',
    check: (s) => (s.rulers ?? []).reduce((n, r) => n + r.ambitions.length, 0) >= 3,
  },
  {
    id: 'heritages',
    name: 'Maison illustre',
    icon: '🏛️',
    description: 'Acquérir cinq héritages de la maison.',
    check: (s) => (s.dynasties[s.playerDynastyId]?.legacies?.length ?? 0) >= 5,
  },
  {
    id: 'maitre',
    name: 'Maître accompli',
    icon: '✨',
    description: 'Un souverain aux huit talents.',
    check: (s) => (s.characters[s.playerId]?.perks?.length ?? 0) >= 8,
  },
  {
    id: 'ombres',
    name: 'Maître des ombres',
    icon: '🗝️',
    description: 'Mener trois complots à leur terme.',
    check: (s) => (st(s)?.plotsDone ?? 0) >= 3,
  },
  {
    id: 'peste',
    name: 'Survivant',
    icon: '☠️',
    description: 'Voir une épidémie quitter votre royaume.',
    check: (s) => (st(s)?.plaguesSurvived ?? 0) >= 1,
  },
  {
    id: 'otage',
    name: 'Garant de la paix',
    icon: '🤝',
    description: 'Retenir un otage à votre cour.',
    check: (s) => (st(s)?.hostages ?? 0) >= 1,
  },
  {
    id: 'crise',
    name: 'Le poids de la couronne',
    icon: '🌧️',
    description: 'Traverser une crise de stress.',
    check: (s) => (st(s)?.crises ?? 0) >= 1,
  },
  {
    id: 'mecene',
    name: 'Seigneur actif',
    icon: '🏇',
    description: 'Prendre dix décisions.',
    check: (s) => (st(s)?.decisions ?? 0) >= 10,
  },
  {
    id: 'riche',
    name: 'Trésor royal',
    icon: '💰',
    description: 'Amasser mille pièces d’or.',
    check: (s) => (s.characters[s.playerId]?.gold ?? 0) >= 1000,
  },
  {
    id: 'grand_royaume',
    name: 'Grand royaume',
    icon: '🗺️',
    description: 'Régner sur quinze comtés.',
    check: (s) => (st(s)?.maxCounties ?? 0) >= 15,
  },
  {
    id: 'prophetie',
    name: 'Le destin accompli',
    icon: '🔮',
    description: 'Voir la prophétie de la voyante s’accomplir.',
    check: (s) => s.eventCooldowns['chr_prophetie_3'] !== undefined,
  },
  {
    id: 'invasion',
    name: 'Rempart des Marches',
    icon: '🛡️',
    description: 'Repousser une invasion d’outre-mer.',
    check: (s) => s.flags?.invasion_repoussee !== undefined,
  },
];

/** Débloque les succès atteints ; renvoie les nouveaux. */
export function checkAchievements(state: GameState): string[] {
  const got = new Set(state.achievements ?? []);
  const fresh: string[] = [];
  for (const a of ACHIEVEMENTS) {
    if (got.has(a.id)) continue;
    let ok = false;
    try {
      ok = a.check(state);
    } catch {
      ok = false;
    }
    if (!ok) continue;
    fresh.push(a.id);
    notify(state, `Succès débloqué : ${a.icon} ${a.name}.`);
  }
  if (fresh.length) state.achievements = [...got, ...fresh];
  return fresh;
}
