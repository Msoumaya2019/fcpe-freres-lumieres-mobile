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
 *
 * Ce contrôle lit désormais l'**arbre syntaxique** du fichier, et non le texte.
 * Il lisait le texte, et refusait qu'un élément soit ouvert puis refermé entre
 * la garde et le repli : un proxy qui a produit un faux positif dès qu'un envoi
 * en cours a ajouté une seconde branche sous la même garde de vacuité. La
 * propriété est structurelle, l'outil devait l'être aussi — même raison que les
 * relevés de schéma, qui lisent l'AST depuis la passe 49.
 *
 * Un dernier contrôle est venu du dossier lui-même : **aucun écran n'est
 * orphelin**. Le cas s'est présenté à la main, en cherchant qui montait
 * `ConfigurationScreen` : le relevé ne portait que sur `src/`, et il concluait
 * qu'aucune route ne l'atteignait — alors que `App.tsx`, à la racine, le monte.
 * Le défaut n'existait pas ; la mesure était fausse. C'est le même piège que
 * celui des commentaires : une recherche dont la portée est trop étroite rend une
 * réponse fausse avec l'assurance d'une réponse vraie. Un écran que rien ne monte
 * passe le typage, le lint et le contrôle des contrastes, et il reste mort.
 *
 * TROIS PROPRIÉTÉS, ET NON UNE — LA PREMIÈRE ÉTAIT FAUSSE
 * ------------------------------------------------------
 * Ce contrôle a d'abord compté les **occurrences du nom** de l'export, en
 * exigeant au moins deux : sa déclaration, et l'endroit qui le monte. Mesuré le
 * 2026-09-19 en retirant la seule ligne `<Stack.Screen … component={
 * DocumentsScreen} />` de `PlusStack.tsx` — **import conservé**, ce que fait une
 * fusion mal résolue ou un retrait qu'on croit annulé : le nom apparaît encore
 * deux fois, et le banc restait **vert sur un écran inatteignable**. Un compte
 * d'occurrences n'est pas une relation ; il se satisfait d'une mention.
 *
 * Les trois propriétés tenues aujourd'hui se lisent dans l'**arbre syntaxique**,
 * et elles se recouvrent sans se répéter :
 *
 *  1. **Le module est atteint** depuis `App.tsx` ou `index.ts`, par fermeture
 *     transitive des imports. Un écran importé seulement par un écran que rien
 *     n'importe est orphelin à deux niveaux, et un relevé à un niveau le
 *     déclarerait vivant.
 *  2. **Tout écran importé par un navigateur y est monté** : la relation entre
 *     l'import et un `<*.Screen component={…}>`. C'est le défaut que la première
 *     propriété ne peut pas voir — un module importé est vivant pour la
 *     fermeture, alors qu'aucune route n'y mène.
 *  3. **Les routes déclarées et le type des routes s'accordent.** Le type est
 *     **déduit** de l'appel qui crée le navigateur (`createBottomTabNavigator<
 *     MainTabParamList>()`) plutôt qu'écrit dans une table : une table se
 *     périmerait au premier navigateur ajouté. Une route présente dans le type
 *     mais absente des écrans compile — les `navigate('…')` sont vérifiés contre
 *     le type, et rien ne vérifie le type contre les écrans —, et le défaut
 *     n'apparaît qu'à l'exécution, sous le doigt de l'adhérent.
 *
 * Éprouvé dans les deux sens, six mutations, six verdicts conformes : route
 * retirée avec import conservé → rouge sur (2) ; route **et** import retirés →
 * rouge sur (1) ; onglet retiré avec import conservé, dans `MainTabs` et son
 * `<Tab.Screen>` → rouge sur (2), ce qui vérifie que le contrôle ne dépend pas du
 * nom local du navigateur ; clé de type retirée, puis clé de type ajoutée sans
 * écran → rouge sur (3) ; et **route simplement déplacée → vert partout**, ce qui
 * est la seule mesure qui prouve que le rouge vient du défaut et non du fait
 * d'avoir touché au fichier.
 */

import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import ts from 'typescript';

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
 * Un enfant JSX qui produit quelque chose à l'écran.
 *
 * Un commentaire JSX — une expression JSX dont l'`expression` est absente — est
 * bien dans l'arbre, et il ne rend rien. Le compter comme un frère ferait tomber
 * le contrôle sur du code juste : mesuré sur l'écran de discussion, dont le
 * commentaire précède le ternaire.
 */
function estRendu(enfant) {
  if (ts.isJsxElement(enfant) || ts.isJsxSelfClosingElement(enfant)) {
    return true;
  }

  return ts.isJsxExpression(enfant) && enfant.expression !== undefined;
}

/** La première chose rendue par un conteneur JSX, ou `undefined`. */
function premierRendu(conteneur) {
  return conteneur.children.find(estRendu);
}

/**
 * Les gardes qui enserrent un nœud, et les frères rendus avant lui.
 *
 * POURQUOI L'ARBRE ICI, ET PAS UN MOTIF SUR LE TEXTE
 * -------------------------------------------------
 * La première version de ce contrôle lisait le texte entre la garde et
 * l'élément, et refusait qu'un élément y soit ouvert puis refermé. C'était un
 * **proxy** de la propriété cherchée — « le repli n'est monté que si la liste
 * est vide » — et il a produit un faux positif dès qu'un envoi en cours a ajouté
 * une seconde branche au même endroit :
 *
 *     messages.length === 0 ? (envoiEnCours ? (<Attente />) : (<AsyncFallback />)) : (…)
 *
 * Le repli est bien sous la garde de vacuité, et le motif le déclarait fautif.
 * Un banc qui tombe sur du code juste est un défaut du banc : la propriété est
 * structurelle, l'outil devait l'être aussi. La chaîne relevée ici a été
 * **mesurée** sur les quatre écrans avant d'être écrite, et non déduite.
 *
 * Les nœuds traversés sont ceux qui n'ajoutent pas de rendu : parenthèses,
 * expressions JSX, ternaires, `&&`. Un conteneur JSX, lui, arrête la
 * description : si quelque chose y est rendu avant nous, la garde ne nous
 * protège plus seul.
 */
function enveloppe(noeud, fichier) {
  const conditions = [];
  const freresAvant = [];

  let courant = noeud;
  let parent = noeud.parent;

  while (parent !== undefined) {
    if (ts.isParenthesizedExpression(parent) || ts.isJsxExpression(parent)) {
      courant = parent;
      parent = parent.parent;
      continue;
    }

    if (ts.isConditionalExpression(parent)) {
      conditions.push(parent.condition.getText(fichier));
      courant = parent;
      parent = parent.parent;
      continue;
    }

    if (
      ts.isBinaryExpression(parent) &&
      parent.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken
    ) {
      conditions.push(parent.left.getText(fichier));
      courant = parent;
      parent = parent.parent;
      continue;
    }

    if (ts.isJsxAttribute(parent) && parent.name.getText(fichier) === 'ListEmptyComponent') {
      conditions.push('ListEmptyComponent');
      courant = parent;
      parent = parent.parent;
      continue;
    }

    if (ts.isJsxElement(parent) || ts.isJsxFragment(parent)) {
      const premier = premierRendu(parent);
      if (premier !== undefined && premier !== courant) {
        freresAvant.push(premier.getText(fichier).replace(/\s+/g, ' ').slice(0, 60));
      }
      courant = parent;
      parent = parent.parent;
      continue;
    }

    break;
  }

  return { conditions, freresAvant };
}

/**
 * Une garde qui dit « la liste est vide » — soit l'emplacement dédié d'une
 * `FlatList`, soit un test de longueur. C'est elle qui rend vrai le commentaire
 * d'`AsyncFallback` : le repli n'est **jamais** le mécanisme qui préserve une
 * liste affichée, c'est son absence de montage qui le fait.
 *
 * LES DEUX FORMES RECONNUES SONT CELLES DU PROJET, ET RIEN DE PLUS
 * `.length === 0`, `.length > 0`, `.length !== 0`, et leur négation `!x.length`.
 * Deux formulations sont **fausses négatives** et feront donc tomber le
 * contrôle sur du code juste : un test de vacuité placé dans une variable
 * (`const vide = liste.length === 0`) et un test de véracité dont le repli
 * occupe la branche fausse (`liste.length ? <Liste /> : <AsyncFallback />`).
 * Aucune des deux n'existe dans le projet ; elles sont écrites ici pour que le
 * prochain lecteur sache où s'arrête le contrôle, et où le corriger.
 */
const GARDE_DE_VACUITE = /!\s*[\w.$]*\.?length\b|\.length\s*(?:===|!==|==|!=|>=|<=|>|<)\s*0\b/;

function estGardeDeVacuite(condition) {
  return condition === 'ListEmptyComponent' || GARDE_DE_VACUITE.test(condition);
}

/** Les `<AsyncFallback>` d'un écran, avec la chaîne de gardes qui les enserre. */
function replisDeLEcran(chemin) {
  const source = lireFichier(chemin);
  const fichier = ts.createSourceFile(
    chemin,
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
  const trouves = [];

  const visiter = (noeud) => {
    if (ts.isJsxSelfClosingElement(noeud) && noeud.tagName.getText(fichier) === 'AsyncFallback') {
      const ligne = fichier.getLineAndCharacterOfPosition(noeud.getStart(fichier)).line + 1;
      trouves.push({ ligne, ...enveloppe(noeud, fichier) });
    }

    ts.forEachChild(noeud, visiter);
  };

  visiter(fichier);
  return trouves;
}

test("l'état vide est la seule porte d'`AsyncFallback`", () => {
  // `AsyncFallback` reçoit `hasData` faux à tous ses appels : il n'est donc
  // jamais le mécanisme qui préserve une liste affichée, c'est son **absence de
  // montage** qui le fait. Encore faut-il que ce soit vrai — c'est ce que ce test
  // tient, et non la lecture du commentaire qui l'affirme.
  const fautifs = [];

  for (const ecran of ECRANS_CHARGEANTS) {
    const replis = replisDeLEcran(ecran.chemin);

    if (replis.length === 0) {
      fautifs.push(`${ecran.relatif} : aucun AsyncFallback relevé`);
      continue;
    }

    for (const { ligne, conditions, freresAvant } of replis) {
      if (conditions.length === 0) {
        fautifs.push(`${ecran.relatif}:${ligne} : AsyncFallback hors de toute garde`);
      } else if (!conditions.some(estGardeDeVacuite)) {
        fautifs.push(
          `${ecran.relatif}:${ligne} : aucune garde de vacuité — gardes relevées : ${conditions.join(' | ')}`,
        );
      }

      if (freresAvant.length > 0) {
        fautifs.push(
          `${ecran.relatif}:${ligne} : un élément est rendu avant lui dans la même branche — ${freresAvant[0]}`,
        );
      }
    }
  }

  assert.deepEqual(fautifs, []);
});

/**
 * Le témoin : l'analyse est exercée sur des sources écrites ici, et dans les
 * deux sens. Sans lui, une analyse qui ne trouve plus rien, ou qui trouve tout,
 * rendrait le test précédent vert en ne mesurant rien — et le cas 1 est
 * exactement la forme qui a fait tomber l'ancien contrôle.
 */
test("le témoin : l'analyse reconnaît une garde de vacuité, même imbriquée, et refuse son absence", () => {
  const analyse = (source) => {
    const fichier = ts.createSourceFile(
      'temoin.tsx',
      source,
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TSX,
    );

    let repli = null;
    const visiter = (noeud) => {
      if (ts.isJsxSelfClosingElement(noeud) && noeud.tagName.getText(fichier) === 'AsyncFallback') {
        repli = noeud;
      }
      ts.forEachChild(noeud, visiter);
    };
    visiter(fichier);

    assert.notStrictEqual(repli, null, 'le témoin ne contient aucun AsyncFallback');
    return enveloppe(repli, fichier);
  };

  // 1. Deux gardes imbriquées : celle de vacuité enveloppe celle de l'envoi.
  const imbriquee = analyse(
    'const a = <>{liste.length === 0 ? (envoi ? (<Attente />) : (<AsyncFallback />)) : (<Liste />)}</>;',
  );
  assert.deepEqual(imbriquee.freresAvant, [], 'aucun élément ne précède le repli dans sa branche');
  assert.ok(
    imbriquee.conditions.some(estGardeDeVacuite),
    `garde de vacuité non reconnue : ${imbriquee.conditions.join(' | ')}`,
  );

  // 2. L'emplacement dédié d'une `FlatList`.
  const emplacement = analyse('const a = <FlatList ListEmptyComponent={<AsyncFallback />} />;');
  assert.ok(emplacement.conditions.includes('ListEmptyComponent'));

  // 3. Rendu sans aucune garde.
  const nu = analyse('const a = <View><AsyncFallback /></View>;');
  assert.deepEqual(nu.conditions, [], 'un repli nu ne doit relever aucune garde');

  // 4. Gardé, mais par autre chose que la vacuité.
  const autreGarde = analyse('const a = <>{envoi ? (<AsyncFallback />) : (<Attente />)}</>;');
  assert.deepEqual(autreGarde.conditions, ['envoi']);
  assert.ok(
    !autreGarde.conditions.some(estGardeDeVacuite),
    'une garde qui ne teste pas la vacuité ne doit pas passer pour telle',
  );

  // 4 bis. La négation, qui dit la même chose autrement.
  const negation = analyse('const a = <>{!liste.length && <AsyncFallback />}</>;');
  assert.ok(
    negation.conditions.some(estGardeDeVacuite),
    `négation non reconnue : ${negation.conditions.join(' | ')}`,
  );

  // 5. Quelque chose est rendu avant lui dans la même branche.
  const frere = analyse(
    'const a = <>{liste.length === 0 ? (<><Titre /><AsyncFallback /></>) : (<Liste />)}</>;',
  );
  assert.ok(frere.conditions.some(estGardeDeVacuite));
  assert.deepEqual(
    frere.freresAvant,
    ['<Titre />'],
    'un frère rendu avant le repli doit être relevé, avec son texte',
  );
});

/**
 * Le nom de module d'un fichier, dans la convention du dépôt : `@/` pour `src/`,
 * un chemin relatif pour les deux fichiers de la racine.
 */
function nomDeModule(chemin) {
  const relatif = relative(RACINE, chemin).replace(/\\/g, '/');
  if (relatif === 'App.tsx' || relatif === 'index.ts') {
    return './' + relatif;
  }
  return '@/'.concat(relatif.replace(/^src\//, '').replace(/\.(tsx|ts)$/, ''));
}

/**
 * Les modules de l'application, indexés par leur nom d'importation.
 *
 * `App.tsx` et `index.ts` sont **indispensables** ici, et pas seulement `src/`.
 * C'est `App.tsx` qui monte `ConfigurationScreen`, l'écran de secours affiché
 * quand les clés d'API manquent : un relevé qui s'arrête à `src/` conclut à tort
 * qu'aucune route ne l'atteint. L'erreur a été commise à la main, deux fois — la
 * seconde en rédigeant ce fichier —, et `check-env-guard` avait déjà la bonne
 * portée pour la même raison.
 */
function modulesDeLApplication() {
  const parNom = new Map();

  for (const chemin of [
    ...fichiersSous('src', ['.ts', '.tsx']),
    join(RACINE, 'App.tsx'),
    join(RACINE, 'index.ts'),
  ]) {
    parNom.set(nomDeModule(chemin), chemin);
  }

  return parNom;
}

/** Les imports statiques d'un fichier, résolus en noms de modules connus. */
function importsResolus(chemin, parNom) {
  const source = ts.createSourceFile(chemin, lireFichier(chemin), ts.ScriptTarget.Latest, true);
  const sortants = [];

  for (const declaration of source.statements) {
    if (!ts.isImportDeclaration(declaration) || !ts.isStringLiteral(declaration.moduleSpecifier)) {
      continue;
    }

    const specificateur = declaration.moduleSpecifier.text;
    let cible = null;

    if (specificateur.startsWith('@/')) {
      cible = specificateur;
    } else if (specificateur.startsWith('./') || specificateur.startsWith('../')) {
      const absolu = relative(RACINE, resolve(dirname(chemin), specificateur)).replace(/\\/g, '/');
      cible = absolu.startsWith('src/') ? '@/' + absolu.replace(/^src\//, '') : './' + absolu;
    }

    // Un spécificateur qui ne se résout pas est laissé de côté : `tsc` le
    // signale déjà, et l'accuser ici ajouterait un rouge sans cause nouvelle.
    if (cible !== null && parNom.has(cible)) {
      sortants.push(cible);
    }
  }

  return sortants;
}

/**
 * Les modules réellement atteints depuis le point d'entrée.
 *
 * Fermeture transitive, et non « importé par quelqu'un » : un écran importé
 * seulement par un écran que rien n'importe est orphelin **à deux niveaux**, et
 * un relevé à un niveau le déclarerait vivant.
 */
function modulesAtteints(parNom) {
  const atteints = new Set();
  const aVoir = ['./App.tsx', './index.ts'];

  while (aVoir.length > 0) {
    const nom = aVoir.pop();
    if (atteints.has(nom) || !parNom.has(nom)) {
      continue;
    }
    atteints.add(nom);
    for (const suivant of importsResolus(parNom.get(nom), parNom)) {
      if (!atteints.has(suivant)) {
        aVoir.push(suivant);
      }
    }
  }

  return atteints;
}

/**
 * Ce qu'un fichier de navigateur importe depuis `@/screens/`, ce qu'il monte
 * réellement, et les routes qu'il déclare — lus dans l'arbre syntaxique.
 *
 * L'arbre, et non le texte : les trois propriétés ci-dessous sont des
 * **relations** entre un nom et un emplacement, et une expression régulière les
 * rend par des proximités. C'est exactement l'erreur qui a produit le faux
 * positif corrigé plus haut dans ce fichier.
 */
function montageDUnNavigateur(chemin) {
  const source = ts.createSourceFile(chemin, lireFichier(chemin), ts.ScriptTarget.Latest, true);
  const importes = new Map();
  const montes = new Set();
  const routes = [];
  let typeDeRoutes = null;

  function visiter(noeud) {
    if (ts.isImportDeclaration(noeud) && ts.isStringLiteral(noeud.moduleSpecifier)) {
      const module = noeud.moduleSpecifier.text;
      const liaisons = noeud.importClause?.namedBindings;

      if (liaisons !== undefined && ts.isNamedImports(liaisons)) {
        for (const element of liaisons.elements) {
          importes.set(element.name.text, module);
        }
      }
    }

    // Le type des routes, déduit de l'appel qui crée le navigateur :
    // `createBottomTabNavigator<MainTabParamList>()`. Le déduire plutôt que
    // l'écrire évite une table à tenir, qui se périmerait au premier navigateur
    // ajouté — et un navigateur sans type passerait alors sans être vu.
    if (
      ts.isCallExpression(noeud) &&
      /^create\w*Navigator$/.test(noeud.expression.getText(source))
    ) {
      const argument = noeud.typeArguments?.[0];
      typeDeRoutes = argument === undefined ? null : argument.getText(source);
    }

    if (ts.isJsxOpeningElement(noeud) || ts.isJsxSelfClosingElement(noeud)) {
      if (noeud.tagName.getText(source).endsWith('.Screen')) {
        let nom = null;
        let composant = null;

        for (const attribut of noeud.attributes.properties) {
          if (!ts.isJsxAttribute(attribut)) {
            continue;
          }
          const cle = attribut.name.getText(source);
          const valeur = attribut.initializer;

          if (cle === 'name' && valeur !== undefined && ts.isStringLiteral(valeur)) {
            nom = valeur.text;
          }
          if (
            cle === 'component' &&
            valeur !== undefined &&
            ts.isJsxExpression(valeur) &&
            valeur.expression !== undefined
          ) {
            composant = valeur.expression.getText(source);
          }
        }

        if (composant !== null) {
          montes.add(composant);
        }
        if (nom !== null) {
          routes.push(nom);
        }
      }
    }

    ts.forEachChild(noeud, visiter);
  }

  visiter(source);

  return { importes, montes, routes: routes.sort(), typeDeRoutes };
}

/** Les clés d'un type de routes, lues dans `src/navigation/types.ts`. */
function clesDuType(nom) {
  const chemin = join(RACINE, 'src', 'navigation', 'types.ts');
  const source = ts.createSourceFile(chemin, lireFichier(chemin), ts.ScriptTarget.Latest, true);
  let cles = null;

  function visiter(noeud) {
    if (ts.isTypeAliasDeclaration(noeud) && noeud.name.text === nom) {
      const membres = ts.isTypeLiteralNode(noeud.type) ? noeud.type.members : [];
      cles = membres
        .filter((membre) => ts.isPropertySignature(membre) && membre.name !== undefined)
        .map((membre) => membre.name.getText(source))
        .sort();
    }
    ts.forEachChild(noeud, visiter);
  }

  visiter(source);

  return cles;
}

const NAVIGATEURS = fichiersSous('src/navigation', ['.tsx']);

test('aucun écran n’est orphelin : le module est atteint depuis l’entrée', () => {
  // Un écran que rien ne monte passe le typage, le lint, le contrôle des
  // contrastes et tous les autres bancs — et il reste **mort**. Le cas est
  // d'autant plus traître qu'il est invisible à la relecture : le fichier
  // ressemble à tous les autres, et c'est son absence d'une ligne ailleurs qui
  // fait le défaut.
  //
  // Ce test a d'abord compté les **occurrences du nom** de l'export, en exigeant
  // au moins deux : sa déclaration, et l'endroit qui le monte. La propriété
  // était fausse, et sa falsification l'a montré : en retirant la seule ligne
  // `<Stack.Screen … component={DocumentsScreen} />` de `PlusStack.tsx` — en
  // laissant l'import, ce que fait une fusion mal résolue — le nom apparaît
  // encore deux fois, et le banc restait **vert sur un écran inatteignable**.
  // Il compare maintenant des **noms de modules**, qu'une mention ne peut pas
  // satisfaire.
  assert.ok(ECRANS.length > 0, 'aucun fichier dans `src/screens` : le test ne vérifierait rien');

  const parNom = modulesDeLApplication();
  const atteints = modulesAtteints(parNom);
  const orphelins = [];

  for (const chemin of ECRANS) {
    const relatif = relative(RACINE, chemin).replace(/\\/g, '/');
    const module = nomDeModule(chemin);

    if (!atteints.has(module)) {
      orphelins.push(`${relatif} : \`${module}\` n'est atteint depuis aucun point d'entrée`);
    }
  }

  assert.deepEqual(
    orphelins,
    [],
    "un écran que rien ne monte est un écran que l'adhérent ne verra jamais",
  );
});

