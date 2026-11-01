/**
 * Options : --recrute (le joueur engage tous les candidats qu'il peut payer et accueille des
 * pupilles : test de résistance des salaires), --manuel (trésorier désactivé).
 * Santé économique sur plusieurs parties simulées : faillites (or < -100), trésor moyen,
 * revenu net du joueur. Usage : npm run simulate-economy [-- --years 60 --seeds 12]
 */
import { applyAction } from '../src/engine/actions';
import {
  candidateAcceptance,
  courtPayroll,
  outsiders,
  wardCandidates,
} from '../src/engine/entourage';
import { economyOf, independentRulers } from '../src/engine/realm';
import { newGame } from '../src/engine/world';

const arg = (k: string, d: number) => {
  const i = process.argv.indexOf(`--${k}`);
  return i > 0 ? Number(process.argv[i + 1]) : d;
};
const years = arg('years', 60);
const recruit = process.argv.includes('--recrute');
const manual = process.argv.includes('--manuel');
const seeds = arg('seeds', 12);
let bankruptYears = 0;
let rulerYears = 0;
let playerBankrupt = 0;
let playerYears = 0;
const goldPlayer: number[] = [];
const courtSizes: number[] = [];
const payrolls: number[] = [];
const net0: number[] = [];
const netEnd: number[] = [];
for (let seed = 1; seed <= seeds; seed++) {
  let s = newGame({ seed });
  s.autoplay = true;
  if (manual) s = applyAction(s, { type: 'setTreasury', policy: 'manuel' });
  net0.push(economyOf(s, s.playerId).goldNet);
  for (let y = 0; y < years && !s.gameOver; y++) {
    s = applyAction(s, { type: 'debugAdvance', years: 1 });
    if (recruit && !s.gameOver) {
      for (const cand of [...(s.candidates ?? [])]) {
        const acc = candidateAcceptance(s, cand);
        if (acc.accept && s.characters[s.playerId].gold >= cand.fee + 80)
          s = applyAction(s, { type: 'inviteCandidate', id: cand.id });
      }
      for (const w of wardCandidates(s).slice(0, 2))
        s = applyAction(s, { type: 'requestWard', childId: w.child.id });
    }
    for (const r of independentRulers(s)) {
      rulerYears++;
      if (s.characters[r].gold < -100) bankruptYears++;
    }
    playerYears++;
    if (!s.gameOver) {
      courtSizes.push(outsiders(s, s.playerId).length);
      payrolls.push(courtPayroll(s, s.playerId).total);
    }
    if (s.characters[s.playerId].gold < -100) playerBankrupt++;
    if (y % 10 === 9) goldPlayer.push(Math.round(s.characters[s.playerId].gold));
  }
  if (!s.gameOver) netEnd.push(economyOf(s, s.playerId).goldNet);
}
const avg = (a: number[]) =>
  a.length ? Math.round((a.reduce((x, y) => x + y, 0) / a.length) * 10) / 10 : 0;
console.log(`Parties : ${seeds} × ${years} ans`);
console.log(
  `Faillites (or < -100, à chaque fin d'année) : ${bankruptYears} / ${rulerYears} années de souverain (${Math.round((100 * bankruptYears) / Math.max(1, rulerYears))} %)`,
);
console.log(
  `Cour du joueur : ${avg(courtSizes)} courtisans extérieurs en moyenne, salaires ${avg(payrolls)} or/saison en moyenne`,
);
console.log(
  `Joueur : ${playerBankrupt} / ${playerYears} années en faillite · revenu net initial moyen ${avg(net0)} · final moyen ${avg(netEnd)} · trésor moyen aux décennies ${avg(goldPlayer)}`,
);
