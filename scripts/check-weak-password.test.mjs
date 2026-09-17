/**
 * Vérifie que le signalement d'un mot de passe faible, fait par le serveur sur
 * une connexion **réussie**, ne reste pas sans effet.
 *
 * POURQUOI CE SCRIPT
 * ------------------
 * GoTrue ne refuse pas une connexion parce que le mot de passe est faible : il
 * l'accepte, puis joint le constat à la réponse. Vérifié dans sa source
 * (`internal/api/token.go`, `ResourceOwnerPasswordGrant`) : le contrôle a lieu
 * seulement après que le mot de passe a été reconnu correct, et
 * `token.WeakPassword = weakPasswordError` est posé sur une réponse `200 OK`.
 *
 * Le défaut mesuré : `AuthProvider.signIn` écrivait
 *
 *     const { error } = await requireSupabase().auth.signInWithPassword(…)
 *
 * — la réponse était **lue pour son erreur seule, puis jetée**. Rien dans
 * l'application ne pouvait donc rapporter le constat : pas une erreur, puisqu'il
 * n'y en a pas, pas un écran non plus, puisqu'il n'existe pas d'écran « mon
 * compte ». Un adhérent dont le mot de passe ne respecte plus la politique en
 * vigueur ne l'aurait jamais su.
 *
 * CE QUE CE BANC TIENT
 * --------------------
 *   1. la réponse du serveur est lue, et le signalement rangé dans l'état ;
 *   2. la table de traduction couvre **exactement** les trois raisons que
 *      `checkPasswordStrength` peut produire — ensemble fermé, comparé à la
 *      source du serveur et non à la table elle-même ;
 *   3. une raison inconnue fait basculer la phrase **entière** sur la formule
 *      générique : une phrase à trou serait pire qu'une phrase vague ;
 *   4. toute phrase produite survit à l'affichage — c'est-à-dire qu'elle est
 *      marquée avant d'entrer dans `ErrorNotice`, qui la retraduirait sinon ;
 *   5. le libellé que la phrase demande de presser existe bien, sous ce nom, sur
 *      l'écran de connexion — un accord entre deux fichiers que rien ne relie ;
 *   6. le bandeau est posé par la coquille des onglets, sous l'en-tête, et non
 *      par les écrans — et la propriété du paquet de navigation dont ce
 *      placement dépend est revérifiée, car une mise à jour pourrait la
 *      déplacer sans que rien ne le signale.
 *
 * Les commentaires sont retirés avant toute extraction par motif : le nom de la
 * table figure dans le commentaire qui l'explique, et celui de `screenLayout`
 * dans celui qui justifie le placement.
 */

import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const RACINE = fileURLToPath(new URL('../', import.meta.url));

const ERREURS = new URL('../src/errors/index.ts', import.meta.url).href;
const { appErrorMessage, userMessage, weakPasswordMessage } = await import(ERREURS);

const PROVIDER = join(RACINE, 'src', 'auth', 'AuthProvider.tsx');
const ECRAN = join(RACINE, 'src', 'screens', 'ConnexionScreen.tsx');
const ONGLETS = join(RACINE, 'src', 'navigation', 'MainTabs.tsx');
const BANDEAU = join(RACINE, 'src', 'components', 'WeakPasswordNotice.tsx');

function sansCommentaires(source) {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
}

/** Le texte entre deux ancres. Lève si une ancre manque. */
function bloc(source, debut, fin) {
  const d = source.indexOf(debut);
  assert.notStrictEqual(d, -1, `ancre de début introuvable : ${debut}`);

  const f = source.indexOf(fin, d);
  assert.notStrictEqual(f, -1, `ancre de fin introuvable : ${fin}`);
  return source.slice(d, f);
}

/** Tous les `.tsx` sous un répertoire, récursivement. */
function fichiersTsx(base) {
  return readdirSync(base, { recursive: true })
    .filter((nom) => typeof nom === 'string' && nom.endsWith('.tsx'))
    .map((nom) => join(base, nom));
}

/**
 * Les trois raisons que `checkPasswordStrength` (`internal/api/password.go`)
 * peut ajouter, **relevées dans sa source** et non déduites de la table
 * ci-dessous — c'est toute la différence entre ce test et une confirmation
 * d'hypothèse. Les trois `append` sont uniques, et la boucle des classes de
 * caractères sort par `break` : chacune apparaît au plus une fois.
 */
const RAISONS_DE_GOTRUE = ['length', 'characters', 'pwned'];

