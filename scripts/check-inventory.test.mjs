/**
 * Vérifie que rien dans `scripts/` n'échappe à l'exécution, et que le README
 * décrit exactement ce qui s'y trouve.
 *
 * POURQUOI CE FICHIER
 * -------------------
 * Deux défauts silencieux de la même famille, tous deux mesurés.
 *
 * **Un banc qui existe et ne tourne pas.** `npm run test` lance
 * `node … --test` **sans chemin** : Node découvre alors les fichiers de test
 * par leur **nom**, selon une liste de motifs figée. Un fichier qui importe
 * `node:test` mais dont le nom n'entre dans aucun de ces motifs n'est jamais
 * exécuté — et rien ne le dit. `npm run test` sort en succès, avec un test de
 * moins, indéfiniment. C'est la forme la plus discrète du garde-fou qui n'existe
 * pas : il est écrit, il est versionné, il est lu par le prochain mainteneur, et
 * il ne mesure rien.
 *
 * Les motifs ne sont pas recopiés de la documentation : ils ont été **éprouvés**,
 * un fichier sonde déposé dans `scripts/` sous cinq noms, contenant un test qui
 * échoue toujours, et le total de tests relevé après chaque dépôt.
 *
 *     zz-sonde.mjs        170 tests  → non découvert
 *     zz-sonde-non.mjs    170 tests  → non découvert
 *     zz-sonde.spec.mjs   170 tests  → non découvert
 *     zz-sonde-test.mjs   171 tests  → découvert
 *     zz-sonde.test.mjs   171 tests  → découvert
 *
 * `.spec.mjs` — le nom qu'un développeur venu de Jest écrit sans y penser — passe
 * donc **inaperçu**. Et la sonde a d'abord été nommée `zz-sonde-non-test.mjs`,
 * qui a été **découverte** : elle finit par `-test.mjs`, ce que son nom semblait
 * précisément nier. Le contrôle retient donc une seule forme, `*.test.mjs`, qui
 * est celle du dépôt — pas la plus large que Node accepterait.
 *
 * **Un document qui décrit un dépôt qui a changé.** Le `README.md` nomme ses
 * bancs à deux endroits — l'arborescence du §5 et la liste du §9 — et le §9
 * ouvre sur « Quinze fichiers de test, et rien d'autre », une affirmation
 * d'**exhaustivité**. Rien ne la reliait au disque. Un banc ajouté sans ligne
 * dans le README, ou une ligne restée après un renommage, passait sans bruit —
 * et c'est arrivé : `register-alias.mjs`, le fichier sans lequel aucun test ne
 * s'exécute, n'était décrit nulle part. Le contrôle tient les trois ensemble :
 * le disque, l'arborescence, la liste, et le mot qui les compte.
 *
 * CE QUE CE CONTRÔLE NE PEUT PAS VOIR
 * -----------------------------------
 * Il ne lit pas le nom d'un fichier qu'il n'a pas su reconnaître : un banc écrit
 * en JavaScript sous un nom découvert mais **en dehors** de `scripts/` lui
 * échappe, puisque le balayage part de `scripts/`. Et il ne juge pas le contenu
 * d'une ligne du README : une description fausse — « les contrastes de la
 * palette » sous un banc qui vérifie autre chose — passe. Il tient
 * l'**existence** et le **compte**, pas la justesse du texte.
 */

import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const RACINE = fileURLToPath(new URL('../', import.meta.url));
const DOSSIER = join(RACINE, 'scripts');
const README = join(RACINE, 'README.md');

/**
 * Le source **sans ses commentaires**.
 *
 * `alias-loader.mjs` et `stubs/expo-secure-store.mjs` nomment `node:test` quatre
 * fois, uniquement dans leurs commentaires — le nettoyage paraît donc porteur.
 * Il ne l'est **pas** : ces quatre mentions écrivent `` `node:test` `` entre
 * accents graves, jamais `from 'node:test'`, que ce contrôle cherche. Mesuré :
 * désactiver ce nettoyage sur le dépôt tel quel ne fait tomber **aucun** test.
 *
 * Il est là pour ce qui viendrait, et la mesure a été faite dans les deux sens,
 * avec un commentaire-sonde `// import test from 'node:test';` déposé en tête
 * d'`alias-loader.mjs` : nettoyage actif, le banc reste vert ; nettoyage
 * désactivé, le premier test tombe. Sans ce nettoyage, la première phrase qu'un
 * mainteneur écrirait pour expliquer un fichier le ferait passer pour un banc.
 */
