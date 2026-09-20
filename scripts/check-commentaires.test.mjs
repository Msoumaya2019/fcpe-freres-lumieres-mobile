/**
 * =============================================================================
 *  Les commentaires : les trois cibles, et ce qu'un client ne peut pas écrire
 * =============================================================================
 *
 *  POURQUOI CE FICHIER
 *  -------------------
 *  `check-rls-guards` affirmait, en toutes lettres, que le comportement de
 *  `commentaires_insert_public` était « mesuré par `check-acces-public` ». La
 *  phrase était **fausse**, et il a fallu la mesurer pour le voir :
 *  `check-acces-public` monte la base après la **troisième** migration, et
 *  `commentaires` naît dans la **sixième**. La table n'existait pas dans la base
 *  de ce banc-là. La politique d'insertion la plus ouverte du schéma — elle
 *  accepte le rôle `anon` — n'était donc exercée par **rien**.
 *
 *  C'est la famille de défaut que ce dépôt traque partout : une affirmation
 *  vraie le jour où elle est écrite, et que rien ne re-mesure. Le corriger en
 *  changeant la phrase n'aurait rien réparé ; ce qu'il fallait, c'est un banc.
 *
 *  La septième migration rouvre le sujet, et de la pire façon : elle **réécrit**
 *  cette politique pour lui donner trois cibles. Une politique réécrite et non
 *  exercée est une régression qui attend son heure.
 *
 *  LA BASE D'ESSAI, ET POURQUOI ELLE EST COMPLÈTE
 *  ----------------------------------------------
 *  Ce banc lit le dossier des migrations et joue **la suite entière**, dans
 *  l'ordre du nom — pas une migration choisie. Deux raisons, et la seconde est
 *  la vraie :
 *
 *    - la politique qui est mesurée ici est celle de la **septième**, qui
 *      modifie une table créée par la **sixième** : jouer un sous-ensemble
 *      mesurerait une politique qui n'existe pas ;
 *    - une migration ajoutée plus tard entre dans ce banc sans qu'on y pense,
 *      et c'est ce qu'on veut — c'est l'état que la base distante aura.
 *
 *  CE QU'IL MESURE, ET QUI NE SE LIT NULLE PART
 *  --------------------------------------------
 *    - les trois cibles existent, `annonce_id` est facultative, et les deux
 *      nouvelles clés étrangères effacent **en cascade** ;
 *    - `num_nonnulls(…) = 1` refuse **zéro** cible et en refuse **deux** —
 *      mesuré **deux fois**, une par barrière : la politique pour un client, la
 *      contrainte pour une écriture en propriétaire ;
 *    - un parent sans compte dépose sous les trois cibles ;
 *    - il ne dépose **pas** sous une actualité en brouillon ;
 *    - il ne choisit pas son statut : `'publie'` est refusé par la politique ;
 *    - un commentaire en attente reste muet, un commentaire publié se lit ;
 *    - la lecture d’un fil ne dépend pas de la cible.
 *
 *  LES DEUX FORMES DE REFUS, DISTINGUÉES
 *  -------------------------------------
 *  Une contrainte de table lève une erreur `check_violation` ; un `with check`
 *  de politique lève `row-level security`. Les deux se ressemblent dans un
 *  journal, et elles ne se traitent pas de la même façon — la première signale
 *  un défaut du code, la seconde un client modifié. Le banc vérifie donc
 *  **laquelle** parle, et pas seulement qu'il y a un refus.
 *
 *  Ce que la mesure a appris, et qu'aucune lecture n'aurait donné : sur une
 *  cible absente, c'est la **politique** qui refuse en premier, même pour une
 *  écriture qui violerait aussi la contrainte. Les deux barrières ne se
 *  remplacent pas — elles se succèdent, et chacune est mesurée là où elle parle.
 *
 *  CE QU'IL NE PROUVE PAS
 *  ----------------------
 *  Il ne prouve pas qu'un jeton signé par GoTrue accorde ces droits : ni GoTrue
 *  ni la signature ne sont ici. Le banc pose lui-même le rôle et la
 *  revendication, ce qui est exactement la couture que Supabase donne à
 *  PostgREST. Il ne prouve pas non plus que l'écran affiche le fil — c'est
 *  l'affaire de `AnnonceDetailScreen` et de ses jumeaux.
 */

import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { appliquer, ouvrirBase } from './essai-postgres.mjs';

const DOSSIER_MIGRATIONS = fileURLToPath(new URL('../supabase/migrations', import.meta.url));

const SUITE = readdirSync(DOSSIER_MIGRATIONS)
  .filter((nom) => nom.endsWith('.sql'))
  .sort();

