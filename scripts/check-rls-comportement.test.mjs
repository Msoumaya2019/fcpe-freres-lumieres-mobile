/**
 * =============================================================================
 *  Les politiques RLS **filtrent-elles** ?
 * =============================================================================
 *
 *  POURQUOI CE FICHIER
 *  -------------------
 *  `SECURITY.md` porte une exigence, et reconnaissait ne pas l'avoir satisfaite :
 *
 *      « Toute modification de politique RLS est vérifiée contre une base
 *        réelle. `npm run sql:check` valide la syntaxe, pas le comportement :
 *        une politique peut être syntaxiquement correcte et laisser passer ce
 *        qu'elle devrait bloquer. »
 *
 *      « Ce résultat reste une vérification **par lecture**. Il ne remplace pas
 *        l'exigence ci-dessus. »
 *
 *  Autrement dit : la sécurité de cette application repose **entièrement** sur
 *  ses politiques — l'application n'est pas une barrière, sa clé est publique et
 *  extractible d'un APK — et ces politiques n'avaient jamais été exécutées.
 *  Sept bancs les lisaient. Aucun ne les faisait tourner.
 *
 *  CE QUE CE BANC FAIT
 *  -------------------
 *  Il joue les rôles. Chaque contrôle se place dans le rôle `authenticated`,
 *  pose la revendication de session que `auth.uid()` lit, exécute une requête,
 *  et **annule tout** — le rôle, la revendication et l'écriture sont locaux à une
 *  transaction qui se termine toujours par `rollback`.
 *
 *  Il mesure ainsi ce qu'aucun banc de lecture ne peut mesurer : qu'une ligne
 *  est **invisible** à qui ne doit pas la voir, qu'une écriture est **refusée**,
 *  et que le refus prend la forme attendue.
 *
 *  DEUX FORMES DE REFUS, ET LA DIFFÉRENCE COMPTE
 *  --------------------------------------------
 *  Ce dépôt répète qu'« un refus renvoie une liste vide, pas une erreur ». C'est
 *  vrai d'un refus **de politique** : la ligne est filtrée, `select` rend zéro
 *  ligne, et l'application affiche un écran vide sans message. C'est faux du
 *  rôle `anon`, à qui la section « Privilèges » **retire ses droits** : celui-là
 *  reçoit `permission denied`, une erreur. Les deux sont mesurés ci-dessous,
 *  séparément, parce qu'ils ne se traitent pas de la même façon dans le code.
 *
 *  CE QUE CE BANC NE PROUVE PAS
 *  ----------------------------
 *  Il ne prouve pas qu'un **jeton signé par GoTrue** donne ces droits : ni
 *  GoTrue ni la signature ne sont ici. Le banc pose lui-même le rôle et la
 *  revendication, ce qui est exactement la couture que Supabase fournit à
 *  PostgREST. Ce qu'il prouve, c'est que les politiques, **une fois la couture
 *  posée**, filtrent ce qu'elles annoncent.
 *
 *  Il ne prouve pas non plus que les réglages du tableau de bord sont posés
 *  (aucun fichier du dépôt ne les porte, voir README §4), ni que la clé
 *  `service_role` est restée au tableau de bord — elle **contourne** toutes ces
 *  politiques, et c'est une règle de manipulation, pas une propriété du schéma.
 *
 *  LA PROCÉDURE D'AMORÇAGE EST EXERCÉE, PAS SEULEMENT CITÉE
 *  --------------------------------------------------------
 *  Promouvoir le premier administrateur est le premier geste de la mise en
 *  service, et il échoue si on l'écrit naïvement : `prevent_role_change` refuse
 *  toute modification de `role` à qui n'est pas déjà administrateur, et
 *  `is_admin()` lit `auth.uid()`, qui vaut `NULL` hors d'une requête
 *  authentifiée. La commande documentée encadre donc la mise à jour par
 *  `disable trigger` / `enable trigger`.
 *
 *  Les deux moitiés sont mesurées ici : le refus **sans** la parenthèse, et le
 *  succès **avec**. C'était jusqu'ici vérifié par un test de forme qui comparait
 *  trois copies du texte.
 */

import assert from 'node:assert/strict';
import test from 'node:test';
import { MIGRATION, SEED, appliquer, ouvrirBase } from './essai-postgres.mjs';

