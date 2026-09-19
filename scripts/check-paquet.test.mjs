/**
 * Banc de `scripts/check-paquet.mjs` — le contrôle de contenu d'un paquet iOS.
 *
 * POURQUOI CE BANC EXISTE
 * -----------------------
 * Ce contrôle a été écrit **quatre fois de travers**, et les quatre fois de la
 * même façon : il cherchait dans le paquet quelque chose que le code source
 * contient déjà, ou que le format du bundle fabrique. Les trois premières
 * versions ont refusé un paquet sain sur un exécuteur ; la quatrième a été
 * arrêtée en local, par la mesure, avant de coûter un cycle de vingt minutes.
 *
 * Aucune de ces erreurs n'était visible par un test de forme, ni par
 * `npm run verify` : le script s'exécutait, sortait en succès, et mesurait sa
 * propre prose. C'est le genre de défaut qu'un banc doit attraper, et il ne
 * peut l'attraper qu'en **exerçant les deux directions** : un paquet fautif
 * doit faire tomber le contrôle, et un paquet sain — celui dont le source nomme
 * les clefs secrètes et dont les chaînes voisines ressemblent à une clef — doit
 * le laisser vert.
 *
 * Les cas négatifs sont tous écrits à partir du même paquet sain, auquel on
 * ajoute **un seul** défaut : un refus qui viendrait d'ailleurs ne dirait rien
 * du défaut visé.
 *
 * LES DEUX TÉMOINS SONT DES MESURES, PAS DES SUPPOSITIONS
 * -------------------------------------------------------
 * `ADJACENCE` et la chaîne `storedError` de `PROSE` ont été **relevées sur un
 * vrai bundle Hermes**, produit par `expo export --platform ios`. Dans une
 * table de chaînes Hermes, les chaînes sont collées bout à bout, sans
 * séparateur : la sentinelle de l'URL y était suivie de
 * `FAULT_HEADERS_RECEIVEDOMException…`, et la chaîne `sb_secret_` y était
 * suivie de `storedError`, soit onze caractères de clef. Un motif gourmand
 * fabrique donc une fausse clef à partir de deux chaînes voisines — c'est ce
 * que le premier cas interdit de réintroduire.
 */

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { crc32, deflateRawSync } from 'node:zlib';

const SCRIPT = fileURLToPath(new URL('./check-paquet.mjs', import.meta.url));

// Nommée `ADRESSE` et non `URL` : une constante `URL` masquerait le global
// `URL`, dont `new URL(...)` a besoin **plus haut** dans ce fichier — la zone
// morte temporelle ferait alors échouer le chargement du banc, avant tout test.
const ADRESSE = 'https://exemple.supabase.co';

/** Une clef publique bien formée : préfixe, puis un corps de trente-deux. */
const CLEF_PUBLIQUE = 'sb_publishable_AAAABBBBCCCCDDDDEEEEFFFFGGGGHHHH';

/** Une clef secrète bien formée — celle dont la présence serait une fuite. */
const CLEF_SECRETE = 'sb_secret_ZZZZYYYYXXXXWWWWVVVVUUUUTTTTSSSS';

/**
 * Les octets qui suivaient réellement la sentinelle dans un bundle Hermes.
 *
 * Ils sont tous des caractères de clef, donc un motif gourmand les avale et
 * fabrique une « clef » qui n'existe pas.
 */
const ADJACENCE = 'FAULT_HEADERS_RECEIVEDOMExceptionPanResponder';

/**
 * La prose du source, telle qu'elle se retrouve dans le bundle.
 *
 * Les trois premières formes sont reprises de `src/config/env.ts`, où elles
 * existent réellement. La quatrième reproduit la mesure : la chaîne
 * `sb_secret_` y est suivie de `storedError`, la chaîne voisine de la table.
 */
const PROSE = [
  'sb_secret_…',
  'sb_publishable_…',
  "'sb_secret_'storedError",
  '"role":"service_role"',
].join(' ');