/** Un identifiant d'appareil, au format exigé par `commentaires_voter_key_format`. */
const APPAREIL = 'abcdef0123456789abcdef0123456789';
const AUTRE_APPAREIL = '0123456789abcdef0123456789abcdef';

const db = await ouvrirBase();
const echecs = [];

for (const nom of SUITE) {
  const echec = await appliquer(db, readFileSync(join(DOSSIER_MIGRATIONS, nom), 'utf8'));

  if (echec !== null) {
    echecs.push(`${nom} :\n  ${echec}`);
    break;
  }
}

if (echecs.length === 0) {
  // Les trois cibles, posées en propriétaire — c'est ce que fait l'éditeur SQL
  // du tableau de bord, et c'est la seule façon de poser un brouillon.
  const donnees = await appliquer(
    db,
    `insert into public.annonces (title, body, is_draft) values
       ('Kermesse', 'corps', false),
       ('Pas encore publiée', 'corps', true);

     insert into public.cantine_menus (service_date, main_course) values
       (date '2026-09-24', 'Gratin de courgettes');

     insert into public.sondages (question) values
       ('Faut-il ouvrir le portail à 8 h 15 ?');`,
  );

  if (donnees !== null) {
    echecs.push(`données d'essai :\n  ${donnees}`);
  }
}

/** Les identifiants posés ci-dessus, lus plutôt que recopiés. */
async function idDe(requete) {
  const { rows } = await db.query(requete);
  return rows[0].id;
}

/**
 * Joue `sql` sous un rôle, puis annule tout.
 *
 * Le `rollback` est inconditionnel, et c'est un choix : ce banc ne mesure que
 * des refus et des acceptations, jamais un effet observable après coup. Le
 * contrôle de cascade, lui, passe par la même transaction annulée.
 */
async function jouer(role, uid, sql, parametres = []) {
  try {
    await db.exec('begin');
    await db.exec(`set local role ${role}`);
    await db.query("select set_config('request.jwt.claim.sub', $1, true)", [uid ?? '']);

    const resultat = await db.query(sql, parametres);
    await db.exec('rollback');
    return { lignes: resultat.rows, erreur: null };
  } catch (erreur) {
    await db.exec('rollback');
    return { lignes: [], erreur: String(erreur.message ?? erreur).split('\n')[0] };
  }
}

function exigerLaBase() {
  assert.deepEqual(echecs, [], `la suite de migrations ne s’applique pas :\n${echecs.join('\n')}`);
}

test('la suite entière s’applique, et la base d’essai est montée', () => {
  exigerLaBase();
  assert.ok(SUITE.length >= 7, `migrations jouées : ${SUITE.join(', ')}`);
});

test('les trois cibles sont déclarées, et une seule est obligatoire', async () => {
  exigerLaBase();
  //  La liste est écrite en toutes lettres : une colonne perdue rendrait les
  //  contrôles suivants verts sur un schéma incomplet.
  const { rows } = await db.query(
    'select column_name as c, is_nullable as n, data_type as t ' +
      'from information_schema.columns ' +
      "where table_schema = 'public' and table_name = 'commentaires' " +
      "and column_name in ('annonce_id', 'sondage_id', 'menu_id') " +
      'order by column_name',
  );

  assert.deepEqual(
    rows.map(({ c, n, t }) => [c, n, t]),
    [
      ['annonce_id', 'YES', 'uuid'],
      ['menu_id', 'YES', 'uuid'],
      ['sondage_id', 'YES', 'uuid'],
    ],
    'les trois cibles doivent être facultatives en base : la contrainte dit ' +
      'qu’il en faut exactement une, la nullabilité seule ne peut pas le dire',
  );
});

test('les deux nouvelles clés étrangères effacent en cascade', async () => {
  exigerLaBase();
  //  La cascade n'est pas un détail de confort : c'est le mécanisme
  //  d'effacement du projet. Une clé étrangère sans `on delete` laisserait des
  //  commentaires orphelins — invisibles à l'écran, présents en base.
  const { rows } = await db.query(
    'select con.confdeltype as regle, att.attname as colonne, ' +
      '       cl.relname as cible ' +
      'from pg_constraint con ' +
      'join pg_class t on t.oid = con.conrelid ' +
      'join pg_class cl on cl.oid = con.confrelid ' +
      'join lateral unnest(con.conkey) as k(attnum) on true ' +
      'join pg_attribute att on att.attrelid = t.oid and att.attnum = k.attnum ' +
      "where con.contype = 'f' and t.relname = 'commentaires' " +
      "and att.attname in ('sondage_id', 'menu_id') " +
      'order by att.attname',
  );

  assert.deepEqual(
    rows.map(({ colonne, cible, regle }) => [colonne, cible, regle]),
    [
      ['menu_id', 'cantine_menus', 'c'],
      ['sondage_id', 'sondages', 'c'],
    ],
    '`c` est la lettre de `cascade` dans `pg_constraint.confdeltype`',
  );
});

