/**
 * Vérifie que `eas.json` n'emploie que le vocabulaire du schéma d'EAS.
 *
 * POURQUOI CE FICHIER
 * -------------------
 * `eas.json` décide **ce que l'adhérent recevra** : un `apk` installable ou un
 * `app-bundle` réservé au magasin, la distribution interne ou publique, le canal
 * de mise à jour, l'environnement EAS d'où viennent les clés Supabase. Il est lu
 * par un service distant, jamais par ce dépôt.
 *
 * Une faute de frappe y est donc **silencieuse** : EAS ignore la clef inconnue
 * et applique sa valeur par défaut. `"canal": "preview"` au lieu de `"channel"`
 * ne produit ni erreur ni avertissement — le canal n'est simplement pas réglé.
 * L'écart ne se découvre qu'après vingt minutes de build, sur l'artefact.
 *
 * Or **rien ne relie `eas.json` au vocabulaire du schéma**, et le schéma lui-même
 * ne le fait pas : mesuré le 2026-09-18, il n'oppose `additionalProperties:
 * false` à aucun niveau. Sur quatorze mutations essayées, il en attrape **deux**
 * — les nomenclatures `buildType` et `distribution`. Il laisse passer six clefs
 * inconnues, un `environment` hors nomenclature, un `cli.version` qui n'est pas
 * une version, un `node` qui n'est pas une version, et même un `build` renommé.
 *
 * Valider `eas.json` contre le schéma ne suffit donc pas. Ce qu'on peut faire, et
 * que ce fichier fait : recopier le **vocabulaire** — la liste des clefs que le
 * schéma *déclare*, même s'il ne les *impose* pas — et confronter chaque clef de
 * `eas.json` à la position où elle se trouve.
 *
 * LE VOCABULAIRE EST RECOPIÉ, ET C'EST ASSUMÉ
 * -------------------------------------------
 * Il ne peut pas être lu à l'exécution : le schéma vit à une adresse réseau, et
 * une suite de tests qui dépend du réseau n'est pas une suite de tests. C'est la
 * même famille d'accord que les versions de Node recopiées à quatre endroits —
 * sauf qu'ici la source est distante, donc la recopie peut vieillir sans que
 * personne ne s'en aperçoive.
 *
 * Deux garde-fous limitent ce risque :
 *
 *  - la source et la date du relevé sont écrites ci-dessous, avec la version du
 *    paquet `@expo/eas-json` dont le vocabulaire a été extrait ;
 *  - une clef **refusée** doit être vérifiée contre le schéma avant d'être
 *    ajoutée ici. Un refus est un signal, pas un obstacle : c'est exactement le
 *    moment où l'on relit la documentation d'EAS.
 *
 * CE QUE CE FICHIER NE PEUT PAS VOIR
 * ----------------------------------
 *  - ce que le service EAS fait réellement du fichier : il est lu, pas exécuté ;
 *  - les **valeurs** des clefs qui ne portent pas de nomenclature — mesuré, ni
 *    `environment`, ni `appVersionSource`, ni `cli.version` ne sont contraints ;
 *  - les réglages du projet côté EAS (environnements, secrets, identifiants),
 *    qui ne vivent pas dans le dépôt.
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

/**
 * Source du vocabulaire.
 *
 * `expo/expo` ne l'héberge plus : l'adresse qui figurait dans `eas.json`
 * répondait 404, mesuré le 2026-09-18. Le paquet `@expo/eas-json` déclare
 * `repository.url = git+https://github.com/expo/eas-cli.git`, ce qui tranche
 * entre les deux emplacements possibles.
 */
const SOURCE_DU_VOCABULAIRE =
  'https://raw.githubusercontent.com/expo/eas-cli/main/packages/eas-json/schema/eas.schema.json';

/** Relevé le 2026-09-18, depuis `@expo/eas-json` 24.5.0. */
const RELEVE = '2026-09-18 / @expo/eas-json 24.5.0';

/**
 * Une position dont le schéma ne fixe pas le contenu.
 *
 * `env` reçoit des noms de variables libres, `config` des surcharges de
 * configuration native. Les déclarer explicitement est ce qui empêche une
 * position **oubliée** de passer pour une position ouverte : une position
 * absente du vocabulaire fait échouer le contrôle.
 */
const LIBRE = 'libre';

/** Une feuille ordinaire : le schéma n'impose pas de liste à son sujet. */
const FEUILLE = null;

/**
 * Le vocabulaire du schéma, par position.
 *
 * `<profil>` est le joker des profils : le schéma les accepte tous
 * (`patternProperties: .*`), c'est donc la **position** qui est vérifiée, pas le
 * nom du profil.
 */
