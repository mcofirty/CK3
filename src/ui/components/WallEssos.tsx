/** Mode Trône de fer : le Mur et la Garde de Nuit, Daenerys en Essos (Monde › Le Mur, Essos). */
import { useState } from 'react';
import { BALANCE } from '../../data/balance';
import { ageOf, isAdult } from '../../engine/characters';
import { ESSOS_STAGES, daenerys, essosCheck, type EssosAction } from '../../engine/scenario/essos';
import { storyStatus, westerosExhausted } from '../../engine/scenario/story';
import {
  blightedCounties,
  wallCheck,
  wallDefense,
  wallStatus,
  type WallAction,
} from '../../engine/scenario/wall';
import type { GameState } from '../../engine/state';
import { useStore } from '../store';
import { Bar, CardTitle, CharLine, CountyLink, Opinion, Portrait } from './common';

const STATUS = {
  tient: { label: 'Le Mur tient', cls: 'good' },
  vacille: { label: 'Le Mur vacille', cls: 'warn' },
  tombe: { label: 'Le Mur est tombé', cls: 'bad' },
} as const;

function ActionRow({
  game,
  action,
  title,
  detail,
  label,
}: {
  game: GameState;
  action: WallAction;
  title: string;
  detail: string;
  label: string;
}) {
  const dispatch = useStore((s) => s.dispatch);
  const chk = wallCheck(game, action);
  return (
    <div className="list-item">
      <div className="grow">
        <b>{title}</b>
        <div className="small muted">
          {detail}
          {!chk.ok && chk.reason && <span className="bad"> · {chk.reason}</span>}
        </div>
      </div>
      <button
        className="btn small primary"
        disabled={!chk.ok}
        onClick={() => dispatch({ type: 'wallAct', action })}
      >
        {label}
      </button>
    </div>
  );
}

