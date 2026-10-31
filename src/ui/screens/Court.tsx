import { useState } from 'react';
import { BALANCE } from '../../data/balance';
import {
  ageOf,
  closeFamily,
  displayName,
  healthOf,
  isAdult,
  livingChildren,
  skill,
} from '../../engine/characters';
import { heirsOf } from '../../engine/characters/lifecycle';
import { COUNCIL_INFO, COUNCIL_POSTS, councilCandidates, wards } from '../../engine/diplomacy';
import { canCreateTitle, countyRuler, independentRulers, titleOf } from '../../engine/realm';
import {
  SKILL_KEYS,
  SKILL_LABELS,
  type Character,
  type CouncilPost,
  type GameState,
} from '../../engine/state';
import {
  CharLine,
  CoatOfArms,
  Portrait,
  Skills,
  Tip,
  Segmented,
  usePager,
  TraitChips,
} from '../components/common';
import { AmbitionCard, LegacyTree, RelationsList, StressGauge } from '../components/Progression';
import { perkPoints } from '../../engine/progression';
import { useStore } from '../store';

const COURT_VIEWS = ['souverain', 'famille', 'conseil', 'arbre'] as const;

export function CourtScreen({ game }: { game: GameState }) {
  const [view, setView] = useState<'souverain' | 'famille' | 'conseil' | 'arbre'>('souverain');
  const dir = usePager(COURT_VIEWS, view, setView);
  return (
    <>
      <Segmented
        style={{ marginBottom: 12 }}
        options={[
          { value: 'souverain', label: 'Souverain' },
          { value: 'famille', label: 'Famille' },
          { value: 'conseil', label: 'Conseil' },
          { value: 'arbre', label: 'Maison' },
        ]}
        value={view}
        onChange={setView}
      />
      <div className={`view enter-${dir}`} key={view}>
        {view === 'souverain' && <RulerView game={game} />}
        {view === 'famille' && <FamilyView game={game} />}
        {view === 'conseil' && <CouncilView game={game} />}
        {view === 'arbre' && <TreeView game={game} />}
      </div>
    </>
  );
}

export function CharacterCard({ game, c }: { game: GameState; c: Character }) {
  const dyn = c.dynastyId ? game.dynasties[c.dynastyId] : undefined;
  return (
    <>
      <div className="row">
        <Portrait state={game} c={c} size={84} />
        <div className="grow">
          <h2 style={{ marginBottom: 2 }}>{displayName(game, c)}</h2>
          <div className="muted small">{titleOf(game, c.id) || (c.alive ? 'Courtisan' : '')}</div>
          <div className="small">
            {ageOf(game, c)} ans · santé{' '}
            <b className={healthOf(c) < 35 ? 'bad' : ''}>{healthOf(c)}</b>
            {c.imprisonedBy && <span className="bad"> · prisonnier</span>}
          </div>
        </div>
        {dyn && <CoatOfArms seed={dyn.seed} size={40} />}
      </div>
      <div style={{ marginTop: 10 }}>
        <Skills c={c} />
      </div>
      <div style={{ marginTop: 8 }}>
        <TraitChips c={c} />
      </div>
    </>
  );
}

