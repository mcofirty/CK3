import { BUILDINGS, BUILDING_TYPES } from '../../data/buildings';
import { TERRAINS } from '../../data/terrain';
import { demesneLimit, displayName, heldCounties, opinion } from '../../engine/characters';
import { councilCandidates } from '../../engine/diplomacy';
import {
  buildingLevel,
  canBuild,
  countyIncome,
  countyMaxLevies,
  countyRuler,
  fortLevel,
  realmName,
  titleOf,
  vassalContribution,
  vassalsOf,
} from '../../engine/realm';
import type { GameState } from '../../engine/state';
import { armyOf, findPath } from '../../engine/war';
import { CharLine, Opinion, Sheet } from '../components/common';
import { MapView, visibleMen } from '../components/MapView';
import { useStore } from '../store';
import { useState } from 'react';

export function RealmScreen({ game }: { game: GameState }) {
  const selected = useStore((s) => s.selectedCounty);
  const select = useStore((s) => s.selectCounty);
  const dispatch = useStore((s) => s.dispatch);
  const [grant, setGrant] = useState<string | null>(null);
  const pl = game.playerId;
  const own = heldCounties(game, pl);
  const vassals = vassalsOf(game, pl);
  return (
    <>
      <MapView game={game} selected={selected} onSelect={(id) => select(id)} />
      <div className="card">
        <h3>{realmName(game, pl)}</h3>
        <p className="small muted">
          Domaine propre : {own.length} / {demesneLimit(game, pl)} comtés
          {own.length > demesneLimit(game, pl) ? ' — trop étendu !' : ''} · {vassals.length} vassaux
        </p>
      </div>
      <div className="card">
        <h3>Vassaux</h3>
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
      {selected && (
        <CountySheet
          game={game}
          id={selected}
          onClose={() => select(undefined)}
          onGrant={() => setGrant(selected)}
          dispatch={dispatch}
        />
      )}
      {grant && (
        <Sheet onClose={() => setGrant(null)}>
          <h2>Accorder {game.counties[grant].name}</h2>
          <p className="small muted">
            Le bénéficiaire devient votre vassal (+30 d’opinion). Vous perdez le comté de votre
            domaine propre.
          </p>
          {councilCandidates(game)
            .filter((c) => !heldCounties(game, c.id).length)
            .map((c) => (
              <CharLine
                key={c.id}
                state={game}
                c={c}
                onTap={() => {
                  dispatch({ type: 'grantCounty', countyId: grant, characterId: c.id });
                  setGrant(null);
                }}
              />
            ))}
        </Sheet>
      )}
    </>
  );
}

function CountySheet({
  game,
  id,
  onClose,
  onGrant,
  dispatch,
}: {
  game: GameState;
  id: string;
  onClose: () => void;
  onGrant: () => void;
  dispatch: ReturnType<typeof useStore.getState>['dispatch'];
}) {
  const c = game.counties[id];
  const holder = game.characters[c.holderId];
  const ruler = countyRuler(game, c);
  const pl = game.playerId;
  const mine = c.holderId === pl;
  const army = armyOf(game, pl);
  const path = army ? findPath(game, pl, army.location, id) : [];
  const armiesHere = Object.values(game.armies).filter((a) => a.location === id);
  return (
    <Sheet onClose={onClose}>
      <h2>{c.name}</h2>
      <p className="small muted">
        {TERRAINS[c.terrain].label} · duché de {game.duchies[c.duchyId].name}
        {c.rivers.length ? ' · rivière' : ''}
      </p>
      <dl className="kv">
        <dt>Titulaire</dt>
        <dd>{displayName(game, holder)}</dd>
        {ruler !== c.holderId && (
          <>
            <dt>Suzerain</dt>
            <dd>{game.characters[ruler]?.name}</dd>
          </>
        )}
        <dt>Développement</dt>
        <dd>{c.development} / 10</dd>
        <dt>Fortification</dt>
        <dd>{fortLevel(c)} / 3</dd>
        <dt>Revenus</dt>
        <dd>{countyIncome(c).toFixed(1)} or / saison</dd>
        <dt>Levées</dt>
        <dd>
          {Math.round(c.levyPool)} / {Math.round(countyMaxLevies(c))}
        </dd>
        {c.occupation && (
          <>
            <dt>Occupé par</dt>
            <dd className="bad">{game.characters[c.occupation.byRulerId]?.name}</dd>
          </>
        )}
        {c.siege && (
          <>
            <dt>Siège</dt>
            <dd>
              {c.siege.progress} / {1 + fortLevel(c)} saisons
            </dd>
          </>
        )}
      </dl>
      {armiesHere.length > 0 && (
        <p className="small">
          Armées :{' '}
          {armiesHere
            .map((a) => {
              const v = visibleMen(game, a.id);
              return `${game.characters[a.ownerId]?.name} (${v.exact ? '' : '~'}${v.men})`;
            })
            .join(', ')}
        </p>
      )}
      {army && army.location !== id && (
        <button
          className="btn primary block"
          style={{ marginTop: 8 }}
          disabled={!path.length}
          onClick={() => {
            dispatch({ type: 'moveArmy', armyId: army.id, targetCountyId: id });
            onClose();
          }}
        >
          {path.length
            ? `Envoyer l’armée ici (${path.length} étape${path.length > 1 ? 's' : ''})`
            : 'Inaccessible à votre armée'}
        </button>
      )}
      <h3 style={{ marginTop: 14 }}>
        Bâtiments ({c.buildings.length} / {c.slots})
      </h3>
      {c.construction && (
        <p className="small">
          Chantier : {BUILDINGS[c.construction.type].name} niv. {c.construction.level} — encore{' '}
          {c.construction.remaining} saison(s)
        </p>
      )}
      {c.buildings.map((b) => (
        <div key={b.type} className="chip">
          {BUILDINGS[b.type].name} {b.level}
        </div>
      ))}
      {mine && (
        <div style={{ marginTop: 8 }}>
          {BUILDING_TYPES.map((t) => {
            const chk = canBuild(game, pl, id, t);
            if (buildingLevel(c, t) >= 2) return null;
            return (
              <div key={t} className="list-item">
                <div className="grow">
                  <b>
                    {BUILDINGS[t].name} {chk.level}
                  </b>
                  <div className="small muted">
                    {BUILDINGS[t].description} {chk.cost} or, {chk.seasons} saisons.
                    {!chk.ok && chk.reason ? <span className="bad"> {chk.reason}</span> : null}
                  </div>
                </div>
                <button
                  className="btn small"
                  disabled={!chk.ok}
                  onClick={() => dispatch({ type: 'build', countyId: id, building: t })}
                >
                  Bâtir
                </button>
              </div>
            );
          })}
          <button className="btn block ghost" style={{ marginTop: 8 }} onClick={onGrant}>
            Accorder ce comté à un courtisan
          </button>
        </div>
      )}
      {!mine && holder && holder.id !== pl && (
        <div className="row" style={{ marginTop: 8 }}>
          <span className="muted small">Opinion de {holder.name} envers vous</span>
          <span className="right">
            <Opinion state={game} from={holder.id} to={pl} />
          </span>
        </div>
      )}
    </Sheet>
  );
}
