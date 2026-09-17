/**
 * Vérifie que les messages **déjà rédigés pour l'adhérent** ne sont pas
 * remplacés par le message générique.
 *
 * POURQUOI CE SCRIPT
 * ------------------
 * `appErrorMessage` part du principe qu'une chaîne reçue est un message
 * technique anglais à traduire, et qu'à défaut de règle correspondante il faut
 * afficher un message générique. C'est ce qui empêche un « duplicate key value
 * violates unique constraint » d'atteindre un adhérent — mais cela signifie
 * aussi qu'une phrase française écrite dans un écran est **remplacée**.
 *
 * Mesuré avant correction :
 *
 *     appErrorMessage('Indiquez votre adresse e-mail.')
 *     → « Une erreur inattendue est survenue. Réessayez dans quelques instants. »
 *
 * Le préjudice n'est pas seulement la perte de précision : le message invite à
 * **réessayer**, alors que l'action échouera identiquement tant que le champ
 * restera vide. Six messages étaient dans ce cas, dont l'avis de confirmation
 * d'inscription — un adhérent qui venait de créer son compte lisait « une erreur
 * inattendue » au lieu de « ouvrez l'e-mail que nous venons de vous envoyer ».
 *
 * Le premier test ci-dessous décrit le piège, les suivants la protection. Sans
 * le premier, on ne saurait pas ce que les autres protègent.
 *
 * UNE SECONDE TRADUCTION, MESURÉE PLUS TARD
 * -----------------------------------------
 * Le piège se reproduit **à l'affichage**, et là sans qu'aucun écran n'ait rien
 * mal écrit : `useAsyncData` range dans `errorMessage` le résultat d'un premier
 * `appErrorMessage`, et `AsyncFallback` le remet à un `ErrorNotice`, qui en
 * applique un second. Même chose pour le message d'un lien expiré, produit par
 * `describeRecoveryError` puis affiché par l'écran de connexion. Mesuré : dans
 * les deux cas la phrase était remplacée par le message générique.
 *
 * Les deux derniers tests couvrent cette **composition** — ce qu'aucun test ne
 * faisait, chacun ne vérifiant qu'un module isolé. C'est exactement là que le
 * défaut vivait : à la frontière, pas dans l'un ou l'autre.
 *
 * ET LA TABLE DE TRADUCTION ELLE-MÊME
 * ------------------------------------
 * Restait le fichier qui décide de la traduction. Ses règles y sont ordonnées en
 * trois familles, et la dernière est la plus générique : son motif contient
 * `timeout` seul. Un message **PostgreSQL** — « canceling statement due to
 * statement timeout » — tombait donc sur la règle réseau, et l'adhérent lisait
 * « Vérifiez votre connexion internet » alors que sa connexion fonctionnait.
 *
 * Le défaut n'était pas l'ordre : c'était une règle manquante, que l'ordre
 * rendait invisible. Les tests de la fin tiennent les deux — le délai serveur est
 * reconnu pour ce qu'il est, et le seul recouvrement du corpus reste celui-là.
 */

import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const RACINE = fileURLToPath(new URL('../', import.meta.url));

const MODULE = new URL('../src/errors/index.ts', import.meta.url).href;
const RECOVERY = new URL('../src/auth/recoveryLink.ts', import.meta.url).href;

const { appErrorMessage, userMessage, AppError } = await import(MODULE);
const { describeRecoveryError } = await import(RECOVERY);

/** Tous les composants et écrans, récursivement. */
function fichiersTsx() {
  const base = join(RACINE, 'src');

  return readdirSync(base, { recursive: true })
    .filter((nom) => typeof nom === 'string' && nom.endsWith('.tsx'))
    .map((nom) => join(base, nom));
}

const PHRASE = 'Indiquez votre adresse e-mail.';

test('le piège : une phrase française non marquée est remplacée', () => {
  const rendu = appErrorMessage(PHRASE);

  assert.notEqual(rendu, PHRASE, 'si ce test échoue, le piège a disparu — bonne nouvelle');
  assert.match(rendu, /erreur inattendue/);
});

test('une phrase marquée est affichée telle quelle', () => {
  assert.equal(appErrorMessage(userMessage(PHRASE)), PHRASE);
});

