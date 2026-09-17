/**
 * Vérifie la lecture du lien de réinitialisation de mot de passe
 * (`src/auth/recoveryLink.ts`).
 *
 * POURQUOI CE SCRIPT
 * ------------------
 * C'est le seul endroit du projet qui analyse une adresse venue de
 * l'extérieur. Trois erreurs y sont silencieuses, et toutes les trois coûtent
 * cher :
 *
 *   1. confondre un lien de **confirmation d'inscription** (`type=signup`) avec
 *      un lien de réinitialisation — l'adhérent serait connecté au lieu de se
 *      voir demander un mot de passe ;
 *   2. ne pas reconnaître la forme du fragment, et laisser l'adhérent devant un
 *      écran de connexion qui ne dit rien ;
 *   3. ignorer une **erreur** portée par le lien (lien expiré), ce qui produit
 *      exactement le même silence.
 *
 * Le cas 3 mérite d'être souligné : un lien de réinitialisation se consulte
 * rarement dans la minute. Expiré est le cas **normal**, pas l'exception.
 *
 * CE QUE CE SCRIPT SURVEILLE EN PLUS
 * ----------------------------------
 * Bien lire le lien ne suffit pas. Trois clauses du flux vivent ailleurs, dans
 * `src/auth/AuthProvider.tsx` et `src/navigation/RootNavigator.tsx`, et ce sont
 * des **ordres d'exécution** — `SECURITY.md` le dit lui-même : les inverser ne
 * casse ni la compilation, ni le lint, ni un test. Trois tests, qui lisent la
 * source au lieu de l'exécuter, comblent ce trou.
 *
 * Deux tests de plus tiennent **l'adresse de retour elle-même**. Le schéma est
 * déclaré une seule fois, dans `app.json` (`expo.scheme`), mais l'adresse qu'il
 * produit est recopiée à la main dans les deux documents qui font enregistrer
 * une URL de redirection à l'opérateur — et dans les littéraux de ce fichier.
 * Changer `expo.scheme` laisserait donc la suite entièrement verte, tout en
 * cassant le lien : Supabase refuserait une redirection devenue absente de sa
 * liste, et l'adhérent ne recevrait aucun lien utilisable.
 *
 * Sans dépendance : `node:test` est intégré, et le *type stripping* de Node 22
 * permet d'importer directement le fichier TypeScript.
 */

import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const MODULE = new URL('../src/auth/recoveryLink.ts', import.meta.url).href;

/** Contenu d'un fichier du projet, tel quel — pour ce qui n'est pas du code. */
function lireFichier(cheminRelatif) {
  return readFileSync(fileURLToPath(new URL(`../${cheminRelatif}`, import.meta.url)), 'utf8');
}

/**
 * Source d'un fichier du projet, commentaires retirés.
 *
 * Les commentaires de ce flux parlent beaucoup de `recoverySessionRef`, de
 * `signOut` et de `passwordRecovery` : les laisser en place ferait passer un
 * test de forme sur sa propre documentation.
 */
function lireSource(cheminRelatif) {
  return lireFichier(cheminRelatif)
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1');
}

const { parseRecoveryTokens, describeRecoveryError, RECOVERY_REDIRECT_PATH } = await import(MODULE);

/** Fragment tel que GoTrue le produit avec le flux implicite. */
const IMPLICIT_FRAGMENT =
  '#access_token=jeton-acces&expires_at=1790000000&expires_in=3600' +
  '&refresh_token=jeton-rafraichissement&token_type=bearer&type=recovery';

test('extrait les jetons du fragment produit par le flux implicite', () => {
  const tokens = parseRecoveryTokens(`fcpefl://${IMPLICIT_FRAGMENT}`);

  assert.deepEqual(tokens, {
    accessToken: 'jeton-acces',
    refreshToken: 'jeton-rafraichissement',
  });
});

