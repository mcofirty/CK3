/**
 * Simule une campagne sans intervention du joueur (choix par défaut, batailles automatiques)
 * pour vérifier que le monde évolue : frontières qui bougent, pas de faillite en boucle.
 * Usage : npm run simulate-campaign [-- --years 50 --seed 1]
 */
import { applyAction } from '../src/engine/actions';
import { countyRuler, independentRulers } from '../src/engine/realm';
import { newGame } from '../src/engine/world';

const arg = (k: string, d: number) => {
  const i = process.argv.indexOf(`--${k}`);
  return i > 0 ? Number(process.argv[i + 1]) : d;
};
const years = arg('years', 50);
const seed = arg('seed', 1);
let s = newGame({ seed });
s.autoplay = !process.argv.includes('--passif');
const dyn = (st: typeof s, id: string) => st.characters[id]?.dynastyId ?? id;
const owners0 = Object.fromEntries(Object.values(s.counties).map((c) => [c.id, dyn(s, countyRuler(s, c))]));
const t0 = Date.now();
let bankrupt = 0;
let wars = 0;
const seenWars = new Set<string>();
let successions = 0;
let lastPlayer = s.playerId;
for (let y = 0; y < years && !s.gameOver; y++) {
  s = applyAction(s, { type: 'debugAdvance', years: 1 });
  for (const w of Object.keys(s.wars)) if (!seenWars.has(w)) { seenWars.add(w); wars++; }
  if (s.playerId !== lastPlayer) { successions++; lastPlayer = s.playerId; }
  for (const r of independentRulers(s)) if (s.characters[r].gold < -100) bankrupt++;
}
const changed = Object.values(s.counties).filter((c) => dyn(s, countyRuler(s, c)) !== owners0[c.id]).length;
console.log(`Campagne simulée : ${Math.floor(s.turn / 4)} ans en ${Date.now() - t0} ms`);
console.log(`Guerres déclarées : ${wars} ; comtés ayant changé de dynastie régnante : ${changed} ; successions du joueur : ${successions}`);
console.log(`Souverains indépendants : ${independentRulers(s).length} ; saisons de faillite cumulées : ${bankrupt}`);
console.log(`Personnages en mémoire : ${Object.keys(s.characters).length} ; taille de la sauvegarde : ${Math.round(JSON.stringify(s).length / 1024)} Ko`);
if (s.gameOver) console.log(`Fin de partie : ${s.gameOver.reason}`);
for (const r of independentRulers(s)) {
  const c = s.characters[r];
  console.log(` - ${c.name} ${s.dynasties[c.dynastyId ?? '']?.name ?? ''}${r === s.playerId ? ' (joueur)' : ''} : ${Object.values(s.counties).filter((k) => countyRuler(s, k) === r).length} comtés, ${Math.round(c.gold)} or`);
}
