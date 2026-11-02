import { useState } from 'react';
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
import {
  bestSkillKey,
  COUNCIL_INFO,
  COUNCIL_POSTS,
  councilCandidates,
  educatorCandidates,
  wards,
} from '../../engine/diplomacy';
import { countyRuler, independentRulers, titleOf } from '../../engine/realm';
import {
  SKILL_KEYS,
  SKILL_LABELS,
  type Character,
  type CouncilPost,
  type GameState,
} from '../../engine/state';
import {
  CardTitle,
  CharLine,
  ChoiceGrid,
  CoatOfArms,
  Portrait,
  Sheet,
  Skills,
  Segmented,
  usePager,
  useFocusView,
  TraitChips,
} from '../components/common';
import { AmbitionCard, LegacyTree, RelationsList, StressGauge } from '../components/Progression';
import { perkPoints } from '../../engine/progression';
import { CandidatesCard, CourtCard, WardsCard } from '../components/Entourage';
import { useStore } from '../store';
import { FirstVisitTip } from '../components/FirstVisit';
import { GOVERNMENTS, SUCCESSION_LAWS } from '../../data/governments';
import { governmentOf } from '../../engine/government';
import { houseColorOf } from '../../engine/heraldry';
import { DECISIONS } from '../../data/decisions';
import { decisionCheck } from '../../engine/decisions';
import { MarriageSheet, marriageableKin } from '../components/Marriage';
import { PrisonersCard } from '../components/Prisoners';

const COURT_VIEWS = ['souverain', 'maison', 'conseil', 'courtisans'] as const;
type CourtView = (typeof COURT_VIEWS)[number];

export function CourtScreen({ game }: { game: GameState }) {
  const [view, setView] = useState<CourtView>('souverain');
  const dir = usePager(COURT_VIEWS, view, setView);
  useFocusView(COURT_VIEWS, setView);
  const p = game.characters[game.playerId];
  const vacant = COUNCIL_POSTS.some((x) => !game.council[x].holderId);
  return (
    <>
      <Segmented
        className="subnav"
        options={[
          { value: 'souverain', label: <Pip on={perkPoints(p) > 0}>Souverain</Pip> },
          { value: 'maison', label: 'Maison' },
          { value: 'conseil', label: <Pip on={vacant}>Conseil</Pip> },
          { value: 'courtisans', label: 'Courtisans' },
        ]}
        value={view}
        onChange={setView}
      />
      <div className={`view enter-${dir}`} key={view}>
        <FirstVisitTip id={`cour/${view}`} />
        {view === 'souverain' && <RulerView game={game} />}
        {view === 'maison' && <HouseView game={game} />}
        {view === 'conseil' && <CouncilView game={game} />}
        {view === 'courtisans' && <CourtiersView game={game} />}
      </div>
    </>
  );
}

/** Libellé de sous-onglet avec un point quand quelque chose attend. */
export function Pip({ on, children }: { on: boolean; children: React.ReactNode }) {
  return (
    <span className="pip-label">
      {children}
      {on && <span className="pip" aria-label="(à voir)" />}
    </span>
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
        {dyn && <CoatOfArms seed={dyn.seed} color={houseColorOf(dyn)} size={40} />}
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
  const inspect = useStore((s) => s.inspect);
  const p = game.characters[game.playerId];
  const pts = perkPoints(p);
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
        <CardTitle>Talents et esprit</CardTitle>
        <StressGauge c={p} />
        <div className="row small" style={{ marginTop: 10 }}>
          <span className="grow">
            {(p.perks?.length ?? 0) > 0
              ? `${p.perks!.length} talent${p.perks!.length > 1 ? 's' : ''} acquis`
              : 'Aucun talent pour l’instant'}
          </span>
          {pts > 0 && (
            <b className="good">
              {pts} point{pts > 1 ? 's' : ''} à dépenser
            </b>
          )}
        </div>
        <button
          className={`btn block${pts > 0 ? ' primary' : ''}`}
          style={{ marginTop: 8 }}
          onClick={() => inspect({ kind: 'perso', id: p.id, tab: 'talents' })}
        >
          Arbre de talents ›
        </button>
      </div>
      <SovereignActions game={game} />
      <div className="card">
        <CardTitle>Relations</CardTitle>
        <RelationsList game={game} c={p} />
      </div>
    </>
  );
}