/**
 * Toutes les formes que `reasons` peut prendre : les trois raisons seules, leurs
 * combinaisons — au plus trois, chacune une fois —, les cas vides, et deux
 * formes inattendues. Les inattendues sont là pour mesurer le repli, pas pour
 * décrire le serveur.
 */
const COMBINAISONS = [
  undefined,
  [],
  ['length'],
  ['characters'],
  ['pwned'],
  ['length', 'characters'],
  ['length', 'pwned'],
  ['characters', 'pwned'],
  ['length', 'characters', 'pwned'],
  ['zzz'],
  ['length', 'zzz'],
  ['LENGTH'],
];

const SOURCE_ERREURS = sansCommentaires(readFileSync(fileURLToPath(ERREURS), 'utf8'));

test('le piège : une phrase non marquée est remplacée par le générique', () => {
  // Ce test décrit ce que les suivants protègent. Sans lui, on ne saurait pas
  // pourquoi le marquage est exigé — et il tombe le jour où `appErrorMessage`
  // cesse de remplacer les phrases inconnues, ce qui serait une bonne nouvelle.
  const phrase = weakPasswordMessage(['length']);

  assert.notEqual(appErrorMessage(phrase), phrase);
  assert.match(appErrorMessage(phrase), /erreur inattendue/);
});

test('toute phrase produite survit à l’affichage', () => {
  // Le corpus va dans le sens inverse de la table : il part de ce que le
  // serveur peut envoyer et exige une phrase qui arrive intacte à l'écran.
  assert.ok(COMBINAISONS.length >= 12, `corpus de combinaisons : ${COMBINAISONS.length}`);

  const fautives = [];

  for (const raisons of COMBINAISONS) {
    const phrase = weakPasswordMessage(raisons);

    if (appErrorMessage(userMessage(phrase)) !== phrase) {
      fautives.push(`reasons=${JSON.stringify(raisons)} → « ${appErrorMessage(phrase)} »`);
    }
  }

  assert.deepEqual(
    fautives,
    [],
    'ces phrases perdent leur marquage : l’adhérent lirait un message générique qui invite à réessayer',
  );
});

test('aucune phrase ne comporte de trou', () => {
  // Une phrase à trou est pire qu'une phrase vague : elle a l'air d'un bug
  // d'affichage, et elle en est un.
  const fautives = [];

  for (const raisons of COMBINAISONS) {
    const phrase = weakPasswordMessage(raisons);

    if (/:\s*\./.test(phrase)) {
      fautives.push(`reasons=${JSON.stringify(raisons)} : ponctuation orpheline — « ${phrase} »`);
    } else if (/\s{2,}/.test(phrase)) {
      fautives.push(`reasons=${JSON.stringify(raisons)} : double espace — « ${phrase} »`);
    } else if (!/^Votre mot de passe a été accepté/.test(phrase)) {
      fautives.push(
        `reasons=${JSON.stringify(raisons)} : la phrase ne dit plus que rien n'a échoué`,
      );
    } else if (!/»\.$/.test(phrase)) {
      fautives.push(
        `reasons=${JSON.stringify(raisons)} : la marche à suivre manque — « ${phrase} »`,
      );
    }
  }

  assert.deepEqual(fautives, []);
});

test('une raison inconnue fait basculer la phrase entière', () => {
  // Le repli n'est pas une commodité : `reasons` est omis quand il n'y a rien à
  // signaler, et une version future du serveur peut ajouter une quatrième
  // valeur. Une phrase qui garderait les raisons qu'elle connaît **et** perdrait
  // les autres annoncerait un constat incomplet comme s'il était complet.
  const generique = weakPasswordMessage([]);

  assert.equal(weakPasswordMessage(undefined), generique);
  assert.equal(weakPasswordMessage(['zzz']), generique);
  assert.equal(
    weakPasswordMessage(['length', 'zzz']),
    generique,
    'une raison connue ne doit pas laisser croire que la phrase est complète',
  );
  assert.equal(weakPasswordMessage(['LENGTH']), generique, 'la correspondance est exacte');
});

test('la table couvre exactement les raisons du serveur', () => {
  const table = bloc(SOURCE_ERREURS, 'const WEAK_PASSWORD_CLAUSES = {', '} as const;');
  const cles = [...table.matchAll(/^ {2}([a-z]+):/gm)].map((trouve) => trouve[1]);

  assert.ok(cles.length > 0, 'la table de propositions est introuvable ou vide');

  assert.deepEqual(
    [...cles].sort(),
    [...RAISONS_DE_GOTRUE].sort(),
    'une raison ajoutée ou retirée ici doit être examinée : le serveur n’en envoie que trois',
  );
});