test('tout écran importé par un navigateur y est monté', () => {
  // Le défaut que le test précédent ne peut pas voir : un écran **atteint**
  // — son module est importé — mais qu'aucune route ne monte. L'import suffit à
  // le rendre vivant pour la fermeture ci-dessus, alors que l'adhérent ne peut
  // toujours pas y arriver. C'est la relation entre l'import et la route qui
  // fait la différence, et elle se lit dans l'arbre.
  assert.ok(NAVIGATEURS.length > 0, 'aucun navigateur relevé : le test ne vérifierait rien');

  const fautifs = [];

  for (const chemin of NAVIGATEURS) {
    const { importes, montes } = montageDUnNavigateur(chemin);

    for (const [local, module] of importes) {
      if (!module.startsWith('@/screens/') || montes.has(local)) {
        continue;
      }
      fautifs.push(
        `${relative(RACINE, chemin).replace(/\\/g, '/')} importe \`${local}\` (${module}) ` +
          'sans le monter dans aucun `<*.Screen component={…}>`',
      );
    }
  }

  assert.deepEqual(
    fautifs,
    [],
    "un écran importé par un navigateur mais monté par aucune route reste hors d'atteinte",
  );
});

test('les routes déclarées et le type des routes s’accordent', () => {
  // Une route présente dans le type mais absente des écrans compile : les
  // appels `navigate('Rubrique')` sont vérifiés contre le type, et rien ne
  // vérifie le type contre les écrans. Le défaut n'apparaît donc qu'à
  // l'exécution, sur le geste de l'adhérent, et sous la forme d'une erreur de
  // navigation — le plus tard possible, et au pire endroit.
  assert.ok(NAVIGATEURS.length > 0, 'aucun navigateur relevé : le test ne vérifierait rien');

  const desaccords = [];
  let accords = 0;

  for (const chemin of NAVIGATEURS) {
    const relatif = relative(RACINE, chemin).replace(/\\/g, '/');
    const { routes, typeDeRoutes } = montageDUnNavigateur(chemin);

    assert.notStrictEqual(
      typeDeRoutes,
      null,
      `${relatif} doit passer son type de routes en argument : sans lui, ce contrôle ne mesure rien`,
    );

    const cles = clesDuType(typeDeRoutes);
    assert.notStrictEqual(cles, null, `\`${typeDeRoutes}\` est introuvable dans types.ts`);

    const seulementDansLeType = cles.filter((cle) => !routes.includes(cle));
    const seulementDansLesEcrans = routes.filter((route) => !cles.includes(route));

    if (seulementDansLeType.length === 0 && seulementDansLesEcrans.length === 0) {
      accords += 1;
    } else {
      desaccords.push(
        `${relatif} (${typeDeRoutes}) — dans le type seulement : ${seulementDansLeType.join(', ') || 'aucune'}` +
          ` ; dans les écrans seulement : ${seulementDansLesEcrans.join(', ') || 'aucune'}`,
      );
    }
  }

  assert.deepEqual(desaccords, [], `routes et types en désaccord :\n  ${desaccords.join('\n  ')}`);
  assert.ok(
    accords > 0,
    'aucun accord constaté : le contrôle n’a rien comparé, ce qui est le pire des états',
  );
});

