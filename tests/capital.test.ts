import { describe, expect, it } from 'vitest';
import { BALANCE } from '../src/data/balance';
import { applyAction } from '../src/engine/actions';
import { runAi } from '../src/engine/ai';
import { seasonPopulation } from '../src/engine/economy';
import {
  basePopulation,
  countyIncomeMult,
  countySlots,
  hurtPopulation,
  isCapital,
  populationOf,
  vitalityOf,
} from '../src/engine/economy/local';
import {
  canMoveCapital,
  capitalOf,
  economyOf,
  fortLevel,
  independentRulers,
  realmCounties,
} from '../src/engine/realm';
import { Rng } from '../src/engine/rng';
import { migrate } from '../src/save/migrations';
import { capitalFallen, declareWar, peaceAcceptance, transferCounty } from '../src/engine/war';
import { newGame } from '../src/engine/world';
import { clearEvents } from './helpers';

const C = BALANCE.capital;

describe('Capitale', () => {
  it('chaque seigneur titré siège dans un seul de ses comtés', () => {
    const s = newGame({ seed: 31 });
    const holders = new Set(Object.values(s.counties).map((c) => c.holderId));
    for (const id of holders) {
      const seats = Object.values(s.counties).filter((c) => c.seatOf === id);
      expect(seats).toHaveLength(1);
      expect(seats[0].holderId).toBe(id);
    }
    expect(isCapital(capitalOf(s, s.playerId)!)).toBe(true);
  });

  it('la capitale rapporte, lève et bâtit davantage, et elle est mieux fortifiée', () => {
    const s = newGame({ seed: 32 });
    const cap = capitalOf(s, s.playerId)!;
    const plain = { ...cap, seatOf: undefined };
    expect(countyIncomeMult(cap) / countyIncomeMult(plain)).toBeCloseTo(C.incomeMult);
    expect(countySlots(cap)).toBe(cap.slots + C.extraSlots);
    expect(fortLevel(cap)).toBe(fortLevel(plain) + C.fort);
    expect(basePopulation(cap)).toBeCloseTo(basePopulation(plain) * BALANCE.population.capitalMult);
    const eco = economyOf(s, s.playerId);
    expect(eco.gold.some((l) => l.label.startsWith('Capitale (') && l.value > 0)).toBe(true);
  });

  it('la population souffre des pertes puis se remet avec le temps', () => {
    const s = newGame({ seed: 33 });
    const c = capitalOf(s, s.playerId)!;
    const before = populationOf(c);
    hurtPopulation(c, 0.3);
    expect(populationOf(c)).toBeLessThan(before);
    const hurt = vitalityOf(c);
    for (let i = 0; i < 6; i++) seasonPopulation(c);
    expect(vitalityOf(c)).toBeGreaterThan(hurt);
    // Moins d'âmes, moins de revenus.
    const full = { ...c, vitality: 1 };
    expect(countyIncomeMult(c)).toBeLessThan(countyIncomeMult(full));
  });

  it('une capitale occupée ampute les revenus et pousse l’IA à capituler', () => {
    const s = newGame({ seed: 34 });
    clearEvents(s);
    const rival = independentRulers(s).find((id) => id !== s.playerId)!;
    const target = realmCounties(s, rival)[0];
    const ctx = { state: s, rng: new Rng(5) };
    const w = declareWar(ctx, s.playerId, rival, 'conquete', target.id, true)!;
    const cap = capitalOf(s, rival)!;
    cap.occupation = { warId: w.id, byRulerId: s.playerId, since: s.turn - C.capitulateSeasons };
    expect(capitalFallen(s, w, rival)).toBe(true);
    expect(
      economyOf(s, rival).gold.some((l) => l.label.startsWith('Capitale occupée') && l.value < 0),
    ).toBe(true);
    // Avec un score modeste, la reddition peut déjà être exigée.
    w.score = C.demandScore;
    expect(peaceAcceptance(s, w.id, s.playerId, 'exiger').accept).toBe(true);
    // Mal engagée, l'IA capitule d'elle-même.
    w.score = -C.capitulateScore;
    runAi(ctx);
    expect(s.wars[w.id]).toBeUndefined();
  });

  it('perdre sa capitale coûte du prestige ; une nouvelle est choisie', () => {
    const s = newGame({ seed: 35 });
    const rival = independentRulers(s).find((id) => id !== s.playerId)!;
    const cap = capitalOf(s, rival)!;
    const prestige = s.characters[rival].prestige;
    transferCounty(s, cap.id, s.playerId);
    expect(s.characters[rival].prestige).toBe(prestige + C.lostPrestige);
    expect(cap.seatOf).toBeUndefined();
    const next = capitalOf(s, rival);
    if (next) expect(next.seatOf).toBe(rival);
  });

  it('déplacer sa capitale coûte or et prestige, puis attend un délai', () => {
    let s = newGame({ seed: 36 });
    clearEvents(s);
    const pl = s.characters[s.playerId];
    pl.gold = 1000;
    pl.prestige = 1000;
    const old = capitalOf(s, s.playerId)!;
    const other = Object.values(s.counties).find(
      (c) => c.holderId === s.playerId && c.id !== old.id && !c.occupation,
    )!;
    expect(canMoveCapital(s, s.playerId, other.id).ok).toBe(true);
    s = applyAction(s, { type: 'moveCapital', countyId: other.id });
    expect(capitalOf(s, s.playerId)!.id).toBe(other.id);
    expect(s.characters[s.playerId].gold).toBe(1000 - C.moveGold);
    expect(canMoveCapital(s, s.playerId, old.id).ok).toBe(false);
  });

  it('une sauvegarde v6 reçoit ses capitales', () => {
    const s = newGame({ seed: 37 }) as unknown as Record<string, unknown>;
    for (const c of Object.values(s.counties as Record<string, { seatOf?: string }>))
      delete c.seatOf;
    s.version = 6;
    const m = migrate(JSON.parse(JSON.stringify(s)));
    expect(Object.values(m.counties).some((c) => c.seatOf === m.playerId)).toBe(true);
  });
});
