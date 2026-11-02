/**
 * Daenerys Targaryen en Essos (mode Trône de fer). Son parcours avance au fil des saisons :
 * la mort de Khal Drogo et la naissance des dragons, le désert rouge, Qarth, les Immaculés
 * d'Astapor, Meereen ; puis, si elle vit, le débarquement à Peyredragon et la guerre pour le
 * Trône de fer. Le joueur peut l'aider (émissaires, vivres, navires) ou lui nuire (assassins).
 */
import { BALANCE } from '../../data/balance';
import { addOpinion, opinion } from '../characters';
import { vassalsOf } from '../realm';
import { killCharacter } from '../characters/lifecycle';
import { chronicle, notify, worldNews, type Ctx } from '../context';
import type { Effect, EventDef } from '../events/types';
import type { Character, GameState } from '../state';
import { emptyUnits } from '../units';
import { declareWar, joinWar, transferCounty } from '../war';

const E = BALANCE.essos;

/** Étapes de son parcours : où elle est, ce que l'on en dit. */
export const ESSOS_STAGES: { name: string; place: string }[] = [
  { name: 'L’épouse du khal', place: 'La mer dothrak' },
  { name: 'La Mère des dragons', place: 'La mer dothrak' },
  { name: 'Le désert rouge', place: 'Le désert rouge' },
  { name: 'Les portes de Qarth', place: 'Qarth' },
  { name: 'Les Immaculés', place: 'Astapor' },
  { name: 'La reine de Meereen', place: 'Meereen' },
  { name: 'Le retour des dragons', place: 'Peyredragon' },
];

export function initEssos(state: GameState): void {
  state.essos = { stage: 0, stageTurn: 0, alive: true, dragons: 0, army: E.army[0] };
}

const findByName = (state: GameState, name: string, dyn?: string) =>
  Object.values(state.characters).find(
    (c) => c.name === name && (dyn === undefined || c.dynastyId === dyn),
  );

export function daenerys(state: GameState): Character | undefined {
  return findByName(state, 'Daenerys', 'y_targaryen');
}

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

/** Effet d'événement « essos » : sa vie, son armée, ses dragons. */
export function applyEssosEffect(ctx: Ctx, e: NonNullable<Effect['essos']>): void {
  const { state } = ctx;
  const es = state.essos;
  if (!es?.alive) return;
  if (e.armee) es.army = Math.max(0, es.army + e.armee);
  if (e.mort) {
    es.alive = false;
    const d = daenerys(state);
    if (d?.alive) killCharacter(ctx, d.id, 'empoisonnée par un assassin');
    worldNews(
      state,
      'Daenerys Targaryen est morte en Essos ; ses dragons se sont envolés.',
      'deces',
    );
  }
}

export function essosEffectLabels(e: NonNullable<Effect['essos']>): string[] {
  const out: string[] = [];
  if (e.armee) out.push(`Armée de Daenerys : ${e.armee > 0 ? '+' : ''}${e.armee}`);
  if (e.mort) out.push('Daenerys meurt');
  return out;
}

export function seasonEssos(ctx: Ctx): void {
  const { state, rng } = ctx;
  const es = state.essos;
  if (!es?.alive) return;
  const dany = daenerys(state);
  if (!dany?.alive) {
    es.alive = false;
    return;
  }
  // Viserys réclame sa couronne… et la reçoit, en or fondu.
  const viserys = findByName(state, 'Viserys', 'y_targaryen');
  if (viserys?.alive && state.turn >= 2 && rng.chance(0.4)) {
    killCharacter(ctx, viserys.id, 'couronné d’or fondu par Khal Drogo');
    worldNews(
      state,
      'Viserys Targaryen a reçu sa couronne : un chaudron d’or fondu versé sur sa tête.',
      'deces',
    );
  }
  if (es.stage >= 6) return;
  const waited = state.turn - es.stageTurn;
  const ready =
    es.stage === 5
      ? state.turn >= E.landingTurn && waited >= E.stageSeasons[5] && rng.chance(E.landingChance)
      : waited >= E.stageSeasons[es.stage] && rng.chance(E.stageChance);
  if (!ready) return;
  es.stage += 1;
  es.stageTurn = state.turn;
  es.army = Math.max(es.army, E.army[es.stage]);
  stageEvent(ctx, dany);
}

