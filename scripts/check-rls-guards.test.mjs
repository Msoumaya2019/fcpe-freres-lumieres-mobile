/**
 * Quatre familles d'invariants structurels sur le schéma et ses politiques.
 *
 *  1. **Une colonne sous verrou est gardée sur les deux chemins d'écriture**,
 *     l'insertion comprise — un déclencheur `before update` ne voit pas les
 *     lignes qui naissent avec la valeur interdite.
 *  2. **Chaque table déclarée est réellement protégée** — RLS activée, au moins
 *     une politique, privilèges retirés à `anon`. Une table sans RLS est lisible
 *     et modifiable par tout porteur de la clé publique, extractible d'un APK ;
 *     aucun autre outil de la chaîne ne le signale.
 *  3. **Ce qui survit à la fermeture d'un compte est exactement ce que
 *     `SECURITY.md` documente.** La cascade est le mécanisme d'effacement RGPD
 *     du projet, et seules les tables de contenu collectif y échappent —
 *     nommément, avec leur raison.
 *  4. **Chaque requête de `src/services/` est autorisée par une politique, et
 *     aucune politique n'ouvre ce que le code n'exerce pas.** Les familles 1 à 3
 *     regardent le schéma ; celle-ci le confronte au code. Elle confronte aussi
 *     le **guide** au code, pour la seule politique qui ne peut pas vivre dans
 *     les migrations : celle du compartiment `documents`.
 *
 * POURQUOI CE SCRIPT
 * ------------------
 * Deux déclencheurs de ce schéma refusent une valeur non autorisée :
 * `prevent_role_change` (le rôle d'un membre) et
 * `prevent_status_change_by_member` (le statut d'un signalement). Tous deux sont
 * déclarés **`before update`**. Or une ligne peut aussi naître avec la valeur
 * interdite : `profiles.role` valant `'admin'`, ou `signalements.status` valant
 * `'traite'`.
 *
 * Le cas de `profiles` était couvert, par sa politique d'insertion qui fige le
 * rôle à « membre ». Celui de `signalements` ne l'était pas : sa politique
 * d'insertion ne contraignait que `author_id`, si bien qu'un client modifié
 * créait un signalement déjà « traité » que le bureau ne voyait jamais passer.
 *
 * C'est exactement le genre de trou qu'aucun autre outil ne signale :
 * `npm run sql:check` valide la **syntaxe**, pas la couverture des politiques, et
 * aucune base réelle n'existe pour l'éprouver. Le défaut a été trouvé par lecture
 * croisée — déclencheur d'un côté, politique d'insertion de l'autre — et ce
 * script fixe la lecture pour qu'une table ajoutée plus tard ne la refasse pas.
 *
 * L'INVARIANT DE LA PREMIÈRE FAMILLE, énoncé une fois
 * ---------------------------------------------------
 * **Si un déclencheur `before update` protège une colonne, la politique
 * d'insertion de la même table doit contraindre cette colonne.**
 *
 * Une table sans politique d'insertion est un cas **distinct**, et accepté :
 * l'insertion y est refusée en bloc, donc aucune ligne ne peut naître avec la
 * valeur interdite, et le verrou de modification est sans objet.
 *
 * Les familles 2 et 3 sont venues après, chacune avec sa raison, énoncée là où
 * elle vit : la protection réelle de chaque table, et l'accord entre les règles
 * d'effacement et la promesse RGPD du document de sécurité. Ce préambule garde la
 * genèse de la première — c'est elle qui a montré qu'aucun autre outil ne voit ce
 * genre de trou.
 *
 * Les commentaires SQL sont retirés avant analyse. Ils parlent abondamment de
 * `status`, de `role` et de « traité » — les laisser en place ferait passer le
 * test sur sa propre documentation.
 */

import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const MIGRATIONS = fileURLToPath(new URL('../supabase/migrations', import.meta.url));

/**
 * Le SQL de **toutes** les migrations, dans l'ordre des noms, sans commentaires.
 *
 * POURQUOI TOUTES, ET NON LA PREMIÈRE
 * -----------------------------------
 * Ce banc lisait un seul fichier, désigné par son nom. Tant qu'il n'y en avait
 * qu'un, la différence ne se voyait pas ; à la deuxième migration, il a continué
 * d'affirmer « six tables » sans que rien ne tombe, et il a réclamé une politique
 * RLS pour des tables qu'il n'avait jamais lues. Le défaut est le même que dans
 * `check-input-limits` et `check-schema-types`, corrigés le même jour : **un
 * contrôle qui lit un fichier par son nom mesure ce fichier-là, pas la propriété
 * qu'il annonce.**
 */
function lireMigration() {
  return readdirSync(MIGRATIONS)
    .filter((nom) => nom.endsWith('.sql'))
    .sort()
    .map((nom) => readFileSync(join(MIGRATIONS, nom), 'utf8').replace(/^[^\S\n]*--.*$/gm, ''))
    .join('\n');
}

/**
 * Colonnes sous verrou : fonction `prevent_*` → colonne qu'elle refuse de voir
 * changer. La colonne se lit dans le corps, sur la comparaison
 * `new.<col> is distinct from old.<col>`.
 */
function colonnesGardees(sql) {
  const gardees = new Map();
  const fonctions =
    /create or replace function public\.(prevent_\w+)\(\)([\s\S]*?)as \$\$([\s\S]*?)\$\$;/g;

  for (const [, nom, , corps] of sql.matchAll(fonctions)) {
    const comparaison = corps.match(/new\.(\w+)\s+is distinct from\s+old\.(\w+)/);
    assert.notEqual(
      comparaison,
      null,
      `le corps de ${nom} ne compare pas ancienne et nouvelle valeur`,
    );
    assert.equal(
      comparaison[1],
      comparaison[2],
      `${nom} compare deux colonnes différentes : le verrou ne porterait sur rien`,
    );
    gardees.set(nom, comparaison[1]);
  }

  return gardees;
}

/** Table surveillée par chaque verrou : fonction → table. */
function tablesGardees(sql) {
  const tables = new Map();
  const declencheurs =
    /create trigger \w+\s+before update on public\.(\w+)\s+for each row execute function public\.(prevent_\w+)\(\)/g;

  for (const [, table, fonction] of sql.matchAll(declencheurs)) {
    tables.set(fonction, table);
  }

  return tables;
}

/**
 * Le contenu d'une parenthèse, parenthèses comptées.
 *
 * POURQUOI ON COMPTE, ET CE QUE CELA A CORRIGÉ
 * --------------------------------------------
 * La condition d'insertion des votes de sondage contient un
 * `exists (select 1 from public.sondages …)`, donc des parenthèses imbriquées. Un
 * `[\s\S]*?\);` non gourmand s'arrête à la **première** `);` rencontrée — celle
 * du sous-select — et rend une condition **tronquée**. Aucun test ne lisait ce
 * corps, donc rien ne le signalait : l'extraction répondait, avec l'assurance
 * d'une réponse juste, un texte coupé au milieu.
 *
 * C'est la troisième fois dans ce projet qu'une propriété **structurelle** est
 * lue par un filtre textuel. Une structure se lit en comptant, jamais en
 * découpant.
 */
function corpsParenthese(source, indexOuvrante) {
  let profondeur = 0;

  for (let i = indexOuvrante; i < source.length; i += 1) {
    if (source[i] === '(') {
      profondeur += 1;
    } else if (source[i] === ')') {
      profondeur -= 1;

      if (profondeur === 0) {
        return source.slice(indexOuvrante + 1, i);
      }
    }
  }

  return null;
}

