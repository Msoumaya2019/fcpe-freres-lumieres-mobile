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
 * Quatre tests de plus tiennent **les adresses de retour elles-mêmes**. Le schéma
 * est déclaré une seule fois, dans `app.json` (`expo.scheme`), mais les adresses
 * qu'il produit sont recopiées à la main dans les deux documents qui font
 * enregistrer une URL de redirection à l'opérateur — et dans les littéraux de ce
 * fichier. Changer `expo.scheme` laisserait donc la suite entièrement verte, tout
 * en cassant les liens : Supabase refuserait une redirection devenue absente de
 * sa liste, et l'adhérent ne recevrait aucun lien utilisable.
 *
 * Elles vivent dans `src/auth/redirectPaths.ts` et forment un ensemble **fermé** :
 * une constante ajoutée au module sans figurer dans `REDIRECT_PATHS` fait tomber
 * le banc, parce qu'elle serait produite par l'application sans jamais être
 * réclamée à l'opérateur — un lien refusé en silence.
 *
 * CE QUE LE CONTRÔLE DES DOCUMENTS NE PEUT PAS VOIR
 * -------------------------------------------------
 * Il compare l'ensemble des adresses **nommées** dans un document à celles que
 * l'application produit. Il ne dit rien de la **phrase** qui les entoure : le
 * paragraphe qui demande d'ajouter les entrées peut être remplacé par de la
 * prose, les adresses restant nommées ailleurs, et le banc reste vert. Mesuré
 * comme tel — c'est une limite, pas un oubli.
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

const { parseRecoveryTokens, describeLinkError, isEmailConfirmationLink } = await import(MODULE);

// Les adresses de retour vivent dans leur propre module, et non dans celui-ci :
// ce sont des valeurs **sortantes**, que l'opérateur doit recopier dans le
// tableau de bord. Les mêler à la lecture des liens entrants laissait croire
// que ce fichier-là en était la source.
const cheminModule = await import(new URL('../src/auth/redirectPaths.ts', import.meta.url).href);
const { REDIRECT_PATHS } = cheminModule;

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
  // Même cause, conséquence plus grave : `describeLinkError` renvoyait
  // `null`, donc un lien expiré ne produisait **rien** — exactement le silence
  // que ce fichier existe pour empêcher.
  const message = describeLinkError(
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
  const message = describeLinkError(
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
  const message = describeLinkError('fcpefl://#error=server_error&type=recovery');

  assert.notEqual(message, null);
  assert.match(message, /Demandez-en un nouveau/);
});

test("reconnaît le retour d'un lien de confirmation abouti", () => {
  const confirmation =
    'fcpefl://confirmation#access_token=jeton-acces&expires_in=3600' +
    '&refresh_token=jeton-rafraichissement&token_type=bearer&type=signup';

  assert.equal(isEmailConfirmationLink(confirmation), true);
});

test("n'annonce pas une confirmation sans preuve qu'elle a abouti", () => {
  const abouti = `fcpefl://confirmation${IMPLICIT_FRAGMENT.replace('type=recovery', 'type=signup')}`;

  // Le témoin d'abord : sans lui, les refus ci-dessous pourraient passer pour
  // des adresses mal formées plutôt que pour des décisions.
  assert.equal(isEmailConfirmationLink(abouti), true);

  // 1. Le `type` seul ne prouve rien. C'est le jeton d'accès — joint par GoTrue
  //    **après** validation du lien côté serveur — qui atteste la confirmation.
  assert.equal(isEmailConfirmationLink('fcpefl://confirmation#type=signup'), false);

  // 2. Un lien expiré, tel que GoTrue le renvoie : `type=signup`, une erreur,
  //    et **aucun** jeton. Ce cas est déjà écarté par la condition précédente —
  //    c'est voulu, et le test suivant mesure la condition qui reste.
  assert.equal(
    isEmailConfirmationLink(
      'fcpefl://confirmation#error=access_denied&error_code=otp_expired&type=signup',
    ),
    false,
  );

  // 3. Une réinitialisation n'est pas une confirmation, même avec un jeton.
  assert.equal(isEmailConfirmationLink(`fcpefl://${IMPLICIT_FRAGMENT}`), false);

  // 4. Le **chemin** ne dit rien : `fcpefl://confirmation` sans paramètres est
  //    une adresse que GoTrue ne produit jamais. La confondre avec une
  //    confirmation ferait annoncer un succès sur une URL vide.
  assert.equal(isEmailConfirmationLink('fcpefl://confirmation'), false);
});

