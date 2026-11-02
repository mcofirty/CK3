/**
 * Glossaire : les mécaniques, les éléments et le vocabulaire du jeu.
 * Les sections « générées » lisent les données du jeu : elles restent toujours exactes.
 */
import { AMBITIONS } from './ambitions';
import { HOUSE_COLORS } from './heraldry';
import { GOVERNMENTS, LAW_CHANGE_OPINION, LAW_COOLDOWN, SUCCESSION_LAWS } from './governments';
import { BALANCE } from './balance';
import { BUILDINGS, BUILDING_TYPES } from './buildings';
import { DECISIONS } from './decisions';
import { EDICTS } from './edicts';
import { MERCENARIES } from './mercenaries';
import { BRANCH_NAMES, LEGACIES, LEGACY_BRANCH_NAMES, PERKS } from './perks';
import { TACTICS, TACTIC_IDS } from './tactics';
import { TERRAINS } from './terrain';
import { TRAITS } from './traits';
import { COUNTERS, UNITS, UNIT_TYPES } from './units';

export interface GlossaryEntry {
  term: string;
  text: string;
  /** Autres façons de le chercher. */
  aka?: string;
}
export interface GlossarySection {
  id: string;
  title: string;
  icon: string;
  entries: GlossaryEntry[];
}

const B = BALANCE;
const LAW_LIST = (Object.keys(SUCCESSION_LAWS) as (keyof typeof SUCCESSION_LAWS)[])
  .map(
    (k) =>
      `${SUCCESSION_LAWS[k].name} (${SUCCESSION_LAWS[k].cost} prestige) : ${SUCCESSION_LAWS[k].description}`,
  )
  .join(' ');
const GOV_LIST = (Object.keys(GOVERNMENTS) as (keyof typeof GOVERNMENTS)[])
  .map((k) => {
    const g = GOVERNMENTS[k];
    const fx = [
      g.income && `revenus ${g.income > 0 ? '+' : ''}${Math.round(g.income * 100)} %`,
      g.levies && `levées ${g.levies > 0 ? '+' : ''}${Math.round(g.levies * 100)} %`,
      g.vassalOpinion && `vassaux ${g.vassalOpinion > 0 ? '+' : ''}${g.vassalOpinion}`,
    ]
      .filter(Boolean)
      .join(', ');
    return `${g.name}${fx ? ` (${fx})` : ''} : ${g.description}`;
  })
  .join(' ');
const pc = (x: number) => `${Math.round(x * 100)} %`;
const f = (x: number) => String(x).replace('.', ',');

