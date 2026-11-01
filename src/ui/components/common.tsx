import { useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { TRAITS } from '../../data/traits';
import { ageOf, displayName, opinionOf, skillsOf } from '../../engine/characters';
import { Rng } from '../../engine/rng';
import { SKILL_KEYS, SKILL_LABELS, type Character, type GameState } from '../../engine/state';
import { useStore } from '../store';

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
  // Hauteur du cadre de l'app (#root), qui peut dépasser la fenêtre annoncée sur iPhone.
  const h = document.getElementById('root')?.clientHeight ?? window.innerHeight;
  const top = tip.y > h / 2 ? undefined : tip.y + 24;
  const bottom = tip.y > h / 2 ? h - tip.y + 16 : undefined;
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

/**
 * Feuille modale en verre : entrée en ressort, sortie animée, glisser vers le bas pour fermer
 * (depuis la poignée). Sans onClose, la feuille est bloquante (événements, tutoriel).
 */
export function Sheet({
  children,
  onClose,
  swapKey,
}: {
  children: ReactNode;
  onClose?: () => void;
  /** Change à chaque nouveau contenu : le contenu glisse en place. */
  swapKey?: string;
}) {
  const [closing, setClosing] = useState(false);
  const [dragged, setDragged] = useState(false);
  const sheetRef = useRef<HTMLDivElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<() => void>(() => {});
  const close = (fromDrag = false) => {
    if (!onClose || closing) return;
    setDragged(fromDrag);
    setClosing(true);
    setTimeout(onClose, 220);
  };
  closeRef.current = () => close(true);
  const closable = !!onClose;

  // Glisser vers le bas pour fermer : depuis la poignée, ou depuis n'importe où dans la
  // fenêtre quand son contenu est déjà en haut (comme les fiches natives d'iOS).
  useEffect(() => {
    const el = sheetRef.current;
    if (!el || !closable) return;
    let g: {
      x: number;
      y: number;
      active: boolean;
      blocked: boolean;
      fromHandle: boolean;
      lastY: number;
      lastT: number;
      v: number;
    } | null = null;
    /** Un ascendant défilant (dans la fenêtre) n'est pas en haut ? */
    const scrolledInside = (t: HTMLElement | null): boolean => {
      for (let n = t; n && n !== el.parentElement; n = n.parentElement)
        if (n.scrollTop > 0 && n.scrollHeight > n.clientHeight) return true;
      return false;
    };
    const setY = (d: number) => {
      el.style.transform = d ? `translateY(${d}px)` : '';
      const ov = overlayRef.current;
      if (ov)
        ov.style.backgroundColor =
          d > 0 ? `rgba(25, 12, 6, ${0.36 * Math.max(0, 1 - d / 500)})` : '';
    };
    const begin = (x: number, y: number, target: EventTarget | null) => {
      const t = target as HTMLElement | null;
      const fromHandle = !!t?.closest('.handle-zone');
      const blocked =
        !fromHandle &&
        (scrolledInside(t) || !!t?.closest('[data-noswipe], input, textarea, select'));
      g = { x, y, active: false, blocked, fromHandle, lastY: y, lastT: performance.now(), v: 0 };
    };
    const move = (x: number, y: number, e: Event) => {
      if (!g || g.blocked) return;
      const dy = y - g.y;
      const dx = x - g.x;
      if (!g.active) {
        if (
          dy > 8 &&
          dy > Math.abs(dx) * 1.2 &&
          (g.fromHandle || !scrolledInside(e.target as HTMLElement))
        ) {
          g.active = true;
          el.classList.add('dragging');
          el.classList.remove('settle');
        } else if (Math.abs(dx) > 10 || dy < -8) {
          // Défilement normal ou geste horizontal : on laisse faire.
          g.blocked = !g.fromHandle;
          return;
        } else return;
      }
      if (e.cancelable) e.preventDefault();
      const now = performance.now();
      g.v = (y - g.lastY) / Math.max(1, now - g.lastT);
      g.lastY = y;
      g.lastT = now;
      setY(dy > 0 ? dy - 8 : dy / 4);
    };
    const end = (y: number) => {
      const s = g;
      g = null;
      if (!s?.active) return;
      el.classList.remove('dragging');
      const dy = y - s.y;
      if (dy > 110 || (dy > 30 && s.v > 0.45)) {
        el.style.transition = 'transform 220ms cubic-bezier(0.4, 0, 1, 1)';
        el.style.transform = 'translateY(110%)';
        closeRef.current();
      } else {
        el.classList.add('settle');
        setY(0);
      }
    };
    const ts = (e: TouchEvent) => {
      if (e.touches.length !== 1) {
        g = null;
        return;
      }
      begin(e.touches[0].clientX, e.touches[0].clientY, e.target);
    };
    const tm = (e: TouchEvent) => move(e.touches[0].clientX, e.touches[0].clientY, e);
    const te = (e: TouchEvent) => end(e.changedTouches[0]?.clientY ?? 0);
    // Souris (ordinateur) : seulement depuis la poignée.
    let mouse = false;
    const md = (e: PointerEvent) => {
      if (e.pointerType !== 'mouse' || !(e.target as HTMLElement).closest('.handle-zone')) return;
      mouse = true;
      begin(e.clientX, e.clientY, e.target);
    };
    const mm = (e: PointerEvent) => mouse && move(e.clientX, e.clientY, e);
    const mu = (e: PointerEvent) => {
      if (!mouse) return;
      mouse = false;
      end(e.clientY);
    };
    el.addEventListener('touchstart', ts, { passive: true });
    el.addEventListener('touchmove', tm, { passive: false });
    el.addEventListener('touchend', te);
    el.addEventListener('touchcancel', te);
    el.addEventListener('pointerdown', md);
    window.addEventListener('pointermove', mm);
    window.addEventListener('pointerup', mu);
    return () => {
      el.removeEventListener('touchstart', ts);
      el.removeEventListener('touchmove', tm);
      el.removeEventListener('touchend', te);
      el.removeEventListener('touchcancel', te);
      el.removeEventListener('pointerdown', md);
      window.removeEventListener('pointermove', mm);
      window.removeEventListener('pointerup', mu);
    };
  }, [closable]);

  const cls = ['sheet', 'glass', closing ? (dragged ? 'closing dragged' : 'closing') : '']
    .filter(Boolean)
    .join(' ');
  // La fenêtre est rendue dans une couche à part, au-dessus de toute l'interface
  // (barres du haut et du bas comprises), quel que soit l'écran qui l'ouvre.
  const layer = typeof document !== 'undefined' ? document.getElementById('root') : null;
  const node = (
    <div ref={overlayRef} className={`overlay${closing ? ' closing' : ''}`} onClick={() => close()}>
      <div
        ref={sheetRef}
        className={cls}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        <div className="handle-zone">
          <div className="handle" />
        </div>
        <div key={swapKey} className={swapKey ? 'swap' : undefined}>
          {children}
        </div>
      </div>
    </div>
  );
  return layer ? createPortal(node, layer) : node;
}

/**
 * Indicateur qui suit le doigt : renvoie l'index (fractionnaire pendant le glissement) et les
 * gestionnaires de pointeur. Au relâchement, sélectionne la colonne la plus proche.
 */
export function useSlideSelect(count: number, onPick: (i: number) => void, padding = 4, gap = 4) {
  const [drag, setDrag] = useState<number | null>(null);
  const start = useRef<{ x: number; moved: boolean } | null>(null);
  const suppressClick = useRef(false);
  const indexAt = (el: HTMLElement, clientX: number) => {
    const r = el.getBoundingClientRect();
    const col = (r.width - 2 * padding - (count - 1) * gap) / count;
    const x = clientX - r.left - padding - col / 2;
    return Math.max(0, Math.min(count - 1, x / (col + gap)));
  };
  return {
    drag,
    handlers: {
      onPointerDown: (e: React.PointerEvent<HTMLElement>) => {
        start.current = { x: e.clientX, moved: false };
        suppressClick.current = false;
      },
      onPointerMove: (e: React.PointerEvent<HTMLElement>) => {
        if (!start.current) return;
        if (!start.current.moved && Math.abs(e.clientX - start.current.x) > 8) {
          start.current.moved = true;
          e.currentTarget.setPointerCapture?.(e.pointerId);
        }
        if (start.current.moved) setDrag(indexAt(e.currentTarget, e.clientX));
      },
      onPointerUp: (e: React.PointerEvent<HTMLElement>) => {
        if (start.current?.moved) {
          suppressClick.current = true;
          onPick(Math.round(indexAt(e.currentTarget, e.clientX)));
        }
        start.current = null;
        setDrag(null);
      },
      onPointerCancel: () => {
        start.current = null;
        setDrag(null);
      },
      onClickCapture: (e: React.MouseEvent) => {
        if (suppressClick.current) {
          e.stopPropagation();
          e.preventDefault();
          suppressClick.current = false;
        }
      },
    },
  };
}

/** Sélecteur segmenté avec indicateur coulissant (toucher ou glisser le doigt). */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  style,
}: {
  options: { value: T; label: ReactNode }[];
  value: T | null;
  onChange: (v: T) => void;
  style?: React.CSSProperties;
}) {
  const i = options.findIndex((o) => o.value === value);
  const { drag, handlers } = useSlideSelect(options.length, (k) => onChange(options[k].value));
  return (
    <div
      className={`segmented sliding${drag !== null ? ' dragging' : ''}`}
      style={{
        ...style,
        ['--n' as string]: options.length,
        ['--i' as string]: drag ?? Math.max(0, i),
      }}
      role="tablist"
      data-noswipe
      {...handlers}
    >
      {(i >= 0 || drag !== null) && <span className="seg-indicator" aria-hidden />}
      {options.map((o) => (
        <button
          key={o.value}
          role="tab"
          aria-selected={o.value === value}
          className={o.value === value ? 'active' : ''}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/**
 * Déclare les sous-vues d'un écran : on peut alors glisser d'une sous-vue à l'autre sur la page.
 * Renvoie le sens de la dernière navigation (pour l'animation d'entrée).
 */
export function usePager<T extends string>(views: readonly T[], view: T, setView: (v: T) => void) {
  const setPager = useStore((st) => st.setPager);
  const prev = useRef(view);
  const dir = useRef<'left' | 'right' | 'none'>('none');
  if (prev.current !== view) {
    dir.current = views.indexOf(view) > views.indexOf(prev.current) ? 'right' : 'left';
    prev.current = view;
  }
  const index = views.indexOf(view);
  useEffect(() => {
    setPager({ index, count: views.length, go: (k: number) => setView(views[k]) });
  }, [index, views, setView, setPager]);
  useEffect(() => () => setPager(undefined), [setPager]);
  return dir.current;
}

/** Symbole Highborn (arbre-couronne), à la couleur du texte courant. */
export function Logo({ size = 32, className }: { size?: number; className?: string }) {
  return (
    <svg viewBox="0 0 256 256" width={size} height={size} className={className} aria-hidden>
      <g stroke="currentColor" strokeWidth="22" strokeLinecap="round" fill="none">
        <path d="M128 178V102M128 178L90 112M128 178L166 112M78 196H178" />
      </g>
      <g fill="currentColor">
        <circle cx="128" cy="70" r="14" />
        <circle cx="74" cy="84" r="14" />
        <circle cx="182" cy="84" r="14" />
      </g>
    </svg>
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
const FIELDS = TINCTURES.slice(0, 6);

/** Couleur d'une maison : celle du champ de son blason (premier tirage de la graine). */
export function houseColor(seed: number): string {
  return new Rng(seed).pick(FIELDS);
}

export function CoatOfArms({ seed, size = 40 }: { seed: number; size?: number }) {
  const r = new Rng(seed);
  const field = r.pick(FIELDS);
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

const SKINS = ['#f3d6bd', '#e6bc97', '#cf9a74', '#a87552', '#7d5236'];
const SKIN_SHADE = ['#e2bb9d', '#d2a27c', '#b9825e', '#8f6143', '#63402a'];
const HAIRS = ['#241812', '#4a2e18', '#7a4a22', '#a8682e', '#d2b07a', '#6b2416', '#2d2a28'];
const EYES = ['#3b2a1e', '#4a6a8a', '#4f6b3a', '#6b4a2a'];
const GARMENTS = ['#7a2018', '#1f3f6b', '#2f5a2f', '#4a2a5b', '#5b4a2a', '#3a3a46'];

function rankOfChar(state: GameState, id: string): 'roi' | 'duc' | 'comte' | null {
  if (Object.values(state.kingdoms).some((k) => k.holderId === id)) return 'roi';
  if (Object.values(state.duchies).some((d) => d.holderId === id)) return 'duc';
  if (Object.values(state.counties).some((k) => k.holderId === id)) return 'comte';
  return null;
}

/**
 * Portrait stylisé généré depuis la graine du personnage : rang (couronne), âge (cheveux,
 * rides), sexe, dynastie (fond et vêtements), état (malade, blessé, prisonnier, mort).
 */
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
  const skinI = r.int(0, SKINS.length - 1);
  let skin = SKINS[skinI];
  const shade = SKIN_SHADE[skinI];
  const age = ageOf(state, c);
  let hair = r.pick(HAIRS);
  if (age > 58) hair = '#cfc8bd';
  else if (age > 46 && r.chance(0.6)) hair = '#8f877c';
  const eye = r.pick(EYES);
  const dyn = c.dynastyId ? state.dynasties[c.dynastyId] : undefined;
  // Fond = couleur de la maison (champ du blason), vêtements assortis.
  const bg = dyn ? houseColor(dyn.seed) : '#6f6458';
  const garment = dyn ? GARMENTS[FIELDS.indexOf(bg) % GARMENTS.length] : r.pick(GARMENTS);
  const rank = rankOfChar(state, c.id);
  const child = age < 16;
  const sick = c.traits.includes('malade');
  const wounded = c.traits.includes('blesse');
  if (sick) skin = '#d9d4b8';
  const female = c.female;
  const hairStyle = r.int(0, 3);
  const beard = !female && age >= 18 ? r.int(0, 3) : 0; // 0 rasé, 1 barbe, 2 bouc, 3 moustache
  const bald = !female && age > 40 && r.chance(0.3);
  const veil = female && !child && r.chance(0.35);
  const s = child ? 0.84 : 1;
  const uid = `p${c.id}`;
  const fur = rank !== null;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      style={{
        borderRadius: size > 60 ? 18 : 12,
        flexShrink: 0,
        filter: c.alive ? undefined : 'grayscale(1) contrast(0.9)',
        boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.25)',
      }}
      aria-hidden
    >
      <defs>
        <radialGradient id={`${uid}bg`} cx="50%" cy="35%" r="75%">
          <stop offset="0%" stopColor={bg} stopOpacity="0.55" />
          <stop offset="100%" stopColor={bg} stopOpacity="1" />
        </radialGradient>
        <linearGradient id={`${uid}cl`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={garment} />
          <stop offset="100%" stopColor="#000" stopOpacity="0.55" />
        </linearGradient>
      </defs>
      <rect width="64" height="64" fill={`url(#${uid}bg)`} />
      <rect width="64" height="64" fill={garment} opacity="0.12" />
      <g transform={`translate(${32 - 32 * s} ${64 - 64 * s}) scale(${s})`}>
        {/* Cheveux longs derrière */}
        {female && !veil && hairStyle !== 3 && (
          <path d="M18 46 C13 32 15 13 32 12 C49 13 51 32 46 46 Z" fill={hair} />
        )}
        {female && !veil && hairStyle === 3 && <circle cx="32" cy="11" r="7" fill={hair} />}
        {veil && <path d="M15 52 C14 30 18 11 32 10 C46 11 50 30 49 52 Z" fill="#efe7da" />}
        {/* Buste */}
        <path d="M8 64 C9 50 20 45 32 45 C44 45 55 50 56 64 Z" fill={`url(#${uid}cl)`} />
        {fur && (
          <path
            d="M14 54 C18 47 25 45 32 46 C39 45 46 47 50 54 C44 50 38 52 32 52 C26 52 20 50 14 54 Z"
            fill="#f1ece2"
          />
        )}
        {fur && (
          <g fill="#2a2420">
            <circle cx="22" cy="51" r="0.9" />
            <circle cx="30" cy="50.5" r="0.9" />
            <circle cx="38" cy="50.6" r="0.9" />
            <circle cx="44" cy="51.5" r="0.9" />
          </g>
        )}
        {!fur && <path d="M27 46 L32 53 L37 46" fill="none" stroke="#e0b443" strokeWidth="1.2" />}
        {/* Cou */}
        <path d="M27 38 h10 v8 c-3 2 -7 2 -10 0 z" fill={shade} />
        {/* Oreilles et visage */}
        <ellipse cx="20.5" cy="30" rx="2.3" ry="3.4" fill={shade} />
        <ellipse cx="43.5" cy="30" rx="2.3" ry="3.4" fill={shade} />
        <path
          d={
            female || child
              ? 'M21 27 C21 18 26 15 32 15 C38 15 43 18 43 27 C43 36 38 42 32 42 C26 42 21 36 21 27 Z'
              : 'M21 27 C21 18 26 15 32 15 C38 15 43 18 43 27 C43 34 41 40 36 42 C34 43 30 43 28 42 C23 40 21 34 21 27 Z'
          }
          fill={skin}
        />
        {/* Joues, rides */}
        {(female || child) && (
          <g fill="#e07a6a" opacity="0.18">
            <circle cx="25.5" cy="32" r="2.6" />
            <circle cx="38.5" cy="32" r="2.6" />
          </g>
        )}
        {age > 50 && (
          <g stroke={shade} strokeWidth="0.8" fill="none" strokeLinecap="round">
            <path d="M23.5 28.5 q1.5 1 3 0.4" />
            <path d="M37.5 28.9 q1.5 0.6 3 -0.4" />
            <path d="M27 21 q5 -1.5 10 0" />
          </g>
        )}
        {/* Yeux, sourcils, nez, bouche */}
        <g>
          <ellipse cx="27.5" cy="27.5" rx="2.1" ry="1.3" fill="#fbf7f0" />
          <ellipse cx="36.5" cy="27.5" rx="2.1" ry="1.3" fill="#fbf7f0" />
          <circle cx="27.7" cy="27.5" r="1.05" fill={eye} />
          <circle cx="36.3" cy="27.5" r="1.05" fill={eye} />
          <path
            d={
              female
                ? 'M25 24.6 q2.5 -1.4 5 -0.2 M34 24.4 q2.5 -1.2 5 0.2'
                : 'M24.6 24.6 q2.8 -1.3 5.6 -0.4 M33.8 24.2 q2.8 -0.9 5.6 0.4'
            }
            stroke={age > 58 ? '#9a9288' : hair}
            strokeWidth={female ? 0.9 : 1.4}
            fill="none"
            strokeLinecap="round"
          />
          <path
            d="M32 28.5 L30.8 33 Q32 33.8 33.3 33"
            fill="none"
            stroke={shade}
            strokeWidth="1"
            strokeLinejoin="round"
          />
          <path
            d={
              beard === 3 || beard === 1 ? 'M29.2 36.6 q2.8 1.1 5.6 0' : 'M29.4 36.4 q2.6 1.4 5.2 0'
            }
            fill="none"
            stroke={female ? '#a8473a' : '#7a4a3a'}
            strokeWidth="1.1"
            strokeLinecap="round"
          />
        </g>
        {/* Barbe */}
        {beard === 1 && (
          <path
            d="M21.5 29 C22 40 27 44 32 44 C37 44 42 40 42.5 29 C40 36 36 37.5 32 37.5 C28 37.5 24 36 21.5 29 Z"
            fill={hair}
          />
        )}
        {beard === 2 && (
          <path
            d="M28.5 38.5 C29 42.5 31 44 32 44 C33 44 35 42.5 35.5 38.5 C33.5 39.5 30.5 39.5 28.5 38.5 Z"
            fill={hair}
          />
        )}
        {(beard === 1 || beard === 3) && (
          <path
            d="M27.5 35.6 C29.5 34 31 34.6 32 35 C33 34.6 34.5 34 36.5 35.6 C34.5 35.4 33 36 32 35.9 C31 36 29.5 35.4 27.5 35.6 Z"
            fill={hair}
          />
        )}
        {/* Coiffure */}
        {!veil && !bald && (
          <path
            d={
              female
                ? 'M21 26 C20 16 26 12.5 32 12.5 C38 12.5 44 16 43 26 C41 20 37 18.5 32 18.5 C27 18.5 23 20 21 26 Z'
                : hairStyle === 0
                  ? 'M21 25 C20 16 26 13 32 13 C38 13 44 16 43 25 C41 20 37 18.6 32 18.6 C27 18.6 23 20 21 25 Z'
                  : hairStyle === 1
                    ? 'M20.5 30 C19 16 25.5 12.5 32 12.5 C38.5 12.5 45 16 43.5 30 C42.5 22 40 19 32 19.5 C24 19 21.5 22 20.5 30 Z'
                    : 'M21 24 C21.5 15.5 26 13.2 32 13.2 C38 13.2 42.5 15.5 43 24 C40 21.5 36 20.5 32 21.5 C28 19.8 24 21 21 24 Z'
            }
            fill={hair}
          />
        )}
        {bald && (
          <path
            d="M21 27 C20.5 23 21.5 21 22.5 20.5 L23 25 Z M43 27 C43.5 23 42.5 21 41.5 20.5 L41 25 Z"
            fill={hair}
          />
        )}
        {female && !veil && hairStyle === 2 && (
          <g fill={hair}>
            <path d="M20 30 C18 40 19 48 22 52 C24 48 23 40 22.5 31 Z" />
            <path d="M44 30 C46 40 45 48 42 52 C40 48 41 40 41.5 31 Z" />
          </g>
        )}
        {veil && (
          <path
            d="M20.5 25 C20.5 15 26 12.3 32 12.3 C38 12.3 43.5 15 43.5 25 C40 19.5 36 18.2 32 18.2 C28 18.2 24 19.5 20.5 25 Z"
            fill="#f6f0e6"
          />
        )}
        {/* Blessure */}
        {wounded && (
          <path d="M37 22 L41 33" stroke="#9a2c22" strokeWidth="1.2" strokeLinecap="round" />
        )}
        {/* Couronnes selon le rang */}
        {rank === 'roi' && (
          <g>
            <path
              d="M20.5 15 L22 5 L26.5 10 L32 3 L37.5 10 L42 5 L43.5 15 Z"
              fill="#e0b443"
              stroke="#8a6a14"
              strokeWidth="0.9"
              strokeLinejoin="round"
            />
            <circle cx="32" cy="12" r="1.5" fill="#b4473a" />
            <circle cx="26" cy="13" r="1" fill="#3a6593" />
            <circle cx="38" cy="13" r="1" fill="#3a6593" />
          </g>
        )}
        {rank === 'duc' && (
          <g>
            <path
              d="M21.5 15.5 L22.5 10.5 L25.5 13 L28.5 9 L32 12 L35.5 9 L38.5 13 L41.5 10.5 L42.5 15.5 Z"
              fill="#e0b443"
              stroke="#8a6a14"
              strokeWidth="0.9"
              strokeLinejoin="round"
            />
            <circle cx="32" cy="14" r="1.1" fill="#b4473a" />
          </g>
        )}
        {rank === 'comte' && (
          <path
            d="M21.5 15.8 Q32 12.5 42.5 15.8 L42.5 17.6 Q32 14.5 21.5 17.6 Z"
            fill="#d8c9a0"
            stroke="#8a7a50"
            strokeWidth="0.7"
          />
        )}
      </g>
      {c.imprisonedBy && (
        <g stroke="#1c1813" strokeWidth="2.4" opacity="0.75">
          <path d="M14 0 V64 M26 0 V64 M38 0 V64 M50 0 V64" />
        </g>
      )}
      <rect width="64" height="64" fill="none" stroke="rgba(0,0,0,0.12)" />
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
  /** Par défaut : ouvre la fiche du personnage. */
  onTap?: () => void;
}) {
  const inspect = useStore((st) => st.inspect);
  const tap = onTap ?? (() => inspect({ kind: 'perso', id: c.id }));
  return (
    <div className="list-item tappable" onClick={tap} role="button">
      <Portrait state={state} c={c} size={46} />
      <div className="grow">
        <div className="ellipsis" style={{ fontWeight: 600 }}>
          {displayName(state, c)}
        </div>
        <div className="small muted">
          {c.alive ? `${ageOf(state, c)} ans` : `† ${ageOf(state, c)} ans`}
          {extra ? <> · {extra}</> : null}
        </div>
      </div>
      <span className="chev" aria-hidden>
        ›
      </span>
    </div>
  );
}

/** Lien vers la fiche d'un personnage. */
export function CharLink({ state, id }: { state: GameState; id?: string }) {
  const inspect = useStore((st) => st.inspect);
  const c = id ? state.characters[id] : undefined;
  if (!c) return <span className="muted">—</span>;
  return (
    <button className="link" onClick={() => inspect({ kind: 'perso', id: c.id })}>
      {c.name}
    </button>
  );
}

/** Lien vers la fiche d'un comté. */
export function CountyLink({ state, id }: { state: GameState; id?: string }) {
  const inspect = useStore((st) => st.inspect);
  const c = id ? state.counties[id] : undefined;
  if (!c) return <span className="muted">—</span>;
  return (
    <button className="link" onClick={() => inspect({ kind: 'comte', id: c.id })}>
      {c.name}
    </button>
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