test("une erreur l'emporte sur un jeton, si les deux arrivent ensemble", () => {
  // **Ce cas n'est pas produit par GoTrue aujourd'hui** : un échec ne porte
  // aucun jeton, et la condition sur `access_token` suffit donc à l'écarter.
  // Le contrôle sur l'erreur est un garde-fou, et il est mesuré **comme tel**.
  //
  // Il fallait un cas où les deux signaux coexistent, sans quoi le retirer ne
  // faisait tomber aucun banc : c'est ce que la falsification a montré, le cas
  // « lien expiré » passant alors pour une mauvaise raison.
  assert.equal(
    isEmailConfirmationLink(
      'fcpefl://confirmation#access_token=jeton-acces&type=signup&error_code=otp_expired',
    ),
    false,
  );
});

test("traduit aussi l'erreur d'un lien de confirmation", () => {
  // Ce cas a changé de camp, et c'est le cœur de cette passe : l'erreur d'un
  // lien de confirmation était écartée **sans message**, comme s'il ne s'était
  // rien passé. Or c'est le cas le plus coûteux des deux — l'adresse n'est pas
  // confirmée, donc l'adhérent ne peut pas se connecter, et rien ne le lui dit.
  const expire = describeLinkError(
    'fcpefl://#error=access_denied&error_code=otp_expired&type=signup',
  );

  assert.notEqual(expire, null, "l'échec d'une confirmation doit produire un message");
  assert.match(expire, /confirmé/, 'le message doit nommer ce qui manque : la confirmation');
  assert.match(
    expire,
    /demandez un nouvel e-mail de confirmation/,
    'le message doit indiquer le remède, qui est désormais dans l’application',
  );
  assert.doesNotMatch(
    expire,
    /réinitialisation|mot de passe/,
    "un lien de confirmation ne doit pas envoyer l'adhérent vers le mot de passe",
  );
});

test("ignore l'erreur d'un flux que l'application ne connaît pas", () => {
  // `email_change` n'a ni écran ni traitement ici : lui donner le message d'un
  // autre flux enverrait l'adhérent vers une action qui n'existe pas.
  assert.equal(describeLinkError('fcpefl://#error=access_denied&type=email_change'), null);
  assert.equal(describeLinkError('fcpefl://#error=access_denied&type=invite'), null);
});

test("n'annonce pas d'erreur sur une adresse qui n'en porte pas", () => {
  assert.equal(describeLinkError(`fcpefl://${IMPLICIT_FRAGMENT}`), null);
  assert.equal(describeLinkError('fcpefl://'), null);
});

test('un lien expiré ne fournit aucun jeton', () => {
  const expire = 'fcpefl://#error=access_denied&error_code=otp_expired&type=recovery';

  assert.equal(parseRecoveryTokens(expire), null);
  assert.notEqual(describeLinkError(expire), null);
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
    'const dismissLinkMessage = useCallback(',
  );

  const attente = position(corps, 'await recoverySessionRef.current;');
  const deconnexion = position(corps, 'await signOut();');

  assert.ok(
    attente < deconnexion,
    'la session du lien doit être attendue avant la déconnexion : sinon elle arrive après, ' +
      "et « Annuler » rouvre ce qu'il vient de fermer",
  );
});

