/**
 * =============================================================================
 *  La cantine : les six catégories, leur ordre, et ce qui ne s'affiche pas
 * =============================================================================
 *
 *  POURQUOI CE FICHIER
 *  -------------------
 *  Ce qui décide de l'affichage d'un menu — quelles catégories paraissent, dans
 *  quel ordre, et ce qu'un jour sans aliment montre à la place — vivait
 *  auparavant dans le `renderItem` de l'écran, c'est-à-dire nulle part qu'un banc
 *  puisse atteindre. Une règle enfermée là ne se vérifie qu'en montant l'écran
 *  entier, avec un client Supabase et un appareil.
 *
 *  Elle a donc été sortie dans `src/utils/cantine.ts`, et c'est ce fichier-ci qui
 *  l'exerce : sur des données écrites à la main, sans base, sans React, en une
 *  seconde.
 *
 *  LES DEUX SOURCES QUI DOIVENT DIRE LA MÊME CHOSE
 *  -----------------------------------------------
 *  La correspondance entre les anciennes colonnes et les six catégories est
 *  écrite **deux fois** : une fois en SQL, dans la migration qui recopie les
 *  journées déjà saisies en aliments ; une fois en TypeScript, dans le repli de
 *  l'application, qui sert quand la table des aliments n'est pas encore là.
 *
 *  Aucune des deux ne peut lire l'autre. Si elles divergent, une journée reprise
 *  par la migration et une journée lue par le repli affichent le même contenu
 *  sous deux titres différents — et personne ne s'en apercevrait, puisque les
 *  deux chemins ne s'exercent jamais sur la même journée.
 *
 *  C'est donc ce banc qui les tient d'accord, en lisant les deux textes.
 *
 *  CE QU'IL NE VÉRIFIE PAS
 *  -----------------------
 *  Il n'exécute rien contre PostgreSQL. Que la migration s'applique, que
 *  l'énumération porte bien ces six valeurs **dans cet ordre** dans le catalogue,
 *  et que les politiques rendent ce qu'il faut : c'est
 *  `check-migration-applicable`, qui joue la suite contre un vrai PostgreSQL.
 *  Ici, on lit le texte et on exerce la logique.
 *
 *  Un banc s'éprouve dans les deux sens : chaque assertion de ce fichier a été
 *  vue tomber sur une valeur fausse avant d'être vue passer sur la bonne — le
 *  détail est dans le journal du 21 septembre.
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { accents } from '@/theme';
import {
  CANTINE_DISH_TYPE_LABELS,
  CANTINE_ITEM_CATEGORIES,
  CANTINE_ITEM_CATEGORY_LABELS,
} from '@/types/models';
import {
  CANTINE_DISH_TYPE_ACCENTS,
  CORRESPONDANCE_HISTORIQUE,
  grouperJour,
  joursDeCantine,
  libelleElements,
  rangerParJour,
} from '@/utils/cantine';

const MIGRATION = fileURLToPath(
  new URL('../supabase/migrations/20260922190000_cantine_items.sql', import.meta.url),
);

/** Le SQL sans ses commentaires de ligne — les mêmes précautions qu'ailleurs. */
function sqlSansCommentaires() {
  return readFileSync(MIGRATION, 'utf8').replace(/^[^\S\n]*--.*$/gm, '');
}

/**
 * L'ordre des six catégories, tel que la migration le déclare.
 *
 * Rend `null` quand le motif ne trouve rien, plutôt qu'une liste vide : une
 * comparaison entre deux listes vides serait verte, et le banc aurait l'air de
 * mesurer quelque chose. C'est le contrôle du contrôle, et il est explicite.
 */
function categoriesSql() {
  const trouve = /create type public\.cantine_item_category as enum\s*\(([^)]*)\)/.exec(
    sqlSansCommentaires(),
  );

  if (trouve === null) {
    return null;
  }

  return trouve[1]
    .split(',')
    .map((valeur) => valeur.trim().replace(/^'|'$/g, ''))
    .filter((valeur) => valeur !== '');
}

/**
 * Les couples « ancienne colonne → catégorie », tels que la migration les écrit.
 *
 * Le type est facultatif dans le motif, et il l'est **exprès** : la migration
 * écrit `'autres'::public.cantine_item_category` parce que `union all` réunit les
 * trois branches avant de les insérer, et qu'un littéral non typé y reste du
 * `text` — PostgreSQL refuse alors l'insertion. Le contrôle porte sur le
 * **couple**, pas sur la manière de l'écrire : il accepte les deux formes, et
 * c'est la forme en place qui compte.
 */
