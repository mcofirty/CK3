/**
 * Mesure le rythme du mode Trône de fer : parties sans joueur (premier choix, batailles
 * automatiques) pour chaque maison jouable, et vérifie les cibles du récit.
 * Usage : npm run simulate-westeros [-- --seeds 3 --years 15]
 */
import { applyAction } from '../src/engine/actions';
import { PLAYABLE_HOUSES, newWesterosGame } from '../src/engine/scenario/westeros';
import { storyHas } from '../src/engine/scenario/story';

const arg = (k: string, d: number) => {
  const i = process.argv.indexOf(`--${k}`);
  return i > 0 ? Number(process.argv[i + 1]) : d;
};
const seeds = arg('seeds', 3);
const years = arg('years', 15);

const BEATS = [
  'tyrion',
  'robert',
  'ned_mort',
  'nord',
  'stannis',
  'renly',
  'fer',
  'renly_mort',
  'pourpres',
  'rouges',
  'paix',
];
const firstWar: number[] = [];
const robertDeath: number[] = [];
const landing: number[] = [];
const quietShare: number[] = [];
const westerosEvents: number[] = [];
const beatCount: Record<string, number> = Object.fromEntries(BEATS.map((b) => [b, 0]));
let games = 0;
let danyDead = 0;

for (const h of PLAYABLE_HOUSES)
  for (let seed = 1; seed <= seeds; seed++) {
    let s = newWesterosGame({ houseId: h.id, seed });
    s.autoplay = true;
    games++;
    let war = -1;
    let land = -1;
    let quiet = 0;
    let wEvents = 0;
    const seasons = years * 4;
    for (let t = 0; t < seasons && !s.gameOver; t++) {
      if (t > 0) {
        if (!s.pendingEvents.length) quiet++;
        wEvents += s.pendingEvents.filter(
          (e) => e.eventId.startsWith('got_') || e.eventId.startsWith('w_'),
        ).length;
      }
      s = applyAction(s, { type: 'debugAdvance', years: 0.25 });
      if (war < 0 && Object.keys(s.wars).length) war = s.turn;
      if (land < 0 && (s.essos?.stage ?? 0) >= 6) land = s.turn;
    }
    firstWar.push(war < 0 ? Infinity : war);
    robertDeath.push(s.flags?.recit_robert ?? Infinity);
    if (s.essos?.alive || land >= 0) landing.push(land < 0 ? Infinity : land);
    else danyDead++;
    quietShare.push(quiet / (seasons - 1));
    westerosEvents.push(wEvents / (seasons - 1));
    for (const b of BEATS) if (storyHas(s, b)) beatCount[b]++;
  }

const median = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];
const share = (xs: number[], f: (x: number) => boolean) => xs.filter(f).length / xs.length;
const yr = (t: number) => (Number.isFinite(t) ? (t / 4).toFixed(1) : 'jamais');
const pct = (x: number) => `${Math.round(x * 100)} %`;
const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;

console.log(
  `${games} parties de ${years} ans (${PLAYABLE_HOUSES.length} maisons × ${seeds} graines)`,
);
console.log(
  `Première guerre : médiane an ${yr(median(firstWar))}, avant l’an 2 : ${pct(share(firstWar, (t) => t < 8))}`,
);
console.log(
  `Mort de Robert : médiane an ${yr(median(robertDeath))}, avant l’an 3 : ${pct(share(robertDeath, (t) => t < 12))}`,
);
console.log(
  `Débarquement : médiane an ${yr(median(landing))}, avant l’an 10 : ${pct(share(landing, (t) => t < 40))}, jamais : ${pct(share(landing, (t) => !Number.isFinite(t)))}`,
);
console.log(`Daenerys morte en Essos (assassin du premier choix) : ${pct(danyDead / games)}`);
console.log(
  `Saisons sans événement : ${pct(mean(quietShare))} ; événements de Westeros par saison : ${mean(westerosEvents).toFixed(2)}`,
);
console.log('Moments du récit atteints :');
for (const b of BEATS) console.log(`  ${b.padEnd(12)} ${pct(beatCount[b] / games)}`);

const targets: [string, boolean][] = [
  ['Une guerre avant l’an 2 dans ≥ 80 % des parties', share(firstWar, (t) => t < 8) >= 0.8],
  ['Robert mort avant l’an 3 dans ≥ 90 % des parties', share(robertDeath, (t) => t < 12) >= 0.9],
  ['Débarquement médian entre l’an 11 et l’an 13', median(landing) >= 44 && median(landing) <= 52],
  ['Aucun débarquement avant l’an 10', share(landing, (t) => t < 40) === 0],
];
let ok = true;
for (const [label, pass] of targets) {
  console.log(`${pass ? '✓' : '✗'} ${label}`);
  ok &&= pass;
}
process.exit(ok ? 0 : 1);