// --- Ce qu'un lien apprend à l'écran, et quand cela s'efface -----------------
//
// Deux clauses, et la seconde est celle qu'on oublie : afficher un message est
// visible, l'effacer ne l'est pas. Un message qui survit à la connexion
// réapparaîtrait au lancement suivant, sur un écran qui n'a plus rien à
// annoncer — le même défaut que le signalement de mot de passe faible, dont
// l'écriture est inconditionnelle pour cette raison précise.

test("le fournisseur annonce une confirmation d'inscription aboutie", () => {
  const source = lireSource(AUTH_PROVIDER);
  const corps = corpsDeFonction(
    source,
    'const handleUrl = (url: string | null)',
    'const message = ',
  );

  // Le contrôle du lien **et** l'écriture du message : l'un sans l'autre ne
  // servirait à rien, et c'est justement l'écriture qui manquait.
  position(corps, 'isEmailConfirmationLink(url)');
  assert.match(
    corps,
    /linkMessage:\s*'[^']*confirm[^']*'/i,
    'une confirmation aboutie doit poser un message, sinon l’adhérent voit l’écran ' +
      'de connexion s’ouvrir sans indication que son clic a fonctionné',
  );

  // La phrase doit nommer ce qui est confirmé **et** l'étape suivante : elle est
  // lue par quelqu'un qui ne sait pas encore qu'il doit se connecter.
  const phrase = corps.match(/linkMessage:\s*'([^']*)'/)[1];
  assert.match(phrase, /adresse/i);
  assert.match(phrase, /connecter/i);
});

test('le message d’un lien est effacé par la connexion réussie', () => {
  const source = lireSource(AUTH_PROVIDER);
  const corps = corpsDeFonction(
    source,
    'const signIn = useCallback(',
    'const signUp = useCallback(',
  );

  // Effacement **inconditionnel**, et non conditionné à l'existence d'un
  // message : c'est la forme qui survit à un changement d'ordre des appels.
  assert.match(
    corps,
    /linkMessage:\s*null/,
    'la connexion doit effacer le message du lien, sinon « Votre adresse est confirmée » ' +
      'réapparaîtrait à la connexion suivante',
  );

  // Le contrôle qui rend le précédent utile : un `linkMessage` posé ailleurs
  // dans `signIn` passerait aussi, et rouvrirait le défaut.
  //
  // L'espace après le deux-points est retiré avant comparaison : l'exiger
  // ferait tomber ce test sur une remise en forme correcte, c'est-à-dire sur du
  // code juste.
  const ecritures = corps.match(/linkMessage:\s*[^,\n]+/g) ?? [];
  assert.deepEqual(
    ecritures.map((ecriture) => ecriture.replace(/\s+/g, '')),
    ['linkMessage:null'],
    'la connexion ne doit qu’effacer le message, jamais en poser un',
  );
});

// --- Les adresses de retour, et les fichiers qui les nomment -----------------
//
// Le schéma est déclaré **une fois**, dans `app.json` (`expo.scheme`), et tout le
// reste en découle : `Linking.createURL('reinitialisation')` produit
// `<schéma>://reinitialisation`. Vérifié en lisant `expo-linking` 57.0.10 —
// `resolveScheme` concatène le schéma général puis les schémas par plateforme
// (`collectManifestSchemes`) et retient **le premier**, et `createURL` recolle
// `<schéma>:` + `/` + `/` + `<chemin>`.
//
// Or ces adresses sont **recopiées à la main** ailleurs : dans les deux documents
// qui demandent à l'opérateur de les enregistrer dans les « Redirect URLs » de
// Supabase, et dans les littéraux de ce fichier, qui écrit le schéma en dur
// dix-huit fois.
//
// Changer `expo.scheme` ne casse donc rien de visible : Supabase refuse la
// redirection, puisque l'adresse enregistrée n'est plus celle que l'application
// produit, le lien ne revient pas dans l'application — et **toute la suite reste
// verte**, ce fichier compris, qui éprouverait alors un schéma que l'application
// n'utilise plus. C'est la pire des configurations : la couverture paraît
// intacte.
//
// Depuis que la confirmation d'inscription est activée, il y a **deux** adresses,
// et la liste blanche les rend symétriquement coûteuses : une entrée manquante
// est refusée par Supabase **sans erreur visible pour l'adhérent**, qui attend un
// e-mail dont le lien ne le ramènera pas dans l'application. Le contrôle va donc
// dans les deux sens — aucune adresse périmée, et aucune adresse oubliée.