const concepts: GlossarySection[] = [
  {
    id: 'bases',
    title: 'Bases du jeu',
    icon: '🧭',
    entries: [
      {
        term: 'Saison',
        aka: 'tour',
        text: `Un tour = une saison (printemps, été, automne, hiver), donc 4 par an. Le bouton « Fin de saison » résout les déplacements et les batailles, puis la vie (santé, naissances, décès), les revenus et les événements.`,
      },
      {
        term: 'Durée d’une partie',
        text: `La chronique s’achève après ${B.game.maxYears} ans, ou plus tôt si la lignée s’éteint ou perd toutes ses terres.`,
      },
      {
        term: 'Or',
        text: 'La monnaie. Revenus des comtés, impôts des vassaux et du domaine ; dépenses en troupes, salaires de la cour, intérêts des emprunts, entretien des édits. Le détail de la dernière saison s’affiche en touchant l’or dans la barre du haut.',
      },
      {
        term: 'Prestige',
        text: 'Votre réputation personnelle. Il monte avec les victoires, les titres et les belles actions, et il sert à fonder des titres, changer la loi de succession ou faire accepter vos offres. Il se perd avec les complots découverts et les actes honteux. La moitié passe à l’héritier.',
      },
      {
        term: 'Piété',
        text: 'Votre dévotion. Elle vient du Savoir, des chapelles, du chapelain, des pèlerinages et des aumônes. Elle ouvre ou ferme certains choix d’événements. La moitié passe à l’héritier.',
      },
      {
        term: 'Renommée',
        text: `La gloire de la maison, qui s’accumule chaque saison (selon le nombre de comtés tenus), avec les mariages, victoires et ambitions. Elle compte pour le score et s’échange contre des héritages (voir Maison).`,
      },
      {
        term: 'Score de lignée',
        text: 'Renommée + 10 par comté + 30 par duché + 100 par royaume tenus par la maison + 2 par année écoulée. Il est affiché à la fin de la partie.',
      },
      {
        term: 'Fins de partie',
        text: 'L’Empire (deux couronnes), la Couronne (un royaume), la Puissance (douze comtés ou plus), la Légende (renommée de 1500), la Survie, l’Extinction (aucun héritier) et la Ruine (plus aucune terre).',
      },
      {
        term: 'Sauvegarde',
        text: 'Automatique à chaque fin de saison et quand l’app passe en arrière-plan, sur l’un des 3 emplacements. Vous pouvez exporter une partie en fichier JSON depuis les Paramètres et l’importer sur un autre appareil.',
      },
      {
        term: 'Origine',
        text: 'Chaque partie tire au hasard une origine (maison endettée, trésor de guerre, citadelle…) et une carte différente, avec des royaumes rivaux et des fréquences d’événements propres.',
      },
    ],
  },
  {
    id: 'persos',
    title: 'Personnages',
    icon: '👤',
    entries: [
      {
        term: 'Compétences',
        text: 'Cinq notes de 0 à 20 (jusqu’à 25 avec traits et talents) : Diplomatie (opinion, alliances, mariages), Guerre (commandement), Gestion (revenus, places de cour), Ruse (complots, défense contre eux), Savoir (développement, piété, éducation).',
      },
      {
        term: 'Santé',
        text: 'De 0 à 100. Elle baisse avec l’âge (après 50 ans), les maladies, les blessures et le stress. Sous 30, le risque de décès grimpe.',
      },
      {
        term: 'Majorité',
        text: `À ${B.characters.adulthood} ans, un enfant devient adulte : il reçoit un trait d’éducation selon son éducateur, des traits de personnalité, et peut se marier, commander ou siéger au conseil.`,
      },
      {
        term: 'Traits',
        text: 'Quatre catégories : personnalité (Courageux, Juste, Cruel… avec des contraires), éducation (selon la compétence travaillée), héréditaires (Fort, Génie… transmis aux enfants) et acquis (Blessé, Malade, ou gagnés au combat). Ils modifient compétences, santé, opinion des vassaux et choix possibles.',
      },
      {
        term: 'Opinion',
        text: 'Ce qu’un personnage pense d’un autre, de −100 à +100, avec le détail des raisons (traits communs ou opposés, famille, amitié, guerre, souvenirs…). Les vassaux mécontents paient moins et peuvent former des factions.',
      },
      {
        term: 'Ami, rival, amant',
        text: 'Des relations personnelles qui naissent à la cour ou par événements. Un ami donne +30 d’opinion, un rival −40, un amant +40. Un amant peut provoquer des scènes avec le conjoint.',
      },
      {
        term: 'Souvenir',
        aka: 'vengeance, rancune',
        text: 'Faire périr ou emprisonner quelqu’un laisse un souvenir à sa famille et à ses amis, qui dure longtemps. Un souvenir sanglant peut pousser un rival à comploter contre vous.',
      },
      {
        term: 'Stress',
        text: `Agir contre sa nature (un souverain Juste qui fait exécuter) l’augmente ; il retombe de ${B.stress.decay} par saison (plus avec certains traits ou talents). Tendu dès ${B.stress.tense}, accablé dès ${B.stress.overwhelmed} (la santé baisse), en crise à ${B.stress.crisis} : un événement impose alors un exutoire (vin, colère, mélancolie…) qui laisse un trait.`,
      },
      {
        term: 'Expérience et talents',
        text: `Les personnages gagnent de l’expérience par branche (saisons, conseil, batailles, complots, chantiers, mariages). Tous les ${B.progression.xpPerPoint} points d’expérience donnent un point de talent à dépenser dans l’arbre de compétences (30 talents en 5 branches). Les talents appartiennent au personnage et disparaissent à sa mort.`,
      },
      {
        term: 'Héritage de la maison',
        text: 'Bonus achetés avec la renommée (15 en 5 branches) qui profitent à tous les membres de la dynastie et durent jusqu’à la fin de la partie. Un héritage de rang 2 ou 3 exige celui du rang précédent.',
      },
      {
        term: 'Ambition',
        text: 'À son avènement, le souverain choisit un grand but parmi trois (agrandir le royaume, ceindre une couronne, remplir le trésor…) avec une échéance. Réussir donne prestige, renommée, expérience et le trait Accompli ; échouer ou y renoncer ajoute du stress.',
      },
      {
        term: 'Éducation',
        text: 'Les enfants de la maison (et les pupilles) sont éduqués par un membre de la cour sur une compétence choisie. À la majorité, ils gagnent des points dans cette compétence et un trait d’éducation, meilleur si l’éducateur est compétent. Par défaut c’est automatique : dès son arrivée à la cour (naissance, pupille), l’enfant travaille sa plus haute compétence avec l’adulte de la cour le plus fort dans cette compétence ; si l’éducateur disparaît, un autre le remplace. Cour › Maison › « Éducation des enfants » permet de choisir soi-même éducateur et compétence, ou de revenir à « Automatique ».',
      },
      {
        term: 'Pupille',
        text: 'Enfant d’un de vos vassaux confié à votre cour. Il est éduqué avec vos enfants et le vassal vous en est reconnaissant. À 16 ans, vous le renvoyez chez lui avec honneur (le vassal vous en sait gré) ou le gardez comme conseiller (le vassal le prend mal, l’enfant vous est loyal).',
      },
      {
        term: 'Otage',
        text: 'Un prisonnier gardé à votre cour. Sa famille ne peut plus vous déclarer la guerre tant qu’il y reste, et une trêve s’installe.',
      },
      {
        term: 'Prisonnier et rançon',
        text: 'Un commandant ou un souverain capturé peut être rançonné (or ou comté), libéré, gardé en otage, rallié à votre cause (une tentative, selon ses traits) ou exécuté (stress et vengeance de sa famille).',
      },
    ],
  },
  {
    id: 'royaume',
    title: 'Royaume et titres',
    icon: '🏰',
    entries: [
      {
        term: 'Comté',
        text: 'L’unité de base de la carte, avec un terrain, un développement, des bâtiments, un peuple et des levées. Il est tenu par un seigneur : vous (domaine propre) ou l’un de vos vassaux.',
      },
      {
        term: 'Duché et royaume',
        text: 'Des titres regroupant des comtés. On peut fonder un duché ou un royaume en tenant assez de leurs comtés (50 % pour un duché, 60 % pour un royaume), contre prestige et or. Chaque titre rapporte prestige et renommée.',
      },
      {
        term: 'Domaine propre',
        text: 'Les comtés que vous tenez directement, par opposition à ceux de vos vassaux. Il est limité (base 3, plus 1 par 5 de Gestion) : au-delà, vos revenus baissent et vos vassaux grognent.',
      },
      {
        term: 'Vassal et suzerain',
        text: 'Un vassal tient des comtés de vous et vous verse impôts et levées selon son opinion. Le suzerain est son seigneur direct. Un vassal très mécontent peut rejoindre une faction puis se révolter.',
      },
      {
        term: 'Faction et révolte',
        text: 'Des vassaux mécontents s’unissent contre leur suzerain. Si leur force dépasse un seuil, ils lèvent des troupes et réclament l’indépendance par la guerre.',
      },
      {
        term: 'Capitale',
        text: `Le comté où siège un seigneur (★), un seul par seigneur. Revenus et levées +${pc(B.capital.incomeMult - 1)}, développement ${pc(B.capital.devGrowthMult - 1)} plus rapide et plafond relevé de ${B.capital.devMaxBonus}, +${B.capital.extraSlots} emplacement de bâtiment, +${B.capital.fort} fortification (jusqu’à ${B.capital.fortMax}), population ×${B.population.capitalMult}. Elle passe à l’héritier.`,
      },
      {
        term: 'Capitale occupée et capitulation',
        text: `Occuper la capitale ennemie rapporte ${B.capital.occupationScore} points de guerre et prive son seigneur de ${pc(B.capital.occupiedIncomeLoss)} des revenus du domaine. Tenue ${B.capital.capitulateSeasons} saisons, sa reddition peut être exigée dès ${B.capital.demandScore} de score, et une IA en mauvaise posture capitule d’elle-même. Perdue à la paix, elle coûte ${-B.capital.lostPrestige} prestige ; la ville est mise à sac et la cour s’installe ailleurs.`,
      },
      {
        term: 'Déplacer sa capitale',
        text: `Depuis la fiche d’un comté tenu en propre : ${B.capital.moveGold} or et ${B.capital.movePrestige} prestige. L’ancienne capitale perd ses avantages et grogne (${B.capital.moveOldContentment} contentement), la nouvelle se réjouit. Pas d’autre déménagement avant ${B.capital.moveCooldownSeasons / 4} ans.`,
      },
      {
        term: 'Population',
        text: `Le nombre d’âmes d’un comté : (${B.population.base} + ${B.population.perDevelopment} par niveau de développement) × terrain (plaine ×${B.population.terrain.plaine}, montagne ×${B.population.terrain.montagne}…) × capitale × vitalité.`,
      },
      {
        term: 'Vitalité',
        text: `L’état de la population (100 % = normale, de ${pc(B.population.vitalityMin)} à ${pc(B.population.vitalityMax)}). Elle multiplie revenus et levées du comté. Épidémie (−${pc(B.population.plagueLoss)} par saison), occupation (−${pc(B.population.occupationLoss)}), pillage (−${pc(B.population.lootLoss)}), assaut, révolte et famine la font chuter ; elle remonte de ${pc(B.population.recovery)} par saison vers une cible fixée par le contentement.`,
      },
      {
        term: 'Loi de succession',
        text: `Royaume › Lois. ${LAW_LIST}. Le gouvernement fixe les lois permises. Changer de loi coûte du prestige, irrite les vassaux (${LAW_CHANGE_OPINION} d’opinion) et ne peut se refaire avant ${LAW_COOLDOWN / 4} ans ; un aperçu montre qui hériterait sous chaque loi. Le conjoint n’hérite jamais : les terres d’une souveraine vont à ses enfants. Sous le partage, une couronne tenue en union revient au cadet.`,
      },
      {
        term: 'Gouvernement',
        text: `${GOV_LIST}. Réformer coûte prestige et or : passer de la tribu à la féodalité exige une capitale assez développée, centraliser exige une couronne royale. Une loi devenue interdite cède la place à la loi d’usage du nouveau gouvernement.`,
      },
      {
        term: 'Élection',
        text: 'Sous la loi élective, le souverain (3 voix) et chaque vassal (1 voix) votent pour l’adulte de la maison qu’ils préfèrent, selon leur opinion de lui et ses talents ; le souverain penche pour ses enfants, un vassal candidat vote pour lui-même. Les intentions de vote s’affichent dans « Lois et gouvernement ».',
      },
      {
        term: 'Loi agnatique',
        text: `Les femmes sont exclues de la succession (${B.crowns.agnaticCost} prestige à instaurer, abolition gratuite) : une fille ne peut faire passer vos terres à la maison de son mari. Sous cette loi, une femme qui règne malgré tout rend les droits sur sa maison « forts ».`,
      },
      {
        term: 'Union personnelle',
        text: `Un souverain qui hérite d’un autre royaume (enfant de deux souverains, pacte successoral, droit dynastique victorieux) porte deux couronnes : chacune garde ses coutumes. La couronne où il ne réside pas grogne (contentement ${B.crowns.distantContentment} par saison, vassaux ${B.crowns.distantOpinion}). Ses Grands demandent d’abord leurs privilèges : les confirmer (${B.crowns.privilegesGold} or, grogne réduite, fusion plus lointaine) ou imposer votre autorité (vassaux ${B.crowns.imposeOpinion}, fusion plus proche). Après ${B.crowns.fuseSeasons / 4} ans de règne commun, « Unir les couronnes » (${B.crowns.fuseCost} prestige, +${B.crowns.fuseRenown} renommée) fond les deux royaumes ; les vassaux de l’ancienne couronne le prennent mal.`,
      },
      {
        term: 'Fiche de royaume',
        text: 'Depuis la fiche d’un souverain, d’un comté ou d’un personnage régnant (et Royaume › Lois pour la vôtre) : le souverain, sa loi de succession, l’héritier attendu, la ligne de succession (six noms, avec leur lien de parenté), les prétendants de sang, les couronnes réunies et vos pactes.',
      },
      {
        term: 'Influence',
        text: `Votre poids dans une cour étrangère, de 0 à ${B.influence.max}. Elle se gagne par le chancelier (« Gagner de l’influence », ${B.influence.chancellorPerDiplomacy} par point de Diplomatie et par saison), en courtisant les Grands (${B.influence.courtGold} or, +${B.influence.courtGain}), par les cadeaux (+${B.influence.giftGain}) et les liens de famille (+${B.influence.familyTie} par saison) ; elle s’érode de ${B.influence.decay} par saison. Elle facilite mariages, alliances, pactes, protection et traités (+${B.influence.acceptancePerPoint} par point). Soutenez un candidat dans la fiche du royaume : à la mort du souverain, les Grands l’acclament si votre influence atteint ${B.influence.supportThreshold} (héritier de la ligne) ou ${B.influence.outsiderThreshold} (prétendant d’une autre maison, vous compris). L’élu vous doit sa couronne ; l’héritier écarté ne vous le pardonnera pas. Un prétendant soutenu à ${B.influence.supportThreshold} a un droit fort.`,
      },
      {
        term: 'Droits dynastiques',
        text: `Un enfant reçoit des droits sur la maison régnante de son parent étranger, et hérite de ceux de ses parents (${B.crowns.maxClaims} au plus). Un droit est fort quand la maison visée est fragile (souverain enfant, captif, sans enfant) ; sinon faible. Depuis Royaume › Lois › Droits dynastiques, faites valoir les droits d’un membre de votre maison ou de votre cour par la guerre (droit fort : gratuit ; faible : ${B.crowns.weakClaimPrestige} prestige) : victorieux, il monte sur le trône et devient votre vassal, ou vous ceignez la couronne vous-même. Des prétendants viennent parfois demander asile.`,
      },
      {
        term: 'Contrat de mariage',
        text: `Renonciation : votre parent renonce aux droits de sa descendance sur votre maison (${B.crowns.clauseRenunciation}). Matrilinéaire : les enfants d’une femme de votre maison portent votre nom (${B.crowns.clauseMatrilineal}, ${B.crowns.clauseMatrilinealLower} face à une maison de moindre rang). Hommage : le souverain qui épouse votre famille devient votre vassal (${B.crowns.clauseHomage}, selon le rapport de force). Une dot ajoute 1 point par ${B.crowns.dowryGoldPerPoint} or.`,
      },
      {
        term: 'Protection',
        text: 'Un souverain lié à votre famille (mariage, sang) peut devenir votre vassal en gardant terres et titres. Il accepte selon le rapport de force, la menace qui pèse sur lui (voisin hostile, droits forts contre sa maison), l’étendue de ses terres, son opinion et son caractère.',
      },
      {
        term: 'Pactes de famille et successoral',
        text: `Pacte de famille (entre alliés liés par la famille) : appel aux armes facilité (+${B.crowns.familyPact.callBonus}), ni guerre ni complot entre vous, terres échangées plus volontiers. Pacte successoral : si l’un meurt sans héritier, l’autre hérite (union personnelle). Rompre un pacte est un parjure : ${B.crowns.perjuryPrestige} prestige, ${B.crowns.perjuryRenown} renommée, toutes les cours vous en tiennent rigueur.`,
      },
      {
        term: 'Héritier',
        text: 'Le premier enfant vivant, sinon petits-enfants, frères et sœurs, puis le reste de la dynastie. À votre mort vous incarnez l’héritier ; s’il n’y en a pas, la lignée s’éteint.',
      },
      {
        term: 'Revendication',
        text: 'Un droit sur un comté d’autrui, hérité, fabriqué par le chancelier ou obtenu par événement. Elle permet de déclarer une guerre de revendication.',
      },
      {
        term: 'Développement',
        text: 'Le niveau d’un comté (1 à 10, 12 pour une capitale). Il augmente ses revenus et ses levées et monte avec le Savoir du seigneur, les bâtiments, les talents et un contentement élevé ; il baisse avec le pillage, les épidémies et les révoltes.',
      },
      {
        term: 'Fortification',
        text: 'De 0 à 3 (terrain, muraille), 4 pour une capitale. Un siège dure 1 saison + 1 par niveau.',
      },
      {
        term: 'Route',
        text: 'Un bâtiment qui permet à une armée de traverser 2 comtés par saison.',
      },
    ],
  },
  {
    id: 'economie',
    title: 'Économie',
    icon: '💰',
    entries: [
      {
        term: 'Revenus d’un comté',
        text: 'Base (développement + bâtiments) × taux d’impôts × effet du contentement × bonus du seigneur (Gestion, talents, édits).',
      },
      {
        term: 'Impôts',
        text: `Quatre niveaux par comté : faibles (revenus ×${f(B.local.taxes.faible.income)}, contentement ${B.local.taxes.faible.contentment > 0 ? '+' : ''}${B.local.taxes.faible.contentment}/saison), normaux (×1), élevés (×${f(B.local.taxes.eleve.income)}, ${B.local.taxes.eleve.contentment}) et écrasants (×${f(B.local.taxes.ecrasant.income)}, ${B.local.taxes.ecrasant.contentment}). Un bouton règle tout le domaine d’un coup.`,
      },
      {
        term: 'Conscription',
        text: `Légère, normale ou lourde par comté : une conscription lourde donne ×${f(B.local.conscription.lourde.levies)} levées mais freine le développement (×${f(B.local.conscription.lourde.development)}) et mécontente.`,
      },
      {
        term: 'Contentement',
        text: `L’humeur du peuple d’un comté, de 0 à 100 (60 au départ). Il pèse sur revenus (×${f(B.local.contentIncome.min)} à ×${f(B.local.contentIncome.max)}), levées et développement. Il évolue chaque saison selon les impôts, la conscription, les édits, les chapelles, l’occupation, les épidémies, puis revient doucement vers le calme.`,
      },
      {
        term: 'Révolte paysanne',
        aka: 'jacquerie',
        text: `Sous ${B.local.revoltThreshold} de contentement, le peuple peut se révolter : vous choisissez de céder, d’écraser la révolte en bataille ou de négocier.`,
      },
      {
        term: 'Couche « Peuple »',
        text: 'Sur la carte, colore vos comtés du rouge (colère) au vert (prospérité).',
      },
      {
        term: 'Entretien des troupes',
        text: 'Chaque compagnie coûte de l’or par saison, qu’elle soit professionnelle ou levée en campagne. Une trésorerie négative provoque désertions et mécontentement.',
      },
      {
        term: 'Emprunt',
        text: `Les banquiers prêtent jusqu’à ${B.local.loanCapSeasons} saisons de revenus du domaine, à ${pc(B.local.loanRate)} d’intérêt par saison, remboursable quand vous voulez. Les dettes passent à l’héritier.`,
      },
      {
        term: 'Places gratuites de la cour',
        text: `Votre cour compte ${B.entourage.freeBase} places sans salaire, plus un bonus de rang (duc +1, roi +3) et 1 par ${B.entourage.gestionPerSlot} de Gestion. Au-delà, chaque courtisan extérieur coûte un salaire par saison (environ 1 à 4 or selon sa meilleure compétence). Toute la famille (maison, conjoint, gendres et brus, belle-famille, petits-enfants), les pupilles et les otages sont gratuits.`,
      },
      {
        term: 'Trésorier',
        text: 'Politique de trésorerie. Prudent (par défaut) : quand l’or prévu passe sous zéro, il relève les impôts de quelques comtés contents, puis laisse partir le courtisan payé le moins utile. Manuel : aucune mesure automatique. Dans tous les cas, un trésor négatif fait partir un courtisan payé par saison.',
      },
      {
        term: 'Tribut et cadeau',
        text: `Un tribut est de l’or exigé d’un plus faible que vous (${B.diplomacy.tribute.amount} or). Un cadeau (${B.economy.giftCost} or) donne +${B.economy.giftOpinion} d’opinion pendant 4 ans.`,
      },
    ],
  },
  {
    id: 'cour',
    title: 'Cour et conseil',
    icon: '🪑',
    entries: [
      {
        term: 'Courtisan',
        text: 'Un personnage qui vit à votre cour sans tenir de terres. Il peut siéger au conseil, commander une armée ou éduquer vos enfants.',
      },
      {
        term: 'Conseil',
        text: 'Cinq postes occupés par vos courtisans et vassaux, chacun lié à une compétence et à une tâche : Chancelier (Diplomatie : améliorer les relations, fabriquer une revendication), Maréchal (Guerre : entraîner les troupes, augmenter les levées), Intendant (Gestion : collecter les impôts, développer un comté), Maître-espion (Ruse : démasquer les complots, espionner une cour), Chapelain (Savoir : gagner de la piété, éduquer un héritier).',
      },
      {
        term: 'Candidats de passage',
        text: 'Chaque printemps, 3 à 5 candidats se présentent (chevalier errant, lettré, intendant, émissaire, conseiller de l’ombre, cadet bien né). L’engagement coûte une prime ; il est accepté selon votre prestige, votre Diplomatie et la renommée du talent (un très grand talent est recherché ailleurs). Ils repartent au printemps suivant.',
      },
      {
        term: 'Congédier',
        text: 'Un courtisan renvoyé quitte la cour, libère sa place et son salaire, et vous en garde une légère rancune.',
      },
      {
        term: 'Débaucher',
        text: 'Offrir de l’or à un courtisan d’une cour rivale. Il est plus tenté s’il est mécontent de son seigneur, ambitieux ou avare. Réussi ou non, son seigneur vous en veut.',
      },
      {
        term: 'Rallier',
        text: 'Proposer à un prisonnier sans terre de vous servir (une seule tentative, une prime). Les lâches, avares et ambitieux cèdent plus facilement ; les justes et courageux, moins.',
      },
      {
        term: 'Décisions',
        text: 'Cour › Souverain › « Actions du souverain » : ce que vous lancez vous-même (tournoi, chasse, festin, pèlerinage…), chacune avec un coût, un délai avant de recommencer et un événement qui en décide l’issue.',
      },
    ],
  },
  {
    id: 'intrigues',
    title: 'Diplomatie et intrigues',
    icon: '🕊️',
    entries: [
      {
        term: 'Mariage',
        text: 'Unit deux personnages célibataires et adultes de maisons différentes. Il rapproche deux cours (+20 d’opinion entre souverains), rapporte renommée et prestige s’il est prestigieux. L’acceptation dépend de l’opinion, du rang et de l’âge.',
      },
      {
        term: 'Alliance',
        text: `Un pacte entre souverains : vous pouvez appeler votre allié aux armes dans une guerre. On ne peut pas déclarer la guerre à un allié : rompez d’abord l’alliance depuis sa fiche (Monde › Cours), au prix de ${-B.diplomacy.breakAlliance.prestige} prestige et de sa rancune. L’attaquer dans les ${B.diplomacy.breakAlliance.treacherySeasons} saisons qui suivent est une traîtrise (${B.diplomacy.breakAlliance.treacheryPrestige} prestige, toutes les cours vous en veulent).`,
      },
      {
        term: 'Appel aux armes',
        text: `Depuis une guerre (Armée › Guerres › Appeler à l’aide), demandez à un souverain de vous rejoindre. Un allié répond plus volontiers (liens du mariage, hostilité envers l’ennemi commun) ; s’il refuse, l’alliance est rompue. Un souverain sans alliance part de ${B.diplomacy.callToArms.noAlliance} mais peut être convaincu par un subside (1 point par ${B.diplomacy.callToArms.goldPerPoint} or, versé seulement s’il accepte) ; un refus le rend sourd ${B.diplomacy.callToArms.refusalCooldown} saisons.`,
      },
      {
        term: 'Traité de terres',
        text: `Acheter, vendre ou échanger des comtés tenus en propre (jamais une capitale), avec de l’or de part et d’autre : depuis la fiche d’un souverain (Négocier) ou d’un comté étranger (Proposer d’acheter). Chaque comté vaut ses revenus sur ${B.trade.incomeSeasons} saisons, plus ${B.trade.perDevelopment} or par développement, ${B.trade.perBuildingLevel} par niveau de bâtiment et ${B.trade.perFort} par fortification ; isolé de son domaine, il vaut ${pc(B.trade.exclave)} aux yeux de l’acquéreur, et l’on tient à sa propre terre (×${B.trade.attachment}). « Équilibrer avec de l’or » calcule la soulte qui ferait accepter l’offre. Un refus bloque la négociation ${B.trade.refusalCooldown} saisons ; une offre insultante vexe. L’IA propose parfois d’acheter un de vos comtés frontaliers, ou de vous en vendre un quand elle manque d’or.`,
      },
      {
        term: 'Trêve',
        text: `Après une guerre, aucune attaque possible pendant ${B.game.truceSeasons} saisons (davantage avec un otage).`,
      },
      {
        term: 'Complot',
        text: 'Un seul à la fois. Quatre types : assassiner (la cible meurt, ou l’attentat échoue), discréditer (prestige et opinion en baisse), gagner l’amitié, inciter un vassal rival à la révolte. Cibles possibles : souverains rivaux, leurs vassaux et leur famille proche (enfants compris, mieux protégés par la Ruse du seigneur).',
      },
      {
        term: 'Agents',
        text: `Jusqu’à ${B.intrigue.maxAgents}, payés ${B.intrigue.agentCost} or chacun : ils accélèrent le complot mais augmentent le risque d’être découvert.`,
      },
      {
        term: 'Découverte',
        text: `Chaque saison, un complot peut être démasqué (risque affiché). La cible vous en veut (${B.intrigue.discoveredOpinion} d’opinion) et vous perdez ${-B.intrigue.discoveredPrestige} de prestige. Un assassinat réussi pèse sur la conscience (stress) et la famille peut deviner qui a frappé.`,
      },
      {
        term: 'Acceptation',
        aka: 'chance, verdict',
        text: 'Pour mariages, alliances, engagements ou pupilles, le jeu affiche un score avec le détail de ses facteurs : à 0 ou plus, l’offre est acceptée. Pour rallier ou débaucher, le score donne une chance de réussite (50 % à 0), tirée au sort.',
      },
    ],
  },
  {
    id: 'guerre',
    title: 'Guerre',
    icon: '⚔️',
    entries: [
      {
        term: 'Casus belli',
        aka: 'cb, motif de guerre',
        text: 'Le motif d’une guerre : revendication (sur un comté revendiqué), conquête (royaume ou Ambitieux, coûte du prestige, comté voisin), indépendance (d’un vassal contre son suzerain) ou défense. Le comté visé est l’objectif de guerre.',
      },
      {
        term: 'Levées',
        text: 'Hommes appelés des comtés, gratuits tant qu’ils restent chez eux, puis payés en campagne. Elles se reconstituent chaque saison, selon développement, bâtiments, conscription et contentement. Gardées trop longtemps, elles se dispersent.',
      },
      {
        term: 'Compagnies professionnelles',
        text: 'Soldats entretenus en permanence, recrutés par bloc de 100 hommes dans les comtés dotés des bâtiments requis. Leur nombre de départ est ajusté au revenu pour ne pas ruiner le seigneur.',
      },
      {
        term: 'Mercenaires',
        text: `Compagnies à louer sur contrat de ${B.mercenaries.contractSeasons} saisons, disponibles tout de suite mais chères. À la fin, elles partent avec leurs survivants et ne reviennent qu’après un délai.`,
      },
      {
        term: 'Armée',
        text: 'Un seul corps levé par souverain, avec un commandant principal et deux commandants de front. Le souverain qui commande donne +10 de moral mais risque blessure et capture.',
      },
      {
        term: 'Ravitaillement',
        text: 'Stock de l’armée (0 à 100). Il se reconstitue en terre amie et baisse en terre ennemie, plus vite en hiver. À zéro, l’usure triple.',
      },
      {
        term: 'Usure',
        text: 'Les armées perdent des hommes chaque saison, davantage en hiver, en terrain difficile ou sans ravitaillement.',
      },
      {
        term: 'Pillage',
        text: 'Une armée pille un comté ennemi : ravitaillement et or gagnés, mais développement et contentement du comté détruits, et son seigneur vous en veut.',
      },
      {
        term: 'Siège',
        text: 'Une armée en terre ennemie assiège le comté. Trois façons de le mener : assaut (prise immédiate, pertes lourdes), blocus (usure réduite, siège long) ou négociation (une tentative par comté : la garnison se rend contre de l’or, avec une chance selon votre Diplomatie et la fortification).',
      },
      {
        term: 'Occupation',
        text: 'Un comté tombé est occupé : il ne rapporte rien et le peuple s’en plaint. Il peut être repris, ou cédé à la paix.',
      },
      {
        term: 'Score de guerre',
        text: 'De −100 à +100 du point de vue de l’attaquant. Il monte avec les batailles gagnées, les occupations, la capture du souverain adverse et l’objectif tenu. Il pèse sur l’acceptation d’une paix : à +100 elle est imposée.',
      },
      {
        term: 'Paix',
        text: `Armée › Guerres › « Négocier la paix » (chef de guerre seulement). Trois formes : victoire (vous réclamez des comtés et de l’or), paix blanche (statu quo, avec de l’or si vous voulez l’acheter) ou reddition (vous cédez ce qu’il réclame, marchandable). Une barre d’acceptation montre, en direct, si l’ennemi accepte : elle part de l’état de la guerre (score de son point de vue, lassitude après ${B.peace.exhaustionStart / 4} ans, capitale occupée, rapport de force), puis compte la valeur des comtés (${B.peace.countyBase} + ${B.peace.countyPerDev} par niveau de développement ; ×${B.peace.occupiedMult} s’ils sont occupés, ×${B.peace.objectiveMult} pour l’objectif, ×${B.peace.farMult} sinon, ×${B.peace.capitalMult} pour une capitale occupée) et l’or (${B.peace.goldPerPoint} or = 1 point). « Équilibrer l’or » trouve la somme juste. Quand l’IA vous propose la paix (exigences ou offre), vous pouvez accepter, refuser, ou modifier les conditions et contre-proposer. Elle réclame au plus ${Math.round(B.peace.maxGoldShare * 100)} % de votre trésor.`,
      },
    ],
  },
  {
    id: 'bataille',
    title: 'Bataille',
    icon: '🛡️',
    entries: [
      {
        term: 'Trois fronts et réserve',
        text: `La bataille oppose les armées sur trois fronts (aile gauche, centre, aile droite) face à face, avec une réserve. Elle dure ${B.battle.maxRounds} rounds au plus. Un camp est vaincu quand deux de ses fronts sont brisés, ou son centre sans réserve.`,
      },
      {
        term: 'Reconnaissance',
        text: 'De 0 à 2. Elle dépend du terrain ami, de l’espionnage et d’un commandant Stratège. À 0 vous ne voyez qu’une estimation des effectifs ennemis ; à 2 vous voyez leurs fronts.',
      },
      {
        term: 'Déploiement',
        text: 'Avant la bataille, vous répartissez vos compagnies entre fronts et réserve, avec quatre préréglages : Équilibré, Centre solide, Ailes de cavalerie, Défense en profondeur.',
      },
      {
        term: 'Ordres',
        text: 'Chaque front reçoit un ordre par round, joué simultanément avec l’ennemi : Charger (attaque forte, défense faible), Tenir (défense forte, moins de pertes de moral), Tirer (seuls les archers frappent, 3 volées), Feindre la retraite (punit une charge adverse ; cavalerie et Guerre ≥ 12 requis), Se replier (le front rejoint la réserve), Prendre de flanc (un front sans adversaire frappe un front voisin).',
      },
      {
        term: 'Moral',
        text: 'Chaque front en a. Les pertes, les flancs, les embuscades et la chute d’un voisin le font baisser. À zéro, ou sous 20 % des effectifs, le front est brisé : il fuit.',
      },
      {
        term: 'Réserve',
        text: 'Hommes gardés derrière les fronts, que l’on peut engager pour renforcer ou reformer un front.',
      },
      {
        term: 'Commandants',
        text: 'Leur Guerre renforce leur front. Ils risquent d’être blessés, tués ou capturés si leur front est brisé. Certains traits donnent un pouvoir : Stratège (voit les ordres ennemis au premier round), Cavalier émérite, Inébranlable (jamais plus de 20 de moral perdu par round), Inspirant (un ralliement par bataille), Impétueux, Prudent, Lâche, Boucher (l’ennemi perd du moral).',
      },
      {
        term: 'Tactiques',
        text: `Chaque camp reçoit une main de ${B.battle.tacticHand} tactiques selon la composition de l’armée et le commandant (plus celles données par les talents), et peut en jouer une par round, une seule fois chacune. Voir la liste plus bas.`,
      },
      {
        term: 'Élan',
        text: 'Le camp qui inflige nettement plus de pertes qu’il n’en subit prend l’ascendant (🔥, jusqu’à 3 niveaux) et attaque un peu plus fort. L’adversaire le perd.',
      },
      {
        term: 'Météo',
        text: 'Temps clair, pluie (archers ×0,7), brouillard (archers ×0,75, reconnaissance réduite) ou neige (cavalerie ×0,8, moral −5). Elle peut changer en cours de bataille.',
      },
      {
        term: 'Duel',
        text: 'Un commandant peut en défier un autre. Le vainqueur galvanise son armée, le vaincu risque blessure ou mort ; refuser fait baisser le moral de vos rangs. Le vainqueur gagne du prestige et le trait Héros.',
      },
      {
        term: 'Incident',
        text: 'Imprévus du champ de bataille : porte-étendard tombé, sergent qui se distingue, chevaux emballés, bénédiction, changement de temps.',
      },
      {
        term: 'Embuscade',
        text: 'En forêt, un défenseur rusé peut surprendre un front de l’attaquant au premier round.',
      },
      {
        term: 'Rivière',
        text: 'Un attaquant qui franchit une rivière attaque à ×0,7 aux deux premiers rounds.',
      },
      {
        term: 'Déroute et poursuite',
        text: 'Le vaincu subit une poursuite, plus meurtrière si le vainqueur a de la cavalerie. Les commandants des fronts brisés peuvent être capturés.',
      },
      {
        term: 'Résolution automatique',
        text: 'Le bouton Auto fait jouer la bataille par l’IA pour vous.',
      },
      {
        term: 'Mur de piques',
        text: 'Des piquiers qui tiennent face à une charge de cavalerie la fauchent (pertes ×1,5).',
      },
    ],
  },
  {
    id: 'monde',
    title: 'Événements et monde',
    icon: '📜',
    entries: [
      {
        term: 'Événement',
        text: 'Une situation qui demande un choix : chaque option affiche à l’avance ses effets connus, et les personnes ou comtés concernés apparaissent sous le texte : touchez-les pour ouvrir leur fiche avant de décider. Il y en a 0 à 3 par saison, tirés selon la saison, vos traits, vos conditions et un biais propre à votre partie.',
      },
      {
        term: '🎲 Issue incertaine',
        text: 'Certaines options sont tirées au sort : la probabilité est affichée avant de choisir (60 % : gain — sinon : perte). Parfois elle dépend d’une compétence (+2,5 % par point au-dessus de 10).',
      },
      {
        term: 'Suite d’événements',
        text: 'Certains choix ont des conséquences des années plus tard : prophétie en trois actes, prétendant au trône, peste, épée de l’ancêtre…',
      },
      {
        term: 'Bataille d’événement',
        text: 'Pillards, révoltés ou prétendant : une bataille jouée sur-le-champ avec votre armée levée, ou à défaut des levées d’urgence. Son issue est décidée par l’événement.',
      },
      {
        term: 'Épidémie',
        text: `Elle naît au hasard et passe de comté en comté (${pc(B.plague.spreadChance)} par voisin et par saison) : développement, levées et santé en pâtissent, et les comtés guéris sont immunisés un temps. La quarantaine l’empêche de se propager.`,
      },
      {
        term: 'Chronique',
        text: 'Règne › Journal : naissances, décès, successions, guerres, titres, mariages, hauts faits. Règne › Livre résume chaque règne, ses ambitions et ses exploits.',
      },
      {
        term: 'Nouvelles du monde',
        text: `Monde › Nouvelles : guerres et paix, morts et successions, mariages, alliances, titres fondés, révoltes, et faits de saison chez les autres souverains (récoltes, tournois, fondations, brigands, pirates, incendies…), environ ${pc(B.abroad.chancePerRuler)} de chance par cour et par saison. Ces faits changent vraiment leur trésor, leurs levées et leurs comtés. Filtrez par voisins, guerres, cours ou terres ; la fiche d’un souverain montre ses dernières nouvelles. Les guerres de vos voisins arrivent aussi dans vos avis.`,
      },
      {
        term: 'Couleur de maison',
        text: `Chaque maison a sa propre couleur, que nulle autre ne porte : d’abord les ${HOUSE_COLORS.length} émaux et teintes classiques (${HOUSE_COLORS.map((c) => c.name.toLowerCase()).join(', ')}), puis des teintes nouvelles créées pour les maisons qui naissent, aussi éloignées que possible de celles des maisons vivantes. Elle colore le champ du blason, le fond des portraits et les vêtements. Un fond gris signale un personnage sans maison.`,
      },
      {
        term: 'Royaumes étrangers',
        text: 'Autour de la carte jouable : les royaumes d’outre-mer (émissaires, marchands, pillards, invasions) et les terres inexplorées, impossibles à visiter.',
      },
      {
        term: 'Succès',
        text: 'Vingt objectifs (premier sang, couronne, ambitions…) gardés sur l’appareil, toutes parties confondues.',
      },
    ],
  },
  {
    id: 'interface',
    title: 'Interface',
    icon: '📱',
    entries: [
      {
        term: 'Barre du haut',
        text: 'Engrenage des Paramètres (appui long : outils de test), logo, saison et année, or (avec le revenu net par saison), prestige et piété. Toucher une ressource en détaille la dernière saison. Le bouton « Fin de saison » est en bas, au-dessus des onglets.',
      },
      {
        term: 'Onglets',
        text: 'Règne (résumé et liste « À faire », journal, livre de la dynastie), Cour (souverain et ses actions, maison, conseil, courtisans et prisonniers), Royaume (carte, domaine et vassaux, trésor, lois et succession), Armée (troupes, guerres) et Monde (cours voisines, complots, nouvelles). Une pastille signale ce qui attend : points de talent, poste vacant, guerre en cours. Le ⓘ d’une carte affiche son aide.',
      },
      {
        term: 'Bilan et personnages suivis',
        text: 'Règne › Résumé ouvre chaque saison sur « Depuis la saison dernière » : or, prestige, piété et renommée gagnés ou perdus, comtés gagnés ou perdus, vassaux dont l’opinion a bougé, faits marquants. « Suivre », sur la fiche d’un personnage, l’épingle dans le Résumé (huit au plus) : mariage, naissance, titres, prison, santé, opinion ou mort y sont signalés.',
      },
      {
        term: 'Gestes',
        text: 'Glissez horizontalement pour changer de sous-vue puis d’onglet (depuis le bord de l’écran, même sur la carte), et vers le bas pour fermer une fenêtre. Appui long sur un élément marqué pour une infobulle.',
      },
      {
        term: 'Carte',
        text: 'Pincez et déplacez pour zoomer ; touchez un comté ou une armée pour sa fiche. Boutons Relief (terrain), Peuple (contentement) et Légende. Les terres hors de portée sont voilées.',
      },
      {
        term: 'Fiches',
        text: 'Toucher un personnage, un comté ou une armée ouvre sa fiche détaillée ; « Retour » revient à la précédente.',
      },
      {
        term: 'Paramètres',
        text: 'Thème, animations réduites, sons et vibrations, résumé avant la fin de saison, sauvegarde manuelle, export, succès et ce glossaire.',
      },
    ],
  },
];

