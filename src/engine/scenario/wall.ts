/**
 * Le Mur et la Garde de Nuit (mode Trône de fer). Les frères tiennent le Mur avec les hommes et
 * les vivres que leur envoient les seigneurs ; au-delà, les sauvageons se pressent et les Autres
 * se réveillent. Si la menace dépasse la défense trop longtemps, le Mur tombe : la Longue Nuit
 * commence et les morts descendent sur le Nord, comté après comté.
 */
import { BALANCE } from '../../data/balance';
import type { Effect, EventDef } from '../events/types';
import { addTrait } from '../characters';
import { notify, worldNews, type Ctx } from '../context';
import { domainCounties } from '../realm';
import type { County, GameState } from '../state';

const W = BALANCE.wall;

export function initWall(state: GameState, commanderId?: string): void {
  state.wall = {
    men: W.startMen,
    supply: W.startSupply,
    threat: W.startThreat,
    wildlings: W.startWildlings,
    dragonglass: 0,
    strain: 0,
    commanderId,
  };
}

/** Défense du Mur : les frères, nourris ou non, et le verredragon. */
export function wallDefense(state: GameState): number {
  const w = state.wall;
  if (!w || w.fallenTurn !== undefined) return 0;
  return Math.round((w.men / 10) * (0.5 + w.supply / 200) + w.dragonglass * W.dragonglassDefense);
}

export function wallStatus(state: GameState): 'tient' | 'vacille' | 'tombe' {
  const w = state.wall;
  if (!w) return 'tient';
  if (w.fallenTurn !== undefined) return 'tombe';
  return w.threat > wallDefense(state) || w.strain > 0 ? 'vacille' : 'tient';
}

/** Comtés submergés par les morts. */
export function blightedCounties(state: GameState): County[] {
  return Object.values(state.counties).filter((c) => c.blighted);
}

const yOf = (state: GameState, id: string) =>
  state.map.counties.find((c) => c.id === id)?.y ?? 9999;

/** Prochain comté sur le chemin des morts : le plus au nord parmi ceux qui bordent leur avancée. */
export function nextToFall(state: GameState): County | undefined {
  const lost = blightedCounties(state);
  const lostIds = new Set(lost.map((c) => c.id));
  const front = lost.length
    ? Object.values(state.counties).filter(
        (c) => !c.blighted && c.adjacent.some((n) => lostIds.has(n)),
      )
    : Object.values(state.counties).filter((c) => !c.blighted);
  return front.sort((a, b) => yOf(state, a.id) - yOf(state, b.id))[0];
}

/** Ajoute un événement embarqué pour le joueur. */
function push(
  state: GameState,
  def: Omit<EventDef, 'declencheur' | 'poids'>,
  scope: Record<string, string> = {},
) {
  state.pendingEvents.push({
    uid: `e${++state.nextId}`,
    eventId: def.id,
    scope: { souverain: state.playerId, ...scope },
    inline: { ...def, declencheur: { type: 'suite' }, poids: 0 },
  });
}

/** Effet d'événement « mur » : hommes, vivres, menace, sauvageons, verredragon, comté. */
export function applyWallEffect(
  state: GameState,
  e: NonNullable<Effect['mur']>,
  countyId?: string,
): void {
  const w = state.wall;
  if (!w) return;
  if (e.hommes) w.men = Math.max(0, Math.round(w.men + e.hommes));
  if (e.vivres) w.supply = clamp(w.supply + e.vivres);
  if (e.menace) w.threat = clamp(w.threat + e.menace);
  if (e.sauvageons) w.wildlings = clamp(w.wildlings + e.sauvageons);
  if (e.verredragon) w.dragonglass = Math.max(0, w.dragonglass + e.verredragon);
  const c = countyId ? state.counties[countyId] : undefined;
  if (c && e.submerger) blight(state, c);
  if (c && e.liberer) c.blighted = false;
}

const clamp = (v: number) => Math.max(0, Math.min(100, v));