/* -------------------------------------------------------------------------- *
 *  Les écrans qui exigent une session
 * -------------------------------------------------------------------------- */

/**
 * Les écrans que `useCurrentUserId()` sert, et qui ne se gardent pas eux-mêmes.
 *
 * `useCurrentUserId()` **lève** quand il n'y a pas de session : c'est sa raison
 * d'être, et elle est bonne — il évite de parsemer les écrans de
 * `session?.user.id ?? ''`, qui produirait des requêtes silencieusement vides si
 * la garantie tombait. Mais un écran qui l'appelle **sans vérifier la session**
 * plante dès qu'un chemin d'accès l'atteint sans être connecté.
 *
 * Le défaut a existé, et il n'était pas théorique : l'écran de discussion
 * appelait ce hook, et la cloche de l'accueil y mène **sans condition** depuis que
 * l'application s'ouvre aux familles sans compte. Le corriger a demandé de
 * séparer l'aiguillage du salon, et c'est cette mesure qui manquait.
 *
 * Liste **fermée**, et chaque entrée porte sa raison : un écran qui appelle le
 * hook sans se garder doit dire **pourquoi** aucun chemin ne peut l'atteindre
 * sans session.
 */
const SANS_GARDE_DE_SESSION = new Map([
  [
    'src/screens/MesSignalementsScreen.tsx',
    'seul « Plus » y mène, et son entrée est conditionnée à l’adhésion acceptée : ' +
      'aucun autre écran ne navigue vers cette route, et aucune adresse ne la cible',
  ],
]);

