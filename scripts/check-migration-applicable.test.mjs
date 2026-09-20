/**
 * =============================================================================
 *  La migration **s'applique-t-elle** ?
 * =============================================================================
 *
 *  POURQUOI CE FICHIER
 *  -------------------
 *  Un adhérent a collé `supabase/migrations/20260916120000_init.sql` dans
 *  l'éditeur SQL de Supabase, comme `MISE-EN-SERVICE.md` le demande, et a reçu :
 *
 *      Failed to run sql query: ERROR: 42P01: relation "public.profiles"
 *      does not exist  LINE 111: from public.profiles
 *
 *  Le fichier était pourtant versionné, formaté, analysé — et **vert partout**.
 *
 *  LA CAUSE
 *  --------
 *  `is_admin()` est la **seule** fonction du fichier écrite en `language sql`.
 *  Un corps `language sql` est analysé **à sa création**, pas à son premier
 *  appel : PostgreSQL résout donc `public.profiles` au moment du `create
 *  function`. Or la section « Fonctions utilitaires » précédait la section
 *  « Tables », et la table n'existait pas encore — cent trente lignes plus bas.
 *
 *  Les quatre autres fonctions sont en PL/pgSQL, dont le corps n'est analysé
 *  qu'à l'exécution. Elles pouvaient précéder les tables sans dommage. C'est
 *  cette asymétrie, invisible à la lecture, qui rendait l'ordre signifiant.
 *
 *  POURQUOI AUCUN AUTRE BANC NE POUVAIT LE VOIR
 *  --------------------------------------------
 *  | banc                          | ce qu'il fait                  | pourquoi il est aveugle         |
 *  | ----------------------------- | ------------------------------ | ------------------------------- |
 *  | `npm run sql:check`           | analyse la **syntaxe**          | ne résout aucun nom de table    |
 *  | `check-schema-refs`           | résout les noms, tous ordres    | ne connaît pas l'ordre          |
 *  | `check-schema-types`          | compare les colonnes déclarées  | idem                            |
 *  | `check-migration-rejouable`   | lit les gardes `if not exists`  | lit le fichier, n'exécute rien  |
 *
 *  Et l'en-tête de ce dernier **affirmait** que la validité était l'affaire de
 *  `sql:check`. L'affirmation a été mesurée : elle est fausse. La syntaxe est
 *  valide, et le fichier ne s'applique pas. C'est exactement le défaut que ce
 *  dépôt traque ailleurs — un contrôle qui répond « rien à signaler » sur ce
 *  qu'il ne regarde pas.
 *
 *  CE QUE CE BANC FAIT, ET QUI EST NOUVEAU ICI
 *  -------------------------------------------
 *  Il **exécute** la migration. Pas d'analyse, pas de motif, pas de modèle :
 *  un vrai PostgreSQL 18.3 compilé en WebAssembly (PGlite), en mémoire, dans le
 *  processus de test. Ni serveur, ni Docker, ni réseau, ni coût.
 *
 *  Puis il l'exécute **deux fois**, et le seed deux fois : c'est la seule
 *  mesure qui porte sur ce que `check-migration-rejouable` déduit du texte.
 *
 *  Depuis, la **seconde** migration a rejoint ce banc. Elle était lue par trois
 *  contrôles — ses gardes `if not exists`, ses colonnes, ses bornes — et
 *  **exécutée par aucun** : les 29 189 octets que l'adhérent colle ensuite
 *  n'avaient jamais été joués nulle part. Son en-tête justifiait pourtant un
 *  choix de conception par « le banc qui exécute cette migration ». Voir la
 *  section qui la concerne, en fin de fichier.
 *
 *  LA DOUBLURE DE LA PLATEFORME
 *  ----------------------------
 *  Supabase fournit un schéma `auth` et des rôles que PGlite n'a pas. Ils sont
 *  dans `scripts/essai-postgres.mjs`, partagés avec le banc de comportement des
 *  politiques — deux copies divergeraient. Voir son en-tête pour ce que la
 *  doublure contient, et pourquoi les **privilèges par défaut** de la plateforme
 *  en font partie.
 *
 *  CE QUI A ÉTÉ ÉPROUVÉ, ET COMMENT
 *  --------------------------------
 *  Les contrôles de la seconde migration ont été **falsifiés**, pas seulement
 *  passés. Quatre mutations, un verdict attendu pour chacune :
 *
 *  | mutation                               | attendu | obtenu |
 *  | -------------------------------------- | ------- | ------ |
 *  | une politique retirée                  | tombe   | tombe  |
 *  | la RLS désactivée sur une table        | tombe   | tombe  |
 *  | une table en trop                      | tombe   | tombe  |
 *  | un commentaire ajouté (forme correcte) | passe   | passe  |
 *
 *  La dernière ligne compte autant que les trois autres : elle prouve que
 *  l'échec vient du **défaut**, et non du seul fait d'avoir touché au fichier.
 *  Le harnais gardait les **octets** d'origine — pas une empreinte, qui détecte
 *  une restauration ratée sans restaurer — et l'empreinte finale est identique
 *  à l'initiale.
 *
 *  CE QUE CE BANC NE PROUVE PAS
 *  ----------------------------
 *  Il prouve que le SQL **s'applique**. Il ne prouve pas que les politiques RLS
 *  **filtrent** — c'est l'objet de `check-rls-comportement.test.mjs`, qui joue
 *  les rôles. Il ne prouve pas non plus que les réglages du tableau de bord sont
 *  posés : aucun fichier du dépôt ne les porte, et c'est consigné au §4 du
 *  README.
 *
 *  LE COÛT, MESURÉ
 *  ---------------
 *  Une dépendance de développement, 25 Mo dans `node_modules`, jamais dans
 *  l'APK. Le dépôt accepte déjà `libpg-query` pour la même raison. Mesure faite
 *  avant d'accepter : `npm audit` reste à onze alertes modérées, inchangé.
 */

