import { describe, expect, it } from 'vitest';
import { BALANCE } from '../src/data/balance';
import { MERC_BY_ID } from '../src/data/mercenaries';
import { applyAction } from '../src/engine/actions';
import { Rng } from '../src/engine/rng';
import { standingOf } from '../src/engine/realm';
import {
  mercCheck,
  negotiateChance,
  seasonMercenaries,
  tryNegotiate,
} from '../src/engine/war/campaignExtras';
import { startEventBattle } from '../src/engine/war/eventBattle';
import { newGame } from '../src/engine/world';
import { totalMen } from '../src/engine/units';
import { clearEvents } from './helpers';

describe('Mercenaires', () => {
  it('se louent contre de l’or, puis partent à la fin du contrat', () => {
    let s = clearEvents(newGame({ seed: 41 }));
    const p = s.characters[s.playerId];
    p.gold = 1000;
    const before = totalMen(standingOf(s, p.id));
    s = applyAction(s, { type: 'hireMercenaries', id: 'lion_noir' });
    expect(s.characters[p.id].gold).toBe(1000 - MERC_BY_ID.lion_noir.cost);
    expect(totalMen(standingOf(s, p.id))).toBe(before + 600);
    expect(mercCheck(s, p.id, 'lion_noir').ok).toBe(false);
    s.turn += BALANCE.mercenaries.contractSeasons;
    seasonMercenaries(s);
    expect(totalMen(standingOf(s, p.id))).toBe(before);
    expect(mercCheck(s, p.id, 'lion_noir').reason).toContain('De retour');
  });
});

describe('Sièges', () => {
  it('négocier : une seule tentative, la garnison peut se rendre contre de l’or', () => {
    const s = newGame({ seed: 42 });
    s.pendingEvents = [];
    const p = s.characters[s.playerId];
    p.gold = 500;
    const target = Object.values(s.counties).find((c) => c.holderId !== p.id)!;
    s.armies.x = {
      id: 'x',
      ownerId: p.id,
      location: target.id,
      men: { levees: 1000, piquiers: 0, archers: 0, infanterie: 0, cavalerie: 0 },
      baseMen: 1000,
      levyFrom: {},
      supply: 100,
      frontCommanders: [],
      path: [],
      seasonsRaised: 0,
      siegeMode: 'negocier',
    };
    target.siege = { armyId: 'x', progress: 5 };
    expect(negotiateChance(s, 'x')).toBeGreaterThan(0.5);
    const ok = tryNegotiate({ state: s, rng: new Rng(1) }, 'x');
    expect(s.armies.x.negotiated).toBe(target.id);
    if (ok) expect(s.characters[p.id].gold).toBe(500 - BALANCE.siege.negotiateGold);
    // Pas de seconde tentative sur la même place.
    s.armies.x.siegeMode = 'negocier';
    expect(tryNegotiate({ state: s, rng: new Rng(1) }, 'x')).toBe(false);
  });
});

describe('Bataille d’événement', () => {
  it('ouvre une bataille contre des pillards, puis applique l’issue', () => {
    let s = clearEvents(newGame({ seed: 43 }));
    const prestige = s.characters[s.playerId].prestige;
    startEventBattle(
      { state: s, rng: new Rng(2) },
      {
        ennemi: 'Pillards',
        force: 0.3,
        victoire: [{ prestige: 100 }],
        defaite: [{ prestige: -100 }],
      },
      {},
    );
    expect(s.phase).toBe('bataille');
    expect(s.battle?.event).toBeDefined();
    s = applyAction(s, { type: 'battleAuto' });
    s = applyAction(s, { type: 'battleClose' });
    expect(s.phase).toBe('saison');
    expect(s.characters[s.playerId].prestige).not.toBe(prestige);
  });
});