/** Décisions personnelles du souverain : tournoi, chasse, festin, pèlerinage… */
function SovereignActions({ game }: { game: GameState }) {
  const dispatch = useStore((s) => s.dispatch);
  return (
    <div className="card">
      <CardTitle help="Agissez au lieu d’attendre : chaque action ouvre un événement, puis revient après un délai.">
        Actions du souverain
      </CardTitle>
      {DECISIONS.map((d) => {
        const chk = decisionCheck(game, d.id);
        const cost = [
          d.cost.or ? `${d.cost.or} or` : '',
          d.cost.prestige ? `${d.cost.prestige} prestige` : '',
          d.cost.piete ? `${d.cost.piete} piété` : '',
        ]
          .filter(Boolean)
          .join(', ');
        return (
          <div key={d.id} className="list-item decision">
            <span className="dec-icon">{d.icon}</span>
            <div className="grow">
              <b>{d.name}</b>
              <div className="small">{d.description}</div>
              <div className="small muted">
                {cost} · tous les {d.cooldownYears} an{d.cooldownYears > 1 ? 's' : ''}
                {!chk.ok && chk.reason && <span className="bad"> · {chk.reason}</span>}
              </div>
            </div>
            <button
              className="btn small primary"
              disabled={!chk.ok}
              onClick={() => dispatch({ type: 'takeDecision', id: d.id })}
            >
              Agir
            </button>
          </div>
        );
      })}
    </div>
  );
}

/** La maison : succession en bref, famille, mariages, enfants, héritages, arbre. */
function HouseView({ game }: { game: GameState }) {
  const goTo = useStore((s) => s.goTo);
  const [legacies, setLegacies] = useState(false);
  const p = game.characters[game.playerId];
  const dyn = game.dynasties[game.playerDynastyId];
  const heir = heirsOf(game, p)[0];
  return (
    <>
      <div className="card">
        <CardTitle>Maison {dyn.name}</CardTitle>
        <dl className="kv">
          <dt>Héritier</dt>
          <dd>
            {heir ? `${heir.name} (${ageOf(game, heir)} ans)` : <span className="bad">aucun</span>}
          </dd>
          <dt>Loi de succession</dt>
          <dd>
            {SUCCESSION_LAWS[p.successionLaw].name}
            {p.agnatic ? ', agnatique' : ''}
          </dd>
          <dt>Gouvernement</dt>
          <dd>{GOVERNMENTS[governmentOf(game, p.id)].name}</dd>
          <dt>Renommée</dt>
          <dd>{Math.round(dyn.renown)}</dd>
          <dt>Revendications</dt>
          <dd>
            {p.claims
              .map((id) => game.counties[id]?.name)
              .filter(Boolean)
              .join(', ') || '—'}
          </dd>
        </dl>
        <button
          className="btn block"
          style={{ marginTop: 8 }}
          onClick={() => goTo('royaume', 'lois')}
        >
          Lois et ligne de succession ›
        </button>
      </div>
      <FamilyView game={game} />
      <WardsCard game={game} />
      <div className="card">
        <CardTitle help="Achetés avec la renommée de la maison, ils lui restent acquis jusqu’à la fin de la partie.">
          Héritages de la maison
        </CardTitle>
        <div className="row small">
          <span className="grow muted">Renommée disponible</span>
          <b>{Math.round(dyn.renown)}</b>
        </div>
        <button className="btn block" style={{ marginTop: 8 }} onClick={() => setLegacies(true)}>
          Arbre des héritages ›
        </button>
      </div>
      <TreeView game={game} />
      {legacies && (
        <Sheet onClose={() => setLegacies(false)}>
          <h2>Héritages de la maison</h2>
          <LegacyTree game={game} />
        </Sheet>
      )}
    </>
  );
}

/** Cour, candidats de passage et prisonniers : les gens qui vivent chez vous. */
function CourtiersView({ game }: { game: GameState }) {
  return (
    <>
      <CourtCard game={game} />
      <CandidatesCard game={game} />
      <PrisonersCard game={game} />
    </>
  );
}

