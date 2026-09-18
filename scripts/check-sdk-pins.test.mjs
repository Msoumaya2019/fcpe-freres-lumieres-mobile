/**
 * =============================================================================
 *  L'accord entre les paquets installés et les versions que le SDK épingle
 * =============================================================================
 *
 *  `package.json` dit ce que ce dépôt installe. Le SDK d'Expo dit ce que
 *  l'application peut faire tourner. Les deux ne peuvent pas se lire — l'un vit
 *  dans le dépôt, l'autre derrière une API — donc ils divergent en silence, et
 *  c'est le sens de la divergence qui coûte cher : **rien ne proteste.**
 *
 *  Mesuré : `react-native@0.86.3` déclare `peerDependencies.react = ^19.2.3`.
 *  Une montée de `react` à `19.3.0` satisfait cette plage, `npm ci` l'accepte,
 *  `tsc --noEmit` passe, et l'accord avec le SDK est rompu. Dependabot l'a
 *  proposée trois fois de suite. À l'inverse, une montée de `typescript` à
 *  `7.0.2` échoue bruyamment — `typescript-eslint` déclare
 *  `typescript: >=4.8.4 <6.1.0` — ce qui est la bonne façon d'échouer, mais
 *  arrive après coup.
 *
 *  SOURCE DU RELEVÉ
 *  ----------------
 *      https://api.expo.dev/v2/versions/latest
 *      `sdkVersions["57.0.0"]`
 *      relevé le 2026-09-18, avec `expo@57.0.24` installé
 *
 *  Les valeurs relevées, verbatim :
 *
 *      facebookReactVersion         = 19.2.3
 *      facebookReactNativeVersion   = 0.86.3
 *      relatedPackages.react        = 19.2.3
 *      relatedPackages.typescript   = ~6.0.3
 *      relatedPackages["@types/react"] = ~19.2.4
 *
 *  Le relevé peut **vieillir**, et c'est le premier cas testé : si `expo` passe
 *  au SDK 58, ce banc tombe et demande de relire l'API. Un relevé périmé qui
 *  continue de passer serait pire que pas de relevé.
 *
 *  PORTÉE — CE QUE CE BANC NE COUVRE PAS
 *  -------------------------------------
 *  Il compare des **spécificateurs**, pas des versions résolues. Ce qui est
 *  réellement installé est tenu par `package-lock.json` et par le `npm ci` de
 *  l'intégration continue. Et il ne dit rien du **bien-fondé** d'une montée : il
 *  dit seulement qu'une plage déclarée n'admet pas ce que le SDK refuse.
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { parse } from 'yaml';

const racine = new URL('../', import.meta.url);
const paquet = JSON.parse(readFileSync(new URL('package.json', racine), 'utf8'));
const dependabot = parse(readFileSync(new URL('.github/dependabot.yml', racine), 'utf8'));

/** Le SDK sur lequel porte le relevé ci-dessus. */
const SDK_DU_RELEVE = '57';

/**
 * Les paquets épinglés par le SDK, et la plage que le SDK leur donne.
 *
 * Liste **close** : elle est comparée, dans les deux sens, à la liste ignorée
 * par Dependabot. Un paquet épinglé qu'on cesse d'ignorer produira une pull
 * request qui rompt l'accord ; un paquet ignoré qui n'est pas épinglé cessera
 * silencieusement de se mettre à jour.
 */
const EPINGLES_PAR_LE_SDK = {
  react: '19.2.3',
  'react-native': '0.86.3',
  typescript: '~6.0.3',
  '@types/react': '~19.2.4',
};

const EXACT = /^\d+\.\d+\.\d+$/;
const TILDE = /^~(\d+)\.(\d+)\.(\d+)$/;

/** Le spécificateur déclaré dans `package.json`, où qu'il se trouve. */
function declare(nom) {
  const valeur = paquet.dependencies?.[nom] ?? paquet.devDependencies?.[nom] ?? null;
  assert.notEqual(
    valeur,
    null,
    `\`${nom}\` est épinglé par le SDK mais n'est déclaré ni dans \`dependencies\` ni dans \`devDependencies\``,
  );
  return valeur;
}

/**
 * `null` si tout ce que la plage déclarée admet est admis par celle du SDK ;
 * sinon l'explication, en français.
 *
 * La comparaison reste **textuelle**, et c'est volontaire : introduire une
 * bibliothèque de semver pour quatre paquets ajouterait une dépendance à tenir.
 * Deux formes suffisent — l'épinglage exact et le « ~ ».
 */