export function WallView({ game }: { game: GameState }) {
  const dispatch = useStore((s) => s.dispatch);
  const [confirm, setConfirm] = useState<string | null>(null);
  const w = game.wall;
  if (!w) return <p className="muted">Pas de Mur dans cette partie.</p>;
  const W = BALANCE.wall;
  const status = STATUS[wallStatus(game)];
  const def = wallDefense(game);
  const fallen = w.fallenTurn !== undefined;
  const commander = w.commanderId ? game.characters[w.commanderId] : undefined;
  const pl = game.playerId;
  const brothers = Object.values(game.characters).filter(
    (c) => c.alive && c.traits.includes('voeux') && c.courtId === w.commanderId,
  );
  const prisoners = Object.values(game.characters).filter((c) => c.alive && c.imprisonedBy === pl);
  const landed = new Set(Object.values(game.counties).map((c) => c.holderId));
  const candidates = Object.values(game.characters).filter(
    (c) =>
      c.alive &&
      c.id !== pl &&
      isAdult(game, c) &&
      !c.traits.includes('voeux') &&
      !landed.has(c.id) &&
      !c.imprisonedBy &&
      c.courtId === pl,
  );
  const lost = blightedCounties(game);
  return (
    <>
      <div className="card wall-card">
        <CardTitle
          extra={<span className={`chip ${status.cls}`}>{status.label}</span>}
          help="La Garde de Nuit tient le Mur avec les hommes et les vivres que lui envoient les seigneurs. Si la menace des Autres dépasse la défense quatre saisons d’affilée, le Mur tombe et les morts descendent sur le Nord. Le verredragon les affaiblit."
        >
          La Garde de Nuit
        </CardTitle>
        {commander && (
          <CharLine
            state={game}
            c={commander}
            extra={<>Lord Commandant · {ageOf(game, commander)} ans</>}
          />
        )}
        <dl className="kv" style={{ marginTop: 6 }}>
          <dt>Frères</dt>
          <dd>{w.men}</dd>
          <dt>Verredragon</dt>
          <dd>
            {w.dragonglass ? `${w.dragonglass} réserve${w.dragonglass > 1 ? 's' : ''}` : 'aucun'}
          </dd>
        </dl>
        <div className="row small" style={{ marginTop: 8 }}>
          <span className="grow muted">Vivres</span>
          <b>{Math.round(w.supply)} / 100</b>
        </div>
        <Bar value={w.supply} max={100} color={w.supply < 25 ? 'var(--bad)' : 'var(--gold)'} />
        <div className="row small" style={{ marginTop: 8 }}>
          <span className="grow muted">Défense du Mur</span>
          <b>{def}</b>
        </div>
        <Bar value={def} max={100} color="var(--blue)" />
        <div className="row small" style={{ marginTop: 8 }}>
          <span className="grow muted">Menace des Autres</span>
          <b className={w.threat > def ? 'bad' : ''}>{Math.round(w.threat)}</b>
        </div>
        <Bar value={w.threat} max={100} color="#7fb3d5" />
        <div className="row small" style={{ marginTop: 8 }}>
          <span className="grow muted">Sauvageons au pied du Mur</span>
          <b>{Math.round(w.wildlings)}</b>
        </div>
        <Bar value={w.wildlings} max={100} color="var(--ink2)" />
        {w.strain > 0 && !fallen && (
          <p className="small bad" style={{ margin: '8px 0 0' }}>
            La menace dépasse la défense depuis {w.strain} saison{w.strain > 1 ? 's' : ''} : le Mur
            tombera au bout de {W.strainToFall}.
          </p>
        )}
      </div>

      {fallen && (
        <div className="card long-night">
          <CardTitle>La Longue Nuit</CardTitle>
          <p className="small" style={{ marginTop: 0 }}>
            Le Mur est tombé. Les morts descendent sur le Nord, comté après comté. Battez-les,
            réunissez du verredragon : quand leur menace retombe sous {W.dawnThreat}, l’aube
            revient.
          </p>
          {lost.length === 0 && <p className="small muted">Aucune terre encore submergée.</p>}
          {lost.length > 0 && (
            <div className="row wrap" style={{ gap: 4 }}>
              {lost.map((c) => (
                <CountyLink key={c.id} state={game} id={c.id} />
              ))}
            </div>
          )}
        </div>
      )}

      <div className="card">
        <CardTitle>Soutenir la Garde</CardTitle>
        <ActionRow
          game={game}
          action={{ kind: 'hommes' }}
          title={`Envoyer ${W.sendMen} hommes`}
          detail="Pris sur les levées de votre domaine"
          label="Envoyer"
        />
        <ActionRow
          game={game}
          action={{ kind: 'vivres' }}
          title="Envoyer des vivres"
          detail={`${W.sendSupplyGold} or · vivres +${W.sendSupply}`}
          label="Envoyer"
        />
        <ActionRow
          game={game}
          action={{ kind: 'verredragon' }}
          title="Acheter du verredragon"
          detail={`${W.dragonglassGold} or · affaiblit les morts`}
          label="Acheter"
        />
        {fallen && (
          <ActionRow
            game={game}
            action={{ kind: 'reconstruire' }}
            title="Relever le Mur"
            detail={`${W.rebuildGold} or et ${W.rebuildMen} hommes`}
            label="Relever"
          />
        )}
      </div>

      {!fallen && (prisoners.length > 0 || candidates.length > 0) && (
        <div className="card">
          <CardTitle help="Un prisonnier peut prendre le noir plutôt que de pourrir au cachot. Un membre de votre cour peut aussi rejoindre la Garde : il renonce aux terres, aux titres et au mariage, et n’héritera plus.">
            Prendre le noir
          </CardTitle>
          {prisoners.map((c) => (
            <div key={c.id} className="court-row">
              <CharLine state={game} c={c} extra="prisonnier" />
              <button
                className="btn small"
                onClick={() =>
                  dispatch({ type: 'wallAct', action: { kind: 'prisonnier', id: c.id } })
                }
              >
                Au Mur
              </button>
            </div>
          ))}
          {candidates.map((c) => (
            <div key={c.id} className="court-row">
              <CharLine
                state={game}
                c={c}
                extra={c.dynastyId === game.playerDynastyId ? 'de votre maison' : 'courtisan'}
              />
              <button
                className={`btn small${confirm === c.id ? ' danger' : ''}`}
                onClick={() => {
                  if (confirm !== c.id) return setConfirm(c.id);
                  setConfirm(null);
                  dispatch({ type: 'wallAct', action: { kind: 'noir', id: c.id } });
                }}
              >
                {confirm === c.id ? 'Confirmer' : 'Prendre le noir'}
              </button>
            </div>
          ))}
        </div>
      )}

      {brothers.length > 0 && (
        <div className="card">
          <CardTitle extra={String(brothers.length)}>Frères connus</CardTitle>
          {brothers.map((c) => (
            <CharLine
              key={c.id}
              state={game}
              c={c}
              extra={
                c.id === w.commanderId ? 'Lord Commandant' : `${ageOf(game, c)} ans · frère juré`
              }
            />
          ))}
        </div>
      )}
    </>
  );
}