import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { MIGRATION, RUBRIQUES, SEED, appliquer, ouvrirBase } from './essai-postgres.mjs';

/**
 * Les tables que la migration doit produire, et **aucune autre**.
 *
 * Liste close : une table ajoutée sans être déclarée ici fait tomber le banc.
 * C'est voulu — le moment où l'on écrit le nom est celui où l'on se demande si
 * la table porte sa RLS, ses politiques et ses privilèges.
 */
const TABLES_ATTENDUES = [
  'annonces',
  'cantine_menus',
  'cantine_reservations',
  'discussion_messages',
  'profiles',
  'signalements',
];

/** Les fonctions attendues, avec leur langage — c'est lui qui portait le défaut. */
const FONCTIONS_ATTENDUES = {
  handle_new_user: 'plpgsql',
  is_admin: 'sql',
  prevent_role_change: 'plpgsql',
  prevent_status_change_by_member: 'plpgsql',
  set_updated_at: 'plpgsql',
};

/**
 * La base d'essai, construite une fois pour tout le fichier.
 *
 * Les échecs sont **retenus** au lieu d'être levés ici : un `throw` au chargement
 * du module donnerait un rapport illisible, alors que le premier test sait dire
 * ce qui s'est passé, avec la ligne.
 */
const db = await ouvrirBase();

const echecs = { migration: null, seed: null };
let migrationAppliquee = 0;
let seedApplique = 0;

for (let tour = 1; tour <= 2 && echecs.migration === null; tour += 1) {
  const echec = await appliquer(db, MIGRATION);
  if (echec === null) {
    migrationAppliquee = tour;
  } else {
    echecs.migration = `tour ${tour} : ${echec}`;
  }
}

if (echecs.migration === null) {
  for (let tour = 1; tour <= 2 && echecs.seed === null; tour += 1) {
    const echec = await appliquer(db, SEED);
    if (echec === null) {
      seedApplique = tour;
    } else {
      echecs.seed = `tour ${tour} : ${echec}`;
    }
  }
}

/** Les noms des tables du schéma `public`, triés. */
async function tables() {
  const { rows } = await db.query(
    "select tablename from pg_tables where schemaname = 'public' order by tablename",
  );
  return rows.map(({ tablename }) => tablename);
}

/**
 * Échoue avec la **bonne** cause quand la migration n'a pas été appliquée.
 *
 * Sans cette garde, chaque contrôle qui interroge le schéma échoue à sa manière
 * et désigne un coupable qui n'existe pas : mesuré, le contrôle du seed
 * annonçait « le seed n'a pas été joué deux fois » alors que le seed n'avait
 * jamais été **essayé** — la migration avait échoué avant. Un rapport qui
 * désigne la mauvaise cause coûte plus cher qu'un rapport absent.
 */
