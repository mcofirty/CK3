/**
 * Événements d'ouverture du mode Trône de fer : la situation du début de la saison 1, vue depuis
 * la maison choisie. Textes écrits pour le jeu ; ensuite, l'histoire est libre.
 */
import type { Choice, EventDef } from '../../engine/events/types';
import type { EventInstance, GameState } from '../../engine/state';
import { HOUSES } from './houses';

type Spec = {
  id: string;
  titre: string;
  texte: string;
  /** Rôles de l'événement → clé d'un personnage du scénario. */
  roles?: Record<string, string>;
  choix: Choice[];
};

const NORTH_BANNERS = ['bolton', 'karstark', 'umber', 'manderly', 'mormont'];

/** Les événements propres à chaque maison, avant la nouvelle des Targaryen. */
function specsFor(houseId: string): Spec[] {
  const out: Spec[] = [];
  switch (houseId) {
    case 'stark':
      out.push(
        {
          id: 'got_roi_winterfell',
          titre: 'Le roi à Winterfell',
          texte:
            'Le roi Robert est arrivé à Winterfell avec la reine, ses enfants et la moitié de la cour. Au soir du festin, il vous prend à part : il veut que vous soyez sa Main, que vous gouverniez les Sept Couronnes en son nom, à Port-Réal, loin du Nord.',
          roles: { rival: 'robert' },
          choix: [
            {
              libelle: 'Accepter de devenir Main du Roi',
              effets: [
                { prestige: 100 },
                { opinion: { cible: 'rival', valeur: 25, raison: 'Sa Main et son ami' } },
                { influence: { cible: 'rival', valeur: 40 } },
                { stress: 10 },
                { drapeau: 'main_du_roi' },
              ],
            },
            {
              libelle: 'Refuser : la place d’un Stark est à Winterfell',
              effets: [
                { prestige: -30 },
                { opinion: { cible: 'rival', valeur: -25, raison: 'Il a refusé d’être sa Main' } },
              ],
            },
          ],
        },
        {
          id: 'got_fiancailles',
          titre: 'Un mariage royal',
          texte:
            'Robert veut enfin unir les Stark et les Baratheon : il propose de fiancer votre fille Sansa au prince Joffrey, son héritier. Sansa rêve déjà de Port-Réal.',
          roles: { rival: 'robert', enfant: 'sansa' },
          choix: [
            {
              libelle: 'Accepter les fiançailles',
              effets: [
                { prestige: 50 },
                { opinion: { cible: 'rival', valeur: 20, raison: 'Bientôt de la même famille' } },
                { opinion: { cible: 'enfant', valeur: 20, raison: 'Promise à un prince' } },
                { drapeau: 'fiancailles_sansa' },
              ],
            },
            {
              libelle: 'Décliner avec respect',
              effets: [
                { opinion: { cible: 'rival', valeur: -15, raison: 'A refusé son fils' } },
                { opinion: { cible: 'enfant', valeur: -15, raison: 'Privée d’un prince' } },
              ],
            },
          ],
        },
        {
          id: 'got_lettre_lysa',
          titre: 'Une lettre des Eyrié',
          texte:
            'Un message écrit dans le langage secret de leur enfance arrive pour Catelyn. Sa sœur Lysa affirme que Jon Arryn a été empoisonné, et que les Lannister sont coupables.',
          roles: { ennemi: 'tywin' },
          choix: [
            {
              libelle: 'La croire, et chercher la vérité à Port-Réal',
              effets: [
                { xp: { competence: 'ruse', valeur: 30 } },
                {
                  opinion: { cible: 'ennemi', valeur: -15, raison: 'Il fouine dans nos affaires' },
                },
                { drapeau: 'enquete_arryn' },
              ],
            },
            {
              libelle: 'Brûler la lettre : on n’accuse pas sans preuve',
              effets: [{ stress: { juste: 5, '*': 10 } }],
            },
          ],
        },
        {
          id: 'got_jon_mur',
          titre: 'Le bâtard veut prendre le noir',
          texte:
            'Jon Snow vous demande la permission de partir pour le Mur avec son oncle Benjen, et de prononcer les vœux de la Garde de Nuit. Catelyn ne le retiendra pas.',
          roles: { courtisan: 'jon' },
          choix: [
            {
              libelle: 'Le laisser partir pour le Mur',
              effets: [
                { prendre_le_noir: 'courtisan' },
                { opinion: { cible: 'courtisan', valeur: 15, raison: 'Il a respecté son choix' } },
                { drapeau: 'jon_garde_de_nuit' },
              ],
            },
            {
              libelle: 'Le garder à Winterfell',
              effets: [
                { opinion: { cible: 'courtisan', valeur: -15, raison: 'Il l’a retenu' } },
                { prestige: -10 },
              ],
            },
          ],
        },
      );
      break;
    case 'lannister':
      out.push(
        {
          id: 'got_main_lannister',
          titre: 'La Main est morte',
          texte:
            'Jon Arryn mort, la charge de Main du Roi est libre. Le roi vous doit des fortunes ; la reine, votre fille, vous presse d’agir avant qu’un Stark ne s’installe à la tour de la Main.',
          roles: { rival: 'robert' },
          choix: [
            {
              libelle: 'Réclamer la charge pour un Lannister',
              effets: [
                {
                  hasard: {
                    chance: 0.3,
                    competence: 'diplomatie',
                    succes: [
                      { prestige: 120 },
                      { influence: { cible: 'rival', valeur: 40 } },
                      { drapeau: 'main_lannister' },
                    ],
                    echec: [
                      { prestige: -30 },
                      { opinion: { cible: 'rival', valeur: -15, raison: 'Il exige trop' } },
                    ],
                    texte_succes: 'Robert cède : un Lannister sera sa Main.',
                    texte_echec: 'Robert chevauche vers le nord chercher Eddard Stark.',
                  },
                },
              ],
            },
            {
              libelle: 'Laisser le roi choisir : on l’aura autrement',
              effets: [
                { opinion: { cible: 'rival', valeur: 10, raison: 'Un beau-père discret' } },
                { xp: { competence: 'ruse', valeur: 20 } },
              ],
            },
          ],
        },
        {
          id: 'got_dette_couronne',
          titre: 'La dette de la Couronne',
          texte:
            'Le Grand Argentier emprunte sans compter : la Couronne doit plus de trois millions de dragons d’or, dont la moitié à votre maison.',
          roles: { rival: 'robert' },
          choix: [
            {
              libelle: 'Exiger un remboursement',
              effets: [
                { or: 250 },
                { opinion: { cible: 'rival', valeur: -20, raison: 'Un créancier pressant' } },
              ],
            },
            {
              libelle: 'Laisser courir la dette',
              effets: [{ influence: { cible: 'rival', valeur: 30 } }, { prestige: 20 }],
            },
          ],
        },
      );
      break;
    case 'baratheon':
      out.push(
        {
          id: 'got_nouvelle_main',
          titre: 'Une nouvelle Main',
          texte:
            'Jon Arryn, votre second père, est mort. Il vous faut une Main pour gouverner pendant que vous chassez et festoyez. Ned Stark, votre vieil ami, est à Winterfell ; Tywin Lannister, votre beau-père, attend qu’on le lui demande.',
          roles: { vassal: 'ned', ennemi: 'tywin' },
          choix: [
            {
              libelle: 'Chevaucher jusqu’à Winterfell chercher Ned',
              effets: [
                { opinion: { cible: 'vassal', valeur: 25, raison: 'Le roi est venu le chercher' } },
                {
                  opinion: {
                    cible: 'ennemi',
                    valeur: -10,
                    raison: 'Un Stark à la place d’un Lannister',
                  },
                },
                { prestige: 30 },
                { drapeau: 'main_ned' },
              ],
            },
            {
              libelle: 'Nommer Tywin Lannister',
              effets: [
                { opinion: { cible: 'ennemi', valeur: 30, raison: 'Main du Roi' } },
                {
                  opinion: {
                    cible: 'vassal',
                    valeur: -10,
                    raison: 'Le roi a préféré un Lannister',
                  },
                },
                { or: 200 },
                { drapeau: 'main_tywin' },
              ],
            },
          ],
        },
        {
          id: 'got_tournoi_main',
          titre: 'Le tournoi de la Main',
          texte:
            'Votre Grand Argentier, Petyr Baelish, emprunte aux Lannister et à la Banque de Fer de Braavos. Le trésor est vide, mais le tournoi en l’honneur de la nouvelle Main est déjà annoncé.',
          choix: [
            {
              libelle: 'Que la fête ait lieu !',
              effets: [{ or: -100 }, { prestige: 60 }, { opinion_vassaux: 5 }],
            },
            { libelle: 'Annuler le tournoi', effets: [{ or: 50 }, { prestige: -30 }] },
          ],
        },
        {
          id: 'got_fille_roi_fou',
          titre: 'La fille du Roi fou',
          texte:
            'Varys vous l’apprend à voix basse : Daenerys Targaryen, la fille du Roi fou, a épousé un khal dothraki. Un jour peut-être, quarante mille cavaliers traverseront le détroit.',
          roles: { ennemi: 'daenerys' },
          choix: [
            {
              libelle: 'Ordonner sa mort',
              effets: [
                { piete: -60 },
                { prestige: 40 },
                { stress: { juste: 20, genereux: 15, '*': 0 } },
                { drapeau: 'contrat_targaryen' },
              ],
            },
            {
              libelle: 'Ce n’est qu’une enfant',
              effets: [{ prestige: -20 }, { drapeau: 'pitie_targaryen' }],
            },
          ],
        },
      );
      break;
    case 'peyredragon':
      out.push({
        id: 'got_secret_stannis',
        titre: 'Le secret de Jon Arryn',
        texte:
          'Avec Jon Arryn, vous avez découvert l’impensable : les enfants de la reine ne seraient pas ceux de Robert, mais de son frère jumeau, Jaime Lannister. Si c’est vrai, c’est vous l’héritier légitime du Trône de fer.',
        roles: { rival: 'robert' },
        choix: [
          {
            libelle: 'Se retirer à Peyredragon et réunir des preuves',
            effets: [
              { xp: { competence: 'ruse', valeur: 40 } },
              {
                opinion: { cible: 'rival', valeur: -10, raison: 'Il a quitté la cour sans un mot' },
              },
              { drapeau: 'secret_stannis' },
            ],
          },
          {
            libelle: 'Tout révéler au roi',
            effets: [
              {
                hasard: {
                  chance: 0.3,
                  succes: [
                    { prestige: 150 },
                    { opinion: { cible: 'rival', valeur: 20, raison: 'Un frère loyal' } },
                    { drapeau: 'secret_revele' },
                  ],
                  echec: [
                    { prestige: -50 },
                    {
                      opinion: { cible: 'rival', valeur: -40, raison: 'Calomnie contre la reine' },
                    },
                  ],
                  texte_succes: 'Robert vous croit. La reine pâlit.',
                  texte_echec: 'Robert refuse de vous croire et vous chasse de la salle.',
                },
              },
            ],
          },
        ],
      });
      break;
    case 'accalmie':
      out.push({
        id: 'got_rose_renly',
        titre: 'Une rose pour la couronne',
        texte:
          'Au conseil restreint, vous tenez les lois du royaume. Loras Tyrell vous souffle une idée : sa sœur Margaery ferait une reine bien plus aimable que Cersei.',
        roles: { ami: 'loras' },
        choix: [
          {
            libelle: 'Pousser Margaery vers le roi',
            effets: [
              { opinion: { cible: 'ami', valeur: 20, raison: 'Allié des Tyrell' } },
              { xp: { competence: 'diplomatie', valeur: 30 } },
              { drapeau: 'margaery_reine' },
            ],
          },
          { libelle: 'Rester loyal à Robert et à sa reine', effets: [{ prestige: 20 }] },
        ],
      });
      break;
    case 'arryn':
      out.push({
        id: 'got_deuil_eyrie',
        titre: 'Le deuil des Eyrié',
        texte:
          'Votre père, Jon Arryn, est mort. Votre mère Lysa vous a emmené loin de Port-Réal, jusqu’aux Eyrié. Elle jure que les Lannister l’ont tué, et refuse d’ouvrir le Val à quiconque.',
        roles: { rival: 'robert' },
        choix: [
          {
            libelle: 'Fermer le Val',
            effets: [
              { prestige: 20 },
              { opinion: { cible: 'rival', valeur: -10, raison: 'Les Arryn se terrent' } },
              { drapeau: 'val_ferme' },
            ],
          },
          {
            libelle: 'Rester fidèle au roi',
            effets: [{ opinion: { cible: 'rival', valeur: 15, raison: 'Le fils de Jon Arryn' } }],
          },
        ],
      });
      break;
    case 'tully':
      out.push({
        id: 'got_hoster_mourant',
        titre: 'Le seigneur se meurt',
        texte:
          'Les mestres ne cachent plus rien : vos forces déclinent. Edmure, votre fils, devra bientôt défendre seul les gués du Trident.',
        roles: { heritier: 'edmure' },
        choix: [
          {
            libelle: 'Confier la défense des gués à Edmure',
            effets: [{ xp: { competence: 'guerre', valeur: 40, cible: 'heritier' } }],
          },
          {
            libelle: 'Lui enseigner la patience',
            effets: [{ xp: { competence: 'diplomatie', valeur: 40, cible: 'heritier' } }],
          },
        ],
      });
      break;
    case 'greyjoy':
      out.push({
        id: 'got_fils_otage',
        titre: 'Le fils otage',
        texte:
          'Theon, votre dernier fils, grandit à Winterfell comme otage des Stark depuis neuf ans. Tant qu’il y reste, vous ne pouvez pas attaquer le Nord.',
        roles: { rival: 'ned' },
        choix: [
          {
            libelle: 'Préparer la flotte en secret',
            effets: [
              { or: -60 },
              { xp: { competence: 'guerre', valeur: 40 } },
              { drapeau: 'flotte_fer' },
            ],
          },
          {
            libelle: 'Ronger son frein : le jour viendra',
            effets: [{ stress: 10 }, { drapeau: 'vengeance_fer' }],
          },
        ],
      });
      break;
    case 'tyrell':
      out.push({
        id: 'got_rose_tyrell',
        titre: 'Une rose pour la couronne',
        texte:
          'Votre mère Olenna l’a décidé : Margaery portera une couronne. Loras est déjà à Port-Réal, dans l’intimité du jeune Renly Baratheon.',
        roles: { rival: 'renly' },
        choix: [
          {
            libelle: 'Envoyer Margaery à la cour',
            effets: [
              { prestige: 30 },
              { opinion: { cible: 'rival', valeur: 20, raison: 'Ami des Tyrell' } },
              { drapeau: 'margaery_cour' },
            ],
          },
          { libelle: 'Garder Margaery à Hautjardin', effets: [{ piete: 20 }] },
        ],
      });
      break;
    case 'martell':
      out.push({
        id: 'got_patience_dorne',
        titre: 'La patience de Dorne',
        texte:
          'Dix-sept ans ont passé depuis le massacre d’Elia et de ses enfants à Port-Réal. Oberyn, votre frère, brûle d’aller réclamer justice ; vous préférez attendre votre heure.',
        roles: { courtisan: 'oberyn', ennemi: 'tywin' },
        choix: [
          {
            libelle: 'Laisser Oberyn préparer la vengeance',
            effets: [
              { opinion: { cible: 'courtisan', valeur: 20, raison: 'La vengeance d’Elia' } },
              { xp: { competence: 'ruse', valeur: 30 } },
              { drapeau: 'vengeance_dorne' },
            ],
          },
          {
            libelle: 'Prêcher la patience',
            effets: [
              { prestige: 20 },
              { opinion: { cible: 'courtisan', valeur: -10, raison: 'Encore attendre' } },
            ],
          },
        ],
      });
      break;
    case 'bolton':
      out.push({
        id: 'got_batard_fort_terreur',
        titre: 'Le bâtard de Fort-Terreur',
        texte:
          'Ramsay Snow, votre bâtard, sème la terreur sur vos terres. Ses chiens et ses chasses font jaser jusqu’à Winterfell.',
        roles: { courtisan: 'ramsay', rival: 'ned' },
        choix: [
          {
            libelle: 'Le tenir en laisse',
            effets: [{ opinion: { cible: 'courtisan', valeur: -20, raison: 'Tenu en laisse' } }],
          },
          {
            libelle: 'Le laisser faire',
            effets: [
              { opinion: { cible: 'rival', valeur: -10, raison: 'Les crimes de son bâtard' } },
              { opinion: { cible: 'courtisan', valeur: 15, raison: 'Les mains libres' } },
            ],
          },
        ],
      });
      break;
    case 'frey':
      out.push({
        id: 'got_peage_jumeaux',
        titre: 'Le péage des Jumeaux',
        texte:
          'Les marchands paient, les seigneurs paient, et même les Tully passent par votre pont. Hoster Tully se meurt : son fils Edmure saura-t-il vous respecter ?',
        roles: { rival: 'hoster' },
        choix: [
          {
            libelle: 'Augmenter le péage',
            effets: [
              { or: 80 },
              { opinion: { cible: 'rival', valeur: -10, raison: 'Le péage des Jumeaux' } },
            ],
          },
          { libelle: 'Rester discret', effets: [{ prestige: 10 }] },
        ],
      });
      break;
    case 'tarly':
      out.push({
        id: 'got_fils_indigne',
        titre: 'Un fils indigne',
        texte:
          'Samwell, votre aîné, préférait les livres à l’épée. Sur votre ordre, il a pris le noir au Mur ; Dickon sera votre héritier.',
        roles: { enfant: 'samwell' },
        choix: [
          { libelle: 'C’était nécessaire', effets: [{ prestige: 10 }] },
          {
            libelle: 'Lui écrire au Mur',
            effets: [
              { stress: 5 },
              { opinion: { cible: 'enfant', valeur: 25, raison: 'Une lettre de son père' } },
            ],
          },
        ],
      });
      break;
    case 'clegane':
      out.push({
        id: 'got_tournoi_montagne',
        titre: 'Le tournoi de la Main',
        texte:
          'On annonce un grand tournoi à Port-Réal en l’honneur de la nouvelle Main. Les meilleurs chevaliers du royaume y seront ; votre frère Sandor aussi.',
        roles: { courtisan: 'sandor' },
        choix: [
          {
            libelle: 'Entrer en lice',
            effets: [
              {
                hasard: {
                  chance: 0.6,
                  competence: 'guerre',
                  succes: [{ prestige: 80 }, { or: 100 }],
                  echec: [{ sante: -15 }, { prestige: -20 }],
                  texte_succes: 'Vous désarçonnez tous vos adversaires.',
                  texte_echec: 'Un jeune chevalier vous fait mordre la poussière.',
                },
              },
            ],
          },
          { libelle: 'Rester à Fort-Clegane', effets: [] },
        ],
      });
      break;
    case 'royce':
      out.push({
        id: 'got_waymar',
        titre: 'Disparu au-delà du Mur',
        texte:
          'Un corbeau du Mur : votre fils Waymar, parti en patrouille au-delà avec deux frères de la Garde de Nuit, n’est pas revenu.',
        choix: [
          { libelle: 'Prier pour son âme', effets: [{ piete: 30 }, { stress: 10 }] },
          {
            libelle: 'Envoyer des hommes à la Garde de Nuit',
            effets: [{ or: -50 }, { prestige: 30 }],
          },
        ],
      });
      break;
    case 'hightower':
      out.push({
        id: 'got_corbeaux_blancs',
        titre: 'Les corbeaux blancs',
        texte:
          'La Citadelle a lâché ses corbeaux blancs : l’été touche à sa fin. Les mestres ne savent pas combien durera l’hiver qui vient.',
        choix: [
          { libelle: 'Remplir les greniers', effets: [{ or: -80 }, { prestige: 20 }] },
          { libelle: 'Lever un impôt d’hiver', effets: [{ or: 80 }, { opinion_vassaux: -5 }] },
        ],
      });
      break;
  }
  if (NORTH_BANNERS.includes(houseId))
    out.unshift({
      id: 'got_festin_winterfell',
      titre: 'Le roi chevauche vers le nord',
      texte:
        'La cour du roi traverse le Nord pour rejoindre Winterfell. Votre suzerain, Eddard Stark, convie ses bannerets au festin.',
      roles: { rival: 'ned' },
      choix: [
        {
          libelle: 'Se rendre au festin',
          effets: [
            { or: -20 },
            { prestige: 20 },
            { opinion: { cible: 'rival', valeur: 10, raison: 'Présent au festin du roi' } },
          ],
        },
        {
          libelle: 'Rester sur ses terres',
          effets: [{ opinion: { cible: 'rival', valeur: -5, raison: 'Absent au festin' } }],
        },
      ],
    });
  if (houseId !== 'baratheon')
    out.push({
      id: 'got_rumeurs_essos',
      titre: 'Des nouvelles d’outre-mer',
      texte:
        'Des marchands de Pentos racontent qu’un magistère a marié Daenerys Targaryen, la fille du Roi fou, à un seigneur du cheval, Khal Drogo. Son frère Viserys jure de reprendre le trône de son père avec quarante mille cavaliers.',
      choix: [
        { libelle: 'Ce ne sont que des contes de marins', effets: [] },
        {
          libelle: 'Faire surveiller les Cités libres',
          effets: [{ or: -30 }, { xp: { competence: 'ruse', valeur: 20 } }],
        },
      ],
    });
  return out;
}

