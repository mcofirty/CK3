/** Couronnes et maisons : unions, loi agnatique, droits dynastiques, pactes, clauses de mariage. */
import { useState } from 'react';
import { BALANCE } from '../../data/balance';
import { displayName } from '../../engine/characters';
import {
  canFuse,
  claimsOnHouse,
  familyPactAcceptance,
  fuseDelay,
  hasFamilyPact,
  hasSuccessionPact,
  protectionAcceptance,
  pressableClaims,
  successionPactAcceptance,
  unionsOf,
  type MarriageClause,
} from '../../engine/crowns';
import { realmName } from '../../engine/realm';
import type { GameState } from '../../engine/state';
import { canDeclareWar } from '../../engine/war';
import { useStore } from '../store';
import { AcceptanceView } from './Diplomacy';
import { CardTitle, CharLink, Portrait, Segmented, Tip } from './common';

const K = BALANCE.crowns;

/** Bouton de la loi agnatique (fiche de la maison). */
export function AgnaticLaw({ game }: { game: GameState }) {
  const dispatch = useStore((s) => s.dispatch);
  const p = game.characters[game.playerId];
  return (
    <Tip text="Loi agnatique : les femmes et leur descendance par les femmes ne peuvent hériter. Elle empêche qu’une fille fasse passer vos terres à la maison de son mari.">
      <button
        className="btn block"
        style={{ marginTop: 8 }}
        disabled={!p.agnatic && p.prestige < K.agnaticCost}
        onClick={() => dispatch({ type: 'setAgnatic', on: !p.agnatic })}
      >
        {p.agnatic
          ? 'Abolir la loi agnatique (les femmes héritent)'
          : `Adopter la loi agnatique (${K.agnaticCost} prestige)`}
      </button>
    </Tip>
  );
}

/** Unions personnelles du joueur. */
export function UnionsCard({ game }: { game: GameState }) {
  const dispatch = useStore((s) => s.dispatch);
  const list = unionsOf(game, game.playerId);
  if (!list.length) return null;
  return (
    <div className="card">
      <CardTitle help="Union personnelle : deux royaumes sous votre tête, chacun ses coutumes. La couronne où vous ne résidez pas grogne (souverain lointain) jusqu’à la fusion.">
        Couronnes réunies
      </CardTitle>
      {list.map((u) => {
        const chk = canFuse(game, game.playerId, u.id);
        const years = Math.floor((game.turn - u.since) / 4);
        return (
          <div key={u.id} className="list-item" style={{ flexWrap: 'wrap' }}>
            <div className="grow">
              <b>Couronne de {u.name}</b>
              <div className="small muted">
                {u.counties.length} comtés · depuis {years} an(s) ·{' '}
                {u.privileges === 'confirmes'
                  ? 'privilèges confirmés'
                  : u.privileges === 'imposes'
                    ? 'autorité imposée'
                    : 'privilèges en suspens'}{' '}
                · fusion possible après {Math.ceil(fuseDelay(u) / 4)} ans
              </div>
              {!chk.ok && <div className="small warn">{chk.reason}</div>}
            </div>
            <button
              className="btn small primary"
              disabled={!chk.ok}
              onClick={() => dispatch({ type: 'fuseCrowns', unionId: u.id })}
            >
              Unir les couronnes ({K.fuseCost} prestige)
            </button>
          </div>
        );
      })}
    </div>
  );
}