function exigerLaMigration() {
  assert.equal(
    echecs.migration,
    null,
    `sans migration appliquée, ce contrôle ne mesure rien :\n  ${echecs.migration}`,
  );
}

test('la migration s’applique, et se rejoue sans échouer', async () => {
  assert.equal(
    echecs.migration,
    null,
    'la migration ne s’applique pas — c’est le défaut qui a bloqué la mise en ' +
      `service :\n  ${echecs.migration}`,
  );
  assert.equal(migrationAppliquee, 2, 'la migration n’a pas été jouée deux fois');
});

test('le seed s’applique, et se rejoue sans créer de doublon', async () => {
  exigerLaMigration();
  assert.equal(echecs.seed, null, `le seed ne s’applique pas :\n  ${echecs.seed}`);
  assert.equal(seedApplique, 2, 'le seed n’a pas été joué deux fois');
});

test('les tables du schéma public sont exactement celles attendues', async () => {
  exigerLaMigration();
  assert.deepEqual(
    await tables(),
    TABLES_ATTENDUES,
    'une table ajoutée doit être déclarée dans TABLES_ATTENDUES — et, dans le même ' +
      'commit, recevoir sa RLS, ses politiques et ses privilèges',
  );
});

test('chaque table du schéma public est sous RLS', async () => {
  exigerLaMigration();
  const { rows } = await db.query(
    "select relname from pg_class where relnamespace = 'public'::regnamespace " +
      'and relkind = ' +
      "'r' and not relrowsecurity order by relname",
  );
  assert.deepEqual(
    rows.map(({ relname }) => relname),
    [],
    'une table sans RLS est lisible et modifiable par tout porteur de la clé ' +
      'publique — le défaut le plus courant et le plus coûteux d’un projet Supabase',
  );
});

test('les fonctions attendues existent, chacune dans son langage', async () => {
  exigerLaMigration();
  const { rows } = await db.query(
    'select p.proname as nom, l.lanname as langage from pg_proc p ' +
      'join pg_namespace n on n.oid = p.pronamespace ' +
      'join pg_language l on l.oid = p.prolang ' +
      "where n.nspname = 'public' order by p.proname",
  );

  const obtenu = Object.fromEntries(rows.map(({ nom, langage }) => [nom, langage]));
  assert.deepEqual(
    obtenu,
    FONCTIONS_ATTENDUES,
    'le langage d’une fonction n’est pas un détail : un corps `language sql` est ' +
      'analysé à sa création, donc il ne peut pas précéder les tables qu’il lit',
  );
});

test('les politiques et les déclencheurs sont tous créés', async () => {
  exigerLaMigration();
  const politiques = await db.query(
    "select count(*)::int as n from pg_policies where schemaname = 'public'",
  );
  assert.equal(politiques.rows[0].n, 19, 'nombre de politiques du schéma public');

  // Six déclencheurs sur des tables de `public`, plus celui posé sur `auth.users`
  // — qui n'apparaît pas dans ce compte, d'où les deux nombres.
  const declencheurs = await db.query(
    'select count(*)::int as n from pg_trigger t join pg_class c on c.oid = t.tgrelid ' +
      "where c.relnamespace = 'public'::regnamespace and not t.tgisinternal",
  );
  assert.equal(declencheurs.rows[0].n, 6, 'déclencheurs sur les tables du schéma public');

  const surAuth = await db.query(
    'select count(*)::int as n from pg_trigger t join pg_class c on c.oid = t.tgrelid ' +
      "where c.relnamespace = 'auth'::regnamespace and not t.tgisinternal",
  );
  assert.equal(surAuth.rows[0].n, 1, 'déclencheur d’inscription, posé sur auth.users');
});

test('le seed rejoué deux fois ne produit ni doublon ni échec', async () => {
  exigerLaMigration();
  const { rows } = await db.query(
    'select (select count(*)::int from public.annonces) as annonces, ' +
      '(select count(*)::int from public.cantine_menus) as menus',
  );
  // Deux annonces et huit menus après **deux** passages : c'est l'idempotence
  // réelle, mesurée, et non celle que le texte du seed promet.
  assert.deepEqual(rows[0], { annonces: 2, menus: 8 });
});