/** Cartes d'ouverture : la présentation de la maison, puis ses premiers dilemmes. */
export function openingEvents(
  state: GameState,
  houseId: string,
  idOf: (key: string) => string,
): EventInstance[] {
  const house = HOUSES.find((h) => h.id === houseId)!;
  const head = state.characters[idOf(house.head)];
  const intro: EventDef = {
    id: 'got_intro',
    titre: `Maison ${house.name}${house.words ? ` — « ${house.words} »` : ''}`,
    texte: `${house.blurb ?? ''}\n\nNous sommes en l’an 298 après la Conquête d’Aegon. Jon Arryn, la Main du Roi, vient de mourir ; à Port-Réal, chacun se demande qui le remplacera. L’hiver vient.`,
    categorie: 'systeme',
    declencheur: { type: 'suite' },
    poids: 0,
    choix: [{ libelle: `Ainsi commence le règne de ${head.name}`, effets: [] }],
  };
  const all: EventInstance[] = [
    { uid: `e${++state.nextId}`, eventId: intro.id, scope: { souverain: head.id }, inline: intro },
  ];
  for (const s of specsFor(houseId)) {
    const scope: Record<string, string> = { souverain: head.id };
    for (const [role, key] of Object.entries(s.roles ?? {})) scope[role] = idOf(key);
    all.push({
      uid: `e${++state.nextId}`,
      eventId: s.id,
      scope,
      inline: {
        id: s.id,
        titre: s.titre,
        texte: s.texte,
        categorie: 'cour',
        declencheur: { type: 'suite' },
        poids: 0,
        choix: s.choix,
      },
    });
  }
  return all;
}
