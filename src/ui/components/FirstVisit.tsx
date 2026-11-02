/** Bulle d'aide montrée la première fois qu'on ouvre une sous-vue, puis plus jamais. */
import { useState } from 'react';
import { SCREEN_TIPS } from '../../data/screenTips';

const KEY = 'highborn-aides-vues';

function readSeen(): string[] {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? '[]') as string[];
  } catch {
    return [];
  }
}

function writeSeen(list: string[]): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(list));
  } catch {
    /* stockage indisponible : la bulle reviendra */
  }
}

/** Fait revenir toutes les bulles (Paramètres). */
export function resetScreenTips(): void {
  writeSeen([]);
}

export function FirstVisitTip({ id }: { id: string }) {
  const text = SCREEN_TIPS[id];
  const [hidden, setHidden] = useState(() => readSeen().includes(id));
  if (!text || hidden) return null;
  const dismiss = () => {
    writeSeen([...new Set([...readSeen(), id])]);
    setHidden(true);
  };
  return (
    <div className="card first-visit" role="note">
      <div className="small first-visit-label">Premier passage</div>
      <p style={{ margin: '4px 0 8px' }}>{text}</p>
      <button className="btn small" onClick={dismiss}>
        Compris
      </button>
    </div>
  );
}
