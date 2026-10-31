/** Sauvegarde dans IndexedDB (idb-keyval) : 3 emplacements, export et import JSON. */
import { del, get, set } from 'idb-keyval';
import { displayName } from '../engine/characters';
import { yearOf } from '../engine/context';
import { SEASON_NAMES } from '../data/names';
import type { GameState } from '../engine/state';
import { migrate } from './migrations';

export const SLOTS = [1, 2, 3] as const;
export type Slot = (typeof SLOTS)[number];

export interface SlotInfo {
  slot: Slot;
  empty: boolean;
  label?: string;
  date?: string;
  savedAt?: number;
}

const key = (slot: Slot) => `lignees-save-${slot}`;
const metaKey = (slot: Slot) => `lignees-meta-${slot}`;
const LAST_SLOT = 'lignees-last-slot';

export function describe(state: GameState): string {
  const p = state.characters[state.playerId];
  return `${displayName(state, p)} — ${SEASON_NAMES[state.turn % 4]} ${yearOf(state)}`;
}

export async function saveGame(slot: Slot, state: GameState): Promise<void> {
  await set(key(slot), state);
  await set(metaKey(slot), { label: describe(state), savedAt: Date.now() });
  await set(LAST_SLOT, slot);
}

export async function loadGame(slot: Slot): Promise<GameState | undefined> {
  const raw = await get(key(slot));
  return raw ? migrate(raw) : undefined;
}

export async function deleteGame(slot: Slot): Promise<void> {
  await del(key(slot));
  await del(metaKey(slot));
}

export async function listSlots(): Promise<SlotInfo[]> {
  return Promise.all(
    SLOTS.map(async (slot) => {
      const meta = (await get(metaKey(slot))) as { label: string; savedAt: number } | undefined;
      if (!meta) return { slot, empty: true };
      return { slot, empty: false, label: meta.label, savedAt: meta.savedAt, date: new Date(meta.savedAt).toLocaleString('fr-FR') };
    }),
  );
}

export async function lastSlot(): Promise<Slot | undefined> {
  return (await get(LAST_SLOT)) as Slot | undefined;
}

/** Sérialise une partie pour l'export. */
export function exportJson(state: GameState): string {
  return JSON.stringify({ app: 'lignees', exportedAt: new Date().toISOString(), state });
}

/** Lit un fichier exporté (ou une sauvegarde brute) et le migre. */
export function importJson(text: string): GameState {
  const data = JSON.parse(text) as { app?: string; state?: unknown };
  return migrate(data.app === 'lignees' ? data.state : data);
}

export function downloadExport(state: GameState): void {
  const blob = new Blob([exportJson(state)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const p = state.characters[state.playerId];
  a.href = url;
  a.download = `lignees-${p.name.toLowerCase()}-${yearOf(state)}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
