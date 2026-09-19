/**
 * =============================================================================
 *  L'accès public : les politiques tiennent-elles ce qu'elles promettent ?
 * =============================================================================
 *
 *  POURQUOI CE FICHIER
 *  -------------------
 *  La troisième migration renverse le point de départ de l'application : un
 *  parent lit les informations **sans compte**, avec le rôle `anon`. Jusqu'ici
 *  ce rôle n'avait aucun privilège, et le dépôt répète depuis le premier jour
 *  qu'un refus rend une **liste vide, pas une erreur**.
 *
 *  Ces deux propriétés se conjuguent en un piège : si une politique manque ou
 *  si le `grant` qui l'accompagne manque, l'écran d'un parent affiche « aucune
 *  donnée » — et rien, ni le typage, ni la relecture, ni un banc de forme, ne le
 *  signale. Seul un banc qui **exécute** la requête sous le rôle réel peut
 *  distinguer « la politique est écrite » de « la lecture aboutit ».
 *
 *  CE QUE CE BANC MESURE, ET QUI NE SE LIT NULLE PART
 *  --------------------------------------------------
 *    - les six tables publiées se lisent vraiment avec le rôle `anon` ;
 *    - un document `bureau` reste invisible à ce même rôle ;
 *    - le contenu des conversations est **inatteignable** directement, et
 *      seulement atteignable avec le bon secret ;
 *    - un compte dont l'inscription n'est pas acceptée lit une discussion
 *      **vide** — et c'est la politique, pas l'écran, qui le décide ;
 *    - un membre ne peut pas s'accepter lui-même ;
 *    - le bureau, lui, le peut — par `decider_adhesion()`, la seule voie
 *      d'écriture d'un statut, éprouvée du côté qui refuse **et** du côté qui
 *      accorde, jusqu'à l'effet visible ;
 *    - un vote anonyme passe sur un sondage ouvert et échoue sur un sondage clos.
 *
 *  CE QU'IL NE PROUVE PAS
 *  ----------------------
 *  Il ne prouve pas qu'un jeton signé par GoTrue accorde ces droits : ni GoTrue
 *  ni la signature ne sont ici. Le banc pose lui-même le rôle et la
 *  revendication, ce qui est exactement la couture que Supabase donne à
 *  PostgREST. Il ne prouve pas non plus que les réglages du tableau de bord sont
 *  posés — le compartiment de stockage en est un, et il vit hors du dépôt.
 */

import assert from 'node:assert/strict';
import test from 'node:test';
import {
  ACCES_PUBLIC,
  MIGRATION,
  RUBRIQUES,
  SEED,
  appliquer,
  ouvrirBase,
} from './essai-postgres.mjs';

/** Trois comptes d'essai. Le troisième est promu administrateur. */
const ALICE = '11111111-1111-1111-1111-111111111111';
const BRUNO = '22222222-2222-2222-2222-222222222222';
const CHLOE = '33333333-3333-3333-3333-333333333333';

/**
 * Un quatrième compte, créé **par** le dernier banc et laissé en attente.
 *
 * Il existe pour que la décision d'adhésion soit mesurée sur un compte dont le
 * statut de départ est connu, sans toucher à ceux des contrôles précédents : un
 * banc qui change l'état partagé au milieu du fichier rend les suivants
 * dépendants de son ordre.
 */
const DAPHNEE = '44444444-4444-4444-4444-444444444444';

/** Un identifiant d'appareil, au format exigé par la contrainte. */
const APPAREIL = 'abcdef0123456789abcdef0123456789';

const ROLES_CONNUS = ['anon', 'authenticated'];

const db = await ouvrirBase();

const echecs = {
  init: null,
  rubriques: null,
  acces: null,
  comptes: null,
  donnees: null,
  seed: null,
};

echecs.init = await appliquer(db, MIGRATION);
if (echecs.init === null) {
  echecs.rubriques = await appliquer(db, RUBRIQUES);
}
if (echecs.init === null && echecs.rubriques === null) {
  echecs.acces = await appliquer(db, ACCES_PUBLIC);
}