/** Droits dynastiques : ceux que l'on peut faire valoir, et ceux qui menacent la maison. */
export function ClaimsCard({ game }: { game: GameState }) {
  const dispatch = useStore((s) => s.dispatch);
  const [open, setOpen] = useState<string | null>(null);
  const pl = game.playerId;
  const mine = pressableClaims(game, pl);
  const threats = claimsOnHouse(game, pl);
  return (
    <div className="card" id="focus-droits">
      <CardTitle help="Un enfant né d’une princesse étrangère hérite de droits sur la maison de sa mère (sauf renonciation). Un droit est fort quand la maison visée est fragile : souverain enfant, captif ou sans enfant.">
        Droits dynastiques
      </CardTitle>
      {mine.length === 0 && <p className="small muted">Aucun droit à faire valoir.</p>}
      {mine.map((x) => {
        const c = game.characters[x.claimantId];
        const r = game.characters[x.rulerId];
        const key = `${x.claimantId}-${x.houseId}`;
        const chk = canDeclareWar(game, pl, x.rulerId, 'dynastique', undefined, x.claimantId);
        return (
          <div key={key} className="help-row">
            <button className="help-head" onClick={() => setOpen(open === key ? null : key)}>
              <Portrait state={game} c={c} size={44} />
              <span className="grow">
                <b>{displayName(game, c)}</b>
                <span className="small muted">
                  sur {realmName(game, x.rulerId)} ({r.name}) ·{' '}
                  <span className={x.strong ? 'good' : 'warn'}>
                    droit {x.strong ? 'fort' : 'faible'}
                  </span>
                </span>
              </span>
              <span className="muted">{open === key ? '▴' : '▾'}</span>
            </button>
            {open === key && (
              <div className="small" style={{ marginTop: 6 }}>
                {x.reasons.length ? (
                  <p style={{ margin: '0 0 6px' }}>Fragilité : {x.reasons.join(', ')}.</p>
                ) : (
                  <p style={{ margin: '0 0 6px' }} className="muted">
                    Sa succession est assurée : la guerre coûtera {K.weakClaimPrestige} prestige.
                  </p>
                )}
                <p className="muted" style={{ margin: '0 0 6px' }}>
                  Victoire :{' '}
                  {c.id === pl
                    ? 'vous ceignez sa couronne (union personnelle)'
                    : `${c.name} monte sur le trône et devient votre vassal`}{' '}
                  ; ses vassaux passent sous votre autorité.
                </p>
                {!chk.ok && (
                  <p className="bad" style={{ margin: '0 0 6px' }}>
                    {chk.reasons.join(' · ')}
                  </p>
                )}
                <button
                  className="btn small primary"
                  disabled={!chk.ok}
                  onClick={() =>
                    dispatch({
                      type: 'declareWar',
                      targetId: x.rulerId,
                      cb: 'dynastique',
                      claimantId: x.claimantId,
                    })
                  }
                >
                  Faire valoir ses droits (guerre)
                </button>
              </div>
            )}
          </div>
        );
      })}
      {threats.length > 0 && (
        <>
          <h3 style={{ marginTop: 12 }}>Droits sur votre maison</h3>
          {threats.map((x) => (
            <p key={x.claimantId} className="small">
              <CharLink state={game} id={x.claimantId} /> —{' '}
              <span className={x.strong ? 'bad' : 'muted'}>
                droit {x.strong ? 'fort' : 'faible'}
              </span>
            </p>
          ))}
          <p className="tiny muted">
            Assurez votre succession (enfants, primogéniture) pour affaiblir ces prétentions.
          </p>
        </>
      )}
    </div>
  );
}

/** Choix d'une clause et d'une dot pour un mariage. */
export function MarriageClauses({
  clause,
  dowry,
  maxGold,
  onChange,
}: {
  clause: MarriageClause;
  dowry: number;
  maxGold: number;
  onChange: (c: MarriageClause, d: number) => void;
}) {
  const hints: Record<MarriageClause, string> = {
    aucune: 'Les enfants auront des droits sur les deux maisons.',
    renonciation:
      'Votre parent renonce aux droits de sa descendance sur votre maison : vous protégez votre héritage.',
    matrilineaire: 'Les enfants d’une femme de votre maison porteront votre nom.',
    hommage: 'Le souverain qui épouse votre famille tiendra ses terres de vous.',
  };
  return (
    <div style={{ marginTop: 8 }}>
      <div className="small muted">Contrat de mariage</div>
      <Segmented
        style={{ marginTop: 4 }}
        options={[
          { value: 'aucune', label: 'Simple' },
          { value: 'renonciation', label: 'Renonc.' },
          { value: 'matrilineaire', label: 'Matril.' },
          { value: 'hommage', label: 'Hommage' },
        ]}
        value={clause}
        onChange={(c) => onChange(c, dowry)}
      />
      <p className="small muted" style={{ margin: '4px 0' }}>
        {hints[clause]}
      </p>
      <div className="trade-gold">
        <span className="trade-gold-label">
          Dot : <b>{dowry} or</b>
        </span>
        {[-100, -10, 10, 100].map((d) => (
          <button
            key={d}
            className="btn small ghost"
            disabled={dowry + d < 0 || dowry + d > maxGold}
            onClick={() => onChange(clause, Math.max(0, Math.min(maxGold, dowry + d)))}
          >
            {d > 0 ? `+${d}` : d}
          </button>
        ))}
      </div>
    </div>
  );
}