/**
 * Une garde de session : une condition d'`if` qui **nomme** `session`.
 *
 * Nommer, et non écrire `session === null` : le contrôle doit tenir la propriété
 * — l'écran regarde s'il y a une session — et non une orthographe. `null ===
 * session`, `!session`, `session?.user.id === undefined` sont trois façons
 * correctes de l'écrire, et un contrôle qui les refuserait ferait tomber le banc
 * sur une remise en forme juste — le second sens dans lequel un banc doit
 * s'éprouver.
 *
 * C'est l'**instruction** qui compte, et c'est pour cela que la lecture passe par
 * l'arbre : voir la note de `gardesDeSession`.
 */
const GARDE_DE_SESSION = /\bsession\b/;

/**
 * Les gardes de session d'un écran, lues dans l'**arbre**, et non dans le texte.
 *
 * LA PREMIÈRE VERSION DE CE CONTRÔLE ÉTAIT FAUSSE, ET LA FALSIFICATION L'A DIT
 * --------------------------------------------------------------------------
 * Elle cherchait la comparaison n'importe où dans le fichier, et elle était donc
 * satisfaite par le message affiché lui-même : `{session === null ? '…créer un
 * compte…' : '…votre adhésion…'}`. Retirer la garde laissait le contrôle **vert**
 * — mesuré, en remplaçant la condition par `profile?.status !== 'accepte'`.
 *
 * C'est le défaut que ce dépôt nomme ailleurs : un contrôle qui lit un motif
 * peut déborder ; qui compare une valeur, non. La valeur, ici, est structurelle —
 * une garde est une **instruction** `if`, pas une expression conditionnelle
 * d'affichage. D'où l'arbre, comme pour les autres contrôles de ce fichier.
 *
 * Le motif, lui, s'est élargi à la mesure : il nomme `session`, sans exiger une
 * orthographe. Restreint à `session === null`, il aurait refusé `!session` — une
 * remise en forme correcte — et le banc serait tombé sur du code juste.
 */