/**
 * =============================================================================
 *  La seconde migration — celle que personne n'exécutait
 * =============================================================================
 *
 *  Son en-tête justifiait de ne pas créer le compartiment de stockage en SQL par
 *  cette phrase : « un `insert into storage.buckets` ferait donc tomber le banc
 *  qui **exécute** cette migration, et ce banc est la seule chose qui prouve
 *  qu'elle s'applique ».
 *
 *  Mesuré : ce banc ne lisait que `20260916120000_init.sql`. Les 29 189 octets
 *  que l'adhérent colle **ensuite** n'avaient donc jamais été exécutés nulle
 *  part — versionnés, formatés, analysés, et verts partout. Trois autres bancs
 *  lisent ce fichier, et aucun n'exécute rien.
 *
 *  C'est la même famille que le défaut qui a fait naître ce fichier : une
 *  affirmation vraie le jour où elle est écrite, et que rien ne re-mesure.
 *
 *  Base **séparée**, et c'est nécessaire : les contrôles ci-dessus portent sur
 *  six tables, ceux-ci sur douze. Les mêler aurait rendu les deux listes fausses,
 *  et l'échec aurait désigné un coupable qui n'existe pas.
 */

/** Les douze tables après les **deux** premières migrations, et **aucune autre**. */
const TABLES_APRES_RUBRIQUES = [
  'agenda_events',
  'annonces',
  'cantine_menus',
  'cantine_reservations',
  'discussion_messages',
  'documents',
  'messages',
  'profiles',
  'signalements',
  'sondage_choices',
  'sondage_votes',
  'sondages',
];

/**
 * Le nombre de politiques de chaque table, mesuré.
 *
 * Liste close : une politique perdue fait tomber le banc. Elle rendrait une
 * **liste vide, pas une erreur** — l'écran resterait muet, et rien ne le dirait.
 */
const POLITIQUES_ATTENDUES = {
  agenda_events: 4,
  annonces: 4,
  cantine_menus: 4,
  cantine_reservations: 3,
  discussion_messages: 3,
  documents: 4,
  messages: 4,
  profiles: 2,
  signalements: 3,
  sondage_choices: 4,
  sondage_votes: 3,
  sondages: 4,
};

const dbRubriques = await ouvrirBase();
const echecsRubriques = { init: null, rubriques: null };
let rubriquesAppliquee = 0;

for (let tour = 1; tour <= 2 && echecsRubriques.init === null; tour += 1) {
  const echec = await appliquer(dbRubriques, MIGRATION);
  if (echec !== null) {
    echecsRubriques.init = `tour ${tour} : ${echec}`;
  }
}

if (echecsRubriques.init === null) {
  for (let tour = 1; tour <= 2 && echecsRubriques.rubriques === null; tour += 1) {
    const echec = await appliquer(dbRubriques, RUBRIQUES);
    if (echec === null) {
      rubriquesAppliquee = tour;
    } else {
      echecsRubriques.rubriques = `tour ${tour} : ${echec}`;
    }
  }
}

/** Échoue avec la **bonne** cause : ici, l'échec se produirait chez l'adhérent. */
function exigerLesRubriques() {
  assert.equal(
    echecsRubriques.init,
    null,
    'la première migration ne s’applique pas, donc celle-ci n’a même pas été ' +
      `essayée :\n  ${echecsRubriques.init}`,
  );
  assert.equal(
    echecsRubriques.rubriques,
    null,
    'la seconde migration ne s’applique pas — c’est le fichier que l’adhérent ' +
      `colle juste après le premier :\n  ${echecsRubriques.rubriques}`,
  );
}

test('la seconde migration s’applique, et se rejoue sans échouer', async () => {
  exigerLesRubriques();
  assert.equal(rubriquesAppliquee, 2, 'la seconde migration n’a pas été jouée deux fois');
});

