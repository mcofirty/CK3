/**
 * Le monde vit sans le joueur : chaque saison, quelques faits locaux (récoltes, fêtes,
 * fondations, brigands…) touchent les domaines des souverains de l'IA et paraissent dans les
 * nouvelles du monde. Ils modifient vraiment leur trésor, leurs levées et leurs comtés.
 */
import { ABROAD, type AbroadHappening } from '../data/abroad';
import { BALANCE } from '../data/balance';
import { displayName } from './characters';
import { clamp, seasonOf, worldNews, type Ctx } from './context';
import { contentmentOf } from './economy/local';
import { independentRulers, realmCounties } from './realm';
import type { County } from './state';

const A = BALANCE.abroad;

function fits(h: AbroadHappening, c: County, gold: number, season: number): boolean {
  if (h.seasons && !h.seasons.includes(season)) return false;
  if (h.terrains && !h.terrains.includes(c.terrain)) return false;
  if (h.river && !c.rivers.length) return false;
  if (h.needGold !== undefined && gold < h.needGold) return false;
  if (h.minDevelopment !== undefined && c.development < h.minDevelopment) return false;
  return true;
}

export function seasonAbroad(ctx: Ctx): void {
  const { state, rng } = ctx;
  const season = seasonOf(state.turn);
  const coastal = new Set((state.map?.counties ?? []).filter((m) => m.coastal).map((m) => m.id));
  for (const id of independentRulers(state)) {
    if (id === state.playerId) continue;
    if (!rng.chance(A.chancePerRuler)) continue;
    const r = state.characters[id];
    if (!r?.alive) continue;
    const lands = realmCounties(state, id).filter((c) => !c.occupation);
    if (!lands.length) continue;
    const county = rng.pick(lands);
    const options = ABROAD.filter(
      (h) => fits(h, county, r.gold, season) && (!h.coastal || coastal.has(county.id)),
    );
    if (!options.length) continue;
    const h = rng.weighted(options, (o) => o.weight);
    if (!h) continue;
    const e = h.effect;
    if (e.gold) r.gold += e.gold;
    if (e.prestige) r.prestige += e.prestige;
    if (e.piety) r.piety += e.piety;
    if (e.development)
      county.development = clamp(
        county.development + e.development,
        A.minDevelopment,
        BALANCE.economy.developmentMax,
      );
    if (e.levyLoss) county.levyPool = Math.max(0, Math.round(county.levyPool * (1 - e.levyLoss)));
    if (e.contentment) county.contentment = clamp(contentmentOf(county) + e.contentment, 0, 100);
    const house = r.dynastyId ? (state.dynasties[r.dynastyId]?.name ?? '') : '';
    const text = h.text
      .replace('{souverain}', displayName(state, r))
      .replace('{comte}', county.name)
      .replace('{maison}', house);
    worldNews(state, text, 'fait', id);
  }
}
