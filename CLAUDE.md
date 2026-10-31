# CLAUDE.md — Lignées

Jeu de dynastie et de bataille pour iPhone, en PWA statique (GitHub Pages). Spécification complète : `docs/cahier-des-charges.md` (à relire avant tout jalon).

## Commandes

| Commande                                           | Rôle                                                                             |
| -------------------------------------------------- | -------------------------------------------------------------------------------- |
| `npm run dev`                                      | Serveur de dev (`http://localhost:5173/CK3/`, ajouter `-- --host` pour l'iPhone) |
| `npm test`                                         | Tests Vitest du moteur (`tests/`)                                                |
| `npm run typecheck`                                | TypeScript strict                                                                |
| `npm run lint` / `npm run format`                  | ESLint / Prettier                                                                |
| `npm run build`                                    | Build de production (`dist/`), `VITE_BASE` règle le chemin (défaut `/CK3/`)      |
| `npm run simulate`                                 | 10 000 batailles IA contre IA, vérifie les cibles 9.11                           |
| `npm run simulate-campaign -- --years 50 --seed 1` | Campagne sans joueur (ajouter `--passif` pour un joueur inactif)                 |
| `npm run generate-map -- --seed 1066`              | Régénère `src/data/map.json`                                                     |

Les scripts passent par `vite-node` (nécessaire pour `import.meta.glob` des événements).

## Architecture

- `src/engine/` : moteur **pur**, sans DOM ni React. Point d'entrée unique `applyAction(state, action)` (`actions.ts`) qui clone l'état, crée un `Rng` depuis `state.rng`, applique, réécrit la graine. Les sous-modules reçoivent un `Ctx { state, rng }` et modifient la copie.
- `src/engine/turn.ts` : `endSeason` → déplacements et batailles (`war/moveAndDetect`) → si bataille du joueur, `phase = 'bataille'` et pause → `continueSeason` (sièges, usure, vie, successions) → `startSeason` (revenus, bâtiments, conseil, complots, IA, événements).
- `src/engine/battle/` : bataille autonome (utilisée par le jeu et le script de simulation). L'IA Difficile choisit ses ordres par anticipation d'un round contre l'ordre prévu de l'adversaire.
- `src/data/` : tout le contenu et **toutes les constantes** (`balance.ts`, `units.ts`, `terrain.ts`, `traits.ts`, `buildings.ts`, `names.ts`, `map.json`, `events/*.json`). Aucun nombre d'équilibrage en dur dans le moteur.
- `src/ui/` : React 18 + Zustand (`store.ts`). L'UI ne modifie jamais l'état : elle appelle `dispatch(action)`. Sauvegarde auto à chaque fin de saison et en arrière-plan.
- `src/save/` : IndexedDB (idb-keyval), 3 emplacements, export/import JSON, `migrations.ts` (incrémenter `SAVE_VERSION` dans `engine/state.ts` et ajouter une migration à chaque changement de format).

## Conventions

- Textes du jeu en français ; code, identifiants et commentaires techniques peuvent être en anglais.
- TypeScript strict, pas de `any`.
- Tout tirage aléatoire passe par `ctx.rng` (jamais `Math.random` dans le moteur, sauf la graine d'une nouvelle partie).
- Une nouvelle règle du moteur arrive avec son test Vitest, avant le branchement UI.
- Ajouter un événement : un objet dans `src/data/events/*.json` (format dans `src/engine/events/README.md`). Aucun code.
- Mobile d'abord : zones tactiles ≥ 44 px, texte ≥ 16 px, appui long pour les infobulles (`<Tip>`), zones sûres.
- Écran de débogage : appui long sur « Lignées » dans la barre du haut.

## Méthode de travail (section 15 du cahier)

Un jalon à la fois, plan court validé avant de coder, une branche par jalon, commits petits et explicites ; la fusion dans `main` déploie. Demander avant de changer une règle du cahier, d'ajouter une dépendance lourde ou de changer d'architecture. Signaler tout déséquilibre de `npm run simulate` avec une proposition chiffrée.

## État d'équilibrage connu

`npm run simulate` : 4 cibles sur 6 tenues. L'avantage défensif du terrain dépasse la cible (colline ≈ +25 pts, montagne ≈ +27 pts pour +10 à +20). Proposition mesurée, non appliquée car ce sont des valeurs du cahier : défense du défenseur colline ×1,25 → ×1,15 et montagne ×1,4 → ×1,2 (`src/data/terrain.ts`).
