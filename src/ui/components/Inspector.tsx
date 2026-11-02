/** Fiches détaillées : personnage, comté, armée. Navigation en pile avec « Retour ». */
import { useState } from 'react';
import { BALANCE } from '../../data/balance';
import { BUILDINGS, BUILDING_TYPES } from '../../data/buildings';
import { TERRAINS, RIVER } from '../../data/terrain';
import { TRAITS } from '../../data/traits';
import { UNIT_TYPES, UNITS } from '../../data/units';
import {
  ageOf,
  allied,
  atWar,
  displayName,
  healthOf,
  heldCounties,
  isAdult,
  livingChildren,
  opinionOf,
  parentsOf,
  siblingsOf,
  skill,
  topLiege,
} from '../../engine/characters';
import { titlesOf } from '../../engine/characters/lifecycle';
import { COUNCIL_INFO, COUNCIL_POSTS, councilCandidates } from '../../engine/diplomacy';
import {
  buildingLevel,
  canBuild,
  countyIncome,
  countyMaxLevies,
  countyRuler,
  economyOf,
  fortLevel,
  hasRoad,
  incomeMultiplier,
  realmCounties,
  realmName,
  titleOf,
  vassalContribution,
} from '../../engine/realm';
import { SKILL_KEYS, SKILL_LABELS, type GameState, type PlotType } from '../../engine/state';
import { canStartPlot, PLOT_INFO, plotOdds } from '../../engine/intrigue';
import { armyUpkeep, totalMen } from '../../engine/units';
import { armyOf, findPath, militaryStrength, truceWith } from '../../engine/war';
import { useStore } from '../store';
import { houseColorOf } from '../../engine/heraldry';
import {
  Bar,
  CharLine,
  CharLink,
  CoatOfArms,
  CountyLink,
  Portrait,
  Segmented,
  Sheet,
  signed,
} from './common';
import { realmColor, visibleMen } from './MapView';
import { PerkTree, RecordLine, RelationsList, StressGauge } from './Progression';
import { CountyEconomy } from './Economy';
import { CourtActions, courtActionKinds } from './Entourage';
import { countyDevMax, countyLevyMult, countySlots, isCapital } from '../../engine/economy/local';
import { CapitalSection } from './Capital';
import { claimInfo } from '../../engine/crowns';
import { countyValue } from '../../engine/diplomacy/trade';
import { PERKS } from '../../data/perks';