test('la politique refuse un commentaire sans cible', async () => {
  exigerLaBase();
  //  MESURÉ, ET CONTRE L'INTUITION : avec **zéro** cible, c'est la politique qui
  //  parle, pas la contrainte. Aucune des trois branches `exists` n'est vraie,
  //  donc le `with check` refuse — et PostgreSQL rapporte le refus qu'il
  //  rencontre en premier. La contrainte, elle, est la seconde barrière, celle
  //  qui tient quand la RLS ne s'applique pas (propriétaire, `service_role`) :
  //  le contrôle suivant la mesure séparément.
  //
  //  Une première rédaction de ce banc attendait ici
  //  `commentaires_une_seule_cible` et tombait sur du code juste. Le défaut
  //  était dans l'assertion, et c'est l'assertion qui a été corrigée.
  const sansCible = await jouer(
    'anon',
    null,
    'insert into public.commentaires (auteur_nom, corps, voter_key) values ($1, $2, $3)',
    ['Une famille', 'Bonjour', APPAREIL],
  );
  assert.match(
    sansCible.erreur ?? '',
    /row-level security/i,
    'un commentaire sans cible n’appartiendrait à aucun fil : il serait en base ' +
      'et invisible partout, donc impossible à modérer',
  );
});

test('la contrainte tient même quand la RLS ne s’applique pas', async () => {
  exigerLaBase();
  //  En propriétaire, aucune politique n’est consultée : c’est le cas d’une
  //  écriture depuis l’éditeur SQL du tableau de bord, ou d’un script
  //  d’administration. Si la seule barrière était la politique, cette écriture
  //  passerait — et une ligne sans cible, ou à deux cibles, existerait.
  const annonce = await idDe("select id from public.annonces where title = 'Kermesse'");
  const sondage = await idDe('select id from public.sondages limit 1');

  const sansCible = await appliquer(
    db,
    `insert into public.commentaires (auteur_nom, corps, voter_key) values
       ('Une famille', 'Bonjour', '${APPAREIL}');`,
  );
  assert.match(
    sansCible ?? '',
    /commentaires_une_seule_cible/,
    'la contrainte doit nommer le défaut qu’elle refuse, sans quoi le message ' +
      'de l’éditeur SQL ne dit pas ce qui manque',
  );

  const deuxCibles = await appliquer(
    db,
    `insert into public.commentaires
       (annonce_id, sondage_id, auteur_nom, corps, voter_key)
     values
       ('${annonce}', '${sondage}', 'Une famille', 'Bonjour', '${APPAREIL}');`,
  );
  assert.match(
    deuxCibles ?? '',
    /commentaires_une_seule_cible/,
    'un commentaire à deux cibles apparaîtrait deux fois — dans deux fils, sous ' +
      'deux en-têtes, et le bureau le relirait deux fois pour une seule décision',
  );

  //  Et le cas qui doit passer, pour que le contrôle ne soit pas satisfait par
  //  une contrainte qui refuserait tout.
  const uneSeule = await appliquer(
    db,
    `insert into public.commentaires (annonce_id, auteur_nom, corps, voter_key) values
       ('${annonce}', 'Une famille', 'Bonjour', '${APPAREIL}');`,
  );
  assert.equal(uneSeule, null, `une cible unique doit passer :\n  ${uneSeule}`);
});

test('un parent sans compte dépose sous une actualité, un sondage et un jour de cantine', async () => {
  exigerLaBase();
  const annonce = await idDe("select id from public.annonces where title = 'Kermesse'");
  const sondage = await idDe('select id from public.sondages limit 1');
  const menu = await idDe('select id from public.cantine_menus limit 1');

  for (const [cible, valeur] of [
    ['annonce_id', annonce],
    ['sondage_id', sondage],
    ['menu_id', menu],
  ]) {
    const depot = await jouer(
      'anon',
      null,
      `insert into public.commentaires (${cible}, auteur_nom, corps, voter_key) ` +
        'values ($1, $2, $3, $4)',
      [valeur, 'Une famille', 'Une question sur ce point.', APPAREIL],
    );
    assert.equal(
      depot.erreur,
      null,
      `un parent sans compte doit pouvoir commenter par ${cible} : ${depot.erreur}`,
    );
  }
});