if (echecs.acces === null) {
  // Les comptes passent par `auth.users` : c'est le déclencheur d'inscription qui
  // remplit `profiles`, comme en production.
  echecs.comptes = await appliquer(
    db,
    `insert into auth.users (id, email, raw_user_meta_data) values
       ('${ALICE}', 'alice@exemple.fr', '{"display_name":"Alice"}'::jsonb),
       ('${BRUNO}', 'bruno@exemple.fr', '{"display_name":"Bruno"}'::jsonb),
       ('${CHLOE}', 'chloe@exemple.fr', '{"display_name":"Chloe"}'::jsonb);`,
  );
}

if (echecs.acces === null && echecs.comptes === null) {
  echecs.seed = await appliquer(db, SEED);

  // Alice est acceptée, Bruno reste en attente, Chloé devient administratrice.
  // Les écritures sont faites en propriétaire : c'est la seule façon de poser un
  // état que les rôles ne pourraient pas créer — et c'est exactement ce que fait
  // l'éditeur SQL du tableau de bord.
  //
  // La parenthèse `disable trigger` couvre **les deux** mises à jour, et pas
  // seulement celle du rôle : le déclencheur protège aussi le statut. Mesuré en
  // écrivant ce banc — la seconde mise à jour échouait sur « Seul un
  // administrateur peut modifier le statut d'une adhésion ».
  echecs.donnees = await appliquer(
    db,
    `begin;
     alter table public.profiles disable trigger profiles_prevent_role_change;
     update public.profiles set role = 'admin' where id = '${CHLOE}';
     update public.profiles set status = 'accepte' where id in ('${ALICE}', '${CHLOE}');
     alter table public.profiles enable trigger profiles_prevent_role_change;
     commit;

     insert into public.annonces (title, body, author_id) values
       ('Kermesse', 'corps', '${CHLOE}');

     insert into public.agenda_events (title, start_at) values
       ('Réunion', now() + interval '3 days');

     insert into public.documents (title, storage_path, visibility) values
       ('Règlement', 'reglement.pdf', 'familles'),
       ('Compte rendu du bureau', 'bureau.pdf', 'bureau');

     insert into public.sondages (question, is_open, closed_at) values
       ('Ouvert', true, null),
       ('Clos', false, null);

     insert into public.sondage_choices (sondage_id, label, position)
     select id, 'Oui', 0 from public.sondages where question = 'Ouvert';
     insert into public.sondage_choices (sondage_id, label, position)
     select id, 'Non', 1 from public.sondages where question = 'Ouvert';
     insert into public.sondage_choices (sondage_id, label, position)
     select id, 'Oui', 0 from public.sondages where question = 'Clos';

     insert into public.discussion_messages (author_id, body) values
       ('${ALICE}', 'bonjour à tous');`,
  );
}

/**
 * Joue `sql` sous un rôle, puis annule tout — sauf si `garder` est vrai.
 *
 * LE PARAMÈTRE `garder` N'EST PAS UN CONFORT
 * ------------------------------------------
 * Mesuré en écrivant ce banc : une conversation créée sous `anon` puis annulée
 * n'existe plus, et les contrôles suivants mesuraient donc sur du vide — ils
 * tombaient, en accusant la politique alors que c'était le banc. Une écriture
 * dont on veut ensuite observer les effets doit être **validée** ; les autres
 * sont annulées pour que chaque contrôle parte du même état.
 */
async function jouer(role, uid, sql, parametres = [], garder = false) {
  assert.ok(ROLES_CONNUS.includes(role), `rôle inconnu : ${role}`);

  try {
    await db.exec('begin');
    await db.exec(`set local role ${role}`);
    await db.query("select set_config('request.jwt.claim.sub', $1, true)", [uid ?? '']);

    const resultat = await db.query(sql, parametres);
    await db.exec(garder ? 'commit' : 'rollback');
    return { lignes: resultat.rows, touchees: resultat.rowCount ?? null, erreur: null };
  } catch (erreur) {
    await db.exec('rollback');
    return { lignes: [], touchees: null, erreur: String(erreur.message ?? erreur).split('\n')[0] };
  }
}