function blight(state: GameState, c: County): void {
  if (c.blighted) return;
  c.blighted = true;
  c.levyPool = 0;
  worldNews(state, `Les morts submergent ${c.name}.`, 'fait');
}

/** Libellés des effets « mur » (fenêtre d'événement). */
export function wallEffectLabels(e: NonNullable<Effect['mur']>, county?: string): string[] {
  const out: string[] = [];
  const s = (n: number) => (n > 0 ? `+${n}` : `${n}`);
  if (e.hommes) out.push(`Frères de la Garde : ${s(e.hommes)}`);
  if (e.vivres) out.push(`Vivres du Mur : ${s(e.vivres)}`);
  if (e.menace) out.push(`Menace des Autres : ${s(e.menace)}`);
  if (e.sauvageons) out.push(`Sauvageons : ${s(e.sauvageons)}`);
  if (e.verredragon) out.push(`Verredragon : ${s(e.verredragon)}`);
  if (e.submerger) out.push(`${county ?? 'Le comté'} tombe aux mains des morts`);
  if (e.liberer) out.push(`${county ?? 'Le comté'} est libéré`);
  return out;
}

/** Force de l'armée des morts dans une bataille, selon la menace et le verredragon. */
export function deadForce(state: GameState): number {
  const w = state.wall!;
  return Math.max(
    0.45,
    Math.round((W.deadForce + w.threat / 100 - w.dragonglass * W.deadForcePerGlass) * 100) / 100,
  );
}

const DEAD = { levees: 6, infanterie: 3, cavalerie: 1 };
const WILDLINGS = { levees: 6, archers: 3, infanterie: 1 };