/** Ce qui arrive à chaque étape, et ce que le joueur peut faire. */
function stageEvent(ctx: Ctx, dany: Character): void {
  const { state } = ctx;
  const es = state.essos!;
  const king = state.kingdoms.k_couronnes?.holderId;
  const help = (gold: number, op: number, why: string, extra: Effect[] = []) => ({
    libelle: `Lui faire parvenir de l’aide (${gold} or)`,
    effets: [
      { or: -gold },
      { opinion: { cible: 'ennemi' as const, valeur: op, raison: why } },
      ...extra,
    ],
  });
  const scope = { ennemi: dany.id };
  switch (es.stage) {
    case 1: {
      const drogo = dany.spouseId ? state.characters[dany.spouseId] : undefined;
      if (drogo?.alive) killCharacter(ctx, drogo.id, 'd’une blessure empoisonnée');
      for (const c of Object.values(state.characters))
        if (c.alive && drogo && c.courtId === drogo.id) c.courtId = dany.id;
      dany.courtId = dany.id;
      dany.liegeId = undefined;
      es.dragons = 3;
      chronicle(state, 'En Essos, trois dragons sont nés dans le bûcher de Khal Drogo.', 'divers');
      worldNews(
        state,
        'Khal Drogo est mort. Daenerys est sortie vivante de son bûcher, avec trois dragons.',
        'fait',
      );
      push(
        state,
        {
          id: 'essos_dragons',
          titre: 'Les dragons sont revenus',
          texte:
            'Des marchands jurent l’avoir vu : la fille du Roi fou est entrée dans le bûcher de son khal et en est sortie vivante, trois dragons nouveau-nés accrochés à elle. Ses Dothrakis l’ont presque tous abandonnée.',
          categorie: 'etranger',
          choix: [
            {
              libelle: `Engager un assassin (${E.assassinGold} or)`,
              effets: [
                { or: -E.assassinGold },
                {
                  hasard: {
                    chance: E.assassinChance,
                    competence: 'ruse',
                    succes: [{ essos: { mort: true } }, { prestige: 20 }, { piete: -40 }],
                    echec: [
                      { opinion: { cible: 'ennemi', valeur: -40, raison: 'A voulu sa mort' } },
                    ],
                    texte_succes: 'Le vin empoisonné a fait son œuvre.',
                    texte_echec: 'L’assassin a été démasqué ; elle sait qui l’envoyait.',
                  },
                },
              ],
            },
            help(E.emissaryGold, E.emissaryOpinion, 'Un ami de la maison Targaryen'),
            { libelle: 'Ce ne sont que des lézards', effets: [] },
          ],
        },
        scope,
      );
      break;
    }
    case 2:
      worldNews(
        state,
        'Daenerys et ce qui reste de son khalasar s’enfoncent dans le désert rouge.',
        'fait',
      );
      push(
        state,
        {
          id: 'essos_desert_rouge',
          titre: 'Le désert rouge',
          texte:
            'Plutôt que d’affronter les khals qui l’ont abandonnée, Daenerys a mené sa centaine de fidèles dans le désert rouge. On dit qu’ils meurent de soif, et que les dragons dévorent leurs chevaux.',
          categorie: 'etranger',
          choix: [
            help(40, 20, 'Des vivres dans le désert', [{ essos: { armee: 100 } }]),
            {
              libelle: 'Le désert fera le travail',
              effets: [
                {
                  hasard: {
                    chance: 0.12,
                    succes: [{ essos: { mort: true } }],
                    echec: [],
                    texte_succes: 'Le désert a eu raison d’elle.',
                    texte_echec: 'Elle a traversé le désert.',
                  },
                },
              ],
            },
          ],
        },
        scope,
      );
      break;
    case 3:
      worldNews(state, 'Daenerys est accueillie à Qarth, la plus grande cité du monde.', 'fait');
      push(
        state,
        {
          id: 'essos_qarth',
          titre: 'Les portes de Qarth',
          texte:
            'Daenerys est sortie du désert aux portes de Qarth. Les Treize qui gouvernent la cité la couvrent de présents, mais aucun ne lui donnera de navires pour Westeros.',
          categorie: 'etranger',
          choix: [
            help(120, 30, 'Des navires pour la reine', [{ essos: { armee: 500 } }]),
            { libelle: 'Laisser les Qarthiens la ruiner', effets: [] },
          ],
        },
        scope,
      );
      break;
    case 4:
      worldNews(
        state,
        'À Astapor, Daenerys a échangé un dragon contre huit mille Immaculés… puis les a libérés et a brûlé les maîtres.',
        'guerre',
      );
      push(
        state,
        {
          id: 'essos_immacules',
          titre: 'Les Immaculés',
          texte:
            'À Astapor, la reine dragon a acheté huit mille Immaculés, les meilleurs soldats d’Essos. Le marché conclu, son dragon a brûlé les maîtres esclavagistes.',
          categorie: 'etranger',
          choix: [
            ...(king && king !== state.playerId
              ? [
                  {
                    libelle: 'Prévenir le roi',
                    effets: [
                      {
                        opinion: {
                          cible: 'rival' as const,
                          valeur: 10,
                          raison: 'Un sujet vigilant',
                        },
                      },
                      {
                        opinion: {
                          cible: 'ennemi' as const,
                          valeur: -10,
                          raison: 'Ami de l’Usurpateur',
                        },
                      },
                    ],
                  },
                ]
              : []),
            {
              libelle: 'Garder la nouvelle pour soi',
              effets: [{ xp: { competence: 'ruse', valeur: 20 } }],
            },
          ],
        },
        king && king !== state.playerId ? { ...scope, rival: king } : scope,
      );
      break;
    case 5:
      worldNews(
        state,
        'Daenerys a pris Meereen et y règne en libératrice. Ses dragons ont grandi.',
        'titre',
      );
      push(
        state,
        {
          id: 'essos_meereen',
          titre: 'La reine de Meereen',
          texte:
            'Daenerys règne à Meereen sur des milliers d’esclaves affranchis. Ses dragons sont devenus des bêtes de guerre. Tôt ou tard, elle traversera le détroit.',
          categorie: 'etranger',
          choix: [
            help(80, 30, 'Un ambassadeur fidèle', [{ drapeau: 'ambassade_daenerys' }]),
            {
              libelle: `Engager un Homme sans visage (${E.assassinGold * 2} or)`,
              effets: [
                { or: -E.assassinGold * 2 },
                {
                  hasard: {
                    chance: E.assassinChance,
                    competence: 'ruse',
                    succes: [{ essos: { mort: true } }, { piete: -40 }],
                    echec: [
                      { opinion: { cible: 'ennemi', valeur: -50, raison: 'A voulu sa mort' } },
                    ],
                    texte_succes: 'Le Multiface a reçu son dû.',
                    texte_echec: 'Ses gardes ont déjoué l’assassin.',
                  },
                },
              ],
            },
            { libelle: 'Attendre', effets: [] },
          ],
        },
        scope,
      );
      break;
    case 6:
      landing(ctx, dany);
      break;
  }
}

