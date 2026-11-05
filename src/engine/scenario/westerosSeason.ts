/**
 * Saison du mode Trône de fer : les grands seigneurs face au roi. Un seigneur suzerain qui
 * méprise le roi peut se proclamer indépendant (surtout à l'avènement d'un roi nouveau ou
 * enfant) ; un grand seigneur libre ceint la couronne de son ancien royaume.
 */
import { BALANCE } from '../../data/balance';
import type { GameState } from '../state';
import { atWar, isAdult, opinion } from '../characters';
import { chronicle, notify, worldNews, type Ctx } from '../context';
import { titleOf, vassalsOf } from '../realm';
import { declareWar } from '../war';
import { ensureCommander, seasonWall } from './wall';
import { seasonEssos, settleLandingChoice } from './essos';
import { seasonStory } from './story';

/**
 * Qui tient Port-Réal tient le Trône de fer : un souverain indépendant qui prend la ville
 * reçoit la couronne, et les vassaux de l'ancien roi plient le genou devant lui.
 */
export function ironThrone(state: GameState): void {
  const crown = state.kingdoms.k_couronnes;
  const city = state.counties.port_real;
  if (!crown || !city) return;
  const holder = state.characters[city.holderId];
  if (!holder?.alive || holder.liegeId || crown.holderId === holder.id) return;
  const old = crown.holderId ? state.characters[crown.holderId] : undefined;
  crown.holderId = holder.id;
  const duchy = state.duchies.d_couronne;
  if (duchy && duchy.holderId === old?.id) duchy.holderId = holder.id;
  if (old) {
    for (const v of vassalsOf(state, old.id)) {
      if (v === holder.id) continue;
      const c = state.characters[v];
      if (c && !atWar(state, v, holder.id)) c.liegeId = holder.id;
    }
    if (old.alive && Object.values(state.counties).some((k) => k.holderId === old.id))
      old.liegeId = holder.id;
  }
  const title = titleOf(state, holder.id);
  chronicle(state, `${holder.name} s’assied sur le Trône de fer : ${title}.`, 'titre');
  worldNews(state, `${holder.name} s’empare de Port-Réal et du Trône de fer.`, 'titre', holder.id);
  if (holder.id === state.playerId) notify(state, 'Le Trône de fer est à vous.');
}

const W = BALANCE.westeros;

export function seasonWesteros(ctx: Ctx): void {
  const { state, rng } = ctx;
  if (state.scenario !== 'westeros') return;
  const flags = (state.flags ??= {});
  settleLandingChoice(state);
  ironThrone(state);
  ensureCommander(ctx);
  seasonWall(ctx);
  seasonStory(ctx);
  seasonEssos(ctx);
  const king = state.kingdoms.k_couronnes?.holderId;
  const crown = king ? state.characters[king] : undefined;
  if (crown?.alive) {
    const since = flags[`roi:${crown.id}`];
    if (since === undefined) {
      flags[`roi:${crown.id}`] = state.turn;
      if (state.turn > 0)
        worldNews(state, `${crown.name} monte sur le Trône de fer.`, 'succession', crown.id);
    }
    const reign = state.turn - (flags[`roi:${crown.id}`] ?? state.turn);
    let mult = 1;
    if (state.turn > 0 && reign < W.newKingSeasons) mult *= W.newKingMult;
    if (!isAdult(state, crown)) mult *= W.childKingMult;
    // La maison du roi et celle de sa mère ne se soulèvent pas contre lui.
    const kin = new Set([crown.dynastyId, state.characters[crown.motherId ?? '']?.dynastyId]);
    // Grands seigneurs : vassaux directs du roi qui tiennent une région.
    for (const v of vassalsOf(state, crown.id)) {
      if (v === state.playerId) continue;
      const lord = state.characters[v];
      if (!lord?.alive || atWar(state, v, crown.id)) continue;
      if (lord.dynastyId && kin.has(lord.dynastyId)) continue;
      if (!Object.values(state.duchies).some((d) => d.holderId === v)) continue;
      const op = opinion(state, v, crown.id);
      if (op >= W.revoltOpinion) continue;
      const chance =
        W.revoltChance * mult * (lord.traits.includes('ambitieux') ? W.ambitiousMult : 1);
      if (!rng.chance(chance)) continue;
      const w = declareWar(ctx, v, crown.id, 'independance', undefined, true);
      if (!w) continue;
      worldNews(
        state,
        `${lord.name} refuse de plier le genou devant ${crown.name} et se soulève.`,
        'revolte',
        v,
      );
      if (crown.id === state.playerId || state.characters[state.playerId]?.liegeId === crown.id)
        notify(state, `${lord.name} se soulève contre le Trône de fer !`);
    }
  }
  // Un grand seigneur libre ceint la couronne de son ancien royaume.
  for (const k of Object.values(state.kingdoms)) {
    if (k.holderId || !k.duchies.length) continue;
    const holders = new Set(k.duchies.map((d) => state.duchies[d].holderId));
    if (holders.size !== 1) continue;
    const id = [...holders][0];
    const lord = id ? state.characters[id] : undefined;
    if (!lord?.alive || lord.liegeId) continue;
    k.holderId = lord.id;
    const title = titleOf(state, lord.id);
    chronicle(state, `${lord.name} est proclamé${lord.female ? 'e' : ''} ${title}.`, 'titre');
    worldNews(
      state,
      `${lord.name} est proclamé${lord.female ? 'e' : ''} ${title}.`,
      'titre',
      lord.id,
    );
    if (lord.id === state.playerId)
      notify(state, `Vos bannerets vous acclament : vous voici ${title}.`);
  }
}
