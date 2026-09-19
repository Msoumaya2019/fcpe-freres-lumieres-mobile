/**
 * Vérifie que la garde de `src/config/env.ts` refuse réellement une clé
 * `service_role`, et accepte une clé publique.
 *
 * POURQUOI CE SCRIPT
 * ------------------
 * La garde protège contre la fuite la plus coûteuse du projet : une clé
 * `service_role` intégrée au bundle contourne toutes les politiques RLS et
 * ouvre la base en lecture et en écriture à quiconque extrait le paquet. Une
 * garde non testée est une garde dont on ignore si elle fonctionne.
 *
 * Le contrôle porte sur un cas précis, et c'est le cœur du sujet : une charge
 * utile JWT est encodée en **base64url**, dont l'alphabet remplace « + » par
 * « - » et « / » par « _ ». Une première version de `decodeBase64Url` utilisait
 * l'alphabet base64 standard ; une charge utile contenant l'un de ces deux
 * caractères échouait alors au décodage, la fonction renvoyait `null`, et la
 * garde laissait passer la clé sans rien signaler. Les cas ci-dessous
 * contiennent donc volontairement « - » et « _ ».
 *
 * Sans dépendance : `node:test` est intégré, et le *type stripping* de Node 22
 * permet d'importer directement le fichier TypeScript. Aucun transpileur, aucun
 * exécuteur de tests à installer.
 *
 * CE QUE CES TESTS NE PEUVENT PAS VOIR
 * ------------------------------------
 * Tous chargent le module sous **Node**, où `process.env[nom]` fonctionne
 * parfaitement. Le seul défaut que cet environnement ne peut donc pas révéler
 * est celui de la **substitution à la compilation** : Expo ne remplace que les
 * accès littéraux, si bien qu'un accès calculé vaut `undefined` dans le bundle.
 * Le dernier test est un test de forme, et c'est le seul moyen de l'attraper —
 * mesuré sur un bundle de production.
 */

import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const ENV_MODULE = new URL('../src/config/env.ts', import.meta.url).href;
const RACINE = fileURLToPath(new URL('../', import.meta.url));

/** Tous les modules du projet, récursivement. */
function fichiersSource() {
  const base = join(RACINE, 'src');

  return readdirSync(base, { recursive: true })
    .filter((nom) => typeof nom === 'string' && /\.tsx?$/.test(nom))
    .map((nom) => join(base, nom));
}

/**
 * Retire les commentaires, pour qu'une phrase de documentation ne fasse pas
 * échouer un test de forme.
 *
 * Le cas s'est produit ici même : le commentaire qui explique la règle cite
 * `process.env[nom]` en contre-exemple, et le test l'a pris pour du code. Le
 * réflexe inverse — retirer la documentation — serait le mauvais : c'est elle
 * qui empêche la régression.
 *
 * `//` n'est retiré que s'il n'est pas précédé de « : », pour ne pas amputer
 * une adresse (`https://…`).
 */
function sansCommentaires(source) {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
}

/** Source d'un module, commentaires retirés. */
function lireSource(chemin) {
  return sansCommentaires(readFileSync(chemin, 'utf8'));
}

/**
 * Encode une chaîne en base64url, comme le fait un émetteur de JWT.
 *
 * @param {string} value
 * @returns {string}
 */
function toBase64Url(value) {
  return Buffer.from(value, 'utf8').toString('base64url');
}

/**
 * Construit un faux JWT : l'en-tête et la signature ne sont pas vérifiés par la
 * garde, seule la charge utile l'est.
 *
 * @param {Record<string, unknown>} payload
 * @returns {string}
 */
function forgeToken(payload) {
  const header = toBase64Url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const body = toBase64Url(JSON.stringify(payload));
  return `${header}.${body}.signature-factice`;
}

/**
 * Importe `src/config/env.ts` dans un environnement donné.
 *
 * Le module lit `process.env` au chargement : il faut donc poser les variables
 * avant l'import, et forcer un module neuf à chaque cas (`?case=N`) puisque le
 * cache d'ESM ne réexécute pas un module déjà chargé.
 *
 * @param {Record<string, string | undefined>} env
 * @param {string} cacheBuster
 * @returns {Promise<{ appConfig: { configError: string | null; supabase: unknown } }>}
 */