/** Trois comptes d'essai. Le troisième sera promu administrateur. */
const ALICE = '11111111-1111-1111-1111-111111111111';
const BRUNO = '22222222-2222-2222-2222-222222222222';
const CHLOE = '33333333-3333-3333-3333-333333333333';

/** Les rôles que ce banc sait jouer. Liste close : un rôle s'y ajoute à la main. */
const ROLES_CONNUS = ['anon', 'authenticated'];

const db = await ouvrirBase();

const echecs = { migration: null, comptes: null, promotion: null, donnees: null, seed: null };

echecs.migration = await appliquer(db, MIGRATION);

if (echecs.migration === null) {
  // Les comptes sont créés dans `auth.users` : c'est le déclencheur d'inscription
  // qui remplit `profiles`, comme en production. Écrire directement dans
  // `profiles` ne testerait pas le chemin réel.
  echecs.comptes = await appliquer(
    db,
    `insert into auth.users (id, email, raw_user_meta_data) values
       ('${ALICE}', 'alice@exemple.fr', '{"display_name":"Alice"}'::jsonb),
       ('${BRUNO}', 'bruno@exemple.fr', '{"display_name":"Bruno"}'::jsonb),
       ('${CHLOE}', 'chloe@exemple.fr', '{"display_name":"Chloe"}'::jsonb);`,
  );
}

if (echecs.migration === null && echecs.comptes === null) {
  // La procédure documentée, mot pour mot : la parenthèse et sa transaction.
  echecs.promotion = await appliquer(
    db,
    `begin;
     alter table public.profiles disable trigger profiles_prevent_role_change;

     update public.profiles
        set role = 'admin'
       from auth.users
      where auth.users.id = public.profiles.id
        and auth.users.email = 'chloe@exemple.fr';

     alter table public.profiles enable trigger profiles_prevent_role_change;
     commit;`,
  );
}

if (echecs.migration === null && echecs.comptes === null) {
  // Le seed d'abord : la réservation ci-dessous a besoin d'un menu pour
  // exister, et `cantine_menus` est vide tant que le seed n'est pas passé.
  echecs.seed = await appliquer(db, SEED);

  // Les données d'essai sont posées en superutilisateur : les politiques ne
  // s'appliquent pas au propriétaire des tables, et c'est ce qui permet de
  // préparer un état que les rôles ne pourraient pas créer.
  echecs.donnees = await appliquer(
    db,
    `insert into public.signalements (author_id, category, subject, body) values
       ('${ALICE}', 'cantine', 'Alice', 'corps'),
       ('${BRUNO}', 'transport', 'Bruno', 'corps');

     insert into public.cantine_reservations (menu_id, user_id)
     select id, '${ALICE}' from public.cantine_menus order by service_date limit 1;`,
  );
}

/**
 * Joue `sql` sous un rôle et une revendication de session, puis annule tout.
 *
 * Rend `{ lignes, touchees, erreur }` et ne lève **jamais** : un banc qui veut
 * prouver qu'une instruction est refusée a besoin de recevoir le refus.
 *
 * Le rôle est interpolé — il vient de `ROLES_CONNUS`, jamais d'une entrée.
 */
async function jouer(role, uid, sql) {
  assert.ok(ROLES_CONNUS.includes(role), `rôle inconnu : ${role}`);

  try {
    await db.exec('begin');
    await db.exec(`set local role ${role}`);
    await db.query("select set_config('request.jwt.claim.sub', $1, true)", [uid ?? '']);

    const resultat = await db.query(sql);
    await db.exec('rollback');

    // `rowCount` et non `affectedRows` : le premier est propre à l'instruction,
    // le second cumule celles d'un envoi multiple.
    return { lignes: resultat.rows, touchees: resultat.rowCount ?? null, erreur: null };
  } catch (erreur) {
    await db.exec('rollback');
    return {
      lignes: [],
      touchees: null,
      erreur: String(erreur.message ?? erreur).split('\n')[0],
    };
  }
}

/**
 * Échoue avec la **bonne** cause quand la base d'essai n'est pas en état.
 *
 * Sans cette garde, chaque contrôle échouerait à sa manière et désignerait un
 * coupable qui n'existe pas — leçon du banc précédent.
 */