test('chaque raison dit quelque chose de différent', () => {
  const generique = weakPasswordMessage([]);
  const phrases = RAISONS_DE_GOTRUE.map((raison) => weakPasswordMessage([raison]));

  for (const [index, phrase] of phrases.entries()) {
    assert.notEqual(phrase, generique, `la raison ${RAISONS_DE_GOTRUE[index]} ne dit rien de plus`);
    assert.ok(
      phrase.length > generique.length,
      `la raison ${RAISONS_DE_GOTRUE[index]} n'ajoute aucune proposition`,
    );
  }

  assert.strictEqual(
    new Set(phrases).size,
    RAISONS_DE_GOTRUE.length,
    'deux raisons produisent la même phrase : l’adhérent ne saurait pas laquelle',
  );
});

test('les trois raisons réunies forment une phrase coordonnée', () => {
  const phrase = weakPasswordMessage(['length', 'characters', 'pwned']);

  // La coordination est française : virgules, puis « et » devant la dernière.
  // Une jonction naïve par « et » partout produirait « a et b et c ».
  assert.match(phrase, /: .+, .+ et .+\./, `coordination inattendue — « ${phrase} »`);
  assert.doesNotMatch(phrase, / et .+ et /, `coordination naïve — « ${phrase} »`);
});

test('le libellé nommé dans la phrase existe sur l’écran de connexion', () => {
  // C'est un accord entre deux fichiers que rien ne relie : la phrase envoie
  // l'adhérent presser un bouton qui vit dans un autre écran, et c'est le seul
  // chemin de changement de mot de passe — il n'existe pas d'écran « mon
  // compte ». Renommer le bouton rendrait la phrase fausse en silence.
  const phrase = weakPasswordMessage(['length']);
  const nomme = phrase.match(/«\s*([^»]+?)\s*»/);

  assert.ok(nomme, `la phrase ne nomme aucun libellé : ${phrase}`);

  const ecran = readFileSync(ECRAN, 'utf8');

  assert.ok(
    ecran.includes(`label="${nomme[1]}"`),
    `l'écran de connexion ne porte plus de bouton « ${nomme[1]} » : la marche à suivre est devenue fausse`,
  );
});

test('la connexion ne jette plus la réponse du serveur', () => {
  // Défaut d'origine, mesuré : `const { error } = await …signInWithPassword(…)`.
  // Le test porte sur l'invariant — la réponse est lue, et le signalement rangé
  // dans l'état — et non sur la forme de l'écriture : extraire la valeur dans
  // une variable intermédiaire reste correct.
  const source = sansCommentaires(readFileSync(PROVIDER, 'utf8'));
  const connexion = bloc(source, 'const signIn = useCallback(', 'const signUp = useCallback(');

  assert.match(connexion, /weakPassword/, 'le signalement du serveur doit être lu');
  assert.match(
    connexion,
    /weakPasswordReasons/,
    "et rangé dans l'état, sans quoi il n'atteint aucun écran",
  );
});

test('le signalement ne survit pas à la disparition de la session', () => {
  // Sans cette remise à zéro, le mot de passe faible d'un compte s'afficherait
  // après la connexion d'un autre sur le même téléphone.
  const source = sansCommentaires(readFileSync(PROVIDER, 'utf8'));
  const ecouteur = bloc(source, 'client.auth.onAuthStateChange(', '.subscription.unsubscribe');

  assert.match(
    ecouteur,
    /weakPasswordReasons/,
    "l'écouteur de session doit effacer le signalement quand la session disparaît",
  );
});