function gardesDeSession(chemin) {
  const source = ts.createSourceFile(
    chemin,
    lireFichier(chemin),
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );

  const gardes = [];

  const visiter = (noeud) => {
    if (ts.isIfStatement(noeud) && GARDE_DE_SESSION.test(noeud.expression.getText(source))) {
      gardes.push(noeud.expression.getText(source));
    }
    ts.forEachChild(noeud, visiter);
  };

  visiter(source);

  return gardes;
}

test('un écran qui exige une session se garde, ou dit pourquoi il ne le fait pas', () => {
  // Le relevé des appelants se fait sur le source **sans commentaires** : le
  // fichier qui explique pourquoi il n'appelle pas le hook le nomme, et le
  // compter serait prendre une phrase pour un appel — le piège que
  // `check-env-guard` a déjà documenté.
  const appelants = ECRANS.filter((chemin) =>
    sansCommentaires(lireFichier(chemin)).includes('useCurrentUserId('),
  ).map((chemin) => relative(RACINE, chemin).replace(/\\/g, '/'));

  assert.ok(
    appelants.length > 0,
    'aucun écran n’appelle `useCurrentUserId()` : ce contrôle ne vérifierait rien, ' +
      'et il serait vert pour la mauvaise raison',
  );

  const fautifs = appelants.filter(
    (relatif) =>
      gardesDeSession(join(RACINE, relatif)).length === 0 && !SANS_GARDE_DE_SESSION.has(relatif),
  );

  assert.deepEqual(
    fautifs,
    [],
    'ces écrans appellent `useCurrentUserId()`, qui lève sans session, sans ' +
      'instruction `if` comparant `session` à `null` : ils plantent dès qu’un ' +
      'chemin d’accès les atteint sans être connecté. Les garder, ou les ' +
      'déclarer dans `SANS_GARDE_DE_SESSION` avec la raison qui rend le cas ' +
      'impossible',
  );

  // Et la liste ne survit pas à sa cause : une exception dont l'écran se garde
  // désormais est une justification périmée, et elle masquerait un futur défaut.
  assert.deepEqual(
    [...SANS_GARDE_DE_SESSION.keys()].filter(
      (relatif) => gardesDeSession(join(RACINE, relatif)).length > 0,
    ),
    [],
    '`SANS_GARDE_DE_SESSION` nomme un écran qui se garde : l’exception est périmée',
  );
});

