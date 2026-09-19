/**
 * =============================================================================
 *  L'accord entre les paquets installés et les versions que le SDK contraint
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
 *  proposée. À l'inverse, une montée de `typescript` à `7.0.2` échoue
 *  bruyamment — `typescript-eslint` déclare `typescript: >=4.8.4 <6.1.0` — ce
 *  qui est la bonne façon d'échouer, mais arrive après coup.
 *
 *  SOURCE DU RELEVÉ
 *  ----------------
 *      https://api.expo.dev/v2/sdks/57.0.0/native-modules
 *          → les 123 modules natifs, `npmPackage` + `versionRange`
 *      https://api.expo.dev/v2/versions/latest
 *          → `sdkVersions["57.0.0"].expoVersion` et `.relatedPackages`
 *
 *      relevé le 2026-09-18, avec `expo@57.0.24` installé
 *
 *  Ces deux points d'entrée sont ceux que `npx expo install --check` interroge.
 *  Le second est nécessaire en plus du premier : `expo` lui-même n'est pas un
 *  module natif et n'y figure donc pas, alors qu'il porte la version du SDK.
 *
 *  Le relevé peut **vieillir**, et c'est le premier cas testé : si `expo` passe
 *  au SDK 58, ce banc tombe et demande de relire l'API. Un relevé périmé qui
 *  continue de passer serait pire que pas de relevé.
 *
 *  CE QUE LA LISTE CONTIENT, ET CE QU'ELLE NE CONTIENT PAS
 *  ------------------------------------------------------
 *  Dix-sept paquets installés ici sont contraints par le SDK. Tous les autres —
 *  Supabase, React Navigation, ESLint, Prettier, `libpg-query` — ne le sont pas
 *  et restent libres : ils se mettent à jour par Dependabot, normalement.
 *
 *  UN RELEVÉ NE VOIT PAS CE QU'ON INSTALLE APRÈS LUI
 *  -------------------------------------------------
 *  La liste est un relevé : elle nomme ce que le SDK épingle au moment où elle a
 *  été écrite. Elle ne peut donc pas voir un paquet de l'écosystème ajouté plus
 *  tard — c'est arrivé avec `expo-notifications`, installé par
 *  `npx expo install`, qui pose bien la version que le SDK admet mais que rien
 *  ne retenait ensuite : Dependabot aurait proposé la mineure suivante, et rien
 *  n'aurait protesté.
 *
 *  Un second contrôle ferme ce chemin : tout paquet installé dont le nom vient
 *  de l'écosystème doit être **soit** au relevé, **soit** dans `HORS_RELEVE`
 *  avec sa raison. Une troisième possibilité n'existe pas.
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

/** Le SDK sur lequel porte le relevé ci-dessous. */
const SDK_DU_RELEVE = '57';

/**
 * Les paquets installés que le SDK contraint, et la plage que le SDK leur donne.
 *
 * Liste **close**, et comparée dans les deux sens à celle que `dependabot.yml`
 * ignore. Un paquet contraint qu'on cesse d'ignorer produira une pull request qui
 * rompt l'accord ; un paquet ignoré qui n'est pas contraint cessera
 * silencieusement de se mettre à jour.
 */
const CONTRAINTES_DU_SDK = {
  '@expo/vector-icons': '^15.0.2',
  '@react-native-async-storage/async-storage': '2.2.0',
  '@types/react': '~19.2.4',
  expo: '~57.0.24',
  'expo-constants': '~57.0.19',
  'expo-font': '~57.0.4',
  'expo-linking': '~57.0.10',
  'expo-notifications': '~57.0.20',
  'expo-secure-store': '~57.0.4',
  'expo-splash-screen': '~57.0.9',
  'expo-status-bar': '~57.0.1',
  'expo-system-ui': '~57.0.4',
  react: '19.2.3',
  'react-native': '0.86.3',
  'react-native-safe-area-context': '~5.7.0',
  'react-native-screens': '~4.26.0',
  typescript: '~6.0.3',
};

const EXACT = /^\d+\.\d+\.\d+$/;
const TILDE = /^~(\d+)\.(\d+)\.(\d+)$/;
const CARET = /^\^(\d+)\.(\d+)\.(\d+)$/;

const MINEURE = 'version-update:semver-minor';
const MAJEURE = 'version-update:semver-major';