export function seasonWall(ctx: Ctx): void {
  const { state, rng } = ctx;
  const w = state.wall;
  if (!w) return;
  const winter = state.turn % 4 === 3;
  const fallen = w.fallenTurn !== undefined;
  // La menace des Autres monte, plus vite en hiver et quand la Longue Nuit approche.
  let growth = W.threatGrowth + (winter ? W.threatWinter : 0);
  if (state.turn >= W.threatSurgeTurn) growth *= W.threatSurgeMult;
  if (fallen) growth /= 2;
  // Les dragons de Daenerys, à Westeros, brûlent les morts.
  if (state.essos?.alive && state.essos.stage >= 6) growth -= state.essos.dragons * W.dragonBurn;
  w.threat = clamp(w.threat + growth);
  if (!fallen) {
    // Frères : désertions et morts, recrues des autres seigneurs ; vivres consommés.
    w.men = Math.max(
      0,
      Math.round(w.men * (1 - W.attrition) + rng.int(W.aiRecruits[0], W.aiRecruits[1])),
    );
    w.supply = clamp(w.supply - W.supplyUse + W.aiSupply);
    w.wildlings = clamp(w.wildlings + W.wildlingGrowth + w.threat * W.wildlingPerThreat);
    const def = wallDefense(state);
    w.strain = w.threat > def ? w.strain + 1 : 0;
    if (w.strain >= W.strainToFall) {
      fall(state);
      return;
    }
    // Les sauvageons franchissent le Mur mal gardé et pillent le Nord.
    if (w.wildlings > def * 0.8 && rng.chance(0.3)) wildlingRaid(ctx);
    if (rng.chance(W.eventChance)) wallEvent(ctx);
    return;
  }
  // La Longue Nuit : les morts avancent, les terres submergées dépérissent.
  for (const c of blightedCounties(state)) {
    c.levyPool = 0;
    c.vitality = Math.max(0.2, (c.vitality ?? 1) - 0.08);
    if (rng.chance(0.25)) c.development = Math.max(0, c.development - 1);
  }
  if (w.threat <= W.dawnThreat) {
    for (const c of blightedCounties(state)) c.blighted = false;
    w.fallenTurn = undefined;
    w.men = W.dawnMen;
    w.supply = W.dawnSupply;
    w.strain = 0;
    worldNews(state, 'Les morts refluent vers le nord : la Longue Nuit s’achève.', 'fait');
    push(state, {
      id: 'mur_aube',
      titre: 'L’aube',
      texte:
        'Les morts ont reflué au-delà des ruines du Mur. Les survivants rentrent sur leurs terres brûlées, et une poignée de frères relève la Garde de Nuit. Il faudra des hommes et des vivres avant que l’hiver ne revienne.',
      categorie: 'systeme',
      choix: [{ libelle: 'Rebâtir ce qui peut l’être', effets: [] }],
    });
    return;
  }
  if (!rng.chance(W.advanceBase + w.threat / 200)) return;
  const next = nextToFall(state);
  if (!next) return;
  const mine = domainCounties(state, state.playerId).some((c) => c.id === next.id);
  if (mine) {
    const force = deadForce(state);
    push(
      state,
      {
        id: 'mur_morts_marchent',
        titre: `Les morts marchent sur ${next.name}`,
        texte: `Un vent glacé souffle depuis le nord. Des milliers de morts aux yeux bleus avancent vers ${next.name}, et les paysans fuient devant eux. Il faut les arrêter ici, ou leur abandonner la terre.`,
        categorie: 'guerre',
        choix: [
          {
            libelle: 'Livrer bataille',
            effets: [
              {
                bataille: {
                  ennemi: 'l’armée des morts',
                  force,
                  composition: DEAD,
                  victoire: [{ mur: { menace: -12 } }, { prestige: 60 }],
                  defaite: [{ mur: { submerger: true } }, { prestige: -30 }],
                },
              },
            ],
          },
          {
            libelle: 'Fuir vers le sud',
            effets: [{ mur: { submerger: true } }, { stress: 10 }, { prestige: -20 }],
          },
        ],
      },
      { comte: next.id },
    );
  } else if (rng.chance(0.4)) {
    // Un seigneur tient bon : les morts reculent un peu.
    w.threat = clamp(w.threat - 4);
    worldNews(state, `${next.name} repousse les morts, pour cette fois.`, 'guerre');
  } else blight(state, next);
  // Reconquérir une terre perdue, quand les morts faiblissent.
  const lostMine = blightedCounties(state).filter((c) =>
    domainCounties(state, state.playerId).some((x) => x.id === c.id),
  );
  if (lostMine.length && w.threat < 50 && rng.chance(0.3)) {
    const target = rng.pick(lostMine);
    push(
      state,
      {
        id: 'mur_reconquete',
        titre: `Reprendre ${target.name}`,
        texte: `Les morts semblent moins nombreux autour de ${target.name}. Vos capitaines pensent pouvoir reprendre la terre, avec du feu et du verredragon.`,
        categorie: 'guerre',
        choix: [
          {
            libelle: 'Lancer l’assaut',
            effets: [
              {
                bataille: {
                  ennemi: 'l’armée des morts',
                  force: deadForce(state),
                  composition: DEAD,
                  attaque: true,
                  victoire: [{ mur: { liberer: true, menace: -8 } }, { prestige: 40 }],
                  defaite: [{ prestige: -20 }],
                },
              },
            ],
          },
          { libelle: 'Attendre des jours meilleurs', effets: [] },
        ],
      },
      { comte: target.id },
    );
  }
}

/** Le Mur tombe : la Longue Nuit commence. */
function fall(state: GameState): void {
  const w = state.wall!;
  w.fallenTurn = state.turn;
  w.men = 0;
  w.strain = 0;
  worldNews(
    state,
    'Le Mur est tombé. Les Autres et leur armée de morts franchissent la brèche.',
    'guerre',
  );
  notify(state, 'Le Mur est tombé : la Longue Nuit commence.');
  push(state, {
    id: 'mur_chute',
    titre: 'Le Mur est tombé',
    texte:
      'Une corne a sonné trois fois. La glace s’est fendue sur des lieues, et par la brèche descendent les Autres, montés sur des chevaux morts, suivis d’une armée sans fin. La Garde de Nuit n’est plus. L’hiver est venu.',
    categorie: 'systeme',
    choix: [{ libelle: 'Que les dieux nous gardent', effets: [] }],
  });
}

