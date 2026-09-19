/**
 * Vérifie que chaque écran protège l'encoche **selon qu'il a un en-tête ou non**.
 *
 * POURQUOI CE FICHIER
 * -------------------
 * `Screen` porte un défaut qui n'est juste que dans un cas : `edges = ['top']`.
 * Le commentaire du composant dit lequel — « ce qui convient aux écrans **sans**
 * en-tête de navigation » — et dit aussi l'autre moitié : « un écran sous une
 * pile native doit passer `[]` : sinon l'en-tête et la zone sûre se cumulent et
 * le contenu descend d'une hauteur d'encoche ».
 *
 * Rien ne tenait cette règle. Onze écrans sur treize l'appliquaient, et deux
 * l'avaient manquée — `ProfileScreen` et `ReglagesScreen`, tous deux créés par la
 * refonte, tous deux sous l'en-tête de `PlusStack`. Le défaut est invisible à la
 * relecture, invisible au typage, invisible au lint, et **visible sur tout
 * téléphone à encoche** : une bande vide de la hauteur de la barre d'état entre
 * l'en-tête et le contenu.
 *
 * La règle est donc écrite, et ce fichier la tient.
 *
 * POURQUOI LE CALCUL VIENT DES NAVIGATEURS, ET NON D'UNE LISTE
 * -----------------------------------------------------------
 * La liste des écrans « sous en-tête » est exactement ce qu'un nouveau fichier
 * ferait mentir : il suffirait d'ajouter un écran à `PlusStack` pour que la liste
 * devienne fausse en silence. Le contrôle **lit donc les navigateurs** : quel
 * `screenOptions.headerShown` pour le navigateur, quel `headerShown` sur
 * l'entrée, et — pour un onglet dont l'écran est lui-même un navigateur — ce que
 * ce navigateur imbriqué déclare à son tour. C'est la seule façon de retrouver,
 * sans le recopier, que « Plus » masque son en-tête **et** que ses neuf routes en
 * ont un.
 *
 * CE QUE LE CONTRÔLE NE PEUT PAS VOIR
 * -----------------------------------
 * Il lit le `headerShown` **déclaré** dans le fichier de navigation. Un
 * `headerShown` calculé à l'exécution (`headerShown: estAdmin`) n'est ni `true`
 * ni `false` dans le source : le contrôle le déclare non classable et échoue,
 * plutôt que de deviner. C'est le choix honnête — un contrôle qui devine rend une
 * réponse fausse avec l'assurance d'une vraie.
 *
 * Il ne mesure pas non plus ce que l'écran **affiche** : aucun moteur de rendu
 * n'est installé. Il tient la valeur passée, pas l'effet obtenu.
 */

import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import ts from 'typescript';

const RACINE = fileURLToPath(new URL('../', import.meta.url));

/** Le fichier qui porte le commentaire dont ce contrôle tient la promesse. */
const COMPOSANT = 'src/components/Screen.tsx';

/**
 * Les navigateurs, nommés comme les composants qui les montent.
 *
 * Déclarés plutôt que découverts : le nom est ce qui permet de **suivre** un
 * `component={PlusStack}` jusqu'au fichier qui le définit. Chaque entrée est
 * vérifiée comme étant bien un navigateur, donc un renommage fait tomber le
 * contrôle au lieu de le rendre muet.
 */
const FICHIERS = [
  ['RootNavigator', 'src/navigation/RootNavigator.tsx'],
  ['MainTabs', 'src/navigation/MainTabs.tsx'],
  ['PlusStack', 'src/navigation/PlusStack.tsx'],
];

