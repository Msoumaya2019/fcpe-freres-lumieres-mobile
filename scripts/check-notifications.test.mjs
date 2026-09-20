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
 *  LES QUATRE PROPRIÉTÉS TENUES
 *  ---------------------------
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
 *
 *  CE QUE CE BANC NE PEUT PAS VOIR
 *  -------------------------------
 *  Il ne peut pas voir si une notification **arrive**. Cela dépend de la clef de
 *  compte de service Firebase, déposée chez EAS et absente de ce dépôt — un
 *  binaire peut être vert, contenir tout ce qui précède, et ne rien recevoir. Ce
 *  qui est tenu ici est la forme du câblage, pas la délivrance.
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
