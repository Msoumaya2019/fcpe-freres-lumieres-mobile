/**
 * Vérifie **où** s'applique la seule borne de mot de passe du client.
 *
 * POURQUOI CE SCRIPT
 * ------------------
 * `MIN_PASSWORD_LENGTH` est la seule borne de mot de passe recopiée côté client,
 * et elle recopie un réglage qui ne vit **pas** dans ce dépôt
 * (`Authentication > Providers > Email > Minimum password length`). Aucun test ne
 * peut donc tenir son accord avec le tableau de bord — d'où l'importance de tenir
 * au moins **sa portée**, qui, elle, est vérifiable.
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
 * Les commentaires sont retirés avant toute extraction par motif : le nom de la
 * constante figure dans le commentaire qui explique sa portée.
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const RACINE = fileURLToPath(new URL('../', import.meta.url));
const ECRAN = `${RACINE}src/screens/ConnexionScreen.tsx`;

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