test('le marquage survit à un passage répété', () => {
  // `toAppError` est appelé plusieurs fois sur le même objet le long du chemin
  // (écran, composant, journal). Chaque passage doit rendre la même phrase.
  const marque = userMessage(PHRASE);

  assert.equal(appErrorMessage(marque), PHRASE);
  assert.equal(appErrorMessage(marque), PHRASE);
});

test('le marquage est bien une AppError', () => {
  assert.ok(userMessage(PHRASE) instanceof AppError);
});

test('un message technique reste traduit', () => {
  // La protection ne doit pas avoir désarmé la traduction : c'est elle qui
  // empêche un message PostgreSQL d'atteindre l'adhérent.
  assert.equal(
    appErrorMessage('Invalid login credentials'),
    'Adresse e-mail ou mot de passe incorrect.',
  );
  assert.doesNotMatch(
    appErrorMessage('duplicate key value violates unique constraint "profiles_pkey"'),
    /duplicate key/,
  );
});

test('les phrases réellement affichées par les écrans sont préservées', () => {
  // Les six messages mesurés comme cassés, repris tels quels : ce test tombe si
  // l'un d'eux reperd son marquage dans un écran.
  const phrases = [
    'Indiquez votre adresse e-mail.',
    'Indiquez le nom qui apparaîtra auprès des autres membres.',
    'Le mot de passe doit contenir au moins 6 caractères.',
    'Les deux mots de passe ne correspondent pas.',
    'Indiquez un objet en quelques mots.',
    'Décrivez votre signalement.',
  ];

  for (const phrase of phrases) {
    assert.equal(appErrorMessage(userMessage(phrase)), phrase);
  }
});

test("le message d'un lien expiré survit à l'affichage", () => {
  // Ce message ne vient pas d'un écran : il est produit par `recoveryLink`, puis
  // affiché par un `ErrorNotice`, qui applique `appErrorMessage` une seconde
  // fois. Sans le marquage, l'adhérent lisait « Une erreur inattendue est
  // survenue. Réessayez… » au lieu de « demandez un nouveau lien » — soit
  // l'inverse du conseil utile, puisque réessayer ne fera pas revivre le lien.
  const expire = describeRecoveryError(
    'fcpefl://#error=access_denied&error_code=otp_expired&type=recovery',
  );

  assert.notEqual(expire, null);
  assert.match(expire, /expiré/);
  assert.match(appErrorMessage(expire), /erreur inattendue/);
  assert.equal(appErrorMessage(userMessage(expire)), expire);
});

test('un message déjà traduit ne survit qu’une fois marqué', () => {
  // Même composition, autre origine : `useAsyncData` range dans `errorMessage`
  // le résultat d'un premier `appErrorMessage`, et `AsyncFallback` le remet à un
  // `ErrorNotice`. La cause réelle — réseau coupé, droits refusés — doit
  // parvenir à l'adhérent, et non le générique.
  const traduit = appErrorMessage('Network request failed');

  assert.match(traduit, /Connexion au serveur impossible/);
  assert.match(appErrorMessage(traduit), /erreur inattendue/);
  assert.equal(appErrorMessage(userMessage(traduit)), traduit);
});

test('aucune phrase déjà traduite n’est remise à ErrorNotice sans marquage', () => {
  // Test de forme, et il est nécessaire : les trois tests précédents établissent
  // que `userMessage` protège une phrase, pas qu'un appelant l'applique. Une
  // enveloppe oubliée à un seul endroit rendrait le défaut, et aucun test de
  // valeur ne le verrait — il n'y a pas de rendu ici.
  //
  // Les deux identifiants visés portent une phrase **déjà** traduite :
  // `errorMessage` sort d'un premier `appErrorMessage` (appliqué dans
  // `useAsyncData`), `recoveryError` de `describeRecoveryError`. Les deux formes
  // sont visées — `error={errorMessage}` et `error={errorMessage ?? …}` — d'où un
  // motif volontairement privé de son accolade fermante.
  const motifs = ['error={errorMessage', 'error={recoveryError'];
  const fautifs = [];

  for (const chemin of fichiersTsx()) {
    const source = readFileSync(chemin, 'utf8');

    for (const motif of motifs) {
      if (source.includes(motif)) {
        fautifs.push(`${relative(RACINE, chemin).replace(/\\/g, '/')} : ${motif}…`);
      }
    }
  }

  assert.deepEqual(
    fautifs,
    [],
    'une phrase déjà rédigée doit passer par userMessage() avant ErrorNotice, sinon elle est remplacée par le message générique',
  );
});