function sansCommentaires(texte) {
  // La variante `(^|[^:])` est celle des autres bancs : sans elle, le `//` d'une
  // adresse (`https://…`) serait pris pour un commentaire.
  return texte.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
}

/** Les fichiers de `scripts/`, par nom, et le contenu de chacun. */
function fichiersDeScripts() {
  const entrees = new Map();

  for (const nom of readdirSync(DOSSIER)) {
    if (nom.endsWith('.mjs')) {
      entrees.set(nom, readFileSync(join(DOSSIER, nom), 'utf8'));
    }
  }

  return entrees;
}

/** Les doublures, dans leur sous-dossier. */
function doublures() {
  return readdirSync(join(DOSSIER, 'stubs')).filter((nom) => nom.endsWith('.mjs'));
}

/** Le texte du README, entre le titre du §5 et la fin de son bloc de code. */
function arborescence(texte) {
  const debut = texte.indexOf('## 5. Structure du projet');
  assert.ok(debut !== -1, 'le README doit porter une section « 5. Structure du projet »');

  const bloc = /```\n([\s\S]*?)```/.exec(texte.slice(debut));
  assert.ok(bloc !== null, 'la section 5 doit contenir un bloc de code');

  const lignes = bloc[1].split('\n');
  const ouverture = lignes.findIndex((ligne) => ligne.includes('├── scripts/'));
  assert.ok(ouverture !== -1, 'le bloc doit décrire `scripts/`');

  const fermeture = lignes.findIndex(
    (ligne, rang) => rang > ouverture && ligne.includes('└── .github/'),
  );
  assert.ok(fermeture !== -1, 'la description de `scripts/` doit se terminer avant `.github/`');

  return lignes
    .slice(ouverture + 1, fermeture)
    .map((ligne) => /[├└]── (\S+)/.exec(ligne))
    .filter((trouve) => trouve !== null)
    .map(([, nom]) => nom);
}

/**
 * Le texte de la puce du §9 qui annonce le nombre de fichiers de test.
 *
 * L'ancre est le **motif** de l'annonce, jamais le mot qu'elle porte : écrire ici
 * « Quinze » ferait du contrôle une copie de ce qu'il vérifie, et le jour où le
 * compte change, il tomberait sur son ancre au lieu de tomber sur le décompte.
 * Mesuré — c'est arrivé au premier essai.
 */
function listeDesBancs(texte) {
  const annonce = /- \*\*([A-Za-zé-]+) fichiers de test/.exec(texte);
  assert.ok(annonce !== null, 'le README doit annoncer ses fichiers de test dans la section 9');

  const debut = annonce.index;
  const fin = texte.indexOf('\n- ', debut + 1);
  const puce = texte.slice(debut, fin === -1 ? undefined : fin);

  // La puce nomme ses bancs **sans** l'extension (`check-dates`), et les
  // rementionne au fil de la prose qui suit la liste — d'où le dédoublonnage.
  const noms = [...new Set([...puce.matchAll(/`(check-[a-z-]+)`/g)].map(([, nom]) => nom))];

  return { noms, mot: annonce[1] };
}

/**
 * Le mot français du nombre, pour les valeurs plausibles.
 *
 * Une table plutôt qu'une conversion : le README écrit « Quinze », et un contrôle
 * qui saurait compter jusqu'à vingt pour une phrase qui n'en aura jamais besoin
 * serait du code sans lecteur. Si le dépôt dépasse un jour ce qu'elle couvre, le
 * contrôle tombe et demande de l'étendre — ce qui est la bonne façon de poser la
 * question.
 */