/** Le spécificateur déclaré dans `package.json`, où qu'il se trouve. */
function declare(nom) {
  const valeur = paquet.dependencies?.[nom] ?? paquet.devDependencies?.[nom] ?? null;
  assert.notEqual(
    valeur,
    null,
    `\`${nom}\` est contraint par le SDK mais n'est déclaré ni dans \`dependencies\` ni dans \`devDependencies\``,
  );
  return valeur;
}

/**
 * `null` si tout ce que la plage déclarée admet est admis par celle du SDK ;
 * sinon l'explication, en français.
 *
 * La comparaison reste **textuelle**, et c'est volontaire : introduire une
 * bibliothèque de semver pour seize paquets ajouterait une dépendance à tenir.
 * Trois formes suffisent — l'épinglage exact, le « ~ » et le « ^ ».
 */
function ecart(declaree, duSdk) {
  if (EXACT.test(duSdk)) {
    return declaree === duSdk
      ? null
      : `le SDK épingle \`${duSdk}\`, la plage déclarée est \`${declaree}\` : toute autre plage admet une version que le SDK refuse`;
  }

  const attendu = TILDE.exec(duSdk) ?? CARET.exec(duSdk);
  assert.notEqual(
    attendu,
    null,
    `forme de relevé non prévue pour \`${duSdk}\` : le banc ne sait comparer que l'épinglage exact, le « ~ » et le « ^ »`,
  );
  const [, majeur, mineur, correctif] = attendu;

  const vu = TILDE.exec(declaree) ?? CARET.exec(declaree);
  if (vu === null) {
    return `le SDK attend \`${duSdk}\`, la plage déclarée est \`${declaree}\` : une plage qui n'est ni un « ~ » ni un « ^ » admet des versions que le SDK refuse`;
  }
  if (vu[1] !== majeur) {
    return `le SDK attend \`${duSdk}\`, la plage déclarée \`${declaree}\` porte sur une autre version majeure`;
  }
  // Un « ^ » déclaré là où le SDK n'admet qu'un « ~ » est trop large : il
  // autoriserait la mineure suivante, que le SDK refuse.
  if (TILDE.test(duSdk) && CARET.test(declaree)) {
    return `le SDK attend \`${duSdk}\`, la plage déclarée est un « ^ » : elle admet la mineure suivante, que le SDK refuse`;
  }
  if (vu[2] !== mineur) {
    return `le SDK attend \`${duSdk}\`, la plage déclarée \`${declaree}\` porte sur une autre version mineure`;
  }
  if (Number(vu[3]) < Number(correctif)) {
    return `le SDK attend au moins \`${duSdk}\`, la plage déclarée \`${declaree}\` admet des correctifs antérieurs`;
  }
  return null;
}

/**
 * Les types de montée que Dependabot ne doit pas proposer, **déduits** de la
 * plage du SDK — et non recopiés à côté.
 *
 * Un épinglage exact n'admet aucune montée, pas même un correctif : le SDK nomme
 * une version, pas une famille. Une plage « ~X.Y.Z » admet le correctif, pas la
 * mineure. Une plage « ^X.Y.Z » admet la mineure, pas la majeure.
 */
function typesRefuses(duSdk) {
  if (EXACT.test(duSdk)) return undefined;
  if (TILDE.test(duSdk)) return [MINEURE, MAJEURE];
  assert.ok(CARET.test(duSdk), `forme de relevé non prévue : \`${duSdk}\``);
  return [MAJEURE];
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
  const vu = TILDE.exec(expo) ?? CARET.exec(expo) ?? EXACT.exec(expo);
  assert.notEqual(vu, null, `\`expo\` est déclaré \`${expo}\`, forme non prévue`);
  assert.equal(
    vu[1],
    SDK_DU_RELEVE,
    `le relevé de ce banc porte sur le SDK ${SDK_DU_RELEVE}, et \`expo\` est déclaré \`${expo}\` : ` +
      'relire https://api.expo.dev/v2/sdks/…/native-modules et ' +
      'https://api.expo.dev/v2/versions/latest, puis mettre à jour ' +
      'CONTRAINTES_DU_SDK et `dependabot.yml`',
  );
});