/** Raid des sauvageons sur un comté du nord. */
function wildlingRaid(ctx: Ctx): void {
  const { state, rng } = ctx;
  const target = Object.values(state.counties)
    .filter((c) => !c.blighted)
    .sort((a, b) => yOf(state, a.id) - yOf(state, b.id))
    .slice(0, 4);
  if (!target.length) return;
  const c = rng.pick(target);
  const mine = domainCounties(state, state.playerId).some((x) => x.id === c.id);
  if (mine) {
    push(
      state,
      {
        id: 'mur_raid_sauvageons',
        titre: `Des sauvageons à ${c.name}`,
        texte: `Une bande de sauvageons a franchi le Mur mal gardé. Ils pillent les fermes autour de ${c.name} et emmènent les femmes.`,
        categorie: 'guerre',
        choix: [
          {
            libelle: 'Les poursuivre',
            effets: [
              {
                bataille: {
                  ennemi: 'les sauvageons',
                  force: 0.6,
                  composition: WILDLINGS,
                  attaque: true,
                  victoire: [{ mur: { sauvageons: -15 } }, { prestige: 30 }],
                  defaite: [{ developpement: -1 }],
                },
              },
            ],
          },
          {
            libelle: 'Laisser passer l’orage',
            effets: [{ developpement: -1 }, { contentement: -10 }],
          },
        ],
      },
      { comte: c.id },
    );
  } else {
    c.development = Math.max(0, c.development - 1);
    worldNews(state, `Des sauvageons pillent ${c.name}.`, 'fait');
  }
}