/* -------------------------------------------------------------------------- *
 *  Les tables qu'un visiteur ne peut pas lire
 * -------------------------------------------------------------------------- */

/**
 * La seule table du porteur qu'une lecture d'**écran public** atteigne.
 *
 * MESURÉ, ET C'EST CE QUI DONNE SON SENS AU CONTRÔLE
 * -------------------------------------------------
 * Le 20 septembre 2026, avec la seule clef publique : les six rubriques
 * publiques répondent `200` au rôle anonyme, et `profiles` répond **`401` /
 * `42501 permission denied`**. La frontière est donc nette, et `profiles` est la
 * seule table de l'autre côté qui soit lue par un écran que la rubrique ouvre
 * sans compte — les actualités et les commentaires de cantine, qui tous deux
 * résolvent des noms d'auteur.
 *
 * LE DÉFAUT QUE CE CONTRÔLE REND IMPOSSIBLE, ET IL A ÉTÉ VU SUR L'APPAREIL
 * -----------------------------------------------------------------------
 * Sans garde, la requête refusée **lève**, l'erreur remonte jusqu'au chargeur de
 * l'écran, et un visiteur lit « Vous n'avez pas les droits nécessaires pour
 * cette action » **à la place des actualités**. Le nom d'auteur est un ornement,
 * l'article est le contenu — et c'est la page entière qui tombait, bandeau
 * compris, pour l'ornement.
 *
 * La garde est exigée **avant** la lecture, et non quelque part dans le fichier :
 * un `catch` posé autour laisserait partir la même requête inutile, alors qu'on
 * ne demande pas ce qu'on sait ne pas pouvoir lire.
 */