async function loadConfig(env, cacheBuster) {
  const previous = {
    EXPO_PUBLIC_SUPABASE_URL: process.env.EXPO_PUBLIC_SUPABASE_URL,
    EXPO_PUBLIC_SUPABASE_ANON_KEY: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY,
    EXPO_PUBLIC_APP_ENV: process.env.EXPO_PUBLIC_APP_ENV,
  };

  for (const [key, value] of Object.entries(env)) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }

  try {
    return await import(`${ENV_MODULE}?case=${cacheBuster}`);
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  }
}

test('refuse une clé service_role dont la charge utile contient « - » ou « _ »', async () => {
  // La référence « ? » n'est pas décorative : c'est ce qui produit un « _ » dans
  // l'encodage base64url (0x3F au bon rang modulo 3). Ce payload est donc le cas
  // exact que l'alphabet base64 standard ne savait pas décoder — celui où la
  // garde laissait passer la clé en silence. L'assertion ci-dessous refuse tout
  // autre payload, pour que le test ne puisse pas se vider de son sens.
  const token = forgeToken({
    iss: 'supabase',
    role: 'service_role',
    ref: '?',
  });

  const encodedPayload = token.split('.')[1] ?? '';
  assert.match(
    encodedPayload,
    /[-_]/,
    'le cas de test doit contenir « - » ou « _ », sinon il ne prouve rien',
  );

  const { appConfig } = await loadConfig(
    {
      EXPO_PUBLIC_SUPABASE_URL: 'https://exemple.supabase.co',
      EXPO_PUBLIC_SUPABASE_ANON_KEY: token,
    },
    'service-role',
  );

  assert.equal(appConfig.supabase, null, 'la clé doit être refusée');
  assert.match(appConfig.configError ?? '', /service_role/);
});

test('refuse une clé secrète préfixée sb_secret_', async () => {
  const { appConfig } = await loadConfig(
    {
      EXPO_PUBLIC_SUPABASE_URL: 'https://exemple.supabase.co',
      EXPO_PUBLIC_SUPABASE_ANON_KEY: 'sb_secret_0123456789abcdef',
    },
    'sb-secret',
  );

  assert.equal(appConfig.supabase, null, 'la clé doit être refusée');
  assert.match(appConfig.configError ?? '', /sb_secret/);
});

test('accepte une clé anon et expose la configuration', async () => {
  const token = forgeToken({ iss: 'supabase', role: 'anon', exp: 2082844800 });

  const { appConfig } = await loadConfig(
    {
      EXPO_PUBLIC_SUPABASE_URL: 'https://exemple.supabase.co',
      EXPO_PUBLIC_SUPABASE_ANON_KEY: token,
    },
    'anon',
  );

  assert.equal(appConfig.configError, null);
  assert.deepEqual(appConfig.supabase, {
    url: 'https://exemple.supabase.co',
    anonKey: token,
  });
});

test('refuse une URL terminée par une barre oblique', async () => {
  const token = forgeToken({ role: 'anon' });

  const { appConfig } = await loadConfig(
    {
      EXPO_PUBLIC_SUPABASE_URL: 'https://exemple.supabase.co/',
      EXPO_PUBLIC_SUPABASE_ANON_KEY: token,
    },
    'trailing-slash',
  );

  assert.equal(appConfig.supabase, null);
  assert.match(appConfig.configError ?? '', /barre oblique/);
});

test("signale l'absence de configuration sans lever d'erreur", async () => {
  const { appConfig } = await loadConfig(
    {
      EXPO_PUBLIC_SUPABASE_URL: undefined,
      EXPO_PUBLIC_SUPABASE_ANON_KEY: undefined,
    },
    'unconfigured',
  );

  assert.equal(appConfig.supabase, null);
  assert.match(appConfig.configError ?? '', /Aucune configuration Supabase/);
});

