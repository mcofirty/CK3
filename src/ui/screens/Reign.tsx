/** Onglet Règne : où en suis-je, que dois-je faire ? Résumé, journal, livre de la dynastie. */
import { useState } from 'react';
import { ageOf, displayName, healthOf, opinion } from '../../engine/characters';
import { heirsOf } from '../../engine/characters/lifecycle';
import { yearOf } from '../../engine/context';
import { availableLevies, economyOf, realmCounties, titleOf, vassalsOf } from '../../engine/realm';
import type { GameState } from '../../engine/state';
import { totalMen } from '../../engine/units';
import { armyOf, scoreFor, warsOf } from '../../engine/war';
import { attention, type AttentionItem } from '../attention';
import { AchievementList, DynastyBook } from '../components/Book';
import { BALANCE } from '../../data/balance';
import { followedChanges, seasonDigest, type FollowedChange } from '../../engine/digest';
import {
  CardTitle,
  CountyLink,
  Portrait,
  Segmented,
  signed,
  useFocusView,
  usePager,
} from '../components/common';
import { useStore } from '../store';
import { FirstVisitTip } from '../components/FirstVisit';

const KIND_ICON: Record<string, string> = {
  naissance: '✶',
  deces: '✝',
  succession: '♛',
  guerre: '⚔',
  bataille: '⚔',
  titre: '♜',
  mariage: '⚭',
  evenement: '✎',
  intrigue: '☾',
  divers: '•',
};

const REIGN_VIEWS = ['resume', 'journal', 'livre'] as const;
type ReignView = (typeof REIGN_VIEWS)[number];

export function ReignScreen({ game }: { game: GameState }) {
  const [view, setView] = useState<ReignView>('resume');
  const dir = usePager(REIGN_VIEWS, view, setView);
  useFocusView(REIGN_VIEWS, setView);
  return (
    <>
      <Segmented
        className="subnav"
        options={[
          { value: 'resume', label: 'Résumé' },
          { value: 'journal', label: 'Journal' },
          { value: 'livre', label: 'Livre' },
        ]}
        value={view}
        onChange={setView}
      />
      <div className={`view enter-${dir}`} key={view}>
        <FirstVisitTip id={`regne/${view}`} />
        {view === 'resume' && <Summary game={game} />}
        {view === 'journal' && <Journal game={game} />}
        {view === 'livre' && <Book game={game} />}
      </div>
    </>
  );
}

/** Ouvre la cible d'un point d'attention. */
export function useAttentionGo() {
  const inspect = useStore((s) => s.inspect);
  const goTo = useStore((s) => s.goTo);
  return (go: AttentionItem['go']) => {
    if ('inspect' in go) inspect(go.inspect);
    else goTo(go.tab, go.view, go.anchor);
  };
}