function exigerLaBase() {
  assert.equal(echecs.init, null, `première migration :\n  ${echecs.init}`);
  assert.equal(echecs.rubriques, null, `seconde migration :\n  ${echecs.rubriques}`);
  assert.equal(echecs.acces, null, `troisième migration :\n  ${echecs.acces}`);
  assert.equal(echecs.comptes, null, `comptes d'essai :\n  ${echecs.comptes}`);
  assert.equal(echecs.seed, null, `jeu de données :\n  ${echecs.seed}`);
  assert.equal(echecs.donnees, null, `données d'essai :\n  ${echecs.donnees}`);
}

test('la troisième migration s’applique et la base d’essai est montée', () => {
  exigerLaBase();
});

test('un parent sans compte lit les six rubriques publiées', async () => {
  exigerLaBase();
  // Le contrôle qui compte : `anon` n'avait **aucun** privilège avant ce
  // fichier. Chaque lecture est mesurée séparément, parce qu'un `grant`
  // manquant ne se voit pas — il rend une liste vide.
  for (const [table, colonne] of [
    ['annonces', 'title'],
    ['cantine_menus', 'service_date'],
    ['agenda_events', 'title'],
    ['sondages', 'question'],
    ['sondage_choices', 'label'],
  ]) {
    const lecture = await jouer('anon', null, `select ${colonne} from public.${table}`);
    assert.equal(lecture.erreur, null, `anon doit lire ${table} sans erreur`);
    assert.ok(lecture.lignes.length > 0, `anon doit lire au moins une ligne de ${table}`);
  }
});

test('un document destiné aux familles se lit sans compte, un document du bureau non', async () => {
  exigerLaBase();
  const lecture = await jouer('anon', null, 'select title from public.documents order by title');

  assert.equal(lecture.erreur, null, 'anon doit lire la table `documents` sans erreur');
  assert.deepEqual(
    lecture.lignes.map(({ title }) => title),
    ['Règlement'],
    'la politique ne filtre plus sur la visibilité : un document réservé au ' +
      'bureau serait lisible par n’importe quel téléphone',
  );
});

test('le rôle anonyme n’écrit rien, sauf ce qui est prévu', async () => {
  exigerLaBase();
  // `annonces` n'a aucune politique d'insertion pour `anon`, et le privilège lui
  // est refusé : le refus est donc un `permission denied`, pas une liste vide.
  const ecriture = await jouer(
    'anon',
    null,
    "insert into public.annonces (title, body) values ('faux', 'corps')",
  );
  assert.match(
    ecriture.erreur ?? '',
    /permission denied|row-level security/i,
    'un rôle anonyme ne doit pas pouvoir publier une actualité',
  );

  const profils = await jouer('anon', null, 'select display_name from public.profiles');
  assert.match(
    profils.erreur ?? '',
    /permission denied|row-level security/i,
    'les noms des adhérents ne doivent pas être lisibles sans compte',
  );
});

test('le contenu des conversations est inatteignable sans le secret', async () => {
  exigerLaBase();

  const creation = await jouer(
    'anon',
    null,
    'select * from public.creer_conversation($1, $2, $3, $4)',
    ['Absence', 'cantine', 'Mon fils sera absent mardi.', null],
    true,
  );
  assert.equal(creation.erreur, null, 'un parent doit pouvoir ouvrir une conversation');
  assert.equal(creation.lignes.length, 1, 'la création doit rendre l’identifiant et le secret');

  const { conversation_id: id, conversation_secret: secret } = creation.lignes[0];
  assert.match(id, /^[0-9a-f-]{36}$/, 'l’identifiant rendu doit être un uuid');
  assert.match(secret, /^[0-9a-f-]{36}$/, 'le secret rendu doit être un uuid');

  // Le point du dispositif : connaître l'identifiant ne suffit pas.
  const direct = await jouer('anon', null, 'select body from public.conversation_messages');
  assert.match(
    direct.erreur ?? '',
    /permission denied|row-level security/i,
    'la table des messages doit rester fermée au rôle anonyme',
  );

  const sansSecret = await jouer('anon', null, 'select * from public.lire_conversation($1, $2)', [
    id,
    '00000000-0000-0000-0000-000000000000',
  ]);
  assert.deepEqual(sansSecret.lignes, [], 'un mauvais secret ne doit rien rendre');
  assert.equal(sansSecret.erreur, null, 'un mauvais secret n’est pas une erreur technique');

  const avecSecret = await jouer('anon', null, 'select * from public.lire_conversation($1, $2)', [
    id,
    secret,
  ]);
  assert.equal(avecSecret.lignes.length, 1, 'le bon secret doit rendre le premier message');
  assert.equal(avecSecret.lignes[0].from_bureau, false, 'le premier message vient du parent');

  const reponse = await jouer(
    'anon',
    null,
    'select public.repondre_conversation($1, $2, $3)',
    [id, secret, 'Merci de votre retour.'],
    true,
  );
  assert.deepEqual(
    reponse.lignes,
    [{ repondre_conversation: true }],
    'le parent doit pouvoir répondre',
  );

  const apres = await jouer('anon', null, 'select * from public.lire_conversation($1, $2)', [
    id,
    secret,
  ]);
  assert.equal(apres.lignes.length, 2, 'la réponse doit rejoindre le fil');
});