/**
 * Un jeton à trois segments, dont la charge utile porte `role`.
 *
 * Construit plutôt que recopié : un jeton figé dans ce fichier serait une
 * chaîne de caractères qu'un balayage de secrets signalerait un jour, et il
 * faudrait alors expliquer qu'il est faux. Le fabriquer dit qu'il est faux.
 */
function jeton(role) {
  const entete = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const charge = Buffer.from(JSON.stringify({ iss: 'supabase', role })).toString('base64url');
  return `${entete}.${charge}.${'A'.repeat(32)}`;
}

/**
 * Écrit un paquet dans un dossier temporaire et lance le contrôle dessus.
 *
 * `bundle` est une chaîne — un bundle iOS — ou un `Buffer` — une archive APK.
 * Le nom du fichier est passé à part, parce que le contrôle ne décide de rien
 * d'après lui : il regarde la **signature** du contenu. Le nommer autrement fait
 * donc partie de ce qui est éprouvé.
 *
 * Une variable à `null` est **absente** de l'environnement du processus fils,
 * et non posée à vide : sur Windows, une variable vide n'est pas transmise, et
 * le cas « variable manquante » ne mesurerait alors rien.
 */
function eprouver({ bundle, url = ADRESSE, clef = CLEF_PUBLIQUE, nom = 'main.jsbundle' }) {
  const dossier = mkdtempSync(join(tmpdir(), 'fcpe-paquet-'));

  try {
    const chemin = join(dossier, nom);
    if (typeof bundle === 'string') {
      writeFileSync(chemin, bundle, 'latin1');
    } else {
      writeFileSync(chemin, bundle);
    }

    const env = { ...process.env };
    delete env.EXPO_PUBLIC_SUPABASE_URL;
    delete env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
    if (url !== null) {
      env.EXPO_PUBLIC_SUPABASE_URL = url;
    }
    if (clef !== null) {
      env.EXPO_PUBLIC_SUPABASE_ANON_KEY = clef;
    }

    const resultat = spawnSync(process.execPath, [SCRIPT, chemin], { encoding: 'utf8', env });

    return { code: resultat.status, sortie: `${resultat.stdout}${resultat.stderr}` };
  } finally {
    rmSync(dossier, { recursive: true, force: true });
  }
}

/**
 * Le bundle sain : la configuration intégrée, la prose du source, et la clef
 * **collée à la chaîne suivante** comme dans un vrai bundle Hermes.
 */
const PAQUET_SAIN = `var u="${ADRESSE}";var k="${CLEF_PUBLIQUE}${ADJACENCE}";/* ${PROSE} */`;

test('un paquet sain passe, chaînes voisines comprises', () => {
  const { code, sortie } = eprouver({ bundle: PAQUET_SAIN });

  // Le témoin : c'est ce bundle qui a fait refuser le paquet au premier essai,
  // et c'est son collage de chaînes qui aurait fait refuser le quatrième.
  assert.equal(code, 0, sortie);
  assert.match(sortie, /0 défaut\(s\)/);
  assert.doesNotMatch(sortie, /clef-attendue-non-publique/);
  assert.doesNotMatch(sortie, /jeton-de-service/);
});

test('une clef héritée « anon » est acceptée, et décodée pour de bon', () => {
  // L'autre direction du décodage des jetons : il doit rester muet sur un rôle
  // légitime. Sans ce cas, un décodage cassé qui renverrait toujours
  // `service_role` passerait pour un contrôle strict.
  const clef = jeton('anon');
  const { code, sortie } = eprouver({ bundle: `var u="${ADRESSE}";var k="${clef}"`, clef });

  assert.equal(code, 0, sortie);
  assert.match(sortie, /rôle « anon »/);
});

test('un jeton « service_role » dans le paquet fait tomber le contrôle', () => {
  const { code, sortie } = eprouver({ bundle: `${PAQUET_SAIN}var s="${jeton('service_role')}";` });

  assert.equal(code, 1);
  assert.match(sortie, /\[jeton-de-service\]/);
  assert.match(sortie, /rôle « service_role »/);
});

