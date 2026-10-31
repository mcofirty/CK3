import { useEffect, useRef, useState } from 'react';
import { SEASON_NAMES } from '../data/names';
import { displayName, opinion } from '../engine/characters';
import { yearOf } from '../engine/context';
import { wards } from '../engine/diplomacy';
import { checkAll, effectLabels, eventDef, eventText, renderText } from '../engine/events/engine';
import { vassalsOf } from '../engine/realm';
import type { GameState } from '../engine/state';
import { listSlots, downloadExport, type Slot, type SlotInfo } from '../save/storage';
import {
  Icon,
  Logo,
  Segmented,
  Sheet,
  TipLayer,
  signed,
  useSlideSelect,
} from './components/common';
import { Inspector } from './components/Inspector';
import { BattleScreen } from './screens/Battle';
import { ArmyScreen } from './screens/Army';
import { ChronicleScreen } from './screens/Chronicle';
import { CourtScreen } from './screens/Court';
import { IntrigueScreen } from './screens/Intrigue';
import { RealmScreen } from './screens/Realm';
import { TABS, useStore, type Tab } from './store';

export function App() {
  const game = useStore((s) => s.game);
  const error = useStore((s) => s.error);
  return (
    <>
      {game ? <Game game={game} /> : <TitleScreen />}
      {error && <div className="toast glass">{error}</div>}
      <TipLayer />
    </>
  );
}

// ---------------------------------------------------------------------------
// Écran titre
// ---------------------------------------------------------------------------

