/**
 * Vérifie les vignettes d'actualité, et le chemin du bandeau de l'école.
 *
 * POURQUOI CE FICHIER
 * -------------------
 * La maquette demande deux choses qui se ressemblent — une photographie sur la
 * carte d'une actualité, une photographie en tête de l'accueil —, et les deux
 * reposent sur le même mécanisme : le compartiment est **privé**, donc chaque
 * image demande une adresse **signée**, donc un aller-retour réseau.
 *
 * Ce mécanisme a un coût, et le coût se paie en **nombre d'appels**. Résoudre
 * l'adresse dans la carte ferait dix requêtes pour dix actualités, toutes au même
 * instant ; c'est pourquoi c'est l'écran qui signe, une fois pour sa liste, et
 * qui passe le résultat. La règle est écrite dans les commentaires de
 * `AnnonceCard` et de `photosDesAnnonces` — et un commentaire n'est pas une
 * protection. Ce fichier la tient.
 *
 * TROIS PROPRIÉTÉS, ET CE QU'ELLES COÛTENT SI ELLES TOMBENT
 * ---------------------------------------------------------
 *   1. **La carte ne signe rien.** `AnnonceCard` n'importe aucun service : sans
 *      cela, elle ne *peut pas* demander d'adresse, et le défaut des dix requêtes
 *      devient impossible par construction. C'est la propriété la plus forte des
 *      trois, et c'est pour cela qu'elle est écrite ainsi — interdire le moyen
 *      plutôt que surveiller l'acte.
 *   2. **Chaque carte reçoit sa photographie.** Un `<AnnonceCard>` sans
 *      `photoUrl` compile, s'affiche, et ne montre jamais la photographie qu'on
 *      vient de publier : l'écran a l'air de marcher, et la fonctionnalité est
 *      absente. C'est le défaut le plus probable des deux, et le plus silencieux.
 *   3. **Le chemin du bandeau est le même des deux côtés.** Il est écrit dans le
 *      code (`CHEMIN_BANDEAU`) et dans la politique du compartiment que le guide
 *      fait coller — deux dépôts qui ne peuvent pas se lire. Un écart d'une
 *      lettre ne casse ni la compilation ni l'exécution : il laisse simplement le
 *      bandeau dessiné à la place de la photographie. C'est exactement le genre
 *      de vérité recopiée que ce dépôt tient par un accord mesuré.
 *
 * LA TROISIÈME LIT LE GUIDE, ET C'EST DÉLIBÉRÉ
 * --------------------------------------------
 * `MISE-EN-SERVICE.md` n'est pas de la documentation décorative : c'est le seul
 * endroit où les politiques du compartiment sont **écrites**, puisque le schéma
 * `storage` n'existe pas dans les migrations. Le lire ici, c'est comparer le code
 * à l'instruction qui l'autorise — la même lecture que `check-rls-guards` fait
 * déjà pour les cinq politiques.
 *
 * CE QUE CE BANC NE PEUT PAS VOIR
 * --------------------------------
 * Qu'une photographie **s'affiche**. Ni que le compartiment soit réellement
 * privé, ni que la politique ait été collée dans le tableau de bord : tout cela
 * vit hors du dépôt, et `check-rls-guards` dit déjà où s'arrête ce qu'on peut
 * mesurer ici.
 *
 * ÉPROUVÉ DANS LES DEUX SENS, TROIS MUTATIONS
 * -------------------------------------------
 * Une par propriété, chacune écrit une seule occurrence et restaurée ensuite à
 * l'octet — vérifié par empreinte SHA-256 avant et après. Trois chutes, chacune
 * sur **son** test : (i) `AnnonceCard` importe `@/services/documents` ; (ii) un
 * écran rend `<AnnonceCard>` sans `photoUrl` ; (iii) le guide protège
 * `accueil/bandeau.jpeg` quand le code demande `accueil/bandeau.jpg`. Le témoin,
 * lui, s'éprouve séparément et dans les deux sens — un commentaire qui **nomme**
 * un service ne doit pas passer pour un import, et une carte correctement servie
 * ne doit pas être signalée.
 */

import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import ts from 'typescript';

const RACINE = fileURLToPath(new URL('../', import.meta.url));
const CARTE = join(RACINE, 'src', 'components', 'AnnonceCard.tsx');
const DOCUMENTS = join(RACINE, 'src', 'services', 'documents.ts');
const GUIDE = join(RACINE, 'MISE-EN-SERVICE.md');

function lire(chemin) {
  return readFileSync(chemin, 'utf8');
}

function fichiersSous(dossier, extension) {
  const base = join(RACINE, dossier);

  return readdirSync(base, { recursive: true })
    .filter((nom) => typeof nom === 'string' && nom.endsWith(extension))
    .map((nom) => join(base, nom));
}

