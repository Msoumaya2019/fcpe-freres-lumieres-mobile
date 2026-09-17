/**
 * Vérifie la configuration de compilation — les fichiers qui décident **où** le
 * code est compilé, et **avec quoi**.
 *
 * POURQUOI CE FICHIER
 * -------------------
 * `.github/workflows/ci.yml` portait ce commentaire, au-dessus de la version de
 * Node :
 *
 *     # Version fixée : … Doit rester alignée sur .nvmrc et eas.json.
 *
 * Un contrat écrit dans un commentaire n'est vérifié par personne. Quatre
 * fichiers portent ici une copie de cette version — `.nvmrc` (le poste de
 * travail), `ci.yml` (l'intégration continue), `eas-build.yml` (le déclencheur
 * du build EAS) et `eas.json` (la version utilisée par EAS lui-même) — et leur
 * accord ne tenait qu'à la mémoire de qui les modifiait.
 *
 * L'écart est silencieux : le poste compile en 22, la CI en 24, et rien ne le
 * signale avant qu'un bundle ne se comporte autrement que ce qui a été testé.
 * C'est la même famille de défaut que le lien de réinitialisation, dont l'ordre
 * de deux opérations était décrit en prose et qu'aucun test ne tenait.
 *
 * Ce fichier ne remplace pas le commentaire : il le rend exécutable.
 *
 * Une alternative existait : **supprimer** les copies plutôt que les vérifier.
 * `actions/setup-node` accepte `node-version-file: '.nvmrc'`, ce qui ramènerait
 * quatre déclarations à deux — `.nvmrc` et `eas.json`, que le service EAS lit
 * seul. Elle a été écartée : un flux GitHub ne peut pas être exécuté ici, et
 * remplacer une valeur **vérifiée** par un renvoi **non vérifiable** échangerait
 * une garantie mesurée contre une supposition. Le jour où le renvoi aura été
 * observé sur un vrai exécuteur, il sera préférable.
 *
 * Deux invariants moins attendus sont venus avec. `env.ts` lit trois variables
 * `EXPO_PUBLIC_*`, et `.env.example` en propose trois : les confronter attrape la
 * **faute de frappe** dans un accès à `process.env` — `EXPO_PUBLIC_SUPABASE_URLL`
 * — que les types ne voient pas, puisque `ProcessEnv` hérite de `Dict<string>` et
 * qu'un nom inconnu y est parfaitement valide. Et chaque profil de `eas.json`
 * nomme son environnement **deux fois** — `environment` pour les variables
 * injectées par EAS, `EXPO_PUBLIC_APP_ENV` pour l'application : les faire
 * diverger enverrait un build de prévisualisation écrire dans la base de
 * production, sans qu'aucune des deux valeurs ne soit fausse en soi.
 *
 * Deux invariants de sûreté des flux complètent l'ensemble : aucun flux qui
 * utilise un secret ne doit se déclencher sur `pull_request`, et aucun ne doit se
 * donner plus que la lecture du dépôt — sans `permissions:` déclaré, GitHub
 * accorde le réglage par défaut, qui peut être en écriture.
 *
 * Un troisième accord, trouvé en initialisant le dépôt Git, n'appartenait à
 * aucun test. `git add` a signalé « LF will be replaced by CRLF » sur **chaque**
 * fichier : `core.autocrlf` vaut `true` par défaut sous Git pour Windows, et ce
 * réglage vit dans la machine, pas dans le dépôt. Or `.prettierrc.json` impose
 * `endOfLine: "lf"`, qui juge le dossier de travail tel qu'il est sur le disque.
 * Sans `.gitattributes`, un clone sous Windows reçoit donc du CRLF partout et
 * `format:check` échoue sur chaque fichier — mesuré à 22 503 CRLF, contre 0
 * après la règle. Le même dépôt reste vert sur un exécuteur Linux, où
 * `autocrlf` est faux : un écart qui ne se voit que d'un côté est le plus
 * coûteux, parce qu'il fait douter du code.
 *
 * CE QUE CES TESTS NE PEUVENT PAS VOIR
 * ------------------------------------
 * Ils lisent les fichiers **du dépôt**, tels qu'ils sont sur le disque. Quatre
 * choses leur échappent :
 *
 *  - une modification faite dans l'interface de GitHub, qui ne redescend dans le
 *    dépôt que lorsque quelqu'un la récupère ;
 *  - ce que le service EAS fait réellement de `build.base.node` : `eas-cli` n'est
 *    pas une dépendance locale (`eas-version: latest` dans le workflow), donc son
 *    lecteur ne peut pas être inspecté ici. Le test vérifie que la valeur
 *    **déclarée** est cohérente, pas qu'elle est honorée ;
 *  - le fait qu'un jeton soit réellement absent du dépôt : `secrets.EXPO_TOKEN` ne
 *    contient jamais sa valeur, seulement sa référence ;
 *  - le **résultat** de `.gitattributes` sur un clone : la suite lit la règle,
 *    elle ne clone pas. La mesure a été faite une fois, à la main, en comparant
 *    les octets d'un `git checkout-index` avant et après (`core.autocrlf=true`) ;
 *    ce qui est tenu ici est que la règle est là et qu'elle dit la bonne chose.
 */