test('extrait les jetons placés dans la requête', () => {
  const tokens = parseRecoveryTokens(
    'fcpefl://?access_token=jeton-acces&refresh_token=jeton-rafraichissement&type=recovery',
  );

  assert.deepEqual(tokens, {
    accessToken: 'jeton-acces',
    refreshToken: 'jeton-rafraichissement',
  });
});

test("ne prend pas un lien de confirmation d'inscription pour une réinitialisation", () => {
  const signup = IMPLICIT_FRAGMENT.replace('type=recovery', 'type=signup');

  // Le contrôle qui suit n'est pas décoratif : sans lui, le cas ci-dessous
  // pourrait passer pour une simple faute de frappe dans le lien.
  assert.match(signup, /type=signup/);
  assert.equal(parseRecoveryTokens(`fcpefl://${signup}`), null);
});

test('refuse un lien de réinitialisation amputé de son jeton de rafraîchissement', () => {
  const amputee = IMPLICIT_FRAGMENT.replace('&refresh_token=jeton-rafraichissement', '');

  assert.match(amputee, /type=recovery/);
  assert.equal(parseRecoveryTokens(`fcpefl://${amputee}`), null);
});

test("le fragment l'emporte sur la requête quand les deux portent des jetons", () => {
  const tokens = parseRecoveryTokens(
    `fcpefl://?access_token=requete&refresh_token=requete&type=recovery${IMPLICIT_FRAGMENT}`,
  );

  assert.deepEqual(tokens, {
    accessToken: 'jeton-acces',
    refreshToken: 'jeton-rafraichissement',
  });
});

/**
 * Les quatre tests qui suivent sont nés d'un défaut mesuré, et le test qui
 * précède ne pouvait pas le voir : il met `type=recovery` dans la requête **et**
 * dans le fragment, si bien que le fragment réécrivait `type` avec la bonne
 * valeur et masquait la corruption.
 *
 * La cause était une seule expression : la requête était lue avec
 * `url.slice(queryIndex + 1)`, jusqu'à la **fin de la chaîne**. La dernière
 * paire de la requête absorbait donc le début du fragment — dans
 * `?type=recovery#access_token=…`, `type` valait « recovery#access_token=… ».
 * Les deux conséquences étaient silencieuses : un lien valide était refusé sans
 * message, et un lien expiré ne produisait rien du tout.
 */
test('ne laisse pas la dernière paire de la requête absorber le fragment', () => {
  const tokens = parseRecoveryTokens(
    'fcpefl://reinitialisation?type=recovery#access_token=jeton-acces&refresh_token=jeton-rafraichissement',
  );

  assert.deepEqual(tokens, {
    accessToken: 'jeton-acces',
    refreshToken: 'jeton-rafraichissement',
  });
});

test('accepte la même adresse dès qu’une paire suit le type', () => {
  // Contrôle du mécanisme, et non test de discrimination : avec `x=1` après
  // `type`, la corruption tombait sur `x` et le lien passait déjà. Il fixe ce
  // qui était réellement en cause — la dernière paire, pas la requête entière.
  const tokens = parseRecoveryTokens(
    'fcpefl://reinitialisation?type=recovery&x=1#access_token=jeton-acces&refresh_token=jeton-rafraichissement',
  );

  assert.deepEqual(tokens, {
    accessToken: 'jeton-acces',
    refreshToken: 'jeton-rafraichissement',
  });
});

test('explique une erreur du fragment quand le type est dans la requête', () => {
  // Même cause, conséquence plus grave : `describeRecoveryError` renvoyait
  // `null`, donc un lien expiré ne produisait **rien** — exactement le silence
  // que ce fichier existe pour empêcher.
  const message = describeRecoveryError(
    'fcpefl://reinitialisation?type=recovery#error=access_denied&error_code=otp_expired',
  );

  assert.notEqual(message, null, 'un lien expiré doit produire un message');
  assert.match(message, /expiré/);
});