const MOTS = new Map([
  [10, 'Dix'],
  [11, 'Onze'],
  [12, 'Douze'],
  [13, 'Treize'],
  [14, 'Quatorze'],
  [15, 'Quinze'],
  [16, 'Seize'],
  [17, 'Dix-sept'],
  [18, 'Dix-huit'],
  [19, 'Dix-neuf'],
  [20, 'Vingt'],
  [21, 'Vingt-et-un'],
  [22, 'Vingt-deux'],
  [23, 'Vingt-trois'],
  [24, 'Vingt-quatre'],
  [25, 'Vingt-cinq'],
  [26, 'Vingt-six'],
]);

test('tout fichier qui importe `node:test` est nommé pour être découvert', () => {
  const fautifs = [];

  for (const [nom, source] of fichiersDeScripts()) {
    if (!sansCommentaires(source).includes("from 'node:test'")) {
      continue;
    }
    if (!nom.endsWith('.test.mjs')) {
      fautifs.push(nom);
    }
  }

  assert.deepEqual(
    fautifs,
    [],
    `le lanceur ne découvre que « *.test.mjs » : ce fichier ne serait jamais exécuté — ${fautifs.join(', ')}`,
  );
});

test('aucun script de `scripts/` n’est un script que rien n’exécute', () => {
  const paquet = readFileSync(join(RACINE, 'package.json'), 'utf8');
  const entrees = fichiersDeScripts();

  const orphelins = [];
  for (const nom of entrees.keys()) {
    if (nom.endsWith('.test.mjs')) {
      // Découvert par le lanceur, dont le nom suffit : rien à exiger de plus.
      continue;
    }
    const citeAilleurs = [...entrees].some(
      ([autre, texte]) => autre !== nom && sansCommentaires(texte).includes(nom),
    );
    if (!paquet.includes(nom) && !citeAilleurs) {
      orphelins.push(nom);
    }
  }

  assert.deepEqual(orphelins, [], `rien ne lance ni n’importe ce script : ${orphelins.join(', ')}`);
});

test('aucune doublure n’est posée sans être branchée', () => {
  const chargeur = sansCommentaires(readFileSync(join(DOSSIER, 'alias-loader.mjs'), 'utf8'));

  const debranchees = doublures().filter((nom) => !chargeur.includes(nom));

  assert.deepEqual(
    debranchees,
    [],
    `cette doublure existe mais n’est nommée par aucun remplacement : ${debranchees.join(', ')}`,
  );
});

test('l’arborescence décrit chaque fichier de `scripts/`, et rien de plus', () => {
  const decrits = arborescence(readFileSync(README, 'utf8')).filter(
    (nom) => !nom.endsWith('/') && nom !== 'stubs/',
  );
  const reels = [...fichiersDeScripts().keys()];

  const manquants = reels.filter((nom) => !decrits.includes(nom));
  const fantomes = decrits.filter((nom) => !reels.includes(nom));

  assert.deepEqual(manquants, [], `absent de l’arborescence du §5 : ${manquants.join(', ')}`);
  assert.deepEqual(fantomes, [], `décrit mais inexistant : ${fantomes.join(', ')}`);
});

test('la liste du §9 nomme les mêmes bancs, et le mot annoncé les compte', () => {
  // Le disque donne des noms de fichiers, la puce des noms de bancs.
  const reels = [...fichiersDeScripts().keys()]
    .filter((nom) => nom.endsWith('.test.mjs'))
    .map((nom) => nom.slice(0, -'.test.mjs'.length));
  const { noms, mot } = listeDesBancs(readFileSync(README, 'utf8'));

  const manquants = reels.filter((nom) => !noms.includes(nom));
  const fantomes = noms.filter((nom) => !reels.includes(nom));

  assert.deepEqual(manquants, [], `absent de la liste du §9 : ${manquants.join(', ')}`);
  assert.deepEqual(fantomes, [], `nommé au §9 mais inexistant : ${fantomes.join(', ')}`);

  const attendu = MOTS.get(reels.length);
  assert.ok(
    attendu !== undefined,
    `le nombre de bancs (${reels.length}) sort de la table des mots — l’étendre`,
  );
  assert.equal(mot, attendu, `le §9 annonce « ${mot} », il y en a ${reels.length}`);
});
