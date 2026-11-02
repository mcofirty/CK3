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
import {
  CardTitle,
  Portrait,
  Segmented,
  signed,
  useFocusView,
  usePager,
} from '../components/common';
import { useStore } from '../store';

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
                  {wars.length > 1 ? `${wars.length} guerres · ` : ''}
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
