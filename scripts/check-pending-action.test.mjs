/**
 * Vérifie qu'un indicateur d'action couvre bien la **relecture** qu'il annonce.
 *
 * POURQUOI CE SCRIPT
 * ------------------
 * Un écran qui écrit puis relit son état serveur a deux temps. L'indicateur qui
 * annonce l'action doit couvrir les deux — sinon il s'éteint avant que le
 * résultat soit visible, et l'écran reprend l'apparence qu'il avait **avant**
 * l'appui.
 *
 * Mesure faite sur la réservation de cantine, en modélisant la machine à états
 * de l'écran (libellé du bouton et indicateur, étape par étape) :
 *
 *     avant l'appui                     libellé="Réserver"  indicateur=false
 *     appui (insertion en vol)          libellé="Réserver"  indicateur=true
 *     insertion réussie, relecture EN VOL  libellé="Réserver"  indicateur=false  ← identique à l'avant-appui
 *     relecture atterrie                libellé="Annuler ma réservation"  indicateur=false
 *
 * La troisième ligne est le défaut : `reload()` ne rend pas la main — il
 * déclenche une relecture — et le `finally` du gestionnaire relâchait le
 * marqueur à cet endroit. Pendant tout l'aller-retour, l'écran était **exactement
 * celui d'avant l'appui**. L'adhérent lisait « Réserver » sur un repas qu'il
 * venait de réserver, appuyait de nouveau, et l'insertion en double était
 * absorbée par la contrainte d'unicité : aucun effet, donc **aucun signe** que
 * son premier appui avait été accepté.
 *
 * CE QUE CE BANC TIENT
 * --------------------
 *   1. la règle elle-même, sur ses quatre cas — dont celui qui manquait ;
 *   2. le fait que le signal repose sur une **référence** de données, condition
 *      de validité annoncée par le module et rendue visible ici plutôt que
 *      laissée dans un commentaire ;
 *   3. l'écran de cantine ne tient pas un second marqueur, et ne relâche pas
 *      celui qu'il dérive avant la relecture — un test de **forme**, seul moyen
 *      de tenir un ordre d'exécution sans rendre un composant ;
 *   4. les **deux autres écrans d'écriture** relâchent tôt, et c'est délibéré :
 *      ils empêchent de rejouer l'action par un autre chemin. Ce banc vérifie que
 *      ce justificatif tient, sans quoi l'exception deviendrait fausse en
 *      silence — c'est la forme demandée pour toute exception assumée.
 *
 * Les commentaires sont retirés avant toute extraction par motif : le mot
 * `finally` figure dans les commentaires qui expliquent pourquoi il n'y en a pas.
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const RACINE = fileURLToPath(new URL('../', import.meta.url));

const MODULE = new URL('../src/utils/pendingAction.ts', import.meta.url).href;
const CANTINE = `${RACINE}src/screens/CantineScreen.tsx`;
const DISCUSSION = `${RACINE}src/screens/DiscussionMembresScreen.tsx`;
const SIGNALEMENTS = `${RACINE}src/screens/MesSignalementsScreen.tsx`;

const { pendingTarget } = await import(MODULE);

function lire(chemin) {
  return readFileSync(chemin, 'utf8');
}

/** Retire les commentaires avant toute extraction par motif. */
function sansCommentaires(source) {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
}

/**
 * Le bloc asynchrone du gestionnaire d'écriture d'un écran.
 *
 * Lève si le motif est introuvable ou ambigu : un motif absent ne fait pas
 * échouer une assertion, il la fait passer au vert sur une chaîne vide.
 */
function blocDEcriture(source, nom) {
  const marqueur = 'void (async () => {';
  const occurrences = source.split(marqueur).length - 1;
  assert.strictEqual(
    occurrences,
    1,
    `${nom} : ce banc suppose un seul bloc d'écriture asynchrone, ${occurrences} trouvé(s)`,
  );

  const debut = source.indexOf(marqueur);
  const fin = source.indexOf('})();', debut);
  assert.notStrictEqual(fin, -1, `${nom} : la fin du bloc d'écriture est introuvable`);

  const bloc = source.slice(debut, fin);
  assert.ok(bloc.length > 80, `${nom} : bloc d'écriture suspect (${bloc.length} caractères)`);
  return bloc;
}