function exigerLaBase() {
  assert.equal(
    echecs.migration,
    null,
    `sans migration appliquée, ce contrôle ne mesure rien :\n  ${echecs.migration}`,
  );
  assert.equal(echecs.comptes, null, `comptes d'essai non créés :\n  ${echecs.comptes}`);
  assert.equal(
    echecs.donnees,
    null,
    `données d'essai non posées — le banc mesurerait sur du vide :\n  ${echecs.donnees}`,
  );
}

test('la base d’essai est montée, et l’administrateur promu par la procédure documentée', async () => {
  exigerLaBase();
  assert.equal(
    echecs.promotion,
    null,
    'la procédure d’amorçage de `MISE-EN-SERVICE.md` ne passe pas : c’est le ' +
      `premier geste de la mise en service :\n  ${echecs.promotion}`,
  );

  const { rows } = await db.query(
    'select display_name, role from public.profiles order by display_name',
  );
  assert.deepEqual(rows, [
    { display_name: 'Alice', role: 'membre' },
    { display_name: 'Bruno', role: 'membre' },
    { display_name: 'Chloe', role: 'admin' },
  ]);
});

test('le verrou de rôle refuse la promotion écrite sans la parenthèse', async () => {
  exigerLaBase();
  // LA MOITIÉ QUI EXPLIQUE POURQUOI LA PROCÉDURE EXISTE — et elle se joue **en
  // propriétaire des tables**, pas dans un rôle.
  //
  // C'est le point contre-intuitif, et il a été mesuré en écrivant ce banc : par
  // l'API, ce déclencheur est **inatteignable**, puisque `profiles` n'a aucune
  // politique de modification — l'`update` ne touche zéro ligne sans même
  // l'atteindre (c'est le contrôle « aucun écran ne peut renommer un profil »).
  // Le piège décrit par la migration ne se reproduit donc que là où RLS ne
  // s'applique pas : dans l'éditeur SQL, qui agit en propriétaire. C'est
  // exactement la situation de la mise en service, et c'est pourquoi la
  // parenthèse est nécessaire.
  //
  // La transaction est annulée dans tous les cas : si le verrou cédait, la
  // promotion ne doit pas rester.
  await db.exec('begin');
  const echec = await appliquer(
    db,
    `update public.profiles set role = 'admin' where id = '${ALICE}'`,
  );
  await db.exec('rollback');

  assert.match(
    echec ?? '',
    /Seul un administrateur peut modifier le rôle d'un membre/,
    'le déclencheur `prevent_role_change` doit refuser la promotion écrite sans ' +
      'la parenthèse — sinon `MISE-EN-SERVICE.md` décrirait une précaution inutile',
  );
});

test('un refus de politique rend une liste vide, pas une erreur', async () => {
  exigerLaBase();
  // C'est la forme du refus qui compte : l'application n'affiche pas de message,
  // elle affiche « aucune donnée ». Un refus qui lèverait une erreur emprunterait
  // le chemin de `appErrorMessage`, et l'écran dirait autre chose.
  const lecture = await jouer(
    'authenticated',
    ALICE,
    `select subject from public.signalements where author_id = '${BRUNO}'`,
  );
  assert.deepEqual(lecture.lignes, [], 'Alice ne doit pas voir le signalement de Bruno');
  assert.equal(lecture.erreur, null, 'un refus de politique ne lève pas d’erreur');

  const ecriture = await jouer(
    'authenticated',
    ALICE,
    `update public.profiles set display_name = 'Alice2' where id = '${ALICE}'`,
  );
  assert.equal(ecriture.touchees, 0, 'aucune ligne ne doit être modifiable');
  assert.equal(ecriture.erreur, null, 'un refus de politique ne lève pas d’erreur');
});

test('les signalements ne sont lisibles que par leur auteur et par le bureau', async () => {
  exigerLaBase();
  const pourAlice = await jouer(
    'authenticated',
    ALICE,
    'select author_id from public.signalements',
  );
  assert.deepEqual(
    pourAlice.lignes.map(({ author_id }) => author_id),
    [ALICE],
    'un signalement peut concerner un enfant : il n’est pas lisible par les autres adhérents',
  );

  const pourBruno = await jouer(
    'authenticated',
    BRUNO,
    'select author_id from public.signalements',
  );
  assert.deepEqual(
    pourBruno.lignes.map(({ author_id }) => author_id),
    [BRUNO],
  );

  const pourLeBureau = await jouer(
    'authenticated',
    CHLOE,
    'select author_id from public.signalements order by author_id',
  );
  assert.equal(pourLeBureau.lignes.length, 2, 'un administrateur voit tous les signalements');
});