function ecart(declaree, duSdk) {
  if (EXACT.test(duSdk)) {
    return declaree === duSdk
      ? null
      : `le SDK épingle \`${duSdk}\`, la plage déclarée est \`${declaree}\` : toute autre plage admet une version que le SDK refuse`;
  }

  const attendu = TILDE.exec(duSdk);
  assert.notEqual(
    attendu,
    null,
    `forme de relevé non prévue pour \`${duSdk}\` : le banc ne sait comparer que l'épinglage exact et le « ~ »`,
  );
  const [, majeur, mineur, correctif] = attendu;

  const vu = TILDE.exec(declaree);
  if (vu === null) {
    return `le SDK attend \`${duSdk}\`, la plage déclarée est \`${declaree}\` : une plage qui n'est pas un « ~ » admet des versions que le SDK refuse`;
  }
  if (vu[1] !== majeur || vu[2] !== mineur) {
    return `le SDK attend \`${duSdk}\`, la plage déclarée \`${declaree}\` porte sur une autre version mineure`;
  }
  if (Number(vu[3]) < Number(correctif)) {
    return `le SDK attend au moins \`${duSdk}\`, la plage déclarée \`${declaree}\` admet des correctifs antérieurs`;
  }
  return null;
}

/** L'entrée npm de `dependabot.yml`, et sa liste d'exclusions. */
function exclusionsDependabot() {
  const npm = (dependabot.updates ?? []).find((u) => u['package-ecosystem'] === 'npm');
  assert.notEqual(
    npm,
    undefined,
    '`dependabot.yml` doit garder une entrée `package-ecosystem: npm`',
  );
  return npm.ignore ?? [];
}

test('le relevé porte sur le SDK réellement installé', () => {
  const expo = declare('expo');
  const vu = TILDE.exec(expo) ?? EXACT.exec(expo);
  assert.notEqual(vu, null, `\`expo\` est déclaré \`${expo}\`, forme non prévue`);
  assert.equal(
    vu[1],
    SDK_DU_RELEVE,
    `le relevé de ce banc porte sur le SDK ${SDK_DU_RELEVE}, et \`expo\` est déclaré \`${expo}\` : ` +
      'relire https://api.expo.dev/v2/versions/latest, puis mettre à jour ' +
      'EPINGLES_PAR_LE_SDK et `dependabot.yml`',
  );
});

test('chaque paquet épinglé est déclaré dans une plage que le SDK admet', () => {
  for (const [nom, duSdk] of Object.entries(EPINGLES_PAR_LE_SDK)) {
    assert.equal(ecart(declare(nom), duSdk), null, `\`${nom}\` : ${ecart(declare(nom), duSdk)}`);
  }
});

test('Dependabot ignore exactement les paquets que le SDK épingle', () => {
  const ignorees = exclusionsDependabot().map((e) => e['dependency-name']);
  const epingles = Object.keys(EPINGLES_PAR_LE_SDK);

  // Dans les deux sens : un paquet épinglé qu'on cesse d'ignorer produira une
  // pull request qui rompt l'accord ; un paquet ignoré qui n'est pas épinglé
  // cessera silencieusement de se mettre à jour.
  assert.deepEqual(
    [...ignorees].sort(),
    [...epingles].sort(),
    `\`dependabot.yml\` ignore ${JSON.stringify(ignorees.sort())}, ` +
      `le SDK épingle ${JSON.stringify(epingles.sort())}`,
  );
});

test('les paquets épinglés exactement sont ignorés en entier', () => {
  // Un épinglage exact n'admet **aucune** montée, pas même un correctif : le
  // SDK nomme une version, pas une famille. Une exclusion limitée aux montées
  // majeures laisserait donc passer un correctif que le SDK refuse.
  const parNom = new Map(exclusionsDependabot().map((e) => [e['dependency-name'], e]));

  for (const [nom, duSdk] of Object.entries(EPINGLES_PAR_LE_SDK)) {
    const types = parNom.get(nom)?.['update-types'];
    if (EXACT.test(duSdk)) {
      assert.equal(
        types,
        undefined,
        `\`${nom}\` est épinglé exactement (\`${duSdk}\`) : son exclusion ne doit pas être limitée à certains types de montée`,
      );
    } else {
      assert.deepEqual(
        types,
        ['version-update:semver-minor', 'version-update:semver-major'],
        `\`${nom}\` est déclaré \`${duSdk}\`, donc les montées de correctif restent légitimes : l'exclusion doit porter sur les mineures et les majeures, et sur elles seules`,
      );
    }
  }
});
