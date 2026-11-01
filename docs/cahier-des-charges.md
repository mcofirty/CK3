# Cahier des charges — Lignées, jeu de dynastie et de bataille pour iPhone

_31 octobre 2026 · Romain Innocenzi_

## 1. Contexte et objectif

Lignées est un jeu de dynastie médiévale avec des batailles stratégiques, joué en solo sur iPhone par son auteur. Il est hébergé sur GitHub Pages et installé sur l'écran d'accueil comme une application web (PWA), sans passer par l'App Store.

Le jeu reprend l'esprit des mécaniques de Crusader Kings 3 : incarner un souverain, faire durer sa lignée, tenir ses vassaux, intriguer et faire la guerre. Il ne reprend aucun nom, texte, carte, image ou son de Paradox. L'univers, les noms et la carte sont entièrement inventés.

Objectifs de jeu :

- Des sessions de 5 à 15 minutes, reprises exactement là où on les a laissées.
- Une partie couvre plusieurs générations, soit environ 150 ans de jeu.
- La guerre est un vrai défi tactique : un joueur habile doit pouvoir battre une armée plus nombreuse.
- Chaque décision importante a des conséquences sur la dynastie (alliances, rancunes, héritiers).

Univers par défaut : un territoire médiéval fictif inspiré de l'Europe des XIe–XIIIe siècles, sans magie. Ce choix peut être changé sans toucher aux mécaniques, car tout le contenu est séparé du moteur.

## 2. Contraintes techniques et stack

Le jeu est une application web statique, sans serveur, en TypeScript, déployée automatiquement sur GitHub Pages à chaque push sur main.

| Sujet | Choix imposé |
| --- | --- |
| Build | Vite, TypeScript en mode strict |
| Interface | React 18, état global avec Zustand |
| Rendu carte et bataille | SVG et CSS (pas de moteur de jeu, pas de canvas WebGL) |
| PWA | vite-plugin-pwa : manifest, service worker, mode hors ligne, affichage standalone, orientation portrait |
| Cible | Safari iOS 17+ sur iPhone, largeur 375 à 430 px ; jouable aussi dans un navigateur de bureau pour le développement |
| Hébergement | GitHub Pages via un workflow GitHub Actions ; option base de Vite réglée sur le nom du repo |
| Sauvegarde | IndexedDB (via idb-keyval), sauvegarde automatique à chaque fin de tour, 3 emplacements |
| Export | Export et import de la sauvegarde en fichier JSON, pour ne jamais perdre une partie |
| Aléatoire | Générateur pseudo-aléatoire à graine (mulberry32), graine stockée dans la sauvegarde |
| Tests | Vitest pour le moteur ; script de simulation de batailles en masse pour l'équilibrage |
| Qualité | ESLint et Prettier |

Contraintes complémentaires :

- Aucun appel réseau à l'exécution : pas de backend, pas de compte, pas d'analytics, pas de police ou d'image externe.
- Les visuels sont générés en SVG : blasons procéduraux, icônes simples, portraits stylisés (silhouette, couleurs, blason).
- Chaque sauvegarde porte un numéro de version, avec des fonctions de migration entre versions.
- Le jeu fonctionne entièrement hors ligne une fois installé.

## 3. Boucle de jeu

Un tour correspond à une saison, soit 4 tours par an ; le joueur passe au tour suivant avec un bouton « Fin de saison » toujours visible.

Déroulé d'un tour :

1. Début de saison : revenus, entretien des troupes, évolution des provinces et des constructions.
2. Événements : 0 à 3 cartes d'événement s'affichent, chacune résolue par un choix.
3. Décisions du joueur : conseil, diplomatie, intrigues, constructions, levée et déplacement des armées.
4. Résolution militaire : déplacements, sièges, puis batailles. Le joueur joue ses batailles ; celles entre IA sont résolues automatiquement.
5. Fin de saison : santé, naissances, décès, succession si besoin, puis sauvegarde automatique. Le vieillissement s'applique une fois par an, en hiver.

Avant la fin de saison, un résumé signale ce qui demande attention : intrigue découverte, vassal mécontent, armée sans ravitaillement, héritier sans éducateur.

Début et fin de partie :

- Le joueur commence comme duc de 4 comtés, avec 2 vassaux, dans un territoire partagé entre 5 souverains.
- Objectif à long terme : réunir assez de comtés pour fonder un royaume, puis le garder dans la lignée.
- La partie s'arrête si la dynastie n'a plus aucun héritier titré, ou après 150 ans de jeu.
- Un écran final affiche le score de lignée (renommée, titres, durée) et la chronique de la dynastie.