// ---------------------------------------------------------------------------
// Sections générées depuis les données
// ---------------------------------------------------------------------------

const unitEntries: GlossaryEntry[] = UNIT_TYPES.map((u) => {
  const s = UNITS[u];
  const strong = UNIT_TYPES.filter((v) => COUNTERS[u][v] >= 1.3).map((v) =>
    UNITS[v].label.toLowerCase(),
  );
  const weak = UNIT_TYPES.filter((v) => COUNTERS[u][v] <= 0.8).map((v) =>
    UNITS[v].label.toLowerCase(),
  );
  return {
    term: s.label,
    aka: s.short,
    text: `Attaque ${s.attack}, défense ${s.defense}, moral ${s.morale} ; ${s.recruit} or le recrutement d’une compagnie de 100 hommes, ${s.upkeep} or d’entretien par saison${s.building ? ` ; demande un bâtiment (${BUILDINGS[s.building]?.name ?? s.building}) dans un comté du domaine` : ' ; levée gratuitement dans les comtés'}.${strong.length ? ` Forte contre : ${strong.join(', ')}.` : ''}${weak.length ? ` Faible contre : ${weak.join(', ')}.` : ''}`,
  };
});

const terrainEntries: GlossaryEntry[] = Object.values(TERRAINS).map((t) => {
  const fx: string[] = [];
  if (t.defenderDefense !== 1) fx.push(`défense du défenseur ×${f(t.defenderDefense)}`);
  if (t.allAttack !== 1) fx.push(`attaque de tous ×${f(t.allAttack)}`);
  if (t.cavalryAttack !== 1) fx.push(`cavalerie ×${f(t.cavalryAttack)}`);
  if (t.archerAttack !== 1) fx.push(`archers ×${f(t.archerAttack)}`);
  if (t.defenderArcherAttack !== 1) fx.push(`archers du défenseur ×${f(t.defenderArcherAttack)}`);
  if (t.attackerCharge !== 1) fx.push(`charges de l’attaquant ×${f(t.attackerCharge)}`);
  if (t.attackerMoralePerRound)
    fx.push(`l’attaquant perd ${t.attackerMoralePerRound} de moral par round`);
  if (t.ambushRuse !== null) fx.push(`embuscade possible si le défenseur a Ruse ${t.ambushRuse}`);
  if (t.attrition !== 1) fx.push(`usure en campagne ×${f(t.attrition)}`);
  return {
    term: t.label,
    text: fx.length
      ? `${fx.join(' ; ')}.`
      : 'Terrain neutre : aucun bonus ni malus en bataille, usure normale en campagne.',
  };
});