import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

/** Lit un fichier du dépôt, en texte, depuis la racine du projet. */
function lire(chemin) {
  return readFileSync(fileURLToPath(new URL(`../${chemin}`, import.meta.url)), 'utf8');
}

const DOSSIER_WORKFLOWS = fileURLToPath(new URL('../.github/workflows', import.meta.url));

/** Les ressources embarquées : icônes, écran de démarrage. */
const DOSSIER_ASSETS = fileURLToPath(new URL('../assets', import.meta.url));

/**
 * Les flux de travail du dépôt.
 *
 * Le nom des fichiers est vérifié plus bas : un flux renommé disparaîtrait
 * silencieusement de la couverture, et les boucles ci-dessous deviendraient
 * vertes sans rien examiner.
 */
function workflows() {
  return readdirSync(DOSSIER_WORKFLOWS)
    .filter((nom) => nom.endsWith('.yml') || nom.endsWith('.yaml'))
    .sort()
    .map((nom) => ({ nom, source: lire(`.github/workflows/${nom}`) }));
}

/**
 * Extrait un bloc de premier niveau : la clé en colonne zéro, puis ses lignes
 * indentées, jusqu'à la prochaine clé en colonne zéro.
 *
 * Volontairement limité à ce que ces fichiers contiennent. Un analyseur YAML
 * serait plus juste, mais il faudrait une dépendance pour lire une quinzaine de
 * lignes — et `yaml` n'est pas une dépendance directe du projet.
 */
function blocDePremierNiveau(source, cle) {
  const lignes = source.split('\n');
  const debut = lignes.findIndex((ligne) => new RegExp(`^${cle}:\\s*$`).test(ligne));
  assert.notEqual(
    debut,
    -1,
    `aucune clé \`${cle}:\` en début de ligne : le contrôle ne porterait sur rien`,
  );

  const apres = lignes.slice(debut + 1);
  const fin = apres.findIndex((ligne) => /^[^\s#]/.test(ligne));
  const bloc = (fin === -1 ? apres : apres.slice(0, fin)).join('\n');

  assert.notEqual(bloc.trim(), '', `le bloc \`${cle}:\` est vide`);
  return bloc;
}

/**
 * Les quatre copies de la version de Node, et d'où chacune se lit.
 *
 * Chaque lecture est vérifiée : une clé renommée dans l'un des fichiers doit
 * faire échouer ce test, pas le vider de sa substance.
 */
function versionsDeNode() {
  const ci = lire('.github/workflows/ci.yml').match(/^\s*NODE_VERSION:\s*'([^']+)'/m);
  assert.notEqual(ci, null, '`ci.yml` ne déclare plus `NODE_VERSION`');

  const easWorkflow = lire('.github/workflows/eas-build.yml').match(
    /^\s*node-version:\s*'([^']+)'/m,
  );
  assert.notEqual(easWorkflow, null, '`eas-build.yml` ne fixe plus `node-version`');

  const easJson = JSON.parse(lire('eas.json'));
  const easBuild = easJson?.build?.base?.node;
  assert.equal(
    typeof easBuild,
    'string',
    '`eas.json` ne déclare plus `build.base.node` : la version d’EAS n’est plus fixée',
  );

  return [
    { source: '.nvmrc', version: lire('.nvmrc').trim() },
    { source: '.github/workflows/ci.yml', version: ci[1] },
    { source: '.github/workflows/eas-build.yml', version: easWorkflow[1] },
    { source: 'eas.json (build.base.node)', version: easBuild },
  ];
}

