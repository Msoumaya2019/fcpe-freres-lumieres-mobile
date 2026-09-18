/**
 * =============================================================================
 *  Les scripts de `package.json` : ce qu'ils lancent, et ce qu'ils existent
 * =============================================================================
 *
 *  `package.json` porte des commandes que **rien n'exécute** dans ce dépôt. Une
 *  commande peut donc nommer un binaire absent, indéfiniment, sans qu'aucune
 *  porte ne s'en aperçoive — et c'est ce qui était arrivé :
 *
 *      "doctor": "expo-doctor"
 *      "eas:build:preview": "eas build --profile preview --platform all"
 *
 *  Mesuré : ni `expo-doctor` ni `eas` ne sont des binaires de `node_modules/.bin/`.
 *  Les deux commandes échouaient sur « n'est pas reconnu en tant que commande
 *  interne ou externe » — la seconde étant précisément celle que la
 *  documentation présente comme le moyen d'obtenir l'APK.
 *
 *  Deux propriétés sont tenues ici.
 *
 *  1. **Toute commande lancée par un script est résoluble** — un binaire présent
 *     dans `node_modules/.bin/`, ou l'une des commandes déclarées dans
 *     `COMMANDES_HORS_DU_DEPOT`. Une troisième possibilité doit être nommée :
 *     c'est ce qui empêche un binaire absent de passer pour une commande
 *     système légitime.
 *  2. **Un `npx` nomme le paquet qu'il va chercher.** `npx` sans paquet nommé
 *     signifie que le script compte sur un binaire local, donc que le premier
 *     contrôle aurait dû le voir — c'est une incohérence, pas un raccourci.
 *     `--yes` est exigé avec : sans lui, `npx` s'arrête sur une invite quand le
 *     paquet n'est pas encore en cache, et une invite dans une intégration
 *     continue est une attente sans fin.
 *  3. **La chaîne de `verify` ne dépend d'aucune commande hors du dépôt.** Elle
 *     tourne à chaque poussée ; un `npx` y ferait dépendre l'intégration
 *     continue d'un téléchargement, donc d'un réseau et d'une version qui
 *     changent. Les commandes qui vont chercher un paquet — `doctor`, les trois
 *     `eas:build:*` — sont hors de cette chaîne, et doivent le rester.
 *
 *  PORTÉE — CE QUE CE BANC NE COUVRE PAS
 *  -------------------------------------
 *  Il vérifie qu'une commande **existe**, pas qu'elle réussit : un binaire
 *  présent peut échouer sur ses arguments, et c'est le rôle de la commande
 *  elle-même. Et il ne suit pas les binaires que ceux-ci appellent à leur tour.
 */

import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { test } from 'node:test';

const racine = new URL('../', import.meta.url);
const paquet = JSON.parse(readFileSync(new URL('package.json', racine), 'utf8'));
const scripts = paquet.scripts ?? {};

/**
 * Les commandes qu'un script a le droit de lancer sans qu'un binaire du dépôt
 * les fournisse. Liste **close** : y ajouter une entrée est une décision, et
 * c'est le but.
 */
const COMMANDES_HORS_DU_DEPOT = ['node', 'npm', 'npx'];

/** Un binaire installé par `npm install`, sous ses deux formes Windows. */
function binaireLocal(nom) {
  const bin = new URL(`node_modules/.bin/${nom}`, racine);
  return existsSync(bin) || existsSync(new URL(`${bin.href}.cmd`));
}

/** Les segments d'un script, séparés par `&&`, chacun réduit à ses mots. */
function segments(script) {
  return script
    .split('&&')
    .map((s) => s.trim())
    .filter((s) => s !== '')
    .map((s) => ({ texte: s, mots: s.split(/\s+/) }));
}

/** Les scripts atteints depuis `verify`, en suivant les `npm run <nom>`. */
function chaineDeVerification() {
  const vus = new Set();
  const aVoir = ['verify'];
  while (aVoir.length > 0) {
    const nom = aVoir.pop();
    if (vus.has(nom) || scripts[nom] === undefined) continue;
    vus.add(nom);
    for (const { mots } of segments(scripts[nom])) {
      if (mots[0] === 'npm' && mots[1] === 'run') aVoir.push(mots[2]);
    }
  }
  return [...vus].sort();
}

test('chaque commande lancée par un script est résoluble', () => {
  const fautifs = [];

  for (const [nom, script] of Object.entries(scripts)) {
    for (const { texte, mots } of segments(script)) {
      const commande = mots[0];
      if (binaireLocal(commande)) continue;
      if (COMMANDES_HORS_DU_DEPOT.includes(commande)) continue;
      fautifs.push(`\`${nom}\` lance \`${commande}\` (dans « ${texte} »)`);
    }
  }

  assert.deepEqual(
    fautifs,
    [],
    `aucun binaire de ce nom dans \`node_modules/.bin/\`, et la commande n'est pas déclarée hors du dépôt :\n  ${fautifs.join('\n  ')}`,
  );
});

test('un `npx` nomme le paquet qu’il va chercher, et ne peut pas s’arrêter sur une invite', () => {
  const fautifs = [];

  for (const [nom, script] of Object.entries(scripts)) {
    for (const { texte, mots } of segments(script)) {
      if (mots[0] !== 'npx') continue;
      if (mots[1] !== '--yes') {
        fautifs.push(
          `\`${nom}\` appelle \`npx\` sans \`--yes\` : sans lui, une invite peut attendre indéfiniment (dans « ${texte} »)`,
        );
        continue;
      }
      if (mots[2] === undefined || mots[2].startsWith('-')) {
        fautifs.push(
          `\`${nom}\` appelle \`npx --yes\` sans nommer de paquet : un binaire local aurait dû être trouvé par le contrôle précédent (dans « ${texte} »)`,
        );
      }
    }
  }

  assert.deepEqual(fautifs, [], fautifs.join('\n  '));
});

test('la chaîne de `verify` ne dépend d’aucune commande hors du dépôt', () => {
  const atteints = chaineDeVerification();
  assert.ok(
    atteints.includes('verify') && atteints.length > 5,
    `la chaîne de \`verify\` doit être atteinte : ${JSON.stringify(atteints)}`,
  );

  const fautifs = [];
  for (const nom of atteints) {
    for (const { mots } of segments(scripts[nom])) {
      // `npm` est là pour rappeler un autre script du dépôt, jamais pour
      // installer : `npm install` dans la porte de qualité ferait dépendre le
      // contrôle de ce qu'il contrôle.
      if (mots[0] === 'npm' && mots[1] !== 'run') {
        fautifs.push(`\`${nom}\` lance \`npm ${mots[1]}\``);
      }
      if (mots[0] === 'npx') {
        fautifs.push(`\`${nom}\` lance \`npx ${mots[1] ?? ''}\``);
      }
    }
  }

  assert.deepEqual(
    fautifs,
    [],
    `la porte de qualité tourne à chaque poussée : elle ne doit rien télécharger\n  ${fautifs.join('\n  ')}`,
  );
});