test('une clef secrète donnée comme clef publique fait tomber le contrôle', () => {
  // Le risque réel : un copier-coller depuis la mauvaise ligne du tableau de
  // bord. La variable est exactement celle que le paquet embarque.
  const { code, sortie } = eprouver({ bundle: PAQUET_SAIN, clef: CLEF_SECRETE });

  assert.equal(code, 1);
  assert.match(sortie, /\[clef-attendue-non-publique\]/);
  assert.match(sortie, /clef secrète/);

  // Un contrôle qui imprime la clef qu'il dénonce écrit un secret dans un
  // journal public. La description s'arrête au préfixe et à la longueur.
  assert.ok(!sortie.includes(CLEF_SECRETE), 'la clef ne doit jamais être recopiée');
  assert.match(sortie, /sb_secret_… \(\d+ caractères\)/);
});

test('un jeton « service_role » donné comme clef publique fait tomber le contrôle', () => {
  const clef = jeton('service_role');
  const { code, sortie } = eprouver({ bundle: `var u="${ADRESSE}";var k="${clef}"`, clef });

  assert.equal(code, 1);
  assert.match(sortie, /\[clef-attendue-non-publique\]/);
});

test('une clef attendue absente du bundle fait tomber le contrôle', () => {
  const { code, sortie } = eprouver({ bundle: `var u="${ADRESSE}";/* ${PROSE} */` });

  assert.equal(code, 1);
  assert.match(sortie, /\[clef-publique-absente\]/);
});

test('une URL absente du bundle fait tomber le contrôle', () => {
  const { code, sortie } = eprouver({ bundle: `var k="${CLEF_PUBLIQUE}"` });

  assert.equal(code, 1);
  assert.match(sortie, /\[url-absente\]/);
});

test('une variable vide est refusée, au lieu de rendre le contrôle muet', () => {
  // Une recherche de chaîne vide réussit toujours : sans ce refus, le contrôle
  // serait vert sans avoir rien comparé — le pire des états.
  const { code, sortie } = eprouver({ bundle: PAQUET_SAIN, clef: null });

  assert.equal(code, 1);
  assert.match(sortie, /\[variable-clef-vide\]/);
});

/**
 * Construit une archive ZIP valide : en-têtes locaux, répertoire central, fin
 * d'archive.
 *
 * Le contrôle ne lit que les **en-têtes locaux**, mais ce que ce banc doit
 * construire est ce qu'un vrai paquet contient. Une archive privée de son
 * répertoire central serait lue par ce contrôle et refusée par tous les autres
 * outils : le banc mesurerait alors un format qui n'existe pas. L'archive est
 * écrite en méthode 8 — déflatée —, comme un APK réel.
 *
 * Ce que ce constructeur ne peut pas garantir, et qui a donc été mesuré
 * autrement : que le contrôle lise un **vrai** APK. Il l'a fait — le binaire
 * publié en `v0.1.0`, 80 998 248 octets, a rendu « 6 vérification(s),
 * 0 défaut(s) », la clef de 46 caractères retrouvée. Un constructeur et un
 * extracteur écrits par la même main peuvent se tromper de la même façon ; cette
 * mesure-là ne le peut pas.
 *
 * @param {{ nom: string, contenu: string }[]} entrees les fichiers à ranger
 * @returns {Buffer} l'archive complète
 */