const VOCABULAIRE = {
  $schema: FEUILLE,
  cli: {
    version: FEUILLE,
    requireCommit: FEUILLE,
    appVersionSource: FEUILLE,
    promptToConfigurePushNotifications: FEUILLE,
  },
  build: {
    '<profil>': {
      withoutCredentials: FEUILLE,
      extends: FEUILLE,
      credentialsSource: FEUILLE,
      channel: FEUILLE,
      distribution: FEUILLE,
      developmentClient: FEUILLE,
      prebuildCommand: FEUILLE,
      node: FEUILLE,
      corepack: FEUILLE,
      yarn: FEUILLE,
      pnpm: FEUILLE,
      bun: FEUILLE,
      env: LIBRE,
      cache: { disabled: FEUILLE, key: FEUILLE, customPaths: FEUILLE, paths: FEUILLE },
      autoIncrement: FEUILLE,
      buildArtifactPaths: FEUILLE,
      resourceClass: FEUILLE,
      config: LIBRE,
      environment: FEUILLE,
      android: {
        withoutCredentials: FEUILLE,
        image: FEUILLE,
        resourceClass: FEUILLE,
        ndk: FEUILLE,
        autoIncrement: FEUILLE,
        buildType: FEUILLE,
        gradleCommand: FEUILLE,
        applicationArchivePath: FEUILLE,
        artifactPath: FEUILLE,
        config: LIBRE,
      },
      ios: {
        withoutCredentials: FEUILLE,
        simulator: FEUILLE,
        enterpriseProvisioning: FEUILLE,
        autoIncrement: FEUILLE,
        image: FEUILLE,
        resourceClass: FEUILLE,
        bundler: FEUILLE,
        fastlane: FEUILLE,
        cocoapods: FEUILLE,
        scheme: FEUILLE,
        buildConfiguration: FEUILLE,
        applicationArchivePath: FEUILLE,
        artifactPath: FEUILLE,
        config: LIBRE,
      },
    },
  },
  submit: {
    '<profil>': {
      extends: FEUILLE,
      android: {
        serviceAccountKeyPath: FEUILLE,
        track: FEUILLE,
        releaseStatus: FEUILLE,
        rollout: FEUILLE,
        changesNotSentForReview: FEUILLE,
        applicationId: FEUILLE,
      },
      ios: {
        appleId: FEUILLE,
        ascAppId: FEUILLE,
        appleTeamId: FEUILLE,
        sku: FEUILLE,
        language: FEUILLE,
        companyName: FEUILLE,
        appName: FEUILLE,
        ascApiKeyPath: FEUILLE,
        ascApiKeyIssuerId: FEUILLE,
        ascApiKeyId: FEUILLE,
        bundleIdentifier: FEUILLE,
        groups: FEUILLE,
        metadataPath: FEUILLE,
      },
    },
  },
};

/**
 * Les positions que `eas.json` doit traverser.
 *
 * Liste **fermée, dans les deux sens** : une position atteinte qui n'est pas
 * déclarée ici échoue, et une position déclarée qui n'est plus atteinte échoue
 * aussi. Sans elle, une section ajoutée à `eas.json` serait traversée sans que
 * le vocabulaire dise ce qui y est permis — et le contrôle resterait vert.
 */
const POSITIONS_ATTENDUES = [
  '(racine)',
  'cli',
  'build',
  'build.<profil>',
  'build.<profil>.android',
  'build.<profil>.env',
  'submit',
  'submit.<profil>',
];

/** Lit un fichier du dépôt, en texte, depuis la racine du projet. */
function lire(chemin) {
  return readFileSync(fileURLToPath(new URL(`../${chemin}`, import.meta.url)), 'utf8');
}

function estObjet(valeur) {
  return valeur !== null && typeof valeur === 'object' && !Array.isArray(valeur);
}

/**
 * Parcourt `eas.json` en suivant le vocabulaire, et rapporte ce qu'il a vu.
 *
 * @param {unknown} noeud la valeur courante
 * @param {unknown} vocabulaire le nœud de vocabulaire correspondant
 * @param {string} position la position telle que `POSITIONS_ATTENDUES` la nomme
 * @param {string} chemin le chemin concret, pour nommer le défaut
 * @param {{ clefs: number, positions: Set<string>, defauts: string[] }} rapport
 */
