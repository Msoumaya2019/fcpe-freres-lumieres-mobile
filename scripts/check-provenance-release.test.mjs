/**
 * Banc de `scripts/provenance-release.mjs` — le texte de la version, recalculé.
 *
 * POURQUOI CE BANC EXISTE
 * -----------------------
 * Le défaut qu'il couvre a été **lu sur la vraie page** : la version `v0.1.0`
 * annonçait « compilés depuis le commit dd5f872… » alors que les deux binaires
 * déposés ensuite venaient de `e49297d`. Le texte d'une version n'est écrit
 * qu'à sa création, les fichiers sont remplacés à chaque compilation, et la
 * page est la seule adresse d'où un parent peut télécharger. Une provenance
 * fausse à l'endroit exact où l'on vient chercher une garantie.
 *
 * Le banc s'exerce donc sur les deux directions, et la seconde est la plus
 * importante :
 *
 *  - un texte **déjà faux** doit perdre sa phrase, et ne plus contenir
 *    l'ancien commit nulle part ;
 *  - un texte **sain** doit rester sain — la ligne de l'autre plateforme
 *    conservée avec son propre commit, et un second dépôt du même fichier qui
 *    remplace sa ligne au lieu de la doubler.
 *
 * Le cas négatif le plus utile est celui de l'**idempotence** : deux dépôts
 * successifs du même fichier doivent rendre le même texte. Sans elle, chaque
 * compilation ajouterait une ligne, et la page deviendrait une liste de
 * versions successives dont aucune ne dirait laquelle est la bonne.
 *
 * Le script est éprouvé **comme le flux l'appelle** — un sous-processus, le
 * texte courant sur l'entrée standard, le nom du fichier et le commit en
 * arguments. Un banc qui importerait une fonction interne ne dirait rien de
 * l'entrée standard, qui est justement par où passe le texte de la version.
 *
 * Son nom commence par `check-`, comme celui des autres bancs, et ce n'est pas
 * une coquetterie : le §9 du README est **extrait** par ce préfixe, et un banc
 * nommé autrement n'y serait jamais vu — il échapperait au contrôle qui vérifie
 * que tous les bancs y figurent. La règle est désormais tenue par
 * `check-inventory.test.mjs`, qui la dit.
 */

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const SCRIPT = fileURLToPath(new URL('provenance-release.mjs', import.meta.url));

const APK = 'fcpe-freres-lumieres-0.1.0-android.apk';
const IPA = 'fcpe-freres-lumieres-0.1.0-non-signe.ipa';
const ANCIEN = 'dd5f872ab31214d95b79979217e361b7a2695adb';
const NOUVEAU = 'e49297d2c1b4a8f0e5d3c7a9b1f4e6d8c0a2b4f6';

/** Le script, appelé comme le flux l'appelle. */
function executer(corps, ...arguments_) {
  const resultat = spawnSync(process.execPath, [SCRIPT, ...arguments_], {
    input: corps,
    encoding: 'utf8',
  });

  return { code: resultat.status, sortie: resultat.stdout, erreur: resultat.stderr };
}

/** Le texte **réel** de la version `v0.1.0`, relevé le 2026-09-19. */
const TEXTE_D_ORIGINE = `Binaires de la version 0.1.0, compilés depuis le commit ${ANCIEN}.`;

/** Les lignes de provenance d'un texte, dans l'ordre. */
function lignes(texte) {
  return texte.split('\n').filter((ligne) => ligne.startsWith('- `'));
}

test('sans fichier, le script écrit l’en-tête et le pied, et aucune provenance', () => {
  const { code, sortie } = executer('');

  assert.equal(code, 0);
  assert.equal(lignes(sortie).length, 0, `aucune ligne attendue :\n${sortie}`);
  assert.match(sortie, /^Binaires déposés par les flux de compilation/);
  assert.match(sortie, /réécrit à chaque dépôt/);
  assert.ok(sortie.endsWith('\n'), 'le texte doit finir par un saut de ligne');
});

test('un dépôt sur un texte vide écrit la provenance du fichier', () => {
  const { code, sortie } = executer('', APK, NOUVEAU);

  assert.equal(code, 0);
  assert.deepEqual(lignes(sortie), [`- \`${APK}\` — compilé depuis le commit \`${NOUVEAU}\`.`]);
});

test('la phrase figée de la version 0.1.0 disparaît, et son commit avec elle', () => {
  const { code, sortie } = executer(TEXTE_D_ORIGINE, APK, NOUVEAU);

  assert.equal(code, 0);
  assert.ok(!sortie.includes(ANCIEN), `l’ancien commit est encore annoncé :\n${sortie}`);
  assert.ok(
    !sortie.includes('Binaires de la version 0.1.0'),
    `la phrase figée est encore là :\n${sortie}`,
  );
  assert.deepEqual(lignes(sortie), [`- \`${APK}\` — compilé depuis le commit \`${NOUVEAU}\`.`]);
});