const TABLES_DU_PORTEUR = ['profiles'];

/**
 * Les lectures qui n'ont pas besoin de la garde, et pourquoi.
 *
 * Leur appelant est **déjà** connecté par construction, et chaque raison est
 * vérifiable à l'endroit qu'elle nomme — sans quoi elle serait une exception
 * décorative.
 */
const SANS_GARDE_DE_LECTURE = new Map([
  [
    'fetchProfile',
    'appelée par `AuthProvider` avec l’identifiant de la session, qui existe par définition',
  ],
  [
    'listerAdhesions',
    'appelée par `AdhesionsBureauScreen`, qui rend « Réservé au bureau » avant de charger',
  ],
]);

/**
 * Les fonctions d'un service qui lisent une table donnée.
 *
 * Le relevé est **par fonction**, et non par fichier : `profiles.ts` en porte
 * trois, dont deux qui n'ont pas à se garder. Un contrôle de fichier aurait été
 * satisfait par la garde de l'une et aurait laissé passer les autres — c'est la
 * même erreur de granularité que `check-accent` a corrigée sur les blocs.
 */
function lecturesDeTable(chemin, table) {
  const source = ts.createSourceFile(
    chemin,
    sansCommentaires(lireFichier(chemin)),
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );

  const motif = new RegExp(`from\\(\\s*['"\`]${table}['"\`]\\s*\\)`);
  const trouvees = [];

  const visiter = (noeud) => {
    const estFonction =
      ts.isFunctionDeclaration(noeud) ||
      ts.isFunctionExpression(noeud) ||
      ts.isArrowFunction(noeud);

    if (estFonction) {
      const texte = noeud.getText(source);

      if (motif.test(texte)) {
        trouvees.push({
          nom: noeud.name === undefined ? '' : noeud.name.getText(source),
          texte,
          lecture: texte.search(motif),
        });
      }

      //  On ne descend pas : le texte d'une fonction contient déjà ses fonctions
      //  imbriquées, et les compter deux fois ferait échouer le contrôle sur une
      //  fonction juste.
      return;
    }

    ts.forEachChild(noeud, visiter);
  };

  visiter(source);

  return trouvees;
}