function FamilyView({ game }: { game: GameState }) {
  const dispatch = useStore((s) => s.dispatch);
  const [marry, setMarry] = useState<{ who?: string } | null>(null);
  const p = game.characters[game.playerId];
  const fam = closeFamily(game, p);
  const kids = wards(game);
  const educators = educatorCandidates(game);
  const singles = new Set(marriageableKin(game).map((c) => c.id));
  return (
    <>
      <div className="card">
        <CardTitle extra={fam.length ? String(fam.length) : undefined}>Famille proche</CardTitle>
        {fam.length === 0 && <p className="muted">Personne.</p>}
        {fam.map((c) => (
          <div key={c.id} className="court-row">
            <CharLine
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
            {singles.has(c.id) && (
              <button className="btn small" onClick={() => setMarry({ who: c.id })}>
                Marier
              </button>
            )}
          </div>
        ))}
        <button className="btn block primary" style={{ marginTop: 8 }} onClick={() => setMarry({})}>
          Arranger un mariage
        </button>
      </div>
      {marry && <MarriageSheet game={game} whoId={marry.who} onClose={() => setMarry(null)} />}
      <div className="card" id="focus-education">
        <CardTitle help="À 16 ans, l’enfant reçoit un trait selon son éducateur et la compétence travaillée. En mode automatique, il travaille sa plus haute compétence avec l’éducateur le plus compétent de la cour.">
          Éducation des enfants
        </CardTitle>
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
                value={k.educationManual ? (k.educatorId ?? 'none') : 'auto'}
                onChange={(e) =>
                  dispatch(
                    e.target.value === 'auto'
                      ? {
                          type: 'setEducator',
                          childId: k.id,
                          focus: 'diplomatie',
                          auto: true,
                        }
                      : {
                          type: 'setEducator',
                          childId: k.id,
                          educatorId: e.target.value === 'none' ? undefined : e.target.value,
                          focus: k.educationFocus ?? bestSkillKey(k),
                        },
                  )
                }
              >
                <option value="auto">Automatique</option>
                <option value="none">Aucun éducateur</option>
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
                value={k.educationFocus ?? bestSkillKey(k)}
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
            {k.educatorId && game.characters[k.educatorId] && (
              <div className="small muted" style={{ width: '100%', marginTop: 4 }}>
                Éducateur : <b>{game.characters[k.educatorId].name}</b> (
                {SKILL_LABELS[k.educationFocus ?? bestSkillKey(k)].toLowerCase()}{' '}
                {skill(game.characters[k.educatorId], k.educationFocus ?? bestSkillKey(k))})
                {k.educationManual ? '' : ' · choisi automatiquement'}
              </div>
            )}
          </div>
        ))}
      </div>
    </>
  );
}

/** Conseil : une ligne par poste ; toucher un poste ouvre sa fenêtre de réglage. */
function CouncilView({ game }: { game: GameState }) {
  const goTo = useStore((s) => s.goTo);
  const inspect = useStore((s) => s.inspect);
  const [open, setOpen] = useState<CouncilPost | null>(null);
  const vacant = COUNCIL_POSTS.filter((p) => !game.council[p].holderId);
  return (
    <>
      {vacant.length > 0 && (
        <div className="card" id="focus-conseil">
          <b>
            {vacant.length === 1 ? 'Un poste est vacant' : `${vacant.length} postes sont vacants`}
          </b>
          <p className="small muted" style={{ margin: '4px 0 8px' }}>
            Personne à votre cour n’a les compétences requises ? Des candidats de passage se
            présentent chaque printemps.
          </p>
          <button
            className="btn small primary"
            onClick={() => goTo('cour', 'courtisans', 'focus-candidats')}
          >
            Voir les candidats
          </button>
        </div>
      )}
      <div className="card">
        {COUNCIL_POSTS.map((post) => {
          const info = COUNCIL_INFO[post];
          const seat = game.council[post];
          const h = seat.holderId ? game.characters[seat.holderId] : undefined;
          const task = info.tasks.find((t) => t.id === seat.task) ?? info.tasks[0];
          const target = seat.targetId
            ? (game.characters[seat.targetId]?.name ?? game.counties[seat.targetId]?.name)
            : undefined;
          return (
            <div key={post} className="council-row">
              {h ? (
                <button
                  className="plain"
                  aria-label={`Fiche de ${h.name}`}
                  onClick={() => inspect({ kind: 'perso', id: h.id })}
                >
                  <Portrait state={game} c={h} size={44} />
                </button>
              ) : (
                <span className="council-empty" aria-hidden>
                  ?
                </span>
              )}
              <button className="council-main plain" onClick={() => setOpen(post)}>
                <span className="grow">
                  <b>{info.label}</b>
                  <span className="small muted">
                    {h ? (
                      <>
                        {h.name} · {SKILL_LABELS[info.skill]} {skill(h, info.skill)}
                      </>
                    ) : (
                      <span className="bad">Vacant</span>
                    )}
                  </span>
                  <span className="tiny">
                    {task.label}
                    {target ? ` · ${target}` : ''}
                  </span>
                </span>
                <span className="chev">›</span>
              </button>
            </div>
          );
        })}
      </div>
      <p className="small muted" style={{ padding: '0 4px' }}>
        Touchez un poste pour changer de titulaire, de tâche ou de cible.
      </p>
      {open && <CouncilSeatSheet game={game} post={open} onClose={() => setOpen(null)} />}
    </>
  );
}

