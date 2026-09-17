/**
 * Vérifie `src/config/storage.ts` — l'endroit où vivent les jetons de session.
 *
 * POURQUOI CE FICHIER
 * -------------------
 * C'est le seul module du projet qui décide **où** une session complète est
 * écrite : le Keychain sur iOS, le Keystore sur Android, et `AsyncStorage` en
 * clair sur le web. Il portait une logique non triviale — un découpage en
 * fragments, avec un ordre d'écriture dont dépend la cohérence d'une session
 * interrompue — et **aucun test** : il importe trois paquets natifs que Node ne
 * sait pas charger.
 *
 * `scripts/alias-loader.mjs` fournit désormais des doublures en mémoire pour ces
 * trois paquets. Les tests ci-dessous portent donc sur le comportement réel du
 * module, pas sur une réécriture de sa logique.
 *
 * CE QUE CES TESTS NE PEUVENT PAS VOIR
 * ------------------------------------
 * Que le trousseau soit réellement chiffré, et que la limite de 2048 octets ait
 * réellement disparu d'`expo-secure-store` : ce sont des propriétés du paquet
 * natif et de la plateforme, mesurées par lecture dans le commentaire de tête de
 * `storage.ts`, pas ici. Ce fichier vérifie ce que le module **décide**, pas ce
 * que la plateforme **applique**.
 */

import assert from 'node:assert/strict';
import test from 'node:test';

// L'instrumentation de la doublure est exportée nommément, alors que
// `storage.ts` importe l'adaptateur par défaut : le test n'a besoin que de la
// première, puisqu'il observe ce qui est écrit et non la façon de l'écrire.
import {
  __reset as resetAsyncStorage,
  __store as asyncStore,
} from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

const STORAGE = new URL('../src/config/storage.ts', import.meta.url).href;

/** Taille d'un fragment, dupliquée ici : le test doit échouer si elle change. */
const CHUNK_SIZE = 1800;

/**
 * Charge `src/config/storage.ts` pour une plateforme donnée.
 *
 * L'adaptateur est choisi au chargement du module, à partir de `Platform.OS` :
 * il faut donc poser la plateforme **avant** l'import, et forcer un module neuf
 * à chaque cas, le cache d'ESM ne réexécutant pas un module déjà chargé.
 */
async function loadStorage(platform, cacheBuster) {
  Platform.OS = platform;
  const module = await import(`${STORAGE}?case=${cacheBuster}`);
  return module.authStorage;
}

test("une valeur courte est écrite d'un seul tenant, et relue à l'identique", async () => {
  SecureStore.__reset();
  const storage = await loadStorage('android', 'court');

  await storage.setItem('jeton', 'valeur-courte');

  assert.equal(SecureStore.__store.get('jeton'), 'valeur-courte');
  assert.equal(
    SecureStore.__store.has('jeton.__chunks'),
    false,
    "une valeur courte ne doit pas écrire d'index de découpage",
  );
  assert.equal(await storage.getItem('jeton'), 'valeur-courte');
});

test("une valeur longue est découpée, et relue à l'identique", async () => {
  SecureStore.__reset();
  const storage = await loadStorage('android', 'long');

  const valeur = 'a'.repeat(CHUNK_SIZE * 2 + 500);
  await storage.setItem('jeton', valeur);

  // Contrôle : sans cette assertion, le test serait vert même si le découpage
  // avait disparu — une écriture unique relit tout aussi fidèlement.
  assert.equal(
    SecureStore.__store.get('jeton.__chunks'),
    '3',
    'la valeur doit réellement être découpée en trois fragments',
  );

  assert.equal(await storage.getItem('jeton'), valeur, 'la relecture doit être fidèle');
  assert.equal(
    SecureStore.__store.has('jeton'),
    false,
    'la clé de base ne doit pas subsister à côté des fragments',
  );
});

test("l'index de découpage est écrit avant que la clé de base ne soit purgée", async () => {
  // C'est le seul ordre dont dépend la garantie, et il ne se voit pas dans le
  // résultat final : après une sauvegarde réussie, la clé de base a disparu et
  // l'index est là, quel que soit l'ordre. Il ne se voit que sur le journal.
  //
  // Ce qu'il achète : la clé de base reste lisible pendant toute la phase
  // d'écriture des fragments, donc une coupure à cet endroit rend la session
  // **précédente** au lieu d'une absence. Purgée plus tôt, elle ouvrirait une
  // fenêtre sans index et sans clé de base — une déconnexion silencieuse au
  // milieu d'un rafraîchissement de jeton.
  //
  // Le test ne présume pas du nombre de fragments : il repère les deux
  // opérations dans le journal et compare leurs rangs.
  SecureStore.__reset();
  const storage = await loadStorage('android', 'ordre');

  await storage.setItem('jeton', 'court');
  SecureStore.__operations.length = 0;
  await storage.setItem('jeton', 'b'.repeat(CHUNK_SIZE * 2 + 500));

  const indexAt = SecureStore.__operations.findIndex(
    ([operation, key]) => operation === 'set' && key === 'jeton.__chunks',
  );
  const purgeAt = SecureStore.__operations.findIndex(
    ([operation, key]) => operation === 'delete' && key === 'jeton',
  );

  assert.notEqual(indexAt, -1, "l'index doit être écrit");
  assert.notEqual(purgeAt, -1, 'la clé de base doit être purgée');
  assert.ok(indexAt < purgeAt, "l'index doit être écrit avant la purge");
});