test('ne découpe pas le fragment sur un point d’interrogation', () => {
  // La borne ajoutée s'applique à la requête, pas au fragment : `?` y est un
  // caractère de valeur légitime, et le découper amputerait un jeton.
  const tokens = parseRecoveryTokens('fcpefl://#access_token=a?b&refresh_token=c&type=recovery');

  assert.deepEqual(tokens, { accessToken: 'a?b', refreshToken: 'c' });
});

test('décode les valeurs encodées', () => {
  const tokens = parseRecoveryTokens(
    'fcpefl://#access_token=a%2Bb%3Dc&refresh_token=d%20e&type=recovery',
  );

  assert.deepEqual(tokens, { accessToken: 'a+b=c', refreshToken: 'd e' });
});

test('ne trouve rien dans une adresse sans paramètres', () => {
  assert.equal(parseRecoveryTokens('fcpefl://'), null);
  assert.equal(parseRecoveryTokens('fcpefl://#'), null);
});

test("explique un lien expiré, au lieu de laisser l'écran muet", () => {
  const message = describeRecoveryError(
    'fcpefl://#error=access_denied&error_code=otp_expired' +
      '&error_description=Email+link+is+invalid+or+has+expired&type=recovery',
  );

  assert.notEqual(message, null, 'un lien expiré doit produire un message');
  assert.match(message, /expiré/);
  // Le message d'origine est en anglais et destiné aux journaux : il ne doit
  // pas se retrouver sous les yeux d'un adhérent.
  assert.doesNotMatch(message, /invalid or has expired/);
});

test('explique aussi une erreur sans code précis', () => {
  const message = describeRecoveryError('fcpefl://#error=server_error&type=recovery');

  assert.notEqual(message, null);
  assert.match(message, /Demandez-en un nouveau/);
});

test("ignore l'erreur d'un autre flux", () => {
  const message = describeRecoveryError('fcpefl://#error=access_denied&type=signup');

  assert.equal(message, null, "l'erreur d'inscription ne concerne pas la réinitialisation");
});

test("n'annonce pas d'erreur sur une adresse qui n'en porte pas", () => {
  assert.equal(describeRecoveryError(`fcpefl://${IMPLICIT_FRAGMENT}`), null);
  assert.equal(describeRecoveryError('fcpefl://'), null);
});

test('un lien expiré ne fournit aucun jeton', () => {
  const expire = 'fcpefl://#error=access_denied&error_code=otp_expired&type=recovery';

  assert.equal(parseRecoveryTokens(expire), null);
  assert.notEqual(describeRecoveryError(expire), null);
});

// --- Les ordres d'exécution du flux de récupération -------------------------
//
// Ces trois tests lisent la source au lieu de l'exécuter. Ce n'est pas un
// pis-aller : les clauses surveillées ne sont observables ni par un type, ni par
// un lint, ni par un rendu — il faudrait monter le fournisseur, simuler un lien
// entrant et compter les rendus. Comparer des positions, elles, est exact, et
// l'échec nomme la clause fautive.

const AUTH_PROVIDER = 'src/auth/AuthProvider.tsx';

/**
 * Extrait le corps d'une fonction, de son en-tête à la borne qui la suit.
 *
 * La borne est explicite plutôt que devinée. Découper « jusqu'à la fin du
 * fichier » ferait entrer dans la comparaison du code sans rapport, et ferait
 * échouer le test pour une raison étrangère à l'ordre surveillé.
 */
function corpsDeFonction(source, enTete, borneSuivante) {
  const debut = source.indexOf(enTete);
  assert.notEqual(debut, -1, `en-tête introuvable : ${enTete}`);

  const fin = source.indexOf(borneSuivante, debut);
  assert.notEqual(fin, -1, `borne introuvable après « ${enTete} » : ${borneSuivante}`);

  return source.slice(debut, fin);
}

/**
 * Position d'un motif, avec ses deux garde-fous.
 *
 * Un test d'ordre sans ces contrôles peut passer à vide : un motif **absent**
 * rendrait `-1`, donc « avant » n'importe quoi, et un motif **présent deux
 * fois** comparerait la mauvaise paire. Les deux cas échouent ici, avec un
 * message qui dit lequel.
 */
