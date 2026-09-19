/**
 * Vérifie **où** s'applique la seule borne de mot de passe du client.
 *
 * POURQUOI CE SCRIPT
 * ------------------
 * `MIN_PASSWORD_LENGTH` est la seule borne de mot de passe recopiée côté client,
 * et elle recopie un réglage qui ne vit **pas** dans ce dépôt
 * (`Authentication > Providers > Email > Minimum password length`).
 *
 * L'accord avec le **tableau de bord** n'est pas mesurable : il ne vit pas ici.
 * Mais la **valeur qu'on y saisit** y est, en toutes lettres — l'étape 6 de
 * `MISE-EN-SERVICE.md` la donne, et c'est celle-là qui finira dans le réglage.
 * L'accord est donc tenable, et il est tenu plus bas.
 *
 * Cette phrase affirmait auparavant qu'« aucun test ne peut tenir son accord avec
 * le tableau de bord ». C'était une justification par une propriété universelle —
 * le genre d'affirmation que ce dépôt traite comme vérifiable, et celle-ci était
 * fausse : le tableau de bord n'est pas lisible, l'instruction qui le configure
 * l'est.
 *
 * Le défaut mesuré : le fichier affirmait la règle **deux fois, dans deux portées
 * différentes**. L'indication affichée sous le champ de connexion était déjà
 * conditionnée —
 *
 *     hint={isSignUp ? `Au moins ${MIN_PASSWORD_LENGTH} caractères.` : null}
 *
 * — tandis que la garde du gestionnaire, qui sert à la fois l'inscription et la
 * connexion, ne l'était pas. Une même règle, deux portées.
 *
 * Ce que cela coûtait : GoTrue **ne refuse pas** une connexion pour la longueur du
 * mot de passe. Vérifié dans sa source (`internal/api/token.go`,
 * `ResourceOwnerPasswordGrant`) : la robustesse est contrôlée **après** que le mot
 * de passe a été reconnu correct, et le constat n'est pas renvoyé en erreur — il
 * voyage dans la réponse (`token.WeakPassword`), que `signInWithPassword` expose en
 * `data.weakPassword`. Le serveur vérifie donc un mot de passe, il n'en juge pas la
 * forme.
 *
 * Conséquence : appliquée à la connexion, la borne ne peut produire qu'un refus que
 * le serveur n'aurait pas prononcé. Un compte dont le mot de passe est plus court
 * que le réglage — créé avant son durcissement, ou sous un réglage plus permissif —
 * était **empêché d'entrer**, avec une phrase affirmant quelque chose de faux sur
 * son propre mot de passe. Et `auth-js` n'aide pas : mesuré, il ne valide **rien**
 * côté client (`GoTrueClient.js` ne contient aucune comparaison de longueur) — la
 * borne d'ici était donc la seule, et la seule fautive.
 *
 * CE QUE CE BANC TIENT
 * --------------------
 *   1. là où le mot de passe est **choisi** (inscription, nouveau mot de passe), la
 *      borne reste inconditionnelle — c'est une politesse, pas une garde ;
 *   2. là où il est **présenté** (connexion), elle n'est pas appliquée ;
 *   3. l'indication et la garde portent la **même portée** — c'est la divergence
 *      entre les deux qui a produit le défaut, et rien ne les relie dans le code ;
 *   4. l'ensemble des emplois de la borne est **fermé** : un troisième emploi doit
 *      faire échouer ce banc et être examiné, pas ajouté en silence.
 *
 * Un cinquième contrôle est venu du **chemin normal** de l'inscription, et il ne
 * concerne pas la borne. La confirmation par e-mail étant désactivée dans le
 * tableau de bord (voir `README.md` §4), `signUp` rend une **session**, et
 * l'écran n'appelle alors **rien** : c'est le paquet qui notifie `SIGNED_IN`,
 * `AuthProvider` qui bascule `status`, et `RootNavigator` qui monte les onglets.
 * La chaîne fonctionne, mais elle est invisible depuis l'écran — et le
 * « correctif » qu'un lecteur appliquerait, ajouter `await signIn(…)` dans la
 * branche d'inscription, serait une seconde authentification pour rien. Le banc
 * relit donc la propriété du paquet dans la copie installée, et exige qu'aucun
 * appel de connexion ne se trouve dans la branche d'inscription.
 *
 * Les commentaires sont retirés avant toute extraction par motif : le nom de la
 * constante figure dans le commentaire qui explique sa portée, et le nom de
 * `signIn` dans celui qui explique pourquoi il n'y est pas.
 */