function correspondanceSql() {
  const paires = [
    ...sqlSansCommentaires().matchAll(
      /select a_convertir\.menu_id, '(\w+)'(?:::public\.cantine_item_category)?, menu\.(\w+)/g,
    ),
  ].map(([, categorie, colonne]) => [colonne, categorie]);

  return paires.length === 0 ? null : paires.sort();
}

/* -------------------------------------------------------------------------- *
 * Des données écrites à la main, et complètes
 *
 * Les fabriques remplissent **tous** les champs du schéma. Un objet partiel
 * passerait aujourd'hui et tomberait le jour où la logique lirait une colonne de
 * plus — sur un `undefined` au lieu d'une valeur, ce qui donnerait un échec
 * illisible.
 * -------------------------------------------------------------------------- */

function unMenu(partiel = {}) {
  return {
    id: 'menu-1',
    service_date: '2026-09-21',
    starter: null,
    main_course: null,
    dessert: null,
    notes: null,
    created_at: '2026-09-01T00:00:00.000Z',
    updated_at: '2026-09-01T00:00:00.000Z',
    ...partiel,
  };
}

let compteur = 0;

function unAliment(partiel = {}) {
  compteur += 1;

  return {
    id: `aliment-${compteur}`,
    menu_id: 'menu-1',
    category: 'plat',
    label: `Aliment ${compteur}`,
    dish_type: null,
    created_at: '2026-09-01T00:00:00.000Z',
    updated_at: '2026-09-01T00:00:00.000Z',
    ...partiel,
  };
}

/** Le titre des groupes d'un jour, dans l'ordre où ils sortent. */
function titres(jour) {
  return jour.groupes.map((groupe) => groupe.titre);
}

/* -------------------------------------------------------------------------- *
 * 1. Les six catégories, et leur ordre
 * -------------------------------------------------------------------------- */

test('les six catégories sont déclarées, dans l’ordre, et toutes nommées', () => {
  // Le contrôle du contrôle : sans lui, une constante vidée par mégarde ferait
  // passer les tests suivants sur zéro catégorie.
  assert.deepEqual(CANTINE_ITEM_CATEGORIES, [
    'plat',
    'accompagnement',
    'laitage',
    'dessert',
    'menu',
    'autres',
  ]);

  // Chaque catégorie a son titre, et aucun titre n'est en trop : les deux listes
  // se couvrent exactement. Un titre manquant afficherait `undefined` au-dessus
  // d'un groupe — sans erreur, et sans que rien ne le signale.
  assert.deepEqual(
    Object.keys(CANTINE_ITEM_CATEGORY_LABELS).sort(),
    [...CANTINE_ITEM_CATEGORIES].sort(),
  );
});

test('l’ordre des catégories est le même en SQL et en TypeScript', () => {
  const sql = categoriesSql();

  assert.notEqual(sql, null, 'la migration ne déclare pas la catégorie : le motif a changé');
  assert.equal(sql.length, 6, `catégories lues en SQL : ${sql.length}`);

  // L'ordre de l'énumération PostgreSQL **est** l'ordre d'affichage : la
  // constante TypeScript le reprend, et `check-migration-applicable` relit ce
  // même ordre dans le catalogue. Trois écritures, une seule vérité.
  assert.deepEqual(sql, [...CANTINE_ITEM_CATEGORIES]);
});

/* -------------------------------------------------------------------------- *
 * 2. Une catégorie vide ne paraît pas
 * -------------------------------------------------------------------------- */

test('une catégorie sans aliment ne paraît pas, et ne réserve aucun espace', () => {
  // Le cas de la demande, mot pour mot : aucun laitage renseigné, donc le titre
  // « LAITAGE » ne doit pas apparaître.
  const jour = grouperJour(unMenu(), [
    unAliment({ category: 'plat', label: 'Filet de colin' }),
    unAliment({ category: 'dessert', label: 'Compote' }),
  ]);

  assert.deepEqual(titres(jour), ['PLAT', 'DESSERT']);

  // Et le corollaire, qui est la vraie propriété : le groupe n'existe **pas**.
  // Un groupe vide mais présent réserverait l'espace de son titre et de son
  // écart, ce que l'œil lit comme un trou.
  assert.equal(
    jour.groupes.some((groupe) => groupe.aliments.length === 0),
    false,
    'aucun groupe ne doit sortir sans aliment',
  );
});

