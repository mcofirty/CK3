import { useEffect, useRef, useState, type ReactNode } from 'react';
import { TRAITS } from '../../data/traits';
import { ageOf, displayName, opinionOf, skillsOf } from '../../engine/characters';
import { Rng } from '../../engine/rng';
import { SKILL_KEYS, SKILL_LABELS, type Character, type GameState } from '../../engine/state';

// ---------------------------------------------------------------------------
// Infobulles : appui long (mobile) ou survol (bureau)
// ---------------------------------------------------------------------------

let showTip: ((t: { text: ReactNode; x: number; y: number } | null) => void) | null = null;

export function TipLayer() {
  const [tip, setTip] = useState<{ text: ReactNode; x: number; y: number } | null>(null);
  useEffect(() => {
    showTip = setTip;
    return () => {
      showTip = null;
    };
  }, []);
  if (!tip) return null;
  const left = Math.max(8, Math.min(window.innerWidth - 308, tip.x - 150));
  const top = tip.y > window.innerHeight / 2 ? undefined : tip.y + 24;
  const bottom = tip.y > window.innerHeight / 2 ? window.innerHeight - tip.y + 16 : undefined;
  return (
    <div className="tip" style={{ left, top, bottom }}>
      {tip.text}
    </div>
  );
}

/** Enveloppe un élément : un appui long affiche l'infobulle. */
export function Tip({
  text,
  children,
  onTap,
}: {
  text: ReactNode;
  children: ReactNode;
  onTap?: () => void;
}) {
  const timer = useRef<ReturnType<typeof setTimeout>>();
  const long = useRef(false);
  const start = (x: number, y: number) => {
    long.current = false;
    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      long.current = true;
      showTip?.({ text, x, y });
      navigator.vibrate?.(10);
    }, 380);
  };
  const end = () => {
    clearTimeout(timer.current);
    if (long.current) setTimeout(() => showTip?.(null), 1600);
  };
  return (
    <span
      style={{ display: 'inline-flex' }}
      onPointerDown={(e) => start(e.clientX, e.clientY)}
      onPointerUp={end}
      onPointerCancel={end}
      onPointerEnter={(e) =>
        e.pointerType === 'mouse' && showTip?.({ text, x: e.clientX, y: e.clientY })
      }
      onPointerOut={(e) => e.pointerType === 'mouse' && showTip?.(null)}
      onClick={() => {
        if (!long.current) onTap?.();
      }}
      onContextMenu={(e) => e.preventDefault()}
    >
      {children}
    </span>
  );
}

export function Sheet({ children, onClose }: { children: ReactNode; onClose?: () => void }) {
  return (
    <div className="overlay" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <div className="handle" />
        {children}
      </div>
    </div>
  );
}

export function Bar({ value, max, color }: { value: number; max: number; color: string }) {
  const pct = Math.max(0, Math.min(100, (value / Math.max(1, max)) * 100));
  return (
    <div className="bar">
      <div style={{ width: `${pct}%`, background: color }} />
    </div>
  );
}

export function signed(n: number): string {
  const r = Math.round(n);
  return r > 0 ? `+${r}` : `${r}`;
}

// ---------------------------------------------------------------------------
// Traits, compétences, opinion
// ---------------------------------------------------------------------------

export function TraitChips({ c }: { c: Character }) {
  return (
    <div className="row wrap" style={{ gap: 0 }}>
      {c.traits.map((t) => {
        const d = TRAITS[t];
        if (!d) return null;
        const cls =
          d.category === 'education'
            ? 'edu'
            : d.category === 'hereditaire'
              ? 'her'
              : d.category === 'acquis'
                ? 'acq'
                : '';
        const mods = Object.entries(d.skills ?? {})
          .map(([k, v]) => `${SKILL_LABELS[k as keyof typeof SKILL_LABELS]} ${signed(v as number)}`)
          .join(', ');
        return (
          <Tip
            key={t}
            text={
              <>
                <b>{d.name}</b>
                <br />
                {d.description}
                {mods && (
                  <>
                    <br />
                    {mods}
                  </>
                )}
                {d.health ? (
                  <>
                    <br />
                    Santé {signed(d.health)}
                  </>
                ) : null}
                {d.vassalOpinion ? (
                  <>
                    <br />
                    Opinion des vassaux {signed(d.vassalOpinion)}
                  </>
                ) : null}
              </>
            }
          >
            <span className={`chip ${cls}`}>{d.name}</span>
          </Tip>
        );
      })}
    </div>
  );
}

