import { describe, expect, it } from 'vitest';
import { skill } from '../src/engine/characters';
import { applyAction } from '../src/engine/actions';
import { defenseRuse, hasGrudge, plotTargets, seasonPlots } from '../src/engine/intrigue';
import { Rng } from '../src/engine/rng';
import { newGame } from '../src/engine/world';
import { clearEvents } from './helpers';

function rivalWithChild(s: ReturnType<typeof newGame>) {
  const r = Object.values(s.characters).find(
    (c) =>
      c.alive &&
      !c.liegeId &&
      c.id !== s.playerId &&
      Object.values(s.counties).some((k) => k.holderId === c.id) &&
      c.childrenIds.some((k) => s.characters[k]?.alive),
  )!;
  const kid = s.characters[r.childrenIds.find((k) => s.characters[k]?.alive)!];
  return { r, kid };
}

describe('Complots contre la famille d’un souverain', () => {
  it('les enfants d’un souverain rival sont des cibles possibles', () => {
    const s = newGame({ seed: 81 });
    const { r, kid } = rivalWithChild(s);
    const groups = plotTargets(s, s.playerId, 'assassiner');
    const g = groups.find((x) => x.rulerId === r.id)!;
    expect(g.members.map((m) => m.id)).toContain(kid.id);
    expect(g.members.find((m) => m.id === kid.id)?.relation).toMatch(/fils|fille/);
    // Jamais sa propre famille.
    const mine = new Set(
      Object.values(s.characters)
        .filter((c) => c.dynastyId === s.playerDynastyId)
        .map((c) => c.id),
    );
    for (const x of groups) for (const m of x.members) expect(mine.has(m.id)).toBe(false);
  });

  it('un enfant est protégé par la vigilance de sa cour', () => {
    const s = newGame({ seed: 82 });
    const { r, kid } = rivalWithChild(s);
    kid.skills.ruse = 0;
    r.skills.ruse = 18;
    expect(defenseRuse(s, kid)).toBeGreaterThanOrEqual(skill(r, 'ruse'));
  });

  it('tuer un enfant stresse l’assassin ; la famille peut deviner qui a frappé', () => {
    let s = clearEvents(newGame({ seed: 83 }));
    const { kid } = rivalWithChild(s);
    const p = s.characters[s.playerId];
    p.traits = [...p.traits.filter((t) => t !== 'cruel'), 'juste'];
    s = applyAction(s, { type: 'startPlot', plotType: 'assassiner', targetId: kid.id });
    const plot = Object.values(s.plots).find((x) => x.ownerId === s.playerId)!;
    expect(plot).toBeDefined();
    plot.progress = 100;
    // Pas de découverte, puis assassinat réussi et soupçon de la famille.
    const rng = new Rng(1);
    const seq = [0.99, 0.1, 0.1];
    rng.next = () => seq.shift() ?? 0.1;
    seasonPlots({ state: s, rng });
    expect(s.characters[kid.id].alive).toBe(false);
    expect(s.characters[s.playerId].stress ?? 0).toBeGreaterThanOrEqual(30);
    const parent = s.characters[kid.fatherId ?? kid.motherId ?? ''];
    if (parent?.alive) expect(hasGrudge(s, parent, s.playerId)).toBe(true);
  });
});