const buildingEntries: GlossaryEntry[] = BUILDING_TYPES.map((b) => {
  const d = BUILDINGS[b];
  const [l1, l2] = d.levels;
  return {
    term: d.name,
    text: `${d.description} Niveau 1 : ${l1.cost} or, ${l1.seasons} saison(s). Niveau 2 : ${l2.cost} or, ${l2.seasons} saison(s).`,
  };
});

const traitEntries: GlossaryEntry[] = Object.values(TRAITS).map((t) => ({
  term: t.name,
  text: `${{ personnalite: 'Personnalité', education: 'Éducation', hereditaire: 'Héréditaire', acquis: 'Acquis' }[t.category]}${t.opposite ? ` (contraire : ${TRAITS[t.opposite]?.name})` : ''}. ${t.description}`,
}));

const perkEntries: GlossaryEntry[] = [
  ...Object.values(PERKS).map((p) => ({
    term: p.name,
    text: `Talent de rang ${p.tier}, branche ${BRANCH_NAMES[p.branch]}. ${p.description}`,
  })),
];
const legacyEntries: GlossaryEntry[] = Object.values(LEGACIES).map((l) => ({
  term: l.name,
  text: `Héritage de rang ${l.tier}, branche ${LEGACY_BRANCH_NAMES[l.branch]}, ${B.progression.legacyCost[l.tier - 1]} de renommée. ${l.description}`,
}));
const tacticEntries: GlossaryEntry[] = TACTIC_IDS.map((id) => {
  const t = TACTICS[id];
  const req: string[] = [];
  if (t.minShare)
    req.push(
      `au moins ${pc(t.minShare.share)} de ${t.minShare.units.map((u) => UNITS[u].label.toLowerCase()).join(' ou ')}`,
    );
  if (t.minGuerre) req.push(`Guerre ${t.minGuerre}+`);
  if (t.minRuse) req.push(`Ruse ${t.minRuse}+`);
  if (t.sovereign) req.push('souverain présent');
  return {
    term: `${t.icon} ${t.name}`,
    text: `${t.description}${req.length ? ` Demande : ${req.join(', ')}.` : ''}`,
  };
});
const edictEntries: GlossaryEntry[] = EDICTS.map((e) => ({
  term: `${e.icon} ${e.name}`,
  text: `${e.description} Proclamation ${e.cost} or${e.upkeep ? `, entretien ${e.upkeep} or par saison` : ''}.`,
}));
const ambitionEntries: GlossaryEntry[] = AMBITIONS.map((a) => ({
  term: `${a.icon} ${a.name}`,
  text: `${a.description.replace('{n}', 'N')} Délai ${a.years} ans. Récompense : +${a.reward.prestige} prestige${a.reward.renown ? `, +${a.reward.renown} renommée` : ''}.`,
}));
const decisionEntries: GlossaryEntry[] = DECISIONS.map((d) => ({
  term: `${d.icon} ${d.name}`,
  text: `${d.description} Coût : ${[d.cost.or ? `${d.cost.or} or` : '', d.cost.prestige ? `${d.cost.prestige} prestige` : '', d.cost.piete ? `${d.cost.piete} piété` : ''].filter(Boolean).join(', ')}. Tous les ${d.cooldownYears} an(s).`,
}));
const mercEntries: GlossaryEntry[] = MERCENARIES.map((m) => ({
  term: m.name,
  text: `${m.origin}. ${m.description} ${m.cost} or.`,
}));