test("aucun accès calculé à l'environnement, que la compilation ne remplacerait pas", () => {
  // Test de forme, et le seul possible ici : sous Node, `process.env[nom]`
  // fonctionne — les cinq tests ci-dessus passent donc avec **et** sans le
  // défaut. Mesuré sur un bundle de production : un accès littéral y est
  // substitué par sa valeur, un accès calculé par rien du tout, et la clé est
  // alors lue comme absente.
  const fichiers = fichiersSource();

  assert.ok(fichiers.length >= 10, `fichiers lus : ${fichiers.length}`);

  const fautifs = [];
  for (const chemin of fichiers) {
    if (/process\.env\[/.test(lireSource(chemin))) {
      fautifs.push(relative(RACINE, chemin).replace(/\\/g, '/'));
    }
  }

  assert.deepEqual(
    fautifs,
    [],
    'un accès calculé à process.env ne serait pas remplacé à la compilation',
  );
});

test("le lecteur d'environnement lit ses trois variables en toutes lettres", () => {
  // Contrôle du test précédent : sans lui, il serait vert pour de mauvaises
  // raisons — un chemin erroné, ou un fichier vidé, ne contient aucun accès
  // calculé.
  //
  // Ce test s'appelait « le lecteur **unique** lit ses trois variables en
  // toutes lettres », et son nom promettait plus que son corps : il vérifie
  // l'orthographe des accès, pas l'unicité du lecteur. L'unicité est désormais
  // tenue par le test suivant, et le nom a été ramené à ce qu'il fait.
  const source = lireSource(fileURLToPath(new URL('../src/config/env.ts', import.meta.url)));

  for (const variable of [
    'process.env.EXPO_PUBLIC_SUPABASE_URL',
    'process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY',
    'process.env.EXPO_PUBLIC_APP_ENV',
  ]) {
    assert.ok(source.includes(variable), `${variable} doit être lu en toutes lettres`);
  }
});

test("aucun module autre que le lecteur d'environnement ne lit process.env", () => {
  // L'argument de sécurité de `src/config/env.ts` repose entièrement sur cette
  // invariante — il l'énonce lui-même : « Aucun autre module ne lit
  // `process.env` », et c'est ce qui rend la garde possible, puisque le refus
  // d'une clé `service_role` vit dans le lecteur.
  //
  // Rien ne l'imposait jusqu'ici. Un module qui lirait la clé directement
  // contournerait ce refus sans qu'aucun test ne s'en aperçoive — et
  // `SECURITY.md` rappelle que c'est la fuite qui coûte le plus cher : la clé
  // `service_role` dans le bundle ouvre la base en lecture et en écriture à
  // quiconque extrait le paquet.
  const fichiers = fichiersSource();

  assert.ok(fichiers.length >= 10, `fichiers lus : ${fichiers.length}`);

  const lecteur = 'src/config/env.ts';
  const fautifs = fichiers
    .map((chemin) => relative(RACINE, chemin).replace(/\\/g, '/'))
    .filter(
      (chemin) => chemin !== lecteur && /process\.env/.test(lireSource(join(RACINE, chemin))),
    );

  assert.deepEqual(fautifs, [], "un seul module doit lire l'environnement");

  // Contrôle : le lecteur, lui, doit bien en contenir — sinon un chemin erroné
  // rendrait ce test vert pour de mauvaises raisons.
  assert.match(
    lireSource(join(RACINE, lecteur)),
    /process\.env/,
    'le lecteur doit lire process.env, sinon le test ne prouve rien',
  );
});

test('les variables lues sont exactement celles déclarées dans les types', () => {
  // `types/globals.d.ts` affirmait que la déclaration `ProcessEnv` empêchait les
  // fautes de frappe : « une variable absente de cette liste n'est pas
  // utilisable… ce qui évite les fautes de frappe silencieuses ».
  //
  // **C'est faux, et mesuré.** `ProcessEnv` hérite de `Dict<string>`, soit
  // `[key: string]: string | undefined` : toute clé est acceptée. Une sonde
  // contenant `process.env.EXPO_PUBLIC_SUPABASE_ANON_KEYK` — un « K » de trop —
  // et une variable entièrement inventée passait `tsc --noEmit` avec un code de
  // sortie de 0.
  //
  // La conséquence est celle de la passe 13, et elle est silencieuse : la clé est
  // lue comme absente, l'application affiche l'écran de configuration, et rien ne
  // distingue une faute de frappe d'une absence volontaire de configuration.
  //
  // C'est donc **ce test** qui tient la garde, et non la déclaration de types —
  // dont le commentaire a été corrigé dans le même sens. L'égalité est exigée
  // dans les deux sens : une variable lue mais non déclarée est une faute de
  // frappe, une variable déclarée mais non lue est une promesse non tenue.
  const declarees = [
    ...readFileSync(
      fileURLToPath(new URL('../types/globals.d.ts', import.meta.url)),
      'utf8',
    ).matchAll(/readonly\s+(EXPO_PUBLIC_[A-Z0-9_]+)\s*\??:/g),
  ].map((found) => found[1]);

  // Les commentaires sont retirés : le mode d'emploi de `readEnv` cite
  // `process.env.EXPO_PUBLIC_URL` en exemple, et le compter ici ferait échouer le
  // test sur sa propre documentation.
  const lues = [
    ...lireSource(fileURLToPath(new URL('../src/config/env.ts', import.meta.url))).matchAll(
      /process\.env\.(EXPO_PUBLIC_[A-Z0-9_]+)/g,
    ),
  ].map((found) => found[1]);

  // Contrôle : sur un fichier déplacé ou vidé, les deux listes seraient vides et
  // l'égalité serait vraie — le test serait vert pour de mauvaises raisons.
  assert.ok(declarees.length > 0, `variables déclarées trouvées : ${declarees.length}`);
  assert.ok(lues.length > 0, `variables lues trouvées : ${lues.length}`);

  assert.deepEqual(
    [...new Set(lues)].sort(),
    [...new Set(declarees)].sort(),
    'une variable lue doit être déclarée, et réciproquement',
  );
});

/**
 * Source d'un module, réduite aux **emplois** de ses symboles.
 *
 * Deux retraits, chacun pour une raison mesurée :
 *
 *  - les **commentaires**, sans quoi une phrase de documentation ferait passer un
 *    export mort pour employé ;
 *  - les **déclarations d'import**, sans quoi un import que personne n'utilise
 *    compterait comme un emploi. C'est le cas qui a révélé le défaut de ce test :
 *    en ramenant `App.tsx` à l'expression en clair, le nom apparaissait encore
 *    deux fois — la déclaration, et l'import devenu orphelin — et le test restait
 *    vert alors qu'il aurait dû tomber.
 *
 * `noUnusedLocals` n'est **pas** activé dans `tsconfig.json` : `tsc` ne rattrape
 * donc pas le second cas, et c'est ce test qui le tient.
 */
function lirePourReference(chemin) {
  return sansCommentaires(readFileSync(chemin, 'utf8')).replace(/^import\b[\s\S]*?;$/gm, '');
}

test("aucun export de `env.ts` n'est déclaré sans être employé", () => {
  // Un export mort n'est pas qu'un détail de rangement. `isSupabaseConfigured`
  // était exporté, documenté — et employé **nulle part**, tandis que le même
  // prédicat était réécrit en clair dans `App.tsx` (`appConfig.supabase !==
  // null`) et dans `supabase.ts` (`appConfig.supabase === null`). Le lecteur qui
  // cherche « où la configuration est-elle jugée valide » tombe sur l'export, le
  // croit canonique, et en ajoute une troisième copie.
  //
  // Le contrôle est volontairement grossier, et suffisant : le nom d'un export
  // doit apparaître **au moins deux fois** hors déclarations d'import — sa
  // déclaration, et l'endroit qui s'en sert. Un nom qui n'apparaît qu'une fois
  // est un nom que personne n'emploie.
  const noms = [
    ...lireSource(fileURLToPath(new URL('../src/config/env.ts', import.meta.url))).matchAll(
      /export\s+(?:const|function|class|interface|type)\s+([A-Za-z_$][\w$]*)/g,
    ),
  ].map((found) => found[1]);

  // Contrôle : sur un motif qui ne correspondrait plus, la liste serait vide et
  // l'égalité ci-dessous vraie — le test serait vert pour de mauvaises raisons.
  assert.ok(noms.length > 0, `exports trouvés dans env.ts : ${noms.length}`);

  // Le code de l'application, et lui seul : un export qu'un test emploierait
  // seul resterait du code mort du point de vue de l'application.
  const sources = fichiersSource().map((chemin) => lirePourReference(chemin));
  sources.push(lirePourReference(join(RACINE, 'App.tsx')));
  sources.push(lirePourReference(join(RACINE, 'index.ts')));

  const orphelins = noms.filter((nom) => {
    // `$` est le seul caractère de ces noms qui ait un sens en expression
    // régulière ; l'échapper évite de compter `AppConfig` pour `Config`.
    const motif = new RegExp(`\\b${nom.replace(/\$/g, '\\$')}\\b`, 'g');
    const occurrences = sources.reduce(
      (total, source) => total + (source.match(motif) ?? []).length,
      0,
    );
    return occurrences < 2;
  });

  assert.deepEqual(
    orphelins,
    [],
    "un export de `env.ts` n'est employé nulle part : le lecteur le croira " +
      "canonique et en fera une copie au lieu de s'en servir",
  );
});

/**
 * Les fichiers qui cachent quelque chose à qui n'est pas développeur.
 *
 * Liste **fermée, dans les deux sens** : un fichier qui se mettrait à employer
 * `isDevelopment` sans figurer ici échoue — le critère doit rester unique —, et
 * une entrée qui ne l'emploie plus échoue aussi.
 */
const QUI_MASQUENT = ['src/errors/index.ts', 'src/screens/ConfigurationScreen.tsx'];

test('ce qui est caché à l’adhérent se décide sur `isDevelopment`, jamais sur `appEnv`', () => {
  // Deux endroits masquent quelque chose à qui n'est pas développeur : le détail
  // technique d'une erreur, et la procédure de mise en place de la
  // configuration. Ils appliquaient **deux critères différents** —
  // `isDevelopment` pour l'un, `appConfig.appEnv === 'production'` pour l'autre —
  // alors que le second citait le premier comme sa règle.
  //
  // L'écart ne se voyait pas à la lecture, et se voyait à l'usage : l'APK publié
  // est un build **preview**, donc `appEnv` y vaut « preview », et l'écran de
  // configuration aurait affiché à un parent la procédure d'un développeur —
  // « Copiez `.env.example` en `.env.local` » — au moment précis où il faut lui
  // dire qui contacter. Mesuré le 2026-09-19.
  //
  // `appEnv` décrit le **profil de compilation** ; il ne dit pas qui tient
  // l'appareil. Un binaire installé sur un téléphone n'est pas un poste de
  // développement, quel que soit le profil qui l'a produit.
  const vus = [];

  const fichiers = [...fichiersSource(), join(RACINE, 'App.tsx'), join(RACINE, 'index.ts')];

  for (const chemin of fichiers) {
    const relatif = relative(RACINE, chemin).replace(/\\/g, '/');
    if (relatif === 'src/config/env.ts') {
      continue;
    }

    // `lirePourReference` retire les **imports** en plus des commentaires, et
    // c'est nécessaire : cet écran importe `isDevelopment`, si bien qu'une
    // lecture qui garde les imports compterait le nom même si la condition ne
    // l'employait plus. Mesuré — la mutation « la condition devient
    // `if (false)` » restait verte. C'est le même piège que le banc d'orphelins
    // de `check-async-wiring`, qui comptait les occurrences d'un nom au lieu de
    // regarder la relation.
    const source = lirePourReference(chemin);

    if (/\bisDevelopment\b/.test(source)) {
      vus.push(relatif);
    }

    assert.doesNotMatch(
      source,
      /\bappEnv\b/,
      `${relatif} décide d’après \`appEnv\` : c’est le profil EAS, pas le public. ` +
        'Le critère du masquage est `isDevelopment`',
    );
  }

  assert.deepEqual(
    vus.sort(),
    [...QUI_MASQUENT].sort(),
    'la liste des fichiers qui masquent quelque chose a changé : un nouveau venu ' +
      'doit être déclaré ici — le critère doit rester unique —, et une entrée qui ' +
      'ne masque plus doit en sortir, sinon elle ferait croire à un masquage',
  );
});
