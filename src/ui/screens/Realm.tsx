import { demesneLimit, heldCounties, opinion } from '../../engine/characters';
import {
  realmCounties,
  realmName,
  titleOf,
  vassalContribution,
  vassalsOf,
} from '../../engine/realm';
import type { GameState } from '../../engine/state';
import { CharLine, CountyLink, Opinion } from '../components/common';
import { MapView, PLAYER_COLOR } from '../components/MapView';
import { useStore } from '../store';

export function RealmScreen({ game }: { game: GameState }) {
  const selected = useStore((s) => s.selectedCounty);
  const inspect = useStore((s) => s.inspect);
  const pl = game.playerId;
  const own = heldCounties(game, pl);
  const vassals = vassalsOf(game, pl);
  const realm = realmCounties(game, pl);
  return (
    <>
      <MapView
        game={game}
        selected={selected}
        onSelect={(id) => inspect({ kind: 'comte', id })}
        onArmy={(id) => inspect({ kind: 'armee', id })}
      />
      <div className="card">
        <div className="row">
          <span className="swatch lg" style={{ background: PLAYER_COLOR }} />
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
    </>
  );
}
