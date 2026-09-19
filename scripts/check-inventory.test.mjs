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
 * ouvre sur une phrase qui les **compte** (« … fichiers de test, et rien
 * d'autre ») : une affirmation d'**exhaustivité** que rien ne reliait au disque.
 * Un banc ajouté sans ligne dans le README, ou une ligne restée après un
 * renommage, passait sans bruit — et c'est arrivé : `register-alias.mjs`, le
 * fichier sans lequel aucun test ne s'exécute, n'était décrit nulle part. Le
 * contrôle tient les trois ensemble : le disque, l'arborescence, la liste, et le
 * mot qui les compte.
 *
 * Le nombre n'est **pas recopié ici**, pas même pour mémoire. Il l'a été, et il
 * a menti deux fois : la phrase que citait ce commentaire portait un compte que
 * le §9 avait déjà dépassé. Citer un décompte dans le commentaire d'un contrôle
 * qui vérifie ce décompte, c'est ajouter une copie à la liste de celles qu'il
 * faudra corriger.
 *
 * **Le même défaut dans le second document.** `MISE-EN-SERVICE.md` annonçait
 * « **25 fichiers de test**, 224 tests » alors que le disque en portait 27 —
 * deux dérives successives, invisibles pour la même raison : le contrôle ne
 * lisait que le README, et le guide n'était lu par aucun banc. Le nombre de
 * **fichiers** est désormais tenu ici. Le nombre de **tests** a été retiré de la
 * phrase au lieu d'être gardé : depuis l'intérieur de la suite, rien ne peut
 * dire combien de tests elle contient — un garde-fou qui ne peut pas mesurer ce
 * qu'il annonce n'est pas un garde-fou.
 *
 * CE QUE CE CONTRÔLE NE PEUT PAS VOIR
 * -----------------------------------
 * Il ne lit pas le nom d'un fichier qu'il n'a pas su reconnaître : un banc écrit
 * en JavaScript sous un nom découvert mais **en dehors** de `scripts/` lui
 * échappe, puisque le balayage part de `scripts/`. Et il ne juge pas le contenu
 * d'une ligne du README : une description fausse — « les contrastes de la
 * palette » sous un banc qui vérifie autre chose — passe. Il tient
 * l'**existence** et le **compte**, pas la justesse du texte.
 *
 * Il ne compte que les fichiers, jamais les tests : c'est une limite de
 * principe, pas un oubli. Et il ne voit pas un **troisième** document qui
 * reprendrait le même décompte — le jour où il en apparaît un, c'est ici qu'il
 * faut l'ajouter, et la phrase du guide n'est pas un filet.
 */

import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
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
 * le mot attendu ferait du contrôle une copie de ce qu'il vérifie, et le jour où
 * le compte change, il tomberait sur son ancre au lieu de tomber sur le décompte.
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
 * Une table plutôt qu'une conversion : le README écrit le nombre en toutes
 * lettres, et un contrôle qui saurait compter jusqu'à vingt pour une phrase qui
 * n'en aura jamais besoin serait du code sans lecteur. Si le dépôt dépasse un
 * jour ce qu'elle couvre, le contrôle tombe et demande de l'étendre — ce qui est
 * la bonne façon de poser la question.
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
  [27, 'Vingt-sept'],
  [28, 'Vingt-huit'],
  [29, 'Vingt-neuf'],
  [30, 'Trente'],
  [31, 'Trente-et-un'],
  [32, 'Trente-deux'],
  [33, 'Trente-trois'],
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

test('chaque banc se nomme de façon à être vu par la liste du §9', () => {
  // La liste du §9 est extraite par un motif qui ne reconnaît que `check-…`.
  // Un banc nommé autrement n'est donc pas vu **manquant** : il est vu
  // inexistant, et le contrôle tombe sur « nommé au §9 mais inexistant » — un
  // message qui envoie chercher le défaut au mauvais endroit, et qu'aucune
  // correction de la liste ne ferait taire, puisque l'y ajouter ne changerait
  // rien. Mesuré en écrivant le banc de `provenance-release.mjs`, dont le
  // script — lui — n'a pas à porter ce préfixe.
  const malNommes = [...fichiersDeScripts().keys()]
    .filter((nom) => nom.endsWith('.test.mjs'))
    .filter((nom) => !nom.startsWith('check-'));

  assert.deepEqual(
    malNommes,
    [],
    `le §9 du README est lu par un motif qui ne reconnaît que « check-… » : ` +
      `ce banc y serait invisible, et le §9 demanderait de l'y ajouter sans effet — ${malNommes.join(', ')}`,
  );
});

/**
 * Les renvois d'un document vers la **section** d'un autre : « `X.md`, section
 * « Titre » ».
 *
 * Deux précautions, toutes deux mesurées.
 *
 * Le mot « section » est exigé : sans lui, la phrase « `README.md`,
 * `supabase/README.md`, et les entrées « Redirect URLs » du tableau de bord »
 * serait prise pour un renvoi vers une section nommée « Redirect URLs ».
 *
 * Et l'on ne retient que la suite **immédiate** des guillemets — « A », puis
 * « et « B » » ou « , « B » » — en s'arrêtant au premier qui ne suit pas. Lire
 * jusqu'à la fin du paragraphe ramassait huit fausses sections d'un coup, dont
 * « ~ », « ^ » et « traité » : le paragraphe qui cite `SECURITY.md` continue
 * ensuite sur d'autres citations, sans rapport avec le renvoi.
 *
 * Le texte reçu est **déjà normalisé** — ses retours à la ligne sont devenus des
 * espaces. Sans cela, un renvoi que Prettier coupe sur deux lignes ne serait plus
 * reconnu, et le contrôle deviendrait muet au lieu de tomber : c'est la leçon des
 * continuations de ligne d'un fichier YAML, ici en Markdown.
 */
function renvoisVersUneSection(document, texte) {
  const renvois = [];
  const ouverture = /`([\w./-]+\.md)`[^.\n]{0,40}?sections?\s*«/g;

  for (const nomme of texte.matchAll(ouverture)) {
    const cible = nomme[1];
    let reste = texte.slice(nomme.index + nomme[0].length);

    for (;;) {
      const titre = /^([^»]+) »/.exec(reste);
      if (titre === null) {
        break;
      }

      renvois.push({ document, cible, cite: titre[1] });
      reste = reste.slice(titre[0].length);

      const suivant = /^\s*(?:et|,)\s*«\s*/.exec(reste);
      if (suivant === null) {
        break;
      }
      reste = reste.slice(suivant[0].length);
    }
  }

  return renvois;
}

/** Les titres d'un document, espaces normalisés : un titre cité peut être coupé sur deux lignes. */
function titresDe(texte) {
  return texte
    .split('\n')
    .filter((ligne) => /^#{1,6}\s/.test(ligne))
    .map((ligne) => normaliser(ligne.replace(/^#{1,6}\s/, '')));
}

function normaliser(texte) {
  return texte.replace(/\s+/g, ' ').trim();
}

/** Les documents du dépôt : la racine, et ceux de `supabase/`. */
function documentsDuDepot() {
  return [
    ...readdirSync(RACINE).filter((nom) => nom.endsWith('.md')),
    ...readdirSync(join(RACINE, 'supabase'))
      .filter((nom) => nom.endsWith('.md'))
      .map((nom) => `supabase/${nom}`),
  ];
}

test('un renvoi vers une section nommée désigne un titre qui existe', () => {
  // Un renvoi est une **adresse**, et une adresse peut être fausse. Celui-ci l'a
  // été : le guide faisait coller la promotion du premier administrateur depuis
  // « `supabase/README.md`, section « Premier administrateur » », et cette section
  // n'existe pas — elle s'appelle « Après l'installation ». Le lecteur cherchait un
  // titre absent, à l'endroit exact où il avait besoin de la commande.
  //
  // C'est la même famille que les cinq vérités recopiées : une affirmation qu'on
  // peut relire, mais que personne ne relisait. La différence est qu'ici la copie
  // est un **nom de section**, donc sa vérité est mécanique — un titre existe ou
  // n'existe pas.
  //
  // Le titre cité peut être un **préfixe** du vrai : `README.md` cite « Ce que
  // `authenticated` signifie » pour « Ce que `authenticated` signifie, et ne
  // signifie pas ». C'est la seule tolérance, et elle reste vérifiante.
  const fautifs = [];
  let renvois = 0;

  for (const document of documentsDuDepot()) {
    for (const { cible, cite } of renvoisVersUneSection(
      document,
      normaliser(readFileSync(join(RACINE, document), 'utf8')),
    )) {
      renvois += 1;

      if (!existsSync(join(RACINE, cible))) {
        fautifs.push(`${document} renvoie vers \`${cible}\`, qui n'existe pas`);
        continue;
      }

      const titres = titresDe(readFileSync(join(RACINE, cible), 'utf8'));
      if (!titres.some((titre) => titre.startsWith(normaliser(cite)))) {
        fautifs.push(`${document} renvoie vers « ${cite} » dans \`${cible}\`, sans ce titre`);
      }
    }
  }

  // Le nombre est un **plancher**, pas un décompte : il existe pour qu'un motif
  // qui ne trouve plus rien fasse tomber le test au lieu de le laisser vert sur
  // zéro renvoi. Il ne dit pas combien de renvois le dépôt contient.
  assert.ok(
    renvois >= 3,
    `renvois lus : ${renvois} — le motif ne reconnaît plus les renvois, et ce test ne mesurerait rien`,
  );

  assert.deepEqual(
    fautifs,
    [],
    `des renvois désignent un titre qui n'existe pas :\n  ${fautifs.join('\n  ')}`,
  );
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

test('le guide de mise en service annonce le nombre de bancs qui existe', () => {
  // Le guide compte en chiffres, le README en lettres : deux formes pour la même
  // vérité, donc deux ancres. L'ancre reste le **motif** de l'annonce, jamais la
  // valeur — sinon le contrôle tomberait sur sa propre copie le jour du changement.
  const annonce = /\*\*(\d+) fichiers de test\*\*/.exec(
    readFileSync(join(RACINE, 'MISE-EN-SERVICE.md'), 'utf8'),
  );
  assert.ok(annonce !== null, 'le guide doit annoncer son nombre de fichiers de test');

  const reels = [...fichiersDeScripts().keys()].filter((nom) => nom.endsWith('.test.mjs'));

  assert.equal(
    Number(annonce[1]),
    reels.length,
    `le guide annonce ${annonce[1]} fichiers de test, il y en a ${reels.length}`,
  );
});
