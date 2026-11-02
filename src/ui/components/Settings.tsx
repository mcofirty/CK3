/** Paramètres de l'application : affichage, son, jeu, partie, succès. */
import { useState } from 'react';
import pkg from '../../../package.json';
import { ACHIEVEMENTS } from '../../engine/endings';
import { yearOf } from '../../engine/context';
import { downloadExport } from '../../save/storage';
import { useStore } from '../store';
import { GLOSSARY, searchGlossary } from '../../data/glossary';
import { AchievementList } from './Book';
import { Segmented, Sheet } from './common';
import { resetScreenTips } from './FirstVisit';

function Switch({
  label,
  hint,
  value,
  onChange,
}: {
  label: string;
  hint?: string;
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <button
      className="setting-row"
      role="switch"
      aria-checked={value}
      onClick={() => onChange(!value)}
    >
      <span className="grow">
        <span className="setting-label">{label}</span>
        {hint && <span className="small muted setting-hint">{hint}</span>}
      </span>
      <span className={`switch${value ? ' on' : ''}`} aria-hidden="true">
        <span className="knob" />
      </span>
    </button>
  );
}

export function SettingsSheet() {
  const open = useStore((s) => s.settingsOpen);
  const setOpen = useStore((s) => s.setSettingsOpen);
  const settings = useStore((s) => s.settings);
  const setSettings = useStore((s) => s.setSettings);
  const game = useStore((s) => s.game);
  const saving = useStore((s) => s.saving);
  const saveNow = useStore((s) => s.saveNow);
  const quit = useStore((s) => s.quit);
  const slot = useStore((s) => s.slot);
  const globalAch = useStore((s) => s.globalAchievements);
  const sound = useStore((s) => s.sound);
  const [view, setView] = useState<'main' | 'succes' | 'glossaire'>('main');
  const [saved, setSaved] = useState(false);
  const [tipsReset, setTipsReset] = useState(false);
  if (!open) return null;
  const close = () => {
    setOpen(false);
    setView('main');
    setSaved(false);
    setTipsReset(false);
  };
  return (
    <Sheet onClose={close} swapKey={view}>
      {view === 'glossaire' ? (
        <GlossaryView onBack={() => setView('main')} />
      ) : view === 'succes' ? (
        <>
          <button className="btn small ghost" onClick={() => setView('main')}>
            ‹ Paramètres
          </button>
          <h2 style={{ marginTop: 10 }}>Succès</h2>
          <AchievementList unlocked={globalAch} current={game?.achievements} />
        </>
      ) : (
        <>
          <h2>Paramètres</h2>

          <h3 className="settings-title">Affichage</h3>
          <div className="settings-group">
            <div className="setting-block">
              <span className="setting-label">Thème</span>
              <Segmented
                style={{ marginTop: 8 }}
                options={[
                  { value: 'auto', label: 'Automatique' },
                  { value: 'clair', label: 'Clair' },
                  { value: 'sombre', label: 'Sombre' },
                ]}
                value={settings.theme}
                onChange={(v) => setSettings({ theme: v })}
              />
            </div>
            <Switch
              label="Animations réduites"
              hint="Transitions plus sobres, carte immobile"
              value={settings.reduceMotion}
              onChange={(v) => setSettings({ reduceMotion: v })}
            />
          </div>

          <h3 className="settings-title">Son et toucher</h3>
          <div className="settings-group">
            <Switch
              label="Effets sonores"
              hint="Cloche de saison, fracas des batailles, fanfares"
              value={settings.son}
              onChange={(v) => {
                setSettings({ son: v });
                if (v) setTimeout(() => sound('season'), 0);
              }}
            />
            <Switch
              label="Vibrations"
              hint="Sur les appareils qui les gèrent (pas sur iPhone)"
              value={settings.vibrations}
              onChange={(v) => setSettings({ vibrations: v })}
            />
          </div>

          <h3 className="settings-title">Jeu</h3>
          <div className="settings-group">
            <Switch
              label="Résumé avant la fin de saison"
              hint="Rappelle vassaux mécontents, conseil vacant, trésor à sec…"
              value={settings.confirmEnd}
              onChange={(v) => setSettings({ confirmEnd: v })}
            />
            <button
              className="setting-row"
              onClick={() => {
                resetScreenTips();
                setTipsReset(true);
              }}
            >
              <span className="grow">
                <span className="setting-label">💡 Revoir les aides des écrans</span>
                <span className="small muted setting-hint">
                  La bulle « Premier passage » reviendra sur chaque écran
                </span>
              </span>
              <span className={tipsReset ? 'good small' : 'muted'}>{tipsReset ? 'Fait' : '›'}</span>
            </button>
            <button className="setting-row" onClick={() => setView('glossaire')}>
              <span className="grow">
                <span className="setting-label">📖 Glossaire</span>
                <span className="small muted setting-hint">
                  Toutes les mécaniques et le vocabulaire du jeu
                </span>
              </span>
              <span className="muted">›</span>
            </button>
            <button className="setting-row" onClick={() => setView('succes')}>
              <span className="grow setting-label">
                🏆 Succès ({globalAch.length}/{ACHIEVEMENTS.length})
              </span>
              <span className="muted">›</span>
            </button>
          </div>

          {game && (
            <>
              <h3 className="settings-title">Partie</h3>
              <div className="settings-group">
                <div className="setting-block small muted">
                  Emplacement {slot} · difficulté {game.difficulty} · {game.startYear} →{' '}
                  {yearOf(game)} · sauvegarde automatique à chaque fin de saison
                </div>
                <button
                  className="setting-row"
                  disabled={saving}
                  onClick={async () => {
                    await saveNow();
                    setSaved(true);
                  }}
                >
                  <span className="grow setting-label">💾 Sauvegarder maintenant</span>
                  <span className={saved ? 'good small' : 'muted small'}>
                    {saving ? '…' : saved ? 'Sauvegardé' : ''}
                  </span>
                </button>
                <button className="setting-row" onClick={() => downloadExport(game)}>
                  <span className="grow setting-label">📤 Exporter la partie (JSON)</span>
                  <span className="muted">›</span>
                </button>
                <button
                  className="setting-row"
                  onClick={() => {
                    close();
                    quit();
                  }}
                >
                  <span className="grow setting-label">🏰 Menu principal</span>
                  <span className="muted">›</span>
                </button>
              </div>
            </>
          )}

          <p className="small muted center" style={{ margin: '16px 0 4px' }}>
            Highborn {pkg.version} · fonctionne hors ligne
          </p>
          <p className="tiny muted center" style={{ margin: 0 }}>
            Écran {Math.round(screen.height)} · fenêtre {Math.round(window.innerHeight)} · app{' '}
            {Math.round(document.getElementById('root')?.clientHeight ?? 0)}
          </p>
        </>
      )}
    </Sheet>
  );
}