export function EssosView({ game }: { game: GameState }) {
  const dispatch = useStore((s) => s.dispatch);
  const goTo = useStore((s) => s.goTo);
  const inspect = useStore((s) => s.inspect);
  const es = game.essos;
  const dany = daenerys(game);
  if (!es) return <p className="muted">Rien à signaler de l’autre côté du détroit.</p>;
  const E = BALANCE.essos;
  const stage = ESSOS_STAGES[Math.min(es.stage, ESSOS_STAGES.length - 1)];
  const act = (action: EssosAction) => dispatch({ type: 'essosAct', action });
  const em = essosCheck(game, { kind: 'emissaire' });
  const as = essosCheck(game, { kind: 'assassin' });
  return (
    <>
      <div className="card essos-card">
        <CardTitle help="Les nouvelles d’Essos arrivent avec les marchands. Daenerys avance de saison en saison ; si elle vit, elle finira par traverser le détroit pour réclamer le trône de son père. Elle ne viendra pas avant l’an 10, et attendra que la guerre ait épuisé Westeros.">
          De l’autre côté du détroit
        </CardTitle>
        {dany && (
          <button
            className="essos-hero plain"
            onClick={() => inspect({ kind: 'perso', id: dany.id })}
          >
            <Portrait state={game} c={dany} size={64} />
            <span className="grow">
              <b>Daenerys Targaryen</b>
              <span className="small muted">
                {es.alive ? `${stage.name} · ${stage.place}` : `Morte ${dany.deathCause ?? ''}`}
              </span>
              {es.alive && (
                <span className="small">
                  {es.dragons ? `${'🐉'.repeat(es.dragons)} ` : ''}
                  {es.army.toLocaleString('fr-FR')} hommes la suivent
                </span>
              )}
            </span>
            {es.alive && <Opinion state={game} from={dany.id} to={game.playerId} />}
          </button>
        )}
        {es.alive && es.stage < 6 && (
          <p className="small muted" style={{ marginTop: 8 }}>
            {storyStatus(game).join(' ')}{' '}
            {westerosExhausted(game)
              ? 'Rien ne la retient plus en Essos, sinon le temps.'
              : 'Elle attend que les loups, les lions et les cerfs s’épuisent.'}
          </p>
        )}
        {es.alive && es.stage >= 6 && (
          <button
            className="btn block"
            style={{ marginTop: 8 }}
            onClick={() => goTo('armee', 'guerres')}
          >
            Elle est à Westeros : voir les guerres ›
          </button>
        )}
      </div>

      <div className="card">
        <CardTitle>Son parcours</CardTitle>
        <ol className="essos-steps">
          {ESSOS_STAGES.map((s, i) => (
            <li
              key={s.name}
              className={i < es.stage ? 'done' : i === es.stage && es.alive ? 'now' : 'next'}
            >
              <b>{s.name}</b>
              <span className="small muted">{s.place}</span>
            </li>
          ))}
        </ol>
      </div>

      {es.alive && es.stage < 6 && (
        <div className="card">
          <CardTitle>Agir de loin</CardTitle>
          <div className="list-item">
            <div className="grow">
              <b>Envoyer un émissaire</b>
              <div className="small muted">
                {E.emissaryGold} or · son opinion de vous +{E.emissaryOpinion} · elle avance plus
                vite
                {!em.ok && em.reason && <span className="bad"> · {em.reason}</span>}
              </div>
            </div>
            <button
              className="btn small"
              disabled={!em.ok}
              onClick={() => act({ kind: 'emissaire' })}
            >
              Envoyer
            </button>
          </div>
          <div className="list-item">
            <div className="grow">
              <b>Engager un assassin</b>
              <div className="small muted">
                {E.assassinGold} or · réussite {Math.round(E.assassinChance * 100)} % · un échec se
                sait et la rend prudente (retardée de {E.assassinDelay} saisons)
                {!as.ok && as.reason && <span className="bad"> · {as.reason}</span>}
              </div>
            </div>
            <button
              className="btn small danger-ghost"
              disabled={!as.ok}
              onClick={() => act({ kind: 'assassin' })}
            >
              Engager
            </button>
          </div>
        </div>
      )}
    </>
  );
}