test('une conversation close refuse la réponse du parent', async () => {
  exigerLaBase();
  const creation = await jouer(
    'anon',
    null,
    'select * from public.creer_conversation($1, $2, $3, $4)',
    ['Clôturée', 'autre', 'Bonjour.', null],
    true,
  );
  const { conversation_id: id, conversation_secret: secret } = creation.lignes[0];

  await db.exec(`update public.conversations set status = 'clos' where id = '${id}'`);

  const reponse = await jouer('anon', null, 'select public.repondre_conversation($1, $2, $3)', [
    id,
    secret,
    'Encore un mot.',
  ]);
  assert.deepEqual(
    reponse.lignes,
    [{ repondre_conversation: false }],
    'un fil clos ne se rouvre pas',
  );
});

test('le bureau lit les conversations, un parent non', async () => {
  exigerLaBase();

  const bureau = await jouer(
    'authenticated',
    CHLOE,
    'select subject from public.lister_conversations()',
  );
  assert.equal(bureau.erreur, null, 'le bureau doit pouvoir lister les conversations');
  assert.ok(bureau.lignes.length >= 1, 'la liste doit contenir la conversation d’essai');

  const parent = await jouer(
    'authenticated',
    ALICE,
    'select subject from public.lister_conversations()',
  );
  assert.match(
    parent.erreur ?? '',
    /Réservé au bureau/,
    'un membre ordinaire ne doit pas lire les conversations des familles',
  );
});

test('une inscription en attente ne lit pas la discussion, une inscription acceptée si', async () => {
  exigerLaBase();

  const enAttente = await jouer(
    'authenticated',
    BRUNO,
    'select body from public.discussion_messages',
  );
  assert.deepEqual(
    enAttente.lignes,
    [],
    'un compte en attente lit une liste vide — c’est la politique qui le décide, ' +
      'et l’écran doit dire pourquoi plutôt que de paraître cassé',
  );
  assert.equal(enAttente.erreur, null, 'un refus de politique ne lève pas d’erreur');

  const ecriture = await jouer(
    'authenticated',
    BRUNO,
    "insert into public.discussion_messages (author_id, body) values ($1, 'coucou')",
    [BRUNO],
  );
  // Un `with check` refusé lève une erreur — contrairement à un `select` filtré,
  // qui rend une liste vide. Les deux formes de refus coexistent dans le même
  // dispositif, et le banc les distingue.
  assert.match(
    ecriture.erreur ?? '',
    /row-level security/i,
    'un compte en attente ne doit pas écrire dans la discussion',
  );

  const accepte = await jouer(
    'authenticated',
    ALICE,
    'select body from public.discussion_messages',
  );
  assert.ok(accepte.lignes.length > 0, 'un membre accepté doit lire la discussion');
});

test('un membre ne peut pas s’accepter lui-même', async () => {
  exigerLaBase();
  // Par l'API, le verrou n'est même pas atteint : `profiles` n'a aucune politique
  // de modification, donc l'`update` ne touche zéro ligne. C'est la mesure de
  // gauche. Celle de droite est le cas réel de l'escalade — un `update` qui
  // atteint la ligne, c'est-à-dire depuis l'éditeur SQL ou une fonction.
  const parApi = await jouer(
    'authenticated',
    BRUNO,
    "update public.profiles set status = 'accepte' where id = $1",
    [BRUNO],
  );
  assert.equal(parApi.touchees, 0, 'aucune politique ne laisse un membre écrire son statut');

  await db.exec('begin');
  const enProprietaire = await appliquer(
    db,
    `update public.profiles set status = 'accepte' where id = '${BRUNO}'`,
  );
  await db.exec('rollback');

  // En propriétaire, `is_admin()` lit `auth.uid()` : la revendication n'est pas
  // posée, donc la valeur vaut `NULL`, donc l'appelant n'est pas administrateur.
  assert.match(
    enProprietaire ?? '',
    /Seul un administrateur peut modifier le statut d'une adhésion/,
    'le déclencheur doit refuser un changement de statut écrit sans la parenthèse',
  );
});