function TitleScreen() {
  const { start, load, importText, resume } = useStore();
  const [slots, setSlots] = useState<SlotInfo[]>([]);
  const [newSlot, setNewSlot] = useState<Slot | null>(null);
  const [difficulty, setDifficulty] = useState<'facile' | 'normal' | 'difficile'>('normal');
  const [female, setFemale] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const importSlot = useRef<Slot>(1);
  useEffect(() => {
    void listSlots().then(setSlots);
  }, []);
  const anySave = slots.some((s) => !s.empty);
  const standalone =
    typeof window !== 'undefined' &&
    (window.matchMedia?.('(display-mode: standalone)').matches ||
      (navigator as Navigator & { standalone?: boolean }).standalone === true);
  return (
    <div className="title-screen">
      <Logo size={120} className="logo" />
      <h1 className="brand">Highborn</h1>
      <p className="center muted" style={{ marginBottom: 24 }}>
        Une dynastie, des vassaux, des batailles.
        <br />
        Faites durer votre maison cent cinquante ans.
      </p>
      {!standalone && (
        <div className="card install-hint">
          <b>Jouer en plein écran</b>
          <p className="small muted">
            Dans Safari : bouton Partager, puis « Sur l’écran d’accueil ». Highborn s’ouvrira alors
            sans barre de navigation, comme une app.
          </p>
        </div>
      )}
      {anySave && (
        <button
          className="btn primary block"
          style={{ marginBottom: 16 }}
          onClick={() => void resume()}
        >
          Continuer la dernière partie
        </button>
      )}
      <div className="card">
        <h3>Emplacements</h3>
        {slots.map((s) => (
          <div key={s.slot} className="list-item">
            <div className="grow">
              <b>Emplacement {s.slot}</b>
              <div className="small muted">{s.empty ? 'Vide' : `${s.label} · ${s.date}`}</div>
            </div>
            {!s.empty && (
              <button className="btn small" onClick={() => void load(s.slot)}>
                Charger
              </button>
            )}
            <button className="btn small ghost" onClick={() => setNewSlot(s.slot)}>
              Nouvelle
            </button>
          </div>
        ))}
        <button
          className="btn block ghost"
          style={{ marginTop: 8 }}
          onClick={() => {
            importSlot.current = (slots.find((s) => s.empty)?.slot ?? 1) as Slot;
            fileRef.current?.click();
          }}
        >
          Importer une partie (JSON)
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          hidden
          onChange={async (e) => {
            const f = e.target.files?.[0];
            if (f) await importText(importSlot.current, await f.text());
          }}
        />
      </div>
      {newSlot && (
        <Sheet onClose={() => setNewSlot(null)}>
          <h2>Nouvelle partie</h2>
          <p className="muted small">
            Emplacement {newSlot}
            {slots.find((s) => s.slot === newSlot && !s.empty)
              ? ' — la partie existante sera remplacée.'
              : ''}
          </p>
          <h3 style={{ marginTop: 12 }}>Difficulté</h3>
          <Segmented
            options={[
              { value: 'facile', label: 'Facile' },
              { value: 'normal', label: 'Normal' },
              { value: 'difficile', label: 'Difficile' },
            ]}
            value={difficulty}
            onChange={setDifficulty}
          />
          <h3 style={{ marginTop: 14 }}>Souverain</h3>
          <Segmented
            options={[
              { value: 'duc', label: 'Un duc' },
              { value: 'duchesse', label: 'Une duchesse' },
            ]}
            value={female ? 'duchesse' : 'duc'}
            onChange={(v) => setFemale(v === 'duchesse')}
          />
          <button
            className="btn primary block"
            style={{ marginTop: 16 }}
            onClick={() => void start(newSlot, { difficulty, female })}
          >
            Fonder la lignée
          </button>
        </Sheet>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Partie en cours
// ---------------------------------------------------------------------------

function Game({ game }: { game: GameState }) {
  const tab = useStore((s) => s.tab);
  const tabDir = useStore((s) => s.tabDir);
  const [summary, setSummary] = useState<string[] | null>(null);
  const dispatch = useStore((s) => s.dispatch);
  if (game.gameOver) return <EndScreen game={game} />;
  const endSeason = () => {
    const items = attention(game);
    if (items.length) setSummary(items);
    else dispatch({ type: 'endSeason' });
  };
  return (
    <div className="app">
      <TopBar game={game} onEndSeason={endSeason} />
      <SwipeScreen key={tab} className={`screen enter-${tabDir}`}>
        {tab === 'cour' && <CourtScreen game={game} />}
        {tab === 'royaume' && <RealmScreen game={game} />}
        {tab === 'armee' && <ArmyScreen game={game} />}
        {tab === 'intrigues' && <IntrigueScreen game={game} />}
        {tab === 'chronique' && <ChronicleScreen game={game} />}
      </SwipeScreen>
      <TabBar />
      <OutcomeToast outcome={game.lastOutcome} />
      {game.pendingEvents.length > 0 && <EventModal game={game} />}
      {summary && (
        <Sheet onClose={() => setSummary(null)}>
          <h2>Avant de finir la saison</h2>
          {summary.map((s, i) => (
            <p key={i}>• {s}</p>
          ))}
          <div className="row" style={{ marginTop: 12 }}>
            <button className="btn grow" onClick={() => setSummary(null)}>
              Revenir
            </button>
            <button
              className="btn primary grow"
              onClick={() => {
                setSummary(null);
                dispatch({ type: 'endSeason' });
              }}
            >
              Finir la saison
            </button>
          </div>
        </Sheet>
      )}
      <Inspector game={game} />
      {!game.tutorialSeen && <Tutorial />}
      {game.phase === 'bataille' && game.battle && <BattleScreen game={game} />}
    </div>
  );
}

/** Ce qui demande attention avant la fin de saison. */
function attention(g: GameState): string[] {
  const res: string[] = [];
  const pl = g.playerId;
  for (const v of vassalsOf(g, pl)) {
    const op = opinion(g, v, pl);
    if (op < -30 || g.characters[v].inFaction)
      res.push(`${g.characters[v].name} est mécontent (opinion ${signed(op)}).`);
  }
  for (const a of Object.values(g.armies))
    if (a.ownerId === pl && a.supply < 20)
      res.push(`Votre armée manque de ravitaillement (${Math.round(a.supply)}).`);
  for (const k of wards(g))
    if (!k.educatorId && (g.turn - k.birthTurn) / 4 >= 3)
      res.push(`${k.name} n’a pas d’éducateur.`);
  const seatsEmpty = Object.values(g.council).filter((s) => !s.holderId).length;
  if (seatsEmpty) res.push(`${seatsEmpty} siège(s) du conseil vacant(s).`);
  if (g.characters[pl].gold < 0) res.push('Votre trésor est dans le rouge.');
  return res;
}

/** Page glissable : glisser horizontalement change de sous-vue, puis d'onglet. */
function SwipeScreen({ className, children }: { className: string; children: React.ReactNode }) {
  const ref = useRef<HTMLElement>(null);
  const g = useRef<{ x: number; y: number; t: number; lock: 'h' | 'v' | null; id: number } | null>(
    null,
  );
  const reset = (animate: boolean) => {
    const el = ref.current;
    if (!el) return;
    el.style.transition = animate ? 'transform 280ms var(--spring), opacity 280ms var(--ease)' : '';
    el.style.transform = '';
    el.style.opacity = '';
  };
  const go = (step: 1 | -1) => {
    const { pager, tab, setTab } = useStore.getState();
    if (pager && pager.index + step >= 0 && pager.index + step < pager.count) {
      pager.go(pager.index + step);
      return true;
    }
    const i = TABS.indexOf(tab) + step;
    if (i >= 0 && i < TABS.length) {
      setTab(TABS[i]);
      return true;
    }
    return false;
  };
  return (
    <main
      ref={ref}
      className={className}
      onPointerDown={(e) => {
        if (e.pointerType === 'mouse') return;
        const t = e.target as HTMLElement;
        // Depuis le bord de l'écran, on change toujours de page (même sur la carte).
        const edge = e.clientX < 24 || e.clientX > window.innerWidth - 24;
        if (!edge && t.closest('.map-wrap, [data-noswipe], input, textarea')) return;
        if (edge) e.stopPropagation();
        g.current = {
          x: e.clientX,
          y: e.clientY,
          t: performance.now(),
          lock: null,
          id: e.pointerId,
        };
      }}
      onPointerMove={(e) => {
        const s = g.current;
        if (!s || s.id !== e.pointerId) return;
        const dx = e.clientX - s.x;
        const dy = e.clientY - s.y;
        if (!s.lock) {
          if (Math.abs(dx) > 12 && Math.abs(dx) > Math.abs(dy) * 1.4) s.lock = 'h';
          else if (Math.abs(dy) > 10) s.lock = 'v';
        }
        if (s.lock === 'h' && ref.current) {
          ref.current.style.transition = 'none';
          ref.current.style.transform = `translateX(${dx * 0.55}px)`;
          ref.current.style.opacity = String(1 - Math.min(0.35, Math.abs(dx) / 900));
        }
      }}
      onPointerUp={(e) => {
        const s = g.current;
        g.current = null;
        if (!s || s.lock !== 'h') return;
        const dx = e.clientX - s.x;
        const v = Math.abs(dx) / Math.max(1, performance.now() - s.t);
        const changed = (Math.abs(dx) > 70 || v > 0.6) && go(dx < 0 ? 1 : -1);
        reset(true);
        if (changed) navigator.vibrate?.(8);
      }}
      onPointerCancel={() => {
        g.current = null;
        reset(true);
      }}
    >
      {children}
    </main>
  );
}

/** Bandeau : issue d'un tirage au sort dans un événement. */
function OutcomeToast({ outcome }: { outcome?: { win: boolean; text: string } }) {
  const [shown, setShown] = useState<typeof outcome>(undefined);
  const last = useRef(outcome);
  useEffect(() => {
    if (!outcome || outcome === last.current) return;
    last.current = outcome;
    setShown(outcome);
    const t = setTimeout(() => setShown(undefined), 3600);
    return () => clearTimeout(t);
  }, [outcome]);
  if (!shown) return null;
  return (
    <div
      className={`toast glass outcome ${shown.win ? 'win' : 'lose'}`}
      onClick={() => setShown(undefined)}
    >
      <span className="die">🎲</span> {shown.text}
    </div>
  );
}

const compact = (n: number) =>
  Math.abs(n) >= 10000 ? `${Math.round(n / 1000)}k` : String(Math.round(n));

function TopBar({ game, onEndSeason }: { game: GameState; onEndSeason: () => void }) {
  const p = game.characters[game.playerId];
  const [detail, setDetail] = useState<'gold' | 'prestige' | 'piety' | null>(null);
  const [debug, setDebug] = useState(false);
  const saving = useStore((s) => s.saving);
  const lines = detail ? game.ledger[detail] : [];
  const labels = { gold: 'Or', prestige: 'Prestige', piety: 'Piété' };
  return (
    <>
      <header className="topbar glass">
        <span className="title" aria-label="Highborn" onContextMenu={(e) => e.preventDefault()}>
          <LongPressTitle onLong={() => setDebug(true)} />
        </span>
        <button className="res" onClick={() => setDetail('gold')}>
          <span className="dot" style={{ background: 'var(--gold)' }} />
          {compact(p.gold)}
        </button>
        <button className="res" onClick={() => setDetail('prestige')}>
          <span
            className="dot"
            style={{ background: 'var(--accent)', borderRadius: 3, transform: 'rotate(45deg)' }}
          />
          {compact(p.prestige)}
        </button>
        <button className="res" onClick={() => setDetail('piety')}>
          <span className="dot" style={{ background: 'var(--good)' }} />
          {compact(p.piety)}
        </button>
        <button
          className="season-btn"
          onClick={onEndSeason}
          disabled={game.pendingEvents.length > 0}
          aria-label="Fin de saison"
        >
          <span className="s1">
            {SEASON_NAMES[game.turn % 4]} {yearOf(game)}
            {saving && ' ·'}
          </span>
          <span className="s2">
            {game.pendingEvents.length > 0
              ? `${game.pendingEvents.length} événement(s)`
              : 'Fin de saison ›'}
          </span>
        </button>
      </header>
      {detail && (
        <Sheet onClose={() => setDetail(null)}>
          <h2>{labels[detail]} — dernière saison</h2>
          {lines.map((l, i) => (
            <div key={i} className="list-item" style={{ minHeight: 40 }}>
              <span className="grow">{l.label}</span>
              <b className={l.value >= 0 ? 'good' : 'bad'}>
                {(l.value >= 0 ? '+' : '') + l.value.toFixed(1)}
              </b>
            </div>
          ))}
          <div className="list-item">
            <b className="grow">Total par saison</b>
            <b>{lines.reduce((s, l) => s + l.value, 0).toFixed(1)}</b>
          </div>
        </Sheet>
      )}
      {debug && <DebugSheet onClose={() => setDebug(false)} />}
    </>
  );
}

function LongPressTitle({ onLong }: { onLong: () => void }) {
  const t = useRef<ReturnType<typeof setTimeout>>();
  return (
    <span
      onPointerDown={() => {
        t.current = setTimeout(onLong, 900);
      }}
      onPointerUp={() => clearTimeout(t.current)}
      onPointerLeave={() => clearTimeout(t.current)}
    >
      <Logo size={30} />
    </span>
  );
}

function DebugSheet({ onClose }: { onClose: () => void }) {
  const { dispatch, quit, game } = useStore();
  return (
    <Sheet onClose={onClose}>
      <h2>Débogage</h2>
      <div className="col">
        <button
          className="btn"
          onClick={() => {
            dispatch({ type: 'debugBattle' });
            onClose();
          }}
        >
          Lancer une bataille de test
        </button>
        <button className="btn" onClick={() => dispatch({ type: 'debugGold', amount: 500 })}>
          +500 or et prestige
        </button>
        <button
          className="btn"
          onClick={() => {
            dispatch({ type: 'debugAdvance', years: 10 });
            onClose();
          }}
        >
          Avancer de 10 ans
        </button>
        {game && (
          <button className="btn" onClick={() => downloadExport(game)}>
            Exporter la partie (JSON)
          </button>
        )}
        <button
          className="btn ghost"
          onClick={() => {
            onClose();
            quit();
          }}
        >
          Retour au menu
        </button>
      </div>
    </Sheet>
  );
}

function TabBar() {
  const tab = useStore((s) => s.tab);
  const setTab = useStore((s) => s.setTab);
  const labels: Record<Tab, string> = {
    cour: 'Cour',
    royaume: 'Royaume',
    armee: 'Armée',
    intrigues: 'Intrigues',
    chronique: 'Chronique',
  };
  const tabs: { id: Tab; label: string }[] = TABS.map((id) => ({ id, label: labels[id] }));
  const { drag, handlers } = useSlideSelect(TABS.length, (i) => setTab(TABS[i]), 5, 0);
  return (
    <nav
      className={`tabbar glass${drag !== null ? ' dragging' : ''}`}
      style={{ ['--i' as string]: drag ?? TABS.indexOf(tab) }}
      aria-label="Navigation principale"
      data-noswipe
      {...handlers}
    >
      <span className="indicator" aria-hidden />
      {tabs.map((t) => (
        <button
          key={t.id}
          className={tab === t.id ? 'active' : ''}
          aria-current={tab === t.id ? 'page' : undefined}
          onClick={() => setTab(t.id)}
        >
          {Icon[t.id]}
          {t.label}
        </button>
      ))}
    </nav>
  );
}

function EventModal({ game }: { game: GameState }) {
  const dispatch = useStore((s) => s.dispatch);
  const inst = game.pendingEvents[0];
  const def = eventDef(game, inst);
  if (!def) {
    return (
      <Sheet>
        <p>Événement introuvable.</p>
        <button
          className="btn"
          onClick={() => dispatch({ type: 'chooseEvent', uid: inst.uid, choice: 0 })}
        >
          Continuer
        </button>
      </Sheet>
    );
  }
  return (
    <Sheet swapKey={inst.uid}>
      <p className="small muted">
        {game.pendingEvents.length > 1
          ? `Événement 1 sur ${game.pendingEvents.length}`
          : 'Événement'}
      </p>
      <h2>{renderText(game, def.titre, inst.scope)}</h2>
      <p className="event-text">{renderText(game, eventText(def, inst.scope), inst.scope)}</p>
      {def.choix.map((c, i) => {
        const ok = checkAll(game, c.conditions, inst.scope);
        const fx = effectLabels(game, c.effets, inst.scope);
        return (
          <button
            key={i}
            className="btn choice"
            disabled={!ok}
            onClick={() => dispatch({ type: 'chooseEvent', uid: inst.uid, choice: i })}
          >
            {renderText(game, c.libelle, inst.scope)}
            <span className="effects">
              {fx.length ? fx.join(' · ') : def.categorie === 'systeme' ? '' : 'Aucun effet connu'}
              {!ok && ' — conditions non remplies'}
            </span>
          </button>
        );
      })}
    </Sheet>
  );
}

const TUTORIAL = [
  {
    t: 'Votre lignée',
    x: 'Vous incarnez le chef d’une maison ducale des Marches d’Aveline. À votre mort, vous continuez avec votre héritier. La partie s’arrête si votre dynastie n’a plus d’héritier titré, ou au bout de 150 ans.',
  },
  {
    t: 'Les saisons',
    x: 'Chaque tour est une saison. Réglez les événements, donnez vos ordres, puis touchez « Fin de saison ». La partie est sauvegardée à chaque fin de saison.',
  },
  {
    t: 'La cour et le royaume',
    x: 'Choisissez votre conseil et les éducateurs de vos enfants dans l’onglet Cour. Dans Royaume, construisez et ménagez vos vassaux : leur opinion règle leurs impôts et leurs levées.',
  },
  {
    t: 'La guerre',
    x: 'Une revendication permet de déclarer la guerre. Levez votre armée, déplacez-la sur la carte, assiégez. Les batailles se jouent sur trois fronts : brisez le moral adverse, ne cherchez pas à tout tuer.',
  },
  {
    t: 'Astuces',
    x: 'Un appui long sur un trait, une opinion ou un chiffre explique son détail. Touchez une ressource en haut pour voir revenus et dépenses. Bonne chance, et longue vie à votre maison !',
  },
];

function Tutorial() {
  const [i, setI] = useState(0);
  const dispatch = useStore((s) => s.dispatch);
  const c = TUTORIAL[i];
  return (
    <Sheet swapKey={String(i)}>
      <p className="small muted">
        Premiers pas · {i + 1} / {TUTORIAL.length}
      </p>
      <h2>{c.t}</h2>
      <p className="event-text">{c.x}</p>
      <div className="row" style={{ marginTop: 12 }}>
        <button className="btn ghost" onClick={() => dispatch({ type: 'dismissTutorial' })}>
          Passer
        </button>
        <button
          className="btn primary right"
          onClick={() =>
            i < TUTORIAL.length - 1 ? setI(i + 1) : dispatch({ type: 'dismissTutorial' })
          }
        >
          {i < TUTORIAL.length - 1 ? 'Suivant' : 'Commencer'}
        </button>
      </div>
    </Sheet>
  );
}

function EndScreen({ game }: { game: GameState }) {
  const quit = useStore((s) => s.quit);
  const s = game.gameOver!.score;
  const dyn = game.dynasties[game.playerDynastyId];
  return (
    <div
      className="title-screen"
      style={{ justifyContent: 'flex-start', overflowY: 'auto', height: '100%' }}
    >
      <h1>Fin de la chronique</h1>
      <p className="center event-text">{game.gameOver!.reason}</p>
      <div className="card">
        <h2>Maison {dyn?.name}</h2>
        <dl className="kv">
          <dt>Renommée</dt>
          <dd>{s.renown}</dd>
          <dt>Titres</dt>
          <dd>{s.titles}</dd>
          <dt>Années (×2)</dt>
          <dd>{s.years}</dd>
          <dt>
            <b>Score de lignée</b>
          </dt>
          <dd>
            <b>{s.total}</b>
          </dd>
        </dl>
        <p className="small muted">
          Dernier chef de maison : {displayName(game, game.characters[game.playerId])}
        </p>
      </div>
      <div className="card">
        <h3>Chronique de la dynastie</h3>
        {game.chronicle
          .filter((e) => e.kind !== 'evenement')
          .map((e, i) => (
            <p key={i} className="small">
              <b>{yearOf(game, e.turn)}</b> — {e.text}
            </p>
          ))}
      </div>
      <button className="btn" onClick={() => downloadExport(game)}>
        Exporter la chronique (JSON)
      </button>
      <button className="btn primary" style={{ marginTop: 8 }} onClick={quit}>
        Retour au menu
      </button>
    </div>
  );
}
