/**
 * La migration est-elle **rejouable** ?
 *
 * POURQUOI CE FICHIER
 * -------------------
 * Appliquée à la main — dans l'éditeur SQL du tableau de bord, ou par l'API
 * Management — une migration n'a **aucun historique**. Un échec à mi-parcours ne
 * dit pas où reprendre, et l'outil s'arrête à la première erreur. Sur les deux
 * fichiers du dossier, dont le premier pèse trente-quatre kilo-octets et crée six
 * tables, dix-neuf politiques et sept déclencheurs, la seule issue praticable est
 * de pouvoir **rejouer le tout**.
 *
 * Or ce fichier ne l'était pas : mesuré avant correction, six `create table`
 * sans `if not exists`, dix-neuf `create policy` sans `drop policy if exists`,
 * cinq index, trois types énumérés et sept déclencheurs. Rejouer aurait échoué
 * à la première instruction — et la première instruction est un type, qui n'a
 * pas de forme « if not exists ».
 *
 * C'est exactement le défaut que le dépôt traque ailleurs : une erreur qui ne
 * produit ni exception ni message, seulement une impossibilité de continuer au
 * moment où l'on en a le plus besoin. La correction est faite ; ce fichier
 * empêche qu'elle se perde à la prochaine migration.
 *
 * CE QU'IL EXIGE, PAR FAMILLE
 * ---------------------------
 *
 * | instruction      | garde exigée                                    |
 * | ---------------- | ----------------------------------------------- |
 * | `create table`   | `create table if not exists`                    |
 * | `create index`   | `create index if not exists`                    |
 * | `create policy`  | `drop policy if exists <nom> on <table>;` avant |
 * | `create trigger` | `drop trigger if exists <nom> on <table>;` avant |
 * | `create type`    | un bloc `do $$ … exception when duplicate_object …` |
 *
 * Les deux familles du milieu ne sont pas vérifiées par un **compte** mais par
 * une **paire** : la garde doit porter le même nom **et** la même table que
 * l'instruction qu'elle précède. Un compte égal avec des noms croisés passerait
 * un contrôle de décompte et échouerait à l'exécution.
 *
 * Déjà rejouables, donc laissés tels quels : `create or replace function`,
 * `alter table … enable row level security`, `comment on`, `grant`, `revoke`.
 *
 * LES COMMENTAIRES SONT RETIRÉS AVANT TOUTE EXTRACTION
 * ---------------------------------------------------
 * Et ce n'est pas cosmétique ici : l'en-tête de la migration **cite** les formes
 * qu'il prescrit — `drop policy if exists <nom> on <table>;` figure en toutes
 * lettres dans la note qui explique la règle. Compter sur le texte brut
 * donnerait vingt gardes pour dix-neuf politiques, et le contrôle serait vert
 * pour une mauvaise raison.
 *
 * CE QUE CE FICHIER NE PEUT PAS VOIR
 * ----------------------------------
 * Il lit le fichier, il n'exécute rien. La frontière a longtemps été écrite
 * ainsi : « que la migration soit **valide** est l'affaire de `npm run
 * sql:check`, et que son application ait réussi est l'affaire de la vérification
 * qui interroge la base ». **Les deux moitiés étaient fausses, et mesurées
 * telles.**
 *
 * `npm run sql:check` passe le fichier à l'analyseur PostgreSQL : il en vérifie
 * la **syntaxe**, et ne résout aucun nom de table. Quant à « la vérification qui
 * interroge la base », elle n'existait pas — aucun banc n'exécutait la migration.
 *
 * Conséquence, et c'est ce qui a bloqué la mise en service : un adhérent a collé
 * le fichier dans l'éditeur SQL de Supabase et reçu `42P01: relation
 * "public.profiles" does not exist`, alors que **toute la suite était verte**.
 * `is_admin()` était la seule fonction en `language sql` du fichier, et un corps
 * `language sql` est analysé à sa création : la section « Fonctions utilitaires »
 * précédait la section « Tables ».
 *
 * La frontière est désormais tenue par `check-migration-applicable.test.mjs`, qui
 * **exécute** la migration et le seed, deux fois chacun, contre un vrai
 * PostgreSQL. Les deux bancs sont complémentaires : celui-ci lit le texte et dit
 * quelle garde manque, l'autre exécute et dit que le fichier s'applique.
 *
 * LA LISTE DES FICHIERS EST FERMÉE, ET ELLE A FALLU LA FERMER
 * -----------------------------------------------------------
 * La découverte passe par `readdir`, qui mesure ce qui **reste** et jamais ce
 * qui **manque**.
 *
 * J'avais écrit ici que ce n'était pas un trou, parce que d'autres bancs lisent
 * le même fichier. **Mesuré, c'est faux** : migration écartée du dossier, la
 * suite entière reste verte en dehors de ce fichier-ci — `check-schema-types` et
 * `check-rls-guards` comparent dans un sens qui tolère une partie absente, et
 * `check-schema-refs` lit ce qu'il trouve. La revendication était une
 * affirmation vérifiable, et la vérification l'a démentie.
 *
 * D'où `MIGRATIONS_ATTENDUES`, fermée dans les deux sens : un fichier qui
 * disparaît échoue, un fichier ajouté mais non déclaré échoue aussi. Déclarer
 * une nouvelle migration est le prix — et il est utile, puisque c'est le moment
 * de se demander si elle doit, elle aussi, être rejouable.
 */

