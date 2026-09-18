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
 *  LA DOUBLURE DE LA PLATEFORME
 *  ----------------------------
 *  Supabase fournit un schéma `auth` et des rôles que PGlite n'a pas. Ils sont
 *  dans `scripts/essai-postgres.mjs`, partagés avec le banc de comportement des
 *  politiques — deux copies divergeraient. Voir son en-tête pour ce que la
 *  doublure contient, et pourquoi les **privilèges par défaut** de la plateforme
 *  en font partie.
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
import test from 'node:test';
import { MIGRATION, SEED, appliquer, ouvrirBase } from './essai-postgres.mjs';

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