/**
 * Les paquets de l'écosystème installés ici que le SDK **ne contraint pas**.
 *
 * POURQUOI CETTE SECONDE LISTE EXISTE
 * -----------------------------------
 * `CONTRAINTES_DU_SDK` est un relevé : il nomme ce que le SDK épingle au moment
 * où il a été écrit, et il ne peut donc pas voir un paquet de l'écosystème
 * installé **plus tard**. C'est arrivé avec `expo-notifications` : `npx expo
 * install` a bien posé la version que le SDK admet, mais rien ne la retenait
 * ensuite, et Dependabot aurait pu proposer la mineure suivante sans que rien ne
 * proteste.
 *
 * Le contrôle qui suit ferme ce chemin : tout paquet installé dont le nom vient
 * de l'écosystème est **soit** au relevé, **soit** ici, avec sa raison. Une
 * troisième possibilité n'existe pas — c'est la même fermeture que pour
 * `SURFACE_PUBLIQUE` dans `check-rls-guards`.
 */
const HORS_RELEVE = new Map([
  [
    'react-native-url-polyfill',
    'polyfill JavaScript pur, sans module natif : il ne figure donc pas au relevé ' +
      'des modules natifs du SDK, et sa version se choisit dans ce dépôt',
  ],
]);

test('chaque paquet contraint est déclaré dans une plage que le SDK admet', () => {
  for (const [nom, duSdk] of Object.entries(CONTRAINTES_DU_SDK)) {
    assert.equal(ecart(declare(nom), duSdk), null, `\`${nom}\` : ${ecart(declare(nom), duSdk)}`);
  }
});

test('aucun paquet de l’écosystème n’est installé sans être tranché', () => {
  // Le préfixe est celui de l'écosystème Expo : `expo`, `expo-*`, `@expo/*`,
  // `react-native`, `react-native-*`, `@react-native/*`, `@types/react`. Un
  // paquet qui entre par ce filtre et n'est ni au relevé ni dans `HORS_RELEVE`
  // est un paquet dont personne n'a décidé la politique de montée.
  const ecosysteme =
    /^(expo$|expo-|@expo\/|react-native$|react-native-|@react-native\/|@types\/react$)/;
  const installes = Object.keys({ ...paquet.dependencies, ...paquet.devDependencies });

  assert.deepEqual(
    installes.filter(
      (nom) => ecosysteme.test(nom) && !(nom in CONTRAINTES_DU_SDK) && !HORS_RELEVE.has(nom),
    ),
    [],
    'ces paquets viennent de l’écosystème Expo sans figurer au relevé du SDK : ' +
      'soit les y ajouter avec la plage que donne l’API, soit les inscrire dans ' +
      '`HORS_RELEVE` avec leur raison',
  );

  // Et la seconde liste ne décrit pas des paquets absents : une exclusion qui
  // survit au paquet qu'elle décrit est une justification périmée.
  assert.deepEqual(
    [...HORS_RELEVE.keys()].filter((nom) => !installes.includes(nom)),
    [],
    '`HORS_RELEVE` nomme un paquet qui n’est pas installé',
  );
});

test('Dependabot ignore exactement les paquets que le SDK contraint', () => {
  const ignorees = exclusionsDependabot().map((e) => e['dependency-name']);
  const contraints = Object.keys(CONTRAINTES_DU_SDK);

  // Dans les deux sens : un paquet contraint qu'on cesse d'ignorer produira une
  // pull request qui rompt l'accord ; un paquet ignoré qui n'est pas contraint
  // cessera silencieusement de se mettre à jour.
  assert.deepEqual(
    [...ignorees].sort(),
    [...contraints].sort(),
    `\`dependabot.yml\` ignore ${JSON.stringify(ignorees.sort())}, ` +
      `le SDK contraint ${JSON.stringify(contraints.sort())}`,
  );
});

test('les types de montée ignorés se déduisent de la plage du SDK', () => {
  const parNom = new Map(exclusionsDependabot().map((e) => [e['dependency-name'], e]));

  for (const [nom, duSdk] of Object.entries(CONTRAINTES_DU_SDK)) {
    const refuse = typesRefuses(duSdk);
    assert.deepEqual(
      parNom.get(nom)?.['update-types'],
      refuse,
      `\`${nom}\` est contraint \`${duSdk}\` : l'exclusion doit porter sur ${JSON.stringify(refuse ?? 'toutes les montées')}`,
    );
  }
});
