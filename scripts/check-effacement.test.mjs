/**
 * Vérifie ce qu'un effacement emporte, et ce qu'il épargne.
 *
 * POURQUOI CE FICHIER
 * -------------------
 * `src/config/preferences.ts` portait `effacerPreferences()`, qui effaçait
 * **toutes** les clés du préfixe `fcpe.`. Six familles vivent sous ce
 * préfixe, et trois sont des préférences :
 *
 *   `discussion.lu.*`          une marque de lecture — se recalcule ;
 *   `appareil.cle`             la clé qui empêche de voter deux fois — une limite ;
 *   `sondage.vote.*`           le vote déposé par cet appareil — un fait ;
 *   `contact.conversations`    le **secret** des conversations avec le bureau ;
 *   `notifications.invitation` la marque de l'invitation déjà posée — se repose ;
 *   `donnees.information`      la marque de l'avis sur les données — se repose.
 *
 * Le quatrième est la raison de ce fichier. Le serveur ne garde qu'une
 * **empreinte** de ce secret, et ne le rend qu'à la création : le téléphone en
 * détient l'unique copie. Le bouton des Réglages l'emportait donc **en
 * silence**, sous un libellé qui parlait de badges de messages non lus, et un
 * parent perdait pour toujours l'accès au fil où il avait parfois signalé une
 * situation personnelle. Rien ne pouvait le signaler : l'écran disait « ne
 * supprime rien sur le serveur », ce qui est vrai — et c'est exactement pourquoi
 * la perte était définitive.
 *
 * CE QUE CE BANC EXERCE, ET NON CE QU'IL RELIT
 * -------------------------------------------
 * Il n'inspecte pas le texte du module : il **appelle** l'effacement sur les
 * familles à la fois, puis regarde ce qui reste dans le magasin. C'est la seule
 * mesure qui vaille ici — un contrôle qui lirait le motif du filtre laisserait
 * passer un `clear()` écrit juste à côté.
 *
 * La cinquième famille a été ajoutée le 21 septembre 2026, en même temps que la
 * marque qu'elle désigne. C'est le point qui compte : une famille de clés
 * ajoutée au module et **oubliée ici** aurait été épargnée sans que rien ne le
 * dise — le banc serait resté vert, et sa liste d'exemptions aurait été fausse
 * par omission. La **sixième** est arrivée le même jour, avec l'avis sur les
 * données personnelles, et le décompte en toutes lettres de `preferences.ts` a
 * été corrigé dans la même passe : il annonçait encore cinq familles.
 *
 * La doublure d'`AsyncStorage` ne portait que `getItem`, `setItem` et
 * `removeItem` : `getAllKeys` et `multiRemove` manquaient, et ce module était
 * donc **inexerçable**. La doublure a été complétée — une doublure incomplète ne
 * rend pas un module difficile à tester, elle le rend intestable.
 *
 * Éprouvé dans les deux sens : en rétablissant l'effacement sur le préfixe
 * entier, le premier test tombe et nomme les clés disparues ; en réduisant le
 * filtre à une famille qui n'existe pas, le second tombe.
 */

import assert from 'node:assert/strict';
import test from 'node:test';

import {
  __reset as resetAsyncStorage,
  __store as magasin,
} from '@react-native-async-storage/async-storage';

const PREFERENCES = new URL('../src/config/preferences.ts', import.meta.url).href;

const {
  CLE_APPAREIL,
  INFORMATION_DONNEES,
  INVITATION_NOTIFICATIONS,
  cleConversation,
  cleDerniereLectureDiscussion,
  cleVoteSondage,
  ecrirePreference,
  effacerMarquesDeLecture,
  lirePreference,
} = await import(PREFERENCES);

/** Ce que le téléphone retient, et que l'effacement doit laisser en place. */
async function ecrireLesFamillesEpargnees() {
  await ecrirePreference(CLE_APPAREIL, 'cle-de-cet-appareil');
  await ecrirePreference(cleVoteSondage('sondage-1'), 'choix-2');
  await ecrirePreference(cleConversation(), JSON.stringify([{ id: 'fil-1', secret: 'secret-1' }]));
  await ecrirePreference(INVITATION_NOTIFICATIONS, 'vue');
  await ecrirePreference(INFORMATION_DONNEES, 'vue');
}

