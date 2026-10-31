# Lignées

**Jeu de dynastie médiévale et de bataille stratégique pour iPhone** — application web progressive (PWA), jouée en solo, hébergée sur GitHub Pages et installable sur l'écran d'accueil, sans passer par l'App Store.

Incarnez un souverain, faites durer votre lignée sur environ 150 ans, tenez vos vassaux, intriguez et menez la guerre. Les batailles se jouent sur trois fronts et une réserve : on gagne en brisant le moral adverse, pas en tuant toutes les troupes. Un joueur habile doit pouvoir battre une armée plus nombreuse.

> L'univers, les noms et la carte sont entièrement inventés. Le jeu s'inspire de l'esprit des grands jeux de dynastie, sans en reprendre aucun nom, texte, carte, image ou son.

---

## Sommaire

- [Fonctionnalités](#fonctionnalités)
- [Installer sur iPhone](#installer-sur-iphone)
- [Développement](#développement)
- [Architecture](#architecture)
- [Ajouter du contenu](#ajouter-du-contenu)
- [Équilibrage](#équilibrage)
- [Sauvegardes](#sauvegardes)
- [Déploiement](#déploiement)
- [Feuille de route](#feuille-de-route)
- [Hors périmètre](#hors-périmètre)

---

## Fonctionnalités

| Domaine | Contenu |
| --- | --- |
| **Boucle de jeu** | 1 tour = 1 saison (4 par an). Revenus et entretien, 0 à 3 événements, décisions, résolution militaire, puis santé, naissances, décès et succession. Sauvegarde automatique à chaque fin de saison. |
| **Personnages** | 5 compétences (Diplomatie, Guerre, Gestion, Ruse, Savoir) notées de 0 à 20, ~30 traits (personnalité, éducation, héréditaires, acquis), santé, âge, opinions de -100 à +100 avec le détail des raisons. |
| **Dynastie** | Mariages, naissances, éducation des enfants à 16 ans, succession par Partage ou Primogéniture, Renommée de la lignée, arbre généalogique. |
| **Royaume** | ~30 comtés sur une carte SVG zoomable, 7 duchés, 2 royaumes à fonder. Développement, fortifications, 8 bâtiments à 2 niveaux, vassaux dont la contribution dépend de leur opinion. |
| **Événements** | 40 événements narratifs écrits en français, décrits en JSON et interprétés par un moteur d'effets : ajouter un événement ne demande aucune ligne de code. |
| **Diplomatie & intrigues** | Conseil à 5 postes, mariages, alliances, cadeaux, appels aux armes, tributs ; complots (assassiner, discréditer, gagner l'amitié, inciter à la révolte) avec chances et raisons affichées. |
| **Guerre de campagne** | Levées et compagnies professionnelles, déplacements, ravitaillement et usure, pillage, sièges et assauts, score de guerre, paix. |
| **Bataille à trois fronts** | Reconnaissance, déploiement, 8 rounds d'ordres simultanés (Charger, Tenir, Tirer, Feindre la retraite, Se replier, Prendre de flanc), réserve, terrain, météo, commandants et leurs traits, IA à trois niveaux. |
| **IA rivale** | 4 souverains rivaux et leurs vassaux pilotés par une IA à scores d'utilité, factions et révoltes, 3 niveaux de difficulté. |
| **Mobile d'abord** | Portrait, une main, onglets en bas, bouton « Fin de saison » flottant, appui long pour les infobulles, zones sûres de l'iPhone, thème clair/sombre automatique, 100 % hors ligne. |

## Installer sur iPhone

1. Ouvrir l'adresse GitHub Pages du jeu dans **Safari** (iOS 17 ou plus récent) : `https://mcofirty.github.io/CK3/`.
2. Appuyer sur le bouton **Partager**, puis **Sur l'écran d'accueil**.
3. Lancer **Lignées** depuis l'écran d'accueil : le jeu s'ouvre en plein écran et fonctionne ensuite hors ligne.

## Développement

Prérequis : Node.js 20 ou plus récent.

```bash
npm install          # dépendances
npm run dev          # serveur de développement (http://localhost:5173/CK3/)
npm test             # tests Vitest du moteur
npm run typecheck    # vérification TypeScript stricte
npm run lint         # ESLint
npm run format       # Prettier
npm run build        # build de production dans dist/
npm run preview      # prévisualiser le build
npm run simulate     # simulation de 10 000 batailles IA contre IA (équilibrage)
```

Pour tester sur iPhone pendant le développement : `npm run dev -- --host`, puis ouvrir l'adresse réseau affichée depuis Safari sur le même Wi-Fi.

Un **écran de débogage** caché s'ouvre par un appui long sur le titre « Lignées » dans la barre du haut : bataille de test, ajout d'or, avance de 10 ans.

### Stack

| Sujet | Choix |
| --- | --- |
| Build | Vite, TypeScript en mode strict |
| Interface | React 18, état global avec Zustand |
| Rendu carte et bataille | SVG et CSS (ni moteur de jeu, ni canvas WebGL) |
| PWA | vite-plugin-pwa : manifest, service worker, hors ligne, standalone, portrait |
| Sauvegarde | IndexedDB via idb-keyval, 3 emplacements, export/import JSON |
| Aléatoire | Générateur à graine mulberry32, graine stockée dans la sauvegarde |
| Tests | Vitest pour le moteur, script de simulation de batailles en masse |
| Qualité | ESLint et Prettier |

## Architecture

Le moteur est du TypeScript pur, sans DOM ni React. Il expose des **fonctions pures** : un état et une action en entrée, un nouvel état en sortie. Tout tirage aléatoire passe par le générateur à graine stocké dans l'état, pour rejouer une situation à l'identique. L'interface ne modifie jamais l'état directement : elle envoie des actions au moteur via le store. Aucun nombre d'équilibrage n'est écrit en dur dans le moteur.

```
src/
  engine/            moteur pur, sans DOM ni React
    state.ts         types de GameState
    rng.ts           aléatoire à graine (mulberry32)
    turn.ts          orchestration d'une saison
    actions.ts       point d'entrée unique : applyAction(state, action)
    characters/      cycle de vie, traits, hérédité, succession
    realm/           comtés, titres, économie, bâtiments, vassaux
    events/          moteur d'événements et langage d'effets
    diplomacy/       propositions, alliances, mariages, conseil
    intrigue/        complots du joueur et de l'IA
    war/             armées, déplacements, ravitaillement, sièges, score de guerre
    battle/          reconnaissance, déploiement, ordres, résolution, IA de bataille
    ai/              IA des souverains et des vassaux
  data/
    balance.ts       toutes les constantes d'équilibrage
    traits.ts        définitions des traits
    units.ts         statistiques et matrice des contres
    terrain.ts       effets des terrains
    buildings.ts     bâtiments
    names.ts         syllabes de la culture fictive
    map.json         comtés, adjacences, terrains, positions SVG
    events/*.json    événements narratifs
  ui/
    screens/         Cour, Royaume, Armée, Intrigues, Chronique, Bataille
    components/      composants partagés (portraits, blasons, cartes modales…)
    store.ts         store Zustand qui appelle le moteur
  save/
    storage.ts       IndexedDB, emplacements, export et import JSON
    migrations.ts    migrations entre versions de sauvegarde
  main.tsx
tests/               tests Vitest du moteur
scripts/
  simulate-battles.ts  simulation en masse pour l'équilibrage
  generate-map.ts      génère data/map.json
.github/workflows/
  deploy.yml         build et publication sur GitHub Pages
```

Le détail des conventions est dans [`CLAUDE.md`](CLAUDE.md) et la spécification complète dans [`docs/cahier-des-charges.md`](docs/cahier-des-charges.md).

## Ajouter du contenu

Tout le contenu vit dans `src/data/` ; l'univers peut être changé sans toucher aux mécaniques.

**Un événement** = un objet JSON dans `src/data/events/*.json` :

```json
{
  "id": "vassal_banquet_01",
  "titre": "Un banquet qui tourne mal",
  "texte": "Au banquet d'hiver, {vassal.nom} vous accuse publiquement d'avarice.",
  "declencheur": { "type": "aleatoire", "saisons": ["hiver"] },
  "conditions": [{ "opinion_vassal_max": 0 }],
  "poids": 10,
  "delai_retour": 8,
  "choix": [
    { "libelle": "Offrir un présent (50 or)",
      "effets": [{ "or": -50 }, { "opinion": { "cible": "vassal", "valeur": 20 } }] },
    { "libelle": "Le faire taire",
      "effets": [{ "prestige": 10 }, { "opinion": { "cible": "vassal", "valeur": -25 } }],
      "suite": "vassal_banquet_02" }
  ]
}
```

Effets disponibles : `or`, `prestige`, `piete`, `opinion`, `trait_ajout`, `trait_retrait`, `sante`, `competence`, `revendication`, `guerre`, `complot`, `naissance`, `deces`, `renommee`, `developpement`, `ravitaillement`. La liste complète des déclencheurs, conditions et variables de texte est documentée dans [`src/engine/events/README.md`](src/engine/events/README.md).

## Équilibrage

Toutes les constantes sont dans `src/data/balance.ts`, `src/data/units.ts` et `src/data/terrain.ts`. Le script `npm run simulate` joue 10 000 batailles IA contre IA et vérifie les cibles :

- À coût égal, aucune armée d'un seul type ne gagne plus de 60 % du temps contre une armée équilibrée.
- L'avantage défensif du terrain vaut entre +10 et +20 points de taux de victoire.
- Un commandant à 18 en Guerre face à un commandant à 8 vaut entre +10 et +15 points.
- Une IA Difficile avec 30 % d'effectif en moins gagne au moins une fois sur trois contre une IA Facile.
- Une bataille dure 4 à 6 rounds en moyenne.

## Sauvegardes

- Sauvegarde automatique dans IndexedDB à chaque fin de saison, sur l'un des **3 emplacements**.
- **Export / import** de la partie en fichier JSON depuis le menu, pour ne jamais perdre une partie.
- Chaque sauvegarde porte un numéro de version ; `src/save/migrations.ts` fait monter une ancienne sauvegarde jusqu'à la version courante.

## Déploiement

Chaque push sur `main` déclenche `.github/workflows/deploy.yml`, qui lance les tests, construit le site et le publie sur GitHub Pages. L'option `base` de Vite est réglée sur le nom du repo (`/CK3/`).

Une seule fois, dans le repo GitHub : **Settings → Pages → Build and deployment → Source : GitHub Actions**.

## Feuille de route

| Jalon | Contenu | Critère |
| --- | --- | --- |
| 0 — Socle | Repo, Vite, TypeScript, PWA, GitHub Pages, sauvegarde, export | La page est en ligne, s'installe et s'ouvre hors ligne |
| 1 — Souverain et saisons | Personnages, compétences, traits, famille, vieillissement, décès, succession | 50 ans de jeu avec au moins 2 successions, reprise après fermeture |
| 2 — Bataille autonome | Écran de bataille, IA de bataille, script de simulation | Une bataille en moins de 3 minutes, cibles d'équilibrage tenues |
| 3 — Royaume | Carte SVG, comtés, revenus, bâtiments, vassaux, opinion | Carte lisible au doigt, revenus réactifs |
| 4 — Événements | Moteur d'effets, format JSON, 40 événements | Ajouter un événement = ajouter du JSON |
| 5 — Guerre de campagne | Armées, déplacements, ravitaillement, sièges, score, paix | Une guerre complète de la déclaration à la paix |
| 6 — Diplomatie et intrigues | Conseil, mariages, alliances, complots | Chances et raisons toujours affichées |
| 7 — IA des royaumes | Rivaux, vassaux, factions, révoltes, difficulté | 50 ans simulés : frontières mouvantes, pas de faillite en boucle |
| 8 — Finition | Équilibrage, arbre généalogique, chronique, écran de fin, tutoriel | Une partie de 150 ans sans bug bloquant |

## Hors périmètre

Multijoueur, serveur, compte, monétisation, App Store ; musique et sons ; religions et cultures multiples, hérésies, croisades ; carte de plus de 40 comtés, batailles navales ; tout contenu issu de jeux existants.

## Licence

Projet personnel. Tous droits réservés à l'auteur.