function CouncilSeatSheet({
  game,
  post,
  onClose,
}: {
  game: GameState;
  post: CouncilPost;
  onClose: () => void;
}) {
  const dispatch = useStore((s) => s.dispatch);
  const goTo = useStore((s) => s.goTo);
  const cands = councilCandidates(game);
  const rivals = independentRulers(game).filter((r) => r !== game.playerId);
  const mine = Object.values(game.counties).filter((c) => countyRuler(game, c) === game.playerId);
  const foreign = Object.values(game.counties).filter(
    (c) =>
      countyRuler(game, c) !== game.playerId &&
      c.adjacent.some((n) => countyRuler(game, game.counties[n]) === game.playerId),
  );
  const kids = wards(game);
  const info = COUNCIL_INFO[post];
  const seat = game.council[post];
  const h = seat.holderId ? game.characters[seat.holderId] : undefined;
  const task = info.tasks.find((t) => t.id === seat.task) ?? info.tasks[0];
  const set = (patch: { holderId?: string; task?: string; targetId?: string }) => {
    const t = patch.task ?? seat.task;
    dispatch({
      type: 'setCouncil',
      post,
      holderId: 'holderId' in patch ? patch.holderId : seat.holderId,
      task: t,
      targetId: 'targetId' in patch ? patch.targetId : patch.task ? undefined : seat.targetId,
    });
  };
  return (
    <Sheet onClose={onClose}>
      <div className="row">
        {h && <Portrait state={game} c={h} size={56} />}
        <div className="grow">
          <h2 style={{ margin: 0 }}>{info.label}</h2>
          <div className="small muted">
            {SKILL_LABELS[info.skill]} {h ? <b>{skill(h, info.skill)}</b> : '— poste vacant'}
          </div>
        </div>
      </div>
      <h3 className="settings-title">Titulaire</h3>
      <select
        className="select"
        style={{ width: '100%' }}
        value={seat.holderId ?? ''}
        onChange={(e) => set({ holderId: e.target.value || undefined })}
      >
        <option value="">— Vacant —</option>
        {[...cands]
          .sort((a, b) => skill(b, info.skill) - skill(a, info.skill))
          .map((c) => (
            <option key={c.id} value={c.id}>
              {c.name} ({SKILL_LABELS[info.skill]} {skill(c, info.skill)})
            </option>
          ))}
      </select>
      {!h && (
        <button
          className="btn block ghost"
          style={{ marginTop: 8 }}
          onClick={() => {
            onClose();
            goTo('cour', 'courtisans', 'focus-candidats');
          }}
        >
          Voir les candidats de passage ›
        </button>
      )}
      <h3 className="settings-title">Tâche</h3>
      <ChoiceGrid
        options={info.tasks.map((t) => ({ value: t.id, label: t.label }))}
        value={task.id}
        onChange={(id) => set({ task: id })}
      />
      {task.target && (
        <>
          <h3 className="settings-title">Cible</h3>
          <select
            className="select"
            style={{ width: '100%' }}
            value={seat.targetId ?? ''}
            onChange={(e) => set({ targetId: e.target.value || undefined })}
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
        </>
      )}
      <button className="btn block primary" style={{ marginTop: 16 }} onClick={onClose}>
        Fermer
      </button>
    </Sheet>
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
      <div className="card tree">
        <h3>Arbre de la maison {dyn.name}</h3>
        <ul style={{ borderLeft: 0, paddingLeft: 0 }}>{render(founder, 0)}</ul>
      </div>
    </>
  );
}
