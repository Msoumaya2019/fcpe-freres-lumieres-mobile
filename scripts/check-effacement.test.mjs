/**
 * Vérifie ce qu'un effacement emporte, et ce qu'il épargne.
 *
 * POURQUOI CE FICHIER
 * -------------------
 * `src/config/preferences.ts` portait `effacerPreferences()`, qui effaçait
 * **toutes** les clés du préfixe `fcpe.`. Quatre familles vivent sous ce
 * préfixe, et une seule est une préférence :
 *
 *   `discussion.lu.*`        une marque de lecture — se recalcule ;
 *   `appareil.cle`           la clé qui empêche de voter deux fois — une limite ;
 *   `sondage.vote.*`         le vote déposé par cet appareil — un fait ;
 *   `contact.conversations`  le **secret** des conversations avec le bureau.
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
 * quatre familles à la fois, puis regarde ce qui reste dans le magasin. C'est la
 * seule mesure qui vaille ici — un contrôle qui lirait le motif du filtre
 * laisserait passer un `clear()` écrit juste à côté.
 *
 * La doublure d'`AsyncStorage` ne portait que `getItem`, `setItem` et
 * `removeItem` : `getAllKeys` et `multiRemove` manquaient, et ce module était
 * donc **inexerçable**. La doublure a été complétée — une doublure incomplète ne
 * rend pas un module difficile à tester, elle le rend intestable.
 *
 * Éprouvé dans les deux sens : en rétablissant l'effacement sur le préfixe
 * entier, le premier test tombe et nomme les trois clés disparues ; en réduisant
 * le filtre à une famille qui n'existe pas, le second tombe.
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
  cleConversation,
  cleDerniereLectureDiscussion,
  cleVoteSondage,
  ecrirePreference,
  effacerMarquesDeLecture,
  lirePreference,
} = await import(PREFERENCES);

/** Ce que le téléphone retient, et que l'effacement doit laisser en place. */
async function ecrireLesTroisFamillesEpargnees() {
  await ecrirePreference(CLE_APPAREIL, 'cle-de-cet-appareil');
  await ecrirePreference(cleVoteSondage('sondage-1'), 'choix-2');
  await ecrirePreference(cleConversation(), JSON.stringify([{ id: 'fil-1', secret: 'secret-1' }]));
}

test("l'effacement des marques de lecture laisse intact ce qui ne se recrée pas", async () => {
  resetAsyncStorage();

  await ecrirePreference(cleDerniereLectureDiscussion('adherent-1'), '2026-09-19T20:00:00.000Z');
  await ecrireLesTroisFamillesEpargnees();

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