import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const RACINE = fileURLToPath(new URL('../', import.meta.url));
const ECRAN = `${RACINE}src/screens/ConnexionScreen.tsx`;

/**
 * Le paquet qui décide si une inscription réussie connecte l'adhérent.
 *
 * Le chemin est celui de la copie **installée**, pas d'une dépendance déclarée :
 * c'est le seul fichier qui dise ce que l'application exécute réellement.
 */
const PAQUET_AUTH = `${RACINE}node_modules/@supabase/auth-js/dist/main/GoTrueClient.js`;

function sansCommentaires(source) {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
}

/** Le texte entre deux ancres. Lève si une ancre manque. */
function bloc(source, debut, fin) {
  const d = source.indexOf(debut);
  assert.notStrictEqual(d, -1, `ancre de début introuvable : ${debut}`);

  if (fin === null) {
    return source.slice(d);
  }

  const f = source.indexOf(fin, d);
  assert.notStrictEqual(f, -1, `ancre de fin introuvable : ${fin}`);
  return source.slice(d, f);
}

const SOURCE = sansCommentaires(readFileSync(ECRAN, 'utf8'));

const NOUVEAU_MOT_DE_PASSE = bloc(
  SOURCE,
  'function NewPasswordForm(',
  'export function ConnexionScreen(',
);
const CONNEXION = bloc(SOURCE, 'export function ConnexionScreen(', null);

test('garde de lecture : les deux formulaires ont bien été isolés', () => {
  assert.ok(NOUVEAU_MOT_DE_PASSE.length > 500, 'bloc du nouveau mot de passe suspect');
  assert.ok(CONNEXION.length > 500, 'bloc de connexion suspect');
  assert.ok(
    NOUVEAU_MOT_DE_PASSE.includes('completePasswordReset'),
    'le bloc du nouveau mot de passe ne contient pas ce qu’il devrait',
  );
  assert.ok(CONNEXION.includes('signUp'), 'le bloc de connexion ne contient pas ce qu’il devrait');
});

test("là où le mot de passe est choisi, la borne s'applique sans condition", () => {
  const condition = NOUVEAU_MOT_DE_PASSE.match(
    /if \(([^)]*password\.length < MIN_PASSWORD_LENGTH[^)]*)\)/,
  );

  assert.notStrictEqual(
    condition,
    null,
    'choisir un mot de passe trop court doit rester refusé sans aller-retour réseau',
  );
  assert.ok(
    !condition[1].includes('isSignUp'),
    'ce formulaire ne connaît aucun mode : la borne y est inconditionnelle',
  );
});

test("à la connexion, la borne ne s'applique pas", () => {
  const condition = CONNEXION.match(/if \(([^)]*password\.length < MIN_PASSWORD_LENGTH[^)]*)\)/);

  assert.notStrictEqual(condition, null, "la borne doit rester appliquée à l'inscription");
  assert.ok(
    condition[1].includes('isSignUp'),
    'à la connexion le mot de passe est présenté, pas choisi : le serveur seul tranche',
  );
});

test("l'indication et la garde portent la même portée", () => {
  const ligne = CONNEXION.split('\n').find(
    (l) => l.includes('hint={') && l.includes('MIN_PASSWORD_LENGTH'),
  );
  assert.notStrictEqual(ligne, undefined, "l'indication de longueur est introuvable");

  assert.match(
    ligne,
    /isSignUp/,
    "l'indication annonce la règle au même endroit que la garde, sinon les deux divergent",
  );
});

test("l'ensemble des emplois de la borne est fermé", () => {
  const emplois = SOURCE.match(/password\.length/g) ?? [];

  // Deux, et pas une de plus : un troisième emploi doit être examiné — c'est
  // exactement le silence qui a laissé la garde s'appliquer à la connexion.
  assert.strictEqual(
    emplois.length,
    2,
    `un troisième emploi de la borne doit être examiné (${emplois.length} trouvés)`,
  );
});

