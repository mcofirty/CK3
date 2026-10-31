/** Vie de cour à chaque saison : stress et crises, ambitions, otages, relations. */
import { AMBITION_BY_ID } from '../data/ambitions';
import { BALANCE } from '../data/balance';
import { ambitionOffer, ambitionStatus } from './ambitions';
import { addOpinion, addTrait, atWar, hasTrait } from './characters';
import { chronicle, notify, type Ctx } from './context';
import { queueEvent } from './events/engine';
import type { EventDef } from './events/types';
import { gainXp, record } from './progression';
import { seasonRelations } from './relations';
import { stressDecay } from './stress';
import type { Character, GameState } from './state';

const S = BALANCE.stress;

export function seasonCourt(ctx: Ctx): void {
  const { state } = ctx;
  if (state.gameOver) return;
  seasonStress(ctx);
  seasonAmbition(ctx);
  seasonHostages(ctx);
  seasonRelations(ctx);
}

// ---------------------------------------------------------------------------
// Stress
// ---------------------------------------------------------------------------

function seasonStress(ctx: Ctx): void {
  const { state } = ctx;
  for (const c of Object.values(state.characters)) {
    if (!c.alive || !c.stress) continue;
    const isPlayer = c.id === state.playerId;
    if (isPlayer && c.stress >= S.overwhelmed) c.health = Math.max(0, c.health - S.healthLoss);
    if (isPlayer && c.stress >= S.crisis) {
      if (!state.pendingEvents.some((e) => e.eventId === 'sys_crise')) {
        queueEvent(ctx, crisisEvent(c), {}, true);
        if (state.stats) state.stats.crises += 1;
      }
      continue;
    }
    c.stress = Math.max(0, c.stress - stressDecay(state, c));
  }
}

function crisisEvent(c: Character): EventDef {
  return {
    id: 'sys_crise',
    titre: 'Le poids de la couronne',
    texte: `Les nuits sans sommeil s’enchaînent. ${c.name} sent que quelque chose va céder : il faut trouver un exutoire, quel qu’en soit le prix.`,
    categorie: 'systeme',
    declencheur: { type: 'suite' },
    choix: [
      {
        libelle: 'Noyer ses soucis dans le vin.',
        effets: [{ stress: -60, trait_ajout: 'ivrogne' }],
      },
      {
        libelle: 'Laisser éclater sa colère sur la cour.',
        effets: [{ stress: -55, trait_ajout: 'irascible', opinion_vassaux: -10 }],
      },
      {
        libelle: 'S’enfermer dans le silence et la mélancolie.',
        effets: [{ stress: -50, trait_ajout: 'melancolique' }],
      },
      {
        libelle: 'Serrer les dents et tenir bon.',
        effets: [{ stress: -35, sante: -15, prestige: 20 }],
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// Ambitions
// ---------------------------------------------------------------------------

export function offerAmbition(ctx: Ctx): boolean {
  const { state } = ctx;
  const p = state.characters[state.playerId];
  if (!p?.alive || p.ambition) return false;
  if (state.pendingEvents.some((e) => e.eventId === 'sys_ambition')) return false;
  const def = ambitionOffer(state, p, ctx.rng);
  if (!def) return false;
  queueEvent(ctx, def, {}, true);
  p.ambitionOffered = true;
  return true;
}

function seasonAmbition(ctx: Ctx): void {
  const { state } = ctx;
  const p = state.characters[state.playerId];
  if (!p?.alive) return;
  if (!p.ambition) {
    if (!p.ambitionOffered) offerAmbition(ctx);
    return;
  }
  const def = AMBITION_BY_ID[p.ambition.id];
  if (!def) {
    p.ambition = undefined;
    return;
  }
  if (def.kind === 'paix') {
    const atWarNow = Object.values(state.wars).some((w) =>
      [w.attackerId, w.defenderId, ...w.attackerAllies, ...w.defenderAllies].includes(p.id),
    );
    p.ambition.counter = atWarNow ? 0 : p.ambition.counter + 1;
  }
  const st = ambitionStatus(state, p);
  if (!st) return;
  if (st.done) {
    completeAmbition(state, p);
    return;
  }
  if (st.seasonsLeft <= 0) {
    p.ambition = undefined;
    p.stress = (p.stress ?? 0) + S.ambitionFail;
    p.prestige += BALANCE.ambitions.failPrestige;
    notify(state, `Ambition manquée : ${def.name}. L’échec pèse sur votre esprit.`);
    chronicle(
      state,
      `${p.name} renonce à son grand dessein : ${def.name.toLowerCase()}.`,
      'divers',
    );
  }
}

export function completeAmbition(state: GameState, p: Character): void {
  const def = p.ambition ? AMBITION_BY_ID[p.ambition.id] : undefined;
  if (!def) return;
  p.ambition = undefined;
  p.prestige += def.reward.prestige;
  if (p.dynastyId) state.dynasties[p.dynastyId].renown += def.reward.renown;
  gainXp(state, p, def.reward.xp, BALANCE.ambitions.rewardXp);
  p.stress = Math.max(0, (p.stress ?? 0) - 20);
  if (!hasTrait(p, 'accompli')) addTrait(p, 'accompli');
  record(p).ambitions += 1;
  const entry = state.rulers?.find((r) => r.id === p.id && r.to === undefined);
  entry?.ambitions.push(def.name);
  notify(
    state,
    `Ambition accomplie : ${def.name} ! +${def.reward.prestige} prestige, +${def.reward.renown} renommée.`,
  );
  chronicle(state, `${p.name} accomplit son grand dessein : ${def.name.toLowerCase()}.`, 'titre');
  state.lastOutcome = {
    id: (state.lastOutcome?.id ?? 0) + 1,
    win: true,
    text: `Ambition accomplie : ${def.name}`,
  };
  // Une nouvelle ambition pourra être choisie.
  p.ambitionOffered = false;
}

// ---------------------------------------------------------------------------
// Otages
// ---------------------------------------------------------------------------

function seasonHostages(ctx: Ctx): void {
  const { state, rng } = ctx;
  const H = BALANCE.hostage;
  for (const h of Object.values(state.characters)) {
    if (!h.alive || !h.hostageOf) continue;
    const holder = state.characters[h.hostageOf];
    if (!holder?.alive) {
      h.hostageOf = undefined;
      continue;
    }
    addOpinion(state, h.id, holder.id, 'Bien traité en otage', H.opinionPerSeason, 0);
    if (holder.id !== state.playerId) continue;
    const since = state.turn - (h.hostageSince ?? state.turn);
    const family = state.characters[h.fatherId ?? ''] ?? state.characters[h.motherId ?? ''];
    if (since < H.offerAfter || !family?.alive || !rng.chance(0.25)) continue;
    if (atWar(state, family.id, holder.id)) continue;
    queueEvent(
      ctx,
      {
        id: 'sys_otage',
        titre: 'Une rançon pour l’otage',
        texte: `Un messager de ${family.name} se présente : sa famille réclame le retour de ${h.name}, et offre de l’or.`,
        categorie: 'systeme',
        declencheur: { type: 'suite' },
        choix: [
          {
            libelle: `Rendre ${h.name} (${H.offerGold} or).`,
            effets: [{ rendre_otage: { otage: h.id, montant: H.offerGold } }],
          },
          { libelle: 'Garder l’otage : il nous protège.', effets: [{ prestige: 5 }] },
        ],
      },
      {},
      true,
    );
  }
}