test('les groupes sortent dans l’ordre des catégories, quel que soit l’ordre reçu', () => {
  // Les aliments arrivent du serveur triés par date de création, donc dans
  // n'importe quel ordre de catégorie : c'est ici que l'ordre d'affichage est
  // décidé, et non par la base.
  const jour = grouperJour(unMenu(), [
    unAliment({ category: 'autres', label: 'Pain' }),
    unAliment({ category: 'dessert', label: 'Compote' }),
    unAliment({ category: 'plat', label: 'Filet de colin' }),
    unAliment({ category: 'accompagnement', label: 'Carottes' }),
  ]);

  assert.deepEqual(titres(jour), ['PLAT', 'ACCOMPAGNEMENT', 'DESSERT', 'AUTRES']);
});

test('deux aliments d’une même catégorie sont tous les deux là, dans l’ordre reçu', () => {
  const premier = unAliment({ category: 'plat', label: 'Filet de colin' });
  const second = unAliment({ category: 'plat', label: 'Filet de poulet' });
  const jour = grouperJour(unMenu(), [premier, second]);

  assert.equal(jour.groupes.length, 1);
  assert.deepEqual(
    jour.groupes[0].aliments.map(({ nom }) => nom),
    ['Filet de colin', 'Filet de poulet'],
  );
});

test('un jour sans aliment et sans ancienne colonne ne produit aucun groupe', () => {
  // Une ligne de `cantine_menus` dont les quatre champs sont vides ne devrait pas
  // exister — le tableau de bord la supprime. Si elle arrive là, la carte montre
  // son en-tête et rien d'autre : c'est plus honnête qu'un groupe fantôme.
  const jour = grouperJour(unMenu(), []);

  assert.deepEqual(jour.groupes, []);
  assert.equal(jour.elements, 0);
});

/* -------------------------------------------------------------------------- *
 * 3. Le repli sur les anciennes colonnes
 * -------------------------------------------------------------------------- */

test('un jour sans aliment montre les anciennes colonnes, sous les bonnes catégories', () => {
  const jour = grouperJour(
    unMenu({
      starter: 'Salade de tomates',
      main_course: 'Rôti de dinde, haricots verts',
      dessert: 'Compote de pommes',
    }),
    [],
  );

  assert.deepEqual(titres(jour), ['PLAT', 'DESSERT', 'AUTRES']);

  const parTitre = new Map(
    jour.groupes.map((groupe) => [groupe.titre, groupe.aliments.map(({ nom }) => nom)]),
  );

  assert.deepEqual(parTitre.get('PLAT'), ['Rôti de dinde, haricots verts']);
  assert.deepEqual(parTitre.get('DESSERT'), ['Compote de pommes']);
  assert.deepEqual(parTitre.get('AUTRES'), ['Salade de tomates']);
});

test('les aliments d’un jour ne sont pas doublés par ses anciennes colonnes', () => {
  // Le défaut que ce test empêche, et il est invisible à l'œil sur une capture :
  // une journée reprise par la migration porte **à la fois** l'ancien
  // `main_course` et l'aliment qui en a été recopié. Les additionner afficherait
  // deux fois le même plat, sous le même titre.
  const jour = grouperJour(unMenu({ main_course: 'Rôti de dinde', dessert: 'Compote de pommes' }), [
    unAliment({ category: 'plat', label: 'Rôti de dinde' }),
  ]);

  assert.deepEqual(titres(jour), ['PLAT']);
  assert.deepEqual(
    jour.groupes[0].aliments.map(({ nom }) => nom),
    ['Rôti de dinde'],
  );
});

test('une ancienne colonne vide ou faite d’espaces ne produit rien', () => {
  // `starter` est facultative en base, et `''` y est une valeur possible. Sans
  // filtre, la journée afficherait une puce suivie de rien — ce qui se lit comme
  // un défaut d'affichage, pas comme une absence de donnée.
  const jour = grouperJour(unMenu({ starter: '   ', main_course: '', dessert: 'Compote' }), []);

  assert.deepEqual(titres(jour), ['DESSERT']);
  assert.equal(jour.elements, 1);
});

test('un aliment déduit d’une ancienne colonne ne porte aucune pastille', () => {
  // Le type de plat n'existait pas dans l'ancien modèle : l'inventer donnerait
  // une information fausse, et c'est la seule chose qu'une pastille ne peut pas
  // se permettre.
  const jour = grouperJour(unMenu({ main_course: 'Rôti de dinde' }), []);

  assert.deepEqual(
    jour.groupes[0].aliments.map(({ type }) => type),
    [null],
  );
});