function Summary({ game }: { game: GameState }) {
  const inspect = useStore((s) => s.inspect);
  const goTo = useStore((s) => s.goTo);
  const open = useAttentionGo();
  const pl = game.playerId;
  const p = game.characters[pl];
  const heir = heirsOf(game, p)[0];
  const items = attention(game);
  const eco = economyOf(game, pl);
  const wars = warsOf(game, pl);
  const army = armyOf(game, pl);
  const vassals = vassalsOf(game, pl);
  const unhappy = vassals.filter(
    (v) => opinion(game, v, pl) < -30 || game.characters[v].inFaction,
  ).length;
  const counties = realmCounties(game, pl).length;
  const recent = game.notifications.filter((n) => n.turn >= game.turn - 1);
  const war = wars[0];
  const score = war ? scoreFor(game, war, pl) : 0;
  const report = game.lastBattleReport;
  return (
    <>
      <div className="card">
        <button className="summary-hero plain" onClick={() => inspect({ kind: 'perso', id: pl })}>
          <Portrait state={game} c={p} size={64} />
          <span className="grow">
            <b className="summary-name">{displayName(game, p)}</b>
            <span className="small muted">
              {titleOf(game, pl)} · {ageOf(game, p)} ans · santé {healthOf(p)}
            </span>
            <span className="small">
              Héritier :{' '}
              {heir ? (
                <b>
                  {heir.name}, {ageOf(game, heir)} ans
                </b>
              ) : (
                <b className="bad">aucun</b>
              )}
            </span>
          </span>
          <span className="chev">›</span>
        </button>
      </div>

      <SinceLastSeason game={game} />
      <FollowedCard game={game} />

      <div className="card" id="focus-afaire">
        <CardTitle extra={items.length ? String(items.length) : undefined}>
          À faire cette saison
        </CardTitle>
        {items.length === 0 && <p className="muted small">Rien d’urgent : le royaume est calme.</p>}
        {items.map((it, i) => (
          <button key={i} className={`todo-item ${it.level}`} onClick={() => open(it.go)}>
            <span className="grow">
              {it.text}
              {it.detail && <span className="tiny muted">{it.detail}</span>}
            </span>
            <span className="chev">›</span>
          </button>
        ))}
      </div>

      <div className="card">
        <CardTitle>Le royaume en chiffres</CardTitle>
        <div className="summary-tiles">
          <button className="summary-tile" onClick={() => goTo('royaume', 'tresor')}>
            <b className={eco.goldNet >= 0 ? 'good' : 'bad'}>
              {signed(Math.round(eco.goldNet * 10) / 10)} or
            </b>
            <span>par saison · {Math.round(p.gold + eco.goldNet * 4)} dans un an</span>
          </button>
          <button className="summary-tile" onClick={() => goTo('armee', 'guerres')}>
            {war ? (
              <>
                <b className={score >= 0 ? 'good' : 'bad'}>{signed(score)}</b>
                <span>
                  score de guerre · {wars.length > 1 ? `${wars.length} guerres, dont ` : ''}
                  {war.name}
                </span>
              </>
            ) : (
              <>
                <b>En paix</b>
                <span>aucune guerre en cours</span>
              </>
            )}
          </button>
          <button className="summary-tile" onClick={() => goTo('armee', 'troupes')}>
            {army ? (
              <>
                <b>{Math.round(totalMen(army.men))}</b>
                <span>hommes levés à {game.counties[army.location]?.name}</span>
              </>
            ) : (
              <>
                <b>{availableLevies(game, pl).total}</b>
                <span>levées disponibles</span>
              </>
            )}
          </button>
          <button className="summary-tile" onClick={() => goTo('royaume', 'domaine')}>
            <b>
              {counties} comté{counties > 1 ? 's' : ''}
            </b>
            <span>
              {vassals.length} vassa{vassals.length > 1 ? 'ux' : 'l'}
              {unhappy ? `, ${unhappy} mécontent${unhappy > 1 ? 's' : ''}` : ''}
            </span>
          </button>
        </div>
      </div>

      <div className="card">
        <CardTitle>Avis de la saison</CardTitle>
        {recent.length === 0 && <p className="muted small">Rien de neuf.</p>}
        {[...recent]
          .reverse()
          .slice(0, 6)
          .map((n, i) => (
            <p key={i} className="small" style={{ margin: '4px 0' }}>
              • {n.text}
            </p>
          ))}
        <button className="link" onClick={() => goTo('regne', 'journal')}>
          Tout le journal ›
        </button>
      </div>

      {report && (
        <div className="card">
          <CardTitle>Dernière bataille : {report.countyName}</CardTitle>
          <p className="small" style={{ margin: 0 }}>
            {report.attackerName} contre {report.defenderName} —{' '}
            <b className={report.playerWon ? 'good' : 'bad'}>
              {report.playerWon ? 'victoire' : 'défaite'}
            </b>{' '}
            en {report.result.rounds} rounds ; pertes {report.result.losses.attacker} /{' '}
            {report.result.losses.defender}.
          </p>
        </div>
      )}
    </>
  );
}

