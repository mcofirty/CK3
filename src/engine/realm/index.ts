/** Royaume : comtés, titres, économie, bâtiments, vassaux. */
import { BALANCE } from '../../data/balance';
import { BUILDINGS } from '../../data/buildings';
import { TRAITS } from '../../data/traits';
import { addOpinion, demesneLimit, heldCounties, opinion, perkBonus, skill } from '../characters';
import { gainXp, record } from '../progression';
import { countyDevMult, countyIncomeMult, countyLevyMult, edictSum } from '../economy/local';
import { chronicle, clamp, notify, type Ctx } from '../context';
import type { BuildingType, County, GameState, LedgerLine, UnitCounts } from '../state';
import { armyUpkeep, emptyUnits, totalMen } from '../units';

const E = BALANCE.economy;

// --- Structure du royaume ---
export function isIndependent(state: GameState, id: string): boolean {
  const c = state.characters[id];
  return !!c && c.alive && !c.liegeId && heldCounties(state, id).length > 0;
}

export function independentRulers(state: GameState): string[] {
  const set = new Set<string>();
  for (const c of Object.values(state.counties)) {
    const h = state.characters[c.holderId];
    if (h && !h.liegeId) set.add(h.id);
  }
  return [...set];
}

export function vassalsOf(state: GameState, rulerId: string): string[] {
  const set = new Set<string>();
  for (const c of Object.values(state.counties)) {
    const h = state.characters[c.holderId];
    if (h && h.liegeId === rulerId) set.add(h.id);
  }
  return [...set];
}

/** Souverain indépendant dont relève un comté. */
export function countyRuler(state: GameState, county: County): string {
  let id = county.holderId;
  for (let i = 0; i < 4; i++) {
    const l = state.characters[id]?.liegeId;
    if (!l) break;
    id = l;
  }
  return id;
}

export function realmCounties(state: GameState, rulerId: string): County[] {
  return Object.values(state.counties).filter((c) => countyRuler(state, c) === rulerId);
}

export function capitalOf(state: GameState, rulerId: string): County | undefined {
  const own = Object.values(state.counties).filter((c) => c.holderId === rulerId);
  const titled = own.find((c) => state.duchies[c.duchyId]?.holderId === rulerId);
  return (
    titled ??
    own.sort((a, b) => b.development - a.development)[0] ??
    realmCounties(state, rulerId)[0]
  );
}

export type Rank = 'roi' | 'duc' | 'comte' | 'aucun';
export function rankOf(state: GameState, id: string): Rank {
  if (Object.values(state.kingdoms).some((k) => k.holderId === id)) return 'roi';
  if (Object.values(state.duchies).some((d) => d.holderId === id)) return 'duc';
  if (heldCounties(state, id).length) return 'comte';
  return 'aucun';
}

export function rankValue(r: Rank): number {
  return { roi: 3, duc: 2, comte: 1, aucun: 0 }[r];
}

export function titleOf(state: GameState, id: string): string {
  const c = state.characters[id];
  if (!c) return '';
  const f = c.female;
  const k = Object.values(state.kingdoms).find((x) => x.holderId === id);
  if (k) return `${f ? 'Reine' : 'Roi'} de ${k.name}`;
  const d = Object.values(state.duchies).find((x) => x.holderId === id);
  if (d) return `${f ? 'Duchesse' : 'Duc'} de ${d.name}`;
  const cty = Object.values(state.counties).find((x) => x.holderId === id);
  if (cty) return `${f ? 'Comtesse' : 'Comte'} de ${cty.name}`;
  return '';
}

/** Nom du royaume (domaine) d'un souverain. */
export function realmName(state: GameState, rulerId: string): string {
  const k = Object.values(state.kingdoms).find((x) => x.holderId === rulerId);
  if (k) return `Royaume de ${k.name}`;
  const d = Object.values(state.duchies).find((x) => x.holderId === rulerId);
  if (d) return `Duché de ${d.name}`;
  const cty = capitalOf(state, rulerId);
  return cty ? `Comté de ${cty.name}` : '—';
}

// --- Bâtiments ---
export function buildingLevel(c: County, t: BuildingType): number {
  return c.buildings.find((b) => b.type === t)?.level ?? 0;
}