const APP_CONFIG = 'app.json';
const DOCUMENTS_QUI_ENREGISTRENT = ['README.md', 'supabase/README.md'];

/** Schéma déclaré dans `app.json`. */
function schemaDeclare() {
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

  return schema;
}

/**
 * Les adresses que l'opérateur doit enregistrer, par chemin.
 *
 * La liste vient du **module**, pas de ce fichier : recopier ici les deux
 * chemins rendrait ce banc d'accord avec lui-même, et une adresse ajoutée au
 * module passerait inaperçue.
 */
function adressesAttendues() {
  const schema = schemaDeclare();
  return new Map(REDIRECT_PATHS.map((chemin) => [chemin, `${schema}://${chemin}`]));
}

/** Toutes les adresses de retour nommées dans un texte, quel qu'en soit le schéma. */
function adressesNommees(texte) {
  const chemins = REDIRECT_PATHS.join('|');
  const motif = new RegExp(`([a-z][a-z0-9+.-]*):\\/\\/(${chemins})\\b`, 'g');
  return [...texte.matchAll(motif)].map(([, schema, chemin]) => `${schema}://${chemin}`);
}

test("les documents qui font enregistrer les adresses de retour nomment celles de l'application", () => {
  const attendues = adressesAttendues();
  assert.ok(attendues.size >= 2, 'moins de deux adresses attendues : ce contrôle serait partiel');

  for (const document of DOCUMENTS_QUI_ENREGISTRENT) {
    const nommees = adressesNommees(lireFichier(document));
    assert.notEqual(
      nommees.length,
      0,
      `${document} ne nomme aucune adresse de retour : le contrôle serait vide`,
    );

    // Premier sens : aucune adresse **périmée**. Vérifier la présence du bon ne
    // suffit pas — un document qui porterait encore l'ancien schéma à côté du
    // nouveau ferait enregistrer une adresse que l'application ne produit plus,
    // et l'entrée correcte, présente elle aussi, ne servirait à rien.
    const valides = [...attendues.values()];
    for (const nommee of nommees) {
      assert.ok(
        valides.includes(nommee),
        `${document} fait enregistrer « ${nommee} » dans Supabase, alors que ` +
          `l'application produit « ${valides.join(' », « ')} » : Supabase refuserait ` +
          "la redirection, et le lien ne reviendrait pas dans l'application",
      );
    }

    // Second sens : aucune adresse **oubliée**. C'est le sens qu'une liste
    // blanche rend coûteux, et le seul des deux qui soit muet : l'adhérent
    // reçoit bien un e-mail, le lien s'ouvre bien, mais hors de l'application.
    for (const [chemin, adresse] of attendues) {
      assert.ok(
        nommees.includes(adresse),
        `${document} ne fait pas enregistrer « ${adresse} » : l'entrée manque dans ` +
          `« Redirect URLs », et Supabase refusera la redirection vers « ${chemin} » ` +
          'sans que rien ne le signale à l’adhérent',
      );
    }
  }
});

