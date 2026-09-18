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
 *   4. l'écran de discussion couvre lui aussi la relecture, **et** son état vide
 *      cède la place tant qu'un envoi dure ;
 *   5. le seul écran d'écriture qui relâche tôt empêche bien de rejouer son
 *      action. Ce banc vérifie que ce justificatif tient, sans quoi l'exception
 *      deviendrait fausse en silence — c'est la forme demandée pour toute
 *      exception assumée.
 *
 * LA MESURE QUI A FONDÉ LE POINT 4
 * --------------------------------
 * L'écran de discussion relâchait son indicateur dans un `finally`, et s'en
 * justifiait ainsi : le brouillon est vidé, donc l'action ne peut pas être
 * rejouée. Le justificatif ne couvrait que le **même** texte. Modèle d'état de
 * l'écran, salon vide, quatre instants :
 *
 *     avant l'appui       « Ouvrez la discussion en écrivant le premier
 *                           message »                    invitation, envoi ouvert
 *     insertion en vol    la même invitation              invitation, envoi bloqué
 *     relecture EN VOL    la même invitation              invitation, envoi OUVERT
 *     relecture atterrie  liste : 1 message
 *
 * Le serveur avait accepté le message, le champ était vide, et l'écran
 * proposait d'écrire le premier. Aucune contrainte d'unicité n'absorbe ce
 * doublon — `discussion_messages` n'en a pas — et le second message part chez
 * tous les membres.
 *
 * CE QUE CE BANC NE FERME PAS, ET LE DIT
 * --------------------------------------
 * `pendingTarget` relâche le marqueur sur une relecture en échec, sans quoi
 * l'indicateur tournerait sans fin. Le compositeur rouvre donc pendant la
 * relecture quand le statut était **déjà** en erreur au moment de l'appui avec
 * du contenu affiché : `reload()` ne repasse pas par « chargement » dans ce cas,
 * et le marqueur est inerte dès l'appui. Le cas est laissé ouvert — un
 * indicateur éternel serait pire — et il est tenu pour tel par un scénario du
 * harnais de falsification, jamais supposé fermé.
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