## 4. Personnages et dynastie

Chaque personnage a 5 compétences notées de 0 à 20, des traits, un âge, une santé et des relations ; le joueur incarne toujours le chef de sa lignée.

| Compétence | Rôle principal |
| --- | --- |
| Diplomatie | Acceptation des propositions, opinion des vassaux |
| Guerre | Bonus de commandement en bataille, qualité des levées |
| Gestion | Revenus, nombre maximal de comtés tenus en propre |
| Ruse | Complots, contre-espionnage |
| Savoir | Piété, éducation des enfants, développement |

Traits (environ 30 au départ, définis dans un fichier de données) :

- Personnalité : paires opposées comme Courageux/Lâche, Ambitieux/Satisfait, Juste/Cruel, Généreux/Avare, Prudent/Impétueux.
- Éducation : un trait attribué à 16 ans, selon l'éducateur choisi et la compétence travaillée.
- Héréditaires : Fort, Génie, Robuste, Faible, Lent, transmis avec une probabilité à paramétrer (base 25 % par parent porteur).
- Acquis : Blessé, Malade, Stratège, Cavalier émérite, Inébranlable, obtenus par événements ou batailles.

Chaque trait définit des modificateurs de compétences, d'opinion, de poids d'événements et, s'il y a lieu, une capacité en bataille.

Cycle de vie :

- La santé (0 à 100) et l'âge déterminent le risque de décès à chaque saison.
- Un couple marié a une probabilité de naissance par saison, qui baisse avec l'âge.
- Le joueur choisit l'éducateur de chaque enfant de la famille proche.
- Les mariages se négocient avec les autres cours et créent des alliances.

Succession : deux lois disponibles. Le Partage (loi de départ) donne le titre principal à l'aîné et répartit les autres comtés entre les enfants. La Primogéniture (débloquée avec du prestige) transmet tout à l'aîné. À la mort du souverain, le joueur continue avec l'héritier principal.

Relations : l'opinion va de -100 à +100, avec le détail des raisons affiché. Un personnage peut devenir Ami ou Rival. La dynastie a une Renommée qui monte avec les titres, les victoires et les mariages prestigieux. Les noms sont générés à partir de listes de syllabes d'une culture fictive.

## 5. Royaume, provinces et ressources

La carte compte environ 30 comtés reliés par un graphe d'adjacence, regroupés en 6 à 8 duchés et 2 royaumes à fonder.

_Révision du 1er novembre 2026, à la demande du propriétaire : la carte générée compte désormais 48 comtés, 12 duchés et 3 royaumes à fonder, partagés au départ entre 8 souverains de tailles inégales (de 3 à 10 comtés, le joueur recevant un domaine moyen de 5 à 7). Les autres cours vivent leur vie (faits de saison, guerres, successions, mariages, révoltes), rapportée dans les nouvelles du monde. Les parties déjà commencées gardent leur carte._

_Révision du 1er novembre 2026, à la demande du propriétaire : capitale et population. Chaque seigneur siège dans une capitale (revenus et levées +25 %, développement plus rapide et plafond 12, un emplacement et une fortification de plus, population ×1,6), qu'il peut déplacer contre or et prestige. Chaque comté a une population (développement × terrain × capitale × vitalité) ; la vitalité baisse avec épidémies, occupation, pillages, assauts, révoltes et famines, remonte avec le contentement, et module revenus et levées. Occuper une capitale rapporte 30 points de guerre et ampute les revenus de son seigneur ; tenue deux saisons, elle permet d'exiger la reddition dès 20 de score, et l'IA en mauvaise posture capitule. Une capitale perdue à la paix coûte 100 de prestige._

Chaque comté possède :

- un nom, un terrain (plaine, colline, forêt, marais, montagne) et d'éventuelles rivières sur ses frontières ;
- un niveau de fortification de 0 à 3 et un développement de 1 à 10 ;
- des revenus et un nombre de levées calculés à partir du développement et des bâtiments ;
- 2 à 3 emplacements de bâtiments et un titulaire (le joueur, un vassal ou un rival).

Ressources du joueur :

| Ressource | Sert à | Se gagne par |
| --- | --- | --- |
| Or | Bâtiments, troupes, dots, cadeaux, rançons | Impôts des comtés et des vassaux |
| Prestige | Déclarer des guerres de conquête, changer de loi, fonder un royaume | Victoires, titres, mariages prestigieux |
| Piété | Apaiser le clergé, certaines décisions et choix d'événements | Chapelle, dons, événements religieux |