export function Inspector({ game }: { game: GameState }) {
  const stack = useStore((s) => s.inspectStack);
  const back = useStore((s) => s.inspectBack);
  const close = useStore((s) => s.inspectClose);
  const top = stack[stack.length - 1];
  if (!top) return null;
  const valid =
    (top.kind === 'perso' && game.characters[top.id]) ||
    (top.kind === 'comte' && game.counties[top.id]) ||
    (top.kind === 'armee' && game.armies[top.id]);
  return (
    <Sheet onClose={close} swapKey={`${top.kind}:${top.id}:${stack.length}`}>
      <div className="inspector-nav">
        {stack.length > 1 ? (
          <button className="link back" onClick={back}>
            ‹ Retour
          </button>
        ) : (
          <span />
        )}
        <span className="muted small">
          {top.kind === 'perso' ? 'Personnage' : top.kind === 'comte' ? 'Comté' : 'Armée'}
        </span>
      </div>
      {!valid && <p className="muted">Cet élément n’existe plus.</p>}
      {valid && top.kind === 'perso' && (
        <CharacterDetail key={`${top.id}:${top.tab ?? ''}`} game={game} id={top.id} tab={top.tab} />
      )}
      {valid && top.kind === 'comte' && (
        <CountyDetail key={`${top.id}:${top.tab ?? ''}`} game={game} id={top.id} tab={top.tab} />
      )}
      {valid && top.kind === 'armee' && <ArmyDetail game={game} id={top.id} />}
    </Sheet>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="ins-section">
      <h3>{title}</h3>
      {children}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Personnage
// ---------------------------------------------------------------------------

type CharTab = 'apercu' | 'talents' | 'famille' | 'terres';

function CharacterDetail({
  game,
  id,
  tab: initial,
}: {
  game: GameState;
  id: string;
  tab?: string;
}) {
  const [tab, setTab] = useState<CharTab>(
    ['apercu', 'talents', 'famille', 'terres'].includes(initial ?? '')
      ? (initial as CharTab)
      : 'apercu',
  );
  const setRealmSheet = useStore((s) => s.setRealmSheet);
  const inspectClose = useStore((s) => s.inspectClose);
  const c = game.characters[id];
  const pl = game.playerId;
  const dyn = c.dynastyId ? game.dynasties[c.dynastyId] : undefined;
  const age = ageOf(game, c);
  const health = healthOf(c);
  const title = titleOf(game, id);
  const liege = c.liegeId ? game.characters[c.liegeId] : undefined;
  const court =
    !heldCounties(game, id).length && c.courtId !== id ? game.characters[c.courtId] : undefined;
  const independent = !c.liegeId && heldCounties(game, id).length > 0;
  const op = id !== pl && c.alive ? opinionOf(game, id, pl) : undefined;
  const parents = parentsOf(game, c);
  const spouse = c.spouseId ? game.characters[c.spouseId] : undefined;
  const kids = c.childrenIds.map((k) => game.characters[k]).filter(Boolean);
  const siblings = siblingsOf(game, c);
  const counties = heldCounties(game, id).map((k) => game.counties[k]);
  const titles = titlesOf(game, id);
  const seat = COUNCIL_POSTS.find((p) => game.council[p].holderId === id);
  const top = topLiege(game, id);
  const relation =
    id === pl || top === pl
      ? undefined
      : atWar(game, pl, top)
        ? { t: 'En guerre contre vous', cls: 'bad' }
        : allied(game, pl, top)
          ? { t: 'Allié', cls: 'good' }
          : truceWith(game, pl, top)
            ? { t: 'Trêve', cls: '' }
            : undefined;
  const status: string[] = [];
  if (!c.alive) status.push(`Mort ${c.deathCause ?? ''}`.trim());
  if (id === pl) status.push('Vous');
  if (independent) status.push('Souverain');
  if (liege) status.push(`Vassal de ${liege.name}`);
  if (court) status.push(`À la cour de ${court.name}`);
  if (c.imprisonedBy) status.push(`Prisonnier de ${game.characters[c.imprisonedBy]?.name ?? '—'}`);
  if (c.inFaction) status.push('Membre d’une faction');
  if (c.hostageOf) status.push(`Otage de ${game.characters[c.hostageOf]?.name ?? '—'}`);
  if (seat) status.push(COUNCIL_INFO[seat].label);
  const eco = independent || liege ? economyOf(game, id) : undefined;
  const hasLands =
    independent || counties.length > 0 || c.claims.length > 0 || (!!eco && id === pl);

  return (
    <>
      <div className="ins-hero">
        <Portrait state={game} c={c} size={104} />
        <div className="grow">
          <h2 style={{ marginBottom: 2 }}>{displayName(game, c)}</h2>
          {title && <div className="muted small">{title}</div>}
          <div className="small" style={{ marginTop: 4 }}>
            {c.alive ? `${age} ans` : `† à ${age} ans`} · {c.female ? 'femme' : 'homme'}
          </div>
          <div className="row wrap" style={{ gap: 4, marginTop: 6 }}>
            {status.map((st) => (
              <span key={st} className="chip">
                {st}
              </span>
            ))}
            {relation && <span className={`chip ${relation.cls}`}>{relation.t}</span>}
          </div>
        </div>
        {dyn && <CoatOfArms seed={dyn.seed} color={houseColorOf(dyn)} size={44} />}
      </div>

      {c.alive && independent && (
        <button
          className="btn block ghost"
          style={{ marginTop: 10 }}
          onClick={() => {
            inspectClose();
            setRealmSheet(id);
          }}
        >
          Fiche du royaume : succession{id !== pl ? ' et influence' : ''} ›
        </button>
      )}

      <Segmented<CharTab>
        style={{ margin: '12px 0 4px' }}
        options={[
          { value: 'apercu', label: 'Aperçu' },
          { value: 'talents', label: 'Talents' },
          { value: 'famille', label: 'Famille' },
          ...(hasLands ? [{ value: 'terres' as const, label: 'Terres' }] : []),
        ]}
        value={tab}
        onChange={setTab}
      />

      {tab === 'apercu' && c.alive && (
        <div className="row small" style={{ margin: '10px 0 2px' }}>
          <span className="muted">Santé</span>
          <b className={health < 35 ? 'bad' : health > 70 ? 'good' : ''}>
            {health} — {health < 35 ? 'fragile' : health < 60 ? 'correcte' : 'bonne'}
          </b>
        </div>
      )}
      {tab === 'apercu' && c.alive && (
        <Bar value={health} max={100} color={health < 35 ? 'var(--bad)' : 'var(--good)'} />
      )}

      {tab === 'apercu' && (
        <Section title="Compétences">
          <div className="skills">
            {SKILL_KEYS.map((k) => (
              <div key={k}>
                <b>{skill(c, k)}</b>
                <span>{SKILL_LABELS[k]}</span>
              </div>
            ))}
          </div>
        </Section>
      )}

      {tab === 'talents' && c.alive && c.dynastyId === game.playerDynastyId && isAdult(game, c) && (
        <Section title="Arbre de talents">
          <PerkTree game={game} c={c} />
        </Section>
      )}
      {tab === 'talents' &&
        c.alive &&
        c.dynastyId !== game.playerDynastyId &&
        (c.perks?.length ?? 0) > 0 && (
          <Section title="Talents">
            <p className="small">{(c.perks ?? []).map((x) => PERKS[x]?.name).join(' · ')}</p>
          </Section>
        )}
      {tab === 'talents' && c.alive && (c.stress ?? 0) > 0 && (
        <Section title="Esprit">
          <StressGauge c={c} />
        </Section>
      )}
      {tab === 'talents' && (
        <Section title="Relations et faits d’armes">
          <RelationsList game={game} c={c} />
          <RecordLine c={c} />
        </Section>
      )}

      {tab === 'apercu' && (
        <Section title="Traits">
          {c.traits.length === 0 && <p className="muted small">Aucun trait marquant.</p>}
          <div className="trait-list">
            {c.traits.map((t) => {
              const d = TRAITS[t];
              if (!d) return null;
              const mods = Object.entries(d.skills ?? {}).map(
                ([k, v]) =>
                  `${SKILL_LABELS[k as keyof typeof SKILL_LABELS]} ${signed(v as number)}`,
              );
              if (d.health) mods.push(`Santé ${signed(d.health)}`);
              if (d.vassalOpinion) mods.push(`Vassaux ${signed(d.vassalOpinion)}`);
              const cat = {
                personnalite: 'Personnalité',
                education: 'Éducation',
                hereditaire: 'Héréditaire',
                acquis: 'Acquis',
              }[d.category];
              return (
                <div key={t} className={`trait-row cat-${d.category}`}>
                  <div className="row">
                    <b>{d.name}</b>
                    <span className="muted small right">{cat}</span>
                  </div>
                  <div className="small">{d.description}</div>
                  {mods.length > 0 && <div className="small muted">{mods.join(' · ')}</div>}
                </div>
              );
            })}
          </div>
        </Section>
      )}

      {tab === 'apercu' && c.alive && id !== pl && c.dynastyId !== game.playerDynastyId && (
        <CourtActionsSection game={game} c={c} />
      )}

      {tab === 'apercu' && c.alive && id !== pl && c.dynastyId !== game.playerDynastyId && (
        <Section title="Comploter">
          <PlotActions game={game} id={id} />
        </Section>
      )}

      {tab === 'apercu' && op && (
        <Section title={`Opinion envers vous : ${signed(op.total)}`}>
          <div className="reasons">
            {op.reasons.map((r, i) => (
              <div key={i} className="row small">
                <span className="grow">{r.label}</span>
                <b className={r.value >= 0 ? 'good' : 'bad'}>{signed(r.value)}</b>
              </div>
            ))}
            {op.reasons.length === 0 && <p className="muted small">Indifférent.</p>}
          </div>
          {liege?.id === pl && (
            <p className="small muted">
              Contribution aux impôts et levées : {Math.round(vassalContribution(op.total) * 100)} %
              {op.total < BALANCE.opinion.factionThreshold ? ' — risque de faction' : ''}.
            </p>
          )}
        </Section>
      )}

      {tab === 'terres' && (independent || counties.length > 0) && (
        <Section title="Terres et titres">
          {titles.map((t) => (
            <div key={t} className="small">
              {game.kingdoms[t]
                ? `Royaume de ${game.kingdoms[t].name}`
                : `Duché de ${game.duchies[t].name}`}
            </div>
          ))}
          <div className="row wrap" style={{ gap: 4, marginTop: 4 }}>
            {counties.map((k) => (
              <CountyLink key={k.id} state={game} id={k.id} />
            ))}
          </div>
          {independent && (
            <p className="small muted">
              {realmName(game, id)} : {realmCounties(game, id).length} comtés · force militaire ≈{' '}
              {Math.round(militaryStrength(game, id))}
            </p>
          )}
        </Section>
      )}

      {tab === 'terres' && eco && (id === pl || independent) && (
        <Section title="Trésor">
          <dl className="kv">
            <dt>Or</dt>
            <dd>
              {Math.round(c.gold)} ({signed(eco.goldNet)}/saison)
            </dd>
            <dt>Prestige</dt>
            <dd>{Math.round(c.prestige)}</dd>
            <dt>Piété</dt>
            <dd>{Math.round(c.piety)}</dd>
          </dl>
        </Section>
      )}

      {tab === 'terres' && c.claims.length > 0 && (
        <Section title="Revendications">
          <div className="row wrap" style={{ gap: 4 }}>
            {c.claims.map((k) => (
              <CountyLink key={k} state={game} id={k} />
            ))}
          </div>
        </Section>
      )}

      {tab === 'famille' && (c.houseClaims?.length ?? 0) > 0 && c.alive && (
        <Section title="Droits par le sang">
          {c.houseClaims!.map((h) => {
            const info = claimInfo(game, c.id, h);
            return (
              <p key={h} className="small" style={{ margin: '2px 0' }}>
                Maison {game.dynasties[h]?.name ?? '—'}
                {info ? (
                  <>
                    {' '}
                    — <CharLink state={game} id={info.rulerId} /> ·{' '}
                    <span className={info.strong ? 'good' : 'muted'}>
                      droit {info.strong ? 'fort' : 'faible'}
                    </span>
                  </>
                ) : (
                  <span className="muted"> — ne règne plus</span>
                )}
              </p>
            );
          })}
          {c.renounced && <p className="tiny muted">A renoncé aux droits de sa descendance.</p>}
        </Section>
      )}

      {tab === 'famille' && age < BALANCE.characters.adulthood && c.alive && (
        <Section title="Éducation">
          <p className="small">
            {c.educatorId ? (
              <>
                Éduqué par <CharLink state={game} id={c.educatorId} />, compétence travaillée :{' '}
                {SKILL_LABELS[c.educationFocus ?? 'diplomatie']}.
              </>
            ) : (
              'Aucun éducateur.'
            )}{' '}
            Majorité dans {BALANCE.characters.adulthood - age} an(s).
          </p>
        </Section>
      )}

      {tab === 'famille' && (
        <Section title="Famille">
          {parents.map((p) => (
            <CharLine key={p.id} state={game} c={p} extra={p.female ? 'mère' : 'père'} />
          ))}
          {spouse && <CharLine state={game} c={spouse} extra={c.female ? 'époux' : 'épouse'} />}
          {kids.map((k) => (
            <CharLine key={k.id} state={game} c={k} extra={k.female ? 'fille' : 'fils'} />
          ))}
          {siblings.slice(0, 6).map((k) => (
            <CharLine key={k.id} state={game} c={k} extra={k.female ? 'sœur' : 'frère'} />
          ))}
          {!parents.length && !spouse && !kids.length && !siblings.length && (
            <p className="muted small">Aucune famille connue.</p>
          )}
          {c.alive && !spouse && age >= 16 && <p className="small muted">Célibataire.</p>}
          {c.alive && livingChildren(game, c).length === 0 && kids.length > 0 && (
            <p className="small muted">Aucun enfant vivant.</p>
          )}
        </Section>
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// Comté
// ---------------------------------------------------------------------------

function terrainEffects(t: keyof typeof TERRAINS): string[] {
  const d = TERRAINS[t];
  const fx: string[] = [];
  const fmt = (v: number) => `×${v.toString().replace('.', ',')}`;
  if (d.cavalryAttack !== 1) fx.push(`Cavalerie ${fmt(d.cavalryAttack)}`);
  if (d.archerAttack !== 1) fx.push(`Archers ${fmt(d.archerAttack)}`);
  if (d.allAttack !== 1) fx.push(`Attaque de tous ${fmt(d.allAttack)}`);
  if (d.defenderDefense !== 1) fx.push(`Défense du défenseur ${fmt(d.defenderDefense)}`);
  if (d.defenderArcherAttack !== 1) fx.push(`Archers du défenseur ${fmt(d.defenderArcherAttack)}`);
  if (d.attackerCharge !== 1) fx.push(`Charges de l’attaquant ${fmt(d.attackerCharge)}`);
  if (d.attackerMoralePerRound)
    fx.push(`L’attaquant perd ${d.attackerMoralePerRound} de moral par round`);
  if (d.ambushRuse !== null) fx.push(`Embuscade si le défenseur a Ruse ≥ ${d.ambushRuse}`);
  if (d.attrition !== 1) fx.push(`Usure des armées ${fmt(d.attrition)}`);
  return fx;
}

type CountyTab = 'apercu' | 'economie' | 'batiments' | 'terrain';

function CountyDetail({ game, id, tab: initial }: { game: GameState; id: string; tab?: string }) {
  const [tab, setTab] = useState<CountyTab>(
    ['apercu', 'economie', 'batiments', 'terrain'].includes(initial ?? '')
      ? (initial as CountyTab)
      : 'apercu',
  );
  const dispatch = useStore((s) => s.dispatch);
  const inspect = useStore((s) => s.inspect);
  const [grant, setGrant] = useState(false);
  const c = game.counties[id];
  const pl = game.playerId;
  const holder = game.characters[c.holderId];
  const ruler = countyRuler(game, c);
  const mine = c.holderId === pl;
  const inMyRealm = ruler === pl;
  const setRealmSheet = useStore((s) => s.setRealmSheet);
  const inspectClose = useStore((s) => s.inspectClose);
  const setTradeWith = useStore((s) => s.setTradeWith);
  const army = armyOf(game, pl);
  const path = army ? findPath(game, pl, army.location, id) : [];
  const armiesHere = Object.values(game.armies).filter((a) => a.location === id);
  const duchy = game.duchies[c.duchyId];
  const kingdom = game.kingdoms[c.kingdomId];
  const claimants = Object.values(game.characters).filter((x) => x.alive && x.claims.includes(id));
  const buildingIncome = countyIncome(c) - c.development * BALANCE.economy.incomePerDevelopment;
  const terrain = TERRAINS[c.terrain];

  return (
    <>
      <div className="ins-hero">
        <div className="county-badge" style={{ background: realmColor(game, ruler) }}>
          <span>{c.name.slice(0, 1)}</span>
        </div>
        <div className="grow">
          <h2 style={{ marginBottom: 2 }}>{c.name}</h2>
          <div className="small muted">
            {terrain.label} · duché de {duchy.name} · royaume de {kingdom.name}
          </div>
          <div className="row wrap" style={{ gap: 4, marginTop: 6 }}>
            {isCapital(c) && <span className="chip her">★ Capitale</span>}
            {inMyRealm && <span className="chip">{mine ? 'Domaine propre' : 'Votre royaume'}</span>}
            {c.occupation && <span className="chip bad">Occupé</span>}
            {c.siege && <span className="chip">Assiégé</span>}
            {c.rivers.length > 0 && <span className="chip">Rivière</span>}
            {c.construction && <span className="chip">Chantier</span>}
          </div>
        </div>
      </div>

      <Segmented<CountyTab>
        style={{ margin: '12px 0 4px' }}
        options={[
          { value: 'apercu', label: 'Aperçu' },
          { value: 'economie', label: 'Économie' },
          { value: 'batiments', label: 'Bâtiments' },
          { value: 'terrain', label: 'Terrain' },
        ]}
        value={tab}
        onChange={setTab}
      />

      {tab === 'apercu' && (
        <Section title="Seigneurie">
          <dl className="kv">
            <dt>Titulaire</dt>
            <dd>
              <CharLink state={game} id={holder?.id} />
            </dd>
            {ruler !== c.holderId && (
              <>
                <dt>Suzerain</dt>
                <dd>
                  <CharLink state={game} id={ruler} />
                </dd>
              </>
            )}
            <dt>Royaume</dt>
            <dd>
              <button
                className="link"
                onClick={() => {
                  inspectClose();
                  setRealmSheet(ruler);
                }}
              >
                {realmName(game, ruler)}
              </button>
            </dd>
            <dt>Duché</dt>
            <dd>
              {duchy.name}
              {duchy.holderId ? (
                <>
                  {' '}
                  (<CharLink state={game} id={duchy.holderId} />)
                </>
              ) : (
                ' (vacant)'
              )}
            </dd>
            {c.occupation && (
              <>
                <dt>Occupé par</dt>
                <dd className="bad">
                  <CharLink state={game} id={c.occupation.byRulerId} />
                </dd>
              </>
            )}
          </dl>
          {holder && holder.id !== pl && (
            <div className="row small" style={{ marginTop: 6 }}>
              <span className="grow muted">Opinion de {holder.name} envers vous</span>
              <b>{signed(opinionOf(game, holder.id, pl).total)}</b>
            </div>
          )}
        </Section>
      )}

      {tab === 'apercu' && <CapitalSection game={game} c={c} />}

      {tab === 'economie' && (
        <Section title="Économie et défense">
          <div className="small muted">
            Développement {c.development} / {countyDevMax(c)}
          </div>
          <Bar value={c.development} max={countyDevMax(c)} color="var(--gold)" />
          <dl className="kv" style={{ marginTop: 8 }}>
            <dt>Revenus du comté</dt>
            <dd>{countyIncome(c).toFixed(1)} or / saison</dd>
            <dt className="small">· développement</dt>
            <dd className="small">
              {(c.development * BALANCE.economy.incomePerDevelopment).toFixed(1)}
            </dd>
            <dt className="small">· bâtiments</dt>
            <dd className="small">{buildingIncome.toFixed(1)}</dd>
            {mine && (
              <>
                <dt className="small">· gestion du souverain</dt>
                <dd className="small">×{incomeMultiplier(game, pl).toFixed(2)}</dd>
              </>
            )}
            {isCapital(c) && (
              <>
                <dt className="small">· capitale (cour, marchés)</dt>
                <dd className="small">×{BALANCE.capital.incomeMult.toFixed(2)}</dd>
              </>
            )}
            <dt>Levées</dt>
            <dd>
              {Math.round(c.levyPool)} / {Math.round(countyMaxLevies(c) * countyLevyMult(game, c))}{' '}
              hommes
            </dd>
            <dt>Fortification</dt>
            <dd>
              {fortLevel(c)} / {isCapital(c) ? BALANCE.capital.fortMax : 3} — siège de{' '}
              {1 + fortLevel(c)} saison(s)
            </dd>
            <dt>Route</dt>
            <dd>{hasRoad(c) ? 'oui (2 comtés par saison)' : 'non'}</dd>
            {c.siege && (
              <>
                <dt>Siège</dt>
                <dd>
                  {c.siege.progress} / {1 + fortLevel(c)} saisons
                </dd>
              </>
            )}
          </dl>
        </Section>
      )}

      {tab === 'economie' && (mine || inMyRealm) && (
        <Section title="Économie locale">
          <CountyEconomy game={game} id={id} />
        </Section>
      )}

      {tab === 'terrain' && (
        <Section title={`Terrain : ${terrain.label}`}>
          <ul className="fx-list small">
            {terrainEffects(c.terrain).map((f) => (
              <li key={f}>{f}</li>
            ))}
            {c.rivers.length > 0 && (
              <li>
                Rivière avec {c.rivers.map((r) => game.counties[r]?.name).join(', ')} : l’attaquant
                qui la franchit attaque ×{String(RIVER.attackerAttack).replace('.', ',')} aux rounds
                1 et 2
              </li>
            )}
            {terrainEffects(c.terrain).length === 0 && <li>Aucun effet particulier.</li>}
          </ul>
        </Section>
      )}

      {tab === 'terrain' && armiesHere.length > 0 && (
        <Section title="Armées présentes">
          {armiesHere.map((a) => {
            const v = visibleMen(game, a.id);
            return (
              <button
                key={a.id}
                className="list-item tappable plain"
                onClick={() => inspect({ kind: 'armee', id: a.id })}
              >
                <span className="swatch" style={{ background: realmColor(game, a.ownerId) }} />
                <span className="grow">
                  {game.characters[a.ownerId]?.name} — {v.exact ? '' : '~'}
                  {v.men} hommes
                </span>
                <span className="chev">›</span>
              </button>
            );
          })}
        </Section>
      )}

      {army && army.location !== id && (
        <button
          className="btn primary block"
          style={{ marginTop: 12 }}
          disabled={!path.length}
          onClick={() => dispatch({ type: 'moveArmy', armyId: army.id, targetCountyId: id })}
        >
          {path.length
            ? `Envoyer l’armée ici (${path.length} saison${path.length > 1 ? 's' : ''} au plus)`
            : 'Inaccessible à votre armée'}
        </button>
      )}

      {!inMyRealm && holder && !holder.liegeId && holder.id !== pl && (
        <button
          className="btn block"
          style={{ marginTop: 8 }}
          disabled={isCapital(c) || !!c.occupation}
          onClick={() => setTradeWith({ targetId: holder.id, take: c.id })}
        >
          {isCapital(c)
            ? 'Capitale : elle ne se vend pas'
            : `Proposer d’acheter ${c.name} (~${countyValue(game, c, pl)} or)`}
        </button>
      )}

      {tab === 'batiments' && (
        <Section title={`Bâtiments (${c.buildings.length} / ${countySlots(c)})`}>
          {c.buildings.length === 0 && !c.construction && (
            <p className="muted small">Aucun bâtiment.</p>
          )}
          {c.buildings.map((b) => (
            <div key={b.type} className="small" style={{ padding: '4px 0' }}>
              <b>
                {BUILDINGS[b.type].name} {b.level}
              </b>{' '}
              <span className="muted">{BUILDINGS[b.type].description}</span>
            </div>
          ))}
          {c.construction && (
            <p className="small">
              Chantier : {BUILDINGS[c.construction.type].name} niv. {c.construction.level} — encore{' '}
              {c.construction.remaining} saison(s)
            </p>
          )}
          {mine &&
            BUILDING_TYPES.map((t) => {
              const chk = canBuild(game, pl, id, t);
              if (buildingLevel(c, t) >= 2) return null;
              return (
                <div key={t} className="list-item">
                  <div className="grow">
                    <b>
                      {BUILDINGS[t].name} {chk.level}
                    </b>
                    <div className="small muted">
                      {BUILDINGS[t].description} {chk.cost} or, {chk.seasons} saisons.
                      {!chk.ok && chk.reason ? <span className="bad"> {chk.reason}</span> : null}
                    </div>
                  </div>
                  <button
                    className="btn small"
                    disabled={!chk.ok}
                    onClick={() => dispatch({ type: 'build', countyId: id, building: t })}
                  >
                    Bâtir
                  </button>
                </div>
              );
            })}
        </Section>
      )}

      {tab === 'apercu' && claimants.length > 0 && (
        <Section title="Revendiqué par">
          <div className="row wrap" style={{ gap: 6 }}>
            {claimants.map((x) => (
              <CharLink key={x.id} state={game} id={x.id} />
            ))}
          </div>
        </Section>
      )}

      {tab === 'batiments' && mine && (
        <>
          <button
            className="btn block ghost"
            style={{ marginTop: 12 }}
            onClick={() => setGrant(!grant)}
          >
            Accorder ce comté à un courtisan
          </button>
          {grant && (
            <div style={{ marginTop: 6 }}>
              <p className="small muted">
                Le bénéficiaire devient votre vassal (+30 d’opinion) ; vous perdez le comté de votre
                domaine propre.
              </p>
              {councilCandidates(game)
                .filter((x) => !heldCounties(game, x.id).length)
                .map((x) => (
                  <CharLine
                    key={x.id}
                    state={game}
                    c={x}
                    extra="accorder"
                    onTap={() => {
                      dispatch({ type: 'grantCounty', countyId: id, characterId: x.id });
                      setGrant(false);
                    }}
                  />
                ))}
            </div>
          )}
        </>
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// Armée
// ---------------------------------------------------------------------------

function ArmyDetail({ game, id }: { game: GameState; id: string }) {
  const a = game.armies[id];
  const pl = game.playerId;
  const mine = a.ownerId === pl;
  const vis = visibleMen(game, id);
  const hostile = atWar(game, a.ownerId, pl);
  const dest = a.path.length ? a.path[a.path.length - 1] : undefined;
  return (
    <>
      <div className="ins-hero">
        <div className="county-badge" style={{ background: realmColor(game, a.ownerId) }}>
          <span>⚔</span>
        </div>
        <div className="grow">
          <h2 style={{ marginBottom: 2 }}>Armée de {game.characters[a.ownerId]?.name}</h2>
          <div className="small muted">{realmName(game, a.ownerId)}</div>
          <div className="row wrap" style={{ gap: 4, marginTop: 6 }}>
            {mine && <span className="chip">Votre armée</span>}
            {hostile && <span className="chip bad">Ennemie</span>}
            {!vis.exact && <span className="chip">Estimation</span>}
          </div>
        </div>
      </div>
      <Section title="Position">
        <dl className="kv">
          <dt>Comté</dt>
          <dd>
            <CountyLink state={game} id={a.location} />
          </dd>
          {dest && (
            <>
              <dt>Destination</dt>
              <dd>
                <CountyLink state={game} id={dest} /> ({a.path.length} étape
                {a.path.length > 1 ? 's' : ''})
              </dd>
            </>
          )}
          <dt>Commandant</dt>
          <dd>{vis.exact ? <CharLink state={game} id={a.commanderId} /> : '?'}</dd>
          <dt>En campagne depuis</dt>
          <dd>{a.seasonsRaised} saison(s)</dd>
        </dl>
      </Section>
      <Section title={`Effectif : ${vis.exact ? '' : '~'}${vis.men} hommes`}>
        {vis.exact ? (
          <>
            {UNIT_TYPES.filter((u) => a.men[u] > 0).map((u) => (
              <div key={u} className="row small" style={{ padding: '3px 0' }}>
                <span className="grow">{UNITS[u].label}</span>
                <b>{Math.round(a.men[u])}</b>
                <span className="muted" style={{ width: 120, textAlign: 'right' }}>
                  Att. {UNITS[u].attack} · Déf. {UNITS[u].defense}
                </span>
              </div>
            ))}
            <div className="small muted" style={{ marginTop: 6 }}>
              Ravitaillement {Math.round(a.supply)} / 100
            </div>
            <Bar value={a.supply} max={100} color={a.supply < 25 ? 'var(--bad)' : 'var(--good)'} />
            {mine && (
              <p className="small muted">
                Entretien {armyUpkeep(a.men).toFixed(1)} or par saison · effectif de départ{' '}
                {a.baseMen}
              </p>
            )}
          </>
        ) : (
          <p className="small muted">
            Trop loin de vos troupes et de vos forts pour en connaître la composition.
            Approchez-vous ou faites espionner cette cour par votre maître-espion.
          </p>
        )}
      </Section>
      {totalMen(a.men) > 0 && hostile && vis.exact && (
        <p className="small">
          Comparaison : votre armée{' '}
          {(() => {
            const mineA = armyOf(game, pl);
            if (!mineA) return 'n’est pas levée.';
            const r = totalMen(mineA.men) / totalMen(a.men);
            return `compte ${Math.round(totalMen(mineA.men))} hommes (×${r.toFixed(2)}).`;
          })()}
        </p>
      )}
    </>
  );
}

/** Lancer un complot depuis la fiche d'un personnage. */
function PlotActions({ game, id }: { game: GameState; id: string }) {
  const dispatch = useStore((s) => s.dispatch);
  const pl = game.playerId;
  const c = game.characters[id];
  const current = Object.values(game.plots).find((p) => p.ownerId === pl);
  if (current)
    return (
      <p className="small muted">
        Un complot est déjà en cours contre {game.characters[current.targetId]?.name ?? '—'} : un
        seul à la fois (Monde › Complots).
      </p>
    );
  const types = (Object.keys(PLOT_INFO) as PlotType[]).filter(
    (t) => t !== 'revolte' || (c.liegeId && c.liegeId !== pl),
  );
  const child = ageOf(game, c) < BALANCE.characters.adulthood;
  return (
    <>
      {child && (
        <p className="small muted" style={{ marginTop: 0 }}>
          Un enfant est protégé par la vigilance de sa cour ; le tuer pèse lourd sur la conscience.
        </p>
      )}
      <div className="plot-actions">
        {types.map((t) => {
          const chk = canStartPlot(game, pl, t, id);
          const o = plotOdds(game, pl, id, 0);
          return (
            <button
              key={t}
              className={`btn small${t === 'assassiner' ? ' danger-ghost' : ''}`}
              disabled={!chk.ok}
              onClick={() => dispatch({ type: 'startPlot', plotType: t, targetId: id })}
            >
              {PLOT_INFO[t].label}
              <span className="small">
                {chk.ok ? `${Math.round(o.success * 100)} % · ${o.seasons} saison(s)` : chk.reason}
              </span>
            </button>
          );
        })}
      </div>
      <p className="small muted" style={{ margin: '6px 0 0' }}>
        Ajoutez des agents et suivez le complot dans Monde › Complots.
      </p>
    </>
  );
}

/** Section « À la cour » de la fiche : n'apparaît que s'il y a une action possible. */
function CourtActionsSection({ game, c }: { game: GameState; c: GameState['characters'][string] }) {
  if (!courtActionKinds(game, c).length) return null;
  return (
    <Section title="À la cour">
      <CourtActions game={game} c={c} />
    </Section>
  );
}