/** Daenerys débarque à Peyredragon avec son armée et ses dragons, et réclame le trône. */
function landing(ctx: Ctx, dany: Character): void {
  const { state } = ctx;
  const es = state.essos!;
  const king = state.kingdoms.k_couronnes?.holderId;
  if (!king || !state.counties.peyredragon) return;
  // Le seigneur de Peyredragon perd son île : ses bannerets passent directement au roi.
  const lord = state.counties.peyredragon.holderId;
  const banners = Object.values(state.characters).filter(
    (c) => c.alive && c.liegeId === lord && lord !== king,
  );
  transferCounty(state, 'peyredragon', dany.id);
  for (const b of banners)
    if (Object.values(state.counties).some((c) => c.holderId === b.id)) b.liegeId = king;
  state.counties.peyredragon.seatOf = dany.id;
  dany.liegeId = undefined;
  dany.courtId = dany.id;
  dany.gold = Math.max(dany.gold, 500);
  dany.prestige = Math.max(dany.prestige, 600);
  dany.successionLaw = 'primogeniture';
  dany.government = 'feodal';
  const mult = 1 + es.dragons * E.dragonArmyMult;
  const st = emptyUnits();
  st.infanterie = Math.round((E.landing.infanterie * mult) / 100) * 100;
  st.cavalerie = Math.round((E.landing.cavalerie * mult) / 100) * 100;
  st.archers = Math.round((E.landing.archers * mult) / 100) * 100;
  state.standing[dany.id] = st;
  for (const c of Object.values(state.characters))
    if (c.alive && c.courtId === dany.spouseId) c.courtId = dany.id;
  chronicle(state, 'Daenerys Targaryen débarque à Peyredragon avec ses dragons.', 'guerre');
  worldNews(
    state,
    'Daenerys Targaryen a débarqué à Peyredragon avec une armée et trois dragons. Elle réclame le Trône de fer.',
    'guerre',
  );
  const w = declareWar(ctx, dany.id, king, 'conquete', 'port_real', true);
  if (!w) return;
  // Les grands seigneurs fidèles envoient des hommes défendre Port-Réal.
  const kst = (state.standing[king] ??= emptyUnits());
  for (const v of vassalsOf(state, king)) {
    if (v === state.playerId || opinion(state, v, king) < E.loyalOpinion) continue;
    kst.piquiers += E.loyalTroops.piquiers;
    kst.cavalerie += E.loyalTroops.cavalerie;
    kst.archers += E.loyalTroops.archers;
  }
  if (king === state.playerId) {
    notify(state, 'La Mère des dragons a débarqué : elle marche sur Port-Réal.');
    push(
      state,
      {
        id: 'essos_debarquement_roi',
        titre: 'La Mère des dragons',
        texte:
          'Des voiles noires et rouges couvrent la baie de la Néra. Daenerys Targaryen a pris Peyredragon ; ses dragons survolent la côte. Elle exige que vous lui rendiez le trône de son père.',
        categorie: 'guerre',
        choix: [{ libelle: 'Défendre le Trône de fer', effets: [{ stress: 15 }] }],
      },
      { ennemi: dany.id },
    );
    return;
  }
  const playerAtWarFree = !state.characters[state.playerId]?.imprisonedBy;
  if (!playerAtWarFree) return;
  state.pendingEvents.push({
    uid: `e${++state.nextId}`,
    eventId: 'essos_debarquement',
    scope: { souverain: state.playerId, ennemi: dany.id, rival: king },
    inline: {
      id: 'essos_debarquement',
      titre: 'La Mère des dragons',
      texte:
        'Daenerys Targaryen a débarqué à Peyredragon avec des milliers d’Immaculés, une horde dothrak et trois dragons. Elle marche sur Port-Réal et appelle les seigneurs de Westeros à plier le genou.',
      categorie: 'guerre',
      declencheur: { type: 'suite' },
      poids: 0,
      choix: [
        {
          libelle: 'Plier le genou devant Daenerys',
          effets: [
            { opinion: { cible: 'ennemi', valeur: 40, raison: 'A plié le genou' } },
            { opinion: { cible: 'rival', valeur: -60, raison: 'Traître à la Couronne' } },
            { drapeau: `rallie_daenerys:${w.id}` },
          ],
        },
        {
          libelle: 'Défendre le roi',
          effets: [
            { opinion: { cible: 'rival', valeur: 25, raison: 'Fidèle face aux dragons' } },
            { opinion: { cible: 'ennemi', valeur: -30, raison: 'Ami de l’Usurpateur' } },
            { drapeau: `defend_roi:${w.id}` },
          ],
        },
        { libelle: 'Attendre l’issue', effets: [] },
      ],
    },
  });
}