/** Un événement du Mur pour le joueur, choisi parmi ceux que l'état du Mur rend possibles. */
function wallEvent(ctx: Ctx): void {
  const { state, rng } = ctx;
  const w = state.wall!;
  const flags = (state.flags ??= {});
  const commander = w.commanderId ? state.characters[w.commanderId] : undefined;
  const king = state.kingdoms.k_couronnes?.holderId;
  const pool: (() => void)[] = [];
  if (w.threat >= 15)
    pool.push(() =>
      push(state, {
        id: 'mur_patrouille',
        titre: 'Une patrouille disparue',
        texte:
          'Trois patrouilleurs sont partis au-delà du Mur il y a deux lunes. Seul un cheval est revenu, la selle couverte de givre en plein été.',
        categorie: 'guerre',
        choix: [
          {
            libelle: 'Financer une expédition de recherche',
            effets: [{ or: -40 }, { mur: { hommes: -15, menace: -3 } }],
          },
          { libelle: 'Doubler la garde sur le Mur', effets: [{ mur: { vivres: -5 } }] },
        ],
      }),
    );
  if (w.wildlings >= 30)
    pool.push(() =>
      push(state, {
        id: 'mur_sauvageons',
        titre: 'Les sauvageons au pied du Mur',
        texte:
          'Des milliers de sauvageons campent au pied du Mur. Ils ne viennent pas piller : ils fuient quelque chose qui descend du Grand Nord.',
        categorie: 'guerre',
        choix: [
          {
            libelle: 'Leur ouvrir les portes contre leur service',
            effets: [{ mur: { sauvageons: -30, hommes: 60 } }, { prestige: -20 }],
          },
          {
            libelle: 'Envoyer des troupes les repousser',
            effets: [
              {
                bataille: {
                  ennemi: 'les sauvageons',
                  force: 0.8,
                  composition: WILDLINGS,
                  attaque: true,
                  victoire: [{ mur: { sauvageons: -25 } }, { prestige: 40 }],
                  defaite: [{ mur: { hommes: -80 } }],
                },
              },
            ],
          },
          { libelle: 'Laisser la Garde s’en charger', effets: [] },
        ],
      }),
    );
  if (w.threat >= 30)
    pool.push(() =>
      push(
        state,
        {
          id: 'mur_revenant',
          titre: 'Un mort se relève à Châteaunoir',
          texte:
            'On a ramené deux frères morts au-delà du Mur. La nuit venue, ils se sont relevés, les yeux bleus comme la glace, et ont tué un homme avant qu’on les brûle.',
          categorie: 'guerre',
          choix: [
            {
              libelle: 'Brûler tous les morts, désormais',
              effets: [{ piete: 10 }, { mur: { menace: -2, vivres: -3 } }],
            },
            ...(king && king !== state.playerId
              ? [
                  {
                    libelle: 'Envoyer la main du mort au roi, comme preuve',
                    effets: [
                      { influence: { cible: 'rival' as const, valeur: 10 } },
                      { mur: { hommes: 40 } },
                    ],
                  },
                ]
              : []),
          ],
        },
        king && king !== state.playerId ? { rival: king } : {},
      ),
    );
  if (w.men < 750 && commander?.alive)
    pool.push(() =>
      push(
        state,
        {
          id: 'mur_demande',
          titre: 'Le Lord Commandant demande des hommes',
          texte: `${commander.name}, Lord Commandant de la Garde de Nuit, vous écrit : il n’a plus que ${w.men} frères pour tenir trois cents lieues de glace.`,
          categorie: 'cour',
          choix: [
            {
              libelle: 'Envoyer cent hommes et leur équipement',
              effets: [{ or: -40 }, { mur: { hommes: 100 } }],
            },
            {
              libelle: 'Refuser : on a besoin de bras ici',
              effets: [
                { opinion: { cible: 'courtisan', valeur: -10, raison: 'Sourd à la Garde' } },
              ],
            },
          ],
        },
        { courtisan: commander.id },
      ),
    );
  pool.push(() =>
    push(state, {
      id: 'mur_deserteur',
      titre: 'Un déserteur de la Garde',
      texte:
        'On a pris sur vos terres un déserteur de la Garde de Nuit. Il jure avoir vu des morts marcher et des marcheurs blancs. La loi veut sa tête.',
      categorie: 'cour',
      choix: [
        {
          libelle: 'L’exécuter vous-même, selon la loi',
          effets: [{ prestige: 15 }, { stress: { genereux: 10, juste: -5, '*': 0 } }],
        },
        {
          libelle: 'L’écouter, puis le renvoyer au Mur',
          effets: [{ mur: { hommes: 1, menace: -1 } }, { piete: 10 }],
        },
      ],
    }),
  );
  if (w.threat >= 35 && flags.got_verredragon === undefined)
    pool.push(() =>
      push(state, {
        id: 'mur_verredragon',
        titre: 'Le verre de dragon',
        texte:
          'Un mestre de la Citadelle écrit que le verre de dragon, l’obsidienne de Peyredragon, tue les Autres là où l’acier se brise. Les mines de l’île n’ont pas servi depuis des siècles.',
        categorie: 'guerre',
        choix: [
          {
            libelle: 'Payer pour rouvrir les mines',
            effets: [{ or: -100 }, { mur: { verredragon: 1 } }, { drapeau: 'got_verredragon' }],
          },
          { libelle: 'Des contes de mestre', effets: [{ drapeau: 'got_verredragon' }] },
        ],
      }),
    );
  if (w.threat >= 50 && flags.got_poing === undefined)
    pool.push(() =>
      push(state, {
        id: 'mur_poing',
        titre: 'Le Poing des Premiers Hommes',
        texte:
          'La grande patrouille de la Garde campait sur le Poing des Premiers Hommes quand la neige s’est mise à tomber. Puis les morts sont venus. Les survivants appellent à l’aide.',
        categorie: 'guerre',
        choix: [
          {
            libelle: 'Envoyer des renforts et des vivres',
            effets: [
              { or: -80 },
              { mur: { hommes: 50, menace: -8, vivres: 10 } },
              { drapeau: 'got_poing' },
            ],
          },
          {
            libelle: 'Prier pour eux',
            effets: [{ mur: { hommes: -150 } }, { piete: 10 }, { drapeau: 'got_poing' }],
          },
        ],
      }),
    );
  if (w.wildlings >= 60 && flags.got_mance === undefined)
    pool.push(() =>
      push(state, {
        id: 'mur_mance',
        titre: 'Le Roi-d’au-delà-du-Mur',
        texte:
          'Mance Rayder, un ancien frère de la Garde, a uni les clans sauvageons. Cent mille âmes marchent vers le Mur, géants et mammouths compris. Il demande le passage.',
        categorie: 'guerre',
        choix: [
          {
            libelle: 'Leur accorder le passage contre la paix',
            effets: [
              { mur: { sauvageons: -50, hommes: 150 } },
              { prestige: -40 },
              { drapeau: 'got_mance' },
            ],
          },
          {
            libelle: 'Les affronter au pied du Mur',
            effets: [
              { drapeau: 'got_mance' },
              {
                bataille: {
                  ennemi: 'l’armée de Mance Rayder',
                  force: 1.1,
                  composition: WILDLINGS,
                  victoire: [{ mur: { sauvageons: -45, menace: -5 } }, { prestige: 80 }],
                  defaite: [{ mur: { hommes: -200, sauvageons: 10 } }],
                },
              },
            ],
          },
        ],
      }),
    );
  rng.pick(pool)();
}

