/**
 * Vérifie le câblage asynchrone des écrans.
 *
 * POURQUOI CE SCRIPT
 * ------------------
 * `useAsyncData` rend quatre choses à ses appelants, et deux d'entre elles sont
 * des **issues de secours** : `refresh`, branché sur le tirer-pour-rafraîchir, et
 * `reload`, branché sur le bouton « Réessayer ». Un écran qui en oublie une laisse
 * l'adhérent sans recours — et le défaut est d'autant plus vicieux que le
 * commentaire d'`AsyncErrorBanner` affirme le contraire :
 *
 *     « Pour recharger, l'adhérent tire la liste vers le bas : `refresh` est déjà
 *       branché sur le `RefreshControl` de chaque écran. »
 *
 * Voilà une affirmation **universelle** (« de chaque écran ») que personne ne
 * vérifiait. Elle est vraie aujourd'hui ; ce fichier la tient.
 *
 * Le test des écritures couvre une autre promesse du même genre, et son défaut est
 * plus visible encore : un écran qui écrit — un signalement créé, un message
 * envoyé, une réservation posée — doit **relire sa liste**, sans quoi l'adhérent
 * voit son action réussir et rien apparaître. Les fonctions d'écriture ne sont
 * pas listées ici : elles sont **déduites des services**, en relevant celles dont
 * le corps contient une insertion, une modification ou une suppression. Un
 * nouveau service d'écriture entre donc dans le champ du test sans qu'on y pense.
 *
 * Le dernier test tient la condition qui rend tout cela vivant : `AsyncFallback`
 * doit rester derrière une garde de vacuité — `ListEmptyComponent`, ou un
 * `length === 0 ? … : …`. Rendu sans garde, il coexisterait avec la liste, et
 * l'échec d'un rafraîchissement remplacerait le contenu affiché par un écran
 * d'erreur — exactement ce que `useAsyncData` conserve `data` pour éviter.
 */

import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const RACINE = fileURLToPath(new URL('../', import.meta.url));

function lireFichier(chemin) {
  return readFileSync(chemin, 'utf8');
}

/** Retire les commentaires : le fichier qui documente un appel le nomme aussi. */
function sansCommentaires(source) {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
}

function fichiersSous(dossier, extensions) {
  const base = join(RACINE, dossier);

  return readdirSync(base, { recursive: true })
    .filter((nom) => typeof nom === 'string' && extensions.some((ext) => nom.endsWith(ext)))
    .map((nom) => join(base, nom));
}

const ECRANS = fichiersSous('src/screens', ['.tsx']);
const SERVICES = fichiersSous('src/services', ['.ts']);

/**
 * Les fonctions d'écriture, déduites des services : celles dont le corps touche
 * à la base. Relevées plutôt que listées, pour qu'un service ajouté plus tard
 * soit pris en compte sans modification de ce fichier.
 */