test('la provenance de l’autre plateforme est conservée, avec son propre commit', () => {
  const apresLePremier = executer(TEXTE_D_ORIGINE, APK, NOUVEAU).sortie;
  const apresLeSecond = executer(apresLePremier, IPA, ANCIEN).sortie;

  assert.deepEqual(lignes(apresLeSecond), [
    `- \`${APK}\` — compilé depuis le commit \`${NOUVEAU}\`.`,
    `- \`${IPA}\` — compilé depuis le commit \`${ANCIEN}\`.`,
  ]);
});

test('redéposer le même fichier remplace sa ligne au lieu de la doubler', () => {
  const une = executer(TEXTE_D_ORIGINE, APK, ANCIEN).sortie;
  const deux = executer(une, APK, NOUVEAU).sortie;

  assert.equal(deux, une.replace(ANCIEN, NOUVEAU), 'seul le commit doit changer');
  assert.equal(lignes(deux).length, 1, `une seule ligne attendue :\n${deux}`);
});

test('deux dépôts successifs du même fichier rendent le même texte', () => {
  const une = executer(TEXTE_D_ORIGINE, APK, NOUVEAU).sortie;
  const deux = executer(une, APK, NOUVEAU).sortie;

  assert.equal(deux, une, 'le texte doit être stable — sinon chaque compilation en ajoute');
});

test('une ligne de provenance mal formée est écartée', () => {
  const corps = [
    TEXTE_D_ORIGINE,
    `- ${APK} — compilé depuis le commit ${NOUVEAU}.`, // sans accents graves
    `- \`${IPA}\` — compilé depuis le commit zzz.`, // commit qui n'en est pas un
    '- `orphelin.apk` — compilé depuis le commit .', // sans valeur
  ].join('\n');

  const { code, sortie } = executer(corps, APK, NOUVEAU);

  assert.equal(code, 0);
  assert.ok(!sortie.includes('zzz'), `un commit non hexadécimal a été relu :\n${sortie}`);
  assert.ok(!sortie.includes('orphelin'), `une ligne vide a été relue :\n${sortie}`);
  assert.deepEqual(lignes(sortie), [`- \`${APK}\` — compilé depuis le commit \`${NOUVEAU}\`.`]);
});

test('le texte ne contient que des lignes de provenance relisibles', () => {
  const apresLesDeux = executer(
    executer(TEXTE_D_ORIGINE, IPA, NOUVEAU).sortie,
    APK,
    NOUVEAU,
  ).sortie;

  // Ce qui garantit la stabilité dans le temps : tout ce que le script écrit
  // doit être exactement ce qu'il sait relire au dépôt suivant.
  for (const ligne of lignes(apresLesDeux)) {
    assert.match(ligne, /^- `[^`]+` — compilé depuis le commit `[0-9a-f]{7,40}`\.$/);
  }
});

test('les lignes sont rangées par nom, quelle que soit la date de dépôt', () => {
  // Le seul cas où le tri est **porteur** : le texte porte déjà la ligne de
  // l'IPA, et on y ajoute l'APK. Sans tri, la page suivrait l'ordre des dépôts
  // et changerait d'aspect d'une compilation à l'autre. Mesuré : retirer le
  // tri laissait tout le banc vert — le tri n'était donc exercé nulle part.
  const avecIpa = executer(TEXTE_D_ORIGINE, IPA, NOUVEAU).sortie;
  const avecLesDeux = executer(avecIpa, APK, NOUVEAU).sortie;

  assert.deepEqual(lignes(avecLesDeux), [
    `- \`${APK}\` — compilé depuis le commit \`${NOUVEAU}\`.`,
    `- \`${IPA}\` — compilé depuis le commit \`${NOUVEAU}\`.`,
  ]);
});

test('un nom de fichier qui casserait la ligne est refusé', () => {
  for (const mauvais of ['fichier`avec-accent-grave.apk', 'fichier\navec-retour.ipa', '']) {
    const { code, sortie, erreur } = executer('', mauvais, NOUVEAU);

    assert.equal(code, 1, `attendu un refus pour ${JSON.stringify(mauvais)}`);
    assert.equal(sortie, '', 'un refus ne doit rien écrire sur la sortie');
    assert.match(erreur, /::error::nom de fichier inattendu/);
  }
});

test('un commit qui n’en est pas un est refusé', () => {
  // Le dernier cas n'est pas une chaîne vide mais l'argument **absent** : le
  // flux pourrait un jour oublier de le passer, et le script doit alors refuser
  // d'écrire une provenance plutôt que d'écrire `undefined` sur la page.
  for (const mauvais of ['', 'e49297', 'E49297D2C1B4A8F0', 'pas-un-commit', undefined]) {
    const { code, sortie, erreur } =
      mauvais === undefined ? executer('', APK) : executer('', APK, mauvais);

    assert.equal(code, 1, `attendu un refus pour ${JSON.stringify(mauvais)}`);
    assert.equal(sortie, '', 'un refus ne doit rien écrire sur la sortie');
    assert.match(erreur, /::error::commit inattendu/);
  }
});
