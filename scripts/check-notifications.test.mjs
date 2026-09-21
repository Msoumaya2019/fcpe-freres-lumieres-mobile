/**
 * =============================================================================
 *  Les notifications : deux moitiés, et ce qui les relie
 * =============================================================================
 *
 *  L'application demande l'autorisation dans `src/services/push.ts` et dépose
 *  le jeton dans `src/services/notifications.ts`. Cette séparation n'est pas
 *  décorative — l'en-tête du second fichier l'explique : il se vérifie sans
 *  appareil, sans émulateur et sans dépendance native, ce qui ne serait plus
 *  vrai si le paquet natif y entrait.
 *
 *  Un commentaire qui affirme une propriété universelle est une affirmation
 *  vérifiable — c'est la leçon qui a fondé `check-async-wiring`, et elle
 *  s'applique ici mot pour mot. Ce banc la rend exécutable.
 *
 *  LES CINQ PROPRIÉTÉS TENUES
 *  --------------------------
 *  1. **La frontière est réelle.** Le fichier qui écrit en base n'importe pas
 *     `expo-notifications` : la séparation survit à la prochaine modification,
 *     et non à la vigilance du prochain lecteur.
 *  2. **Le paquet natif n'entre qu'une fois.** Un second module qui l'importerait
 *     ferait deux demandes d'autorisation, ou deux gestionnaires de notification
 *     — dont le dernier posé gagne, sans que rien ne le signale. La liste est
 *     donc fermée : un nouvel import est une décision, pas un glissement.
 *  3. **Le canal Android est le même mot des deux côtés.** `push.ts` crée un
 *     canal à l'exécution ; `app.json` désigne ce même canal au manifeste, par
 *     `defaultChannel`. Rien ne les relie : deux copies d'une vérité, dont la
 *     divergence est **silencieuse** — un message poussé sans `channelId`
 *     atterrirait dans un canal que personne n'a configuré, et sur Android 8 et
 *     au-delà il ne s'afficherait pas. C'est le motif de
 *     `faire-tenir-un-accord-entre-deux-sources`, appliqué à une chaîne.
 *  4. **Le service est réellement monté.** Une préparation écrite et jamais
 *     appelée passerait le typage, le lint et ce fichier — si ce fichier ne
 *     lisait que les services. Elle est appelée depuis `App.tsx`, et c'est un
 *     **appel** qui est exigé, lu dans l'arbre syntaxique : une mention dans un
 *     commentaire ou un import conservé ne satisfait pas la relation, comme
 *     `check-async-wiring` l'a mesuré sur un écran devenu inatteignable.
 *  5. **L'invitation est montée, et elle ne double pas le service.** Ajoutée le
 *     21 septembre 2026 avec `InvitationNotifications`. Trois choses, et chacune
 *     a son défaut propre : un composant **monté** (écrit et jamais affiché, il
 *     ne pose jamais la question), qui **passe par le service** (l'appel direct
 *     à `requestPermissionsAsync` en ferait un second importateur, contre la
 *     propriété 2), et qui **écrit sa marque** avec la bonne clé (sans elle,
 *     « Plus tard » ne change pas l'état du système, et la question revient à
 *     chaque ouverture jusqu'à obtenir un refus définitif).
 *
 *  CE QUE CE BANC NE PEUT PAS VOIR
 *  -------------------------------
 *  Il ne peut pas voir si une notification **arrive**. Cela dépend de la clef de
 *  compte de service Firebase, déposée chez EAS et absente de ce dépôt — un
 *  binaire peut être vert, contenir tout ce qui précède, et ne rien recevoir. Ce
 *  qui est tenu ici est la forme du câblage, pas la délivrance.
 *
 *  Il ne peut pas non plus voir **quand** l'invitation s'affiche : les trois
 *  conditions qui la déclenchent — la marque absente, l'état `jamaisDemandees`,
 *  le chargement terminé — vivent dans un effet, et aucun banc de ce dépôt ne
 *  monte de composant. Ce qui est tenu est le câblage de ses dépendances, pas
 *  son déclenchement.
 *
 *  Et il ne juge pas le **contenu** des phrases de l'écran Réglages : une phrase
 *  fausse y passerait. C'est la limite commune de tous les bancs de forme de ce
 *  dépôt, et elle est écrite ici pour que le prochain lecteur sache où s'arrête
 *  la garantie.
 */