/** Compare deux versions à trois nombres. */
function comparer(a, b) {
  for (let rang = 0; rang < 3; rang += 1) {
    if (a[rang] !== b[rang]) {
      return a[rang] - b[rang];
    }
  }
  return 0;
}

/**
 * `engines.node` est une **plage** (`>=22.0.0 <23.0.0`), les quatre autres
 * fichiers une **version**.
 *
 * Rien n'oblige npm à faire respecter cette plage (`engine-strict` n'est pas
 * activé) : un désaccord ne casse donc pas la CI, il produit un avertissement
 * que personne ne lit. C'est exactement le genre d'écart que ce fichier doit
 * rendre visible.
 *
 * Le comparateur ne couvre que les inégalités simples et **refuse** toute autre
 * forme plutôt que de la laisser passer : une plage qui utiliserait `^` ou `||`
 * doit faire échouer le test, pas le contourner.
 */
function satisfait(plage, version) {
  const cible = version.split('.').map(Number);
  assert.equal(cible.length, 3, `« ${version} » n'est pas une version à trois nombres`);
  assert.ok(
    cible.every((nombre) => Number.isInteger(nombre)),
    `« ${version} » n'est pas entièrement numérique`,
  );

  const bornes = plage.trim().split(/\s+/);
  for (const borne of bornes) {
    const lecture = borne.match(/^(>=|<=|>|<|=)?(\d+)\.(\d+)\.(\d+)$/);
    assert.notEqual(
      lecture,
      null,
      `la borne « ${borne} » n'est pas comprise par ce comparateur : le test la ` +
        'laisserait passer sans la vérifier',
    );

    const [, operateur, majeur, mineur, correctif] = lecture;
    const comparaison = comparer(cible, [Number(majeur), Number(mineur), Number(correctif)]);
    const respectee =
      operateur === '>='
        ? comparaison >= 0
        : operateur === '<='
          ? comparaison <= 0
          : operateur === '>'
            ? comparaison > 0
            : operateur === '<'
              ? comparaison < 0
              : comparaison === 0;

    if (!respectee) {
      return false;
    }
  }

  return true;
}

/**
 * Environnement logique d'un profil de build : sa propre valeur, ou celle
 * héritée de `base`.
 *
 * `production` ne déclare pas `EXPO_PUBLIC_APP_ENV` et vit donc sur l'héritage —
 * c'est volontaire, mais c'est aussi ce qui rend un futur profil dangereux : un
 * profil ajouté qui étend `base` sans rien redéfinir devient « production » sans
 * que personne ne l'ait écrit.
 */
function environnementLogique(easJson, profil) {
  const propre = easJson.build[profil]?.env?.EXPO_PUBLIC_APP_ENV;
  const herite = easJson.build.base?.env?.EXPO_PUBLIC_APP_ENV;
  return propre ?? herite;
}

/** Variables réellement assignées dans `.env.example` — les lignes commentées ne comptent pas. */
function variablesDeLExemple() {
  const assignations = lire('.env.example').match(/^([A-Z][A-Z0-9_]*)=/gm) ?? [];
  return assignations.map((ligne) => ligne.slice(0, -1)).sort();
}