/** Condition d'insertion de chaque table : table → texte du `with check`. */
function conditionsDInsertion(sql) {
  const conditions = new Map();
  const politiques =
    /create policy \w+\s+on public\.(\w+) for insert\s+to authenticated\s+with check \(/g;

  for (const politique of sql.matchAll(politiques)) {
    const corps = corpsParenthese(sql, politique.index + politique[0].length - 1);

    if (corps !== null) {
      conditions.set(politique[1], corps);
    }
  }

  return conditions;
}

const SQL = lireMigration();
const GARDEES = colonnesGardees(SQL);
const TABLES = tablesGardees(SQL);
const INSERTIONS = conditionsDInsertion(SQL);

test('les deux verrous du schéma sont reconnus', () => {
  // Contrôle indispensable : une analyse qui ne trouve rien passerait pour verte,
  // et l'invariant serait vérifié sur zéro cas.
  assert.deepEqual([...GARDEES.keys()].sort(), [
    'prevent_role_change',
    'prevent_status_change_by_member',
  ]);
  assert.equal(GARDEES.get('prevent_role_change'), 'role');
  assert.equal(GARDEES.get('prevent_status_change_by_member'), 'status');
});

test('chaque verrou est reconnu sur sa table', () => {
  assert.deepEqual([...TABLES.entries()].sort(), [
    ['prevent_role_change', 'profiles'],
    ['prevent_status_change_by_member', 'signalements'],
  ]);
});

test("une colonne sous verrou est contrainte aussi à l'insertion", () => {
  for (const [fonction, colonne] of GARDEES) {
    const table = TABLES.get(fonction);
    assert.notEqual(table, undefined, `aucun déclencheur ne porte « ${fonction} »`);

    const condition = INSERTIONS.get(table);
    if (condition === undefined) {
      // Cas distinct, et accepté : sans politique d'insertion, aucune ligne ne
      // peut être insérée du tout, donc le verrou de modification est sans objet.
      continue;
    }

    assert.match(
      condition,
      new RegExp(`\\b${colonne}\\b\\s*(=|<>|!=|is distinct from)`),
      `« ${table}.${colonne} » est gardé à la modification, mais « ${table} » peut être ` +
        `inséré avec n'importe quelle valeur : la condition d'insertion doit contraindre ` +
        `${colonne}, comme le fait celle de profiles pour role`,
    );
  }
});

test('un signalement ne peut pas naître déjà « traité »', () => {
  // Le cas mesuré, nommé pour que la raison du test survive à sa réécriture :
  // sans cette condition, un client modifié crée un signalement que le bureau,
  // qui filtre sur les nouveaux, ne voit jamais passer.
  const condition = INSERTIONS.get('signalements');

  assert.notEqual(condition, undefined, 'signalements doit avoir une politique d’insertion');
  assert.match(condition, /status\s*=\s*'nouveau'/);
});

test('la condition d’insertion des signalements laisse le bureau décider du statut', () => {
  // Contrôle symétrique, et non redondant : il isole la branche du bureau. Le
  // retirer seul ne fait tomber que ce test — c'est ce qui le distingue du
  // précédent, qui porte sur la contrainte de statut elle-même.
  assert.match(INSERTIONS.get('signalements'), /public\.is_admin\(\)/);
});

test('aucune politique d’insertion n’est perdue à la lecture', () => {
  // Douze tables ont une politique d'insertion **réservée aux porteurs d'un
  // jeton**, et elles se partagent en deux familles égales. Six sont insérables
  // par un **membre** — `profiles`, `cantine_reservations`, `signalements`,
  // `discussion_messages`, `sondage_votes`, `messages` — et six par le **bureau**
  // — `annonces`, `cantine_menus`, `agenda_events`, `documents`, `sondages`,
  // `sondage_choices`. L'analyse doit donc en trouver douze : sinon une
  // expression régulière trop stricte aurait laissé passer une table, et
  // l'invariant avec elle.
  assert.deepEqual([...INSERTIONS.keys()].sort(), [
    'agenda_events',
    'annonces',
    'cantine_menus',
    'cantine_reservations',
    'discussion_messages',
    'documents',
    'messages',
    'profiles',
    'signalements',
    'sondage_choices',
    'sondage_votes',
    'sondages',
  ]);
});

/**
 * Les politiques d'insertion que le motif de `conditionsDInsertion` **ne
 * sélectionne pas**.
 *
 * Le motif exige `to authenticated` seul. Une politique ouverte **aussi** au rôle
 * anonyme ne le satisfait donc pas, et n'entre pas dans la liste close
 * ci-dessus — qui, lue seule, affirmait pourtant une exhaustivité. La troisième
 * migration en ajoute deux, et elles n'y figurent pas : c'est un choix, et le
 * taire aurait été le défaut que ce fichier traque ailleurs.
 *
 * Le choix tient : ces deux politiques ne portent aucune comparaison à lire
 * (`with check (true)`, ou une condition de vote), et `check-acces-public` les
 * **exerce** au lieu de les analyser — il joue le rôle anonyme, et mesure
 * l'acceptation comme le refus.
 *
 * Les nommer est ce qui empêche la liste close de mentir le jour où une
 * troisième politique de cette forme apparaîtrait sans être éprouvée.
 */
const INSERTIONS_HORS_MOTIF = ['push_tokens_insert_device', 'sondage_votes_insert_public'];

/** Toute politique d'insertion du schéma, avec le rôle qu'elle vise. */
function politiquesDInsertion(sql) {
  return [
    ...sql.matchAll(
      /create policy (\w+)\s+on public\.(\w+) for insert\s+to ([^;]*?)with check \(/g,
    ),
  ].map(([, nom, table, roles]) => ({ nom, table, roles: roles.trim().replace(/\s+/g, ' ') }));
}

test('les politiques d’insertion hors motif sont nommées, et aucune autre', () => {
  // Contrôle du contrôle, et il porte sur ce que le test précédent ne peut pas
  // voir par construction : le motif qu'il emploie. Sans lui, une politique
  // d'insertion ouverte au rôle anonyme pourrait être ajoutée sans que rien ne
  // le dise — et la liste close des douze continuerait d'affirmer le contraire.
  const toutes = politiquesDInsertion(SQL);
  const horsMotif = toutes.filter(({ roles }) => roles !== 'authenticated');

  assert.deepEqual(
    horsMotif.map(({ nom }) => nom).sort(),
    [...INSERTIONS_HORS_MOTIF].sort(),
    'ces politiques d’insertion ne visent pas `authenticated` seul, donc la liste ' +
      'close des douze ne les voit pas : les déclarer ici, avec la raison, ou ' +
      'mesurer leur comportement dans `check-acces-public`',
  );

  // Et la liste ne décrit pas des politiques disparues : une exception qui
  // survit à ce qu'elle décrit est une justification périmée.
  assert.deepEqual(
    INSERTIONS_HORS_MOTIF.filter((nom) => !toutes.some((politique) => politique.nom === nom)),
    [],
    '`INSERTIONS_HORS_MOTIF` nomme une politique qui n’existe plus',
  );

  // Mesure de la prémisse : le motif sélectionne bien les douze **tables** de la
  // liste close, et rien de plus. Les tables, et non les politiques : le texte
  // porte quinze `create policy … for insert`, et deux d'entre elles sont
  // remplacées plus loin par une politique du même rôle — `discussion_messages`
  // passe de `_insert_own` à `_insert_member`, et `INSERTIONS` ne garde que la
  // dernière, comme le fait PostgreSQL.
  const vues = toutes.filter(({ roles }) => roles === 'authenticated');
  assert.equal(
    new Set(vues.map(({ table }) => table)).size,
    INSERTIONS.size,
    'le motif et la liste close ne portent pas sur le même ensemble de tables',
  );

  // Ce que ce fichier ne peut pas dire, et qui est dit ailleurs : `messages`
  // figure dans la liste close alors que la troisième migration **retire** sa
  // politique d'insertion. Le texte porte encore le `create policy`, et c'est la
  // lecture seule qui a cette limite — `check-acces-public` la lève en jouant le
  // rôle : un membre qui écrit dans `messages` y est refusé.
});

// --- Seconde famille : chaque table déclarée est-elle réellement protégée ? ---
//
// Une politique n'est lue que si RLS est activée sur la table. Les deux
// déclarations vivent dans des sections différentes du fichier — les tables en
// section 3, les activations en section 6 — et c'est exactement pourquoi il faut
// les croiser : rien ne relie l'une à l'autre à la lecture.

/** Position d'un motif unique, avec ses deux garde-fous. */
function position(ou, motif, origine) {
  const index = ou.indexOf(motif);
  assert.notEqual(index, -1, `${origine} : motif absent — ${motif}`);
  assert.equal(
    ou.indexOf(motif, index + 1),
    -1,
    `${origine} : motif présent plusieurs fois, la comparaison d'ordre serait trompeuse — ${motif}`,
  );
  return index;
}

function tablesDeclarees(sql) {
  return [...sql.matchAll(/create table (?:if not exists )?public\.(\w+)/g)].map(
    ([, table]) => table,
  );
}

function tablesSousRls(sql) {
  return [...sql.matchAll(/alter table public\.(\w+)\s+enable row level security;/g)].map(
    ([, table]) => table,
  );
}

/**
 * Tables dont le rôle anonyme est privé **par un `revoke`**.
 *
 * La première version exigeait `from anon;` — un rôle unique. La troisième
 * migration écrit `from anon, authenticated;`, et le motif ne l'aurait pas vue :
 * les deux tables de conversation auraient été comptées comme ouvertes. Le rôle
 * est donc cherché **dans la liste** plutôt que dans une forme figée.
 */
function tablesRevoqueesAnon(sql) {
  return [...sql.matchAll(/revoke all on public\.(\w+)\s+from ([^;]+);/g)]
    .filter(([, , roles]) => roles.split(',').some((role) => role.trim() === 'anon'))
    .map(([, table]) => table);
}

/**
 * Tables auxquelles le rôle anonyme a un privilège, quelle qu'en soit la
 * nature. C'est la **surface publiée**, et elle doit tenir dans une liste close :
 * c'est la seule formulation qui reste vraie quand une table cesse d'être
 * publique, ou le devient.
 *
 * `grant execute on function public.is_member()` ne compte pas : le motif exige
 * `on public.<table>`, là où la fonction écrit `on function public.<nom>`.
 */
function tablesOuvertesAnon(sql) {
  return [
    ...new Set(
      [...sql.matchAll(/grant [\w, ]+ on public\.(\w+)\s+to ([^;]+);/g)]
        .filter(([, , roles]) => roles.split(',').some((role) => role.trim() === 'anon'))
        .map(([, table]) => table),
    ),
  ];
}

function tablesAvecPolitique(sql) {
  return [...new Set([...sql.matchAll(/create policy \w+\s+on public\.(\w+)/g)].map(([, t]) => t))];
}

const DECLAREES = tablesDeclarees(SQL);
const SOUS_RLS = tablesSousRls(SQL);
const REVOQUEES_ANON = tablesRevoqueesAnon(SQL);
const OUVERTES_ANON = tablesOuvertesAnon(SQL);
const AVEC_POLITIQUE = tablesAvecPolitique(SQL);

/**
 * La surface publiée : les tables que le rôle anonyme atteint, et **pourquoi**.
 *
 * Jusqu'à la troisième migration, l'invariant tenait en une phrase — « aucune
 * table n'est ouverte à `anon` » — et la phrase était vraie. Elle a cessé de
 * l'être le jour où l'application a ouvert la consultation aux familles sans
 * compte : huit tables sont désormais atteignables par la clé publique.
 *
 * La remplacer par « aucune » aurait été faux ; la supprimer aurait laissé
 * `anon` s'étendre sans que rien ne le dise. La règle se dit donc en deux
 * temps : **toute table atteignable par `anon` est inscrite ici, et aucune
 * autre ne l'est.** Une table publiée par mégarde tombe, et une table publiée
 * volontairement demande qu'on écrive sa raison.
 */
const SURFACE_PUBLIQUE = new Map([
  [
    'annonces',
    'les actualités de l’école, publiées par le bureau pour être lues ; la ' +
      'politique `annonces_select_public` les ouvre en lecture seule',
  ],
  [
    'cantine_menus',
    'les menus de la semaine, affichés par `cantine_menus_select_public` — c’est ' +
      'la première chose qu’un parent vient chercher',
  ],
  ['agenda_events', 'les dates de l’agenda scolaire, ouvertes par `agenda_events_select_public`'],
  [
    'sondages',
    'la question d’un sondage, posée à toutes les familles par `sondages_select_public`',
  ],
  [
    'sondage_choices',
    'les réponses proposées par `sondage_choices_select_public` : sans elles, la ' +
      'question serait illisible',
  ],
  [
    'documents',
    "la politique `documents_select_public` filtre sur `visibility = 'familles'` : " +
      'les pièces du bureau restent hors de portée, y compris si leur adresse est connue',
  ],
  [
    'sondage_votes',
    'insertion **seule** : un appareil dépose son vote, personne ne lit les votes ' +
      'par cette voie — le dépouillement passe par `resultats_sondage()`',
  ],
  [
    'push_tokens',
    'un appareil sans compte enregistre son jeton ; la lecture, elle, est réservée ' +
      'au bureau par `push_tokens_select_admin`',
  ],
]);

/**
 * Tables délibérément sans aucune politique.
 *
 * Une table sous RLS sans politique n'est pas ouverte : elle est **fermée à tout
 * le monde**, application comprise. C'est exactement ce qu'on veut des deux
 * tables de conversation — seul le code qui compare le secret doit les
 * atteindre, et il passe par des fonctions `security definer`.
 *
 * L'exception est donc nommée, et elle est vérifiée dans les deux sens : une
 * table inscrite ici qui gagnerait une politique ferait tomber le test, sans
 * quoi la liste deviendrait un commentaire.
 */
const SANS_POLITIQUE = new Map([
  [
    'conversations',
    'aucun rôle ne doit lire un fil directement : la seule clé d’accès est le ' +
      'secret, comparé dans `lire_conversation()`. Une politique « lecture par le ' +
      'bureau » aurait ouvert la table à toute requête portant un jeton',
  ],
  [
    'conversation_messages',
    'même raison que `conversations` : les messages d’un fil ne se lisent qu’à ' +
      'travers la fonction qui a comparé le secret, jamais par un `select` direct',
  ],
]);

/**
 * Les trois endroits qui documentent la promotion du premier administrateur.
 * Trois copies d'une même commande : c'est ce qui justifie de les vérifier
 * ensemble plutôt qu'une seule.
 */
const PROMOTION = [
  'supabase/migrations/20260916120000_init.sql',
  'supabase/README.md',
  'README.md',
];

test('les migrations déclarent les quinze tables attendues', () => {
  // Contrôle : sans lui, une analyse qui ne lirait rien ferait passer les trois
  // invariants suivants sur zéro table. La liste est **close** : une table
  // ajoutée sans être déclarée ici fait tomber le test, et l'ajouter est une
  // décision — elle doit venir avec ses politiques, sa fermeture à `anon` et sa
  // place dans SECURITY.md.
  assert.deepEqual(DECLAREES, [
    'profiles',
    'annonces',
    'cantine_menus',
    'cantine_reservations',
    'signalements',
    'discussion_messages',
    'agenda_events',
    'documents',
    'sondages',
    'sondage_choices',
    'sondage_votes',
    'messages',
    'conversations',
    'conversation_messages',
    'push_tokens',
  ]);
});

test('chaque table déclarée a RLS activée', () => {
  // Sans `enable row level security`, les politiques existent mais ne sont jamais
  // consultées : la table est lisible et modifiable par tout porteur de la clé
  // publique. C'est le défaut le plus coûteux d'un projet Supabase, et le seul
  // que la lecture ligne à ligne du fichier ne rattrape pas.
  assert.deepEqual(
    DECLAREES.filter((table) => !SOUS_RLS.includes(table)),
    [],
    'une table sans RLS est ouverte à tout porteur de la clé publique',
  );
  assert.deepEqual([...SOUS_RLS].sort(), [...DECLAREES].sort());
});

test('chaque table déclarée a au moins une politique, ou dit pourquoi elle n’en a pas', () => {
  // RLS activée sans aucune politique ne ferme pas la table : elle la rend
  // inaccessible à tout le monde, application comprise, et l'écran reste vide
  // sans message d'erreur. C'est le défaut ordinaire — mais il est parfois
  // **voulu**, et les deux tables de conversation en vivent : leur seul accès
  // passe par une fonction qui a comparé un secret. La règle tolère donc
  // l'absence, à condition qu'elle soit **nommée et motivée**.
  assert.deepEqual(
    DECLAREES.filter((table) => !AVEC_POLITIQUE.includes(table) && !SANS_POLITIQUE.has(table)),
    [],
    'une table sous RLS sans politique est inaccessible, application comprise : ' +
      'soit lui en donner une, soit l’inscrire dans SANS_POLITIQUE avec sa raison',
  );

  // Et l'exception doit être vraie : une table inscrite là qui gagnerait une
  // politique ne serait plus une exception, et la liste deviendrait un
  // commentaire que personne ne relit.
  for (const table of SANS_POLITIQUE.keys()) {
    assert.ok(DECLAREES.includes(table), `SANS_POLITIQUE nomme « ${table} », qui n’existe pas`);
    assert.ok(
      !AVEC_POLITIQUE.includes(table),
      `« ${table} » est inscrite dans SANS_POLITIQUE et porte pourtant une politique : ` +
        'l’exception n’est plus vraie, il faut la retirer',
    );
  }
});

test('le rôle anonyme n’atteint que la surface publiée, et rien de plus', () => {
  // L'invariant tenait, jusqu'à la troisième migration, en un mot : « aucune ».
  // Il ne peut plus s'écrire ainsi, mais il ne peut pas non plus disparaître —
  // c'est lui qui empêche `anon` de s'étendre sans qu'on s'en aperçoive. Il se
  // dit donc en deux temps, et les deux moitiés sont nécessaires :
  //
  //   1. toute table atteignable par `anon` figure dans SURFACE_PUBLIQUE ;
  //   2. toute table qui n'y figure pas lui est **refusée par un `revoke`**.
  //
  // La seconde moitié est ce qui distingue « pas encore publiée » de « publiée
  // par mégarde » : sans elle, une table dont on aurait simplement oublié le
  // `revoke` passerait, puisque `anon` n'a de toute façon aucun privilège par
  // défaut en base locale — mais en a un sur un vrai projet Supabase, dont les
  // privilèges par défaut du schéma `public` sont plus larges.
  assert.deepEqual(
    [...OUVERTES_ANON].sort(),
    [...SURFACE_PUBLIQUE.keys()].sort(),
    'une table atteignable par la clé publique sans être déclarée ici est une ' +
      'publication qu’on n’a pas décidée ; une table déclarée ici et non accordée ' +
      'rendrait la déclaration fausse',
  );

  assert.deepEqual(
    DECLAREES.filter((table) => !SURFACE_PUBLIQUE.has(table) && !REVOQUEES_ANON.includes(table)),
    [],
    'une table hors de la surface publiée doit être explicitement retirée au rôle ' +
      'anonyme : `revoke all on public.<table> from anon`',
  );
});

// --- La promotion du premier administrateur subit le verrou qu'elle pose ---

test('la promotion du premier administrateur désactive le verrou qu’elle subit', () => {
  // `prevent_role_change` refuse toute modification de `role` à qui n'est pas
  // déjà administrateur, et `is_admin()` lit `auth.uid()` — qui vaut NULL hors
  // d'une requête authentifiée. La commande documentée échouait donc dans
  // l'éditeur SQL, sur la toute première étape de la mise en service, avec un
  // message qui dit exactement l'inverse de ce qu'on cherche à faire.
  //
  // Elle est écrite à trois endroits. Les trois doivent porter la parenthèse, et
  // dans l'ordre : désactiver, modifier, réactiver — un ordre inversé, ou une
  // réactivation oubliée, laisserait le verrou ouvert sans que rien ne le dise.
  for (const chemin of PROMOTION) {
    const source = readFileSync(fileURLToPath(new URL(`../${chemin}`, import.meta.url)), 'utf8');

    const desactivation = position(source, 'disable trigger profiles_prevent_role_change', chemin);
    const modification = position(source, 'update public.profiles', chemin);
    const reactivation = position(source, 'enable trigger profiles_prevent_role_change', chemin);

    assert.ok(
      desactivation < modification && modification < reactivation,
      `${chemin} : l'ordre doit être désactiver, modifier, réactiver`,
    );
  }
});

test('la promotion est documentée partout où elle est écrite', () => {
  // Contrôle de couverture : si un quatrième document reprenait la commande, ce
  // test ne le verrait pas — mais si l'un des trois disparaissait, la boucle
  // ci-dessus vérifierait un fichier de moins sans le dire.
  assert.equal(PROMOTION.length, 3);

  for (const chemin of PROMOTION) {
    const source = readFileSync(fileURLToPath(new URL(`../${chemin}`, import.meta.url)), 'utf8');
    assert.match(source, /prevent_role_change/, `${chemin} doit nommer le verrou en cause`);
  }
});

// --- Troisième famille : ce qui survit à la fermeture d'un compte -----------
//
// `SECURITY.md` fait de l'effacement en cascade le **mécanisme RGPD** du projet :
// « supprimer un compte efface en cascade le profil, les réservations, les
// signalements et les messages ». C'est une promesse faite aux adhérents, et la
// cascade est ce qui la tient. Les deux vivent dans des fichiers différents, donc
// rien ne les relie à la lecture — d'où ce croisement.
//
// LA RACINE EST LE COMPTE, PAS LE PROFIL
// -------------------------------------
// La première version de cette famille cherchait les clés étrangères pointant
// vers `public.profiles`, et elle exigeait le préfixe `public.`. Les deux
// hypothèses étaient vraies de la migration initiale, et fausses de la seconde :
// `messages`, `sondage_votes`, `agenda_events`, `documents` et `sondages`
// écrivent `references auth.users (id)` — sans préfixe, et vers la table des
// comptes plutôt que vers le profil. **Les cinq colonnes étaient donc invisibles
// au contrôle**, qui continuait d'affirmer que la prose et le schéma s'accordent
// sur une liste à laquelle il manquait deux tables effacées.
//
// L'analyse part donc de `auth.users` et suit les arêtes `cascade` jusqu'à
// fermeture. Une jointure d'un seul saut ne suffirait pas : `cantine_reservations`
// n'atteint le compte qu'**à travers** `profiles`. Et c'est la seule formulation
// qui reste juste si une table se rattache un jour à une autre table effacée.
//
// Quatre tables échappent à la règle, et c'est délibéré : `annonces`,
// `agenda_events`, `documents` et `sondages` suivent `on delete set null`. Ce
// sont les quatre tables de **contenu collectif** — une annonce, une date, un
// document, une question posée à tous. Elles restent utiles après le départ de
// leur auteur, et les effacer retirerait de l'information collective au motif
// qu'un compte a été fermé. La règle se dit donc en une phrase : **ce qui est
// adressé à tout le monde survit à son auteur ; ce qui est adressé par une
// personne, ou privé, est effacé.**
//
// Le piège que ce croisement surveille est asymétrique, et c'est pour cela qu'il
// faut le nommer : `src/services/discussion.ts` porte un libellé de repli pour un
// message « sans auteur ». Ce cas n'existe pas — mais il existerait si quelqu'un
// passait `discussion_messages.author_id` à `set null` « pour correspondre au
// code ». Le commentaire a été corrigé ; ce test empêche la correction inverse.

/** Découpage par blocs `create table`, en-tête et corps séparés. */
function blocsDeTable(sql) {
  return [
    ...sql.matchAll(/create table (?:if not exists )?public\.(\w+)\s*\(([\s\S]*?)\n\);/g),
  ].map(([, table, corps]) => ({ table, corps }));
}

/**
 * Toutes les clés étrangères du schéma : qui, sur quelle colonne, vers quelle
 * table, avec quelle obligation et quelle règle d'effacement.
 *
 * Deux détails du motif sont des corrections, pas des commodités. Le préfixe de
 * schéma est **facultatif** — la seconde migration écrit `references auth.users`
 * là où la première écrit `references public.profiles`, et l'exiger rendait cinq
 * colonnes invisibles. Et les qualificatifs entre `uuid` et `references` sont
 * admis, sans quoi `id uuid primary key references …` — la clé de `profiles` —
 * échappait aussi. La cible garde son schéma : `auth.users` et un hypothétique
 * `public.users` ne sont pas la même table.
 */
function clesEtrangeres(sql) {
  const cle =
    /(\w+)\s+uuid\s+((?:not null\s+|primary key\s+)*)references\s+(?:(public|auth)\.)?(\w+)\s*\(\w+\)\s+on delete (cascade|set null|restrict|no action)/g;
  const cles = [];

  for (const { table, corps } of blocsDeTable(sql)) {
    for (const [, colonne, qualificatifs, schema, nom, regle] of corps.matchAll(cle)) {
      cles.push({
        table,
        colonne,
        cible: schema === 'auth' ? `auth.${nom}` : nom,
        obligatoire: qualificatifs.includes('not null') || qualificatifs.includes('primary key'),
        regle,
      });
    }
  }

  return cles;
}

/**
 * Fermeture transitive des arêtes `cascade` à partir d'une table : tout ce qui
 * disparaît avec elle, la racine exceptée.
 */
function effaceesParCascade(cles, racine) {
  const effacees = new Set([racine]);
  let progression = true;

  while (progression) {
    progression = false;

    for (const { table, cible, regle } of cles) {
      if (regle === 'cascade' && effacees.has(cible) && !effacees.has(table)) {
        effacees.add(table);
        progression = true;
      }
    }
  }

  effacees.delete(racine);

  return [...effacees].sort();
}

const BLOCS = blocsDeTable(SQL);
const CLES = clesEtrangeres(SQL);

/** La table des comptes : supprimer un compte est l'événement que la prose décrit. */
const RACINE_DU_COMPTE = 'auth.users';

/** Colonnes rattachées au compte, directement ou par le profil. */
const VERS_LE_COMPTE = CLES.filter(
  ({ cible }) => cible === RACINE_DU_COMPTE || cible === 'profiles',
);

const EFFACEES = effaceesParCascade(CLES, RACINE_DU_COMPTE);

/**
 * Formules par lesquelles `SECURITY.md` désigne les tables effacées. La table
 * est nommée pour que le lecteur sache de quoi la prose parle ; c'est cette
 * correspondance qui est vérifiée plus bas.
 */
const EFFACEMENT_DOCUMENTE = new Map([
  ['profiles', 'le profil'],
  ['cantine_reservations', 'les réservations'],
  ['signalements', 'les signalements'],
  ['discussion_messages', 'les messages de discussion'],
  ['messages', 'les messages adressés à l’association'],
  ['sondage_votes', 'les votes'],
]);

test('le découpage par blocs voit les quinze tables déclarées', () => {
  // Contrôle du contrôle, et non redondance : `tablesDeclarees` lit les en-têtes,
  // ce découpage lit les corps. S'ils divergent, l'analyse des clés étrangères
  // porterait sur un schéma partiel sans que rien ne le dise.
  assert.deepEqual(
    BLOCS.map(({ table }) => table),
    DECLAREES,
  );
});

test('l’analyse voit les quinze clés étrangères du schéma', () => {
  // Contrôle du contrôle, et il porte tout le reste de la famille : la fermeture
  // transitive ne vaut que par les arêtes qu'on lui donne. Une arête perdue
  // rétrécit la liste des tables effacées, et les tests suivants s'accorderaient
  // alors sur une liste incomplète — verts, et faux.
  //
  // La liste est écrite en toutes lettres plutôt que comptée : un décompte
  // laisserait passer une arête perdue compensée par une arête inventée.
  assert.deepEqual(
    CLES.map(
      ({ table, colonne, cible, regle }) => `${table}.${colonne} → ${cible} ${regle}`,
    ).sort(),
    [
      'agenda_events.author_id → auth.users set null',
      'annonces.author_id → profiles set null',
      'cantine_reservations.menu_id → cantine_menus cascade',
      'cantine_reservations.user_id → profiles cascade',
      'conversation_messages.conversation_id → conversations cascade',
      'discussion_messages.author_id → profiles cascade',
      'documents.author_id → auth.users set null',
      'messages.author_id → auth.users cascade',
      'profiles.id → auth.users cascade',
      'signalements.author_id → profiles cascade',
      'sondage_choices.sondage_id → sondages cascade',
      'sondage_votes.choice_id → sondage_choices cascade',
      'sondage_votes.sondage_id → sondages cascade',
      'sondage_votes.voter_id → auth.users cascade',
      'sondages.author_id → auth.users set null',
    ],
  );
});

test('les dix colonnes rattachées au compte sont reconnues', () => {
  // La fermeture part de `auth.users`, mais la moitié des colonnes y arrivent
  // par `profiles`. Les deux chemins sont donc réunis ici, et nommés.
  assert.deepEqual(VERS_LE_COMPTE.map(({ table, colonne }) => `${table}.${colonne}`).sort(), [
    'agenda_events.author_id',
    'annonces.author_id',
    'cantine_reservations.user_id',
    'discussion_messages.author_id',
    'documents.author_id',
    'messages.author_id',
    'profiles.id',
    'signalements.author_id',
    'sondage_votes.voter_id',
    'sondages.author_id',
  ]);
});

test('la fermeture d’un compte efface exactement six tables', () => {
  // L'invariant, énoncé une fois : la liste est **calculée** à partir des arêtes
  // `cascade`, puis figée. Ajouter une table rattachée au compte sans toucher à
  // `SECURITY.md` fait donc tomber le test de la prose, pas celui-ci.
  assert.deepEqual(EFFACEES, [
    'cantine_reservations',
    'discussion_messages',
    'messages',
    'profiles',
    'signalements',
    'sondage_votes',
  ]);
});

test('seul le contenu collectif survit à son auteur', () => {
  // L'exception est déduite de la **règle**, jamais du nom de la table. Filtrer
  // sur `annonces` aurait rendu l'assertion incapable de tomber : elle aurait
  // décrit la liste qu'elle venait de construire. Mesuré en passant `annonces` à
  // `cascade` — la version filtrée par nom restait verte.
  //
  // Les quatre survivantes sont les quatre tables de contenu collectif : une
  // annonce, une date du calendrier, un document partagé, une question posée à
  // tous. Elles restent utiles après le départ de leur auteur, et les effacer
  // retirerait de l'information collective au motif qu'un compte a été fermé.
  const survivantes = VERS_LE_COMPTE.filter(({ regle }) => regle === 'set null');

  assert.deepEqual(
    survivantes.map(({ table, colonne, regle }) => `${table}.${colonne} → ${regle}`).sort(),
    [
      'agenda_events.author_id → set null',
      'annonces.author_id → set null',
      'documents.author_id → set null',
      'sondages.author_id → set null',
    ],
    'seul le contenu collectif survit à son auteur. Toute autre colonne passée à ' +
      '`set null` ferait survivre la ligne à la fermeture du compte, et l’effacement ' +
      'décrit dans SECURITY.md cesserait de la couvrir, sans qu’aucun autre outil ne le ' +
      'signale',
  );

  for (const { table, colonne, obligatoire } of survivantes) {
    assert.equal(
      obligatoire,
      false,
      `${table}.${colonne} doit rester nullable : \`not null\` avec \`set null\` rendrait ` +
        'la suppression du compte impossible, la base refusant d’écrire NULL dans la colonne',
    );
  }
});

test('SECURITY.md nomme exactement les tables que la cascade efface', () => {
  // La prose et le schéma se vérifient l'un l'autre : la liste des tables
  // effacées est déduite du schéma, puis exigée dans la phrase. Reformuler la
  // phrase sans changer le schéma fait tomber ce test — c'est voulu, la phrase
  // est une promesse faite aux adhérents, pas un commentaire.
  const securite = readFileSync(fileURLToPath(new URL('../SECURITY.md', import.meta.url)), 'utf8');
  const phrase = /supprimer un\s+compte efface en cascade([^.]*)\./.exec(securite);

  assert.notEqual(phrase, null, "SECURITY.md doit énoncer l'effacement en cascade");
  const liste = phrase[1].replace(/\s+/g, ' ');

  const effacees = [...EFFACEES];
  assert.deepEqual(
    [...EFFACEMENT_DOCUMENTE.keys()].sort(),
    effacees.sort(),
    'chaque table effacée en cascade doit avoir sa formule, et aucune autre',
  );

  for (const [table, formule] of EFFACEMENT_DOCUMENTE) {
    assert.ok(
      liste.includes(formule),
      `la phrase d'effacement doit nommer « ${formule} » (${table}) : sans quoi la table ` +
        `est effacée sans être annoncée`,
    );
  }
});

// --- Quatrième famille : chaque requête de l'application est autorisée ------
//
// Les trois familles précédentes regardent le schéma et ses promesses. Celle-ci
// le confronte au code, et elle existe pour une raison mesurable : **un refus de
// RLS ne produit pas d'erreur, il produit une liste vide.** Une table interrogée
// sans politique ne se signale donc par rien — ni exception, ni message, ni
// écran d'erreur. Seulement un écran « aucune donnée », que personne ne
// distinguera d'une table réellement vide.
//
// C'est le contrôle que `SECURITY.md` décrit en prose — « les dix-neuf appels de
// `src/services/` ont été croisés un par un » — et une prose ne se relit pas
// toute seule. Ici, la phrase est vérifiée à chaque exécution.
//
// La quatrième question, elle, ne se lit nulle part : **une politique qui
// autorise ce que le code n'exerce pas.** Elle a produit le constat de
// `profiles_update_own` — une politique de modification que rien n'utilisait,
// portant sur la seule colonne affichée comme une identité. Le test nomme donc
// une par une les politiques qu'aucun écran n'exerce, pour qu'en ajouter une
// demande de l'écrire.

/** Contenu d'un fichier du dépôt, commentaires retirés. */
function lireFichier(cheminRelatif) {
  return readFileSync(fileURLToPath(new URL(`../${cheminRelatif}`, import.meta.url)), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1');
}

/**
 * Méthode PostgREST → opération SQL.
 *
 * `upsert` n'y figure pas, volontairement : il exigerait **deux** politiques
 * (`insert` et `update`), et le compter pour une seule ferait passer le contrôle
 * à côté. S'il apparaît un jour, le test des méthodes échoue et oblige à
 * trancher plutôt qu'à deviner.
 *
 * `delete` n'y figure plus, et pour la même raison : c'est la table des
 * réservations de cantine qui l'employait, et l'écran ne propose plus de
 * réserver. Le retrait de cette ligne fait tomber le test le jour où un `delete`
 * réapparaîtrait — c'est exactement ce qu'on veut, puisqu'une suppression est la
 * seule opération qui **détruit** une donnée, et qu'elle mérite d'être décidée.
 */
const METHODES = new Map([
  ['select', 'select'],
  ['insert', 'insert'],
  ['update', 'update'],
]);

/**
 * Les seules tables que l'application **modifie**, et la raison de chacune.
 *
 * Jusqu'à l'enregistrement des notifications, cette liste était vide : le code
 * n'écrivait que des lignes nouvelles. Un appareil déjà connu doit pourtant
 * rafraîchir sa date, sinon il serait purgé alors qu'il est toujours installé.
 *
 * La liste est close, et c'est tout son intérêt : ajouter une modification
 * ailleurs demande de l'écrire ici, donc de la décider. Une modification est
 * toujours plus large qu'une insertion — elle peut viser une ligne qu'on n'a pas
 * créée — et c'est ce qui justifie qu'elle ne passe pas inaperçue.
 */
const TABLES_MODIFIEES = new Map([
  [
    'push_tokens',
    'l’appareil rafraîchit `last_seen_at` de la ligne dont il connaît déjà le ' +
      'jeton ; sans quoi une purge par date finirait par retirer un appareil actif',
  ],
]);

/**
 * Requêtes de la couche d'accès aux données, une entrée par appel.
 *
 * Les fichiers sont lus depuis le disque plutôt que listés à la main : un
 * service ajouté plus tard entre dans l'analyse sans qu'on ait à y penser — et
 * c'est ce qu'on veut, puisque c'est la requête non couverte qu'on cherche.
 *
 * POURQUOI STORAGE EST SÉPARÉ DES TABLES
 * --------------------------------------
 * `supabase.from('documents').select(…)` et
 * `supabase.storage.from('documents').createSignedUrl(…)` portent tous deux un
 * `.from('documents')`, et le premier jet de ce banc les confondait : il
 * réclamait une politique RLS pour un **bucket**. Or un bucket ne se protège pas
 * par RLS mais par les politiques de Storage, qui vivent dans le tableau de bord
 * Supabase — aucun test du dépôt ne peut les lire.
 *
 * La différence est structurelle : c'est le `.storage` **devant** le `from`. On
 * le capture dans le motif au lieu de le perdre. Filtrer sur le nom du bucket
 * aurait décrit la liste qu'on venait de construire, et aurait laissé passer le
 * prochain bucket ajouté.
 */
function appelsDeLApplication() {
  const dossier = fileURLToPath(new URL('../src/services', import.meta.url));
  const requetes = [];
  const stockages = [];
  const appel = /(\.storage)?\s*\.from\('(\w+)'\)\s*\.(\w+)\(/g;

  for (const fichier of readdirSync(dossier)
    .filter((nom) => nom.endsWith('.ts'))
    .sort()) {
    for (const [, stockage, cible, methode] of lireFichier(`src/services/${fichier}`).matchAll(
      appel,
    )) {
      if (stockage === undefined) {
        requetes.push({ fichier, table: cible, methode });
      } else {
        stockages.push({ fichier, bucket: cible, methode });
      }
    }
  }

  return { requetes, stockages };
}

/**
 * Politiques écrites : clé « table.operation » → nom, rôle et corps.
 *
 * LES RETRAITS SONT APPLIQUÉS, DANS L'ORDRE DU FICHIER
 * ---------------------------------------------------
 * Une migration peut retirer une politique qu'une précédente avait créée :
 * c'est ainsi que `messages` perd ses deux politiques, et que `sondage_votes`
 * perd la sienne. Sans soustraction, le banc répondrait sur des politiques
 * **qui n'existent plus** — il réclamait une raison pour `messages.select`,
 * retirée par la troisième migration.
 *
 * L'ordre est nécessaire, et pas seulement la liste : plusieurs politiques sont
 * retirées **puis recréées sous le même nom** dans le même fichier
 * (`push_tokens_insert_device`, `sondage_votes_insert_public`). Une liste de
 * retraits lue globalement effacerait la politique vivante. Un `drop` n'enlève
 * donc que ce qui le précède.
 */
function politiquesEcrites(sql) {
  const politiques = new Map();
  const instruction =
    /(create|drop) policy (?:if exists )?(\w+)\s+on public\.(\w+)(?:\s+for (\w+)\s+to (\w+)([\s\S]*?))?;/g;

  for (const [, verbe, nom, table, operation, role, corps] of sql.matchAll(instruction)) {
    if (verbe === 'create') {
      if (operation !== undefined) {
        politiques.set(`${table}.${operation}`, { nom, role, corps });
      }
      continue;
    }

    for (const [cle, politique] of [...politiques]) {
      if (politique.nom === nom) {
        politiques.delete(cle);
      }
    }
  }

  return politiques;
}

const { requetes: REQUETES, stockages: STOCKAGES } = appelsDeLApplication();
const POLITIQUES = politiquesEcrites(SQL);
const CLES_REQUETES = [
  ...new Set(REQUETES.map(({ table, methode }) => `${table}.${methode}`)),
].sort();
const NON_EXERCEES = [...POLITIQUES.keys()].filter((cle) => !CLES_REQUETES.includes(cle)).sort();

/**
 * Politiques qu'aucun écran n'exerce et qui ne sont pas des chemins
 * d'administration. Chacune porte sa raison ici, et le test qui suit vérifie
 * qu'aucune ne survit à l'arrivée du code qui l'exercerait : sans quoi la liste
 * deviendrait un cimetière de justifications.
 */
const ALLOWANCES = new Map([
  [
    'profiles.insert',
    "filet de sécurité si `handle_new_user` n'a pas pu s'exécuter — le rôle y est " +
      'figé à « membre », donc on ne s’attribue pas de droits en s’insérant soi-même',
  ],
  [
    'cantine_reservations.insert',
    'la politique reste, l’application ne l’exerce plus : l’écran de cantine ne ' +
      'propose plus de réserver, parce que le bouton n’était relié à aucun service ' +
      'de restauration scolaire et qu’un parent croyait avoir réservé un repas. ' +
      'La borne `user_id = auth.uid()` interdit d’écrire au nom d’un autre, et la ' +
      'table garde ses lignes — voir `src/services/cantine.ts`',
  ],
]);

test('l’analyse des requêtes trouve les seize appels attendus', () => {
  // Contrôle, et invariant en même temps : le nombre est celui que SECURITY.md
  // annonce. Une expression régulière trop stricte qui ne trouverait rien ferait
  // passer les quatre tests suivants sur zéro cas.
  //
  // Seize **appels** pour quatorze clés distinctes : deux couples table/méthode
  // sont écrits deux fois. Le décompte porte sur les appels parce que c'est ce
  // que l'analyse parcourt ; la liste, elle, porte sur les clés, parce qu'une
  // politique se réclame par couple et non par appel.
  //
  // Les deux appels excédentaires sont **tous les deux** `profiles.select`,
  // écrit trois fois : le profil de l'appelant, les noms des auteurs d'une page,
  // et la file des adhésions que le bureau décide. Aucun n'ajoute de clé, donc
  // aucune politique nouvelle n'est réclamée — c'est la même politique qui sert
  // les trois lectures. Mesuré, et non déduit : une première rédaction de ce
  // commentaire attribuait le second doublon à `discussion_messages.select`, qui
  // n'est écrit qu'une fois.
  //
  // Six clés sont **sorties** de cette liste avec l'accès public, et ce sont six
  // retraits, pas six oublis : les trois de `cantine_reservations` venaient du
  // bouton « Réserver », qui n'était relié à aucun service de restauration ;
  // `messages.select` et `messages.insert` venaient de l'ancien contact, qui
  // exigeait un compte ; `sondage_votes.select` relisait le vote par son auteur,
  // or un vote d'appareil n'en a plus.
  assert.equal(REQUETES.length, 16);
  assert.deepEqual(CLES_REQUETES, [
    'agenda_events.select',
    'annonces.select',
    'cantine_menus.select',
    'discussion_messages.insert',
    'discussion_messages.select',
    'documents.select',
    'profiles.select',
    'push_tokens.insert',
    'push_tokens.update',
    'signalements.insert',
    'signalements.select',
    'sondage_choices.select',
    'sondage_votes.insert',
    'sondages.select',
  ]);
});

/**
 * Buckets employés par l'application, avec la raison pour laquelle leur
 * politique n'est pas vérifiable ici.
 *
 * Un bucket ne se protège pas par RLS : ses politiques vivent dans le tableau de
 * bord Supabase, et le dépôt ne les contient pas. Les déclarer nommément est le
 * seul moyen qu'un bucket ajouté plus tard ne passe pas inaperçu — sans quoi il
 * serait le seul objet du projet dont la protection n'est écrite nulle part.
 */
const STOCKAGE_DOCUMENTE = new Map([
  [
    'documents.createSignedUrl',
    'le bucket `documents` est **privé** ; sa politique de lecture est créée dans ' +
      'le tableau de bord (voir MISE-EN-SERVICE.md). Le **réglage** n’est pas lisible ' +
      'ici, mais l’**instruction** qui le configure l’est — et le test qui suit ' +
      'compare le compartiment que le guide protège à celui que le code demande',
  ],
]);

test('tout appel à Storage est déclaré, avec sa raison', () => {
  assert.deepEqual(
    [...new Set(STOCKAGES.map(({ bucket, methode }) => `${bucket}.${methode}`))].sort(),
    [...STOCKAGE_DOCUMENTE.keys()].sort(),
    'un bucket n’a pas de politique RLS : la sienne vit dans le tableau de bord, ' +
      'donc hors de portée de ce banc — la déclarer ici est la seule trace possible',
  );
});

/**
 * Les politiques de compartiment telles que le **guide** les fait coller.
 *
 * Elles vivent hors du dépôt — le schéma `storage` n'existe pas dans nos migrations —,
 * mais l'**instruction** qui les crée est dans le dépôt. C'est la même distinction
 * que pour la longueur minimale du mot de passe : le tableau de bord n'est pas
 * lisible, l'instruction qui le configure l'est. La raison ci-dessus affirmait
 * qu'« aucun test du dépôt ne peut la lire » : c'était une justification par une
 * propriété universelle, et elle était fausse du même défaut que celle du mot de
 * passe — la lecture est possible, il fallait la faire.
 *
 * Elles sont **deux** depuis que les familles lisent les documents sans compte :
 * une pour le rôle anonyme, bornée par la table `documents`, une pour les porteurs
 * d'un jeton. Le banc les lit donc **toutes**, et non la première venue : n'en lire
 * qu'une aurait laissé passer la seconde, quelle qu'elle soit — y compris une
 * politique qui ouvrirait le compartiment entier au rôle anonyme.
 */
function compartimentsDuGuide(guide) {
  const politiques = [
    ...guide.matchAll(
      /create policy (\w+)\s+on storage\.objects for (\w+)\s+to (\w+)\s+using \(([\s\S]*?)\);/g,
    ),
  ].map(([, nom, operation, role, corps]) => ({ nom, operation, role, corps }));

  assert.notStrictEqual(
    politiques.length,
    0,
    'le guide ne fait plus coller de politique de compartiment : l’écran Documents ' +
      'ne lirait plus rien, et rien ne le signalerait — un refus rend une liste vide',
  );

  return politiques;
}

test('le compartiment que le guide protège est celui que le code demande', () => {
  // Deux copies d'un même nom, dont le désaccord serait **muet**. Si le guide
  // faisait créer la politique sur un compartiment que le code n'interroge pas —
  // ou si le code changeait de compartiment sans que le guide suive —, la lecture
  // serait refusée ; et un refus, ici, rend une **liste vide**, pas une erreur.
  // L'écran Documents afficherait « aucune donnée », sans rien dire de la cause.
  const politiques = compartimentsDuGuide(lireFichier('MISE-EN-SERVICE.md'));
  const demandes = [...new Set(STOCKAGES.map(({ bucket }) => bucket))];
  const proteges = [
    ...new Set(politiques.map(({ corps }) => /bucket_id = '(\w+)'/.exec(corps)?.[1] ?? null)),
  ];

  assert.deepEqual(
    proteges,
    demandes,
    `le code interroge ${JSON.stringify(demandes)} et le guide protège ` +
      `${JSON.stringify(proteges)} : la lecture serait refusée sans le dire`,
  );

  assert.deepEqual(
    [...new Set(politiques.map(({ operation }) => operation))],
    ['select'],
    'une politique du guide autorise autre chose que la lecture : aucun écran ' +
      'n’écrit dans le compartiment, et une écriture ouverte au rôle anonyme ' +
      'laisserait déposer n’importe quel fichier',
  );

  assert.ok(
    politiques.some(({ role }) => role === 'authenticated'),
    'plus aucune politique du guide ne couvre les utilisateurs connectés : le ' +
      'bureau ne verrait plus ses propres documents',
  );

  //  Le rôle anonyme n'obtient **pas** le compartiment : sa politique doit être
  //  bornée par la table `documents`, comme l'est la politique de lecture de
  //  cette table. Une politique `to anon using (bucket_id = 'documents')` — la
  //  forme la plus simple à écrire, et la plus tentante — ouvrirait tous les
  //  fichiers à quiconque détient la clé publique, extraite d'un APK.
  for (const { nom, corps } of politiques.filter(({ role }) => role === 'anon')) {
    assert.match(
      corps,
      /public\.documents/,
      `la politique « ${nom} » ouvre le compartiment au rôle anonyme sans le borner ` +
        'par la table `documents` : les documents du bureau seraient lisibles avec ' +
        'la seule clé publique',
    );
  }
});

test('chaque exception déclarée dit pourquoi, et vers quoi se vérifier', () => {
  // Les raisons de ces deux listes ne sont lues par aucun contrôle : elles sont
  // écrites pour le prochain lecteur. C'est précisément pour cela qu'une fausse y
  // survit — celle du compartiment affirmait qu'« aucun test du dépôt ne peut la
  // lire », et c'était faux de la même façon que pour la longueur du mot de
  // passe : le **réglage** du tableau de bord n'est pas lisible, l'**instruction**
  // qui le configure l'est, et le test ci-dessus la lit désormais.
  //
  // Une justification d'absence doit donc **pointer** vers l'endroit où la vérité
  // est écrite : un identifiant, un fichier, un test. C'est la seule propriété de
  // ce texte qu'une machine puisse tenir — et elle suffit à écarter un « non
  // vérifiable » écrit pour clore une question plutôt que pour la décrire.
  for (const [liste, entrees] of [
    ['ALLOWANCES', ALLOWANCES],
    ['STOCKAGE_DOCUMENTE', STOCKAGE_DOCUMENTE],
    ['SURFACE_PUBLIQUE', SURFACE_PUBLIQUE],
    ['SANS_POLITIQUE', SANS_POLITIQUE],
    ['TABLES_MODIFIEES', TABLES_MODIFIEES],
  ]) {
    for (const [cle, raison] of entrees) {
      assert.ok(
        raison.trim().length > 20,
        `la raison déclarée pour ${cle} dans \`${liste}\` est vide ou trop courte pour être relue`,
      );

      assert.match(
        raison,
        /`[^`]{3,}`/,
        `la raison déclarée pour ${cle} dans \`${liste}\` ne nomme rien : une ` +
          'justification d’absence doit pointer vers ce qui la rend vérifiable — un ' +
          'fichier, un test, un identifiant',
      );
    }
  }
});

test('chaque allowance est encore inexercée', () => {
  // Le contrôle qui empêche `ALLOWANCES` de devenir un cimetière. Une allowance
  // dit : « cette politique existe, aucun écran ne l'exerce, voici pourquoi ».
  // Le jour où un écran l'exerce, la seconde moitié de la phrase devient fausse
  // — et rien ne le dirait : le test des politiques non exercées cesserait
  // simplement de la citer, et la justification resterait, périmée, sous les
  // yeux du prochain lecteur.
  //
  // C'est un défaut de la même famille que celui que le dépôt a déjà rencontré :
  // une exception survit à la cause qu'elle décrivait. La seule façon de le
  // tenir est de vérifier l'exception **par sa négation**.
  const exercees = [...ALLOWANCES.keys()].filter((cle) => !NON_EXERCEES.includes(cle));

  assert.deepEqual(
    exercees,
    [],
    'ces politiques sont désormais exercées par `src/services/` : leur allowance ' +
      'n’a plus d’objet, il faut la retirer d’ALLOWANCES plutôt que de la laisser ' +
      'décrire une absence qui n’existe plus',
  );
});

test('chaque requête de l’application est couverte par une politique', () => {
  // Le défaut que ce test surveille ne produit ni exception ni message : un
  // `select` refusé renvoie une liste vide, et l'écran affiche « aucune donnée »
  // — indiscernable d'une table réellement vide.
  const orphelines = CLES_REQUETES.filter((cle) => !POLITIQUES.has(cle));

  assert.deepEqual(
    orphelines,
    [],
    'un refus de RLS ne produit pas d’erreur mais une liste vide : une requête sans ' +
      'politique ne se signale que par un écran vide, sans message',
  );
});

test('l’application ne modifie que les tables qu’elle déclare modifier', () => {
  // Deux choses d'un coup : le refus d'une méthode non reconnue, qui serait
  // comptée pour rien par l'analyse — `upsert` exige `insert` **et** `update`, et
  // le compter pour une seule ferait passer le contrôle à côté —, et la liste
  // close des tables modifiées.
  const methodes = [...new Set(REQUETES.map(({ methode }) => methode))].sort();

  assert.deepEqual(
    methodes,
    [...METHODES.keys()].sort(),
    'une méthode hors de cette liste doit être tranchée : `upsert` exige `insert` ET ' +
      '`update`, et la compter pour une seule ferait passer le contrôle à côté',
  );

  assert.deepEqual(
    [
      ...new Set(REQUETES.filter(({ methode }) => methode === 'update').map(({ table }) => table)),
    ].sort(),
    [...TABLES_MODIFIEES.keys()].sort(),
    'une modification touche une ligne qu’on n’a pas forcément créée : elle ne ' +
      'doit pas passer inaperçue — soit la retirer, soit l’inscrire dans ' +
      'TABLES_MODIFIEES avec sa raison',
  );
});

test('toute politique non exercée par l’application est nommée', () => {
  // Le détecteur qui a fait apparaître `profiles_update_own` : elle autorisait un
  // membre à réécrire son propre `display_name`, alors qu'aucun écran ne le
  // modifie et que la colonne est affichée comme une identité.
  assert.deepEqual(
    NON_EXERCEES,
    [
      'agenda_events.delete',
      'agenda_events.insert',
      'agenda_events.update',
      'annonces.delete',
      'annonces.insert',
      'annonces.update',
      'cantine_menus.delete',
      'cantine_menus.insert',
      'cantine_menus.update',
      'cantine_reservations.delete',
      'cantine_reservations.insert',
      'cantine_reservations.select',
      'discussion_messages.delete',
      'documents.delete',
      'documents.insert',
      'documents.update',
      'messages.delete',
      'messages.update',
      'profiles.insert',
      'push_tokens.select',
      'signalements.update',
      'sondage_choices.delete',
      'sondage_choices.insert',
      'sondage_choices.update',
      'sondage_votes.delete',
      'sondages.delete',
      'sondages.insert',
      'sondages.update',
    ],
    'ajouter une politique que rien n’exerce est une décision : elle doit être écrite ici',
  );
});

test('les politiques non exercées sont des chemins d’administration, ou des exceptions nommées', () => {
  // Le tri qui distingue les deux familles : le bureau écrit les annonces et les
  // menus, pose le statut d'un signalement, retire un message. `profiles.insert`
  // n'est pas de celles-là — c'est le filet de sécurité de `handle_new_user`, et
  // il doit sa présence à une raison, pas à une ressemblance.
  const inattendues = NON_EXERCEES.filter(
    (cle) => !POLITIQUES.get(cle).corps.includes('public.is_admin()') && !ALLOWANCES.has(cle),
  );

  assert.deepEqual(
    inattendues,
    [],
    'une politique que le code n’exerce pas et qui n’est pas réservée au bureau ouvre ' +
      'une capacité à tout membre : soit la retirer, soit l’inscrire dans ALLOWANCES ' +
      'avec sa raison',
  );
});