import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

import ts from 'typescript';

const RACINE = fileURLToPath(new URL('../', import.meta.url));

/** Le module natif, nommé une fois : c'est lui que les quatre contrôles traquent. */
const PAQUET = 'expo-notifications';

/** Les deux moitiés, et le fichier qui monte la seconde. */
const MOITIE_QUI_DEMANDE = 'src/services/push.ts';
const MOITIE_QUI_ECRIT = 'src/services/notifications.ts';
const POINT_DE_MONTAGE = 'App.tsx';

/** La question posée une fois, à la première ouverture. */
const INVITATION = 'src/components/InvitationNotifications.tsx';

function lire(relatif) {
  return readFileSync(join(RACINE, relatif), 'utf8');
}

/** L'arbre syntaxique d'un fichier du dépôt, en TSX — `App.tsx` en a besoin. */
function arbre(relatif, source = lire(relatif)) {
  return ts.createSourceFile(relatif, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
}

/**
 * Les modules importés par un source.
 *
 * L'arbre, et non un motif sur le texte : un fichier qui **parle** d'un import
 * dans un commentaire ne l'écrit pas, et un motif ne sait pas faire la
 * différence. C'est la même raison que partout ailleurs dans `scripts/`.
 */
function imports(source, nom = 'temoin.ts') {
  const trouves = [];

  for (const declaration of arbre(nom, source).statements) {
    if (ts.isImportDeclaration(declaration) && ts.isStringLiteral(declaration.moduleSpecifier)) {
      trouves.push(declaration.moduleSpecifier.text);
    }
  }

  return trouves;
}

/** Les fonctions appelées dans un source, par leur nom tel qu'il est écrit. */
function appels(source, nom = 'temoin.tsx') {
  const trouves = new Set();

  const visiter = (noeud) => {
    if (ts.isCallExpression(noeud)) {
      trouves.add(noeud.expression.getText());
    }
    ts.forEachChild(noeud, visiter);
  };

  visiter(arbre(nom, source));

  return trouves;
}

/** Les fichiers TypeScript de `src/`, en relatif et en chemins POSIX. */
function fichiersDeSrc() {
  return readdirSync(join(RACINE, 'src'), { recursive: true })
    .filter((nom) => typeof nom === 'string' && /\.tsx?$/.test(nom))
    .map((nom) => `src/${nom.replace(/\\/g, '/')}`);
}

/**
 * Les composants réellement **montés** dans un source.
 *
 * Un import n'est pas un montage : `import { X } from '…'` sans `<X />` laisse
 * le composant mort, et c'est exactement la forme de défaut que la propriété 5
 * surveille. Le nom est lu dans le nœud JSX, pas dans le texte — un composant
 * nommé dans un commentaire n'est pas monté.
 */
function montes(source, nom = 'temoin.tsx') {
  const trouves = new Set();

  const visiter = (noeud) => {
    if (ts.isJsxOpeningElement(noeud) || ts.isJsxSelfClosingElement(noeud)) {
      trouves.add(noeud.tagName.getText());
    }
    ts.forEachChild(noeud, visiter);
  };

  visiter(arbre(nom, source));

  return trouves;
}

/**
 * Les arguments avec lesquels une fonction est appelée.
 *
 * Une **valeur**, et non un motif : `ecrirePreference(INVITATION_NOTIFICATIONS,
 * 'vue')` est ce qui est exigé, et non « le fichier parle de la marque ». C'est
 * la même exigence que partout ailleurs dans `scripts/` — un appel dont on ne
 * lit pas les arguments ne dit rien de ce qu'il écrit.
 */
function argumentsDe(source, fonction, nom = 'temoin.tsx') {
  const trouves = [];

  const visiter = (noeud) => {
    if (ts.isCallExpression(noeud) && noeud.expression.getText() === fonction) {
      trouves.push(noeud.arguments.map((argument) => argument.getText()));
    }
    ts.forEachChild(noeud, visiter);
  };

  visiter(arbre(nom, source));

  return trouves;
}

/** Les options du greffon, ou `undefined` quand il n'est pas déclaré. */
function optionsDuGreffon(plugins, nom) {
  for (const entree of plugins) {
    if (entree === nom) {
      return null;
    }
    if (Array.isArray(entree) && entree[0] === nom) {
      return entree[1] ?? null;
    }
  }

  return undefined;
}

test('le témoin : les deux extractions distinguent un import réel d’une mention', () => {
  // Sans ce témoin, un motif cassé rendrait un ensemble vide — et un ensemble
  // vide se lit comme un succès, ce qui est le pire des états pour un banc.
  assert.deepEqual(
    imports("import * as N from 'expo-notifications';\nimport { Platform } from 'react-native';"),
    ['expo-notifications', 'react-native'],
  );

  // Le piège que l'arbre évite et qu'un motif ne verrait pas.
  assert.deepEqual(imports('// import * as N from "expo-notifications";\nconst x = 1;'), []);

  assert.ok(appels('void preparerNotifications();').has('preparerNotifications'));
  assert.equal(appels('// preparerNotifications();').has('preparerNotifications'), false);

  // Le montage, qui est une autre relation que l'appel : un composant peut
  // être importé sans jamais figurer dans l'arbre rendu.
  assert.ok(montes('<InvitationNotifications />').has('InvitationNotifications'));
  assert.equal(montes('// <InvitationNotifications />').has('InvitationNotifications'), false);

  assert.deepEqual(argumentsDe("ecrirePreference(CLE, 'vue');", 'ecrirePreference'), [
    ['CLE', "'vue'"],
  ]);
  assert.deepEqual(argumentsDe("// ecrirePreference(CLE, 'vue');", 'ecrirePreference'), []);
});

test('la moitié qui écrit en base n’importe pas le paquet natif', () => {
  // La propriété que l'en-tête de ce fichier affirme, et la raison pour laquelle
  // il existe deux fichiers plutôt qu'un.
  assert.ok(
    imports(lire(MOITIE_QUI_ECRIT), MOITIE_QUI_ECRIT).length > 0,
    `${MOITIE_QUI_ECRIT} n'importe plus rien : ce contrôle ne mesurerait rien`,
  );

  assert.equal(
    imports(lire(MOITIE_QUI_ECRIT), MOITIE_QUI_ECRIT).includes(PAQUET),
    false,
    `${MOITIE_QUI_ECRIT} importe « ${PAQUET} » : l'écriture du jeton n'est plus ` +
      'vérifiable sans appareil ni module natif, alors que son en-tête le promet',
  );
});

test('un seul module de `src/` importe le paquet natif, et c’est celui qui demande', () => {
  const importateurs = fichiersDeSrc().filter((relatif) =>
    imports(lire(relatif), relatif).includes(PAQUET),
  );

  assert.deepEqual(
    importateurs,
    [MOITIE_QUI_DEMANDE],
    `les modules qui importent « ${PAQUET} » ont changé. Deux importateurs feraient ` +
      'deux gestionnaires de notification, dont le dernier posé gagne en silence ; ' +
      'aucun laisserait la préparation du démarrage sans module natif. Si ce ' +
      'changement est voulu, c’est cette liste qu’il faut écrire — et le fichier ' +
      'qui entre doit être un choix, pas un glissement',
  );
});

test('le canal Android est le même mot dans `push.ts` et dans `app.json`', () => {
  // Deux copies d'une même vérité, et rien pour les relier : `push.ts` crée le
  // canal à l'exécution, `app.json` le désigne au manifeste. Un désaccord ne
  // casse rien à la compilation, ne lève rien à l'exécution — et sur Android 8
  // et au-delà, une notification sans canal ne s'affiche pas.
  const declaration = /const CANAL = '([^']+)'/.exec(lire(MOITIE_QUI_DEMANDE));
  assert.notEqual(
    declaration,
    null,
    `${MOITIE_QUI_DEMANDE} ne déclare plus \`CANAL\` : ce contrôle ne porterait sur rien`,
  );

  const app = JSON.parse(lire('app.json'));
  const options = optionsDuGreffon(app.expo.plugins, PAQUET);

  assert.notEqual(
    options,
    undefined,
    `le greffon « ${PAQUET} » n'est plus déclaré dans \`app.json\` : le canal n'est ` +
      "plus annoncé au manifeste, et le service qui l'ouvre à l'exécution ne suffit pas",
  );
  assert.notEqual(
    options,
    null,
    `le greffon « ${PAQUET} » est déclaré sans options : \`defaultChannel\` manque`,
  );

  assert.equal(
    options.defaultChannel,
    declaration[1],
    `le canal vaut « ${declaration[1]} » dans ${MOITIE_QUI_DEMANDE} et ` +
      `« ${String(options.defaultChannel)} » dans \`app.json\` : le manifeste désigne ` +
      'un canal que personne ne crée, et la notification ne s’affiche pas',
  );
});