function RulerView({ game }: { game: GameState }) {
  const dispatch = useStore((s) => s.dispatch);
  const inspect = useStore((s) => s.inspect);
  const p = game.characters[game.playerId];
  const dyn = game.dynasties[game.playerDynastyId];
  const heir = heirsOf(game, p)[0];
  const titles = [...Object.values(game.duchies), ...Object.values(game.kingdoms)]
    .filter((t) => !t.holderId)
    .map((t) => ({ t, chk: canCreateTitle(game, p.id, t.id), kingdom: 'duchies' in t }))
    .filter((x) => x.chk.share > 0)
    .sort((a, b) => b.chk.share - a.chk.share);
  return (
    <>
      <div className="card">
        <div
          className="tappable"
          role="button"
          onClick={() => inspect({ kind: 'perso', id: p.id })}
        >
          <CharacterCard game={game} c={p} />
          <p className="small muted" style={{ margin: '8px 0 0' }}>
            Toucher pour la fiche complète ›
          </p>
        </div>
      </div>
      <AmbitionCard game={game} />
      <div className="card">
        <h3>Esprit et talents</h3>
        <StressGauge c={p} />
        <div className="row small" style={{ marginTop: 10 }}>
          <span className="grow">
            {(p.perks?.length ?? 0) > 0
              ? `${p.perks!.length} talent${p.perks!.length > 1 ? 's' : ''} acquis`
              : 'Aucun talent pour l’instant'}
          </span>
          {perkPoints(p) > 0 && <b className="good">{perkPoints(p)} point(s) à dépenser</b>}
        </div>
        <button
          className={`btn block${perkPoints(p) > 0 ? ' primary' : ''}`}
          style={{ marginTop: 8 }}
          onClick={() => inspect({ kind: 'perso', id: p.id })}
        >
          Arbre de compétences ›
        </button>
        <h3 style={{ marginTop: 14 }}>Relations</h3>
        <RelationsList game={game} c={p} />
      </div>
      <div className="card">
        <h3>Maison {dyn.name}</h3>
        <dl className="kv">
          <dt>Renommée</dt>
          <dd>{Math.round(dyn.renown)}</dd>
          <dt>Héritier</dt>
          <dd>
            {heir ? `${heir.name} (${ageOf(game, heir)} ans)` : <span className="bad">aucun</span>}
          </dd>
          <dt>Loi de succession</dt>
          <dd>{p.successionLaw === 'partage' ? 'Partage' : 'Primogéniture'}</dd>
          <dt>Revendications</dt>
          <dd>
            {p.claims
              .map((id) => game.counties[id]?.name)
              .filter(Boolean)
              .join(', ') || '—'}
          </dd>
        </dl>
        {p.successionLaw === 'partage' && (
          <Tip text="Transmet tous les titres et comtés à l’aîné, sans partage entre les enfants.">
            <button
              className="btn block"
              style={{ marginTop: 8 }}
              disabled={p.prestige < BALANCE.characters.primogenitureCost}
              onClick={() => dispatch({ type: 'changeLaw', law: 'primogeniture' })}
            >
              Adopter la Primogéniture ({BALANCE.characters.primogenitureCost} prestige)
            </button>
          </Tip>
        )}
      </div>
      {titles.length > 0 && (
        <div className="card">
          <h3>Titres à fonder</h3>
          {titles.map(({ t, chk, kingdom }) => (
            <div key={t.id} className="list-item">
              <div className="grow">
                <b>
                  {kingdom ? 'Royaume' : 'Duché'} de {t.name}
                </b>
                <div className="small muted">
                  {chk.ok ? `${chk.prestige} prestige, ${chk.gold} or` : chk.reasons.join(' · ')}
                </div>
              </div>
              <button
                className="btn small primary"
                disabled={!chk.ok}
                onClick={() => dispatch({ type: 'createTitle', titleId: t.id })}
              >
                Fonder
              </button>
            </div>
          ))}
        </div>
      )}
    </>
  );
}