/** Protection, pactes de famille et successoraux (fiche d'un souverain). */
export function PactsCard({ game, rulerId }: { game: GameState; rulerId: string }) {
  const dispatch = useStore((s) => s.dispatch);
  const [gold, setGold] = useState(0);
  const pl = game.playerId;
  const prot = protectionAcceptance(game, pl, rulerId);
  const fam = familyPactAcceptance(game, pl, rulerId);
  const succ = successionPactAcceptance(game, pl, rulerId, gold);
  const pacts = hasFamilyPact(game, pl, rulerId) || hasSuccessionPact(game, pl, rulerId);
  const maxGold = Math.max(0, Math.floor(game.characters[pl].gold / 10) * 10);
  return (
    <>
      <div className="card">
        <b>Proposer la protection</b>
        <p className="small muted" style={{ margin: '4px 0' }}>
          Lié à votre famille, il pourrait devenir votre vassal en gardant terres et titres.
        </p>
        <AcceptanceView acc={prot} />
        <button
          className="btn small"
          style={{ marginTop: 6 }}
          disabled={!!prot.blocked}
          onClick={() => dispatch({ type: 'offerProtection', targetId: rulerId })}
        >
          Proposer
        </button>
      </div>
      <div className="card">
        <b>Pacte de famille</b>
        <p className="small muted" style={{ margin: '4px 0' }}>
          Plus fort qu’une alliance : appel aux armes facilité (+{K.familyPact.callBonus}), aucun
          complot ni guerre entre vous, terres échangées plus volontiers.
        </p>
        {hasFamilyPact(game, pl, rulerId) ? (
          <p className="small good">Pacte de famille en vigueur.</p>
        ) : (
          <>
            <AcceptanceView acc={fam} />
            <button
              className="btn small"
              style={{ marginTop: 6 }}
              disabled={!!fam.blocked}
              onClick={() => dispatch({ type: 'proposePact', kind: 'famille', targetId: rulerId })}
            >
              Proposer
            </button>
          </>
        )}
      </div>
      <div className="card">
        <b>Pacte successoral</b>
        <p className="small muted" style={{ margin: '4px 0' }}>
          Si l’un meurt sans héritier, l’autre hérite de ses terres (en union personnelle).
        </p>
        {hasSuccessionPact(game, pl, rulerId) ? (
          <p className="small good">Pacte successoral en vigueur.</p>
        ) : (
          <>
            <div className="trade-gold">
              <span className="trade-gold-label">
                Or offert : <b>{gold} or</b>
              </span>
              {[-100, -10, 10, 100].map((d) => (
                <button
                  key={d}
                  className="btn small ghost"
                  disabled={gold + d < 0 || gold + d > maxGold}
                  onClick={() => setGold(Math.max(0, Math.min(maxGold, gold + d)))}
                >
                  {d > 0 ? `+${d}` : d}
                </button>
              ))}
            </div>
            <AcceptanceView acc={succ} />
            <button
              className="btn small"
              style={{ marginTop: 6 }}
              disabled={!!succ.blocked}
              onClick={() =>
                dispatch({ type: 'proposePact', kind: 'succession', targetId: rulerId, gold })
              }
            >
              Proposer
            </button>
          </>
        )}
      </div>
      {pacts && (
        <button
          className="btn block ghost"
          onClick={() => dispatch({ type: 'breakPacts', targetId: rulerId })}
        >
          Rompre les pactes (parjure : {K.perjuryPrestige} prestige, toutes les cours vous en
          tiennent rigueur)
        </button>
      )}
    </>
  );
}