/**
 * Retire les commentaires d'un fichier TypeScript.
 *
 * NÉCESSAIRE, et mesuré : la première version de ce test lisait `env.ts` tel
 * quel et trouvait **quatre** variables au lieu de trois. La quatrième,
 * `EXPO_PUBLIC_URL`, ne vit que dans le commentaire qui explique pourquoi l'accès
 * doit rester littéral — « `process.env.EXPO_PUBLIC_URL`, jamais
 * `process.env[nom]` ». Le test échouait donc sur sa propre documentation, comme
 * `check-rls-guards` aurait pu le faire avec les commentaires SQL qui parlent de
 * `status` et de `role`.
 *
 * Le `[^:]` devant `//` protège les URL : sans lui, `'https://'` serait coupé au
 * milieu d'une chaîne et la fin de la ligne disparaîtrait de l'analyse.
 */
function sansCommentaires(source) {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
}

/** Variables `EXPO_PUBLIC_*` que `src/config/env.ts` lit réellement. */
function variablesLues() {
  const acces = sansCommentaires(lire('src/config/env.ts')).match(/process\.env\.EXPO_PUBLIC_\w+/g);
  assert.notEqual(acces, null, '`env.ts` ne lit plus aucune variable `EXPO_PUBLIC_*`');
  return [...new Set(acces.map((acces_) => acces_.replace('process.env.', '')))].sort();
}

/**
 * Règles de `.gitattributes`, commentaires retirés.
 *
 * Le retrait n'est pas cosmétique : le fichier explique en prose que la
 * conversion en CRLF est le problème à éviter, et une recherche textuelle sur
 * « CRLF » ou sur « eol » trouverait d'abord cette prose. Une règle se lit
 * donc après retrait des lignes commençant par `#`.
 *
 * Une règle est « motif attributs… » ; le motif ne contient pas d'espace ici,
 * ce qui autorise une découpe naïve.
 */
