import { useEffect, useRef, useState } from 'react';
import { SEASON_NAMES } from '../data/names';
import { displayName } from '../engine/characters';
import { yearOf } from '../engine/context';
import { checkAll, effectLabels, eventDef, eventText, renderText } from '../engine/events/engine';
import { eventSubjects } from '../engine/events/subjects';
import { economyOf } from '../engine/realm';
import type { GameState } from '../engine/state';
import { listSlots, downloadExport, type Slot, type SlotInfo } from '../save/storage';
import {
  Icon,
  Logo,
  Portrait,
  Segmented,
  Sheet,
  TipLayer,
  useSlideSelect,
} from './components/common';
import { AchievementList, DynastyBook, EndingBanner } from './components/Book';
import { Inspector } from './components/Inspector';
import { TradeSheet } from './components/Diplomacy';
import { RealmSheet } from './components/RealmSheet';
import { PeaceNegotiation } from './components/Peace';
import { SettingsButton, SettingsSheet } from './components/Settings';
import { SearchSheet } from './components/Search';
import { ACHIEVEMENTS } from '../engine/endings';
import { BattleScreen } from './screens/Battle';
import { ArmyScreen } from './screens/Army';
import { CourtScreen } from './screens/Court';
import { ReignScreen } from './screens/Reign';
import { RealmScreen } from './screens/Realm';
import { WorldScreen } from './screens/World';
import { attention, tabBadges, type AttentionItem } from './attention';
import { TABS, useStore, type Tab } from './store';