function position(ou, motif) {
  const index = ou.indexOf(motif);
  assert.notEqual(index, -1, `motif absent du code surveillé : ${motif}`);
  assert.equal(
    ou.indexOf(motif, index + 1),
    -1,
    `motif présent plusieurs fois, la comparaison d'ordre serait trompeuse : ${motif}`,
  );
  return index;
}

test("RootNavigator refuse l'entrée tant que le mot de passe n'est pas choisi", () => {
  const source = lireSource('src/navigation/RootNavigator.tsx');

  const condition = source.match(/const entersApplication = ([^;]+);/);
  assert.notEqual(condition, null, "la condition d'entrée doit être nommée pour être lisible");
  assert.match(condition[1], /status === 'signedIn'/, "l'entrée suppose une session ouverte");
  assert.match(
    condition[1],
    /!passwordRecovery/,
    "l'entrée suppose la récupération close : sans ce terme, le lien ouvre l'application",
  );

  // La garde ne protège rien si l'écran de l'application n'est pas derrière elle.
  const garde = position(source, 'entersApplication ? (');
  const application = position(source, '<Stack.Screen name="Application"');
  const connexion = position(source, '<Stack.Screen name="Connexion"');

  assert.ok(
    garde < application && application < connexion,
    "l'écran de l'application doit être la branche gardée, et la connexion l'alternative",
  );
});

test('le drapeau de récupération est levé avant `setSession`', () => {
  const source = lireSource(AUTH_PROVIDER);
  const corps = corpsDeFonction(
    source,
    'const handleUrl = (url: string | null): void => {',
    'void Linking.getInitialURL()',
  );

  const drapeau = position(corps, 'passwordRecovery: true');
  const session = position(corps, '.setSession(');

  assert.ok(
    drapeau < session,
    '`setSession` déclenche `onAuthStateChange` avant de rendre la main : lever le drapeau ' +
      'après laisserait passer un rendu « connecté sans récupération », et RootNavigator ' +
      "monterait l'application, ses quatre écrans compris",
  );
});

test('« Annuler » attend la session du lien avant de déconnecter', () => {
  const source = lireSource(AUTH_PROVIDER);
  const corps = corpsDeFonction(
    source,
    'const cancelPasswordRecovery = useCallback(',
    'const dismissRecoveryError = useCallback(',
  );

  const attente = position(corps, 'await recoverySessionRef.current;');
  const deconnexion = position(corps, 'await signOut();');

  assert.ok(
    attente < deconnexion,
    'la session du lien doit être attendue avant la déconnexion : sinon elle arrive après, ' +
      "et « Annuler » rouvre ce qu'il vient de fermer",
  );
});

// --- L'adresse de retour, et les fichiers qui la nomment --------------------
//
// Le schéma est déclaré **une fois**, dans `app.json` (`expo.scheme`), et tout le
// reste en découle : `Linking.createURL('reinitialisation')` produit
// `<schéma>://reinitialisation`. Vérifié en lisant `expo-linking` 57.0.10 —
// `resolveScheme` concatène le schéma général puis les schémas par plateforme
// (`collectManifestSchemes`) et retient **le premier**, et `createURL` recolle
// `<schéma>:` + `/` + `/` + `<chemin>`.
//
// Or cette adresse est **recopiée à la main** ailleurs : dans les deux documents
// qui demandent à l'opérateur de l'enregistrer dans les « Redirect URLs » de
// Supabase, et dans les littéraux de ce fichier, qui écrit le schéma en dur
// dix-huit fois.
//
// Changer `expo.scheme` ne casse donc rien de visible : Supabase refuse la
// redirection, puisque l'adresse enregistrée n'est plus celle que l'application
// produit, le lien ne revient pas dans l'application — et **toute la suite reste
// verte**, ce fichier compris, qui éprouverait alors un schéma que l'application
// n'utilise plus. C'est la pire des configurations : la couverture paraît
// intacte.