function FamilyView({ game }: { game: GameState }) {
  const dispatch = useStore((s) => s.dispatch);
  const p = game.characters[game.playerId];
  const fam = closeFamily(game, p);
  const kids = wards(game);
  const educators = councilCandidates(game).concat(p);
  return (
    <>
      <div className="card">
        <h3>Famille proche</h3>
        {fam.length === 0 && <p className="muted">Personne.</p>}
        {fam.map((c) => (
          <CharLine
            key={c.id}
            state={game}
            c={c}
            extra={
              <>
                {c.id === p.spouseId
                  ? 'conjoint'
                  : livingChildren(game, p).some((k) => k.id === c.id)
                    ? c.female
                      ? 'fille'
                      : 'fils'
                    : 'famille'}
                {c.spouseId ? ' · marié' : ''}
              </>
            }
          />
        ))}
      </div>
      <div className="card">
        <h3>Éducation</h3>
        <p className="small muted">
          À 16 ans, l’enfant reçoit un trait selon son éducateur et la compétence travaillée.
        </p>
        {kids.length === 0 && <p className="muted">Aucun enfant à éduquer.</p>}
        {kids.map((k) => (
          <div key={k.id} className="list-item" style={{ flexWrap: 'wrap' }}>
            <Portrait state={game} c={k} size={44} />
            <div className="grow">
              <b>{k.name}</b> <span className="muted small">{ageOf(game, k)} ans</span>
            </div>
            <div className="row" style={{ width: '100%' }}>
              <select
                className="select grow"
                value={k.educatorId ?? ''}
                onChange={(e) =>
                  dispatch({
                    type: 'setEducator',
                    childId: k.id,
                    educatorId: e.target.value || undefined,
                    focus: k.educationFocus ?? 'diplomatie',
                  })
                }
              >
                <option value="">— Éducateur —</option>
                {educators
                  .filter((e) => isAdult(game, e))
                  .map((e) => (
                    <option key={e.id} value={e.id}>
                      {e.name} ({SKILL_KEYS.map((s) => skill(e, s)).join('/')})
                    </option>
                  ))}
              </select>
              <select
                className="select"
                value={k.educationFocus ?? 'diplomatie'}
                onChange={(e) =>
                  dispatch({
                    type: 'setEducator',
                    childId: k.id,
                    educatorId: k.educatorId,
                    focus: e.target.value as (typeof SKILL_KEYS)[number],
                  })
                }
              >
                {SKILL_KEYS.map((s) => (
                  <option key={s} value={s}>
                    {SKILL_LABELS[s]}
                  </option>
                ))}
              </select>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

function CouncilView({ game }: { game: GameState }) {
  const dispatch = useStore((s) => s.dispatch);
  const inspect = useStore((s) => s.inspect);
  const cands = councilCandidates(game);
  const rivals = independentRulers(game).filter((r) => r !== game.playerId);
  const mine = Object.values(game.counties).filter((c) => countyRuler(game, c) === game.playerId);
  const foreign = Object.values(game.counties).filter(
    (c) =>
      countyRuler(game, c) !== game.playerId &&
      c.adjacent.some((n) => countyRuler(game, game.counties[n]) === game.playerId),
  );
  const kids = wards(game);
  const set = (
    post: CouncilPost,
    patch: { holderId?: string; task?: string; targetId?: string },
  ) => {
    const seat = game.council[post];
    const task = patch.task ?? seat.task;
    dispatch({
      type: 'setCouncil',
      post,
      holderId: 'holderId' in patch ? patch.holderId : seat.holderId,
      task,
      targetId: 'targetId' in patch ? patch.targetId : patch.task ? undefined : seat.targetId,
    });
  };
  return (
    <>
      {COUNCIL_POSTS.map((post) => {
        const info = COUNCIL_INFO[post];
        const seat = game.council[post];
        const h = seat.holderId ? game.characters[seat.holderId] : undefined;
        const task = info.tasks.find((t) => t.id === seat.task) ?? info.tasks[0];
        return (
          <div key={post} className="card">
            <div className="row">
              {h ? (
                <span className="tappable" onClick={() => inspect({ kind: 'perso', id: h.id })}>
                  <Portrait state={game} c={h} size={48} />
                </span>
              ) : (
                <div style={{ width: 48 }} />
              )}
              <div className="grow">
                <h3 style={{ margin: 0 }}>{info.label}</h3>
                <div className="small muted">
                  {SKILL_LABELS[info.skill]} {h ? <b>{skill(h, info.skill)}</b> : '—'}
                </div>
              </div>
            </div>
            <div className="col" style={{ marginTop: 8 }}>
              <select
                className="select"
                value={seat.holderId ?? ''}
                onChange={(e) => set(post, { holderId: e.target.value || undefined })}
              >
                <option value="">— Vacant —</option>
                {cands
                  .sort((a, b) => skill(b, info.skill) - skill(a, info.skill))
                  .map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} ({SKILL_LABELS[info.skill]} {skill(c, info.skill)})
                    </option>
                  ))}
              </select>
              <Segmented
                options={info.tasks.map((t) => ({ value: t.id, label: t.label }))}
                value={task.id}
                onChange={(id) => set(post, { task: id })}
              />
              {task.target && (
                <select
                  className="select"
                  value={seat.targetId ?? ''}
                  onChange={(e) => set(post, { targetId: e.target.value || undefined })}
                >
                  <option value="">— Cible —</option>
                  {task.target === 'cour' &&
                    rivals.map((r) => (
                      <option key={r} value={r}>
                        {displayName(game, game.characters[r])}
                      </option>
                    ))}
                  {task.target === 'comte' &&
                    mine.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name} (dév. {c.development})
                      </option>
                    ))}
                  {task.target === 'comte_etranger' &&
                    foreign.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  {task.target === 'heritier' &&
                    kids.map((k) => (
                      <option key={k.id} value={k.id}>
                        {k.name}
                      </option>
                    ))}
                </select>
              )}
            </div>
          </div>
        );
      })}
    </>
  );
}

function TreeView({ game }: { game: GameState }) {
  const dyn = game.dynasties[game.playerDynastyId];
  const founder = game.characters[dyn.founderId] ?? game.characters[game.playerId];
  const render = (c: Character, depth: number): JSX.Element => {
    const kids = c.childrenIds
      .map((id) => game.characters[id])
      .filter((k) => k && k.dynastyId === game.playerDynastyId);
    const spouse = c.spouseId ? game.characters[c.spouseId] : undefined;
    return (
      <li key={c.id}>
        <div className="row">
          <Portrait state={game} c={c} size={32} />
          <span
            className={c.id === game.playerId ? 'gold' : ''}
            style={{ fontWeight: c.id === game.playerId ? 700 : 500 }}
          >
            {c.name}
          </span>
          <span className="small muted">
            {c.alive ? `${ageOf(game, c)} ans` : `† ${ageOf(game, c)}`}
            {spouse ? ` · ⚭ ${spouse.name}` : ''}
          </span>
        </div>
        {kids.length > 0 && depth < 12 && <ul>{kids.map((k) => render(k, depth + 1))}</ul>}
      </li>
    );
  };
  return (
    <>
      <div className="card">
        <h3>Héritages de la maison</h3>
        <LegacyTree game={game} />
      </div>
      <div className="card tree">
        <h3>Arbre de la maison {dyn.name}</h3>
        <ul style={{ borderLeft: 0, paddingLeft: 0 }}>{render(founder, 0)}</ul>
      </div>
    </>
  );
}