import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const DOSSIER = fileURLToPath(new URL('../supabase/migrations', import.meta.url));

/**
 * Les migrations que le dépôt doit contenir.
 *
 * Liste **fermée** : voir l'en-tête. Une migration ajoutée doit être déclarée
 * ici — c'est le moment de vérifier qu'elle est, elle aussi, rejouable.
 */
const MIGRATIONS_ATTENDUES = [
  '20260916120000_init.sql',
  '20260919120000_rubriques.sql',
  '20260920120000_acces_public.sql',
  '20260921090000_administration.sql',
  '20260921120000_vote_connecte.sql',
  '20260921150000_super_admin.sql',
  '20260921180000_commentaires_trois_cibles.sql',
  '20260921210000_reglages_et_moderation.sql',
];

/**
 * Les politiques que la troisième migration **retire**, et qui n'ont donc pas
 * de `create policy` en face.
 *
 * Une garde sans instruction est le plus souvent une politique supprimée dont la
 * garde est restée — c'est ce que le test du surnombre surveille. Ici, les
 * retraits sont délibérés, et ils appartiennent à trois familles :
 *
 *   - la discussion passe d'« tout porteur d'un jeton » à « membre accepté », et
 *     laisser l'ancienne politique en place l'aurait **élargie** au lieu de la
 *     restreindre, puisque deux politiques de même opération pour un même rôle
 *     se cumulent ;
 *   - le vote de sondage n'a plus d'auteur à relire : `voter_id` est nul pour un
 *     vote d'appareil, donc la politique de lecture comparait deux valeurs
 *     nulles et n'autorisait rien de ce qu'elle annonçait ;
 *   - `messages` n'est plus écrit par l'application : l'ancien contact exigeait
 *     un compte, ce que l'accès public corrige. Les deux politiques partent,
 *     **aucune ligne n'est supprimée** — les messages déjà reçus restent en
 *     base, effacés en cascade avec le compte de leur auteur, comme
 *     `SECURITY.md` le promet.
 *   - les deux politiques de lecture et de modification des `signalements`
 *     changent de nom dans la sixième migration : un nom qui annonce `admin`
 *     sous une condition qui interroge `is_super_admin()` est un mensonge que le
 *     prochain lecteur croira. L'ancien nom est donc retiré, et le nouveau
 *     créé — deux retraits, et ils sont ici pour cette raison.
 *
 * Les nommer vaut mieux que de tolérer des gardes en surnombre : la liste dit
 * lesquelles, et le test vérifie que chacune est bien retirée et bien absente
 * des créations.
 */
const RETRAITS = [
  'discussion_messages_insert_own',
  'discussion_messages_select_authenticated',
  'messages_insert_own',
  'messages_select_own_or_admin',
  'signalements_select_own_or_admin',
  'signalements_update_own_or_admin',
  'sondage_votes_select_own_or_admin',
];

/** Les noms des fichiers de migration, dans un ordre stable. */
function nomsDeMigrations() {
  return readdirSync(DOSSIER)
    .filter((nom) => nom.endsWith('.sql'))
    .sort();
}