function sumBuilding(
  c: County,
  key: 'income' | 'levies' | 'development' | 'fort' | 'piety' | 'supply' | 'recruitCap',
): number {
  let s = 0;
  for (const b of c.buildings) {
    const def = BUILDINGS[b.type];
    for (let l = 0; l < b.level; l++) s += def.levels[l][key] ?? 0;
  }
  return s;
}

export function fortLevel(c: County): number {
  return clamp(c.baseFort + sumBuilding(c, 'fort'), 0, 3);
}
export function hasRoad(c: County): boolean {
  return buildingLevel(c, 'route') > 0;
}
export function countySupplyBonus(c: County): number {
  return sumBuilding(c, 'supply');
}
export function countyPiety(c: County): number {
  return sumBuilding(c, 'piety');
}
export function countyIncome(c: County): number {
  return c.development * E.incomePerDevelopment + sumBuilding(c, 'income');
}
export function countyMaxLevies(c: County): number {
  return E.leviesBase + c.development * E.leviesPerDevelopment + sumBuilding(c, 'levies');
}
export function countyDevBonus(c: County): number {
  return sumBuilding(c, 'development') / 100;
}

export interface BuildCheck {
  ok: boolean;
  reason?: string;
  cost: number;
  seasons: number;
  level: 1 | 2;
}

export function canBuild(
  state: GameState,
  rulerId: string,
  countyId: string,
  t: BuildingType,
): BuildCheck {
  const c = state.counties[countyId];
  const ruler = state.characters[rulerId];
  const cur = buildingLevel(c, t);
  const level = (cur + 1) as 1 | 2;
  const def = BUILDINGS[t];
  if (cur >= 2)
    return { ok: false, reason: 'Niveau maximal atteint', cost: 0, seasons: 0, level: 2 };
  const lv = def.levels[level - 1];
  const cost = Math.round(lv.cost * Math.max(0.3, 1 + perkBonus(state, ruler, 'buildCost')));
  const res = { cost, seasons: lv.seasons, level };
  if (c.holderId !== rulerId) return { ok: false, reason: 'Comté hors du domaine propre', ...res };
  if (c.construction) return { ok: false, reason: 'Un chantier est déjà en cours', ...res };
  if (cur === 0 && c.buildings.length >= c.slots)
    return { ok: false, reason: 'Plus d’emplacement libre', ...res };
  if (c.occupation) return { ok: false, reason: 'Comté occupé', ...res };
  if (ruler.gold < cost) return { ok: false, reason: `Il faut ${cost} or`, ...res };
  return { ok: true, ...res };
}

export function startBuilding(
  ctx: Ctx,
  rulerId: string,
  countyId: string,
  t: BuildingType,
): boolean {
  const chk = canBuild(ctx.state, rulerId, countyId, t);
  if (!chk.ok) return false;
  const ruler = ctx.state.characters[rulerId];
  ruler.gold -= chk.cost;
  ctx.state.counties[countyId].construction = { type: t, level: chk.level, remaining: chk.seasons };
  record(ruler).buildings += 1;
  gainXp(ctx.state, ruler, 'gestion', BALANCE.progression.buildXp);
  return true;
}

// --- Vassaux et contributions ---
export function vassalContribution(op: number): number {
  return clamp(
    E.vassalContribBase + op * E.vassalContribPerOpinion,
    E.vassalContribMin,
    E.vassalContribMax,
  );
}

export function incomeMultiplier(state: GameState, rulerId: string): number {
  const r = state.characters[rulerId];
  let m = 1 + E.gestionIncomeBonus * (skill(r, 'gestion') - 10);
  for (const t of r.traits) m *= TRAITS[t]?.income ?? 1;
  m *= 1 + perkBonus(state, r, 'income');
  m *= 1 + edictSum(state, rulerId, 'income');
  if (rulerId !== state.playerId) m *= E.aiIncomeMultiplier[state.difficulty];
  return m;
}

export interface Economy {
  gold: LedgerLine[];
  prestige: LedgerLine[];
  piety: LedgerLine[];
  goldNet: number;
}