/** Actions du joueur depuis Monde › Le Mur. */
export type WallAction =
  | { kind: 'hommes' }
  | { kind: 'vivres' }
  | { kind: 'prisonnier'; id: string }
  | { kind: 'noir'; id: string }
  | { kind: 'verredragon' }
  | { kind: 'reconstruire' };

export function wallCheck(state: GameState, a: WallAction): { ok: boolean; reason?: string } {
  const w = state.wall;
  if (!w) return { ok: false, reason: 'Pas de Mur dans cette partie' };
  const p = state.characters[state.playerId];
  const fallen = w.fallenTurn !== undefined;
  const levies = domainCounties(state, p.id)
    .filter((c) => c.holderId === p.id)
    .reduce((s, c) => s + c.levyPool, 0);
  switch (a.kind) {
    case 'hommes':
      if (fallen) return { ok: false, reason: 'Le Mur est tombé' };
      return levies >= W.sendMen ? { ok: true } : { ok: false, reason: 'Pas assez de levées' };
    case 'vivres':
      if (fallen) return { ok: false, reason: 'Le Mur est tombé' };
      return p.gold >= W.sendSupplyGold ? { ok: true } : { ok: false, reason: 'Pas assez d’or' };
    case 'prisonnier': {
      const c = state.characters[a.id];
      if (fallen) return { ok: false, reason: 'Le Mur est tombé' };
      return c?.alive && c.imprisonedBy === p.id
        ? { ok: true }
        : { ok: false, reason: 'Pas votre prisonnier' };
    }
    case 'noir': {
      const c = state.characters[a.id];
      if (fallen) return { ok: false, reason: 'Le Mur est tombé' };
      if (!c?.alive || c.id === p.id) return { ok: false, reason: 'Impossible' };
      if (c.traits.includes('voeux')) return { ok: false, reason: 'Déjà lié par des vœux' };
      if (Object.values(state.counties).some((k) => k.holderId === c.id))
        return { ok: false, reason: 'Il tient des terres' };
      return { ok: true };
    }
    case 'verredragon':
      if (state.flags?.got_verredragon === undefined)
        return { ok: false, reason: 'On ignore encore à quoi sert le verredragon' };
      return p.gold >= W.dragonglassGold ? { ok: true } : { ok: false, reason: 'Pas assez d’or' };
    case 'reconstruire':
      if (!fallen) return { ok: false, reason: 'Le Mur tient encore' };
      if (w.threat > 40) return { ok: false, reason: 'Les morts sont trop nombreux' };
      if (p.gold < W.rebuildGold) return { ok: false, reason: `Il faut ${W.rebuildGold} or` };
      return levies >= W.rebuildMen ? { ok: true } : { ok: false, reason: 'Pas assez de levées' };
  }
}

