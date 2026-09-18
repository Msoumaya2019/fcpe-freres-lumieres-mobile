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
 * réponse fausse avec l'assurance d'une réponse vraie. Le test qui suit garde la
 * bonne portée, et il tient une propriété qu'aucun autre banc ne voyait : un
 * écran que rien ne monte passe le typage, le lint et le contrôle des contrastes,
 * et il reste mort.
 */

import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
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
 * Toutes les sources de l'application : `src/`, plus les deux fichiers de la
 * racine qui montent le reste.
 *
 * `App.tsx` est **indispensable** ici. C'est lui qui monte `ConfigurationScreen`,
 * l'écran de secours affiché quand les clés d'API manquent — et un relevé qui
 * s'arrête à `src/` conclut à tort qu'aucune route ne l'atteint. L'erreur a été
 * commise à la main, juste avant d'écrire ce test ; `check-env-guard` avait déjà
 * la bonne portée pour la même raison.
 */
function sourcesDeLApplication() {
  return [
    ...fichiersSous('src', ['.ts', '.tsx']),
    join(RACINE, 'App.tsx'),
    join(RACINE, 'index.ts'),
  ].map((chemin) => sansCommentaires(lireFichier(chemin)));
}

test('aucun écran n’est orphelin : chacun est monté quelque part', () => {
  // Un écran que rien ne monte passe le typage, le lint, le contrôle des
  // contrastes et tous les autres bancs — et il reste **mort**. Le cas est
  // d'autant plus traître qu'il est invisible à la relecture : le fichier
  // ressemble à tous les autres, et c'est son absence d'une ligne ailleurs qui
  // fait le défaut. Le dossier est la source de vérité : un écran ajouté entre
  // donc dans ce contrôle sans qu'on y pense.
  assert.ok(ECRANS.length > 0, 'aucun fichier dans `src/screens` : le test ne vérifierait rien');

  const sources = sourcesDeLApplication();
  const orphelins = [];

  for (const chemin of ECRANS) {
    const relatif = relative(RACINE, chemin).replace(/\\/g, '/');
    const noms = [
      ...sansCommentaires(lireFichier(chemin)).matchAll(
        /export\s+(?:const|function|class)\s+([A-Za-z_$][\w$]*)/g,
      ),
    ].map((trouve) => trouve[1]);

    // Zéro export signifie que le motif ne correspond plus : le test deviendrait
    // vert en ne mesurant rien, ce qui est le pire des états.
    assert.ok(noms.length > 0, `${relatif} : aucun export de composant relevé`);

    for (const nom of noms) {
      // Le nom doit apparaître **au moins deux fois** hors commentaires : sa
      // déclaration, et l'endroit qui le monte. Un nom cité seulement dans un
      // commentaire ne compte pas — d'où le retrait préalable.
      const motif = new RegExp(`\\b${nom.replace(/\$/g, '\\$')}\\b`, 'g');
      const occurrences = sources.reduce(
        (total, source) => total + (source.match(motif) ?? []).length,
        0,
      );

      if (occurrences < 2) {
        orphelins.push(`${relatif} : « ${nom} » n'apparaît qu'à sa déclaration`);
      }
    }
  }

  assert.deepEqual(
    orphelins,
    [],
    "un écran que rien ne monte est un écran que l'adhérent ne verra jamais",
  );
});