test('un découpage incomplet est lu comme absent, jamais comme tronqué', async () => {
  SecureStore.__reset();
  const storage = await loadStorage('android', 'incomplet');

  await storage.setItem('jeton', 'c'.repeat(CHUNK_SIZE * 2 + 500));
  // On simule l'interruption : le dernier fragment n'a pas été écrit.
  SecureStore.__store.delete('jeton.2');

  assert.equal(
    await storage.getItem('jeton'),
    null,
    'une session tronquée serait plus difficile à diagnostiquer qu’une absence',
  );
});

test('un découpage interrompu laisse la session précédente intacte', async () => {
  // Le commentaire du module affirmait que la clé de base « vient d'être
  // purgée » à ce moment-là. C'est faux : `clearChunks` ne touche qu'aux
  // fragments et à l'index. Le comportement réel est meilleur — l'adhérent
  // reste connecté avec sa session précédente — et c'est ce que ce test fixe.
  SecureStore.__reset();
  const storage = await loadStorage('android', 'precedente');

  await storage.setItem('jeton', 'session-precedente');
  // Interruption : des fragments sont écrits, mais pas encore l'index.
  await SecureStore.setItemAsync('jeton.0', 'fragment-incomplet');

  assert.equal(await storage.getItem('jeton'), 'session-precedente');
});

test("une première sauvegarde interrompue ne laisse rien, plutôt qu'un fragment", async () => {
  // Le cas du tout premier enregistrement, sur un appareil neuf : il n'y a
  // aucune session précédente vers laquelle retomber. Le commentaire de tête du
  // module annonçait là « une session illisible » ; il n'y a en fait **aucune**
  // session, et c'est `getItem` qui le dit — pas un fragment relu comme un jeton.
  SecureStore.__reset();
  const storage = await loadStorage('android', 'premiere');

  SecureStore.__abortAfter(2);
  await assert.rejects(
    () => storage.setItem('jeton', 'f'.repeat(CHUNK_SIZE * 2 + 500)),
    'la doublure doit bien couper la sauvegarde',
  );
  SecureStore.__abortAfter(Number.POSITIVE_INFINITY);

  assert.equal(
    SecureStore.__store.has('jeton'),
    false,
    'aucune clé de base ne doit avoir été écrite',
  );
  assert.equal(await storage.getItem('jeton'), null);
});

/**
 * Rejoue une sauvegarde longue en la coupant après **chaque** opération, et rend
 * la liste des relectures obtenues.
 *
 * `__abortAfter` fait échouer la doublure au lieu d'exécuter l'opération : c'est
 * le seul moyen d'interrompre la fonction du module, qui ne rend la main qu'à la
 * fin. Le premier tour sert à compter les opérations d'une sauvegarde complète.
 */
async function relecturesApresCoupures(storage, precedente, nouvelle) {
  SecureStore.__reset();
  await storage.setItem('jeton', precedente);
  const avant = SecureStore.__operations.length;
  await storage.setItem('jeton', nouvelle);
  const total = SecureStore.__operations.length - avant;
  assert.ok(total > 0, 'une sauvegarde doit produire des opérations');

  const releves = [];
  // `rang` va de 0 à `total - 1` : couper à `total` ne couperait rien, puisque
  // la sauvegarde ne compte que `total` opérations. Le cas sans coupure est
  // traité après la boucle, pour que l'énumération reste exhaustive.
  for (let rang = 0; rang < total; rang += 1) {
    SecureStore.__reset();
    await storage.setItem('jeton', precedente);
    SecureStore.__operations.length = 0;
    SecureStore.__abortAfter(rang);
    await assert.rejects(
      () => storage.setItem('jeton', nouvelle),
      'la doublure doit bien couper la sauvegarde',
    );
    SecureStore.__abortAfter(Number.POSITIVE_INFINITY);
    releves.push(await storage.getItem('jeton'));
  }

  SecureStore.__reset();
  await storage.setItem('jeton', precedente);
  await storage.setItem('jeton', nouvelle);
  releves.push(await storage.getItem('jeton'));

  return releves;
}

/** Classe une relecture : l'une des trois issues admises, ou un texte partiel. */
function issueDe(relecture, precedente, nouvelle) {
  if (relecture === null) {
    return 'aucune';
  }
  if (relecture === precedente) {
    return 'précédente';
  }
  if (relecture === nouvelle) {
    return 'nouvelle';
  }
  return `tronquée (${String(relecture).length} caractères)`;
}

