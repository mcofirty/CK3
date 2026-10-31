/** Store Zustand : unique pont entre l'interface et le moteur. L'interface n'écrit jamais l'état. */
import { create } from 'zustand';
import { applyAction, type Action } from '../engine/actions';
import type { GameState } from '../engine/state';
import { newGame, type NewGameOptions } from '../engine/world';
import { importJson, lastSlot, loadGame, saveGame, type Slot } from '../save/storage';

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
}

let saveTimer: ReturnType<typeof setTimeout> | undefined;

export const useStore = create<Store>((set, get) => ({
  game: null,
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