function archiveZip(entrees) {
  const locaux = [];
  const centraux = [];
  let position = 0;

  for (const { nom, contenu } of entrees) {
    const nomOctets = Buffer.from(nom, 'utf8');
    const clair = Buffer.from(contenu, 'latin1');
    const donnees = deflateRawSync(clair);
    const somme = crc32(clair);

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4); // version nécessaire pour déflater
    local.writeUInt16LE(0, 6); // drapeaux
    local.writeUInt16LE(8, 8); // méthode : déflaté
    local.writeUInt16LE(0, 10); // heure
    local.writeUInt16LE(0x21, 12); // date
    local.writeUInt32LE(somme, 14);
    local.writeUInt32LE(donnees.length, 18);
    local.writeUInt32LE(clair.length, 22);
    local.writeUInt16LE(nomOctets.length, 26);
    local.writeUInt16LE(0, 28); // champ supplémentaire

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0, 8);
    central.writeUInt16LE(8, 10);
    central.writeUInt16LE(0, 12);
    central.writeUInt16LE(0x21, 14);
    central.writeUInt32LE(somme, 16);
    central.writeUInt32LE(donnees.length, 20);
    central.writeUInt32LE(clair.length, 24);
    central.writeUInt16LE(nomOctets.length, 28);
    central.writeUInt16LE(0, 30); // champ supplémentaire
    central.writeUInt16LE(0, 32); // commentaire
    central.writeUInt16LE(0, 34); // numéro de disque
    central.writeUInt16LE(0, 36); // attributs internes
    central.writeUInt32LE(0, 38); // attributs externes
    central.writeUInt32LE(position, 42); // où commence l'en-tête local

    locaux.push(local, nomOctets, donnees);
    centraux.push(central, nomOctets);
    position += local.length + nomOctets.length + donnees.length;
  }

  const tailleCentral = centraux.reduce((total, morceau) => total + morceau.length, 0);

  const fin = Buffer.alloc(22);
  fin.writeUInt32LE(0x06054b50, 0);
  fin.writeUInt16LE(0, 4); // numéro de disque
  fin.writeUInt16LE(0, 6); // disque du répertoire central
  fin.writeUInt16LE(entrees.length, 8);
  fin.writeUInt16LE(entrees.length, 10);
  fin.writeUInt32LE(tailleCentral, 12);
  fin.writeUInt32LE(position, 16); // où commence le répertoire central
  fin.writeUInt16LE(0, 20); // commentaire

  return Buffer.concat([...locaux, ...centraux, fin]);
}

test('un APK sain passe — le bundle est extrait de l’archive', () => {
  // Le format Android n'est pas celui d'iOS : le bundle est rangé dans une
  // archive, sous un nom fixé, et le contrôle doit l'y trouver. Ce cas éprouve
  // l'extraction elle-même.
  const archive = archiveZip([
    { nom: 'AndroidManifest.xml', contenu: 'manifeste factice' },
    { nom: 'assets/index.android.bundle', contenu: PAQUET_SAIN },
  ]);

  const { code, sortie } = eprouver({ bundle: archive, nom: 'paquet.apk' });

  assert.equal(code, 0, sortie);
  assert.match(sortie, /0 défaut\(s\)/);
});

test('un APK dont la configuration manque fait tomber le contrôle', () => {
  // Sans ce cas, un extracteur qui rendrait un contenu vide passerait pour un
  // extracteur qui fonctionne : la comparaison à vide réussit toujours.
  const archive = archiveZip([
    { nom: 'assets/index.android.bundle', contenu: `var k="${CLEF_PUBLIQUE}"` },
  ]);

  const { code, sortie } = eprouver({ bundle: archive, nom: 'paquet.apk' });

  assert.equal(code, 1);
  assert.match(sortie, /\[url-absente\]/);
});

test('une archive sans bundle Android est refusée, et le dit', () => {
  const archive = archiveZip([{ nom: 'AndroidManifest.xml', contenu: 'manifeste factice' }]);

  const { code, sortie } = eprouver({ bundle: archive, nom: 'paquet.apk' });

  assert.equal(code, 1);
  assert.match(sortie, /\[bundle-absent\]/);
  assert.match(sortie, /assets\/index\.android\.bundle/);
});

test('un fichier nommé `.apk` qui n’est pas une archive est lu pour ce qu’il est', () => {
  // La détection porte sur la **signature** du contenu, pas sur le nom. Un
  // bundle iOS affublé d'un nom d'APK doit passer, et non être refusé pour un
  // mauvais motif — c'est la même règle que le contrôle applique déjà aux
  // variables vides : refuser pour la bonne raison.
  const { code, sortie } = eprouver({ bundle: PAQUET_SAIN, nom: 'paquet.apk' });

  assert.equal(code, 0, sortie);
  assert.match(sortie, /0 défaut\(s\)/);
});