test('le bandeau marque la phrase avant de l’afficher', () => {
  const bandeau = sansCommentaires(readFileSync(BANDEAU, 'utf8'));

  assert.match(bandeau, /weakPasswordMessage/, 'la phrase doit venir de la traduction');
  assert.match(bandeau, /userMessage/, 'et être marquée avant d’entrer dans ErrorNotice');
  assert.doesNotMatch(
    bandeau,
    /error=\{weakPasswordMessage/,
    'sans userMessage, ErrorNotice remplacerait la phrase par le message générique',
  );
});

test('le bandeau est posé par la coquille, sous l’en-tête, et non par les écrans', () => {
  const onglets = sansCommentaires(readFileSync(ONGLETS, 'utf8'));

  assert.match(
    onglets,
    /screenLayout=\{/,
    'le bandeau doit être posé une seule fois, par la coquille',
  );
  assert.match(onglets, /WeakPasswordNotice/, 'la coquille doit monter le bandeau');

  const ecrans = fichiersTsx(join(RACINE, 'src', 'screens'));

  // Sans ce garde-fou, une erreur de chemin rendrait le test suivant vert en ne
  // lisant rien — le défaut aurait l'apparence d'une protection.
  assert.ok(ecrans.length >= 5, `écrans trouvés : ${ecrans.length}`);

  const fautifs = ecrans
    .filter((chemin) =>
      sansCommentaires(readFileSync(chemin, 'utf8')).includes('WeakPasswordNotice'),
    )
    .map((chemin) => relative(RACINE, chemin).replace(/\\/g, '/'));

  assert.deepEqual(
    fautifs,
    [],
    "un bandeau monté par un écran dépendrait de l'onglet ouvert, et le mot de passe concerne le compte",
  );
});

test('la coque a la même forme, avec ou sans le bandeau', () => {
  // Défaut mesuré en relisant le parcours « l'adhérent ferme le bandeau » : la
  // fonction retournait un **Fragment** quand il n'y avait rien à signaler, et une
  // **View** sinon. React réconcilie par **type** à une position donnée — deux
  // types différents, et il **démonte** le sous-arbre au lieu de le mettre à jour.
  // Fermer le bandeau remontait donc l'écran : données rechargées, brouillon de la
  // discussion perdu. Et à la connexion, les écrans se montaient **deux fois**,
  // une fois sans le bandeau puis une fois avec.
  //
  // L'invariant est la **forme** : retour unique, coque inconditionnelle, un seul
  // emplacement pour `children`. C'est le seul contrôle possible ici — aucun
  // moteur de rendu n'est installé — et il est volontairement strict : un second
  // `return` est exactement la forme qui rouvre le défaut.
  const source = sansCommentaires(readFileSync(ONGLETS, 'utf8'));
  const coque = bloc(source, 'function WeakPasswordGate(', 'export function MainTabs(');

  assert.strictEqual(
    (coque.match(/\breturn\b/g) ?? []).length,
    1,
    'un second `return` fait dépendre la forme de la coque de l’état du bandeau',
  );
  assert.strictEqual(
    (coque.match(/\{children\}/g) ?? []).length,
    1,
    'un second emplacement pour `children` le remonterait selon l’état',
  );

  for (const style of ['shell', 'shellContent']) {
    assert.match(
      source,
      new RegExp(`^ {2}${style}: \\{`, 'm'),
      `le style ${style} est introuvable : la coque ne serait plus qu'un fragment`,
    );
  }
});

test('la propriété de la navigation dont dépend le placement tient toujours', () => {
  // Le placement repose sur une propriété d'un paquet tiers, et une mise à jour
  // pourrait la déplacer sans que rien ne le signale : le bandeau passerait
  // au-dessus de l'en-tête, sous l'encoche, et aucun test de valeur ne le
  // verrait — il n'y a pas de rendu ici.
  const vue = join(
    RACINE,
    'node_modules',
    '@react-navigation',
    'bottom-tabs',
    'src',
    'views',
    'BottomTabView.tsx',
  );

  assert.ok(existsSync(vue), `source introuvable : ${vue} — le placement n'est plus vérifiable`);

  const source = readFileSync(vue, 'utf8');
  const entete = source.indexOf('header={header({');
  const contenu = source.indexOf('{descriptor.render()}');

  assert.notEqual(entete, -1, "l'en-tête n'est plus passé en prop de <Screen>");
  assert.notEqual(contenu, -1, "le contenu de l'écran est introuvable");
  assert.ok(
    entete < contenu,
    "l'en-tête est désormais rendu dans le contenu : le bandeau passerait au-dessus de lui",
  );

  const scene = join(RACINE, 'node_modules', '@react-navigation', 'core', 'src', 'SceneView.tsx');

  assert.ok(existsSync(scene), `source introuvable : ${scene}`);

  const sourceScene = readFileSync(scene, 'utf8');

  assert.match(
    sourceScene,
    /ScreenComponent/,
    'ce que screenLayout enveloppe doit rendre le composant d’écran',
  );
  assert.doesNotMatch(
    sourceScene,
    /<Header[\s/>]/,
    'ce que screenLayout enveloppe rendrait un en-tête : le bandeau ne serait plus dessous',
  );
});