/** Ce qui a changé pendant la dernière fin de saison. */
function SinceLastSeason({ game }: { game: GameState }) {
  const inspect = useStore((s) => s.inspect);
  const d = seasonDigest(game);
  if (!d) return null;
  const round = (n: number) => Math.round(n * 10) / 10;
  const res = [
    { label: 'or', v: round(d.gold) },
    { label: 'prestige', v: round(d.prestige) },
    { label: 'piété', v: round(d.piety) },
    { label: 'renommée', v: round(d.renown) },
  ].filter((x) => x.v !== 0);
  const nothing =
    !res.length && !d.gained.length && !d.lost.length && !d.opinions.length && !d.facts.length;
  return (
    <div className="card">
      <CardTitle>Depuis la saison dernière</CardTitle>
      {d.newRuler && (
        <p className="small" style={{ margin: '0 0 6px' }}>
          Un nouveau souverain règne : les ressources repartent de son trésor.
        </p>
      )}
      {nothing && <p className="muted small">Une saison sans histoire.</p>}
      {res.length > 0 && (
        <div className="digest-res">
          {res.map((x) => (
            <span key={x.label} className={`chip ${x.v >= 0 ? 'good' : 'bad'}`}>
              {signed(x.v)} {x.label}
            </span>
          ))}
        </div>
      )}
      {(d.gained.length > 0 || d.lost.length > 0) && (
        <p className="small" style={{ margin: '6px 0' }}>
          {d.gained.length > 0 && (
            <>
              <b className="good">Comtés gagnés :</b>{' '}
              {d.gained.map((id) => (
                <CountyLink key={id} state={game} id={id} />
              ))}{' '}
            </>
          )}
          {d.lost.length > 0 && (
            <>
              <b className="bad">Comtés perdus :</b>{' '}
              {d.lost.map((id) =>
                game.counties[id] ? <CountyLink key={id} state={game} id={id} /> : null,
              )}
            </>
          )}
        </p>
      )}
      {d.opinions.slice(0, 4).map((o) => (
        <button
          key={o.id}
          className="digest-line plain"
          onClick={() => inspect({ kind: 'perso', id: o.id })}
        >
          <span className="grow">{game.characters[o.id]?.name}</span>
          <span className="small muted">
            opinion {signed(Math.round(o.before))} →{' '}
            <b className={o.after >= o.before ? 'good' : 'bad'}>{signed(Math.round(o.after))}</b>
          </span>
        </button>
      ))}
      {d.facts.slice(-6).map((e, i) => (
        <p key={i} className="small" style={{ margin: '4px 0' }}>
          <span className="muted">{KIND_ICON[e.kind]}</span> {e.text}
        </p>
      ))}
    </div>
  );
}