const APP_CONFIG = 'app.json';
const DOCUMENTS_QUI_ENREGISTRENT = ['README.md', 'supabase/README.md'];

/** Schéma déclaré dans `app.json`, et l'adresse de retour qui en découle. */
function adresseDeRetour() {
  const { expo } = JSON.parse(lireFichier(APP_CONFIG));
  const schema = expo?.scheme;

  assert.equal(typeof schema, 'string', '`app.json` doit déclarer `expo.scheme`');
  assert.notEqual(schema.trim(), '', '`expo.scheme` ne doit pas être vide');

  // RFC 3986 : un schéma commence par une lettre et n'admet que des minuscules,
  // des chiffres, « + », « - » et « . ». Une majuscule ou un souligné produirait
  // une adresse qui ne correspondrait pas à celle enregistrée chez Supabase.
  assert.match(
    schema,
    /^[a-z][a-z0-9+.-]*$/,
    `« ${schema} » n'est pas un schéma d'URL valide : minuscules, chiffres, ` +
      '« + », « - » et « . » seulement, et une lettre pour commencer',
  );

  return { schema, adresse: `${schema}://${RECOVERY_REDIRECT_PATH}` };
}

/** Toutes les adresses de retour nommées dans un texte, quel qu'en soit le schéma. */
function adressesNommees(texte) {
  const motif = new RegExp(`([a-z][a-z0-9+.-]*):\\/\\/${RECOVERY_REDIRECT_PATH}\\b`, 'g');
  return [...texte.matchAll(motif)].map(([, schema]) => `${schema}://${RECOVERY_REDIRECT_PATH}`);
}

test("les documents qui font enregistrer l'adresse de retour nomment celle de l'application", () => {
  const { adresse } = adresseDeRetour();

  for (const document of DOCUMENTS_QUI_ENREGISTRENT) {
    // Vérifier la présence du bon ne suffit pas : c'est l'absence du **mauvais**
    // qu'il faut établir. Un document qui porterait encore l'ancien schéma à côté
    // du nouveau ferait enregistrer une adresse que l'application ne produit
    // plus — et l'entrée correcte, présente elle aussi, ne servirait à rien.
    const nommees = adressesNommees(lireFichier(document));
    assert.notEqual(
      nommees.length,
      0,
      `${document} ne nomme aucune adresse de retour : le contrôle serait vide`,
    );

    for (const nommee of nommees) {
      assert.equal(
        nommee,
        adresse,
        `${document} fait enregistrer « ${nommee} » dans Supabase, alors que ` +
          `l'application produit « ${adresse} » : Supabase refuserait la redirection, ` +
          "et le lien ne reviendrait pas dans l'application",
      );
    }
  }
});

test("les tests du flux éprouvent le schéma que l'application déclare", () => {
  const { schema } = adresseDeRetour();
  const dossier = fileURLToPath(new URL('.', import.meta.url));

  // Commentaires retirés : ce sont les **littéraux** qui sont éprouvés, pas la
  // prose qui les explique. Et seuls les schémas personnalisés sont surveillés —
  // `https` est légitime dans un test qui valide une URL de projet Supabase, et
  // ne dit rien de l'adresse de retour.
  const schemas = new Set();
  for (const nom of readdirSync(dossier).filter((fichier) => fichier.endsWith('.test.mjs'))) {
    for (const [, trouve] of lireSource(`scripts/${nom}`).matchAll(/\b([a-z][a-z0-9+.-]*):\/\//g)) {
      if (trouve !== 'http' && trouve !== 'https') {
        schemas.add(trouve);
      }
    }
  }

  assert.notEqual(
    schemas.size,
    0,
    'aucun schéma personnalisé dans les tests : ce contrôle ne vérifie plus rien',
  );
  assert.deepEqual(
    [...schemas].sort(),
    [schema],
    `les tests éprouvent « ${[...schemas].join(' », « ')} » alors que l'application ` +
      `déclare « ${schema} » : ils resteraient verts en éprouvant une adresse que ` +
      "l'application ne produit pas",
  );
});