test('les deux premières migrations produisent les douze tables, et aucune autre', async () => {
  //  Les **deux premières**, et c'est un périmètre, pas un décompte du projet :
  //  une troisième migration suit, elle ajoute trois tables, et c'est
  //  `check-acces-public` qui l'exécute. Cette base-ci s'arrête avant elle, pour
  //  que la liste ci-dessus reste close sur ce qu'elle décrit.
  exigerLesRubriques();
  const { rows } = await dbRubriques.query(
    "select tablename from pg_tables where schemaname = 'public' order by tablename",
  );
  assert.deepEqual(
    rows.map(({ tablename }) => tablename),
    TABLES_APRES_RUBRIQUES,
    'une table ajoutée doit être déclarée ici — et recevoir, dans le même commit, ' +
      'sa RLS, ses politiques et ses privilèges',
  );
});

test('aucune table des rubriques n’est laissée sans RLS', async () => {
  exigerLesRubriques();
  const { rows } = await dbRubriques.query(
    "select relname from pg_class where relnamespace = 'public'::regnamespace " +
      "and relkind = 'r' and not relrowsecurity order by relname",
  );
  assert.deepEqual(
    rows.map(({ relname }) => relname),
    [],
  );
});

test('chaque table des rubriques porte le nombre attendu de politiques', async () => {
  exigerLesRubriques();
  const { rows } = await dbRubriques.query(
    "select tablename, count(*)::int as n from pg_policies where schemaname = 'public' " +
      'group by tablename order by tablename',
  );
  assert.deepEqual(
    Object.fromEntries(rows.map(({ tablename, n }) => [tablename, n])),
    POLITIQUES_ATTENDUES,
  );
});

test('la fonction de vote est en PL/pgSQL, et les onze déclencheurs sont posés', async () => {
  exigerLesRubriques();
  const { rows } = await dbRubriques.query(
    'select p.proname as nom, l.lanname as langage from pg_proc p ' +
      'join pg_namespace n on n.oid = p.pronamespace ' +
      'join pg_language l on l.oid = p.prolang ' +
      "where n.nspname = 'public' order by p.proname",
  );
  assert.deepEqual(
    Object.fromEntries(rows.map(({ nom, langage }) => [nom, langage])),
    {
      check_vote_choice: 'plpgsql',
      handle_new_user: 'plpgsql',
      is_admin: 'sql',
      prevent_role_change: 'plpgsql',
      prevent_status_change_by_member: 'plpgsql',
      set_updated_at: 'plpgsql',
    },
    'un corps `language sql` est analysé à sa création : il ne peut pas précéder ' +
      'les tables qu’il lit',
  );

  const { rows: declencheurs } = await dbRubriques.query(
    'select count(*)::int as n from pg_trigger t join pg_class c on c.oid = t.tgrelid ' +
      "where c.relnamespace = 'public'::regnamespace and not t.tgisinternal",
  );
  assert.equal(declencheurs[0].n, 11, 'déclencheurs sur les tables du schéma public');
});

/**
 * La raison de l'ordre, éprouvée — et le message que le guide cite.
 *
 * `MISE-EN-SERVICE.md` §1.3 demande de coller les deux fichiers « dans cet
 * ordre ». La raison est que le second **complète** le premier : il ajoute une
 * colonne à `annonces`, une table que le premier crée. Le guide a longtemps dit
 * l'inverse — « ce fichier est indépendant du premier, il ne le modifie pas » —,
 * et le fichier lui-même démentait cette phrase : `alter table public.annonces`
 * est sa première référence à une table de la première migration.
 *
 * L'affirmation est désormais corrigée, et voici ce qui la tient : collée
 * **seule**, la seconde migration est refusée, et le refus nomme `annonces`.
 * C'est exactement le message que le guide cite maintenant, et il est ici
 * **vérifié** plutôt que recopié.
 *
 * Le sens de ce test compte autant que son contenu. Il n'épingle pas une
 * limitation par goût de la contrainte : il tient la **raison** d'une consigne
 * que l'adhérent lit. Le jour où la seconde migration deviendrait autonome, ce
 * test tomberait — et c'est le guide qu'il faudrait relire, pas le test qu'il
 * faudrait assouplir.
 */
test('la seconde migration, collée seule, est refusée — et le refus nomme annonces', async () => {
  const dbSeule = await ouvrirBase();
  const refus = await appliquer(dbSeule, RUBRIQUES);

  assert.notEqual(
    refus,
    null,
    'la seconde migration s’applique seule : l’ordre des deux fichiers ne compte ' +
      'plus, et la phrase du guide doit être relue',
  );
  assert.match(
    refus,
    /relation "public\.annonces" does not exist/,
    `le refus doit nommer la table que le premier fichier crée :\n  ${refus}`,
  );
});

