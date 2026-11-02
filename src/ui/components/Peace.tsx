/** Négociation de paix : camp vainqueur, comtés cédés, or, barre d'acceptation. */
import { useState } from 'react';
import { BALANCE } from '../../data/balance';
import { displayName } from '../../engine/characters';
import {
  balanceTerms,
  peaceCandidates,
  peaceTermsAcceptance,
  termsForMode,
  termsMode,
  type PeaceMode,
} from '../../engine/peace';
import type { GameState, PeaceTerms } from '../../engine/state';
import { scoreFor } from '../../engine/war';
import { useStore } from '../store';
import { Segmented, Sheet, signed } from './common';

const P = BALANCE.peace;
const STEPS = [-100, -10, 10, 100];

/** Barre d'acceptation : la ligne médiane est le seuil d'acceptation. */
export function AcceptBar({ score, accept }: { score: number; accept: boolean }) {
  const pct = Math.max(0, Math.min(100, ((score + 60) / 120) * 100));
  return (
    <div style={{ marginTop: 8 }}>
      <div className="peace-bar" role="meter" aria-valuenow={score} aria-label="Acceptation">
        <div
          className="peace-bar-fill"
          style={{ width: `${pct}%`, background: accept ? 'var(--good)' : 'var(--bad)' }}
        />
        <div className="peace-bar-mark" />
      </div>
      <div className="row small muted" style={{ justifyContent: 'space-between' }}>
        <span>Refuse</span>
        <span>Accepte</span>
      </div>
    </div>
  );
}

const STATUS: Record<string, string> = {
  occupe: 'occupé',
  objectif: 'objectif',
  eloigne: 'lointain',
};

