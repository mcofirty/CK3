/** Écran d'accueil : le mode Trône de fer et le choix de la maison. */
import { useState } from 'react';
import { SITES } from '../../data/westeros/geography';
import { HOUSES, type WHouse } from '../../data/westeros/houses';
import { PLAYABLE_HOUSES } from '../../engine/scenario/westeros';
import type { Difficulty } from '../../engine/state';
import type { Slot, SlotInfo } from '../../save/storage';
import { useStore } from '../store';
import { HouseArms, Segmented, Sheet } from './common';

const GROUPS: { title: string; ids: string[] }[] = [
  { title: 'Le roi et ses frères', ids: ['baratheon', 'peyredragon', 'accalmie'] },
  {
    title: 'Les grandes maisons',
    ids: ['stark', 'lannister', 'arryn', 'tully', 'greyjoy', 'tyrell', 'martell'],
  },
  {
    title: 'Les bannerets',
    ids: [
      'bolton',
      'karstark',
      'umber',
      'manderly',
      'mormont',
      'frey',
      'tarly',
      'clegane',
      'royce',
      'hightower',
    ],
  },
];

function armsOf(h: WHouse) {
  const dyn = HOUSES.find((x) => (x.dynasty ?? x.id) === (h.dynasty ?? h.id) && x.color) ?? h;
  let seed = 7;
  for (const ch of h.id) seed = (seed * 31 + ch.charCodeAt(0)) >>> 0;
  return { seed, color: dyn.color, sigil: dyn.sigil, metal: dyn.metal };
}

function headOf(h: WHouse) {
  return h.members.find((m) => m.key === h.head)!;
}

const seatName = (h: WHouse) => SITES.find((s) => s.id === h.counties[0])?.name ?? '';

/** Carte d'entrée du mode, sur l'écran titre. */
export function WesterosCard({ slots }: { slots: SlotInfo[] }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button className="got-card" onClick={() => setOpen(true)}>
        <span className="got-snow" aria-hidden />
        <span className="got-kicker">Nouveau mode</span>
        <b className="got-title">Le Trône de fer</b>
        <span className="got-sub">
          Westeros, an 298 : le début de la saison 1. Robert règne, Jon Arryn vient de mourir.
          Choisissez votre maison.
        </span>
        <span className="got-arms" aria-hidden>
          {['stark', 'lannister', 'baratheon', 'targaryen', 'greyjoy', 'tyrell', 'martell'].map(
            (id) => (
              <HouseArms key={id} dyn={armsOf(HOUSES.find((h) => h.id === id)!)} size={28} />
            ),
          )}
        </span>
      </button>
      {open && <WesterosSheet slots={slots} onClose={() => setOpen(false)} />}
    </>
  );
}

function WesterosSheet({ slots, onClose }: { slots: SlotInfo[]; onClose: () => void }) {
  const startWesteros = useStore((s) => s.startWesteros);
  const [pick, setPick] = useState<WHouse | null>(null);
  const [difficulty, setDifficulty] = useState<Difficulty>('normal');
  const [slot, setSlot] = useState<Slot>((slots.find((s) => s.empty)?.slot ?? 1) as Slot);
  const [starting, setStarting] = useState(false);
  const replaced = slots.find((s) => s.slot === slot && !s.empty);
  return (
    <Sheet onClose={onClose} swapKey={pick?.id ?? 'liste'}>
      {!pick && (
        <div className="got-sheet">
          <h2>Choisir sa maison</h2>
          <p className="small muted">
            Westeros au début de la saison 1. Les grandes maisons servent le roi Robert ; les
            bannerets servent une grande maison. Chacun peut un jour plier le genou… ou se soulever.
          </p>
          {GROUPS.map((g) => (
            <section key={g.title}>
              <h3 className="settings-title">{g.title}</h3>
              {g.ids
                .map((id) => PLAYABLE_HOUSES.find((h) => h.id === id))
                .filter((h): h is WHouse => !!h)
                .map((h) => {
                  const head = headOf(h);
                  return (
                    <button key={h.id} className="got-house" onClick={() => setPick(h)}>
                      <HouseArms dyn={armsOf(h)} size={40} />
                      <span className="grow">
                        <b>{h.name}</b>
                        <span className="small muted">
                          {head.name}, {head.age} ans · {seatName(h)}
                        </span>
                      </span>
                      <span className="chev">›</span>
                    </button>
                  );
                })}
            </section>
          ))}
        </div>
      )}
      {pick && (
        <div className="got-sheet">
          <button className="btn small ghost" onClick={() => setPick(null)}>
            ‹ Toutes les maisons
          </button>
          <div className="got-pick">
            <HouseArms dyn={armsOf(pick)} size={72} />
            <div className="grow">
              <h2 style={{ margin: 0 }}>Maison {pick.name}</h2>
              {pick.words && <p className="got-words">« {pick.words} »</p>}
              <p className="small muted" style={{ margin: 0 }}>
                {headOf(pick).name}, {headOf(pick).age} ans · {seatName(pick)}
                {pick.liege
                  ? ` · vassal de la maison ${HOUSES.find((h) => h.id === pick.liege)?.name}`
                  : ''}
              </p>
            </div>
          </div>
          <p className="event-text">{pick.blurb}</p>
          <h3 className="settings-title">Difficulté</h3>
          <Segmented
            options={[
              { value: 'facile', label: 'Facile' },
              { value: 'normal', label: 'Normal' },
              { value: 'difficile', label: 'Difficile' },
            ]}
            value={difficulty}
            onChange={setDifficulty}
          />
          <h3 className="settings-title">Emplacement</h3>
          <Segmented
            options={slots.map((s) => ({
              value: String(s.slot),
              label: s.empty ? `${s.slot} · libre` : `${s.slot} · occupé`,
            }))}
            value={String(slot)}
            onChange={(v) => setSlot(Number(v) as Slot)}
          />
          {replaced && (
            <p className="small warn" style={{ margin: '6px 0 0' }}>
              La partie de l’emplacement {slot} ({replaced.label}) sera remplacée.
            </p>
          )}
          <button
            className="btn primary block"
            style={{ marginTop: 16 }}
            disabled={starting}
            onClick={async () => {
              setStarting(true);
              await startWesteros(slot, pick.id, difficulty);
            }}
          >
            {starting ? 'Les corbeaux s’envolent…' : `Jouer la maison ${pick.name}`}
          </button>
        </div>
      )}
    </Sheet>
  );
}