test('la borne du client et la valeur du guide s’accordent', () => {
  // Le nombre vit à deux endroits qui ne peuvent pas se lire : la constante du
  // client, et la valeur que l'étape 6 du guide fait saisir dans le tableau de
  // bord. L'écran affiche « Au moins 6 caractères. » à l'adhérent, et c'est le
  // serveur qui applique le réglage.
  //
  // S'ils divergent, l'adhérent lit une phrase que le serveur contredit : il
  // compose un mot de passe que l'application vient de déclarer acceptable, et
  // se le voit refuser. Rien, aujourd'hui, ne relie les deux nombres.
  //
  // Le `README.md` §4 ne participe pas à cet accord, et c'est délibéré : il
  // nomme le réglage et le message du serveur, mais écrit `N` à la place de la
  // valeur. La valeur n'y est donc pas recopiée — et il n'y a rien à y tenir.
  const constante = /const MIN_PASSWORD_LENGTH = (\d+);/.exec(SOURCE);
  assert.notStrictEqual(
    constante,
    null,
    'la constante est introuvable : le contrôle ne mesurerait rien',
  );

  const guide = readFileSync(`${RACINE}MISE-EN-SERVICE.md`, 'utf8');
  const instruction = /_Minimum password length_\s*=\s*\*\*(\d+)\*\*/.exec(guide);
  assert.notStrictEqual(
    instruction,
    null,
    'l’étape 6 ne donne plus la valeur à saisir : le contrôle ne mesurerait rien',
  );

  assert.strictEqual(
    instruction[1],
    constante[1],
    `l’écran annonce « Au moins ${constante[1]} caractères. » et le guide fait ` +
      `saisir ${instruction[1]} dans le tableau de bord : le serveur refuserait ` +
      'alors un mot de passe que l’application déclare acceptable',
  );
});

test("l'inscription réussie ne rappelle pas `signIn` : le paquet a déjà posé la session", () => {
  // Le chemin **normal** de l'inscription rend une session — la confirmation par
  // e-mail est désactivée dans le tableau de bord (voir `README.md` §4). Rien dans
  // cet écran ne connecte alors l'adhérent : c'est `signUp` qui prévient ses
  // abonnés, `AuthProvider` qui fait passer `status` à `signedIn`, et
  // `RootNavigator` qui monte les onglets. La chaîne est invisible d'ici, donc
  // elle se vérifie dans le paquet — et l'absence d'appel se vérifie ici.
  assert.ok(
    existsSync(PAQUET_AUTH),
    `paquet introuvable : ${PAQUET_AUTH} — un banc qui lit un chemin absent tombe ` +
      'vert en ne mesurant rien',
  );

  assert.match(
    readFileSync(PAQUET_AUTH, 'utf8'),
    /if \(data\.session\) \{\s*await this\._saveSession\(data\.session\);\s*await this\._notifyAllSubscribers\('SIGNED_IN', session\);/,
    '`signUp` ne notifie plus `SIGNED_IN` : l’adhérent resterait sur l’écran de ' +
      'connexion, sans message et sans compte utilisable',
  );

  // L'ancre de fin est `} else {`, et non l'appel à `signIn` : si celui-ci était
  // ajouté **dans** la branche d'inscription, une ancre sur l'appel le
  // prendrait pour la fin du bloc et le contrôle ne verrait rien. C'est
  // précisément le cas qu'on cherche à attraper.
  const brancheInscription = bloc(CONNEXION, 'if (isSignUp) {', '} else {');
  assert.ok(
    !brancheInscription.includes('signIn('),
    "l'inscription ne doit pas rappeler `signIn` : la session est déjà posée par " +
      'le paquet, un second appel serait une authentification pour rien',
  );

  // Ensemble **fermé** : un seul appel de connexion dans tout l'écran, celui de
  // la branche `else`. Un second doit être examiné, pas ajouté en silence.
  const appels = CONNEXION.match(/await signIn\(/g) ?? [];
  assert.strictEqual(
    appels.length,
    1,
    `un appel de connexion supplémentaire doit être examiné (${appels.length} trouvés)`,
  );
});
