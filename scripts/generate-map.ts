/**
 * Génère une carte avec le générateur du moteur (src/engine/mapgen.ts) et l'écrit dans
 * src/data/map.json (carte historique, utilisée pour migrer les anciennes sauvegardes).
 * Chaque nouvelle partie génère sa propre carte : ce script sert surtout à prévisualiser.
 * Usage : npm run generate-map [-- --seed 42 --out /tmp/carte.json]
 */
import { writeFileSync } from 'node:fs';
import { generateMap } from '../src/engine/mapgen';
import { Rng } from '../src/engine/rng';

const arg = (k: string) => {
  const i = process.argv.indexOf(`--${k}`);
  return i > 0 ? process.argv[i + 1] : undefined;
};
const map = generateMap(new Rng(Number(arg('seed') ?? 1066)));
const out = arg('out') ?? new URL('../src/data/map.json', import.meta.url);
writeFileSync(out, JSON.stringify(map));
const terrains = map.counties.reduce<Record<string, number>>(
  (m, c) => ((m[c.terrain] = (m[c.terrain] ?? 0) + 1), m),
  {},
);
console.log(
  `Carte : ${map.counties.length} comtés, ${map.duchies.length} duchés, ${map.rivers.length} tronçons de rivière`,
);
console.log('Domaines :', map.realms.map((r) => r.length).join(', '), '· terrains :', terrains);