export function Skills({ c }: { c: Character }) {
  const s = skillsOf(c);
  return (
    <div className="skills">
      {SKILL_KEYS.map((k) => (
        <div key={k}>
          <b>{s[k]}</b>
          <span>{SKILL_LABELS[k].slice(0, 5)}.</span>
        </div>
      ))}
    </div>
  );
}

export function Opinion({ state, from, to }: { state: GameState; from: string; to: string }) {
  const o = opinionOf(state, from, to);
  return (
    <Tip
      text={
        <>
          <b>Opinion : {signed(o.total)}</b>
          {o.reasons.map((r, i) => (
            <div key={i}>
              {r.label} : {signed(r.value)}
            </div>
          ))}
        </>
      }
    >
      <span className={`chip ${o.total >= 0 ? 'good' : 'bad'}`} style={{ fontWeight: 700 }}>
        {signed(o.total)}
      </span>
    </Tip>
  );
}

// ---------------------------------------------------------------------------
// Blasons et portraits procéduraux
// ---------------------------------------------------------------------------

const TINCTURES = [
  '#b3261e',
  '#1f4e8c',
  '#2f6b2f',
  '#5b2a7a',
  '#1b1b1b',
  '#c99a1d',
  '#e8e2d0',
  '#a4581c',
];
const METALS = ['#d9b23a', '#ece6d6'];

export function CoatOfArms({ seed, size = 40 }: { seed: number; size?: number }) {
  const r = new Rng(seed);
  const field = r.pick(TINCTURES.slice(0, 6));
  const metal = r.pick(METALS);
  const div = r.int(0, 5);
  const charge = r.int(0, 4);
  const shield = 'M5 4 H55 V30 C55 50 40 60 30 66 C20 60 5 50 5 30 Z';
  return (
    <svg width={size} height={size * 1.15} viewBox="0 0 60 70" aria-hidden>
      <defs>
        <clipPath id={`s${seed}`}>
          <path d={shield} />
        </clipPath>
      </defs>
      <g clipPath={`url(#s${seed})`}>
        <rect width="60" height="70" fill={field} />
        {div === 1 && <rect x="30" width="30" height="70" fill={metal} />}
        {div === 2 && <rect y="30" width="60" height="40" fill={metal} />}
        {div === 3 && <polygon points="0,0 22,0 60,48 60,70 38,70 0,22" fill={metal} />}
        {div === 4 && <polygon points="0,52 30,22 60,52 60,64 30,34 0,64" fill={metal} />}
        {div === 5 && (
          <>
            <rect width="30" height="33" fill={metal} />
            <rect x="30" y="33" width="30" height="37" fill={metal} />
          </>
        )}
        {div === 0 && <rect y="20" width="60" height="12" fill={metal} />}
      </g>
      <g
        fill={div === 0 || div === 3 ? metal : field}
        stroke={div === 0 || div === 3 ? field : metal}
        strokeWidth="1.5"
      >
        {charge === 0 && <circle cx="30" cy="34" r="8" />}
        {charge === 1 && (
          <polygon points="30,22 33,31 43,31 35,37 38,46 30,40 22,46 25,37 17,31 27,31" />
        )}
        {charge === 2 && <path d="M27 22 h6 v9 h9 v6 h-9 v12 h-6 v-12 h-9 v-6 h9 z" />}
        {charge === 3 && <path d="M38 26 a12 12 0 1 0 0 18 a9 9 0 1 1 0 -18 z" />}
        {charge === 4 && <path d="M22 44 v-14 l4 4 l4 -8 l4 8 l4 -4 v14 z" />}
      </g>
      <path d={shield} fill="none" stroke="rgba(0,0,0,0.5)" strokeWidth="2" />
    </svg>
  );
}

const SKINS = ['#f1d3b8', '#e3b994', '#c99470', '#a8754f', '#7d5236'];
const HAIRS = ['#2b1d12', '#5a3a1e', '#8a5a2b', '#c08a3e', '#d9c08a', '#6b2d1a'];