/** Les personnages que le joueur suit, et ce qui leur est arrivé depuis la saison dernière. */
function FollowedCard({ game }: { game: GameState }) {
  const inspect = useStore((s) => s.inspect);
  const dispatch = useStore((s) => s.dispatch);
  const ids = (game.followed ?? []).filter((id) => game.characters[id]);
  if (!ids.length) return null;
  const changes = new Map(followedChanges(game).map((c) => [c.id, c]));
  return (
    <div className="card">
      <CardTitle
        extra={String(ids.length)}
        help="Touchez « Suivre » sur la fiche d’un personnage : ce qui lui arrive (mariage, naissance, titres, prison, santé, opinion, mort) s’affiche ici à chaque saison."
      >
        Personnages suivis
      </CardTitle>
      {ids.map((id) => {
        const c = game.characters[id];
        const ch = changes.get(id);
        const notes = ch ? followedNotes(ch) : [];
        return (
          <div key={id} className="followed-row">
            <button className="followed-main plain" onClick={() => inspect({ kind: 'perso', id })}>
              <Portrait state={game} c={c} size={44} />
              <span className="grow">
                <b>{displayName(game, c)}</b>
                <span className="small muted">
                  {c.alive
                    ? `${titleOf(game, id) || 'sans titre'} · ${ageOf(game, c)} ans · opinion ${signed(opinion(game, id, game.playerId))}`
                    : `† à ${ageOf(game, c)} ans`}
                </span>
                {notes.length > 0 && (
                  <span className="followed-notes">
                    {notes.map((n) => (
                      <span key={n.text} className={`chip ${n.cls}`}>
                        {n.text}
                      </span>
                    ))}
                  </span>
                )}
              </span>
            </button>
            {!c.alive && (
              <button
                className="btn small ghost"
                onClick={() => dispatch({ type: 'toggleFollow', id })}
              >
                Retirer
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}

function followedNotes(ch: FollowedChange): { text: string; cls: string }[] {
  const n: { text: string; cls: string }[] = [];
  if (ch.died) n.push({ text: 'mort', cls: 'bad' });
  if (ch.married) n.push({ text: 'marié', cls: 'good' });
  if (ch.widowed) n.push({ text: 'veuf', cls: '' });
  if (ch.births)
    n.push({ text: ch.births > 1 ? `${ch.births} naissances` : 'naissance', cls: 'good' });
  if (ch.titlesGained) n.push({ text: 'nouveau titre', cls: 'good' });
  if (ch.titlesLost) n.push({ text: 'titre perdu', cls: 'bad' });
  if (ch.imprisoned) n.push({ text: 'emprisonné', cls: 'bad' });
  if (ch.freed) n.push({ text: 'libéré', cls: 'good' });
  if (ch.newLiege) n.push({ text: 'change de suzerain', cls: '' });
  if (Math.abs(ch.health) >= BALANCE.digest.healthStep)
    n.push({ text: `santé ${signed(Math.round(ch.health))}`, cls: ch.health > 0 ? 'good' : 'bad' });
  if (Math.abs(ch.opinion) >= BALANCE.digest.opinionStep)
    n.push({
      text: `opinion ${signed(Math.round(ch.opinion))}`,
      cls: ch.opinion > 0 ? 'good' : 'bad',
    });
  return n;
}

function Journal({ game }: { game: GameState }) {
  const [mode, setMode] = useState<'chronique' | 'avis'>('chronique');
  const entries = [...game.chronicle].reverse();
  const byYear = new Map<number, typeof entries>();
  for (const e of entries) {
    const y = yearOf(game, e.turn);
    byYear.set(y, [...(byYear.get(y) ?? []), e]);
  }
  return (
    <>
      <Segmented
        style={{ marginBottom: 12 }}
        options={[
          { value: 'chronique', label: 'Chronique' },
          { value: 'avis', label: 'Avis' },
        ]}
        value={mode}
        onChange={setMode}
      />
      {mode === 'chronique' &&
        [...byYear.entries()].map(([y, list]) => (
          <div key={y} className="card">
            <h3>{y}</h3>
            {list.map((e, i) => (
              <p key={i}>
                <span className="muted">{KIND_ICON[e.kind]}</span> {e.text}
              </p>
            ))}
          </div>
        ))}
      {mode === 'avis' && (
        <div className="card">
          {game.notifications.length === 0 && <p className="muted">Rien de neuf.</p>}
          {[...game.notifications].reverse().map((n, i) => (
            <p key={i} className="small">
              <b>{yearOf(game, n.turn)}</b> — {n.text}
            </p>
          ))}
        </div>
      )}
    </>
  );
}

function Book({ game }: { game: GameState }) {
  const globalAch = useStore((s) => s.globalAchievements);
  return (
    <>
      <DynastyBook game={game} />
      <div className="card">
        <CardTitle>Succès</CardTitle>
        <AchievementList unlocked={globalAch} current={game.achievements} />
      </div>
    </>
  );
}
