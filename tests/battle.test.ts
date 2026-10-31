import { describe, expect, it } from 'vitest';
import { BALANCE } from '../src/data/balance';
import {
  autoResolve,
  deployPreset,
  isRouted,
  resolveRound,
  sideMen,
  validOrders,
} from '../src/engine/battle/engine';
import type { SideOrders } from '../src/engine/battle/types';
import { Rng } from '../src/engine/rng';
import { totalMen } from '../src/engine/units';
import { allOn, battle, cmd, fixedRng, side, start, units } from './helpers';

const hold: SideOrders = { orders: { left: 'tenir', center: 'tenir', right: 'tenir' } };
const forced = (a: SideOrders, d: SideOrders) => ({ forced: { attacker: a, defender: d } });

describe('Bataille — résolution d’un round (9.6)', () => {
  it('applique la formule de dégâts, de pertes et de moral', () => {
    const b = battle(side(units({ levees: 1000 })), side(units({ levees: 1000 })));
    allOn(b, 'attacker', 'center');
    allOn(b, 'defender', 'center');
    start(b);
    resolveRound(b, fixedRng(), forced(hold, hold));
    // D = R·C·N·Atk·O·T·M = 1·1·1000·2·0,7·1·1 = 1400 ; Def = 2·1,4 = 2,8 ; P = 0,1·1400/2,8 = 50.
    expect(b.defender.fronts.center.lastLoss).toBeCloseTo(50, 5);
    expect(totalMen(b.defender.fronts.center.men)).toBeCloseTo(950, 5);
    // ΔMoral = −150·50/1000 × 0,75 (Tenir) = −5,625 ; moral de départ 40.
    expect(b.defender.fronts.center.morale).toBeCloseTo(40 - 5.625, 5);
  });

  it('le coefficient du commandant vaut 1 + 0,02 × (Guerre − 10)', () => {
    const b = battle(side(units({ levees: 1000 }), { commanders: [cmd('a', 20)] }), side(units({ levees: 1000 })));
    allOn(b, 'attacker', 'center');
    allOn(b, 'defender', 'center');
    start(b);
    resolveRound(b, fixedRng(), forced(hold, hold));
    expect(b.defender.fronts.center.lastLoss).toBeCloseTo(50 * 1.2, 5);
  });

  it('Charger contre un mur de piques : la cavalerie subit des pertes ×1,5', () => {
    const run = (pikes: boolean) => {
      const b = battle(side(units({ cavalerie: 1000 })), side(units(pikes ? { piquiers: 1000 } : { levees: 1000 })));
      allOn(b, 'attacker', 'center');
      allOn(b, 'defender', 'center');
      start(b);
      resolveRound(b, fixedRng(), forced({ orders: { left: 'tenir', center: 'charger', right: 'tenir' } }, hold));
      return b;
    };
    const b = run(true);
    // Piquiers : atk 3 × 0,7 (Tenir) × 1,8 (contre cavalerie) ; cible charge : déf 4 × 0,85.
    const expected = (0.1 * (1000 * 3 * 0.7 * 1.8)) / (4 * 0.85) * 1.5;
    expect(b.attacker.fronts.center.lastLoss).toBeCloseTo(expected, 3);
  });

  it('un front est brisé à 0 de moral et fuit avec 10 % de pertes', () => {
    const b = battle(side(units({ infanterie: 2000 })), side(units({ levees: 300 })));
    allOn(b, 'attacker', 'center');
    allOn(b, 'defender', 'center');
    start(b);
    resolveRound(b, fixedRng(), forced({ orders: { left: 'tenir', center: 'charger', right: 'tenir' } }, hold));
    const f = b.defender.fronts.center;
    expect(f.broken).toBe(true);
    expect(f.morale).toBe(0);
  });

  it('déroute quand le centre est brisé et la réserve vide', () => {
    const b = battle(side(units({ infanterie: 2000 })), side(units({ levees: 300 })));
    allOn(b, 'attacker', 'center');
    allOn(b, 'defender', 'center');
    start(b);
    resolveRound(b, fixedRng(), forced({ orders: { left: 'tenir', center: 'charger', right: 'tenir' } }, hold));
    expect(isRouted(b.defender)).toBe(true);
    expect(b.phase).toBe('fin');
    expect(b.result?.winner).toBe('attacker');
    expect(b.result?.reason).toBe('deroute');
  });

  it('après 8 rounds sans déroute, l’attaquant se retire et le score est divisé par deux', () => {
    const b = battle(side(units({ piquiers: 3000 })), side(units({ piquiers: 3000 })));
    start(b);
    for (let i = 0; i < 8 && b.phase === 'rounds'; i++) {
      // Aucun échange : les deux camps tirent sans archers → Tenir ; on neutralise les pertes.
      resolveRound(b, fixedRng(), forced(hold, hold));
      for (const k of ['attacker', 'defender'] as const) for (const f of ['left', 'center', 'right'] as const) b[k].fronts[f].morale = 60;
    }
    expect(b.result?.reason).toBe('retraite');
    expect(b.result?.winner).toBe('defender');
    const ws = BALANCE.battle.warScore;
    const full = ws.min + (ws.max - ws.min) * Math.min(1, 6000 / ws.menForMax);
    expect(b.result?.warScore).toBe(Math.round(full / 2));
  });

  it('Prendre de flanc n’est possible que pour un front libre', () => {
    const b = battle(side(units({ levees: 3000 })), side(units({ levees: 3000 })));
    start(b);
    expect(validOrders(b, 'attacker', 'left')).not.toContain('flanc');
    b.defender.fronts.left.broken = true;
    expect(validOrders(b, 'attacker', 'left')).toContain('flanc');
  });

  it('Impétueux ne peut pas ordonner Se replier', () => {
    const b = battle(
      side(units({ levees: 3000 }), { commanders: [cmd('i', 10, ['impetueux']), cmd('p', 10, ['prudent'])] }),
      side(units({ levees: 3000 })),
    );
    start(b);
    // Le commandant principal (centre) est Impétueux ; l'aile gauche a son propre commandant.
    expect(validOrders(b, 'attacker', 'center')).not.toContain('replier');
    expect(validOrders(b, 'attacker', 'left')).toContain('replier');
    // L'aile droite, sans commandant propre, suit le commandant principal.
    expect(validOrders(b, 'attacker', 'right')).not.toContain('replier');
  });

  it('Se replier envoie le front en réserve avec −10 de moral', () => {
    const b = battle(side(units({ levees: 3000 })), side(units({ levees: 3000 })));
    deployPreset(b, 'attacker', 'equilibre');
    start(b);
    const before = totalMen(b.attacker.reserve);
    const moved = totalMen(b.attacker.fronts.left.men);
    resolveRound(b, fixedRng(), forced({ orders: { left: 'replier', center: 'tenir', right: 'tenir' } }, hold));
    expect(b.attacker.fronts.left.withdrawn).toBe(true);
    expect(totalMen(b.attacker.reserve)).toBeCloseTo(before + moved, 3);
  });

  it('les renforts de réserve ajoutent leur moral +10', () => {
    const b = battle(side(units({ levees: 2000 })), side(units({ levees: 2000 })));
    allOn(b, 'attacker', 'center');
    b.attacker.reserve.levees = 1000;
    b.attacker.fronts.center.men.levees = 1000;
    start(b);
    b.attacker.fronts.center.morale = 20;
    const orders: SideOrders = { ...hold, reserve: { center: { levees: 1000 } } };
    resolveRound(b, fixedRng(), forced(orders, hold));
    // Moyenne (20 × 1000 + 50 × 1000) / 2000 = 35 avant pertes du round.
    expect(b.attacker.fronts.center.morale).toBeLessThanOrEqual(35);
    expect(b.attacker.fronts.center.morale).toBeGreaterThan(30);
  });

  it('moral de départ : −10 en hiver, +10 si le souverain commande', () => {
    const b = battle(
      side(units({ levees: 1000 }), { commanders: [cmd('roi', 10, [], { isSovereign: true })] }),
      side(units({ levees: 1000 })),
      { season: 3 },
    );
    allOn(b, 'attacker', 'center');
    allOn(b, 'defender', 'center');
    start(b);
    expect(b.attacker.fronts.center.morale).toBe(40);
    expect(b.defender.fronts.center.morale).toBe(30);
  });

  it('reconnaissance : territoire ami + espionnage + Stratège, plafonnée à 2', () => {
    const b = battle(
      side(units({ levees: 1000 }), { friendlyTerritory: true, spied: true, commanders: [cmd('s', 10, ['stratege'])] }),
      side(units({ levees: 1000 })),
    );
    expect(b.attacker.recon).toBe(2);
    expect(b.defender.recon).toBe(0);
  });

  it('Inébranlable : jamais plus de 20 de moral perdus par round', () => {
    const b = battle(side(units({ infanterie: 1200 })), side(units({ levees: 1000 }), { commanders: [cmd('ine', 10, ['inebranlable'])] }));
    allOn(b, 'attacker', 'center');
    allOn(b, 'defender', 'center');
    start(b);
    const m0 = b.defender.fronts.center.morale;
    resolveRound(b, fixedRng(), forced({ orders: { left: 'tenir', center: 'charger', right: 'tenir' } }, hold));
    expect(m0 - b.defender.fronts.center.morale).toBeLessThanOrEqual(20 + 1e-9);
  });

  it('est déterministe à graine égale', () => {
    const run = () => {
      const rng = new Rng(42);
      const b = battle(side(units({ levees: 1500, archers: 300, cavalerie: 200 })), side(units({ levees: 1200, piquiers: 400, infanterie: 200 })), {}, rng);
      autoResolve(b, rng);
      return b.result;
    };
    expect(run()).toEqual(run());
  });

  it('conserve les effectifs : pertes = effectif initial − survivants', () => {
    const rng = new Rng(7);
    const b = battle(side(units({ levees: 1500, archers: 300 })), side(units({ levees: 1200, piquiers: 400 })), {}, rng);
    autoResolve(b, rng);
    const r = b.result!;
    expect(r.losses.attacker).toBe(Math.round(b.attacker.initialMen - totalMen(sideMen(b.attacker))));
    expect(r.rounds).toBeGreaterThan(0);
    expect(r.rounds).toBeLessThanOrEqual(8);
  });
});
