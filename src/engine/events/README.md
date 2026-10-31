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

## Effets

`or`, `prestige`, `piete`, `renommee`, `opinion` (`{ "cible": "vassal", "valeur": 20 }`), `opinion_vassaux`, `trait_ajout` / `trait_retrait` (id ou `{ "cible", "trait" }`), `sante` (nombre ou `{ "cible", "valeur" }`), `competence` (`{ "competence", "valeur", "cible"? }`), `revendication` (`"comte_rival"`), `guerre` (`{ "cible": "rival", "attaquant": "souverain" | "rival" }`), `complot` (`{ "type", "cible" }`), `naissance`, `deces`, `developpement`, `ravitaillement`, `levees`, `ami`, `devient_rival`, `emprisonner`, `liberer`, `exiler`.

Chaque choix affiche automatiquement ses effets connus avant validation.