/** Bilan d'une saison pour un personnage titré (souverain ou vassal). */
export function economyOf(state: GameState, id: string): Economy {
  const ruler = state.characters[id];
  const gold: LedgerLine[] = [];
  const prestige: LedgerLine[] = [];
  const piety: LedgerLine[] = [];
  const own = Object.values(state.counties).filter((c) => c.holderId === id && !c.occupation);
  // Revenus de chaque comté : base (développement, bâtiments) × impôts × contentement.
  const demesne =
    own.reduce((s, c) => s + countyIncome(c) * countyIncomeMult(c), 0) *
    incomeMultiplier(state, id);
  if (heldCounties(state, id).length > demesneLimit(state, id)) {
    gold.push({ label: 'Domaine propre trop étendu', value: -demesne * (1 - E.overDemesneIncome) });
  }
  gold.push({ label: 'Domaine propre', value: demesne });
  const taxCouncil = id === state.playerId ? councilTaxBonus(state) : 0;
  if (taxCouncil)
    gold.push({ label: 'Intendant : collecte des impôts', value: demesne * taxCouncil });
  // Impôts des vassaux.
  let tax = 0;
  for (const v of vassalsOf(state, id)) {
    const vc = Object.values(state.counties).filter((c) => c.holderId === v && !c.occupation);
    const base = vc.reduce((s, c) => s + countyIncome(c) * countyIncomeMult(c), 0);
    tax += base * E.vassalTaxRate * vassalContribution(opinion(state, v, id));
  }
  if (tax) gold.push({ label: 'Impôts des vassaux', value: tax });
  // Le vassal reverse ses impôts.
  if (ruler.liegeId) {
    const paid = demesne * E.vassalTaxRate * vassalContribution(opinion(state, id, ruler.liegeId));
    gold.push({ label: 'Impôts versés au suzerain', value: -paid });
  }
  // Entretien des troupes.
  const standing = state.standing[id];
  if (standing && totalMen(standing) > 0)
    gold.push({ label: 'Compagnies professionnelles', value: -armyUpkeep(standing) });
  const armies = Object.values(state.armies).filter((a) => a.ownerId === id);
  const up = armies.reduce((s, a) => s + armyUpkeep(a.men), 0);
  if (up) gold.push({ label: 'Armées en campagne', value: -up });
  // Édits et emprunts.
  const edictUpkeep = edictSum(state, id, 'upkeep');
  if (edictUpkeep) gold.push({ label: 'Édits : entretien', value: -edictUpkeep });
  const interest = (state.loans ?? [])
    .filter((l) => l.ownerId === id)
    .reduce((s, l) => s + l.principal * l.rate, 0);
  if (interest) gold.push({ label: 'Intérêts des emprunts', value: -interest });
  // Prestige.
  const P = E.prestige;
  prestige.push({
    label: 'Rang et réputation',
    value: P.base + heldCounties(state, id).length * P.perTitle * 0.25,
  });
  const duchies = Object.values(state.duchies).filter((d) => d.holderId === id).length;
  const kingdoms = Object.values(state.kingdoms).filter((k) => k.holderId === id).length;
  if (duchies) prestige.push({ label: 'Titres ducaux', value: duchies * P.perDuchy });
  if (kingdoms) prestige.push({ label: 'Couronne royale', value: kingdoms * P.perKingdom });
  const edictPrestige = edictSum(state, id, 'prestige');
  if (edictPrestige) prestige.push({ label: 'Édits', value: edictPrestige });
  // Piété.
  piety.push({
    label: 'Dévotion personnelle',
    value: E.piety.base + skill(ruler, 'savoir') * E.piety.perSavoir,
  });
  const edictPiety = edictSum(state, id, 'piety');
  if (edictPiety) piety.push({ label: 'Édits', value: edictPiety });
  const chap = own.reduce((s, c) => s + countyPiety(c), 0);
  if (chap) piety.push({ label: 'Chapelles', value: chap });
  if (id === state.playerId) {
    const seat = state.council.chapelain;
    const holder = seat.holderId ? state.characters[seat.holderId] : undefined;
    if (holder?.alive && seat.task === 'piete')
      piety.push({
        label: 'Chapelain : prières',
        value: skill(holder, 'savoir') * BALANCE.council.pietyPerSavoir,
      });
  }
  const round = (l: LedgerLine[]) => l.map((x) => ({ ...x, value: Math.round(x.value * 10) / 10 }));
  const g = round(gold);
  return {
    gold: g,
    prestige: round(prestige),
    piety: round(piety),
    goldNet: g.reduce((s, x) => s + x.value, 0),
  };
}

