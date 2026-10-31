/** Store Zustand : unique pont entre l'interface et le moteur. L'interface n'écrit jamais l'état. */
import { create } from 'zustand';
import { applyAction, type Action } from '../engine/actions';
import type { GameState } from '../engine/state';
import { newGame, type NewGameOptions } from '../engine/world';
import { importJson, lastSlot, loadGame, saveGame, type Slot } from '../save/storage';
import { loadSettings, play, saveSettings, type Settings, type SoundId } from './sound';

const ACH_KEY = 'highborn-succes';
function loadAchievements(): string[] {
  try {
    return JSON.parse(localStorage.getItem(ACH_KEY) ?? '[]') as string[];
  } catch {
    return [];
  }
}

export type Tab = 'cour' | 'royaume' | 'armee' | 'intrigues' | 'chronique';
export const TABS: Tab[] = ['cour', 'royaume', 'armee', 'intrigues', 'chronique'];

/** Élément inspecté (fiche détaillée). */
export type Inspected = { kind: 'perso' | 'comte' | 'armee'; id: string };

interface Store {
  game: GameState | null;
  slot: Slot;
  tab: Tab;
  /** Sens de la dernière navigation entre onglets (pour la transition). */
  tabDir: 'left' | 'right' | 'none';
  /** Comté sélectionné sur la carte. */
  selectedCounty?: string;
  error?: string;
  saving: boolean;
  dispatch: (a: Action) => void;
  setTab: (t: Tab) => void;
  selectCounty: (id?: string) => void;
  /** Pile de fiches ouvertes : la dernière est affichée, « Retour » revient à la précédente. */
  inspectStack: Inspected[];
  /** Sous-vues de l'écran courant (glisser d'une sous-vue à l'autre). */
  pager?: { index: number; count: number; go: (i: number) => void };
  setPager: (p?: { index: number; count: number; go: (i: number) => void }) => void;
  inspect: (i: Inspected) => void;
  inspectBack: () => void;
  inspectClose: () => void;
  start: (slot: Slot, opts: NewGameOptions) => Promise<void>;
  load: (slot: Slot) => Promise<void>;
  importText: (slot: Slot, text: string) => Promise<void>;
  quit: () => void;
  saveNow: () => Promise<void>;
  resume: () => Promise<boolean>;
  /** Son et vibrations. */
  settings: Settings;
  setSettings: (s: Partial<Settings>) => void;
  sound: (id: SoundId) => void;
  /** Succès débloqués sur cet appareil, toutes parties confondues. */
  globalAchievements: string[];
  /** Dernier succès débloqué (bandeau). */
  achievementToast?: { id: string; n: number };
}

/** Retour sonore et tactile d'une action. */
function feedback(prev: GameState, next: GameState, a: Action): SoundId | undefined {
  if ((next.achievements?.length ?? 0) > (prev.achievements?.length ?? 0)) return 'achievement';
  const pb = prev.battle;
  const nb = next.battle;
  if (nb?.phase === 'fin' && pb?.phase !== 'fin') {
    const won = nb.result && nb.playerSide && nb.result.winner === nb.playerSide;
    return won ? 'victory' : 'defeat';
  }
  if (a.type === 'battleRound' || a.type === 'battleStart' || a.type === 'battleDuel')
    return 'clash';
  if ((a.type === 'takePerk' || a.type === 'takeLegacy') && next !== prev) return 'level';
  if (next.turn !== prev.turn) return 'season';
  if (next.pendingEvents.length > prev.pendingEvents.length) return 'event';
  const pg = prev.characters[prev.playerId]?.gold ?? 0;
  const ng = next.characters[next.playerId]?.gold ?? 0;
  if (ng < pg - 0.5) return 'coin';
  return undefined;
}

let saveTimer: ReturnType<typeof setTimeout> | undefined;