test('un commentaire sous une actualité en brouillon est refusé', async () => {
  exigerLaBase();
  //  Le point sensible de cette politique : un brouillon n'est visible de
  //  personne. Un commentaire déposé dessous publierait son existence — et le
  //  fil serait lu par les familles avant l'article qu'il commente.
  const brouillon = await idDe("select id from public.annonces where title = 'Pas encore publiée'");

  const depot = await jouer(
    'anon',
    null,
    'insert into public.commentaires (annonce_id, auteur_nom, corps, voter_key) ' +
      'values ($1, $2, $3, $4)',
    [brouillon, 'Une famille', 'Bonjour', APPAREIL],
  );

  assert.match(
    depot.erreur ?? '',
    /row-level security/i,
    'la politique d’insertion doit refuser une actualité en brouillon, même ' +
      'depuis un client modifié qui connaîtrait son identifiant',
  );
});

test('le statut ne vient pas du téléphone', async () => {
  exigerLaBase();
  const annonce = await idDe("select id from public.annonces where title = 'Kermesse'");

  const publie = await jouer(
    'anon',
    null,
    'insert into public.commentaires (annonce_id, auteur_nom, corps, voter_key, statut) ' +
      "values ($1, $2, $3, $4, 'publie')",
    [annonce, 'Une famille', 'Bonjour', APPAREIL],
  );
  assert.match(
    publie.erreur ?? '',
    /row-level security/i,
    'sans cette borne, la validation du bureau ne servirait à rien : un client ' +
      'modifié publierait directement',
  );

  const decide = await jouer(
    'anon',
    null,
    'insert into public.commentaires ' +
      '(annonce_id, auteur_nom, corps, voter_key, statut, moderated_at) ' +
      "values ($1, $2, $3, $4, 'publie', now())",
    [annonce, 'Une famille', 'Bonjour', APPAREIL],
  );
  assert.match(
    decide.erreur ?? '',
    /row-level security/i,
    'signer soi-même la décision de modération doit être refusé par la même ' +
      'politique, et non par la seule contrainte de forme',
  );
});

test('un commentaire en attente reste muet, un commentaire publié se lit', async () => {
  exigerLaBase();
  const annonce = await idDe("select id from public.annonces where title = 'Kermesse'");

  //  Posé en propriétaire : c'est le seul rôle qui peut créer un commentaire
  //  publié, la politique réservant ce geste au super administrateur. Le banc
  //  mesure la **lecture**, pas la modération.
  const pose = await appliquer(
    db,
    `insert into public.commentaires
       (annonce_id, auteur_nom, corps, voter_key, statut, moderated_at)
     values
       ('${annonce}', 'Une famille', 'Message en attente.', '${AUTRE_APPAREIL}',
        'en_attente', null),
       ('${annonce}', 'Le bureau', 'Message publié.', '${APPAREIL}',
        'publie', now());`,
  );
  assert.equal(pose, null, `la pose des deux commentaires doit passer :\n  ${pose}`);

  const lecture = await jouer(
    'anon',
    null,
    'select corps from public.commentaires where annonce_id = $1',
    [annonce],
  );

  assert.equal(lecture.erreur, null, 'anon doit lire la table sans erreur');
  assert.deepEqual(
    lecture.lignes.map(({ corps }) => corps),
    ['Message publié.'],
    'un refus de politique rend une liste vide, pas une erreur : seul ce ' +
      'contrôle distingue « la politique filtre » de « la politique manque »',
  );
});

test('la lecture ne dépend pas de la cible', async () => {
  exigerLaBase();
  //  La politique de lecture filtre sur `statut`, jamais sur la cible. C'est
  //  délibéré — une politique qui aurait à connaître les trois colonnes serait
  //  une occasion de plus de se tromper — et ce contrôle le fige : le jour où
  //  quelqu'un écrirait `annonce_id is not null` dans `commentaires_select_…`,
  //  le fil d'un sondage deviendrait muet sans que rien ne le dise.
  const sondage = await idDe('select id from public.sondages limit 1');

  const pose = await appliquer(
    db,
    `insert into public.commentaires
       (sondage_id, auteur_nom, corps, voter_key, statut, moderated_at)
     values
       ('${sondage}', 'Une famille', 'Publié sous un sondage.', '${APPAREIL}',
        'publie', now());`,
  );
  assert.equal(pose, null, `la pose doit passer :\n  ${pose}`);

  const lecture = await jouer(
    'anon',
    null,
    'select corps from public.commentaires where sondage_id = $1',
    [sondage],
  );

  assert.deepEqual(
    lecture.lignes.map(({ corps }) => corps),
    ['Publié sous un sondage.'],
    'un commentaire publié sous un sondage doit se lire comme les autres',
  );
});