Vassaux : 2 à 6 personnages tiennent des comtés sous l'autorité du joueur. Leur contribution en impôts et en levées dépend de leur opinion. Sous -30 d'opinion, ils peuvent rejoindre une faction et se révolter.

Domaine propre : le nombre de comtés tenus directement est limité par la Gestion du souverain (base 3, +1 tous les 5 points). Au-delà, les revenus baissent et les vassaux s'agacent.

Bâtiments (8 au départ) : Marché, Ferme, Caserne, Écuries, Archerie, Muraille, Chapelle, Route. Chacun coûte de l'or, se construit en un nombre de saisons donné et a 2 niveaux.

_Révision du 1er novembre 2026, à la demande du propriétaire : mariages entre souverains. Unions personnelles (un héritier qui reçoit un second royaume le tient à part, avec ses privilèges, jusqu'à la fusion des couronnes ; le partage rend la couronne au cadet) ; loi agnatique ; droits dynastiques transmis par le sang (forts quand la maison visée est fragile), guerre de droit dynastique et prétendants ; contrat de mariage (renonciation, matrilinéaire, hommage, dot) ; protection d'un souverain lié par la famille, pactes de famille et successoraux, parjure._

_Révision du 1er novembre 2026, à la demande du propriétaire : fiche de royaume (souverain, héritier attendu, ligne de succession, prétendants) et influence dans les cours étrangères (chancelier, Grands courtisés, cadeaux, liens de famille), qui facilite les négociations et permet de faire acclamer un candidat à la succession._

## 6. Événements narratifs

Les événements sont des données (fichiers JSON), interprétées par un petit moteur d'effets ; ajouter un événement ne demande aucune ligne de code.

Un événement contient : un identifiant, un titre, un texte avec variables, un déclencheur, des conditions, un poids de tirage, un délai avant retour possible et 2 à 4 choix. Chaque choix a un libellé, des conditions d'affichage éventuelles, des effets et une suite facultative (événement enchaîné).

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

Effets à prévoir dans le moteur : or, prestige, piété, opinion, ajout ou retrait de trait, santé, compétence, revendication sur un comté, déclenchement d'une guerre ou d'un complot, naissance, décès, événement suivant.

Règles de tirage : 3 événements maximum par saison, un délai avant qu'un même événement revienne, des drapeaux « une fois par personnage » ou « une fois par partie ». Chaque choix affiche ses effets connus avant validation.

Contenu initial : 40 événements écrits en français, ton sobre et narratif.

| Catégorie | Nombre |
| --- | --- |
| Cour et souverain | 10 |
| Famille et héritiers | 8 |
| Vassaux | 8 |
| Religion | 5 |
| Guerre et armée | 5 |
| Intrigue | 4 |

## 7. Diplomatie, conseil et intrigues

Le conseil compte 5 postes, chacun avec une tâche choisie chaque saison ; la diplomatie et les intrigues affichent toujours leurs chances de succès et leurs raisons.

| Poste | Compétence | Tâches possibles |
| --- | --- | --- |
| Chancelier | Diplomatie | Améliorer les relations avec une cour, fabriquer une revendication |
| Maréchal | Guerre | Entraîner les troupes, augmenter les levées |
| Intendant | Gestion | Collecter les impôts, développer un comté |
| Maître-espion | Ruse | Démasquer les complots, espionner une cour (améliore la reconnaissance en bataille) |
| Chapelain | Savoir | Gagner de la piété, éduquer un héritier |

Actions diplomatiques : proposer un mariage, proposer une alliance (exige un lien par mariage), envoyer un cadeau, appeler un allié aux armes, réclamer un tribut. L'acceptation est un score affiché avec le détail de ses facteurs (opinion, intérêt, rapport de force, traits).

Complots du joueur : Assassiner, Discréditer (baisse le prestige et l'opinion d'une cible), Gagner l'amitié, Inciter un vassal rival à la révolte. Un complot progresse chaque saison selon la Ruse et le nombre d'agents recrutés. Chaque saison, il y a un risque d'être découvert, avec perte d'opinion et de prestige.

Complots de l'IA : les rivaux complotent aussi contre le joueur. Le maître-espion peut les découvrir, ce qui déclenche un événement de choix (pardonner, emprisonner, exécuter).

Casus belli disponibles :

- Revendication : sur un comté, héritée ou fabriquée par le chancelier.
- Conquête : coûte beaucoup de prestige, accessible à partir du rang de roi ou avec un trait Ambitieux.
- Indépendance : utilisé par un vassal révolté ou par le joueur s'il est vassal.
- Défense d'un allié : via l'appel aux armes.

## 8. Guerre : couche campagne

La stratégie commence avant la bataille : choisir où combattre, ménager son ravitaillement et savoir quand assiéger ou négocier.

Troupes :

- Levées : fournies par les comtés et les vassaux, gratuites tant qu'elles ne sont pas levées, coûteuses en entretien une fois sur le terrain. Leur effectif baisse si elles restent levées plus de 8 saisons.
- Compagnies professionnelles : piquiers, infanterie lourde, archers, cavalerie lourde. Recrutées avec de l'or, selon les bâtiments (Caserne, Archerie, Écuries), avec un entretien permanent.
- Commandants : des personnages de la cour. Une armée a un commandant principal et jusqu'à 2 commandants de front.

Déplacements : une armée se déplace d'un comté adjacent par saison ; 2 si elle n'a que de la cavalerie, ou s'il y a une Route. Le joueur voit les armées ennemies dans les comtés adjacents à ses troupes ou à ses forts ; au-delà, seulement une estimation.

Ravitaillement et usure :

- Chaque armée a un ravitaillement de 0 à 100, qui baisse en territoire ennemi et remonte en territoire ami.
- Usure par saison : 2 % des effectifs de base, ×2 en hiver, ×1,5 en marais ou montagne, ×3 si le ravitaillement est à 0.
- Le joueur peut piller un comté ennemi pour regagner du ravitaillement, avec une perte d'opinion locale.

Sièges : un siège dure 1 saison + 1 par niveau de fortification. Le joueur peut donner l'assaut pour gagner du temps, au prix de lourdes pertes. Une armée de secours qui arrive déclenche une bataille.

Bataille : elle survient quand deux armées hostiles sont dans le même comté. Le joueur joue la bataille (section 9) ou choisit la résolution automatique, qui utilise le même moteur avec des ordres de l'IA.

Score de guerre (de -100 à +100) :

| Fait de guerre | Effet sur le score |
| --- | --- |
| Bataille gagnée | +5 à +25 selon les effectifs engagés |
| Comté occupé | +10, +20 si c'est un objectif de guerre |
| Souverain ennemi capturé | +50 |
| Objectif tenu 4 saisons d'affilée | +5 par saison |

Paix : à +50 ou plus, l'ennemi accepte la plupart des exigences. Une paix blanche est possible à tout moment si les deux camps l'acceptent. Une capture permet d'exiger une rançon en or ou un comté.

## 9. Bataille stratégique à trois fronts

Une bataille se joue en 8 rounds maximum sur trois fronts (aile gauche, centre, aile droite) plus une réserve ; on gagne en brisant le moral adverse, pas en tuant toutes les troupes. Les deux camps donnent leurs ordres en secret, puis tout se résout en même temps.

### 9.1 Déroulé

1. Reconnaissance : le joueur voit plus ou moins le dispositif ennemi selon son niveau de reconnaissance.
2. Déploiement : le joueur répartit ses compagnies entre les trois fronts et la réserve, et place ses commandants.
3. Rounds : à chaque round, un ordre par front, plus l'engagement éventuel de la réserve et les capacités des commandants.
4. Fin : déroute d'une armée, ou retraite de l'attaquant après 8 rounds.
5. Bilan : pertes, poursuite, blessures, captures et effet sur le score de guerre.

### 9.2 Reconnaissance

| Niveau | Ce que voit le joueur |
| --- | --- |
| 0 | Effectif total ennemi, à ±25 % |
| 1 | Effectif exact et composition par type d'unité |
| 2 | Répartition par front, commandants ennemis et leurs traits |

Le niveau part de 0 : +1 si la bataille a lieu en territoire ami, +1 si le maître-espion a espionné cette cour dans les 4 dernières saisons, +1 avec le trait Stratège. Il est plafonné à 2.

### 9.3 Déploiement

Le joueur affecte chaque compagnie (100 hommes) à un front ou à la réserve, à la main ou via un préréglage : Équilibré, Centre solide, Ailes de cavalerie, Défense en profondeur (grosse réserve). Chaque front peut recevoir un commandant ; le commandant principal prend le centre par défaut.

### 9.4 Unités

Valeurs par compagnie de 100 hommes, toutes rangées dans un fichier d'équilibrage.

| Unité | Recrutement (or) | Entretien (or/saison) | Attaque | Défense | Moral de base |
| --- | --- | --- | --- | --- | --- |
| Levées | 0 | 1 | 2 | 2 | 40 |
| Piquiers | 40 | 3 | 3 | 6 | 60 |
| Archers | 45 | 3 | 4 | 2 | 50 |
| Infanterie lourde | 70 | 5 | 6 | 6 | 70 |
| Cavalerie lourde | 100 | 8 | 8 | 4 | 75 |

Matrice des contres : multiplicateur appliqué à l'attaque de l'unité en ligne contre l'unité en colonne. Le triangle central : les piquiers battent la cavalerie, la cavalerie bat les archers, les archers battent les piquiers.

| Attaquant ↓ / Cible → | Levées | Piquiers | Archers | Inf. lourde | Cavalerie |
| --- | --- | --- | --- | --- | --- |
| Levées | 1,0 | 0,8 | 1,2 | 0,7 | 0,8 |
| Piquiers | 1,1 | 1,0 | 1,0 | 0,8 | 1,8 |
| Archers | 1,3 | 1,4 | 1,0 | 0,8 | 0,7 |
| Inf. lourde | 1,3 | 1,3 | 1,1 | 1,0 | 0,9 |
| Cavalerie | 1,5 | 0,6 | 1,6 | 1,0 | 1,0 |

### 9.5 Ordres par front

| Ordre | Effet | Conditions et risques |
| --- | --- | --- |
| Charger | Attaque ×1,3 (cavalerie ×1,5), défense ×0,85 | Si le front adverse Tient avec au moins 30 % de piquiers, la cavalerie qui charge subit des pertes ×1,5 |
| Tenir | Défense ×1,4, attaque ×0,7, pertes de moral ×0,75 | Aucun |
| Tirer | Seuls les archers combattent, attaque ×1,2 ; le reste du front n'échange pas de coups | 3 volées par front et par bataille ; si l'ennemi Charge, les archers défendent à ×0,8 |
| Feindre la retraite | Si l'adversaire Charge : il subit des pertes ×1,5 et perd 20 de moral | Exige 40 % de cavalerie et un commandant Guerre ≥ 12 (ou Cavalier émérite) ; sinon échec : -10 de moral |
| Se replier | Le front rejoint la réserve avec -10 de moral | Le front adverse devient libre |
| Prendre de flanc | Attaque un front ennemi adjacent, attaque ×1,5, -10 de moral à la cible par round | Seulement pour un front libre (son vis-à-vis est brisé ou replié) |

Engager la réserve : au début d'un round, le joueur envoie tout ou partie de la réserve sur un front. Les renforts ajoutent leur moral à la moyenne du front, plus un bonus de +10.

### 9.6 Résolution d'un round

Chaque front inflige des dégâts au front qui lui fait face (ou à celui qu'il prend de flanc) :

```
D(A→B) = R · C_A · Σ_{u∈A} N_u · Atk_u · O_u · T_u · Σ_{v∈B} p_v · M_{u,v}
P_B = k · D(A→B) / Def̄_B
ΔMoral_B = -150 · P_B / E_B - Chocs_B
```

- N_u : effectif de l'unité u ; Atk_u : son attaque ; O_u et T_u : modificateurs d'ordre et de terrain.
- p_v : part de l'unité v dans l'effectif du front B ; M : matrice des contres.
- C_A : coefficient du commandant, égal à 1 + 0,02 × (Guerre − 10).
- R : aléa tiré entre 0,85 et 1,15 ; k : constante de calibrage, 0,1 au départ.
- Def̄_B : défense moyenne de B pondérée par effectif, avec ses modificateurs d'ordre et de terrain.
- P_B : pertes en hommes, réparties entre les unités de B au prorata de leur effectif ; E_B : effectif du front au début de la bataille.
- Chocs : -15 si un front voisin vient d'être brisé, -25 si le commandant du front est tué ou capturé.

Moral de départ d'un front : moyenne des moraux de base pondérée par effectif, +10 si le souverain commande l'armée, -10 en hiver.

Un front est brisé quand son moral tombe à 0 ou que son effectif passe sous 20 % du départ. Il fuit et subit 10 % de pertes supplémentaires. Une armée part en déroute quand deux de ses fronts sont brisés, ou quand son centre est brisé et sa réserve vide.

Poursuite : le perdant subit des pertes supplémentaires de 5 %, plus 40 % de la part de cavalerie du vainqueur, le tout plafonné à 30 %. Si aucune armée n'est en déroute après 8 rounds, l'attaquant se retire et le défenseur gagne avec un score de guerre divisé par deux.

### 9.7 Terrain et météo

| Terrain | Effets |
| --- | --- |
| Plaine | Cavalerie : attaque ×1,2 |
| Colline | Défenseur : défense ×1,15 et archers ×1,2 ; charges de l'attaquant ×0,85 |
| Forêt | Cavalerie ×0,7, archers ×0,8 ; un défenseur avec Ruse ≥ 12 peut tendre une embuscade (-15 de moral à un front attaquant au round 1) |
| Marais | Toutes les unités : attaque ×0,8 ; l'attaquant perd 5 de moral par round |
| Montagne | Défenseur : défense ×1,2 ; cavalerie ×0,6 |
| Rivière franchie | Attaquant : attaque ×0,7 aux rounds 1 et 2 |

_Révision du 31 octobre 2026 : défense du défenseur ramenée de ×1,25 à ×1,15 (colline) et de ×1,4 à ×1,2 (montagne), à la suite du script d'équilibrage._

Météo : en hiver, -10 de moral de départ pour tous. Hors été, 20 % de risque de pluie, qui réduit les archers à ×0,7.

### 9.8 Commandants

| Trait | Effet en bataille |
| --- | --- |
| Stratège | +1 niveau de reconnaissance ; voit les ordres ennemis du round 1 |
| Impétueux | Charger donne attaque ×1,5 (cavalerie ×1,7) ; ne peut pas ordonner Se replier |
| Prudent | Tenir donne défense ×1,55 au lieu de ×1,4 |
| Inébranlable | Le front ne perd jamais plus de 20 de moral par round |
| Cavalier émérite | Feindre la retraite toujours possible ; cavalerie ×1,1 |
| Inspirant | Action Rallier une fois par bataille : +25 de moral au front |
| Lâche | Si son front passe sous 30 de moral, 50 % de risque qu'il fuie (-15 de moral) |

Risques : à chaque round, 2 % de risque de blessure pour chaque commandant, 8 % si son front est brisé. Une blessure est mortelle dans 20 % des cas. Si son front est brisé et que son armée perd, il est capturé dans 25 % des cas. Le souverain peut commander : +10 de moral pour toute l'armée, mais il court les mêmes risques, ce qui peut déclencher une succession.

### 9.9 IA en bataille

Règles appliquées par front, dans cet ordre :

1. Le front est libre : Prendre de flanc.
2. L'ennemi en face a au moins 40 % de cavalerie et le front a des piquiers : Tenir.
3. Moral du front sous 25 : engager la réserve si elle existe, sinon Se replier si les fronts voisins tiennent.
4. Rapport de force du front d'au moins 1,3 : Charger.
5. Au moins 40 % d'archers et des volées restantes : Tirer.
6. Sinon : Tenir.

Difficulté : Facile (30 % d'ordres aléatoires), Normal (10 %), Difficile (aucun ordre aléatoire, et l'IA contre l'ordre le plus probable du joueur).

### 9.10 Écran de bataille

- Portrait : ennemi en haut, joueur en bas, trois colonnes pour les fronts.
- Chaque front affiche une barre d'effectif, une barre de moral, les icônes des types d'unités et le commandant.
- La réserve est dans un tiroir en bas de l'écran ; chaque front a un sélecteur d'ordre à gros boutons.
- Bouton « Lancer le round », puis un journal court (une ligne par front) et des animations simples : barres qui descendent, front qui tremble ou se brise.
- Bouton « Résoudre automatiquement » à tout moment, et écran de bilan à la fin.

### 9.11 Cibles d'équilibrage

Le script de simulation joue 10 000 batailles IA contre IA et vérifie ces cibles :

- À coût égal, aucune armée d'un seul type ne gagne plus de 60 % du temps contre une armée équilibrée.
- L'avantage défensif du terrain vaut entre +10 et +20 points de taux de victoire.
- Un commandant à 18 en Guerre face à un commandant à 8 vaut entre +10 et +15 points.
- Une IA Difficile avec 30 % d'effectif en moins gagne au moins une fois sur trois contre une IA Facile.
- Une bataille dure 4 à 6 rounds en moyenne et se joue en moins de 3 minutes.

## 10. IA des royaumes rivaux

Les 4 souverains rivaux et les vassaux sont pilotés par une IA à scores d'utilité, évaluée une fois par saison, dont le caractère dépend des traits du personnage.

Chaque saison, l'IA de chaque souverain :

1. Évalue les menaces : armées ennemies adjacentes, complots découverts, vassaux mécontents.
2. Choisit au plus une action majeure : déclarer une guerre, proposer une alliance ou un mariage, lancer un complot, construire.
3. Gère ses armées en guerre : défendre, assiéger, chercher une bataille favorable ou éviter une bataille perdue d'avance.
4. Garde une réserve d'or minimale (2 saisons d'entretien) avant toute dépense.

Règles de décision :

- Elle déclare une guerre seulement avec un casus belli et un rapport de force estimé d'au moins 1,3, alliés compris.
- Elle propose une paix blanche quand son score de guerre passe sous -40 sans perspective de remontée.
- Un souverain Ambitieux ou Impétueux est plus agressif ; un Prudent ou Satisfait privilégie défense et mariages.
- Les vassaux sous -30 d'opinion rejoignent une faction ; la faction se révolte quand sa force dépasse 80 % de celle du suzerain.

Difficulté de campagne : Facile, Normal, Difficile. Elle module les revenus de l'IA (-20 %, 0, +15 %) et le niveau de l'IA en bataille. Les batailles entre IA sont résolues automatiquement avec le même moteur que celles du joueur.

## 11. Interface mobile

L'interface est pensée pour une main, en portrait : navigation par onglets en bas, actions importantes dans la moitié basse de l'écran.

| Onglet | Contenu |
| --- | --- |
| Cour | Fiche du souverain, famille, conseil, arbre généalogique |
| Royaume | Carte SVG des comtés, fiche de comté, bâtiments, vassaux |
| Armée | Armées, recrutement, ordres de déplacement, guerres en cours et score |
| Intrigues | Diplomatie, complots en cours, complots découverts |
| Chronique | Journal des événements marquants de la dynastie |

Règles d'ergonomie :

- Barre du haut : or, prestige, piété, saison et année. Un appui sur une ressource montre le détail de ses revenus et dépenses.
- Bouton « Fin de saison » flottant en bas à droite, au-dessus de la barre d'onglets.
- Les événements et les propositions s'affichent en cartes modales, avec les effets de chaque choix visibles.
- Zones tactiles d'au moins 44 px, texte d'au moins 16 px.
- Appui long à la place du survol pour les infobulles (traits, modificateurs, raisons d'opinion).
- Carte zoomable au pincement et déplaçable au doigt.
- Respect des zones sûres de l'iPhone (encoche, indicateur d'accueil).
- Thème clair et sombre suivant le réglage du téléphone.
- Portraits stylisés et blasons générés en SVG à partir d'une graine propre à chaque personnage et dynastie.

## 12. Architecture du code et données

Le moteur de jeu est du TypeScript pur, sans dépendance à l'interface, et tout le contenu (traits, unités, événements, carte) vit dans des fichiers de données.

```
src/
  engine/             moteur pur, sans DOM ni React
    state.ts          types de GameState
    rng.ts            aléatoire à graine (mulberry32)
    turn.ts           orchestration d'une saison
    characters/       cycle de vie, traits, hérédité, succession
    realm/            comtés, titres, économie, bâtiments, vassaux
    events/           moteur d'événements et langage d'effets
    diplomacy/        propositions, alliances, mariages
    intrigue/         complots du joueur et de l'IA
    war/              armées, déplacements, ravitaillement, sièges, score de guerre
    battle/           reconnaissance, déploiement, ordres, résolution, IA de bataille
    ai/               IA des souverains et des vassaux
  data/
    balance.ts        toutes les constantes d'équilibrage
    traits.ts
    units.ts          statistiques et matrice des contres
    terrain.ts
    buildings.ts
    names.ts          syllabes de la culture fictive
    map.json          comtés, adjacences, terrains, positions SVG
    events/*.json
  ui/
    screens/          Cour, Royaume, Armée, Intrigues, Chronique, Bataille
    components/
    store.ts          store Zustand qui appelle le moteur
  save/
    storage.ts        IndexedDB, emplacements, export et import JSON
    migrations.ts
  main.tsx
tests/                tests Vitest du moteur
scripts/
  simulate-battles.ts simulation en masse pour l'équilibrage
.github/workflows/
  deploy.yml          build et publication sur GitHub Pages
```

Principes :

- Le moteur expose des fonctions pures : un état et une action en entrée, un nouvel état en sortie.
- Tout tirage aléatoire passe par le générateur à graine stocké dans l'état, pour rejouer et tester une situation à l'identique.
- L'interface ne modifie jamais l'état directement : elle envoie des actions au moteur via le store.
- Aucun nombre d'équilibrage n'est écrit en dur dans le moteur : tout est dans data/balance.ts ou les fichiers de données.
- Un écran de débogage caché (appui long sur le titre) permet de lancer une bataille de test, d'ajouter de l'or ou d'avancer de 10 ans.

## 13. Plan de développement par jalons

Le jeu se construit en 9 jalons, chacun jouable et testé sur iPhone avant de passer au suivant ; la bataille arrive dès le jalon 2 pour valider tôt qu'elle est amusante.

1. Jalon 0 — Socle : repo, Vite, TypeScript, PWA, déploiement GitHub Pages, sauvegarde et export.
   - Critère : la page est en ligne, s'installe sur l'écran d'accueil et s'ouvre hors ligne.
2. Jalon 1 — Souverain et saisons : personnages, compétences, traits, famille, vieillissement, décès, succession.
   - Critère : on peut enchaîner 50 ans de jeu avec au moins 2 successions, et reprendre après fermeture de l'appli.
3. Jalon 2 — Bataille autonome : écran de bataille complet avec des armées générées, IA de bataille, script de simulation.
   - Critère : une bataille se joue en moins de 3 minutes et la simulation respecte les cibles de la section 9.11.
4. Jalon 3 — Royaume : carte SVG, comtés, revenus, bâtiments, vassaux et opinion.
   - Critère : la carte est lisible et manipulable au doigt ; les revenus réagissent aux bâtiments et à l'opinion.
5. Jalon 4 — Événements : moteur d'effets, format JSON, 40 événements écrits.
   - Critère : ajouter un événement ne demande que d'ajouter un fichier JSON.
6. Jalon 5 — Guerre de campagne : armées, déplacements, ravitaillement, sièges, score de guerre, paix, branchement sur la bataille.
   - Critère : une guerre complète se mène de la déclaration à la paix.
7. Jalon 6 — Diplomatie et intrigues : conseil, mariages, alliances, complots du joueur et de l'IA.
   - Critère : chaque proposition et chaque complot affiche ses chances et leurs raisons.
8. Jalon 7 — IA des royaumes : décisions des rivaux et des vassaux, factions, révoltes, niveaux de difficulté.
   - Critère : sur 50 ans simulés sans le joueur, les frontières bougent et aucun royaume ne fait faillite en boucle.
9. Jalon 8 — Finition : équilibrage, arbre généalogique, chronique, écran de fin, court tutoriel en 5 cartes.
   - Critère : une partie complète de 150 ans se joue sans bug bloquant.

## 14. Critères de qualité et hors périmètre

Un jalon n'est terminé que si tous ces critères de qualité sont tenus.

- TypeScript strict, aucun any non justifié.
- Tests Vitest sur chaque règle du moteur, en priorité bataille, succession, économie et sauvegarde.
- Aucune erreur dans la console, chargement en moins de 2 secondes sur iPhone récent.
- Animations fluides (60 images par seconde) sur un iPhone 12 ou plus récent.
- Une sauvegarde d'une version précédente se charge toujours, grâce aux migrations.
- Le jeu reste entièrement jouable hors ligne.

Hors périmètre de cette version :

- Multijoueur, serveur, compte utilisateur, monétisation, publication sur l'App Store.
- Musique. (Révision du 31/10/2026, à la demande du propriétaire : des effets sonores synthétisés et des vibrations ont été ajoutés, désactivables.)
- Religions et cultures multiples, hérésies, croisades.
- Carte de plus de 60 comtés, batailles navales. (Révision du 01/11/2026 : limite portée de 40 à 60 comtés, la carte en compte 48.)
- Tout nom, texte, carte, image ou son issu des jeux Paradox.

## 15. Consignes de travail pour Claude Code

Ce cahier des charges est placé dans le repo sous docs/cahier-des-charges.md ; Claude Code avance un jalon à la fois et s'arrête à la fin de chacun pour un test sur iPhone.

1. Lire tout le cahier des charges, puis créer un fichier CLAUDE.md qui résume l'architecture, les conventions et les commandes (dev, test, build, simulation).
2. Pour chaque jalon, proposer un plan court (fichiers, étapes, tests) et attendre validation avant de coder.
3. Écrire les tests d'une règle du moteur avant de brancher l'interface dessus.
4. Travailler sur une branche par jalon, avec des commits petits et explicites ; la fusion dans main déclenche le déploiement.
5. À la fin du jalon, donner le lien GitHub Pages et une liste de points à vérifier sur iPhone.
6. Demander avant de modifier une règle de ce cahier, d'ajouter une dépendance lourde ou de changer d'architecture.
7. Signaler tout déséquilibre trouvé par le script de simulation, avec une proposition de correction des valeurs dans data/balance.ts.
8. Écrire tous les textes du jeu en français ; le code, les noms de variables et les commentaires peuvent être en anglais.

Nom de repo proposé : lignees.
