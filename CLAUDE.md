# CLAUDE.md — Highborn

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
- `src/engine/turn.ts` : `endSeason` → déplacements et batailles (`war/moveAndDetect`) → si bataille du joueur, `phase = 'bataille'` et pause → `continueSeason` (sièges, mercenaires, épidémies, vie, successions, succès) → `startSeason` (revenus, progression, bâtiments, conseil, complots, IA, vie de cour `court.ts`, événements).
- Progression : talents par personnage (`Character.perks`, perdus à la mort) et héritages par maison (`Dynasty.legacies`) ; leurs bonus sont lus via `perkBonus(state, c, clé)` (données dans `data/perks.ts`).
- Économie locale (`engine/economy/`) : `local.ts` (pur, lu par `realm` : multiplicateurs d'impôts, conscription, contentement, édits) et `index.ts` (saison, révoltes, actions, emprunts, IA). Revenus d'un comté = base × impôts × contentement × souverain (gestion, talents, édits).
- Cour (`engine/entourage/`) : `roster.ts` (pur, lu par `realm` : capacité, salaires des courtisans extérieurs du joueur) et `index.ts` (candidats, rallier, pupilles, débauchage, trésorier, impayés). `npm run simulate-economy` (options `--recrute`, `--manuel`) mesure les faillites ; au départ, `world.ts` retire les compagnies de trop pour garder un revenu net positif.
- Carte (`engine/mapgen.ts`) : 48 comtés, 12 duchés, 3 royaumes, 8 domaines de départ de tailles `REALM_SIZES` (le joueur reçoit un domaine de 5 à 7). Le monde (`engine/abroad.ts`, données `data/abroad.ts`) : faits de saison chez l'IA ; `worldNews(state, …)` (`context.ts`) alimente `state.worldNews` (guerres, paix, morts, successions, mariages, alliances, titres, révoltes), affiché dans Chronique › Monde (`ui/components/News.tsx`). Les guerres des voisins (`bordersPlayer`) vont aussi dans les avis.
- Portraits : fond = couleur de la maison (`houseColor`, champ du blason, `common.tsx`).
- Une bataille peut naître d'un événement (`war/eventBattle.ts`, `BattleState.event`) : `closeBattle` applique alors l'issue sans poursuivre la saison.
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
- Hauteur d'écran iPhone : lancée depuis l'écran d'accueil, `main.tsx` (`fitScreen`) pose `--app-h` = hauteur réelle de l'écran ; `body` (fixe) prend cette hauteur (sinon WebKit découpe l'app à la fenêtre annoncée, parfois plus courte de 62 pt), `#root` le remplit et son `transform` en fait le repère de tous les éléments `position: fixed`. Ne pas remettre `100dvh`/`100vh` ni `inset: 0` sur `body`, ni faire déborder un enfant de `#root`. Paramètres affiche écran / fenêtre / app pour le diagnostic.
- Fenêtres (`Sheet`) : toujours rendues par portail dans `#root`, au-dessus des barres ; ne pas les recréer en `position: fixed` à l'intérieur d'un écran défilant (WebKit les enferme sous la barre d'onglets).
- Écran de débogage : appui long sur « Highborn » dans la barre du haut.

## Méthode de travail (section 15 du cahier)

Un jalon à la fois, plan court validé avant de coder, une branche par jalon, commits petits et explicites ; la fusion dans `main` déploie. Demander avant de changer une règle du cahier, d'ajouter une dépendance lourde ou de changer d'architecture. Signaler tout déséquilibre de `npm run simulate` avec une proposition chiffrée.

## État d'équilibrage connu

`npm run simulate` : les 6 cibles sont tenues (vérifié aussi sur 40 000 batailles avec `-- --n 40000`) depuis l'ajout des tactiques, de l'élan et des duels : mono-type ≤ 60 %, colline ≈ +15, montagne ≈ +18, commandant ≈ +13. L'élan reste volontairement faible (`elan.attackPerLevel` 0,015) : plus fort, il avantage l'infanterie lourde seule. Le bruit statistique est d'environ ±2 pts sur 10 000 batailles.