export function App() {
  const game = useStore((s) => s.game);
  const error = useStore((s) => s.error);
  return (
    <>
      {game ? <Game game={game} /> : <TitleScreen />}
      {error && <div className="toast glass">{error}</div>}
      <SettingsSheet />
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
  const [showAch, setShowAch] = useState(false);
  const globalAch = useStore((s) => s.globalAchievements);
  const setSettingsOpen = useStore((s) => s.setSettingsOpen);
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
      <div className="title-gear">
        <SettingsButton />
      </div>
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
      <div className="row" style={{ gap: 8, marginTop: 4, width: '100%', maxWidth: 560 }}>
        <button className="btn grow" onClick={() => setShowAch(true)}>
          🏆 Succès ({globalAch.length}/{ACHIEVEMENTS.length})
        </button>
        <button className="btn grow" onClick={() => setSettingsOpen(true)}>
          ⚙︎ Paramètres
        </button>
      </div>
      {showAch && (
        <Sheet onClose={() => setShowAch(false)}>
          <h2>Succès</h2>
          <AchievementList unlocked={globalAch} />
        </Sheet>
      )}
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
  const [summary, setSummary] = useState<AttentionItem[] | null>(null);
  const goTo = useStore((s) => s.goTo);
  const inspect = useStore((s) => s.inspect);
  const dispatch = useStore((s) => s.dispatch);
  const confirmEnd = useStore((s) => s.settings.confirmEnd);
  if (game.gameOver) return <EndScreen game={game} />;
  const endSeason = () => {
    const items = confirmEnd ? attention(game).filter((x) => x.endSeason) : [];
    if (items.length) setSummary(items);
    else dispatch({ type: 'endSeason' });
  };
  return (
    <div className="app">
      <TopBar game={game} />
      <SwipeScreen key={tab} className={`screen enter-${tabDir}`}>
        {tab === 'regne' && <ReignScreen game={game} />}
        {tab === 'cour' && <CourtScreen game={game} />}
        {tab === 'royaume' && <RealmScreen game={game} />}
        {tab === 'armee' && <ArmyScreen game={game} />}
        {tab === 'monde' && <WorldScreen game={game} />}
      </SwipeScreen>
      <EndSeasonBar game={game} onEndSeason={endSeason} />
      <TabBar game={game} />
      {game.phase !== 'bataille' && <OutcomeToast outcome={game.lastOutcome} />}
      {game.pendingEvents.length > 0 && game.tutorialSeen && game.phase !== 'bataille' && (
        <EventModal game={game} />
      )}
      <AchievementToast />
      {summary && (
        <Sheet onClose={() => setSummary(null)}>
          <h2>Avant de finir la saison</h2>
          {summary.map((s, i) => (
            <div key={i} className="attention-item">
              <p>• {s.text}</p>
              <button
                className="btn small"
                onClick={() => {
                  setSummary(null);
                  if ('inspect' in s.go) inspect(s.go.inspect);
                  else goTo(s.go.tab, s.go.view, s.go.anchor);
                }}
              >
                {s.label} ›
              </button>
            </div>
          ))}
          <div className="row" style={{ marginTop: 12 }}>
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
      <RealmSheet game={game} />
      <Inspector game={game} />
      <TradeSheet game={game} />
      {!game.tutorialSeen && <Tutorial />}
      {game.phase === 'bataille' && game.battle && <BattleScreen game={game} />}
    </div>
  );
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
        // Rien ne glisse sous une fenêtre ouverte.
        if (t.closest('.overlay')) return;
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

/** Bandeau : succès débloqué. */
function AchievementToast() {
  const toast = useStore((s) => s.achievementToast);
  const [shown, setShown] = useState<string | undefined>(undefined);
  useEffect(() => {
    if (!toast) return;
    setShown(toast.id);
    const t = setTimeout(() => setShown(undefined), 4000);
    return () => clearTimeout(t);
  }, [toast]);
  const a = ACHIEVEMENTS.find((x) => x.id === shown);
  if (!a) return null;
  return (
    <div className="toast glass achievement-toast" onClick={() => setShown(undefined)}>
      <span className="ach-icon">{a.icon}</span>
      <div>
        <div className="small muted">Succès débloqué</div>
        <b>{a.name}</b>
      </div>
    </div>
  );
}

/** Bandeau : issue d'un tirage au sort dans un événement. */
function OutcomeToast({ outcome }: { outcome?: GameState['lastOutcome'] }) {
  const [shown, setShown] = useState<typeof outcome>(undefined);
  // Chaque action clone l'état : on compare l'identifiant du tirage, pas la référence.
  const key = outcome ? `${outcome.id ?? 0}|${outcome.text}` : '';
  const last = useRef(key);
  useEffect(() => {
    if (!outcome || key === last.current) return;
    last.current = key;
    setShown(outcome);
    const t = setTimeout(() => setShown(undefined), 3600);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
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

const compact = (n: number) => {
  const a = Math.abs(n);
  if (a >= 9950) return `${Math.round(n / 1000)}k`;
  if (a >= 1000) return `${(n / 1000).toFixed(1).replace('.', ',')}k`;
  return String(Math.round(n));
};

function TopBar({ game }: { game: GameState }) {
  const p = game.characters[game.playerId];
  const [detail, setDetail] = useState<'gold' | 'prestige' | 'piety' | null>(null);
  const [debug, setDebug] = useState(false);
  const [search, setSearch] = useState(false);
  const saving = useStore((s) => s.saving);
  const lines = detail ? game.ledger[detail] : [];
  const labels = { gold: 'Or', prestige: 'Prestige', piety: 'Piété' };
  const net = Math.round(economyOf(game, game.playerId).goldNet);
  return (
    <>
      <header className="topbar glass">
        <SettingsButton onLong={() => setDebug(true)} />
        <span className="title" aria-label="Highborn" onContextMenu={(e) => e.preventDefault()}>
          <LongPressTitle onLong={() => setDebug(true)} />
        </span>
        <button className="search-btn" aria-label="Rechercher" onClick={() => setSearch(true)}>
          <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
            <circle cx="10.5" cy="10.5" r="6.5" fill="none" stroke="currentColor" strokeWidth="2" />
            <path
              d="M15.5 15.5 21 21"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            />
          </svg>
        </button>
        <span className="topbar-season">
          <b>{SEASON_NAMES[game.turn % 4]}</b>
          <span>
            {yearOf(game)}
            {saving ? ' ·' : ''}
          </span>
        </span>
        <button className="res" onClick={() => setDetail('gold')} aria-label="Or : détail">
          <span className="res-v">
            <span className="dot" style={{ background: 'var(--gold)' }} />
            {compact(p.gold)}
          </span>
          <span className="res-l">
            or{' '}
            <b className={net >= 0 ? 'good' : 'bad'}>
              {net >= 0 ? '+' : '−'}
              {Math.abs(net)}
            </b>
          </span>
        </button>
        <button
          className="res"
          onClick={() => setDetail('prestige')}
          aria-label="Prestige : détail"
        >
          <span className="res-v">
            <span
              className="dot"
              style={{ background: 'var(--accent)', borderRadius: 2, transform: 'rotate(45deg)' }}
            />
            {compact(p.prestige)}
          </span>
          <span className="res-l">prestige</span>
        </button>
        <button className="res" onClick={() => setDetail('piety')} aria-label="Piété : détail">
          <span className="res-v">
            <span className="dot" style={{ background: 'var(--good)' }} />
            {compact(p.piety)}
          </span>
          <span className="res-l">piété</span>
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
      {search && <SearchSheet game={game} onClose={() => setSearch(false)} />}
    </>
  );
}

/** Bande « Fin de saison », pleine largeur, juste au-dessus des onglets (à portée du pouce). */
function EndSeasonBar({ game, onEndSeason }: { game: GameState; onEndSeason: () => void }) {
  const pending = game.pendingEvents.length;
  const next = SEASON_NAMES[(game.turn + 1) % 4].toLowerCase();
  const toward = /^[aeéiouh]/.test(next) ? `vers l’${next}` : `vers le ${next}`;
  return (
    <button
      className="endbar"
      onClick={onEndSeason}
      disabled={pending > 0}
      aria-label="Fin de saison"
    >
      <span className="endbar-main">
        {pending > 0 ? `${pending} événement${pending > 1 ? 's' : ''} à régler` : 'Fin de saison'}
      </span>
      <span className="endbar-sub">{pending > 0 ? 'avant de finir la saison' : `${toward} ›`}</span>
    </button>
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

function TabBar({ game }: { game: GameState }) {
  const tab = useStore((s) => s.tab);
  const setTab = useStore((s) => s.setTab);
  const labels: Record<Tab, string> = {
    regne: 'Règne',
    cour: 'Cour',
    royaume: 'Royaume',
    armee: 'Armée',
    monde: 'Monde',
  };
  const badges = tabBadges(game);
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
      {TABS.map((id) => {
        const b = badges[id];
        return (
          <button
            key={id}
            className={tab === id ? 'active' : ''}
            aria-current={tab === id ? 'page' : undefined}
            aria-label={b ? `${labels[id]} (à voir)` : labels[id]}
            onClick={() => setTab(id)}
          >
            {Icon[id]}
            {labels[id]}
            {b !== undefined && (
              <span className={`tab-badge${b === 'dot' ? ' dot' : ''}`} aria-hidden>
                {b === 'dot' ? '' : b > 9 ? '9+' : b}
              </span>
            )}
          </button>
        );
      })}
    </nav>
  );
}

/** Personnes et comtés concernés : un appui ouvre leur fiche par-dessus l'événement. */
function EventSubjects({
  game,
  subjects,
}: {
  game: GameState;
  subjects: ReturnType<typeof eventSubjects>;
}) {
  const inspect = useStore((s) => s.inspect);
  if (!subjects.length) return null;
  return (
    <div className="event-subjects" data-noswipe>
      {subjects.slice(0, 6).map((x) => {
        const c = x.kind === 'perso' ? game.characters[x.id] : undefined;
        const k = x.kind === 'comte' ? game.counties[x.id] : undefined;
        return (
          <button
            key={x.id}
            className="event-subject"
            onClick={() => inspect({ kind: x.kind, id: x.id })}
            aria-label={`Voir la fiche de ${c ? c.name : (k?.name ?? '')}`}
          >
            {c ? (
              <Portrait state={game} c={c} size={36} />
            ) : (
              <span className="event-subject-county" aria-hidden>
                ⛫
              </span>
            )}
            <span className="event-subject-text">
              <b>{c ? displayName(game, c) : k?.name}</b>
              <span className="tiny muted">{x.role ?? (c ? 'Fiche' : 'Comté')} ›</span>
            </span>
          </button>
        );
      })}
    </div>
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
      <EventSubjects game={game} subjects={eventSubjects(game, def, inst.scope)} />
      {inst.peace && game.wars[inst.peace.terms.warId] && (
        <PeaceNegotiation
          game={game}
          warId={inst.peace.terms.warId}
          initial={inst.peace.terms}
          incoming={{ uid: inst.uid }}
        />
      )}
      {!(inst.peace && game.wars[inst.peace.terms.warId]) &&
        def.choix.map((c, i) => {
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
                {fx.length
                  ? fx.join(' · ')
                  : def.categorie === 'systeme'
                    ? ''
                    : 'Aucun effet connu'}
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
    x: 'Chaque tour est une saison. Réglez les événements, donnez vos ordres, puis touchez « Fin de saison », en bas de l’écran. La partie est sauvegardée à chaque fin de saison.',
  },
  {
    t: 'Les onglets',
    x: 'Règne résume la saison et liste ce qui demande votre attention. Cour : votre souverain, votre maison, le conseil et les courtisans. Royaume : la carte, vos terres et vassaux, le trésor, les lois. Armée : troupes et guerres. Monde : les cours voisines, les complots et les nouvelles.',
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
      <EndingBanner game={game} />
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
      <h3 style={{ alignSelf: 'flex-start' }}>Livre de la dynastie</h3>
      <DynastyBook game={game} />
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