function councilTaxBonus(state: GameState): number {
  const seat = state.council.intendant;
  const h = seat.holderId ? state.characters[seat.holderId] : undefined;
  if (!h?.alive || seat.task !== 'impots') return 0;
  return BALANCE.council.collectTaxes * (skill(h, 'gestion') / 10);
}

/** Levées disponibles pour un souverain : domaine propre + part des vassaux. */
export function availableLevies(
  state: GameState,
  rulerId: string,
): { total: number; byCounty: Record<string, number> } {
  const byCounty: Record<string, number> = {};
  let total = 0;
  const r = state.characters[rulerId];
  // Un vassal (en révolte) ne lève que sur ses propres terres.
  const counties = r?.liegeId
    ? Object.values(state.counties).filter((c) => c.holderId === rulerId)
    : realmCounties(state, rulerId);
  for (const c of counties) {
    if (c.occupation) continue;
    let n = c.levyPool;
    if (c.holderId !== rulerId) {
      n *= E.vassalLevyRate * vassalContribution(opinion(state, c.holderId, rulerId));
    }
    n *= 1 + perkBonus(state, r, 'levies');
    n = Math.floor(n / 100) * 100;
    if (n > 0) {
      byCounty[c.id] = n;
      total += n;
    }
  }
  return { total, byCounty };
}

/** Compagnies professionnelles recrutables (bâtiments du domaine propre). */
export function recruitCapacity(
  state: GameState,
  rulerId: string,
): { unlocked: Set<string>; cap: number } {
  const unlocked = new Set<string>();
  let cap = 0;
  for (const c of Object.values(state.counties)) {
    if (c.holderId !== rulerId || c.occupation) continue;
    for (const b of c.buildings) {
      const def = BUILDINGS[b.type];
      for (const u of def.unlocks ?? []) unlocked.add(u);
      for (let l = 0; l < b.level; l++) cap += def.levels[l].recruitCap ?? 0;
    }
  }
  return { unlocked, cap };
}

export function standingOf(state: GameState, id: string): UnitCounts {
  return (state.standing[id] ??= emptyUnits());
}

// --- Saison : constructions, développement, levées ---
export function seasonRealm(ctx: Ctx): void {
  const { state, rng } = ctx;
  for (const c of Object.values(state.counties)) {
    // Chantiers.
    if (c.construction && !c.occupation) {
      c.construction.remaining -= 1;
      if (c.construction.remaining <= 0) {
        const { type, level } = c.construction;
        const ex = c.buildings.find((b) => b.type === type);
        if (ex) ex.level = level;
        else c.buildings.push({ type, level });
        c.construction = undefined;
        if (c.holderId === state.playerId)
          notify(state, `${BUILDINGS[type].name} (niveau ${level}) achevé à ${c.name}.`);
      }
    }
    // Développement.
    const holder = state.characters[c.holderId];
    if (holder && c.development < E.developmentMax && !c.occupation) {
      let p = E.devGrowthBase + skill(holder, 'savoir') * E.devGrowthPerSavoir + countyDevBonus(c);
      if (holder.id === state.playerId || holder.liegeId === state.playerId) {
        const seat = state.council.intendant;
        const st = seat.holderId ? state.characters[seat.holderId] : undefined;
        if (st?.alive && seat.task === 'developper' && seat.targetId === c.id)
          p += BALANCE.council.developChance + skill(st, 'gestion') * 0.003;
      }
      p *= 1 + perkBonus(state, holder, 'development');
      p *= countyDevMult(state, c);
      p /= 1 + c.development * 0.15;
      if (rng.chance(p)) {
        c.development += 1;
        if (holder.id === state.playerId)
          notify(state, `${c.name} se développe (niveau ${c.development}).`);
      }
    }
    // Levées.
    const max = countyMaxLevies(c) * levyCouncilBonus(state, c) * countyLevyMult(state, c);
    c.levyPool = Math.min(max, c.levyPool + max * E.levyRegen);
  }
}