export function PeaceNegotiation({
  game,
  warId,
  initial,
  incoming,
  onDone,
}: {
  game: GameState;
  warId: string;
  /** Conditions de départ (proposition de l'IA) ; sinon choisies d'après l'état de la guerre. */
  initial?: PeaceTerms;
  /** Événement de proposition de l'IA : accepter, refuser ou contre-proposer. */
  incoming?: { uid: string };
  onDone?: () => void;
}) {
  const dispatch = useStore((s) => s.dispatch);
  const inspect = useStore((s) => s.inspect);
  const pl = game.playerId;
  const w = game.wars[warId];
  const [terms, setTerms] = useState<PeaceTerms | null>(null);
  const [open, setOpen] = useState(false);
  if (!w) return null;
  const my = scoreFor(game, w, pl);
  const t: PeaceTerms =
    terms ?? initial ?? termsForMode(game, warId, pl, my >= 10 ? 'victoire' : 'blanche');
  const enemy = w.attackerId === pl ? w.defenderId : w.attackerId;
  const mode = termsMode(w, pl, t);
  const acc = peaceTermsAcceptance(game, t, pl);
  const edited = !!terms;
  const cands = peaceCandidates(game, warId, t.outcome);
  const fixed =
    mode !== 'blanche' && cands.length === 0 && ['independance', 'dynastique'].includes(w.cb);
  const payerId =
    t.outcome === 'blanche'
      ? pl
      : t.outcome === (w.attackerId === pl ? 'attaquant' : 'defenseur')
        ? enemy
        : pl;
  const payerGold = Math.max(0, Math.floor(game.characters[payerId]?.gold ?? 0));
  const goldLabel =
    mode === 'victoire'
      ? 'Réparations demandées'
      : mode === 'reddition'
        ? 'Réparations versées'
        : 'Or offert pour la paix';
  const set = (p: Partial<PeaceTerms>) => setTerms({ ...t, ...p });
  const toggle = (id: string) =>
    set({
      counties: t.counties.includes(id) ? t.counties.filter((x) => x !== id) : [...t.counties, id],
    });
  const send = () => {
    dispatch({
      type: 'negotiatePeace',
      terms: t,
      eventUid: incoming?.uid,
    });
    onDone?.();
  };
  const enemyName = displayName(game, game.characters[enemy]);
  return (
    <div>
      {incoming && (
        <div className="row wrap" style={{ gap: 8, margin: '8px 0 12px' }}>
          <button
            className="btn primary grow"
            disabled={edited}
            onClick={() => dispatch({ type: 'chooseEvent', uid: incoming.uid, choice: 0 })}
          >
            Accepter ses conditions
          </button>
          <button
            className="btn grow"
            onClick={() => dispatch({ type: 'chooseEvent', uid: incoming.uid, choice: 1 })}
          >
            Refuser
          </button>
        </div>
      )}
      <div className="small muted">
        {incoming
          ? 'Ou négociez : modifiez les conditions et contre-proposez.'
          : `Avec ${enemyName}.`}{' '}
        Score de guerre <b className={my >= 0 ? 'good' : 'bad'}>{signed(Math.round(my))}</b>
      </div>
      <Segmented<PeaceMode>
        style={{ marginTop: 8 }}
        options={[
          { value: 'victoire', label: 'Victoire' },
          { value: 'blanche', label: 'Paix blanche' },
          { value: 'reddition', label: 'Reddition' },
        ]}
        value={mode}
        onChange={(m) => setTerms(termsForMode(game, warId, pl, m))}
      />
      <p className="small muted" style={{ margin: '6px 0' }}>
        {mode === 'victoire' &&
          'Vous imposez vos conditions : choisissez les comtés et l’or réclamés.'}
        {mode === 'blanche' &&
          'Chacun garde ses terres. Vous pouvez offrir de l’or pour le convaincre.'}
        {mode === 'reddition' &&
          'Vous cédez : il réclame ce qu’il juge juste, vous pouvez marchander comtés et or.'}
      </p>

      {fixed && (
        <p className="small muted">
          L’enjeu de cette guerre ({w.cb === 'independance' ? 'indépendance' : 'trône'}) ne se
          marchande pas : seul l’or peut s’y ajouter.
        </p>
      )}
      {cands.length > 0 && (
        <>
          <h3 className="settings-title">
            {mode === 'victoire' ? 'Comtés réclamés' : 'Comtés cédés'}
          </h3>
          <div className="settings-group trade-box">
            <div className="trade-counties">
              {cands.map((c) => {
                const on = t.counties.includes(c.id);
                const county = game.counties[c.id];
                return (
                  <div key={c.id} className={`trade-county${on ? ' on' : ''}`}>
                    <button
                      className="grow trade-county-main"
                      aria-pressed={on}
                      onClick={() => toggle(c.id)}
                    >
                      <span className="trade-check" aria-hidden>
                        {on ? '✓' : ''}
                      </span>
                      <span className="grow">
                        <b>
                          {c.capital ? '★ ' : ''}
                          {county.name}
                        </b>
                        <span className="small muted">
                          {' '}
                          · {STATUS[c.status]} · dév. {county.development} · {c.value} pts
                        </span>
                      </span>
                    </button>
                    <button
                      className="btn small ghost"
                      onClick={() => inspect({ kind: 'comte', id: c.id })}
                    >
                      Fiche
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        </>
      )}

      <h3 className="settings-title">Paiement</h3>
      <div className="settings-group trade-box">
        <div className="trade-gold">
          <span className="trade-gold-label">
            {goldLabel} : <b>{t.gold} or</b>{' '}
            <span className="muted small">
              (trésor de {payerId === pl ? 'vous' : 'l’ennemi'} : {payerGold})
            </span>
          </span>
          {STEPS.map((d) => (
            <button
              key={d}
              className="btn small ghost"
              disabled={t.gold + d < 0 || t.gold + d > payerGold}
              onClick={() => set({ gold: Math.max(0, Math.min(payerGold, t.gold + d)) })}
            >
              {d > 0 ? `+${d}` : d}
            </button>
          ))}
        </div>
      </div>

      <div className="card" style={{ marginTop: 12 }}>
        <b>
          {acc.blocked
            ? `Impossible : ${acc.blocked}`
            : acc.accept
              ? `${enemyName} acceptera`
              : `${enemyName} refusera`}
        </b>
        {!acc.blocked && <AcceptBar score={acc.sure ? 60 : acc.score} accept={acc.accept} />}
        {!acc.blocked && (
          <div className="small muted" style={{ marginTop: 4 }}>
            {acc.sure
              ? 'Ce sont ses propres conditions : il accepte.'
              : `Score d’acceptation ${signed(acc.score)} (il faut ${BALANCE.diplomacy.acceptThreshold} ou plus)`}
          </div>
        )}
        <button className="link" style={{ marginTop: 6 }} onClick={() => setOpen(!open)}>
          {open ? 'Masquer le détail ▴' : 'Voir le détail ▾'}
        </button>
        {open &&
          acc.factors.map((f, i) => (
            <div key={i} className="row small">
              <span className="muted grow">{f.label}</span>
              <span>{signed(f.value)}</span>
            </div>
          ))}
        <div className="row wrap" style={{ gap: 8, marginTop: 10 }}>
          <button className="btn" onClick={() => setTerms(balanceTerms(game, t, pl))}>
            Équilibrer l’or
          </button>
          <button className="btn primary" disabled={!acc.accept} onClick={send}>
            {incoming ? 'Contre-proposer' : 'Proposer la paix'}
          </button>
        </div>
        <p className="tiny muted" style={{ margin: '6px 0 0' }}>
          L’acceptation dépend de l’état de la guerre (score, lassitude, capitale occupée, rapport
          de force) et de la valeur des comtés ({P.occupiedMult * 100} % du prix si occupés) et de
          l’or ({P.goldPerPoint} or = 1 point).
        </p>
      </div>
    </div>
  );
}

/** Fenêtre de négociation lancée depuis l'onglet Armée. */
export function PeaceSheet({
  game,
  warId,
  onClose,
}: {
  game: GameState;
  warId: string;
  onClose: () => void;
}) {
  const w = game.wars[warId];
  if (!w) return null;
  return (
    <Sheet onClose={onClose}>
      <h2>Négocier la paix</h2>
      <p className="small muted" style={{ marginTop: 0 }}>
        « {w.name} »
      </p>
      <PeaceNegotiation game={game} warId={warId} onDone={onClose} />
    </Sheet>
  );
}