function parcourir(noeud, vocabulaire, position, chemin, rapport) {
  if (!estObjet(noeud)) {
    rapport.defauts.push(
      `${chemin || '(racine)'} : un objet est attendu ici, ` +
        `la valeur est ${noeud === null ? 'null' : typeof noeud}`,
    );
    return;
  }

  rapport.positions.add(position);

  for (const [cle, valeur] of Object.entries(noeud)) {
    const ou = chemin === '' ? cle : `${chemin}.${cle}`;

    // Un nom déclaré l'emporte sur le joker : `build` est une clef nommée, et
    // c'est elle qu'on veut lire, pas un joker de la racine.
    const connu = Object.hasOwn(vocabulaire, cle);
    const joker = Object.hasOwn(vocabulaire, '<profil>');
    const sous = connu ? vocabulaire[cle] : joker ? vocabulaire['<profil>'] : undefined;

    if (sous === undefined) {
      rapport.defauts.push(
        `clef inconnue : ${ou} — le schéma d'EAS n'y déclare pas « ${cle} ». ` +
          'EAS l’ignorerait et appliquerait sa valeur par défaut, sans le signaler.',
      );
      continue;
    }

    rapport.clefs += 1;

    const suite = connu ? cle : '<profil>';
    const positionSuivante = `${position === '(racine)' ? '' : `${position}.`}${suite}`;

    // Une feuille ordinaire : le schéma n'en dit rien de plus, et il n'y a rien
    // à descendre. Seules les positions `LIBRE` méritent d'être nommées, parce
    // qu'elles sont le seul endroit où le vocabulaire renonce à vérifier.
    if (sous === FEUILLE) {
      continue;
    }

    if (sous === LIBRE) {
      rapport.positions.add(positionSuivante);
      continue;
    }

    parcourir(valeur, sous, positionSuivante, ou, rapport);
  }
}

/** Le rapport d'un parcours de `eas.json`. */
function inspecter() {
  const rapport = { clefs: 0, positions: new Set(), defauts: [] };
  parcourir(JSON.parse(lire('eas.json')), VOCABULAIRE, '(racine)', '', rapport);
  return rapport;
}

test('`eas.json` n’emploie que des clefs déclarées par le schéma d’EAS', () => {
  // Le contrôle qui compte : c'est lui qui attrape `canal`, `buildTyp` ou
  // `environments`, qu'aucun outil ne signale.
  const { defauts } = inspecter();

  assert.deepEqual(defauts, [], defauts.join('\n'));
});

test('chaque position traversée est déclarée, et aucune ne manque', () => {
  // Deuxième fermeture, sur les **positions** et non sur les clefs : une section
  // ajoutée à `eas.json` doit être déclarée dans le vocabulaire avant que le
  // contrôle ne dise quoi que ce soit d'elle.
  const { positions } = inspecter();
  const vues = [...positions].sort();

  const nonDeclarees = vues.filter((position) => !POSITIONS_ATTENDUES.includes(position));
  const nonAtteintes = POSITIONS_ATTENDUES.filter((position) => !vues.includes(position));

  assert.deepEqual(
    nonDeclarees,
    [],
    `position traversée mais non déclarée : ${nonDeclarees.join(', ')} — le vocabulaire ne dit ` +
      'pas ce qui y est permis, donc rien n’y est vérifié',
  );
  assert.deepEqual(
    nonAtteintes,
    [],
    `position déclarée mais jamais atteinte : ${nonAtteintes.join(', ')} — la liste a vieilli, ` +
      'et une entrée morte fait croire à une couverture qui n’existe plus',
  );
});

test('le vocabulaire est celui du schéma, et il dit d’où il vient', () => {
  // Le vocabulaire est recopié d'une source **distante** : il peut vieillir sans
  // que rien ne le signale. L'assertion porte donc sur ce qui rend la recopie
  // vérifiable — la source et la date — et sur le fait que les positions les
  // plus exposées sont bien renseignées.
  assert.match(SOURCE_DU_VOCABULAIRE, /^https:\/\/raw\.githubusercontent\.com\//);
  assert.ok(
    SOURCE_DU_VOCABULAIRE.includes('eas-cli'),
    'la source ne désigne pas `expo/eas-cli` : `expo/expo` ne l’héberge plus, ' +
      'l’adresse y répondait 404 le 2026-09-18',
  );
  assert.match(
    RELEVE,
    /^\d{4}-\d{2}-\d{2} \/ @expo\/eas-json \d+\.\d+\.\d+$/,
    `relevé : ${RELEVE}`,
  );

  const profil = VOCABULAIRE.build['<profil>'];
  for (const cle of ['extends', 'distribution', 'channel', 'environment', 'android', 'env']) {
    assert.ok(
      Object.hasOwn(profil, cle),
      `« ${cle} » manque au vocabulaire du profil : les clefs de ` +
        '`eas.json` seraient alors refusées à tort, et le contrôle deviendrait un obstacle',
    );
  }
});

test('`$schema` désigne une adresse vivante, pas celle d’un fichier déplacé', () => {
  // L'adresse déclarée décide de l'autocomplétion et de la validation dans
  // l'éditeur. Elle pointait vers `expo/expo`, où le schéma n'est plus.
  const { $schema } = JSON.parse(lire('eas.json'));

  assert.equal(
    $schema,
    SOURCE_DU_VOCABULAIRE,
    'l’adresse de `$schema` et celle du vocabulaire recopié doivent être la même : ' +
      'sinon l’éditeur valide contre un schéma, et ce fichier contre un autre',
  );
});