export const useStore = create<Store>((set, get) => ({
  game: null,
  settings: loadSettings(),
  globalAchievements: loadAchievements(),
  setSettings: (p) => {
    const settings = { ...get().settings, ...p };
    saveSettings(settings);
    set({ settings });
  },
  sound: (id) => play(id, get().settings),
  slot: 1,
  tab: 'cour',
  tabDir: 'none',
  saving: false,
  dispatch: (a) => {
    const g = get().game;
    if (!g) return;
    try {
      const next = applyAction(g, a);
      set({ game: next, error: undefined });
      const fx = feedback(g, next, a);
      if (fx) play(fx, get().settings);
      // Succès : gardés sur l'appareil, au-delà de la partie.
      const fresh = (next.achievements ?? []).filter((x) => !(g.achievements ?? []).includes(x));
      if (fresh.length) {
        const all = [...new Set([...get().globalAchievements, ...fresh])];
        try {
          localStorage.setItem(ACH_KEY, JSON.stringify(all));
        } catch {
          /* stockage indisponible */
        }
        set({
          globalAchievements: all,
          achievementToast: {
            id: fresh[fresh.length - 1],
            n: (get().achievementToast?.n ?? 0) + 1,
          },
        });
      }
      // Sauvegarde automatique à chaque fin de saison, et peu après toute autre action.
      if (next.turn !== g.turn || next.gameOver !== g.gameOver) void get().saveNow();
      else {
        clearTimeout(saveTimer);
        saveTimer = setTimeout(() => void get().saveNow(), 1500);
      }
    } catch (e) {
      console.warn(e);
      set({ error: 'Une erreur est survenue ; la partie est intacte.' });
    }
  },
  setTab: (tab) => {
    const cur = TABS.indexOf(get().tab);
    const next = TABS.indexOf(tab);
    if (cur === next) return;
    play('tap', get().settings);
    set({ tab, tabDir: next > cur ? 'right' : 'left' });
  },
  selectCounty: (selectedCounty) => set({ selectedCounty }),
  inspectStack: [],
  pager: undefined,
  setPager: (pager) => set({ pager }),
  inspect: (i) => {
    const st = get().inspectStack;
    const top = st[st.length - 1];
    if (top && top.kind === i.kind && top.id === i.id) return;
    set({
      inspectStack: [...st, i].slice(-12),
      selectedCounty: i.kind === 'comte' ? i.id : get().selectedCounty,
    });
  },
  inspectBack: () => {
    const st = get().inspectStack.slice(0, -1);
    const top = st[st.length - 1];
    set({ inspectStack: st, selectedCounty: top?.kind === 'comte' ? top.id : undefined });
  },
  inspectClose: () => set({ inspectStack: [], selectedCounty: undefined }),
  start: async (slot, opts) => {
    const game = newGame(opts);
    set({ game, slot, tab: 'cour', tabDir: 'none', selectedCounty: undefined });
    await saveGame(slot, game);
  },
  load: async (slot) => {
    try {
      const game = await loadGame(slot);
      if (game)
        set({
          game,
          slot,
          tab: 'cour',
          tabDir: 'none',
          selectedCounty: undefined,
          error: undefined,
        });
    } catch (e) {
      set({ error: e instanceof Error ? e.message : 'Sauvegarde illisible' });
    }
  },
  importText: async (slot, text) => {
    try {
      const game = importJson(text);
      set({ game, slot, tab: 'cour', tabDir: 'none', error: undefined });
      await saveGame(slot, game);
    } catch (e) {
      set({ error: e instanceof Error ? `Import impossible : ${e.message}` : 'Import impossible' });
    }
  },
  quit: () => {
    void get().saveNow();
    set({ game: null, inspectStack: [] });
  },
  saveNow: async () => {
    const { game, slot } = get();
    if (!game) return;
    clearTimeout(saveTimer);
    set({ saving: true });
    try {
      await saveGame(slot, game);
    } finally {
      set({ saving: false });
    }
  },
  resume: async () => {
    const slot = await lastSlot();
    if (!slot) return false;
    await get().load(slot);
    return !!get().game;
  },
}));

// Sauvegarde quand l'application passe en arrière-plan.
if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') void useStore.getState().saveNow();
  });
}