function reglesDAttributs() {
  return lire('.gitattributes')
    .replace(/^[ \t]*#.*$/gm, '')
    .split('\n')
    .map((ligne) => ligne.trim())
    .filter((ligne) => ligne.length > 0)
    .map((ligne) => {
      const [motif, ...attributs] = ligne.split(/\s+/);
      return { motif, attributs };
    });
}

test('les deux flux de travail attendus sont bien lus', () => {
  // Sans cette assertion, un fichier renommé rendrait toutes les boucles
  // suivantes vertes sans qu'elles examinent quoi que ce soit.
  const noms = workflows().map(({ nom }) => nom);
  for (const attendu of ['ci.yml', 'eas-build.yml']) {
    assert.ok(noms.includes(attendu), `${attendu} est introuvable dans .github/workflows`);
  }
});

test('la version de Node est la même dans les quatre fichiers qui la fixent', () => {
  const versions = versionsDeNode();

  // Quatre lectures distinctes : un copier-coller dans la fonction ci-dessus
  // rendrait la comparaison circulaire, et donc toujours vraie.
  assert.equal(
    new Set(versions.map(({ source }) => source)).size,
    versions.length,
    'deux entrées désignent le même fichier : la comparaison ne prouverait rien',
  );

  const reference = versions[0];
  for (const { source, version } of versions) {
    assert.equal(
      version,
      reference.version,
      `${source} fixe Node ${version}, alors que ${reference.source} fixe ` +
        `${reference.version} : l'écart ne se voit ni à la compilation, ni dans ` +
        'un test, seulement dans un bundle compilé ailleurs',
    );
  }
});

test('la version fixée est comprise dans la plage `engines.node` du paquet', () => {
  const { engines } = JSON.parse(lire('package.json'));
  const plage = engines?.node;
  assert.equal(typeof plage, 'string', '`package.json` ne déclare plus `engines.node`');

  const { source, version } = versionsDeNode()[0];
  assert.ok(
    satisfait(plage, version),
    `${source} fixe Node ${version}, hors de la plage déclarée « ${plage} » : npm ` +
      "avertirait sans échouer, et l'avertissement ne serait lu par personne",
  );
});

test('chaque profil de build désigne le même environnement que celui où il se croit', () => {
  // Deux déclarations indépendantes portent le même nom dans `eas.json` :
  // `environment` choisit l'environnement EAS dont viennent les variables
  // Supabase — donc **la base de données visée** — et `EXPO_PUBLIC_APP_ENV` dit à
  // l'application où elle croit être. Rien ne les relie, et aucune des deux
  // n'est fausse en soi : les faire diverger donnerait un build de
  // prévisualisation écrivant dans la base de production, ou l'inverse, sans
  // qu'aucun outil ne le signale.
  const easJson = JSON.parse(lire('eas.json'));
  const profils = Object.keys(easJson.build).filter((nom) => nom !== 'base');
  assert.notEqual(profils.length, 0, 'aucun profil de build : le contrôle serait vide');

  for (const profil of profils) {
    const declare = easJson.build[profil].environment;
    assert.equal(
      typeof declare,
      'string',
      `le profil « ${profil} » ne déclare pas \`environment\` : l'environnement EAS ` +
        "dont il tire ses variables n'est pas choisi explicitement",
    );

    const logique = environnementLogique(easJson, profil);
    assert.equal(
      logique,
      declare,
      `le profil « ${profil} » tire ses variables de l'environnement EAS ` +
        `« ${declare} » alors que l'application s'y croira en « ${logique} »`,
    );
  }
});

test('aucun flux déclenché par une pull request ne peut atteindre un secret', () => {
  // GitHub ne transmet déjà pas les secrets aux pull requests venues d'un dépôt
  // forké. La règle est donc une ceinture en plus des bretelles — mais elle a une
  // raison propre : `ci.yml` doit rester exécutable sans aucun secret, c'est ce
  // qui permet de valider la contribution de n'importe qui. Si un flux a un jour
  // besoin d'un secret sur `pull_request`, cet échec force une décision explicite
  // plutôt qu'un glissement.
  const avecSecret = [];

  for (const { nom, source } of workflows()) {
    if (!source.includes('secrets.')) {
      continue;
    }
    avecSecret.push(nom);
    assert.equal(
      /pull_request/.test(blocDePremierNiveau(source, 'on')),
      false,
      `${nom} utilise un secret et se déclenche sur \`pull_request\` : le secret ` +
        'deviendrait atteignable depuis une contribution extérieure',
    );
  }

  assert.notEqual(
    avecSecret.length,
    0,
    "aucun flux n'utilise de secret : cette boucle ne vérifie plus rien, et la " +
      "règle « aucun secret nécessaire » doit être relue avant d'être supprimée",
  );
});

test("`ci.yml` n'utilise aucun secret, et c'est une contrainte de conception", () => {
  const source = lire('.github/workflows/ci.yml');
  assert.equal(
    source.includes('secrets.'),
    false,
    "l'intégration continue doit rester exécutable sans secret : c'est ce qui " +
      'permet de compiler le bundle, et donc de valider une contribution externe',
  );
});

test('chaque flux déclare ses permissions, et aucune ne demande l’écriture', () => {
  for (const { nom, source } of workflows()) {
    // Un flux sans bloc `permissions:` reçoit le réglage par défaut du dépôt, qui
    // peut accorder l'écriture. Le déclarer explicitement est le seul moyen de
    // savoir ce que le jeton peut faire.
    const bloc = blocDePremierNiveau(source, 'permissions');
    assert.equal(
      /:\s*write\b/.test(bloc),
      false,
      `${nom} demande un droit d'écriture (${bloc.trim().replace(/\s+/g, ' ')}). ` +
        "Aucun flux n'en a besoin aujourd'hui : en accorder un doit être un choix " +
        'nommé, pas un héritage du réglage par défaut',
    );
  }
});

test('`.env.example` n’assigne que des variables publiques', () => {
  const variables = variablesDeLExemple();
  assert.notEqual(variables.length, 0, 'aucune variable assignée : le contrôle serait vide');

  for (const nom of variables) {
    assert.ok(
      nom.startsWith('EXPO_PUBLIC_'),
      `« ${nom} » n'est pas préfixée \`EXPO_PUBLIC_\` : Expo ne l'injecterait pas ` +
        'dans le bundle, et celui qui la renseignerait croirait avoir configuré ' +
        "l'application alors que sa valeur ne serait jamais lue",
    );
  }
});

test('`.env.example` et `src/config/env.ts` déclarent les mêmes variables', () => {
  // Le sens le plus utile de cette comparaison est celui-ci : une variable
  // **lue** mais absente du modèle signale une faute de frappe dans un accès à
  // `process.env` — `EXPO_PUBLIC_SUPABASE_URLL` — que ni `tsc` ni ESLint ne
  // relèvent, `ProcessEnv` héritant de `Dict<string>`.
  assert.deepEqual(
    variablesDeLExemple(),
    variablesLues(),
    "l'écart est dans l'un des deux sens : une variable déclarée mais jamais lue " +
      'fait croire à une configuration qui n’agit pas ; une variable lue mais ' +
      'jamais déclarée est le symptôme d’une faute de frappe dans `env.ts`',
  );
});

test('les fins de ligne sont fixées par le dépôt, pas par la machine', () => {
  // `.prettierrc.json` impose `endOfLine`. Ce réglage juge le dossier de travail
  // **tel qu'il est sur le disque** : il ne peut rien contre un `git checkout`
  // qui écrit du CRLF. Le seul fichier qui puisse l'en empêcher est
  // `.gitattributes`, et aucun des deux ne lit l'autre. C'est leur accord qu'on
  // mesure — d'où la valeur **lue** dans Prettier plutôt que recopiée ici.
  const attendu = JSON.parse(lire('.prettierrc.json')).endOfLine;
  assert.ok(
    attendu === 'lf' || attendu === 'crlf',
    `\`endOfLine\` vaut « ${attendu} » : ce contrôle ne sait tenir que « lf » ou « crlf »`,
  );

  const generale = reglesDAttributs().find(({ motif }) => motif === '*');
  assert.notEqual(
    generale,
    undefined,
    'aucune règle générale `*` dans `.gitattributes` : les fichiers non nommés ' +
      'retombent sur `core.autocrlf`, qui vaut `true` sous Git pour Windows par ' +
      'défaut. Un clone y reçoit alors du CRLF partout, et `format:check` échoue ' +
      'sur chaque fichier — mesuré : 22 503 CRLF avant la règle, 0 après',
  );
  assert.ok(
    generale.attributs.includes('text=auto'),
    '`text=auto` manque : sans lui, Git ne devine la nature des fichiers que par ' +
      '`core.autocrlf`, et un fichier binaire pourrait être converti',
  );
  assert.ok(
    generale.attributs.includes(`eol=${attendu}`),
    `la règle générale ne fixe pas \`eol=${attendu}\` : \`text=auto\` seul normalise ` +
      "le **dépôt**, mais laisse la machine décider du dossier de travail — c'est " +
      'précisément le réglage local que ce fichier existe pour neutraliser',
  );
});

test('chaque extension binaire présente dans `assets/` est déclarée binaire', () => {
  // Ensemble **fermé** : on part des fichiers réellement présents, pas d'une
  // liste d'extensions imaginées. Une image dont les octets seraient réécrits
  // est une image silencieusement corrompue.
  const extensions = [
    ...new Set(readdirSync(DOSSIER_ASSETS).map((nom) => nom.split('.').pop())),
  ].sort();
  assert.notEqual(extensions.length, 0, '`assets/` est vide : le contrôle ne porterait sur rien');

  const declarees = reglesDAttributs()
    .filter(({ attributs }) => attributs.includes('binary'))
    .map(({ motif }) => motif);

  for (const extension of extensions) {
    assert.ok(
      declarees.includes(`*.${extension}`),
      `les fichiers « .${extension} » de \`assets/\` ne sont pas déclarés \`binary\` : ` +
        'leur contenu dépend alors de la détection automatique, et une conversion ' +
        'de fins de ligne y écrirait des octets qui ne sont pas ceux de l’image',
    );
  }
});