test('les profils et les annonces sont lisibles par tout porteur d’un jeton', async () => {
  exigerLaBase();
  // C'est le prix assumé du salon de discussion : résoudre un nom suppose de lire
  // `profiles`. Et c'est pourquoi aucune donnée sensible n’y vit.
  const profils = await jouer('authenticated', ALICE, 'select display_name from public.profiles');
  assert.equal(profils.lignes.length, 3, 'les trois profils sont lisibles par Alice');

  const annonces = await jouer('authenticated', ALICE, 'select title from public.annonces');
  assert.equal(annonces.lignes.length, 2, 'les annonces du seed sont lisibles par Alice');
});

test('les réservations de cantine ne sont lisibles que par leur auteur', async () => {
  exigerLaBase();
  const pourAlice = await jouer(
    'authenticated',
    ALICE,
    'select user_id from public.cantine_reservations',
  );
  assert.deepEqual(
    pourAlice.lignes.map(({ user_id }) => user_id),
    [ALICE],
  );

  const pourBruno = await jouer(
    'authenticated',
    BRUNO,
    'select user_id from public.cantine_reservations',
  );
  assert.deepEqual(pourBruno.lignes, [], 'Bruno n’a rien réservé, et ne doit rien voir');
});

test('aucun écran ne peut renommer un profil, pas même un administrateur', async () => {
  exigerLaBase();
  // `profiles` n’a **aucune** politique de modification : c’est ce qui rend vraie
  // la phrase « le nom affiché est une étiquette, pas une identité ». Le bureau
  // corrige un libellé depuis le tableau de bord, où `service_role` contourne les
  // politiques. Rétablir cette politique rendrait à un membre le pouvoir de
  // renommer **tous ses messages passés**, le nom étant résolu à la lecture.
  for (const [nom, uid] of [
    ['un membre', ALICE],
    ['un administrateur', CHLOE],
  ]) {
    const resultat = await jouer(
      'authenticated',
      uid,
      `update public.profiles set display_name = 'Autre' where id = '${ALICE}'`,
    );
    assert.equal(resultat.touchees, 0, `${nom} ne doit pouvoir renommer aucun profil`);
    assert.equal(resultat.erreur, null);
  }
});

test('le statut d’un signalement ne change que par un administrateur', async () => {
  exigerLaBase();
  // La politique de modification autorise l’auteur à corriger son texte ; c’est le
  // **déclencheur** qui réserve le passage à « traité » au bureau. Un verrou hors
  // de la politique, donc invisible à qui ne relit que les politiques.
  const parLeMembre = await jouer(
    'authenticated',
    ALICE,
    `update public.signalements set status = 'traite' where author_id = '${ALICE}'`,
  );
  assert.match(
    parLeMembre.erreur ?? '',
    /Seul un administrateur peut modifier le statut d'un signalement/,
    'un membre ne doit pas pouvoir clore son propre signalement',
  );

  const parLeBureau = await jouer(
    'authenticated',
    CHLOE,
    `update public.signalements set status = 'traite' where author_id = '${ALICE}'`,
  );
  assert.equal(parLeBureau.erreur, null, 'un administrateur doit pouvoir le clore');
  assert.equal(parLeBureau.touchees, 1, 'et la ligne doit effectivement changer');
});

test('un signalement ne peut être créé ni déjà traité, ni au nom d’un autre', async () => {
  exigerLaBase();
  // Le défaut trouvé puis corrigé : la condition d’insertion ne contraignait que
  // `author_id`, si bien qu’un client modifié créait un signalement déjà
  // « traité », que le bureau, qui filtre sur les nouveaux, ne voyait jamais.
  const dejaTraite = await jouer(
    'authenticated',
    ALICE,
    `insert into public.signalements (author_id, category, subject, body, status)
     values ('${ALICE}', 'autre', 'sujet', 'corps', 'traite')`,
  );
  assert.match(
    dejaTraite.erreur ?? '',
    /row-level security/,
    'la condition d’insertion doit contraindre `status`, pas seulement `author_id`',
  );

  const auNomDAutrui = await jouer(
    'authenticated',
    ALICE,
    `insert into public.signalements (author_id, category, subject, body)
     values ('${BRUNO}', 'autre', 'sujet', 'corps')`,
  );
  assert.match(auNomDAutrui.erreur ?? '', /row-level security/);

  // Le sens inverse, sans lequel les deux refus ne prouveraient rien : la même
  // insertion, au bon nom et au bon statut, doit passer.
  const legitime = await jouer(
    'authenticated',
    ALICE,
    `insert into public.signalements (author_id, category, subject, body)
     values ('${ALICE}', 'autre', 'sujet', 'corps')`,
  );
  assert.equal(legitime.erreur, null, 'une insertion légitime doit passer');
  assert.equal(legitime.touchees, 1);
});