/**
 * =============================================================================
 *  Toutes les migrations, dans l'ordre, deux fois
 * =============================================================================
 *
 *  Les deux sections précédentes s'arrêtent à la première et à la deuxième
 *  migration. Elles mesurent un **état intermédiaire**, et c'est délibéré — mais
 *  cela laissait un trou, et il a fallu le mesurer pour le voir : les fichiers
 *  **quatre, cinq et six** n'étaient exécutés par **aucun banc**. Trois fichiers,
 *  dont le dernier pèse vingt-deux kilo-octets et crée une table, deux colonnes
 *  et neuf politiques, étaient versionnés, formatés, analysés, lus par deux
 *  autres contrôles — et jamais joués.
 *
 *  C'est exactement la famille de défaut qui a produit ce fichier-ci : une
 *  affirmation vraie le jour où elle est écrite, et que rien ne re-mesure. Le
 *  premier collage a échoué chez l'adhérent sur `42P01`, et **tout le reste
 *  était vert**. Le sixième fichier est plus long que le premier.
 *
 *  Ce n'est donc pas un troisième état intermédiaire : c'est la **suite
 *  complète**, lue depuis le dossier plutôt que listée à la main. Un fichier
 *  ajouté plus tard entre ici sans qu'on y pense — et c'est ce qu'on veut,
 *  puisque c'est lui qu'on colle ensuite.
 *
 *  La liste fermée, elle, vit dans `check-migration-rejouable.test.mjs` : ce
 *  banc-ci mesure que la suite **s'exécute**, pas qu'elle est complète. Les deux
 *  questions sont distinctes, et les mêler aurait rendu les deux réponses
 *  ambiguës.
 *
 *  Deux passages, comme pour les deux premières : appliquer puis **rejouer**.
 *  C'est ce que le guide demande à l'adhérent de pouvoir faire, et c'est la seule
 *  mesure qui porte sur les gardes `if not exists` et les `drop policy if exists`
 *  que `check-migration-rejouable` déduit du texte.
 */

const DOSSIER_MIGRATIONS = fileURLToPath(new URL('../supabase/migrations', import.meta.url));

const SUITE = readdirSync(DOSSIER_MIGRATIONS)
  .filter((nom) => nom.endsWith('.sql'))
  .sort();

const dbSuite = await ouvrirBase();
const echecsSuite = [];
let toursComplets = 0;

for (let tour = 1; tour <= 2 && echecsSuite.length === 0; tour += 1) {
  let passage = true;

  for (const nom of SUITE) {
    const echec = await appliquer(dbSuite, readFileSync(join(DOSSIER_MIGRATIONS, nom), 'utf8'));

    if (echec !== null) {
      echecsSuite.push(`tour ${tour}, ${nom} :\n  ${echec}`);
      passage = false;
      break;
    }
  }

  if (passage) {
    toursComplets = tour;
  }
}

/** Échoue avec la bonne cause : sans la suite, les contrôles suivants ne mesurent rien. */
function exigerLaSuite() {
  assert.deepEqual(
    echecsSuite,
    [],
    'la suite de migrations ne s’applique pas — c’est le défaut qui a bloqué la mise ' +
      'en service, et c’est le fichier fautif qui est nommé ici',
  );
}

/** Les tables du schéma `public`, triées. */
async function tablesDeLaSuite() {
  const { rows } = await dbSuite.query(
    "select tablename from pg_tables where schemaname = 'public' order by tablename",
  );
  return rows.map(({ tablename }) => tablename);
}

test('les migrations s’appliquent toutes, dans l’ordre, et se rejouent', () => {
  // Le contrôle de complétude du dossier : sans lui, un `readdir` qui ne
  // trouverait rien ferait passer les tests suivants sur un schéma vide.
  assert.ok(SUITE.length >= 6, `migrations trouvées : ${SUITE.join(', ')}`);
  exigerLaSuite();
  assert.equal(toursComplets, 2, 'la suite n’a pas été jouée deux fois');
});