/**
 * Les lignes utiles des migrations : commentaires de ligne retirés, lignes
 * vides retirées.
 *
 * Seuls les commentaires **en début de ligne** sont retirés — c'est la forme
 * qu'emploie ce fichier, et cela évite de couper une ligne de code qui
 * contiendrait `--` dans une chaîne.
 */
function lignesUtiles(sql) {
  return sql
    .split('\n')
    .filter((ligne) => !/^\s*--/.test(ligne))
    .filter((ligne) => ligne.trim() !== '');
}

/** Toutes les lignes utiles, avec le fichier d'où chacune vient. */
function migrations() {
  return nomsDeMigrations().flatMap((nom) =>
    lignesUtiles(readFileSync(join(DOSSIER, nom), 'utf8')).map((ligne) => ({ nom, ligne })),
  );
}

/** Les lignes utiles, sans leur provenance — pour les comptages. */
function lignes() {
  return migrations().map(({ ligne }) => ligne);
}

/** Combien de lignes satisfont le motif. */
function compter(motif) {
  return lignes().filter((ligne) => motif.test(ligne)).length;
}

/**
 * Vérifie qu'une garde précède chaque instruction, avec le même nom et la même
 * table.
 *
 * @param {RegExp} creer motif de la ligne d'instruction ; le groupe 1 est le nom
 * @param {RegExp} garder motif de la ligne de garde ; groupe 1 le nom, groupe 2 la table
 * @param {(ligne: string) => string|null} tableDe lit la table sur la ligne suivante
 */
function verifierLesGardes(creer, garder, tableDe) {
  const toutes = lignes();
  const defauts = [];
  let paires = 0;

  for (let rang = 0; rang < toutes.length; rang += 1) {
    const creation = toutes[rang].match(creer);
    if (creation === null) {
      continue;
    }

    const nom = creation[1];
    const table = tableDe(toutes[rang + 1] ?? '');
    const precedente = toutes[rang - 1] ?? '';
    const garde = precedente.match(garder);

    if (garde === null) {
      defauts.push(
        `« ${nom} » n'a pas de garde : la ligne précédente est « ${precedente} ». ` +
          'Rejouer la migration échouerait sur une instruction déjà appliquée.',
      );
      continue;
    }
    if (garde[1] !== nom) {
      defauts.push(`la garde « ${garde[1]} » ne porte pas le nom de « ${nom} »`);
      continue;
    }
    if (garde[2] !== table) {
      defauts.push(`la garde de « ${nom} » vise « ${garde[2]} », l'instruction vise « ${table} »`);
      continue;
    }

    paires += 1;
  }

  return { defauts, paires };
}

/** La table lue dans une clause `on <table>`, ou `null`. */
function tableDansLaLigne(ligne) {
  return ligne.match(/\bon ([\w.]+)/)?.[1] ?? null;
}

test('les migrations attendues sont là, et aucune autre', () => {
  // Le seul contrôle de ce fichier dont l'absence d'un sujet produirait un
  // vert : `readdir` dit ce qui reste, pas ce qui manque. Mesuré — migration
  // écartée, le reste de la suite demeure vert.
  const noms = nomsDeMigrations();

  const manquantes = MIGRATIONS_ATTENDUES.filter((nom) => !noms.includes(nom));
  const nonDeclarees = noms.filter((nom) => !MIGRATIONS_ATTENDUES.includes(nom));

  assert.deepEqual(
    manquantes,
    [],
    `migration attendue absente de \`supabase/migrations/\` : ${manquantes.join(', ')} — ` +
      'le contrôle ne vérifie plus rien de ce qu’elle portait, et rien d’autre ne le signale',
  );
  assert.deepEqual(
    nonDeclarees,
    [],
    `migration présente mais non déclarée : ${nonDeclarees.join(', ')} — ` +
      'déclarez-la dans MIGRATIONS_ATTENDUES, et vérifiez qu’elle est rejouable',
  );
});

test('chaque `create table` porte `if not exists`', () => {
  const total = compter(/^\s*create table /);
  const gardees = compter(/^\s*create table if not exists /);

  assert.notEqual(total, 0, 'aucun `create table` : le contrôle serait vide');
  assert.equal(
    gardees,
    total,
    `${total - gardees} table(s) sans \`if not exists\` : rejouer la migration échouerait ` +
      'sur « relation already exists »',
  );
});