test("l'effacement des marques de lecture laisse intact ce qui ne se recrée pas", async () => {
  resetAsyncStorage();

  await ecrirePreference(cleDerniereLectureDiscussion('adherent-1'), '2026-09-19T20:00:00.000Z');
  await ecrireLesFamillesEpargnees();

  await effacerMarquesDeLecture();

  assert.equal(
    await lirePreference(cleDerniereLectureDiscussion('adherent-1')),
    null,
    "la marque de lecture doit disparaître : c'est ce que le bouton annonce",
  );

  // Le secret des conversations est le cas qui a motivé ce fichier : il n'a
  // aucune autre copie, et le perdre est irréversible.
  assert.equal(
    await lirePreference(cleConversation()),
    JSON.stringify([{ id: 'fil-1', secret: 'secret-1' }]),
    'le secret des conversations avec le bureau a été effacé : il n’existe nulle part ailleurs',
  );
  assert.equal(
    await lirePreference(CLE_APPAREIL),
    'cle-de-cet-appareil',
    "la clé de vote a été effacée : l'appareil pourrait voter une seconde fois",
  );
  assert.equal(
    await lirePreference(cleVoteSondage('sondage-1')),
    'choix-2',
    "la trace du vote a été effacée : l'écran reproposerait de voter, et le serveur refuserait",
  );
  //  Épargner cette marque n'est pas une garantie de sécurité, et c'est écrit
  //  ici pour que personne ne s'y trompe : l'effacer repose la question une
  //  fois de plus, rien d'autre. Ce qui est tenu, c'est que l'effacement reste
  //  **total sur sa famille** — il n'emporte pas ce qu'il n'annonce pas.
  assert.equal(
    await lirePreference(INVITATION_NOTIFICATIONS),
    'vue',
    "la marque de l'invitation a été effacée : la question serait reposée à la prochaine ouverture",
  );
  //  Même nature que la précédente, et même conséquence : l'avis sur les
  //  données se reposerait à chaque ouverture. L'information elle-même n'est pas
  //  perdue — elle est publiée, et la page reste joignable.
  assert.equal(
    await lirePreference(INFORMATION_DONNEES),
    'vue',
    "la marque de l'avis sur les données a été effacée : l'avis serait reposé à la prochaine ouverture",
  );
});

test("l'effacement emporte les marques de tous les comptes de ce téléphone", async () => {
  // Le second sens : un effacement qui ne trouve rien passerait le premier test
  // sans rien effacer. Deux comptes sur le même téléphone ont chacun la leur.
  resetAsyncStorage();

  await ecrirePreference(cleDerniereLectureDiscussion('adherent-1'), '2026-09-18T08:00:00.000Z');
  await ecrirePreference(cleDerniereLectureDiscussion('adherent-2'), '2026-09-19T09:00:00.000Z');

  await effacerMarquesDeLecture();

  assert.equal(await lirePreference(cleDerniereLectureDiscussion('adherent-1')), null);
  assert.equal(await lirePreference(cleDerniereLectureDiscussion('adherent-2')), null);
});

test("l'effacement ne touche pas une clé qui n'appartient pas à l'application", async () => {
  // `AsyncStorage` est partagé avec toute bibliothèque qui l'emploierait : le
  // filtre existe aussi pour cela, et il se mesure en écrivant hors du préfixe.
  resetAsyncStorage();

  magasin.set('autre-bibliotheque.cle', 'valeur-etrangere');
  await ecrirePreference(cleDerniereLectureDiscussion('adherent-1'), '2026-09-19T20:00:00.000Z');

  await effacerMarquesDeLecture();

  assert.equal(
    magasin.get('autre-bibliotheque.cle'),
    'valeur-etrangere',
    "l'effacement a emporté une clé qui ne vient pas de cette application",
  );
});