function levyCouncilBonus(state: GameState, c: County): number {
  const ruler = countyRuler(state, c);
  if (ruler !== state.playerId) return 1;
  const seat = state.council.marechal;
  const h = seat.holderId ? state.characters[seat.holderId] : undefined;
  if (!h?.alive || seat.task !== 'levees') return 1;
  return 1 + BALANCE.council.levyBonus * (skill(h, 'guerre') / 10);
}

/** Applique revenus et entretien à tous les personnages titrés. */
export function seasonIncome(ctx: Ctx): void {
  const { state } = ctx;
  const titled = new Set(Object.values(state.counties).map((c) => c.holderId));
  for (const id of titled) {
    const c = state.characters[id];
    if (!c?.alive) continue;
    const eco = economyOf(state, id);
    c.gold += eco.goldNet;
    c.prestige += eco.prestige.reduce((s, x) => s + x.value, 0);
    c.piety += eco.piety.reduce((s, x) => s + x.value, 0);
    if (id === state.playerId)
      state.ledger = { gold: eco.gold, prestige: eco.prestige, piety: eco.piety };
    // Dettes : les vassaux s'agacent, les troupes désertent.
    if (c.gold < E.debtThreshold) {
      for (const v of vassalsOf(state, id)) addOpinion(state, v, id, 'Trésor vide', -5, 8);
      const st = state.standing[id];
      if (st)
        for (const k of Object.keys(st) as (keyof UnitCounts)[])
          st[k] = Math.floor((st[k] * 0.8) / 100) * 100;
      if (id === state.playerId)
        notify(state, 'Votre trésor est à sec : des compagnies désertent et vos vassaux grondent.');
    }
  }
}

// --- Titres ---
export interface TitleCheck {
  ok: boolean;
  reasons: string[];
  share: number;
  prestige: number;
  gold: number;
}

export function canCreateTitle(state: GameState, rulerId: string, titleId: string): TitleCheck {
  const r = state.characters[rulerId];
  const reasons: string[] = [];
  const isKingdom = !!state.kingdoms[titleId];
  const counties = isKingdom
    ? state.kingdoms[titleId].duchies.flatMap((d) => state.duchies[d].counties)
    : (state.duchies[titleId]?.counties ?? []);
  const held = counties.filter((id) => countyRuler(state, state.counties[id]) === rulerId).length;
  const share = counties.length ? held / counties.length : 0;
  const R = BALANCE.realm;
  const need = isKingdom ? R.kingdomMinShare : R.duchyMinShare;
  const prestige = isKingdom ? R.kingdomPrestigeCost : R.duchyPrestigeCost;
  const gold = isKingdom ? R.kingdomGoldCost : R.duchyGoldCost;
  const holder = isKingdom ? state.kingdoms[titleId].holderId : state.duchies[titleId]?.holderId;
  if (holder) reasons.push(`Titre déjà tenu par ${state.characters[holder]?.name ?? '—'}`);
  if (r.liegeId) reasons.push('Un vassal ne peut pas créer de titre');
  if (share < need)
    reasons.push(
      `Contrôler ${Math.round(need * 100)} % des comtés (actuellement ${Math.round(share * 100)} %)`,
    );
  if (r.prestige < prestige) reasons.push(`${prestige} prestige requis`);
  if (r.gold < gold) reasons.push(`${gold} or requis`);
  return { ok: reasons.length === 0, reasons, share, prestige, gold };
}

export function createTitle(ctx: Ctx, rulerId: string, titleId: string): boolean {
  const { state } = ctx;
  const chk = canCreateTitle(state, rulerId, titleId);
  if (!chk.ok) return false;
  const r = state.characters[rulerId];
  r.prestige -= chk.prestige;
  r.gold -= chk.gold;
  const isKingdom = !!state.kingdoms[titleId];
  const C = BALANCE.characters;
  if (isKingdom) state.kingdoms[titleId].holderId = rulerId;
  else state.duchies[titleId].holderId = rulerId;
  const name = isKingdom
    ? `Royaume de ${state.kingdoms[titleId].name}`
    : `Duché de ${state.duchies[titleId].name}`;
  if (r.dynastyId)
    state.dynasties[r.dynastyId].renown += isKingdom
      ? C.renownPerTitle.royaume * 10
      : C.renownPerTitle.duche * 10;
  chronicle(state, `${r.name} fonde le ${name}.`, 'titre');
  return true;
}