test('un message et une réservation ne s’écrivent qu’en son nom', async () => {
  exigerLaBase();
  const messageAuNomDAutrui = await jouer(
    'authenticated',
    ALICE,
    `insert into public.discussion_messages (author_id, body) values ('${BRUNO}', 'texte')`,
  );
  assert.match(messageAuNomDAutrui.erreur ?? '', /row-level security/);

  const messageLegitime = await jouer(
    'authenticated',
    ALICE,
    `insert into public.discussion_messages (author_id, body) values ('${ALICE}', 'texte')`,
  );
  assert.equal(messageLegitime.erreur, null);
  assert.equal(messageLegitime.touchees, 1);

  const reservationAuNomDAutrui = await jouer(
    'authenticated',
    ALICE,
    `insert into public.cantine_reservations (menu_id, user_id)
     select id, '${BRUNO}' from public.cantine_menus order by service_date limit 1`,
  );
  assert.match(reservationAuNomDAutrui.erreur ?? '', /row-level security/);
});

test('le rôle anonyme n’obtient rien, et son refus n’est pas silencieux', async () => {
  exigerLaBase();
  // La seule différence de forme qui compte pour le code : `anon` ne reçoit pas
  // une liste vide mais `permission denied`, parce que la section « Privilèges »
  // lui **retire** ses droits — le refus précède la politique. L'application ne
  // s'en sert jamais, faute de session, mais la distinction doit être écrite.
  const resultat = await jouer('anon', null, 'select count(*)::int as n from public.annonces');

  assert.match(
    resultat.erreur ?? '',
    /permission denied/,
    'la clé publique seule ne doit permettre aucune lecture, et l’échec doit être ' +
      'une erreur — non une liste vide, qui se confondrait avec « aucune donnée »',
  );
  assert.deepEqual(resultat.lignes, []);
});

test('supprimer un compte efface ses données et détache ses annonces', async () => {
  // Sur une base **neuve** : ce contrôle détruit ses données, et le faire ici
  // plutôt qu'à la fin du fichier évite de dépendre de l'ordre des tests.
  const base = await ouvrirBase();
  const pas = await appliquer(base, MIGRATION);
  assert.equal(pas, null, `migration non appliquée sur la base neuve :\n  ${pas}`);

  await base.exec(
    `insert into auth.users (id, email, raw_user_meta_data)
     values ('${ALICE}', 'alice@exemple.fr', '{"display_name":"Alice"}'::jsonb);

     insert into public.cantine_menus (service_date) values (current_date);
     insert into public.annonces (title, body, author_id) values ('t', 'c', '${ALICE}');
     insert into public.signalements (author_id, category, subject, body)
       values ('${ALICE}', 'autre', 'sujet', 'corps');
     insert into public.discussion_messages (author_id, body) values ('${ALICE}', 'texte');
     insert into public.cantine_reservations (menu_id, user_id)
       select id, '${ALICE}' from public.cantine_menus limit 1;`,
  );

  await base.exec(`delete from auth.users where id = '${ALICE}'`);

  const restes = await base.query(`
    select
      (select count(*)::int from public.profiles)             as profils,
      (select count(*)::int from public.signalements)         as signalements,
      (select count(*)::int from public.discussion_messages)  as messages,
      (select count(*)::int from public.cantine_reservations) as reservations,
      (select count(*)::int from public.annonces)             as annonces,
      (select count(*)::int from public.annonces where author_id is null) as annonces_detachees
  `);

  // C'est la promesse faite aux adhérents, mesurée : une demande d'effacement se
  // traite en supprimant le compte, sans intervention table par table.
  assert.deepEqual(restes.rows[0], {
    profils: 0,
    signalements: 0,
    messages: 0,
    reservations: 0,
    annonces: 1,
    annonces_detachees: 1,
  });

  await base.close();
});