/* -------------------------------------------------------------------------- *
 * 4. Le compteur
 * -------------------------------------------------------------------------- */

test('le compteur compte ce qui s’affiche, et rien d’autre', () => {
  const jour = grouperJour(unMenu(), [
    unAliment({ category: 'plat' }),
    unAliment({ category: 'plat' }),
    unAliment({ category: 'laitage' }),
    unAliment({ category: 'menu' }),
  ]);

  assert.equal(jour.elements, 4);
  assert.equal(
    jour.groupes.reduce((total, groupe) => total + groupe.aliments.length, 0),
    4,
    'le compte doit égaler le nombre d’aliments réellement dessinés',
  );
});

test('le compte s’écrit au singulier pour un seul élément', () => {
  assert.equal(libelleElements(1), '1 élément');
  assert.equal(libelleElements(2), '2 éléments');
  assert.equal(libelleElements(0), '0 élément');
});

/* -------------------------------------------------------------------------- *
 * 5. L'accord entre le SQL et le TypeScript
 * -------------------------------------------------------------------------- */

test('la correspondance des anciennes colonnes est la même des deux côtés', () => {
  const sql = correspondanceSql();

  assert.notEqual(sql, null, 'la migration ne recopie aucune ancienne colonne : le motif a changé');
  assert.equal(sql.length, 3, `couples lus en SQL : ${sql.length}`);

  assert.deepEqual(
    sql,
    [...CORRESPONDANCE_HISTORIQUE].sort(),
    'la migration et le repli de l’application doivent ranger les anciennes colonnes ' +
      'sous les mêmes catégories — sinon une journée reprise et une journée lue par le ' +
      'repli s’afficheraient sous deux titres différents',
  );
});

/* -------------------------------------------------------------------------- *
 * 6. Les pastilles
 * -------------------------------------------------------------------------- */

const TYPES_DE_PLAT = ['viande', 'poisson', 'vegetarien'];

test('chaque type de plat a son libellé et un couple de couleurs qui existe', () => {
  assert.deepEqual(Object.keys(CANTINE_DISH_TYPE_LABELS).sort(), [...TYPES_DE_PLAT].sort());
  assert.deepEqual(Object.keys(CANTINE_DISH_TYPE_ACCENTS).sort(), [...TYPES_DE_PLAT].sort());

  for (const type of TYPES_DE_PLAT) {
    const accent = CANTINE_DISH_TYPE_ACCENTS[type];

    // Le couple existe dans la palette : une couleur inventée ici serait une
    // couleur que personne n'a mesurée contre son fond, et le contrôle de
    // contraste ne la verrait pas passer.
    assert.ok(
      Object.hasOwn(accents, accent),
      `l’accent « ${accent} » de « ${type} » n’existe pas dans la palette`,
    );
  }

  // Les trois accents sont **distincts** : deux types qui partageraient une
  // couleur rendraient la pastille inutile, et c'est exactement ce qu'un parent
  // vient y chercher.
  assert.equal(new Set(Object.values(CANTINE_DISH_TYPE_ACCENTS)).size, 3);
});

/* -------------------------------------------------------------------------- *
 * 7. Le rangement, et la liste complète
 * -------------------------------------------------------------------------- */

test('chaque aliment est rangé sous sa journée, et aucun n’est perdu', () => {
  const parJour = rangerParJour([
    unAliment({ menu_id: 'menu-1' }),
    unAliment({ menu_id: 'menu-2' }),
    unAliment({ menu_id: 'menu-1' }),
  ]);

  assert.equal(parJour.get('menu-1').length, 2);
  assert.equal(parJour.get('menu-2').length, 1);
});

test('la liste des journées suit l’ordre reçu, et une journée sans aliment n’est pas écartée', () => {
  const premier = unMenu({ id: 'menu-1', service_date: '2026-09-21' });
  const second = unMenu({ id: 'menu-2', service_date: '2026-09-22', main_course: 'Rôti de dinde' });

  const jours = joursDeCantine(
    [premier, second],
    rangerParJour([unAliment({ menu_id: 'menu-1', category: 'plat', label: 'Filet de colin' })]),
  );

  assert.deepEqual(
    jours.map(({ menu }) => menu.id),
    ['menu-1', 'menu-2'],
  );

  // Le second jour n'a aucun aliment : il retombe sur sa colonne historique, et
  // il n'est pas silencieusement écarté de la liste.
  assert.deepEqual(titres(jours[1]), ['PLAT']);
  assert.equal(jours[1].elements, 1);
});