test('une lecture réservée au porteur d’un jeton se garde, ou dit pourquoi elle ne le fait pas', () => {
  const lectures = SERVICES.flatMap((chemin) =>
    TABLES_DU_PORTEUR.flatMap((table) =>
      lecturesDeTable(chemin, table).map((trouvee) => ({
        ...trouvee,
        fichier: relative(RACINE, chemin).replace(/\\/g, '/'),
      })),
    ),
  );

  //  Sans ce garde-fou, un extracteur qui ne trouve plus rien — motif périmé,
  //  table renommée — rendrait les contrôles suivants verts en ne mesurant rien.
  assert.ok(
    lectures.length >= 3,
    `lectures de ${TABLES_DU_PORTEUR.join(', ')} relevées : ${lectures.length} — ` +
      'l’extraction ne mesure plus rien',
  );

  const fautives = lectures
    .filter(({ nom, texte, lecture }) => {
      if (SANS_GARDE_DE_LECTURE.has(nom)) {
        return false;
      }

      const garde = texte.search(GARDE_DE_SESSION);
      return garde === -1 || garde > lecture;
    })
    .map(({ fichier, nom }) => `${fichier} : ${nom}`);

  assert.deepEqual(
    fautives,
    [],
    'ces fonctions lisent une table que le rôle anonyme ne peut pas lire sans ' +
      'vérifier la session **avant** la lecture : sans jeton la requête est refusée, ' +
      'elle lève, et c’est l’écran entier qui tombe. Les garder, ou les déclarer ' +
      'dans `SANS_GARDE_DE_LECTURE` avec la raison qui rend le cas impossible',
  );

  //  Et une exception ne survit pas à sa cause : une fonction qui se garde
  //  désormais est une justification périmée, qui masquerait un futur défaut.
  const perimees = lectures
    .filter(({ nom, texte, lecture }) => {
      const garde = texte.search(GARDE_DE_SESSION);
      return SANS_GARDE_DE_LECTURE.has(nom) && garde !== -1 && garde < lecture;
    })
    .map(({ nom }) => nom);

  assert.deepEqual(
    perimees,
    [],
    '`SANS_GARDE_DE_LECTURE` nomme une fonction qui se garde déjà : l’exception est périmée',
  );
});