/** Les choix du débarquement : rejoindre un camp (lus après la réponse du joueur). */
export function settleLandingChoice(state: GameState): void {
  for (const k of Object.keys(state.flags ?? {})) {
    const [tag, warId] = k.split(':');
    if (!warId || !state.wars[warId]) continue;
    if (tag === 'rallie_daenerys') joinWar(state, warId, state.playerId, 'attacker');
    else if (tag === 'defend_roi') joinWar(state, warId, state.playerId, 'defender');
    else continue;
    delete state.flags![k];
  }
}

/** Actions du joueur depuis Monde › Essos. */
export type EssosAction = { kind: 'emissaire' } | { kind: 'assassin' };

export function essosCheck(state: GameState, a: EssosAction): { ok: boolean; reason?: string } {
  const es = state.essos;
  const p = state.characters[state.playerId];
  if (!es?.alive) return { ok: false, reason: 'Daenerys est morte' };
  if (es.stage >= 6) return { ok: false, reason: 'Elle est déjà à Westeros' };
  if (a.kind === 'emissaire')
    return p.gold >= E.emissaryGold ? { ok: true } : { ok: false, reason: 'Pas assez d’or' };
  if (es.assassinTurn !== undefined && state.turn - es.assassinTurn < E.assassinCooldown)
    return { ok: false, reason: 'Ses gardes sont sur le qui-vive' };
  return p.gold >= E.assassinGold ? { ok: true } : { ok: false, reason: 'Pas assez d’or' };
}

export function essosAction(ctx: Ctx, a: EssosAction): boolean {
  const { state, rng } = ctx;
  if (!essosCheck(state, a).ok) return false;
  const es = state.essos!;
  const p = state.characters[state.playerId];
  const dany = daenerys(state);
  if (!dany) return false;
  if (a.kind === 'emissaire') {
    p.gold -= E.emissaryGold;
    addOpinion(state, dany.id, p.id, 'Un ami de la maison Targaryen', E.emissaryOpinion, 0);
    notify(state, `Votre émissaire a rejoint Daenerys à ${ESSOS_STAGES[es.stage].place}.`);
    return true;
  }
  p.gold -= E.assassinGold;
  es.assassinTurn = state.turn;
  if (rng.chance(E.assassinChance)) {
    applyEssosEffect(ctx, { mort: true });
    notify(state, 'L’assassin a réussi : Daenerys Targaryen est morte.');
  } else {
    addOpinion(state, dany.id, p.id, 'A voulu sa mort', -40, 0);
    notify(state, 'L’assassin a échoué. Daenerys sait qui l’envoyait.');
  }
  return true;
}