test('le test de forme lit bien des fichiers', () => {
  // Sans ce garde-fou, une erreur de chemin rendrait le test précédent vert en ne
  // lisant rien : le défaut qu'il surveille passerait alors inaperçu, avec
  // l'apparence d'une protection.
  const fichiers = fichiersTsx();

  assert.ok(fichiers.length >= 10, `fichiers .tsx trouvés : ${fichiers.length}`);
  assert.ok(fichiers.some((chemin) => chemin.endsWith('AsyncFallback.tsx')));
  assert.ok(fichiers.some((chemin) => chemin.endsWith('ConnexionScreen.tsx')));
});

/* -------------------------------------------------------------------------- *
 * LA TABLE DE TRADUCTION ELLE-MÊME
 *
 * Les tests précédents vérifient qu'une phrase est préservée. Ceux-ci portent
 * sur les règles qui décident de la traduction : leur ordre, et le remplissage
 * de leurs emplacements.
 *
 * POURQUOI L'ORDRE
 * ----------------
 * `ALL_RULES` évalue `AUTH_RULES`, puis `DATABASE_RULES`, puis `NETWORK_RULES`.
 * La dernière famille est la plus générique — son motif contient `timeout` seul —
 * et cet ordre décide donc du message lu par l'adhérent pour un cas au moins :
 * « canceling statement due to statement timeout » est un message **PostgreSQL**,
 * et il allumait la règle réseau. L'adhérent lisait « Vérifiez votre connexion
 * internet » alors que sa connexion fonctionnait et que la requête avait
 * seulement été trop longue. Mesuré, puis corrigé par la règle de délai serveur.
 *
 * Le corpus ci-dessous ne prouve pas qu'aucun recouvrement n'existe nulle part :
 * il prouve que ceux qui existent **sur ces messages-là** sont connus. Ajouter
 * une règle qui en recouvre une autre fait donc échouer le test, et c'est le but
 * — un recouvrement est une décision, pas un accident.
 * -------------------------------------------------------------------------- */

const SOURCE_ERREURS = new URL('../src/errors/index.ts', import.meta.url);

/** Retire les commentaires : ce fichier nomme `timeout` dans sa documentation. */
function sansCommentaires(source) {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
}

const SOURCE_NUE = sansCommentaires(readFileSync(SOURCE_ERREURS, 'utf8'));

const FAMILLES = ['AUTH_RULES', 'DATABASE_RULES', 'NETWORK_RULES'];

function blocDeFamille(nom) {
  const debut = SOURCE_NUE.indexOf(`const ${nom}:`);

  assert.notEqual(debut, -1, `famille ${nom} introuvable dans src/errors/index.ts`);

  const fin = SOURCE_NUE.indexOf('];', debut);

  assert.notEqual(fin, -1, `fin de la famille ${nom} introuvable`);

  return SOURCE_NUE.slice(debut, fin);
}

