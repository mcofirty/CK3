/** Diplomatie : appel à l'aide (guerre) et traités de terres (achat, vente, échange). */
import { useState } from 'react';
import { BALANCE } from '../../data/balance';
import { allied, displayName, warSide } from '../../engine/characters';
import { callToArmsAcceptance, type Acceptance } from '../../engine/diplomacy';
import {
  balanceOffer,
  countyValue,
  emptyOffer,
  goldToBalance,
  tradableCounties,
  tradeAcceptance,
  type TradeOffer,
} from '../../engine/diplomacy/trade';
import { independentRulers } from '../../engine/realm';
import type { GameState } from '../../engine/state';
import { useStore } from '../store';
import { Portrait, Sheet, signed } from './common';

export function AcceptanceView({ acc }: { acc: Acceptance }) {
  return (
    <div className="small" style={{ marginTop: 6 }}>
      <b className={acc.accept ? 'good' : 'bad'}>
        {acc.blocked
          ? `Impossible : ${acc.blocked}`
          : acc.accept
            ? `Acceptera (${signed(acc.score)})`
            : `Refusera (${signed(acc.score)})`}
      </b>
      {!acc.blocked &&
        acc.factors.map((f, i) => (
          <div key={i} className="row">
            <span className="muted grow">{f.label}</span>
            <span>{signed(f.value)}</span>
          </div>
        ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Appel à l'aide
// ---------------------------------------------------------------------------

const CTA = BALANCE.diplomacy.callToArms;

/** Subside minimal (arrondi à 10) pour qu'un souverain accepte, ou null s'il est impossible. */
function subsidyNeeded(game: GameState, ally: string, warId: string): number | null {
  const acc = callToArmsAcceptance(game, game.playerId, ally, warId);
  if (acc.blocked) return null;
  if (acc.accept) return 0;
  return Math.ceil((-acc.score * CTA.goldPerPoint) / 10) * 10 + 10;
}

export function CallHelpSheet({
  game,
  warId,
  onClose,
}: {
  game: GameState;
  warId: string;
  onClose: () => void;
}) {
  const dispatch = useStore((s) => s.dispatch);
  const [open, setOpen] = useState<string | null>(null);
  const pl = game.playerId;
  const w = game.wars[warId];
  if (!w) return null;
  const gold = game.characters[pl].gold;
  const candidates = independentRulers(game)
    .filter((r) => r !== pl && !warSide(game, warId, r))
    .map((r) => ({ r, acc: callToArmsAcceptance(game, pl, r, warId), ally: allied(game, pl, r) }))
    .sort((a, b) => Number(b.ally) - Number(a.ally) || b.acc.score - a.acc.score);
  return (
    <Sheet onClose={onClose}>
      <h2>Appeler à l’aide</h2>
      <p className="small muted" style={{ marginTop: 0 }}>
        « {w.name} ». Vos alliés répondent plus volontiers ; un allié qui refuse rompt l’alliance.
        Les autres souverains peuvent se laisser convaincre par un subside en or (versé seulement
        s’ils acceptent) ; un refus les rend sourds {CTA.refusalCooldown} saisons.
      </p>
      {candidates.map(({ r, acc, ally }) => {
        const c = game.characters[r];
        const need = subsidyNeeded(game, r, warId);
        return (
          <div key={r} className="help-row">
            <button className="help-head" onClick={() => setOpen(open === r ? null : r)}>
              <Portrait state={game} c={c} size={44} />
              <span className="grow">
                <b>{displayName(game, c)}</b>
                <span className="small muted">
                  {ally ? 'Allié' : 'Sans alliance'} ·{' '}
                  {acc.blocked
                    ? acc.blocked
                    : acc.accept
                      ? 'acceptera'
                      : `refusera (${signed(acc.score)})`}
                </span>
              </span>
              <span className="muted">{open === r ? '▴' : '▾'}</span>
            </button>
            {open === r && <AcceptanceView acc={acc} />}
            {!acc.blocked && (
              <div className="row wrap" style={{ gap: 6, marginTop: 6 }}>
                {acc.accept ? (
                  <button
                    className="btn small primary"
                    onClick={() => dispatch({ type: 'callToArms', allyId: r, warId })}
                  >
                    Appeler aux armes
                  </button>
                ) : (
                  <>
                    {need !== null && need > 0 && (
                      <button
                        className="btn small primary"
                        disabled={need > gold}
                        onClick={() =>
                          dispatch({ type: 'callToArms', allyId: r, warId, gold: need })
                        }
                      >
                        Offrir {need} or
                      </button>
                    )}
                    <button
                      className="btn small ghost"
                      onClick={() => dispatch({ type: 'callToArms', allyId: r, warId })}
                    >
                      {ally ? 'Appeler quand même (rompra l’alliance)' : 'Demander sans payer'}
                    </button>
                  </>
                )}
              </div>
            )}
          </div>
        );
      })}
      {!candidates.length && <p className="muted">Aucun souverain ne peut vous rejoindre.</p>}
    </Sheet>
  );
}

// ---------------------------------------------------------------------------
// Traité de terres
// ---------------------------------------------------------------------------

const STEPS = [-100, -10, 10, 100];

function GoldStepper({
  label,
  value,
  max,
  onChange,
}: {
  label: string;
  value: number;
  max: number;
  onChange: (v: number) => void;
}) {
  return (
    <div className="trade-gold">
      <span className="trade-gold-label">
        {label} <b>{value} or</b>
      </span>
      {STEPS.map((d) => (
        <button
          key={d}
          className="btn small ghost"
          disabled={value + d < 0 || value + d > max}
          onClick={() => onChange(Math.max(0, Math.min(max, value + d)))}
        >
          {d > 0 ? `+${d}` : d}
        </button>
      ))}
    </div>
  );
}

function CountyPicker({
  game,
  ids,
  selected,
  valueFor,
  onToggle,
}: {
  game: GameState;
  ids: string[];
  selected: string[];
  valueFor: string;
  onToggle: (id: string) => void;
}) {
  const inspect = useStore((s) => s.inspect);
  if (!ids.length) return <p className="small muted">Aucun comté cessible.</p>;
  return (
    <div className="trade-counties">
      {ids.map((id) => {
        const c = game.counties[id];
        const on = selected.includes(id);
        return (
          <div key={id} className={`trade-county${on ? ' on' : ''}`}>
            <button
              className="grow trade-county-main"
              aria-pressed={on}
              onClick={() => onToggle(id)}
            >
              <span className="trade-check" aria-hidden>
                {on ? '✓' : ''}
              </span>
              <span className="grow">
                <b>{c.name}</b>
                <span className="small muted">
                  {' '}
                  · dév. {c.development} · ~{countyValue(game, c, valueFor)} or
                </span>
              </span>
            </button>
            <button className="btn small ghost" onClick={() => inspect({ kind: 'comte', id })}>
              Fiche
            </button>
          </div>
        );
      })}
    </div>
  );
}

export function TradeSheet({ game }: { game: GameState }) {
  const trade = useStore((s) => s.tradeWith);
  const setTrade = useStore((s) => s.setTradeWith);
  const dispatch = useStore((s) => s.dispatch);
  const [offer, setOffer] = useState<TradeOffer | null>(null);
  if (!trade) return null;
  const pl = game.playerId;
  const them = game.characters[trade.targetId];
  if (!them) return null;
  const o: TradeOffer =
    offer && offer.targetId === trade.targetId
      ? offer
      : { ...emptyOffer(trade.targetId), takeCounties: trade.take ? [trade.take] : [] };
  const update = (p: Partial<TradeOffer>) => setOffer({ ...o, ...p });
  const toggle = (key: 'giveCounties' | 'takeCounties', id: string) =>
    update({ [key]: o[key].includes(id) ? o[key].filter((x) => x !== id) : [...o[key], id] });
  const acc = tradeAcceptance(game, pl, o);
  const delta = goldToBalance(game, pl, o);
  const close = () => {
    setTrade(null);
    setOffer(null);
  };
  const mine = tradableCounties(game, pl).map((c) => c.id);
  const theirs = tradableCounties(game, trade.targetId).map((c) => c.id);
  return (
    <Sheet onClose={close}>
      <div className="row">
        <Portrait state={game} c={them} size={52} />
        <div className="grow">
          <h2 style={{ margin: 0 }}>Traité de terres</h2>
          <div className="small muted">
            Avec {displayName(game, them)} · {Math.max(0, Math.round(them.gold))} or au trésor
          </div>
        </div>
      </div>
      <p className="small muted">
        Achetez, vendez ou échangez des comtés tenus en propre (jamais une capitale), avec de l’or
        de part et d’autre. Il estime chaque terre (revenus, développement, bâtiments, défense) et
        tient davantage à la sienne qu’à celle d’autrui.
      </p>

      <h3 className="settings-title">Vous demandez</h3>
      <div className="settings-group trade-box">
        <CountyPicker
          game={game}
          ids={theirs}
          selected={o.takeCounties}
          valueFor={pl}
          onToggle={(id) => toggle('takeCounties', id)}
        />
        <GoldStepper
          label="Or demandé :"
          value={o.takeGold}
          max={Math.max(0, Math.floor(them.gold / 10) * 10)}
          onChange={(v) => update({ takeGold: v })}
        />
      </div>

      <h3 className="settings-title">Vous offrez</h3>
      <div className="settings-group trade-box">
        <CountyPicker
          game={game}
          ids={mine}
          selected={o.giveCounties}
          valueFor={trade.targetId}
          onToggle={(id) => toggle('giveCounties', id)}
        />
        <GoldStepper
          label="Or offert :"
          value={o.giveGold}
          max={Math.max(0, Math.floor(game.characters[pl].gold / 10) * 10)}
          onChange={(v) => update({ giveGold: v })}
        />
      </div>

      <div className="card" style={{ marginTop: 12 }}>
        <AcceptanceView acc={acc} />
        {!acc.blocked && (
          <p className="small" style={{ margin: '8px 0 0' }}>
            {delta > 0
              ? `Il faudrait environ ${delta} or de plus pour le convaincre${delta > game.characters[pl].gold - o.giveGold ? ' : votre trésor n’y suffit pas, ajoutez une terre ou demandez moins' : ''}.`
              : delta < 0
                ? `Vous pourriez encore lui demander environ ${-delta} or.`
                : 'Offre tout juste équilibrée.'}
          </p>
        )}
        <div className="row wrap" style={{ gap: 8, marginTop: 10 }}>
          <button
            className="btn"
            disabled={!!acc.blocked || delta === 0}
            onClick={() => setOffer(balanceOffer(game, pl, o))}
          >
            Équilibrer avec de l’or
          </button>
          <button
            className="btn primary"
            disabled={!!acc.blocked}
            onClick={() => {
              dispatch({ type: 'proposeTrade', offer: o });
              close();
            }}
          >
            Proposer le traité
          </button>
        </div>
        {!acc.accept && !acc.blocked && (
          <p className="tiny muted" style={{ margin: '6px 0 0' }}>
            Un refus l’empêche de renégocier pendant {BALANCE.trade.refusalCooldown} saisons ; une
            offre insultante le vexe.
          </p>
        )}
      </div>
    </Sheet>
  );
}