/** Prend des levées sur les comtés du domaine propre du joueur. */
function takeLevies(state: GameState, n: number): void {
  let left = n;
  for (const c of domainCounties(state, state.playerId)
    .filter((k) => k.holderId === state.playerId)
    .sort((a, b) => b.levyPool - a.levyPool)) {
    const take = Math.min(left, c.levyPool);
    c.levyPool -= take;
    left -= take;
    if (left <= 0) break;
  }
}

export function wallAction(ctx: Ctx, a: WallAction): boolean {
  const { state } = ctx;
  if (!wallCheck(state, a).ok) return false;
  const w = state.wall!;
  const p = state.characters[state.playerId];
  switch (a.kind) {
    case 'hommes':
      takeLevies(state, W.sendMen);
      w.men += W.sendMen;
      p.prestige += 5;
      notify(state, `Cent hommes partent pour le Mur.`);
      break;
    case 'vivres':
      p.gold -= W.sendSupplyGold;
      w.supply = clamp(w.supply + W.sendSupply);
      break;
    case 'prisonnier': {
      const c = state.characters[a.id];
      takeTheBlack(state, c.id);
      w.men += W.prisonerMen;
      notify(state, `${c.name} prend le noir plutôt que de mourir au cachot.`);
      break;
    }
    case 'noir': {
      const c = state.characters[a.id];
      takeTheBlack(state, c.id);
      p.piety += 20;
      p.prestige += 10;
      notify(state, `${c.name} part pour le Mur et prononce les vœux de la Garde de Nuit.`);
      break;
    }
    case 'verredragon':
      p.gold -= W.dragonglassGold;
      w.dragonglass += 1;
      break;
    case 'reconstruire':
      p.gold -= W.rebuildGold;
      takeLevies(state, W.rebuildMen);
      w.fallenTurn = undefined;
      w.men = W.rebuildMen;
      w.supply = 40;
      w.strain = 0;
      worldNews(state, `${p.name} fait relever le Mur.`, 'fait');
      break;
  }
  return true;
}

/** Un personnage prend le noir : vœux, départ pour le Mur, hors du conseil. */
export function takeTheBlack(state: GameState, id: string): void {
  const c = state.characters[id];
  if (!c) return;
  addTrait(c, 'voeux');
  c.imprisonedBy = undefined;
  c.spouseId = undefined;
  const cmd = state.wall?.commanderId;
  if (cmd && state.characters[cmd]?.alive) c.courtId = cmd;
  for (const seat of Object.values(state.council))
    if (seat.holderId === id) seat.holderId = undefined;
}

/** Le Lord Commandant mort, les frères en élisent un autre. */
export function ensureCommander(ctx: Ctx): void {
  const { state } = ctx;
  const w = state.wall;
  if (!w) return;
  const cur = w.commanderId ? state.characters[w.commanderId] : undefined;
  if (cur?.alive) return;
  const brothers = Object.values(state.characters).filter(
    (c) =>
      c.alive && c.traits.includes('voeux') && (c.courtId === w.commanderId || c.courtId === c.id),
  );
  const next = brothers.sort((a, b) => b.skills.guerre - a.skills.guerre)[0];
  if (!next) return;
  for (const b of brothers) b.courtId = next.id;
  next.courtId = next.id;
  w.commanderId = next.id;
  worldNews(state, `La Garde de Nuit élit ${next.name} Lord Commandant.`, 'titre');
}