function fichierDe(chemin) {
  return ts.createSourceFile(
    chemin,
    readFileSync(join(RACINE, chemin), 'utf8'),
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
}

/** L'ouverture d'un nœud JSX, qu'il soit auto-fermé ou non. */
function ouvertureDe(noeud) {
  if (ts.isJsxElement(noeud)) {
    return noeud.openingElement;
  }
  return ts.isJsxSelfClosingElement(noeud) ? noeud : null;
}

/** L'objet littéral d'un attribut JSX `={{ … }}`, s'il est écrit sur place. */
function objetDeLAttribut(attribut) {
  const initialiseur = attribut.initializer;
  if (initialiseur === undefined || !ts.isJsxExpression(initialiseur)) {
    return null;
  }
  const expression = initialiseur.expression;
  return expression !== undefined && ts.isObjectLiteralExpression(expression) ? expression : null;
}

/**
 * Le `headerShown` d'un objet d'options : `true`, `false`, ou `null` s'il n'est
 * pas déclaré — ou s'il l'est autrement qu'en toutes lettres.
 */
function enTeteDeclare(objet, fichier) {
  if (objet === null) {
    return null;
  }

  for (const propriete of objet.properties) {
    if (!ts.isPropertyAssignment(propriete) || propriete.name.getText(fichier) !== 'headerShown') {
      continue;
    }

    if (propriete.initializer.kind === ts.SyntaxKind.TrueKeyword) {
      return true;
    }
    if (propriete.initializer.kind === ts.SyntaxKind.FalseKeyword) {
      return false;
    }

    // `headerShown: estAdmin` : ni vrai ni faux dans le source. Rendre `null`
    // ici ferait retomber le calcul sur la valeur par défaut du navigateur, et
    // le contrôle répondrait avec assurance sur une entrée qu'il n'a pas lue.
    return undefined;
  }

  return null;
}

/** L'attribut d'ouverture portant ce nom, ou `undefined`. */
function attributDe(ouverture, nom, fichier) {
  return ouverture.attributes.properties.find(
    (propriete) => ts.isJsxAttribute(propriete) && propriete.name.getText(fichier) === nom,
  );
}

/** Le nœud `<….Navigator>` d'un fichier. */
function elementNavigateur(fichier) {
  let trouve = null;

  const visiter = (noeud) => {
    if (trouve !== null) {
      return;
    }

    const ouverture = ouvertureDe(noeud);
    if (ouverture !== null && /\.Navigator$/.test(ouverture.tagName.getText(fichier))) {
      trouve = noeud;
      return;
    }

    ts.forEachChild(noeud, visiter);
  };

  visiter(fichier);
  return trouve;
}

/** Le `headerShown` par défaut d'un navigateur — `true` chez React Navigation. */
function enTeteParDefaut(navigateur, fichier) {
  const ouverture = ouvertureDe(navigateur);
  const attribut = attributDe(ouverture, 'screenOptions', fichier);
  const declare =
    attribut === undefined ? null : enTeteDeclare(objetDeLAttribut(attribut), fichier);

  return declare ?? true;
}

/**
 * Les écrans déclarés par un navigateur : le composant monté, et le
 * `headerShown` que l'entrée porte elle-même.
 */
function entreesDe(navigateur, fichier) {
  const entrees = [];

  const visiter = (noeud) => {
    const ouverture = ouvertureDe(noeud);

    if (ouverture !== null && /\.Screen$/.test(ouverture.tagName.getText(fichier))) {
      const composant = attributDe(ouverture, 'component', fichier);
      const options = attributDe(ouverture, 'options', fichier);
      const initialiseur = composant?.initializer;

      const nom =
        initialiseur !== undefined && ts.isJsxExpression(initialiseur)
          ? initialiseur.expression?.getText(fichier)
          : undefined;

      if (nom !== undefined) {
        entrees.push({
          composant: nom,
          propre: options === undefined ? null : enTeteDeclare(objetDeLAttribut(options), fichier),
        });
      }
    }

    ts.forEachChild(noeud, visiter);
  };

  visiter(navigateur);
  return entrees;
}

/** Les navigateurs lus, prêts à être parcourus. */
function lireNavigateurs(fichiers) {
  return new Map(
    fichiers.map(([nom, chemin]) => {
      const fichier = fichierDe(chemin);
      const noeud = elementNavigateur(fichier);

      assert.notStrictEqual(
        noeud,
        null,
        `${chemin} : aucun <….Navigator> relevé — le contrôle ne saurait rien de ses écrans`,
      );

      return [nom, { fichier, noeud, defaut: enTeteParDefaut(noeud, fichier) }];
    }),
  );
}

/**
 * Les composants montés **sous un en-tête**, par fermeture depuis la racine.
 *
 * Un onglet qui masque son en-tête ne rend pas ses écrans orphelins d'en-tête
 * pour autant : quand son `component` est lui-même un navigateur, c'est ce
 * navigateur qui décide, et on descend le lire. C'est le cas de « Plus ».
 */
function sousEntete(navigateurs) {
  const trouves = new Set();
  const vus = new Set();

  const parcourir = (nom) => {
    if (vus.has(nom)) {
      return;
    }
    vus.add(nom);

    const navigateur = navigateurs.get(nom);
    if (navigateur === undefined) {
      return;
    }

    for (const { composant, propre } of entreesDe(navigateur.noeud, navigateur.fichier)) {
      assert.notStrictEqual(
        propre,
        undefined,
        `${nom} : le « headerShown » de ${composant} n'est pas écrit en toutes lettres — ` +
          'le contrôle ne peut pas trancher, et ne devine pas',
      );

      if (propre ?? navigateur.defaut) {
        trouves.add(composant);
      }

      if (navigateurs.has(composant)) {
        parcourir(composant);
      }
    }
  };

  parcourir('RootNavigator');
  return trouves;
}

/** Les bords passés à chaque `<Screen>` d'un fichier, avec leur ligne. */
function bordsDeLEcran(chemin) {
  const fichier = fichierDe(chemin);
  const trouves = [];

  const visiter = (noeud) => {
    const ouverture = ouvertureDe(noeud);

    if (ouverture !== null && ouverture.tagName.getText(fichier) === 'Screen') {
      const attribut = attributDe(ouverture, 'edges', fichier);
      const initialiseur = attribut?.initializer;
      const expression =
        initialiseur === undefined || !ts.isJsxExpression(initialiseur)
          ? null
          : (initialiseur.expression?.getText(fichier) ?? '');

      trouves.push({
        ligne: fichier.getLineAndCharacterOfPosition(ouverture.getStart(fichier)).line + 1,
        // L'espace et les guillemets ne changent pas la valeur : `[ 'top' ]` et
        // `['top']` sont la même liste.
        expression: expression === null ? null : expression.replace(/[\s'"]/g, ''),
      });
    }

    ts.forEachChild(noeud, visiter);
  };

  visiter(fichier);
  return trouves;
}

/** Les composants exportés par un fichier d'écran. */
function composantsDe(chemin) {
  return [
    ...readFileSync(join(RACINE, chemin), 'utf8').matchAll(
      /export\s+(?:const|function|class)\s+([A-Za-z_$][\w$]*)/g,
    ),
  ].map((trouve) => trouve[1]);
}

const ECRANS = readdirSync(join(RACINE, 'src/screens'))
  .filter((nom) => nom.endsWith('.tsx'))
  .map((nom) => `src/screens/${nom}`)
  .sort();

const NAVIGATEURS = lireNavigateurs(FICHIERS);
const SOUS_ENTETE = sousEntete(NAVIGATEURS);

/** Les composants qu'un navigateur monte, en-tête ou non. */
const MONTES = new Set(
  [...NAVIGATEURS.values()].flatMap(({ noeud, fichier }) =>
    entreesDe(noeud, fichier).map(({ composant }) => composant),
  ),
);

/** Les sources de la racine : ce qui est monté hors de tout navigateur. */
const RACINE_SOURCES = ['App.tsx', 'index.ts']
  .map((nom) => readFileSync(join(RACINE, nom), 'utf8'))
  .join('\n');

test("l'extraction lit les navigateurs et les écrans", () => {
  // Sans ce garde-fou, un motif qui ne correspond plus rendrait les tests
  // suivants verts en ne mesurant rien — le pire des états.
  assert.ok(ECRANS.length >= 10, `écrans lus : ${ECRANS.length}`);
  assert.ok(
    SOUS_ENTETE.size >= 10,
    `composants sous en-tête : ${SOUS_ENTETE.size} — ${[...SOUS_ENTETE].join(', ')}`,
  );
  assert.ok(MONTES.size >= 10, `composants montés : ${MONTES.size}`);
});

test('chaque écran est classé : sous un en-tête, ou monté hors de tout en-tête', () => {
  // La précondition des deux tests suivants. Un écran que rien ne monte serait
  // classé « sans en-tête » par défaut, et le contrôle répondrait sur lui sans
  // l'avoir jamais vu — c'est exactement la façon dont un contrôle devient muet.
  const nonClasses = [];

  for (const chemin of ECRANS) {
    const composants = composantsDe(chemin);
    assert.ok(composants.length > 0, `${chemin} : aucun export de composant relevé`);

    const monte = composants.some(
      (nom) => MONTES.has(nom) || new RegExp(`\\b${nom}\\b`).test(RACINE_SOURCES),
    );

    if (!monte) {
      nonClasses.push(`${chemin} : ${composants.join(', ')} n'est monté nulle part`);
    }
  }

  assert.deepEqual(
    nonClasses,
    [],
    'un écran que rien ne monte ne peut pas être classé — et le classer par défaut serait deviner',
  );
});

test("un écran sous un en-tête ne reprend pas l'encoche", () => {
  // Le défaut mesuré : l'en-tête ajoute déjà `insets.top`, et la zone sûre de la
  // scène l'ajoutait une seconde fois. Sur tout téléphone à encoche, une bande
  // vide de la hauteur de la barre d'état séparait l'en-tête du contenu.
  const fautifs = [];

  for (const chemin of ECRANS) {
    if (!composantsDe(chemin).some((nom) => SOUS_ENTETE.has(nom))) {
      continue;
    }

    const bords = bordsDeLEcran(chemin);
    assert.ok(bords.length > 0, `${chemin} : aucun <Screen> relevé`);

    for (const { ligne, expression } of bords) {
      if (expression !== '[]') {
        fautifs.push(
          `${chemin}:${ligne} : sous un en-tête, ` +
            (expression === null ? 'aucun bord déclaré' : `bords = ${expression}`) +
            " — l'en-tête protège déjà l'encoche",
        );
      }
    }
  }

  assert.deepEqual(fautifs, []);
});

test("un écran sans en-tête protège l'encoche lui-même", () => {
  // L'autre moitié, et celle qu'on oublie : retirer l'encoche d'un écran qui n'a
  // pas d'en-tête met son contenu **sous la barre d'état**, à moitié illisible.
  // Un contrôle qui n'exigerait que le sens « sous en-tête » se contenterait
  // d'une simplification « passons `[]` partout », qui casse l'application.
  const fautifs = [];

  for (const chemin of ECRANS) {
    if (composantsDe(chemin).some((nom) => SOUS_ENTETE.has(nom))) {
      continue;
    }

    const bords = bordsDeLEcran(chemin);
    assert.ok(bords.length > 0, `${chemin} : aucun <Screen> relevé`);

    for (const { ligne, expression } of bords) {
      // `null` est le défaut du composant, qui vaut `['top']` : les deux formes
      // sont justes, et la seconde est la même chose écrite en clair.
      if (expression !== null && expression !== '[top]') {
        fautifs.push(
          `${chemin}:${ligne} : sans en-tête, bords = ${expression} — ` +
            "l'écran doit protéger l'encoche lui-même",
        );
      }
    }
  }

  assert.deepEqual(fautifs, []);
});

test('le composant qui porte la règle la dit encore', () => {
  // Le contrôle tient une phrase écrite dans `Screen.tsx`. Si la phrase change,
  // c'est elle qu'il faut relire — pas le contrôle qu'il faut ajuster en
  // silence. Cette assertion est l'ancre : elle désigne l'endroit du désaccord.
  const source = readFileSync(join(RACINE, COMPOSANT), 'utf8');

  assert.match(
    source,
    /edges = \['top'\]/,
    `${COMPOSANT} : la valeur par défaut a changé — les écrans « sans en-tête » sont choisis d'après elle`,
  );
});

/**
 * Le témoin : la résolution est exercée sur des sources écrites ici, dans les
 * deux sens. Sans lui, une résolution qui ne trouve plus rien, ou qui trouve
 * tout, rendrait les deux tests précédents verts en ne mesurant rien.
 */
test('le témoin : la résolution suit un onglet sans en-tête jusqu’aux en-têtes de sa pile', () => {
  const analyser = (sources) => {
    const navigateurs = new Map(
      Object.entries(sources).map(([nom, source]) => {
        const fichier = ts.createSourceFile(
          `${nom}.tsx`,
          source,
          ts.ScriptTarget.Latest,
          true,
          ts.ScriptKind.TSX,
        );
        const noeud = elementNavigateur(fichier);
        assert.notStrictEqual(noeud, null, `témoin ${nom} : aucun navigateur relevé`);
        return [nom, { fichier, noeud, defaut: enTeteParDefaut(noeud, fichier) }];
      }),
    );

    return sousEntete(navigateurs);
  };

  // 1. L'onglet masque son en-tête, et sa pile en montre un : les écrans de la
  //    pile sont bien sous un en-tête. C'est la forme de « Plus ».
  const imbrique = analyser({
    RootNavigator: `<Stack.Navigator>
      <Stack.Screen name="Application" component={MainTabs} />
    </Stack.Navigator>`,
    MainTabs: `<Tab.Navigator>
      <Tab.Screen name="Accueil" component={AccueilScreen} />
      <Tab.Screen name="Plus" component={PlusStack} options={{ headerShown: false }} />
    </Tab.Navigator>`,
    PlusStack: `<Stack.Navigator screenOptions={{ headerStyle: {} }}>
      <Stack.Screen name="Profil" component={ProfileScreen} />
    </Stack.Navigator>`,
  });

  assert.ok(imbrique.has('AccueilScreen'), "l'onglet à en-tête doit être relevé");
  assert.ok(imbrique.has('ProfileScreen'), "l'écran de la pile doit être relevé");
  assert.ok(!imbrique.has('PlusStack'), 'un onglet sans en-tête ne doit pas être relevé lui-même');

  // 2. Le défaut du navigateur est faux : aucun de ses écrans n'a d'en-tête.
  const sansEnTete = analyser({
    RootNavigator: `<Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="Connexion" component={ConnexionScreen} />
    </Stack.Navigator>`,
  });

  assert.deepEqual([...sansEnTete], [], 'aucun écran ne doit être relevé sous un en-tête masqué');

  // 3. Une entrée qui reprend l'en-tête que le navigateur masquait.
  const reprise = analyser({
    RootNavigator: `<Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="Connexion" component={ConnexionScreen} options={{ headerShown: true }} />
    </Stack.Navigator>`,
  });

  assert.ok(reprise.has('ConnexionScreen'), "l'entrée qui reprend l'en-tête doit être relevée");

  // 4. Un `headerShown` qui n'est pas en toutes lettres n'est pas deviné : le
  //    contrôle doit **lever**, pas répondre.
  assert.throws(
    () =>
      analyser({
        RootNavigator: `<Stack.Navigator screenOptions={{ headerShown: false }}>
          <Stack.Screen name="Connexion" component={ConnexionScreen} options={{ headerShown: estAdmin }} />
        </Stack.Navigator>`,
      }),
    /en toutes lettres/,
    'un headerShown calculé doit faire lever le contrôle, jamais être deviné',
  );
});