test('chaque `create index` porte `if not exists`', () => {
  const total = compter(/^\s*create index /);
  const gardees = compter(/^\s*create index if not exists /);

  assert.notEqual(total, 0, 'aucun `create index` : le contrôle serait vide');
  assert.equal(gardees, total, `${total - gardees} index sans \`if not exists\``);
});

test('chaque `create type` est enveloppé dans un bloc qui tolère le doublon', () => {
  // `create type` n'a pas de forme « if not exists » en PostgreSQL : le seul
  // idiome est le bloc `do`, avec `exception when duplicate_object`.
  const types = compter(/^\s*create type public\./);
  const blocs = compter(/^\s*when duplicate_object then null;$/);

  assert.notEqual(types, 0, 'aucun `create type` : le contrôle serait vide');
  assert.equal(
    blocs,
    types,
    `${types} type(s) énuméré(s) pour ${blocs} bloc(s) tolérant le doublon : sans le bloc, ` +
      'rejouer la migration échoue sur « type already exists »',
  );
});

test('chaque politique est précédée de sa garde, au même nom et sur la même table', () => {
  const { defauts, paires } = verifierLesGardes(
    /^\s*create policy (\w+)$/,
    /^\s*drop policy if exists (\w+) on ([\w.]+);$/,
    tableDansLaLigne,
  );

  assert.notEqual(paires + defauts.length, 0, 'aucune politique : le contrôle serait vide');
  assert.deepEqual(defauts, [], defauts.join('\n'));
});

test('chaque déclencheur est précédé de sa garde, au même nom et sur la même table', () => {
  const { defauts, paires } = verifierLesGardes(
    /^\s*create trigger (\w+)$/,
    /^\s*drop trigger if exists (\w+) on ([\w.]+);$/,
    tableDansLaLigne,
  );

  assert.notEqual(paires + defauts.length, 0, 'aucun déclencheur : le contrôle serait vide');
  assert.deepEqual(defauts, [], defauts.join('\n'));
});

test('les gardes ne sont pas en surnombre — une garde par instruction', () => {
  // Le sens inverse du contrôle : une garde sans instruction en face est le
  // signe d'une politique supprimée dont la garde est restée, ou d'un
  // déplacement qui a laissé la paire en désordre. Les deux se lisent mal à
  // l'œil, et aucun des tests précédents ne les voit.
  //
  // Le contrôle est passé du **compte** à la **liste** le jour où une migration
  // a légitimement retiré deux politiques : un compte égal aurait continué de
  // passer, mais un compte inégal ne dit pas lesquelles — et c'est justement ce
  // qu'on veut relire. Les deux retraits sont donc nommés dans `RETRAITS`, et
  // n'importe quel autre écart fait tomber le test.
  const occurrences = (motif) => {
    const compte = new Map();

    for (const ligne of lignes()) {
      const nom = motif.exec(ligne)?.[1];

      if (nom !== undefined) {
        compte.set(nom, (compte.get(nom) ?? 0) + 1);
      }
    }

    return compte;
  };

  const creees = occurrences(/^\s*create policy (\w+)$/);
  const gardees = occurrences(/^\s*drop policy if exists (\w+) on /);

  // Un nom est en surnombre quand il est retiré plus souvent qu'il n'est créé.
  // C'est ce qui distingue les deux retraits délibérés de la troisième migration
  // — qui visent des politiques **créées par la première** — d'une garde restée
  // derrière une politique supprimée.
  const sansInstruction = [...gardees.keys()]
    .filter((nom) => (gardees.get(nom) ?? 0) > (creees.get(nom) ?? 0))
    .sort();

  assert.notEqual(gardees.size, 0, 'aucune garde de politique : le contrôle serait vide');
  assert.deepEqual(
    sansInstruction,
    [...RETRAITS].sort(),
    'ces gardes ne précèdent aucune création : une politique supprimée dont la ' +
      'garde est restée, ou un retrait délibéré qu’il faut inscrire dans `RETRAITS`',
  );

  const declencheurs = compter(/^\s*create trigger /);
  const gardesDeclencheur = compter(/^\s*drop trigger if exists /);
  assert.equal(
    gardesDeclencheur,
    declencheurs,
    `${gardesDeclencheur} gardes de déclencheur pour ${declencheurs} déclencheurs`,
  );
});
