# Format des événements

Chaque fichier `src/data/events/*.json` contient un tableau d'événements ; le nom du fichier donne la catégorie (`cour`, `famille`, `vassaux`, `religion`, `guerre`, `intrigue`). Un nouveau fichier est chargé automatiquement.

```json
{
  "id": "identifiant_unique",
  "titre": "Titre",
  "texte": "Texte avec variables : {vassal.nom}, {enfant.age}, {conjoint.e}",
  "declencheur": { "type": "aleatoire", "saisons": ["hiver"] },
  "conditions": [{ "opinion_vassal_max": 0 }],
  "poids": 10,
  "delai_retour": 8,
  "unique": "partie",
  "choix": [
    {
      "libelle": "…",
      "conditions": [{ "or_min": 50 }],
      "effets": [{ "or": -50 }],
      "suite": "autre_id"
    }
  ]
}
```

## Déclencheurs

`aleatoire` (tiré en début de saison, 3 maximum), `complot_decouvert` (rôle `complotiste` fourni), `suite` (seulement enchaîné par un choix).

## Rôles et variables

Rôles détectés automatiquement dans le texte, les conditions et les effets : `souverain`, `conjoint`, `heritier`, `enfant`, `vassal`, `rival`, `courtisan`, `comte`, `comte_rival`, `complotiste`.
Champs de texte : `.nom`, `.nom_complet`, `.age`, `.il`/`.Il`, `.le`, `.fils` (fils/fille), `.e` (accord féminin). Variables globales : `{annee}`, `{saison}`.

## Conditions (toutes les clés d'un objet doivent être vraies)

Souverain : `or_min`, `or_max`, `prestige_min`, `piete_min`, `piete_max`, `sante_max`, `age_min`, `age_max`, `trait`, `pas_trait`, `en_guerre`, `a_conjoint`, `comtes_min`, `competence_min`/`competence_max` (`{ "competence": "guerre", "valeur": 12 }`), `armee_levee`, `annee_min`.
Rôles : `opinion_vassal_max`/`min`, `vassal_trait`, `enfant_age_min`/`max`, `heritier_age_min`/`max`, `conjoint_trait`, `courtisan_trait`, `rival_opinion_max`, `comte_developpement_min`/`max`.

## Hasard et variantes

- `"texte"` peut être une liste : une variante est tirée au sort quand l'événement survient.
- L'effet `hasard` donne une issue incertaine, dont la probabilité est affichée avant le choix :

```json
{
  "hasard": {
    "chance": 0.6,
    "succes": [{ "prestige": 30 }],
    "echec": [{ "sante": -20 }],
    "texte_succes": "Vous l'emportez.",
    "texte_echec": "Vous mordez la poussière."
  }
}
```

- Chaque partie tire aussi un biais par événement aléatoire (×0,4 à ×1,8, ou absent dans 12 % des cas) : d'une partie à l'autre, les mêmes événements ne reviennent pas au même rythme.

## Effets

`or`, `prestige`, `piete`, `renommee`, `opinion` (`{ "cible": "vassal", "valeur": 20 }`), `opinion_vassaux`, `trait_ajout` / `trait_retrait` (id ou `{ "cible", "trait" }`), `sante` (nombre ou `{ "cible", "valeur" }`), `competence` (`{ "competence", "valeur", "cible"? }`), `revendication` (`"comte_rival"`), `guerre` (`{ "cible": "rival", "attaquant": "souverain" | "rival" }`), `complot` (`{ "type", "cible" }`), `naissance`, `deces`, `developpement`, `ravitaillement`, `levees`, `ami`, `devient_rival`, `emprisonner`, `liberer`, `exiler`.

Chaque choix affiche automatiquement ses effets connus avant validation.

## Ajouts (version 3)

**Déclencheurs** : `decision` (ouvert par une décision active, voir `src/data/decisions.ts`), `relation_ami`, `relation_rival`, `relation_amant` (rôle `proche` fourni), `peste` (rôle `comte` fourni).

**Rôles** : `ami`, `ennemi` (rival personnel), `amant`, `proche` (courtisan, conseiller ou vassal). Un rôle utilisé n'importe où dans l'événement est requis : sans candidat, l'événement n'est pas tiré.

**Variables** : `{etranger}`, `{etranger2}` (royaumes d'outre-mer de la partie).

**Conditions** : `drapeau`, `pas_drapeau`, `stress_min`, `stress_max`, `a_ambition`, `epidemie`, `cotier`.

**Effets** :

- `stress` : nombre, ou par trait (`{ "juste": 20, "cruel": -10, "*": 5 }`) — agir contre sa nature stresse.
- `xp` : `{ "competence": "guerre", "valeur": 30, "cible"? }` — expérience vers l'arbre de talents.
- `drapeau` / `retirer_drapeau`, `suite_differee` (`{ "id", "saisons" }`) : chaînes d'événements sur plusieurs années.
- `amant`, `fin_amant`, `reconciliation` : relations personnelles.
- `epidemie`, `quarantaine` : épidémies qui se propagent de comté en comté.
- `nouveau_courtisan` : `{ "age_min", "age_max", "guerre"?, "trait"? }`.
- `bataille` : `{ "ennemi", "force", "composition"?, "attaque"?, "victoire": [...], "defaite": [...] }` — une bataille jouée sur-le-champ (armée levée, sinon levées d'urgence).
- `hasard` accepte `"competence"` : la chance varie de ±2,5 % par point autour de 10.

## Économie locale (version 4)

**Déclencheur** : `revolte_paysanne` (rôle `comte` fourni, contentement sous le seuil de révolte).

**Conditions** : `comte_contentement_max` / `comte_contentement_min`, `comte_impots` (`faible`, `normal`, `eleve`, `ecrasant`), `contentement_moyen_max` / `contentement_moyen_min` (domaine), `edit` / `pas_edit` (identifiant d'édit, voir `src/data/edicts.ts`), `dette` (le souverain a des emprunts).

**Effets** : `contentement` (comté du rôle `comte`, sinon tout le domaine), `impots` (fixe le taux du comté du rôle `comte`).

**Westeros (v6)** : effets `mur` (`{ "hommes", "vivres", "menace", "sauvageons", "verredragon", "submerger", "liberer" }`, les deux derniers sur le comté du rôle `comte`), `essos` (`{ "armee", "mort" }`), `prendre_le_noir` (rôle), et `influence` (`{ "cible": "rival", "valeur": 40 }`) — influence du souverain à la cour d'un souverain indépendant (voir Royaume › Lois et la fiche de royaume).

**Arrivées à la cour (v5)** : `nouveau_courtisan` accepte `competence` (`{ competence, valeur }`), `femme`, `trait` et `pupille` (enfant confié à la cour). Effet interne `pupille` (avenir d'un pupille adulte).