function fonctionsEcriture() {
  const noms = new Set();

  for (const chemin of SERVICES) {
    const source = sansCommentaires(lireFichier(chemin));
    const motif = /export async function (\w+)\s*\([^)]*\)[^{]*\{([\s\S]*?)\n\}/g;

    let fonction;
    while ((fonction = motif.exec(source)) !== null) {
      if (/\.(insert|update|upsert|delete)\s*\(/.test(fonction[2])) {
        noms.add(fonction[1]);
      }
    }
  }

  return [...noms].sort();
}

const ECRITURES = fonctionsEcriture();

/** Écrans qui chargent des données par `useAsyncData`, avec leur source nue. */
function ecransChargeants() {
  const trouves = [];

  for (const chemin of ECRANS) {
    const source = sansCommentaires(lireFichier(chemin));

    if (source.includes('useAsyncData(')) {
      trouves.push({ chemin, relatif: relative(RACINE, chemin).replace(/\\/g, '/'), source });
    }
  }

  return trouves;
}

const ECRANS_CHARGEANTS = ecransChargeants();

test('l’extraction lit bien les écrans et les services', () => {
  // Sans ce garde-fou, un motif qui ne correspond plus rendrait les tests
  // suivants verts en ne vérifiant rien — un défaut avec l'apparence d'une
  // protection, ce qui est le pire des états.
  assert.ok(
    ECRANS_CHARGEANTS.length >= 4,
    `écrans appelant useAsyncData : ${ECRANS_CHARGEANTS.length}`,
  );
  assert.ok(ECRITURES.length >= 3, `fonctions d’écriture relevées : ${ECRITURES.join(', ')}`);

  for (const ecran of ECRANS_CHARGEANTS) {
    assert.ok(
      ecran.source.includes('reload') && ecran.source.includes('refresh'),
      `${ecran.relatif} : le hook est appelé mais ses issues de secours ne sont pas déstructurées`,
    );
  }
});

test('chaque écran qui charge des données câble le tirer-pour-rafraîchir', () => {
  // Le bandeau d'erreur renvoie à ce geste : sans ce câblage, une erreur
  // survenue alors que du contenu est affiché n'a plus aucune issue.
  const fautifs = [];

  for (const ecran of ECRANS_CHARGEANTS) {
    if (!ecran.source.includes('RefreshControl')) {
      fautifs.push(`${ecran.relatif} : pas de RefreshControl`);
      continue;
    }

    if (!/onRefresh=\{refresh\}/.test(ecran.source)) {
      fautifs.push(`${ecran.relatif} : RefreshControl sans onRefresh={refresh}`);
    }
  }

  assert.deepEqual(fautifs, []);
});

test('chaque écran qui charge des données câble le bouton « Réessayer »', () => {
  const fautifs = [];

  for (const ecran of ECRANS_CHARGEANTS) {
    if (!ecran.source.includes('<AsyncFallback')) {
      fautifs.push(`${ecran.relatif} : pas d’AsyncFallback`);
      continue;
    }

    if (!/onRetry=\{reload\}/.test(ecran.source)) {
      fautifs.push(`${ecran.relatif} : AsyncFallback sans onRetry={reload}`);
    }
  }

  assert.deepEqual(fautifs, []);
});

test('un écran qui écrit relit sa liste', () => {
  // L'action réussit, l'écran ne bouge pas : l'adhérent conclut qu'elle a échoué,
  // recommence, et crée un doublon — ou renonce.
  const fautifs = [];

  for (const ecran of ECRANS_CHARGEANTS) {
    const ecritures = ECRITURES.filter((nom) => new RegExp(`\\b${nom}\\s*\\(`).test(ecran.source));

    if (ecritures.length === 0) {
      continue;
    }

    if (!/reload\s*\(\s*\)/.test(ecran.source)) {
      fautifs.push(
        `${ecran.relatif} : appelle ${ecritures.join(', ')} sans jamais appeler reload()`,
      );
    }
  }

  assert.deepEqual(fautifs, []);
});

/**
 * Les `<AsyncFallback` d'une source, avec ce qui les précède depuis la garde la
 * plus proche — `ListEmptyComponent={` ou le `? (` d'un test de vacuité.
 *
 * Le texte intermédiaire est rendu avec la garde pour que l'appelant puisse
 * exiger qu'**aucun élément n'y ait été ouvert puis refermé** : sans cette
 * condition, un `ListEmptyComponent` posé ailleurs dans le fichier blanchirait un
 * `AsyncFallback` rendu sans garde.
 */
function gardesDesEtatsVides(source) {
  const releves = [];
  const motif = /<AsyncFallback/g;

  let trouve;
  while ((trouve = motif.exec(source)) !== null) {
    const avant = source.slice(0, trouve.index);
    const marqueurs = [avant.lastIndexOf('ListEmptyComponent={'), avant.lastIndexOf('? (')].filter(
      (position) => position !== -1,
    );
    const ligne = avant.split('\n').length;

    releves.push(
      marqueurs.length === 0
        ? { ligne, garde: null }
        : { ligne, garde: avant.slice(Math.max(...marqueurs)) },
    );
  }

  return releves;
}

test("l'état vide est la seule porte d'`AsyncFallback`", () => {
  // `AsyncFallback` reçoit `hasData` faux à tous ses appels : il n'est donc
  // jamais le mécanisme qui préserve une liste affichée, c'est son **absence de
  // montage** qui le fait. Encore faut-il que ce soit vrai — c'est ce que ce test
  // tient, et non la lecture du commentaire qui l'affirme.
  const fautifs = [];

  for (const ecran of ECRANS_CHARGEANTS) {
    const gardes = gardesDesEtatsVides(ecran.source);

    if (gardes.length === 0) {
      fautifs.push(`${ecran.relatif} : aucun AsyncFallback relevé`);
      continue;
    }

    for (const { ligne, garde } of gardes) {
      if (garde === null) {
        fautifs.push(`${ecran.relatif}:${ligne} : AsyncFallback hors de toute garde de vacuité`);
      } else if (/\/>|<\//.test(garde)) {
        fautifs.push(
          `${ecran.relatif}:${ligne} : un élément est refermé entre la garde et AsyncFallback`,
        );
      }
    }
  }

  assert.deepEqual(fautifs, []);
});