// Le motif est nommé, et le témoin du bas l'exerce sur deux chaînes écrites ici.
// Sans ce témoin, une faute de frappe dans l'expression la ferait passer au vert
// sur un fichier qui ne contient rien.
//
// Il porte sur la **structure** — l'envoi choisit entre une attente et l'état
// vide — jamais sur les mots du message : reformuler « Envoi de votre message… »
// est une retouche légitime, et un banc qui la refuse mesure l'écriture au lieu
// de l'invariant.
const MOTIF_ETAT_VIDE_GARDE =
  /envoiEnCours \? \(\s*<LoadingView[\s\S]{0,80}?\) : \(\s*<AsyncFallback/;

test("l'écran de discussion ne relâche plus son indicateur avant la relecture", () => {
  const source = sansCommentaires(lire(DISCUSSION));
  assert.ok(source.length > 1000, 'garde de lecture : le fichier semble vide');

  const bloc = blocDEcriture(source, 'DiscussionMembresScreen');
  assert.ok(bloc.includes('reload()'), 'le bloc relevé ne relit pas la liste');
  assert.ok(
    bloc.includes("setDraft('')"),
    'sans vidage du brouillon, le message pourrait être renvoyé pendant la relecture',
  );

  // L'ordre compte : le marqueur est posé **avant** l'insertion, sinon les
  // premiers instants de l'envoi ne sont couverts par rien — c'est la fenêtre
  // que la mesure a désignée.
  const positionMarqueur = source.indexOf('setEnvoi({ target: body, dataAtPress: data })');
  const positionBloc = source.indexOf('void (async () => {');
  assert.notStrictEqual(positionMarqueur, -1, "le marqueur doit être posé à l'appui");
  assert.ok(positionMarqueur < positionBloc, "le marqueur doit être posé AVANT l'insertion");

  // Le marqueur est dérivé de l'état chargé, comme celui de la cantine.
  // L'invariant porte sur la **présence de l'appel**, jamais sur la forme de son
  // affectation : l'extraire dans une variable intermédiaire est une remise en
  // forme légitime, et le premier jet du banc de cantine la refusait.
  assert.match(
    source,
    /pendingTarget\(\s*envoi\s*,\s*status\s*,\s*data\s*\)/,
    "l'envoi doit être couvert jusqu'à l'arrivée de la liste relue",
  );
  assert.ok(
    !/const \[envoiEnCours/.test(source),
    'un marqueur tenu par `useState` est relâché à la main : c’est ce qui rouvre la fenêtre',
  );

  // Et c'est bien ce prédicat, et non `sending` seul, qui gouverne les trois
  // conséquences visibles : l'apparence du bouton, l'accès au champ, et la
  // décision d'envoyer. `sending` ne couvre que l'aller-retour de l'insertion,
  // et il est nécessaire malgré tout — `pendingTarget` est inerte dès l'appui
  // quand le statut est déjà en erreur, et le compositeur, lui, reste à l'écran.
  assert.match(
    source,
    /const canSend = draft\.trim\(\) !== '' && !envoiEnCours/,
    "le bouton d'envoi doit rester bloqué pendant la relecture",
  );
  assert.match(
    source,
    /editable=\{!envoiEnCours\}/,
    'le champ ne doit pas rouvrir pendant la relecture',
  );
  assert.ok(
    !/!sending\b/.test(source),
    'aucun endroit de l’écran ne doit se contenter de `sending` : il s’éteint avant la relecture',
  );
});

test("l'invitation à écrire le premier message ne s'affiche pas pendant un envoi", () => {
  const source = sansCommentaires(lire(DISCUSSION));

  assert.match(
    source,
    MOTIF_ETAT_VIDE_GARDE,
    "l'état vide doit céder la place tant qu'un envoi est en cours",
  );
});

test("le témoin : le motif reconnaît la forme corrigée et refuse celle d'avant", () => {
  assert.ok(
    MOTIF_ETAT_VIDE_GARDE.test(
      'envoiEnCours ? (\n  <LoadingView message="Envoi de votre message…" />\n) : (\n  <AsyncFallback',
    ),
    'le motif doit reconnaître la forme corrigée',
  );
  assert.ok(
    MOTIF_ETAT_VIDE_GARDE.test(
      'envoiEnCours ? (\n  <LoadingView message="Un autre libellé." />\n) : (\n  <AsyncFallback',
    ),
    'le motif doit reconnaître la forme corrigée sous un autre libellé',
  );
  assert.ok(
    !MOTIF_ETAT_VIDE_GARDE.test('messages.length === 0 ? (\n  <AsyncFallback\n    status={status}'),
    "le motif doit refuser l'état vide non gardé",
  );
});

test('le seul écran qui relâche tôt empêche bien de rejouer son action', () => {
  const signalements = sansCommentaires(lire(SIGNALEMENTS));
  const blocSignalements = blocDEcriture(signalements, 'MesSignalementsScreen');

  assert.ok(
    blocSignalements.includes('closeForm()'),
    'sans fermeture du formulaire, le signalement pourrait être recréé pendant la relecture',
  );

  // Le justificatif doit tenir : relâcher tôt n'est acceptable que si le
  // contrôle **disparaît**. `closeForm` ferme le formulaire, et le bouton
  // « Envoyer » n'est rendu que dans la branche ouverte — contrairement au
  // compositeur de la discussion, qui reste à l'écran dans tous les cas, et qui
  // ne pouvait donc pas s'autoriser la même exception.
  assert.match(
    signalements,
    /const closeForm = useCallback\(\(\) => \{\s*setFormOpen\(false\)/,
    "le justificatif de l'exception repose sur cette fermeture",
  );
  assert.match(signalements, /formOpen \? \(/, 'le formulaire doit être rendu conditionnellement');
});
