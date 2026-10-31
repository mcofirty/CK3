/**
 * Sons synthétisés (Web Audio, aucun fichier) et vibrations.
 * Les réglages sont gardés sur l'appareil.
 */
export type SoundId =
  'tap' | 'season' | 'event' | 'clash' | 'victory' | 'defeat' | 'achievement' | 'coin' | 'level';

export interface Settings {
  son: boolean;
  vibrations: boolean;
  /** Thème : suivre l'appareil, ou forcer clair / sombre. */
  theme: 'auto' | 'clair' | 'sombre';
  /** Animations réduites. */
  reduceMotion: boolean;
  /** Résumé des points d'attention avant de finir la saison. */
  confirmEnd: boolean;
}

const KEY = 'highborn-reglages';
export const DEFAULT_SETTINGS: Settings = {
  son: true,
  vibrations: true,
  theme: 'auto',
  reduceMotion: false,
  confirmEnd: true,
};

export function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return { ...DEFAULT_SETTINGS, ...(JSON.parse(raw) as Partial<Settings>) };
  } catch {
    /* stockage indisponible */
  }
  return { ...DEFAULT_SETTINGS };
}

/** Applique thème et animations au document. */
export function applySettings(s: Settings): void {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  root.classList.toggle('theme-light', s.theme === 'clair');
  root.classList.toggle('theme-dark', s.theme === 'sombre');
  root.classList.toggle('reduce-motion', s.reduceMotion);
  root.style.colorScheme = s.theme === 'clair' ? 'light' : s.theme === 'sombre' ? 'dark' : '';
  // Couleur de la barre d'état.
  for (const m of document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]')) {
    const light = m.media.includes('light');
    m.content =
      s.theme === 'clair'
        ? '#f1e9d8'
        : s.theme === 'sombre'
          ? '#15110e'
          : light
            ? '#f1e9d8'
            : '#15110e';
  }
}

export function saveSettings(s: Settings): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* stockage indisponible */
  }
}

let ctx: AudioContext | undefined;
function audio(): AudioContext | undefined {
  if (typeof window === 'undefined') return undefined;
  const AC =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AC) return undefined;
  ctx ??= new AC();
  if (ctx.state === 'suspended') void ctx.resume();
  return ctx;
}

/** Une note : oscillateur avec enveloppe percussive. */
function note(
  ac: AudioContext,
  freq: number,
  start: number,
  dur: number,
  type: OscillatorType = 'sine',
  gain = 0.12,
  slideTo?: number,
): void {
  const o = ac.createOscillator();
  const g = ac.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, start);
  if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, start + dur);
  g.gain.setValueAtTime(0.0001, start);
  g.gain.exponentialRampToValueAtTime(gain, start + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
  o.connect(g).connect(ac.destination);
  o.start(start);
  o.stop(start + dur + 0.05);
}

/** Bruit filtré : choc des armes. */
function noise(ac: AudioContext, start: number, dur: number, freq: number, gain = 0.2): void {
  const len = Math.floor(ac.sampleRate * dur);
  const buf = ac.createBuffer(1, len, ac.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len) ** 2;
  const src = ac.createBufferSource();
  src.buffer = buf;
  const f = ac.createBiquadFilter();
  f.type = 'bandpass';
  f.frequency.value = freq;
  f.Q.value = 0.9;
  const g = ac.createGain();
  g.gain.value = gain;
  src.connect(f).connect(g).connect(ac.destination);
  src.start(start);
}

const VIBRATIONS: Partial<Record<SoundId, number | number[]>> = {
  tap: 6,
  season: 12,
  event: [8, 40, 8],
  clash: [20, 30, 25],
  victory: [15, 50, 15, 50, 30],
  defeat: 60,
  achievement: [10, 40, 10, 40, 10],
  level: [8, 30, 12],
};

export function play(id: SoundId, settings: Settings): void {
  if (settings.vibrations && VIBRATIONS[id] !== undefined)
    (navigator as Navigator & { vibrate?: (p: number | number[]) => boolean }).vibrate?.(
      VIBRATIONS[id]!,
    );
  if (!settings.son) return;
  const ac = audio();
  if (!ac) return;
  const t = ac.currentTime + 0.01;
  switch (id) {
    case 'tap':
      note(ac, 880, t, 0.05, 'sine', 0.04, 620);
      break;
    case 'season':
      // Cloche : fondamentale et partiels.
      note(ac, 392, t, 1.6, 'sine', 0.12);
      note(ac, 784, t, 1.2, 'sine', 0.05);
      note(ac, 1176, t, 0.8, 'sine', 0.03);
      break;
    case 'event':
      note(ac, 659, t, 0.35, 'triangle', 0.08);
      note(ac, 988, t + 0.09, 0.45, 'triangle', 0.06);
      break;
    case 'clash':
      noise(ac, t, 0.18, 2400, 0.25);
      noise(ac, t + 0.07, 0.14, 1600, 0.18);
      note(ac, 110, t, 0.2, 'sine', 0.15, 60);
      break;
    case 'victory':
      [523, 659, 784, 1047].forEach((f, i) => note(ac, f, t + i * 0.11, 0.4, 'triangle', 0.09));
      break;
    case 'defeat':
      [440, 349, 294].forEach((f, i) => note(ac, f, t + i * 0.18, 0.5, 'sine', 0.08));
      break;
    case 'achievement':
      [784, 988, 1175, 1568].forEach((f, i) => note(ac, f, t + i * 0.07, 0.35, 'sine', 0.06));
      break;
    case 'coin':
      note(ac, 1319, t, 0.08, 'square', 0.025);
      note(ac, 1760, t + 0.06, 0.16, 'square', 0.025);
      break;
    case 'level':
      [523, 784, 1047].forEach((f, i) => note(ac, f, t + i * 0.08, 0.3, 'triangle', 0.07));
      break;
  }
}