const ECRANS = fichiersSous('src/screens', '.tsx');

/* -------------------------------------------------------------------------- *
 *  Les extracteurs
 *
 *  Ils sont écrits comme des fonctions pures — une source entre, un verdict
 *  sort — pour que le témoin puisse les exercer sur des sources écrites ici.
 *  Un extracteur qui ne trouve plus rien rendrait les tests suivants verts en ne
 *  mesurant rien : c'est le pire des états, et le témoin est là pour l'empêcher.
 * -------------------------------------------------------------------------- */

/** L'arbre d'un fichier TSX, lu depuis sa source. */
function arbre(source, nom = 'source.tsx') {
  return ts.createSourceFile(nom, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
}

/**
 * Les modules de service importés par une source.
 *
 * L'arbre, et non un motif : une phrase qui **nomme** `@/services/…` dans un
 * commentaire ne doit pas compter comme un import, et c'est précisément ce que
 * font les commentaires de `AnnonceCard`.
 */
function servicesImportes(source) {
  const trouves = [];

  for (const declaration of arbre(source).statements) {
    if (!ts.isImportDeclaration(declaration) || !ts.isStringLiteral(declaration.moduleSpecifier)) {
      continue;
    }

    const module = declaration.moduleSpecifier.text;

    if (module.startsWith('@/services/')) {
      trouves.push(module);
    }
  }

  return trouves;
}

/**
 * Les `<AnnonceCard>` d'une source qui ne reçoivent pas de `photoUrl`.
 *
 * Rendues par leur numéro de ligne, pour que le rapport dise **où** — un défaut
 * signalé sans son endroit oblige à relire le fichier entier.
 */
function cartesSansPhoto(source) {
  const fichier = arbre(source);
  const fautives = [];

  function visiter(noeud) {
    const estLaCarte =
      (ts.isJsxSelfClosingElement(noeud) || ts.isJsxOpeningElement(noeud)) &&
      noeud.tagName.getText(fichier) === 'AnnonceCard';

    if (estLaCarte) {
      const attributs = noeud.attributes.properties.filter((attribut) =>
        ts.isJsxAttribute(attribut),
      );
      const aPhoto = attributs.some((attribut) => attribut.name.getText(fichier) === 'photoUrl');

      if (!aPhoto) {
        fautives.push(fichier.getLineAndCharacterOfPosition(noeud.getStart(fichier)).line + 1);
      }
    }

    ts.forEachChild(noeud, visiter);
  }

  visiter(fichier);
  return fautives;
}

/** La valeur d'une constante de chaîne, lue dans une source. */
function constante(source, nom) {
  let valeur = null;

  for (const declaration of arbre(source).statements) {
    if (!ts.isVariableStatement(declaration)) {
      continue;
    }

    for (const declarateur of declaration.declarationList.declarations) {
      if (
        ts.isIdentifier(declarateur.name) &&
        declarateur.name.text === nom &&
        declarateur.initializer !== undefined &&
        ts.isStringLiteral(declarateur.initializer)
      ) {
        valeur = declarateur.initializer.text;
      }
    }
  }

  return valeur;
}

/**
 * Les chemins que la politique du compartiment désigne **en dur**.
 *
 * Le motif est celui de la ligne ajoutée à `MISE-EN-SERVICE.md` :
 * `storage.objects.name = 'accueil/bandeau.jpg'`. Il est cherché dans le guide
 * entier plutôt que dans un bloc délimité : c'est le seul endroit du dépôt où
 * cette écriture existe, et un délimiteur de bloc se périmerait au premier
 * remaniement du document.
 */
function cheminsEnDur(source) {
  return [...source.matchAll(/storage\.objects\.name\s*=\s*'([^']+)'/g)].map((trouve) => trouve[1]);
}

/* -------------------------------------------------------------------------- *
 *  Les tests
 * -------------------------------------------------------------------------- */

test('les extracteurs lisent bien le dépôt', () => {
  // Sans ce garde-fou, un chemin faux ou un dossier vidé rendrait les trois tests
  // suivants verts en ne lisant rien — le défaut aurait l'apparence d'une
  // protection, ce qui est pire que pas de protection du tout.
  assert.ok(ECRANS.length >= 4, `écrans lus : ${ECRANS.length}`);
  assert.ok(lire(CARTE).length > 500, 'la carte est vide ou introuvable');
  assert.ok(constante(lire(DOCUMENTS), 'CHEMIN_BANDEAU') !== null, '`CHEMIN_BANDEAU` introuvable');
});

test('la carte d’une actualité ne peut pas signer d’adresse', () => {
  // La propriété est portée par l'**import**, et non par l'appel : une carte qui
  // n'a pas le moyen de demander une adresse ne peut pas en demander une par
  // inadvertance. C'est plus fort qu'un contrôle d'appel, qui laisserait passer
  // le premier `documentUrl` écrit demain.
  assert.deepEqual(
    servicesImportes(lire(CARTE)),
    [],
    'la carte doit peindre l’adresse qu’on lui donne, jamais la demander : c’est l’écran ' +
      'qui signe, une fois pour sa liste — sinon dix actualités font dix requêtes',
  );
});

test('chaque carte rendue reçoit sa photographie', () => {
  // Une carte sans `photoUrl` compile, s'affiche, et n'affiche jamais la
  // photographie publiée. Le défaut est silencieux : l'écran a l'air de marcher.
  const fautifs = [];

  for (const chemin of ECRANS) {
    for (const ligne of cartesSansPhoto(lire(chemin))) {
      fautifs.push(`${relative(RACINE, chemin).replace(/\\/g, '/')}:${ligne}`);
    }
  }

  assert.deepEqual(
    fautifs,
    [],
    'ces cartes ne reçoivent pas `photoUrl` : elles afficheront l’illustration de leur ' +
      'catégorie même quand l’actualité a une photographie',
  );
});

test('le chemin du bandeau est le même dans le code et dans le guide', () => {
  // Deux dépôts, une seule vérité recopiée. Ce qui les tient ensemble est la
  // politique du compartiment, qui compare des chaînes au caractère près — et un
  // écart d'une lettre ne casse rien, ne lève rien, et laisse le bandeau dessiné
  // à la place de la photographie.
  const dansLeCode = constante(lire(DOCUMENTS), 'CHEMIN_BANDEAU');
  const dansLeGuide = cheminsEnDur(lire(GUIDE));

  assert.equal(
    dansLeGuide.length,
    1,
    `le guide doit désigner exactement un chemin en dur, il en désigne ${dansLeGuide.length} : ` +
      'c’est la ligne qui ouvre la photographie de l’école aux familles sans compte',
  );

  assert.equal(
    dansLeGuide[0],
    dansLeCode,
    `le guide protège « ${dansLeGuide[0]} » et le code demande « ${dansLeCode} » : la ` +
      'photographie déposée depuis le tableau de bord resterait invisible',
  );
});

/* -------------------------------------------------------------------------- *
 *  Le témoin
 *
 *  Sans lui, un extracteur qui ne trouve plus rien — motif périmé, arbre mal
 *  typé — rendrait les trois tests précédents verts en ne mesurant rien. Il
 *  s'éprouve dans les **deux sens** : il trouve ce qui doit être trouvé, et il
 *  laisse passer ce qui est correct.
 * -------------------------------------------------------------------------- */

test('le témoin : les extracteurs trouvent le défaut, et laissent passer le code juste', () => {
  // 1. Un import de service est vu, un commentaire qui le nomme ne l'est pas.
  assert.deepEqual(
    servicesImportes("import { documentUrl } from '@/services/documents';"),
    ['@/services/documents'],
    'un import de service doit être relevé',
  );
  assert.deepEqual(
    servicesImportes("/* on n'importe surtout pas '@/services/documents' ici */"),
    [],
    'un commentaire qui nomme un service ne doit pas passer pour un import',
  );

  // 2. Une carte sans photographie est vue, avec sa ligne ; une carte servie ne
  //    l'est pas.
  assert.deepEqual(
    cartesSansPhoto('const a = <AnnonceCard annonce={item} onPress={ouvrir} />;'),
    [1],
    'une carte sans `photoUrl` doit être relevée, avec sa ligne',
  );
  assert.deepEqual(
    cartesSansPhoto(
      'const a = <AnnonceCard annonce={item} photoUrl={photos.get(item.id) ?? null} />;',
    ),
    [],
    'une carte servie ne doit pas être relevée',
  );
  //  La forme ouvrante-fermante, qui n'est pas celle du projet aujourd'hui mais
  //  qui le deviendra dès qu'un enfant sera ajouté à la carte.
  assert.deepEqual(
    cartesSansPhoto('const a = <AnnonceCard annonce={item}><View /></AnnonceCard>;'),
    [1],
    'la forme ouvrante-fermante doit être lue comme la forme auto-fermante',
  );

  // 3. Le chemin se lit des deux côtés.
  assert.equal(
    constante("const CHEMIN_BANDEAU = 'accueil/bandeau.jpg';", 'CHEMIN_BANDEAU'),
    'accueil/bandeau.jpg',
  );
  assert.deepEqual(
    cheminsEnDur("storage.objects.name = 'accueil/bandeau.jpg'"),
    ['accueil/bandeau.jpg'],
    'la ligne de la politique doit être relevée',
  );
  assert.deepEqual(
    cheminsEnDur('where d.storage_path = storage.objects.name'),
    [],
    'une comparaison entre deux colonnes ne désigne aucun chemin en dur',
  );
});