// Les données telles que `useAsyncData` les produit : un objet neuf à chaque
// chargement réussi. Deux contenus identiques, deux références distinctes.
const DONNEES_AVANT = { menus: [], reservedMenuIds: [] };
const DONNEES_APRES = { menus: [], reservedMenuIds: ['A'] };

test("aucun appui n'est en cours quand rien n'a été demandé", () => {
  assert.strictEqual(pendingTarget(null, 'ready', DONNEES_AVANT), null);
});

test("l'appui reste en cours pendant la relecture, et c'est le cas qui manquait", () => {
  const appui = { target: 'A', dataAtPress: DONNEES_AVANT };

  // L'insertion a réussi, la relecture est en vol : les données affichées sont
  // encore celles d'avant l'appui. C'est ici que le marqueur était relâché.
  assert.strictEqual(
    pendingTarget(appui, 'ready', DONNEES_AVANT),
    'A',
    "l'indicateur ne doit pas s'éteindre avant l'arrivée de la liste relue",
  );
});

test("la relecture atterrie éteint l'indicateur", () => {
  const appui = { target: 'A', dataAtPress: DONNEES_AVANT };
  assert.strictEqual(pendingTarget(appui, 'ready', DONNEES_APRES), null);
});

test("une relecture en échec éteint l'indicateur, sinon il tournerait sans fin", () => {
  const appui = { target: 'A', dataAtPress: DONNEES_AVANT };

  // `data` conserve alors sa référence : sans la branche `error`, l'indicateur
  // ne s'éteindrait jamais.
  assert.strictEqual(pendingTarget(appui, 'error', DONNEES_AVANT), null);
});

test('le signal repose sur la référence des données, pas sur leur contenu', () => {
  const appui = { target: 'A', dataAtPress: DONNEES_AVANT };

  assert.notStrictEqual(DONNEES_AVANT, { ...DONNEES_AVANT });
  assert.strictEqual(
    pendingTarget(appui, 'ready', { ...DONNEES_AVANT }),
    null,
    'un chargeur qui mémoïserait son résultat garderait l’indicateur allumé pour toujours',
  );
});

test("l'écran de cantine dérive son marqueur, il n'en tient pas un second", () => {
  const source = sansCommentaires(lire(CANTINE));
  assert.ok(source.length > 1000, 'garde de lecture : le fichier semble vide');

  // L'invariant porte sur l'**origine** du marqueur, pas sur la forme de
  // l'affectation : extraire l'appel dans une variable intermédiaire est une
  // remise en forme légitime, et le premier jet de ce banc la refusait — le
  // contrôle inverse l'a montré.
  assert.match(
    source,
    /pendingTarget\(\s*pending\s*,\s*status\s*,\s*data\s*\)/,
    "le marqueur doit être dérivé de l'état chargé, jamais tenu à part",
  );
  assert.ok(
    !/const \[pendingMenuId/.test(source),
    'un second marqueur, relâché à la main, est exactement ce qui rouvre la fenêtre',
  );
});

test("l'écran de cantine ne relâche pas son marqueur avant la relecture", () => {
  const bloc = blocDEcriture(sansCommentaires(lire(CANTINE)), 'CantineScreen');

  assert.ok(bloc.includes('reload()'), 'le bloc relevé ne relit pas la liste');
  assert.ok(
    !/\bfinally\b/.test(bloc),
    'un `finally` relâcherait le marqueur avant l’arrivée de la liste relue',
  );
});

test('les deux écrans qui relâchent tôt empêchent bien de rejouer leur action', () => {
  const discussion = sansCommentaires(lire(DISCUSSION));
  const blocDiscussion = blocDEcriture(discussion, 'DiscussionMembresScreen');

  assert.ok(
    blocDiscussion.includes("setDraft('')"),
    'sans vidage du brouillon, le message pourrait être renvoyé pendant la relecture',
  );
  assert.match(
    discussion,
    /const canSend = draft\.trim\(\) !== '' && !sending/,
    'le bouton d’envoi doit exiger un brouillon non vide',
  );

  const signalements = sansCommentaires(lire(SIGNALEMENTS));
  const blocSignalements = blocDEcriture(signalements, 'MesSignalementsScreen');

  assert.ok(
    blocSignalements.includes('closeForm()'),
    'sans fermeture du formulaire, le signalement pourrait être recréé pendant la relecture',
  );
});