test('la suite complète produit les seize tables attendues, et aucune autre', async () => {
  exigerLaSuite();
  assert.deepEqual(await tablesDeLaSuite(), [
    'agenda_events',
    'annonces',
    'cantine_menus',
    'cantine_reservations',
    'commentaires',
    'conversation_messages',
    'conversations',
    'discussion_messages',
    'documents',
    'messages',
    'profiles',
    'push_tokens',
    'signalements',
    'sondage_choices',
    'sondage_votes',
    'sondages',
  ]);
});

test('aucune table de la suite n’est laissée sans RLS', async () => {
  // Le défaut que rien d'autre ne rattrape : une table créée dans l'éditeur SQL
  // de Supabase n'a **pas** la RLS activée, et ses politiques ne sont alors
  // jamais consultées. Elle est lisible et modifiable par tout porteur de la clé
  // publique. Mesuré sur la sixième migration : c'était le cas de
  // `commentaires`, et `check-rls-guards` l'a dit avant que ce banc-ci existe.
  exigerLaSuite();
  const { rows } = await dbSuite.query(
    "select relname from pg_class where relnamespace = 'public'::regnamespace " +
      "and relkind = 'r' and not relrowsecurity order by relname",
  );
  assert.deepEqual(
    rows.map(({ relname }) => relname),
    [],
    'une table sans RLS est ouverte à tout porteur de la clé publique',
  );
});

test('les fonctions du super administrateur existent, dans le bon langage', async () => {
  // Le langage n'est pas un détail : un corps `language sql` est analysé **à sa
  // création**, donc `is_super_admin()` ne peut pas précéder la colonne qu'il
  // lit. C'est le défaut qui a coûté une migration à ce projet, et la sixième le
  // rejoue — elle écrit deux fonctions en `sql` au-dessus d'une colonne ajoutée
  // trois sections plus haut.
  exigerLaSuite();
  const { rows } = await dbSuite.query(
    'select p.proname as nom, l.lanname as langage from pg_proc p ' +
      'join pg_namespace n on n.oid = p.pronamespace ' +
      'join pg_language l on l.oid = p.prolang ' +
      "where n.nspname = 'public' and p.proname in ('is_admin', 'is_super_admin') " +
      'order by p.proname',
  );
  assert.deepEqual(
    rows.map(({ nom, langage }) => [nom, langage]),
    [
      ['is_admin', 'sql'],
      ['is_super_admin', 'sql'],
    ],
  );
});

test('les trois colonnes ajoutées après coup sont bien là, avec leur défaut', async () => {
  // Un `alter table … add column if not exists` qui ne s'exécute pas ne lève
  // rien : il **fait** quelque chose, ou rien, et les deux se ressemblent. Le
  // seul juge est le catalogue — et le défaut compte autant que la colonne,
  // puisque c'est lui qui laisse les lignes existantes dans leur état.
  exigerLaSuite();
  const { rows } = await dbSuite.query(
    'select table_name as t, column_name as c, is_nullable as n, column_default as d ' +
      'from information_schema.columns ' +
      "where table_schema = 'public' " +
      "and ((table_name = 'profiles' and column_name = 'est_super_admin') " +
      "or (table_name = 'annonces' and column_name in ('is_draft', 'image_path'))) " +
      'order by table_name, column_name',
  );
  assert.deepEqual(
    rows.map(({ t, c, n, d }) => [t, c, n, d]),
    [
      ['annonces', 'image_path', 'YES', null],
      ['annonces', 'is_draft', 'NO', 'false'],
      ['profiles', 'est_super_admin', 'NO', 'false'],
    ],
  );
});

test('l’énumération des commentaires porte ses trois états, dans l’ordre', async () => {
  // L'ordre compte : c'est celui du SQL, et `check-schema-types` compare le
  // miroir TypeScript à cette liste-là. Une valeur ajoutée en fin d'énumération
  // décalerait un libellé sans qu'aucun autre outil ne le voie.
  exigerLaSuite();
  const { rows } = await dbSuite.query(
    'select e.enumlabel as valeur from pg_enum e ' +
      'join pg_type t on t.oid = e.enumtypid ' +
      "where t.typname = 'commentaire_statut' order by e.enumsortorder",
  );
  assert.deepEqual(
    rows.map(({ valeur }) => valeur),
    ['en_attente', 'publie', 'refuse'],
  );
});