test('le bureau accepte une inscription, et le changement passe par la parenthèse', async () => {
  exigerLaBase();
  // La procédure documentée pour promouvoir un administrateur vaut aussi pour
  // accepter un membre : même verrou, même parenthèse. Elle est jouée ici pour
  // que `MISE-EN-SERVICE.md` ne décrive pas une commande qui échoue.
  const echec = await appliquer(
    db,
    `begin;
     alter table public.profiles disable trigger profiles_prevent_role_change;
     update public.profiles set status = 'accepte' where id = '${BRUNO}';
     alter table public.profiles enable trigger profiles_prevent_role_change;
     commit;`,
  );
  assert.equal(echec, null, `la procédure d’acceptation doit passer :\n  ${echec}`);

  const lecture = await jouer(
    'authenticated',
    BRUNO,
    'select body from public.discussion_messages',
  );
  assert.ok(lecture.lignes.length > 0, 'un membre accepté doit maintenant lire la discussion');
});

test('un vote anonyme passe sur un sondage ouvert, et échoue sur un sondage clos', async () => {
  exigerLaBase();

  const ouvert = await db.query("select id from public.sondages where question = 'Ouvert'");
  const clos = await db.query("select id from public.sondages where question = 'Clos'");
  const choixOuvert = await db.query(
    `select id from public.sondage_choices where sondage_id = '${ouvert.rows[0].id}' order by position limit 1`,
  );
  const choixClos = await db.query(
    `select id from public.sondage_choices where sondage_id = '${clos.rows[0].id}' limit 1`,
  );

  const vote = await jouer(
    'anon',
    null,
    'insert into public.sondage_votes (sondage_id, choice_id, voter_key) values ($1, $2, $3)',
    [ouvert.rows[0].id, choixOuvert.rows[0].id, APPAREIL],
    true,
  );
  assert.equal(vote.erreur, null, 'un parent sans compte doit pouvoir voter');

  const deuxieme = await jouer(
    'anon',
    null,
    'insert into public.sondage_votes (sondage_id, choice_id, voter_key) values ($1, $2, $3)',
    [ouvert.rows[0].id, choixOuvert.rows[0].id, APPAREIL],
  );
  assert.match(
    deuxieme.erreur ?? '',
    /duplicate key|unique/i,
    'le même appareil ne doit pas voter deux fois au même sondage',
  );

  const surClos = await jouer(
    'anon',
    null,
    'insert into public.sondage_votes (sondage_id, choice_id, voter_key) values ($1, $2, $3)',
    [clos.rows[0].id, choixClos.rows[0].id, 'ffffffffffffffffffffffffffffffff'],
  );
  assert.match(
    surClos.erreur ?? '',
    /row-level security/i,
    'la politique doit refuser un vote sur un sondage fermé, même depuis un client modifié',
  );
});

test('le résultat d’un sondage se lit sans compte, et sans les votants', async () => {
  exigerLaBase();
  const { rows } = await db.query("select id from public.sondages where question = 'Ouvert'");

  const resultat = await jouer('anon', null, 'select * from public.resultats_sondage($1)', [
    rows[0].id,
  ]);
  assert.equal(resultat.erreur, null, 'le résultat doit être lisible sans compte');
  assert.equal(resultat.lignes.length, 2, 'les deux réponses doivent être rendues');

  const colonnes = Object.keys(resultat.lignes[0]).sort();
  assert.deepEqual(
    colonnes,
    ['choice_id', 'label', 'rang', 'voix'],
    'la fonction ne doit rendre que des compteurs — jamais une ligne de vote, ' +
      'qui nommerait un votant',
  );
  assert.equal(
    Number(resultat.lignes[0].voix),
    1,
    'le vote de l’appareil d’essai doit être compté une fois',
  );
});