test('la liste des adresses à enregistrer est close', () => {
  // Le suffixe est une convention dont ce contrôle dépend : c'est lui qui
  // distingue une adresse de retour d'une constante quelconque du module.
  const exportees = Object.entries(cheminModule)
    .filter(([nom]) => nom.endsWith('_REDIRECT_PATH'))
    .map(([, valeur]) => valeur);

  assert.ok(
    exportees.length >= 2,
    'aucune constante de chemin relevée : le contrôle serait vide, et une adresse ' +
      'ajoutée au module passerait inaperçue',
  );
  assert.deepEqual(
    [...exportees].sort(),
    [...REDIRECT_PATHS].sort(),
    'une adresse de retour est produite par l’application sans figurer dans ' +
      '`REDIRECT_PATHS` : elle ne serait jamais réclamée à l’opérateur, et le lien ' +
      'serait refusé en silence',
  );
  assert.equal(
    new Set(REDIRECT_PATHS).size,
    REDIRECT_PATHS.length,
    '`REDIRECT_PATHS` contient un doublon',
  );
});

/**
 * Le bloc d'un appel, de son en-tête à sa fermeture.
 *
 * La borne est `});`, et non un appel voisin : une ancre sur un appel prendrait
 * pour fin de bloc celui qu'on cherche justement à examiner.
 */
function blocAppel(source, enTete) {
  const debut = source.indexOf(enTete);
  assert.notEqual(
    debut,
    -1,
    `aucun appel à « ${enTete} » dans \`AuthProvider\` : ce contrôle serait vide`,
  );

  const fin = source.indexOf('});', debut);
  assert.notEqual(fin, -1, `appel à « ${enTete} » non refermé : ses options sont indélimitables`);

  return source.slice(debut, fin);
}

test("les deux envois d'e-mail de confirmation passent l'adresse de retour", () => {
  const source = lireSource(AUTH_PROVIDER);

  // L'inscription et le renvoi mènent au **même** endroit, et c'est l'invariant :
  // deux adresses différentes produiraient deux comportements selon le chemin
  // emprunté, dont un seul serait éprouvé.
  for (const enTete of ['auth.signUp({', 'auth.resend({']) {
    assert.match(
      blocAppel(source, enTete),
      /emailRedirectTo:\s*Linking\.createURL\(SIGNUP_REDIRECT_PATH\)/,
      `${enTete} : sans \`emailRedirectTo\`, GoTrue retombe sur le « Site URL » du ` +
        'tableau de bord — l’adhérent confirme son adresse dans un navigateur, et ne ' +
        'revient pas dans l’application',
    );
  }

  // La valeur doit venir du module qui la nomme. Un littéral recopié ici
  // échapperait à la lecture de `redirectPaths.ts`, donc à tout ce fichier.
  assert.match(
    source,
    /import\s*\{[^}]*\bSIGNUP_REDIRECT_PATH\b[^}]*\}\s*from\s*'@\/auth\/redirectPaths'/,
    '`SIGNUP_REDIRECT_PATH` doit être importé de `@/auth/redirectPaths`',
  );

  // L'ensemble est fermé : une adresse de retour supplémentaire doit être
  // examinée, et non ajoutée en silence. C'est ce compteur qui a signalé l'appel
  // ajouté par le renvoi de confirmation.
  const appels = source.match(/Linking\.createURL\(/g) ?? [];
  assert.strictEqual(
    appels.length,
    3,
    `une adresse de retour supplémentaire doit être examinée (${appels.length} trouvées)`,
  );
});

test('le renvoi de confirmation demande bien le type `signup`', () => {
  // `ResendParams` n'admet que `signup` ou `email_change` pour une adresse
  // e-mail. Un autre type ferait échouer l'appel côté serveur, et l'adhérent
  // lirait un message générique sans savoir pourquoi.
  assert.match(
    blocAppel(lireSource(AUTH_PROVIDER), 'auth.resend({'),
    /type:\s*'signup'/,
    "le renvoi doit demander le type `signup` : c'est le seul qui renvoie le lien de confirmation",
  );
});

test("les tests du flux éprouvent le schéma que l'application déclare", () => {
  const schema = schemaDeclare();
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