/** Bouton d'ouverture (icône engrenage). Un appui long ouvre aussi les outils de test. */
export function SettingsButton({ onLong }: { onLong?: () => void }) {
  const setOpen = useStore((s) => s.setSettingsOpen);
  const [timer, setTimer] = useState<ReturnType<typeof setTimeout> | null>(null);
  const [long, setLong] = useState(false);
  return (
    <button
      className="gear-btn"
      aria-label="Paramètres"
      onContextMenu={(e) => e.preventDefault()}
      onPointerDown={() => {
        if (!onLong) return;
        setLong(false);
        setTimer(
          setTimeout(() => {
            setLong(true);
            onLong();
          }, 900),
        );
      }}
      onPointerUp={() => timer && clearTimeout(timer)}
      onPointerLeave={() => timer && clearTimeout(timer)}
      onClick={() => {
        if (long) return;
        setOpen(true);
      }}
    >
      <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
        <path
          fill="currentColor"
          d="M19.4 13a7.6 7.6 0 0 0 0-2l2-1.6a.5.5 0 0 0 .1-.6l-1.9-3.3a.5.5 0 0 0-.6-.2l-2.4 1a7.3 7.3 0 0 0-1.7-1l-.4-2.6a.5.5 0 0 0-.5-.4h-3.8a.5.5 0 0 0-.5.4l-.4 2.6a7.3 7.3 0 0 0-1.7 1l-2.4-1a.5.5 0 0 0-.6.2L2.5 8.8a.5.5 0 0 0 .1.6l2 1.6a7.6 7.6 0 0 0 0 2l-2 1.6a.5.5 0 0 0-.1.6l1.9 3.3c.1.2.4.3.6.2l2.4-1c.5.4 1.1.7 1.7 1l.4 2.6c0 .2.3.4.5.4h3.8c.2 0 .5-.2.5-.4l.4-2.6c.6-.3 1.2-.6 1.7-1l2.4 1c.2.1.5 0 .6-.2l1.9-3.3a.5.5 0 0 0-.1-.6zM12 15.5a3.5 3.5 0 1 1 0-7 3.5 3.5 0 0 1 0 7z"
        />
      </svg>
    </button>
  );
}

function GlossaryView({ onBack }: { onBack: () => void }) {
  const [q, setQ] = useState('');
  const [open, setOpen] = useState<string | null>(null);
  const results = searchGlossary(q);
  const total = GLOSSARY.reduce((n, sec) => n + sec.entries.length, 0);
  return (
    <>
      <button className="btn small ghost" onClick={onBack}>
        ‹ Paramètres
      </button>
      <h2 style={{ marginTop: 10 }}>Glossaire</h2>
      <p className="small muted" style={{ marginTop: 0 }}>
        {total} entrées : mécaniques, éléments et vocabulaire du jeu.
      </p>
      <input
        className="glossary-search"
        type="search"
        placeholder="Chercher un mot (stress, siège, contentement…)"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        aria-label="Chercher dans le glossaire"
      />
      {q.trim() ? (
        <div className="glossary-list">
          {results.length === 0 && <p className="muted">Aucun résultat.</p>}
          {results.map(({ section, entry }) => (
            <div key={section.id + entry.term} className="glossary-entry">
              <b>{entry.term}</b> <span className="chip tiny">{section.title}</span>
              <p className="small">{entry.text}</p>
            </div>
          ))}
        </div>
      ) : (
        GLOSSARY.map((sec) => (
          <div key={sec.id} className="glossary-section">
            <button
              className="glossary-head"
              aria-expanded={open === sec.id}
              onClick={() => setOpen(open === sec.id ? null : sec.id)}
            >
              <span>
                {sec.icon} {sec.title}
              </span>
              <span className="muted small">
                {sec.entries.length} {open === sec.id ? '▴' : '▾'}
              </span>
            </button>
            {open === sec.id && (
              <div className="glossary-list">
                {sec.entries.map((e) => (
                  <div key={e.term} className="glossary-entry">
                    <b>{e.term}</b>
                    <p className="small">{e.text}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))
      )}
    </>
  );
}