test('un appareil enregistre son jeton, et ne peut pas lire ceux des autres', async () => {
  exigerLaBase();
  const pose = await jouer(
    'anon',
    null,
    "insert into public.push_tokens (token, platform) values ('ExponentPushToken[essai]', 'android')",
    [],
    true,
  );
  assert.equal(pose.erreur, null, 'un appareil sans compte doit pouvoir s’enregistrer');

  const lecture = await jouer('anon', null, 'select token from public.push_tokens');
  assert.deepEqual(
    lecture.lignes,
    [],
    'aucune politique de lecture n’existe pour le rôle anonyme : la liste des ' +
      'appareils ne doit pas être publique',
  );

  const parMembre = await jouer('authenticated', ALICE, 'select token from public.push_tokens');
  assert.deepEqual(parMembre.lignes, [], 'un membre ordinaire ne lit pas les jetons non plus');

  const parBureau = await jouer('authenticated', CHLOE, 'select token from public.push_tokens');
  assert.equal(parBureau.lignes.length, 1, 'le bureau doit pouvoir lister les appareils');
});

test('le bureau décide une adhésion, un membre ordinaire en est incapable', async () => {
  exigerLaBase();

  // Un compte de plus, en attente : le déclencheur d'inscription lui crée son
  // profil, exactement comme en production. Il arrive en dernier, donc il ne
  // perturbe aucun des contrôles qui précèdent.
  await db.exec(
    `insert into auth.users (id, email, raw_user_meta_data) values
       ('${DAPHNEE}', 'daphnee@exemple.fr', '{"display_name":"Daphnée"}'::jsonb)`,
  );

  //  1. Le refus, et il est **explicite**. `decider_adhesion()` est la seule voie
  //     d'écriture d'un statut — `profiles` n'a aucune politique de modification
  //     —, donc sans le contrôle `is_admin()` dans son corps, elle serait un trou
  //     ouvert à tout porteur d'un jeton.
  const parMembre = await jouer(
    'authenticated',
    BRUNO,
    "select public.decider_adhesion($1, 'accepte')",
    [DAPHNEE],
  );
  assert.match(
    parMembre.erreur ?? '',
    /Réservé au bureau/,
    'un membre ordinaire ne doit pas pouvoir décider d’une adhésion',
  );

  //  2. L'accord, et la décision **atteint la ligne**. Le contrôle porte sur
  //     l'effet et non sur l'absence d'erreur : une fonction qui ne toucherait
  //     aucune ligne serait verte sur le seul critère du silence. `garder` est
  //     vrai, sans quoi la transaction serait annulée et la relecture ci-dessous
  //     mesurerait l'ancien statut — un vert qui ne prouverait rien.
  const parBureau = await jouer(
    'authenticated',
    CHLOE,
    "select public.decider_adhesion($1, 'accepte')",
    [DAPHNEE],
    true,
  );
  assert.equal(parBureau.erreur, null, `le bureau doit pouvoir accepter :\n  ${parBureau.erreur}`);

  const statut = await db.query(`select status from public.profiles where id = '${DAPHNEE}'`);
  assert.equal(statut.rows[0].status, 'accepte', 'le statut doit avoir changé en base');

  //  3. La chaîne complète, jusqu'à son effet visible : ce que la décision
  //     ouvre, c'est la discussion.
  const lecture = await jouer(
    'authenticated',
    DAPHNEE,
    'select body from public.discussion_messages',
  );
  assert.ok(lecture.lignes.length > 0, 'un membre accepté doit lire la discussion');
});

test('décider d’une adhésion inconnue est signalé, et non silencieux', async () => {
  exigerLaBase();
  // Sans le contrôle `found`, l'appel réussirait en ne touchant aucune ligne, et
  // l'écran du bureau annoncerait une décision qui n'a rien changé.
  const inconnu = await jouer(
    'authenticated',
    CHLOE,
    "select public.decider_adhesion('99999999-9999-9999-9999-999999999999', 'accepte')",
  );
  assert.match(inconnu.erreur ?? '', /introuvable/, 'un identifiant inconnu doit être signalé');
});