/** Les règles d'une famille, telles qu'écrites — pas telles qu'on les suppose. */
function reglesDe(nom) {
  // Le motif est recréé à chaque appel : un objet RegExp partagé garde un
  // `lastIndex` entre deux lectures, et c'est exactement le genre d'état qui fait
  // passer une règle sur deux.
  const motif =
    /match:\s*(\/(?:[^/\\]|\\.)+\/[a-z]*)\s*,\s*message:\s*(?:'((?:[^'\\]|\\.)*)'|"((?:[^"\\]|\\.)*)")/g;

  return [...blocDeFamille(nom).matchAll(motif)].map((trouve) => {
    const litteral = trouve[1];
    const coupure = litteral.lastIndexOf('/');

    return {
      famille: nom,
      source: litteral,
      match: new RegExp(litteral.slice(1, coupure), litteral.slice(coupure + 1)),
      message: (trouve[2] ?? trouve[3]).replace(/\\(['"])/g, '$1'),
    };
  });
}

const REGLES_PAR_FAMILLE = FAMILLES.map((nom) => ({ nom, regles: reglesDe(nom) }));
const REGLES = REGLES_PAR_FAMILLE.flatMap((famille) => famille.regles);

function regleDe(nom, index) {
  const regle = REGLES_PAR_FAMILLE.find((famille) => famille.nom === nom)?.regles[index];

  assert.ok(regle, `règle ${nom}[${index}] introuvable`);

  return regle;
}

/**
 * Un exemplaire par règle : le message technique que cette règle doit attraper.
 * Écrits d'après les erreurs réellement émises par GoTrue et PostgREST, et non
 * d'après les motifs — sinon le test ne ferait que confirmer ses hypothèses.
 */
const EXEMPLAIRES = [
  ['AUTH_RULES', 0, 'Invalid login credentials'],
  ['AUTH_RULES', 1, 'Email not confirmed'],
  ['AUTH_RULES', 2, 'User already registered'],
  ['AUTH_RULES', 3, 'Password should be at least 6 characters.'],
  [
    'AUTH_RULES',
    4,
    'Password should contain at least one character of each: abcdefghijklmnopqrstuvwxyz, ABCDEFGHIJKLMNOPQRSTUVWXYZ, 0123456789.',
  ],
  [
    'AUTH_RULES',
    5,
    'Password is known to be weak and easy to guess, please choose a different one.',
  ],
  ['AUTH_RULES', 6, 'Password cannot be longer than 72 characters'],
  ['AUTH_RULES', 7, 'New password should be different from the old password.'],
  ['AUTH_RULES', 8, 'Unable to validate email address: invalid format'],
  ['AUTH_RULES', 9, 'For security purposes, you can only request this after 47 seconds.'],
  ['AUTH_RULES', 10, 'Email rate limit exceeded'],
  ['AUTH_RULES', 11, 'Signups not allowed for this instance'],
  ['AUTH_RULES', 12, 'Database error saving new user'],
  ['AUTH_RULES', 13, 'JWT expired'],
  ['DATABASE_RULES', 0, 'new row violates row-level security policy for table "signalements"'],
  [
    'DATABASE_RULES',
    1,
    'duplicate key value violates unique constraint "cantine_reservations_menu_id_user_id_key"',
  ],
  [
    'DATABASE_RULES',
    2,
    'insert or update on table "messages" violates foreign key constraint "messages_author_id_fkey"',
  ],
  ['DATABASE_RULES', 3, 'invalid input value for enum signalement_status: "zzz"'],
  [
    'DATABASE_RULES',
    4,
    'null value in column "objet" of relation "signalements" violates not-null constraint',
  ],
  ['DATABASE_RULES', 5, 'canceling statement due to statement timeout'],
  ['NETWORK_RULES', 0, 'TypeError: Network request failed'],
];

test("l'extraction des règles lit bien le fichier", () => {
  // Sans ce garde-fou, une extraction qui ne trouve rien rendrait les trois tests
  // suivants verts en ne vérifiant rien — le défaut aurait l'apparence d'une
  // protection, ce qui est pire que pas de protection du tout.
  assert.ok(REGLES.length >= 19, `règles extraites : ${REGLES.length}`);

  for (const { nom, regles } of REGLES_PAR_FAMILLE) {
    assert.ok(regles.length > 0, `famille ${nom} vide`);
  }

  const ligne = SOURCE_NUE.match(/const ALL_RULES[^\n]*/)?.[0] ?? '';
  const ordre = [...ligne.matchAll(/(AUTH_RULES|DATABASE_RULES|NETWORK_RULES)/g)].map(
    (trouve) => trouve[1],
  );

  assert.deepEqual(
    ordre,
    FAMILLES,
    'les tests ci-dessous supposent cet ordre de familles dans ALL_RULES',
  );
});

test("un délai d'attente du serveur n'est pas une panne de réseau", () => {
  // Le défaut, tel qu'il se produisait : un message PostgreSQL traduit par la
  // règle réseau. Le préjudice est le même que pour un lien expiré — on envoie
  // l'adhérent réparer ce qui fonctionne, et le conseil donné (« vérifiez votre
  // connexion ») ne peut pas faire aboutir l'action.
  const lent = appErrorMessage('canceling statement due to statement timeout');

  assert.doesNotMatch(lent, /connexion internet/);
  assert.match(lent, /trop de temps/);

  // La règle réseau garde son domaine : elle doit continuer de reconnaître une
  // connexion réellement coupée, sinon la correction aurait déplacé le défaut.
  for (const coupee of [
    'TypeError: Network request failed',
    'TypeError: Failed to fetch',
    'Connection terminated due to connection timeout',
    'AbortError: The operation was aborted.',
  ]) {
    assert.match(appErrorMessage(coupee), /connexion internet/, coupee);
  }
});

test('chaque règle est exercée par un exemplaire, et traduite par elle-même', () => {
  const fautives = [];

  for (const [famille, index, technique] of EXEMPLAIRES) {
    const regle = regleDe(famille, index);

    if (!regle.match.test(technique)) {
      fautives.push(`${famille}[${index}] ${regle.source} ne correspond plus à ${technique}`);
      continue;
    }

    // C'est ici que l'ordre est mesuré : la **première** règle qui correspond à
    // ce message doit être celle-ci. Une famille déplacée dans `ALL_RULES` rend
    // cet exemplaire orphelin, et le test tombe sur la famille fautive.
    const premiere = REGLES.find((candidate) => candidate.match.test(technique));

    if (premiere !== regle) {
      fautives.push(
        `${famille}[${index}] : ${technique} est intercepté par ${premiere?.famille} avant ${famille}`,
      );
      continue;
    }

    // Le texte, sauf pour les règles à emplacement : `toAppError` y substitue le
    // groupe capturé, donc la phrase rendue diffère de celle écrite dans la
    // source. Ce remplissage-là est mesuré par le test suivant.
    if (regle.message.includes('$')) {
      continue;
    }

    const rendu = appErrorMessage(technique);

    if (rendu !== regle.message) {
      fautives.push(`${famille}[${index}] : ${technique} donne « ${rendu} »`);
    }
  }

  assert.deepEqual(
    fautives,
    [],
    "l'ordre des familles ou un motif a changé : un exemplaire est traduit par une autre règle que la sienne",
  );
});

test('aucune règle n’est ajoutée sans exemplaire', () => {
  // Sans ce test, la table ci-dessus resterait verte après l'ajout d'une règle, et
  // la nouvelle règle ne serait exercée par personne — pas même recopiée.
  const sansExemplaire = [];

  for (const { nom, regles } of REGLES_PAR_FAMILLE) {
    regles.forEach((regle, index) => {
      const couverte = EXEMPLAIRES.some(([famille, rang]) => famille === nom && rang === index);

      if (!couverte) {
        sansExemplaire.push(`${nom}[${index}] ${regle.source}`);
      }
    });
  }

  assert.deepEqual(sansExemplaire, [], 'ajouter un exemplaire dans EXEMPLAIRES pour chaque règle');
});

/**
 * Les refus que GoTrue peut réellement renvoyer sur les quatre appels
 * d'authentification de l'application — connexion, inscription, demande de lien,
 * changement de mot de passe. Relevés dans sa source (`internal/api/password.go`
 * et `errors.go`), et **non** déduits des motifs de `src/errors/index.ts` : c'est
 * toute la différence entre cette liste et `EXEMPLAIRES`.
 */
const REFUS_DE_GOTRUE = [
  'Invalid login credentials',
  'Email not confirmed',
  'User already registered',
  'Password should be at least 8 characters.',
  'Password should contain at least one character of each: abcdefghijklmnopqrstuvwxyz, ABCDEFGHIJKLMNOPQRSTUVWXYZ, 0123456789.',
  'Password is known to be weak and easy to guess, please choose a different one.',
  'Password cannot be longer than 72 characters',
  'New password should be different from the old password.',
  'Unable to validate email address: invalid format',
  'For security purposes, you can only request this after 47 seconds.',
  'Email rate limit exceeded',
  'Signups not allowed for this instance',
  'Database error saving new user',
  'JWT expired',
];

test('aucun refus connu de GoTrue ne tombe sur le message générique', () => {
  // `EXEMPLAIRES` part des règles et leur cherche un message : il ne peut donc
  // pas voir une règle **absente**. Ce test va dans l'autre sens, et c'est le
  // seul qui pouvait attraper le défaut corrigé ici — trois refus de mot de
  // passe, dont la limite dure de bcrypt, que l'adhérent lisait sous la forme
  // « Une erreur inattendue est survenue. Réessayez dans quelques instants. »,
  // c'est-à-dire un conseil qui ne peut pas aboutir.
  const generique = appErrorMessage('un message que personne ne connaît');

  assert.ok(REFUS_DE_GOTRUE.length >= 14, `corpus de refus : ${REFUS_DE_GOTRUE.length}`);

  const muets = REFUS_DE_GOTRUE.filter((refus) => appErrorMessage(refus) === generique);

  assert.deepEqual(muets, [], 'ces refus du serveur ne sont traduits par aucune règle');
});

test("le seul recouvrement du corpus est celui que l'ordre des familles arbitre", () => {
  const recouvrements = [];

  for (const [, , technique] of EXEMPLAIRES) {
    const touchees = REGLES.filter((regle) => regle.match.test(technique));

    if (touchees.length > 1) {
      recouvrements.push(`${technique} → ${touchees.map((regle) => regle.famille).join(', ')}`);
    }
  }

  assert.deepEqual(recouvrements, [
    'canceling statement due to statement timeout → DATABASE_RULES, NETWORK_RULES',
  ]);
});

/** Nombre de groupes capturés, mesuré : on ajoute une alternative vide au motif. */
function nombreDeGroupes(regle) {
  const nu = regle.source.slice(1, regle.source.lastIndexOf('/'));

  return new RegExp(`${nu}|`).exec('').length - 1;
}

test('aucun emplacement $n ne dépasse les groupes capturés', () => {
  // `toAppError` remplace `$1` par le groupe capturé, et par la chaîne vide quand
  // le groupe n'existe pas. Un motif retouché — `(\d+)` devenu `\d+` — laisserait
  // donc `$1` dans la phrase, ou un trou à sa place.
  const fautives = [];

  for (const regle of REGLES) {
    const groupes = nombreDeGroupes(regle);
    const emplaces = [...regle.message.matchAll(/\$(\d)/g)].map((trouve) =>
      Number.parseInt(trouve[1], 10),
    );
    const plusHaut = emplaces.length === 0 ? 0 : Math.max(...emplaces);

    if (plusHaut > groupes) {
      fautives.push(`${regle.famille} ${regle.source} : $${plusHaut} pour ${groupes} groupe(s)`);
    }
  }

  assert.deepEqual(fautives, []);
});

test('les emplacements sont remplis, sans trou dans la phrase', () => {
  const fautives = [];
  let mesurees = 0;

  for (const [famille, index, technique] of EXEMPLAIRES) {
    const regle = regleDe(famille, index);

    if (!regle.message.includes('$')) {
      continue;
    }

    mesurees += 1;

    const rendu = appErrorMessage(technique);

    if (rendu.includes('$') || /\s{2,}/.test(rendu)) {
      fautives.push(`${famille}[${index}] : « ${rendu} »`);
      continue;
    }

    // La valeur capturée doit se retrouver dans la phrase. Sans cette
    // vérification, un remplacement par la chaîne vide passerait pour un
    // remplissage réussi : la phrase serait propre, et trouée.
    const capture = regle.match.exec(technique);

    for (const trouve of regle.message.matchAll(/\$(\d)/g)) {
      const valeur = capture?.[Number.parseInt(trouve[1], 10)];

      if (typeof valeur === 'string' && valeur !== '' && !rendu.includes(valeur)) {
        fautives.push(`${famille}[${index}] : « ${valeur} » absent de « ${rendu} »`);
      }
    }
  }

  assert.deepEqual(fautives, []);

  // Sans règle à emplacement, ce test serait vert sans rien mesurer.
  assert.ok(mesurees > 0, 'aucune règle à emplacement : le test ne prouve plus rien');
});