const generated: GlossarySection[] = [
  { id: 'unites', title: 'Unités', icon: '🪖', entries: unitEntries },
  { id: 'terrains', title: 'Terrains', icon: '⛰️', entries: terrainEntries },
  { id: 'batiments', title: 'Bâtiments', icon: '🏗️', entries: buildingEntries },
  { id: 'tactiques', title: 'Tactiques de bataille', icon: '🃏', entries: tacticEntries },
  { id: 'traits', title: 'Traits', icon: '🎭', entries: traitEntries },
  { id: 'talents', title: 'Talents (personnage)', icon: '🌟', entries: perkEntries },
  { id: 'heritages', title: 'Héritages (maison)', icon: '🏛️', entries: legacyEntries },
  { id: 'edits', title: 'Édits du royaume', icon: '📯', entries: edictEntries },
  { id: 'ambitions', title: 'Ambitions', icon: '🎯', entries: ambitionEntries },
  { id: 'decisions', title: 'Décisions', icon: '🏇', entries: decisionEntries },
  { id: 'mercenaires', title: 'Mercenaires', icon: '🗡️', entries: mercEntries },
];

export const GLOSSARY: GlossarySection[] = [...concepts, ...generated];

/** Recherche simple (sans accents ni casse) dans les termes, synonymes et textes. */
export function searchGlossary(
  query: string,
): { section: GlossarySection; entry: GlossaryEntry }[] {
  const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const q = norm(query.trim());
  if (!q) return [];
  const out: { section: GlossarySection; entry: GlossaryEntry; score: number }[] = [];
  for (const section of GLOSSARY)
    for (const entry of section.entries) {
      const t = norm(entry.term);
      const a = norm(entry.aka ?? '');
      const x = norm(entry.text);
      const score = t.includes(q) ? 3 : a.includes(q) ? 2 : x.includes(q) ? 1 : 0;
      if (score) out.push({ section, entry, score });
    }
  return out.sort((a, b) => b.score - a.score).slice(0, 40);
}