test('la préparation du démarrage est appelée depuis le point d’entrée', () => {
  // Un service que rien n'appelle passe le typage, le lint et le contrôle
  // précédent : il est mort, et sa mort ressemble exactement à la vie.
  const source = lire(POINT_DE_MONTAGE);

  assert.ok(
    imports(source, POINT_DE_MONTAGE).includes('@/services/push'),
    `${POINT_DE_MONTAGE} n'importe plus \`@/services/push\` : rien ne prépare les ` +
      'notifications, et l’application n’en recevra jamais',
  );

  assert.ok(
    appels(source, POINT_DE_MONTAGE).has('preparerNotifications'),
    `${POINT_DE_MONTAGE} importe \`@/services/push\` sans appeler ` +
      '`preparerNotifications()` : un import n’est pas un appel — c’est exactement ' +
      'le défaut qu’un relevé de mentions laisse passer',
  );
});

test('la question de la première ouverture est montée, et passe par le service', () => {
  const source = lire(INVITATION);

  //  1. Montée. Un composant écrit et jamais affiché passe le typage, le lint,
  //  le contrôle de la liste fermée des importateurs — et ne pose jamais la
  //  question. Sa mort ressemble exactement à sa vie.
  assert.ok(
    montes(lire(POINT_DE_MONTAGE), POINT_DE_MONTAGE).has('InvitationNotifications'),
    `${POINT_DE_MONTAGE} n’affiche plus <InvitationNotifications /> : la question ` +
      'de la première ouverture n’est jamais posée, et rien ne le signale',
  );

  //  2. Par le service. Appeler `Notifications.requestPermissionsAsync()` ici
  //  ferait un second importateur du paquet natif — la liste fermée de la
  //  propriété 2 le refuserait — et déplacerait la seule porte du système hors
  //  de `push.ts`, où elle est nommée et éprouvée.
  assert.ok(
    appels(source, INVITATION).has('demanderNotifications'),
    `${INVITATION} n’appelle plus \`demanderNotifications\` : l’invitation ne peut ` +
      'plus ouvrir la boîte du système, ou l’ouvre par un chemin que rien ne relit',
  );
  assert.ok(
    appels(source, INVITATION).has('etatPush'),
    `${INVITATION} ne lit plus l’état des notifications : elle ne peut donc plus ` +
      'savoir si la question a déjà été posée par le système',
  );

  //  3. La marque, et avec la bonne clé. Sans elle, « Plus tard » ne change pas
  //  l’état du système : la question reviendrait à chaque ouverture.
  assert.ok(
    argumentsDe(source, 'ecrirePreference', INVITATION).some(
      ([cle]) => cle === 'INVITATION_NOTIFICATIONS',
    ),
    `${INVITATION} n’écrit plus la marque \`INVITATION_NOTIFICATIONS\` : ` +
      '« Plus tard » laisserait l’état du système à `undetermined`, et la question ' +
      'reviendrait à chaque ouverture — jusqu’au refus définitif qu’on voulait éviter',
  );
});