test('aucun point de coupure ne laisse une session tronquée', async () => {
  // Énumération plutôt que raisonnement : les deux commentaires du module se
  // contredisaient sur ce qu'une coupure laisse derrière elle, et relire la
  // fonction ne permet pas de trancher — seule l'exécution le fait.
  const storage = await loadStorage('android', 'coupures');

  const COURTE = 'session-precedente';
  const LONGUE = 'p'.repeat(CHUNK_SIZE * 2 + 500);
  const AUTRE = `${LONGUE}x`;

  // Deux situations distinctes, et c'est leur union qui couvre les trois
  // issues : une session précédente courte garde une clé de base, une session
  // précédente découpée n'en a plus.
  const depuisCourte = await relecturesApresCoupures(storage, COURTE, LONGUE);
  const depuisLongue = await relecturesApresCoupures(storage, LONGUE, AUTRE);

  const issuesCourte = depuisCourte.map((relu) => issueDe(relu, COURTE, LONGUE));
  const issuesLongue = depuisLongue.map((relu) => issueDe(relu, LONGUE, AUTRE));

  assert.deepEqual(
    [...issuesCourte, ...issuesLongue].filter((issue) => issue.startsWith('tronquée')),
    [],
    'aucune coupure ne doit laisser un texte partiel',
  );

  // Plus fort que « jamais tronquée », et c'est ici que l'ordre d'écriture se
  // vérifie : tant que la session précédente est lisible, aucune coupure ne doit
  // la rendre illisible. La purger, ou écrire l'index avant les fragments,
  // ferait apparaître `aucune` dans cette liste.
  assert.deepEqual(
    [...new Set(issuesCourte)].sort(),
    ['nouvelle', 'précédente'],
    'une session précédente courte ne doit jamais être perdue',
  );

  // Sans ces deux contrôles, le test serait vert même si la sauvegarde n'était
  // jamais coupée, ou si toutes les coupures tombaient dans la même branche.
  assert.equal(depuisCourte[0], COURTE, 'une coupure avant la première opération ne change rien');
  assert.deepEqual(
    [...new Set([...issuesCourte, ...issuesLongue])].sort(),
    ['aucune', 'nouvelle', 'précédente'],
    'les trois issues doivent être réellement atteintes',
  );
});

test('une valeur longue remplacée par une courte ne laisse aucun fragment', async () => {
  SecureStore.__reset();
  const storage = await loadStorage('android', 'orphelins');

  await storage.setItem('jeton', 'd'.repeat(CHUNK_SIZE * 2 + 500));
  await storage.setItem('jeton', 'court');

  assert.deepEqual([...SecureStore.__store.keys()], ['jeton']);
  assert.equal(await storage.getItem('jeton'), 'court');
});

test('une valeur découpée remplacée par une plus courte ne laisse aucun orphelin', async () => {
  // Trois fragments remplacés par deux : `clearChunks` doit balayer l'ancien
  // compte, pas le nouveau. S'il balayait le nouveau, `jeton.2` survivrait à
  // côté d'un index valant « 2 » — inoffensif aujourd'hui, mais c'est
  // exactement le genre de reste qu'une future relecture prendrait pour un
  // fragment légitime.
  SecureStore.__reset();
  const storage = await loadStorage('android', 'redecoupage');

  await storage.setItem('jeton', 'g'.repeat(CHUNK_SIZE * 2 + 500));
  const courte = 'h'.repeat(CHUNK_SIZE + 10);
  await storage.setItem('jeton', courte);

  assert.equal(SecureStore.__store.get('jeton.__chunks'), '2');
  assert.deepEqual(
    [...SecureStore.__store.keys()].sort(),
    ['jeton.0', 'jeton.1', 'jeton.__chunks'],
    'le troisième fragment de la valeur précédente doit avoir disparu',
  );
  assert.equal(await storage.getItem('jeton'), courte);
});

test('removeItem ne laisse rien derrière lui', async () => {
  SecureStore.__reset();
  const storage = await loadStorage('android', 'retrait');

  await storage.setItem('jeton', 'e'.repeat(CHUNK_SIZE * 2 + 500));
  await storage.removeItem('jeton');

  assert.deepEqual([...SecureStore.__store.keys()], []);
  assert.equal(await storage.getItem('jeton'), null);
});

test('sur le web, le stockage retenu est AsyncStorage et le trousseau reste vide', async () => {
  // Le web n'a pas de Keychain : les jetons y sont écrits en clair, ce qui est
  // documenté comme acceptable pour une cible de développement. Le test vérifie
  // le choix, et qu'on n'écrit pas à moitié dans l'un et à moitié dans l'autre.
  SecureStore.__reset();
  resetAsyncStorage();

  const storage = await loadStorage('web', 'web');
  await storage.setItem('jeton', 'valeur-web');

  assert.equal(asyncStore.get('jeton'), 'valeur-web');
  assert.equal(SecureStore.__store.size, 0, 'le trousseau ne doit pas être touché');
});
