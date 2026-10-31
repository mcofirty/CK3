/** Arbres de compétences, héritages, stress, ambitions et relations. */
import { useState } from 'react';
import { BALANCE } from '../../data/balance';
import {
  BRANCH_NAMES,
  LEGACIES,
  LEGACY_BRANCH_NAMES,
  PERKS,
  type LegacyDef,
  type PerkDef,
} from '../../data/perks';
import { ambitionStatus } from '../../engine/ambitions';
import {
  canTakeLegacy,
  canTakePerk,
  legacyCost,
  perkPoints,
  renownAvailable,
  xpProgress,
} from '../../engine/progression';
import { STRESS_LABELS, stressLevel, stressOf } from '../../engine/stress';
import { SKILL_KEYS, type Character, type GameState, type SkillKey } from '../../engine/state';
import { useStore } from '../store';
import { Bar, CharLink } from './common';

const BRANCH_ICONS: Record<SkillKey, string> = {
  diplomatie: '🕊️',
  guerre: '⚔️',
  gestion: '🌾',
  ruse: '🗝️',
  savoir: '📜',
};

// ---------------------------------------------------------------------------
// Arbre de talents d'un personnage
// ---------------------------------------------------------------------------

export function PerkTree({ game, c }: { game: GameState; c: Character }) {
  const dispatch = useStore((s) => s.dispatch);
  const [sel, setSel] = useState<string | null>(null);
  const editable = c.alive && c.dynastyId === game.playerDynastyId;
  const points = perkPoints(c);
  const owned = new Set(c.perks ?? []);
  const selDef = sel ? PERKS[sel] : undefined;
  const chk = sel ? canTakePerk(c, sel) : undefined;
  return (
    <div className="perk-tree">
      <div className="row small" style={{ marginBottom: 6 }}>
        <span className="grow muted">
          Expérience vers le prochain talent ({BALANCE.progression.xpPerPoint} par point)
        </span>
        <b className={points > 0 ? 'good' : ''}>
          {points > 0 ? `${points} point${points > 1 ? 's' : ''} à dépenser` : '—'}
        </b>
      </div>
      <Bar value={xpProgress(c) * 100} max={100} color="var(--gold)" />
      <p className="small muted" style={{ margin: '6px 0 10px' }}>
        Les talents appartiennent à {c.name} et disparaissent à sa mort.
      </p>
      {SKILL_KEYS.map((b) => (
        <TreeBranch
          key={b}
          title={`${BRANCH_ICONS[b]} ${BRANCH_NAMES[b]}`}
          tiers={[1, 2, 3, 4].map((t) =>
            Object.values(PERKS).filter((p) => p.branch === b && p.tier === t),
          )}
          state={(p) => (owned.has(p.id) ? 'owned' : canTakePerk(c, p.id).ok ? 'open' : 'locked')}
          selected={sel}
          onSelect={(id) => setSel(sel === id ? null : id)}
        />
      ))}
      {selDef && (
        <NodeDetail
          name={selDef.name}
          description={selDef.description}
          owned={owned.has(selDef.id)}
          action={
            editable && !owned.has(selDef.id)
              ? {
                  label: 'Acquérir (1 point)',
                  ok: !!chk?.ok,
                  reason: chk?.reason,
                  run: () => {
                    dispatch({ type: 'takePerk', characterId: c.id, perkId: selDef.id });
                    setSel(null);
                  },
                }
              : undefined
          }
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Héritages de la maison
// ---------------------------------------------------------------------------

export function LegacyTree({ game }: { game: GameState }) {
  const dispatch = useStore((s) => s.dispatch);
  const [sel, setSel] = useState<string | null>(null);
  const d = game.dynasties[game.playerDynastyId];
  const owned = new Set(d?.legacies ?? []);
  const avail = renownAvailable(game, game.playerDynastyId);
  const selDef = sel ? LEGACIES[sel] : undefined;
  const chk = sel ? canTakeLegacy(game, game.playerDynastyId, sel) : undefined;
  return (
    <div className="perk-tree legacy">
      <div className="row small" style={{ marginBottom: 8 }}>
        <span className="grow muted">
          Achetés avec la renommée, ils restent à la maison jusqu’à la fin.
        </span>
        <b>{avail} renommée</b>
      </div>
      {SKILL_KEYS.map((b) => (
        <TreeBranch
          key={b}
          title={`${BRANCH_ICONS[b]} ${LEGACY_BRANCH_NAMES[b]}`}
          tiers={[1, 2, 3].map((t) =>
            Object.values(LEGACIES).filter((p) => p.branch === b && p.tier === t),
          )}
          state={(p) =>
            owned.has(p.id)
              ? 'owned'
              : canTakeLegacy(game, game.playerDynastyId, p.id).ok
                ? 'open'
                : 'locked'
          }
          cost={(p) => legacyCost(p.id)}
          selected={sel}
          onSelect={(id) => setSel(sel === id ? null : id)}
        />
      ))}
      {selDef && (
        <NodeDetail
          name={selDef.name}
          description={selDef.description}
          owned={owned.has(selDef.id)}
          action={
            owned.has(selDef.id)
              ? undefined
              : {
                  label: `Acquérir (${legacyCost(selDef.id)} renommée)`,
                  ok: !!chk?.ok,
                  reason: chk?.reason,
                  run: () => {
                    dispatch({ type: 'takeLegacy', legacyId: selDef.id });
                    setSel(null);
                  },
                }
          }
        />
      )}
    </div>
  );
}

type NodeState = 'owned' | 'open' | 'locked';

function TreeBranch<T extends PerkDef | LegacyDef>({
  title,
  tiers,
  state,
  cost,
  selected,
  onSelect,
}: {
  title: string;
  tiers: T[][];
  state: (p: T) => NodeState;
  cost?: (p: T) => number;
  selected: string | null;
  onSelect: (id: string) => void;
}) {
  return (
    <div className="tree-branch">
      <div className="tree-title">{title}</div>
      <div className="tree-grid" style={{ ['--cols' as string]: tiers.length }}>
        {tiers.map((tier, i) => (
          <div key={i} className="tree-col">
            {tier.map((p) => {
              const st = state(p);
              return (
                <button
                  key={p.id}
                  className={`perk ${st}${selected === p.id ? ' sel' : ''}`}
                  onClick={() => onSelect(p.id)}
                >
                  <span className="perk-name">{p.name}</span>
                  {cost && st !== 'owned' && <span className="perk-cost">{cost(p)}</span>}
                  {st === 'owned' && <span className="perk-cost">✓</span>}
                </button>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

function NodeDetail({
  name,
  description,
  owned,
  action,
}: {
  name: string;
  description: string;
  owned: boolean;
  action?: { label: string; ok: boolean; reason?: string; run: () => void };
}) {
  return (
    <div className="node-detail glass">
      <b>{name}</b>
      {owned && (
        <span className="chip good" style={{ marginLeft: 6 }}>
          Acquis
        </span>
      )}
      <p className="small" style={{ margin: '4px 0 8px' }}>
        {description}
      </p>
      {action && (
        <>
          <button className="btn primary block" disabled={!action.ok} onClick={action.run}>
            {action.label}
          </button>
          {!action.ok && action.reason && (
            <p className="small muted center" style={{ margin: '6px 0 0' }}>
              {action.reason}
            </p>
          )}
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Stress
// ---------------------------------------------------------------------------

export function StressGauge({ c }: { c: Character }) {
  const s = stressOf(c);
  const lvl = stressLevel(c);
  const color = ['var(--good)', 'var(--gold)', 'var(--bad)', 'var(--bad)'][lvl];
  return (
    <div className="stress">
      <div className="row small">
        <span className="grow muted">Stress</span>
        <b style={{ color }}>
          {STRESS_LABELS[lvl]} ({s})
        </b>
      </div>
      <Bar value={Math.min(100, s)} max={100} color={color} />
      {lvl >= 2 && (
        <p className="small muted" style={{ margin: '4px 0 0' }}>
          L’angoisse ronge la santé. Chasse, festin ou retraite spirituelle soulagent l’esprit.
        </p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Ambition du règne
// ---------------------------------------------------------------------------

export function AmbitionCard({ game }: { game: GameState }) {
  const dispatch = useStore((s) => s.dispatch);
  const p = game.characters[game.playerId];
  const st = ambitionStatus(game, p);
  return (
    <div className="card ambition">
      <h3>Ambition du règne</h3>
      {st ? (
        <>
          <div className="row">
            <span className="amb-icon">{st.def.icon}</span>
            <div className="grow">
              <b>{st.def.name}</b>
              <div className="small muted">
                {st.def.description.replace('{n}', String(st.target))}
              </div>
            </div>
          </div>
          <div className="row small" style={{ margin: '8px 0 4px' }}>
            <span className="grow">
              {Math.min(st.value, st.target)} / {st.target}
            </span>
            <span className={st.seasonsLeft < 8 ? 'bad' : 'muted'}>
              {Math.ceil(st.seasonsLeft / 4)} an(s) restant(s)
            </span>
          </div>
          <Bar
            value={Math.min(st.value, st.target)}
            max={Math.max(1, st.target)}
            color="var(--gold)"
          />
          <p className="small muted" style={{ margin: '6px 0 8px' }}>
            Récompense : +{st.def.reward.prestige} prestige, +{st.def.reward.renown} renommée, un
            talent.
          </p>
          <button className="btn small ghost" onClick={() => dispatch({ type: 'abandonAmbition' })}>
            Renoncer (stress)
          </button>
        </>
      ) : (
        <>
          <p className="small muted">
            Aucun grand dessein pour l’instant. Une ambition donne un but à votre règne.
          </p>
          <button
            className="btn primary block"
            disabled={game.phase !== 'saison'}
            onClick={() => dispatch({ type: 'offerAmbition' })}
          >
            Choisir une ambition
          </button>
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Relations
// ---------------------------------------------------------------------------

export function RelationsList({ game, c }: { game: GameState; c: Character }) {
  const alive = (ids: string[] | undefined) =>
    (ids ?? []).filter((id) => game.characters[id]?.alive);
  const groups: [string, string[], string][] = [
    ['Amis', alive(c.friends), 'good'],
    ['Rivaux', alive(c.rivals), 'bad'],
    ['Amants', alive(c.lovers), 'love'],
  ];
  const any = groups.some((g) => g[1].length);
  if (!any) return <p className="small muted">Ni ami, ni rival, ni amant pour l’instant.</p>;
  return (
    <div className="relations">
      {groups
        .filter((g) => g[1].length)
        .map(([label, ids, cls]) => (
          <div key={label} className="row wrap small" style={{ gap: 6, marginBottom: 4 }}>
            <span className={`rel-label ${cls}`}>{label}</span>
            {ids.map((id) => (
              <CharLink key={id} state={game} id={id} />
            ))}
          </div>
        ))}
    </div>
  );
}

export function RecordLine({ c }: { c: Character }) {
  const r = c.record;
  if (!r || (!r.battles && !r.plots && !r.ambitions && !r.buildings)) return null;
  const bits = [
    r.battles
      ? `${r.battles} bataille${r.battles > 1 ? 's' : ''} (${r.wins} victoire${r.wins > 1 ? 's' : ''})`
      : '',
    r.duels ? `${r.duels} duel${r.duels > 1 ? 's' : ''} gagné${r.duels > 1 ? 's' : ''}` : '',
    r.plots ? `${r.plots} complot${r.plots > 1 ? 's' : ''}` : '',
    r.buildings ? `${r.buildings} chantier${r.buildings > 1 ? 's' : ''}` : '',
    r.ambitions
      ? `${r.ambitions} ambition${r.ambitions > 1 ? 's' : ''} accomplie${r.ambitions > 1 ? 's' : ''}`
      : '',
  ].filter(Boolean);
  return <p className="small">{bits.join(' · ')}</p>;
}
