/** Onglet Royaume : la carte, les terres et vassaux, le trésor, les lois et la succession. */
import { demesneLimit, heldCounties, opinion } from '../../engine/characters';
import {
  canCreateTitle,
  realmCounties,
  realmName,
  titleOf,
  vassalContribution,
  vassalsOf,
} from '../../engine/realm';
import type { GameState } from '../../engine/state';
import { useState } from 'react';
import {
  CardTitle,
  CharLine,
  CountyLink,
  Opinion,
  Segmented,
  usePager,
  useFocusView,
} from '../components/common';
import { ClaimsCard, UnionsCard } from '../components/Crowns';
import { TaxesCard, TreasuryView } from '../components/Economy';
import { LawsBody } from '../components/Laws';
import { MapView, playerColor } from '../components/MapView';
import { SuccessionSection } from '../components/RealmSheet';
import { useStore } from '../store';
import { FirstVisitTip } from '../components/FirstVisit';

const REALM_VIEWS = ['carte', 'domaine', 'tresor', 'lois'] as const;
type RealmView = (typeof REALM_VIEWS)[number];

export function RealmScreen({ game }: { game: GameState }) {
  const [view, setView] = useState<RealmView>('carte');
  const dir = usePager(REALM_VIEWS, view, setView);
  useFocusView(REALM_VIEWS, setView);
  return (
    <>
      <Segmented
        className="subnav"
        options={[
          { value: 'carte', label: 'Carte' },
          { value: 'domaine', label: 'Domaine' },
          { value: 'tresor', label: 'Trésor' },
          { value: 'lois', label: 'Lois' },
        ]}
        value={view}
        onChange={setView}
      />
      <div className={`view enter-${dir}`} key={view}>
        <FirstVisitTip id={`royaume/${view}`} />
        {view === 'carte' && <MapPane game={game} />}
        {view === 'domaine' && <DomainView game={game} />}
        {view === 'tresor' && <TreasuryView game={game} />}
        {view === 'lois' && <LawsView game={game} />}
      </div>
    </>
  );
}

/** La carte seule, sur toute la hauteur disponible. */
function MapPane({ game }: { game: GameState }) {
  const selected = useStore((s) => s.selectedCounty);
  const inspect = useStore((s) => s.inspect);
  return (
    <MapView
      game={game}
      selected={selected}
      onSelect={(id) => inspect({ kind: 'comte', id })}
      onArmy={(id) => inspect({ kind: 'armee', id })}
    />
  );
}

/** Les terres : résumé du royaume, impôts et comtés, vassaux, titres à fonder. */
function DomainView({ game }: { game: GameState }) {
  const dispatch = useStore((s) => s.dispatch);
  const pl = game.playerId;
  const p = game.characters[pl];
  const own = heldCounties(game, pl);
  const vassals = vassalsOf(game, pl);
  const realm = realmCounties(game, pl);
  const titles = [...Object.values(game.duchies), ...Object.values(game.kingdoms)]
    .filter((t) => !t.holderId)
    .map((t) => ({ t, chk: canCreateTitle(game, p.id, t.id), kingdom: 'duchies' in t }))
    .filter((x) => x.chk.share > 0)
    .sort((a, b) => b.chk.share - a.chk.share);
  return (
    <>
      <div className="card">
        <div className="row">
          <span className="swatch lg" style={{ background: playerColor(game) }} />
          <h3 className="grow" style={{ margin: 0 }}>
            {realmName(game, pl)}
          </h3>
        </div>
        <p className="small muted">
          {realm.length} comtés · domaine propre {own.length} / {demesneLimit(game, pl)}
          {own.length > demesneLimit(game, pl) ? ' — trop étendu !' : ''} · {vassals.length} vassaux
        </p>
        <div className="row wrap" style={{ gap: 4 }}>
          {realm.map((c) => (
            <CountyLink key={c.id} state={game} id={c.id} />
          ))}
        </div>
      </div>
      <TaxesCard game={game} />
      <div className="card" id="focus-vassaux">
        <CardTitle extra={vassals.length ? String(vassals.length) : undefined}>Vassaux</CardTitle>
        {vassals.length === 0 && <p className="muted">Aucun vassal.</p>}
        {vassals.map((v) => {
          const c = game.characters[v];
          const op = opinion(game, v, pl);
          return (
            <CharLine
              key={v}
              state={game}
              c={c}
              extra={
                <>
                  {titleOf(game, v)} · contribution {Math.round(vassalContribution(op) * 100)} %
                  {c.inFaction ? <b className="bad"> · faction</b> : null}{' '}
                  <Opinion state={game} from={v} to={pl} />
                </>
              }
            />
          );
        })}
      </div>
      {titles.length > 0 && (
        <div className="card">
          <CardTitle>Titres à fonder</CardTitle>
          {titles.map(({ t, chk, kingdom }) => (
            <div key={t.id} className="list-item">
              <div className="grow">
                <b>
                  {kingdom ? 'Royaume' : 'Duché'} de {t.name}
                </b>
                <div className="small muted">
                  {chk.ok ? `${chk.prestige} prestige, ${chk.gold} or` : chk.reasons.join(' · ')}
                </div>
              </div>
              <button
                className="btn small primary"
                disabled={!chk.ok}
                onClick={() => dispatch({ type: 'createTitle', titleId: t.id })}
              >
                Fonder
              </button>
            </div>
          ))}
        </div>
      )}
    </>
  );
}

/** Tout ce qui répond à « qui me succède ? » : gouvernement, loi, ligne, couronnes, droits. */
function LawsView({ game }: { game: GameState }) {
  return (
    <>
      <LawsBody game={game} />
      <div className="card">
        <SuccessionSection game={game} id={game.playerId} />
      </div>
      <UnionsCard game={game} />
      <ClaimsCard game={game} />
    </>
  );
}