export function Portrait({
  state,
  c,
  size = 56,
}: {
  state: GameState;
  c: Character;
  size?: number;
}) {
  const r = new Rng(c.seed);
  const skin = r.pick(SKINS);
  let hair = r.pick(HAIRS);
  const age = ageOf(state, c);
  if (age > 55) hair = '#bdb6aa';
  else if (age > 45 && r.chance(0.5)) hair = '#8c847a';
  const dyn = c.dynastyId ? state.dynasties[c.dynastyId] : undefined;
  const bg = dyn ? TINCTURES[new Rng(dyn.seed).int(0, 5)] : '#7a6a58';
  const clothes = r.pick(['#6b1f1a', '#1f3f6b', '#2f5a2f', '#4a2a5b', '#5b4a2a']);
  const ruler = Object.values(state.counties).some((k) => k.holderId === c.id);
  const child = age < 16;
  const scale = child ? 0.82 : 1;
  const beard = !c.female && age >= 18 && r.chance(0.55);
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      style={{ borderRadius: 12, flexShrink: 0, opacity: c.alive ? 1 : 0.55 }}
      aria-hidden
    >
      <rect width="64" height="64" fill={bg} opacity="0.85" />
      <g transform={`translate(${32 - 32 * scale} ${64 - 64 * scale}) scale(${scale})`}>
        <path d="M10 64 C12 46 22 42 32 42 C42 42 52 46 54 64 Z" fill={clothes} />
        {c.female && <path d="M17 44 C14 30 16 14 32 13 C48 14 50 30 47 44 Z" fill={hair} />}
        <ellipse cx="32" cy="30" rx="11" ry="13" fill={skin} />
        <path
          d={
            c.female
              ? 'M21 28 C21 17 26 14 32 14 C38 14 43 17 43 28 C40 22 36 20 32 20 C28 20 24 22 21 28 Z'
              : 'M21 27 C20 18 25 15 32 15 C39 15 44 18 43 27 C41 21 37 20 32 20 C27 20 23 21 21 27 Z'
          }
          fill={hair}
        />
        {beard && (
          <path d="M22 32 C23 43 28 46 32 46 C36 46 41 43 42 32 C39 38 25 38 22 32 Z" fill={hair} />
        )}
        <circle cx="28" cy="30" r="1.3" fill="#2a2118" />
        <circle cx="36" cy="30" r="1.3" fill="#2a2118" />
        {ruler && (
          <path
            d="M22 14 L24 6 L28 11 L32 4 L36 11 L40 6 L42 14 Z"
            fill="#e0b443"
            stroke="#8a6a14"
            strokeWidth="1"
          />
        )}
      </g>
      {!c.alive && <line x1="4" y1="60" x2="60" y2="4" stroke="rgba(0,0,0,0.5)" strokeWidth="3" />}
    </svg>
  );
}

export function CharLine({
  state,
  c,
  extra,
  onTap,
}: {
  state: GameState;
  c: Character;
  extra?: ReactNode;
  onTap?: () => void;
}) {
  return (
    <div className="list-item" onClick={onTap} style={{ cursor: onTap ? 'pointer' : undefined }}>
      <Portrait state={state} c={c} size={44} />
      <div className="grow">
        <div className="ellipsis" style={{ fontWeight: 600 }}>
          {displayName(state, c)}
        </div>
        <div className="small muted">
          {c.alive ? `${ageOf(state, c)} ans` : `† ${ageOf(state, c)} ans`}
          {extra ? <> · {extra}</> : null}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Icônes
// ---------------------------------------------------------------------------

export const Icon = {
  cour: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M4 18h16l-1-9-4 3-3-6-3 6-4-3z" />
      <path d="M4 21h16" />
    </svg>
  ),
  royaume: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M3 6l6-2 6 2 6-2v14l-6 2-6-2-6 2z" />
      <path d="M9 4v14M15 6v14" />
    </svg>
  ),
  armee: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M5 19L19 5M15 5h4v4" />
      <path d="M19 19L5 5M5 9V5h4" />
    </svg>
  ),
  intrigues: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  ),
  chronique: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M5 4h11a3 3 0 013 3v13H8a3 3 0 01-3-3z" />
      <path d="M9 8h6M9 12h6" />
    </svg>
  ),
};
