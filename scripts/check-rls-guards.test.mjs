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
 *     regardent le schéma ; celle-ci le confronte au code.
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
  // Douze tables ont une politique d'insertion, et elles se partagent en deux
  // familles égales. Six sont insérables par un **membre** — `profiles`,
  // `cantine_reservations`, `signalements`, `discussion_messages`,
  // `sondage_votes`, `messages` — et six par le **bureau** — `annonces`,
  // `cantine_menus`, `agenda_events`, `documents`, `sondages`,
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

function tablesSansAnon(sql) {
  return [...sql.matchAll(/revoke all on public\.(\w+)\s+from anon;/g)].map(([, table]) => table);
}

function tablesAvecPolitique(sql) {
  return [...new Set([...sql.matchAll(/create policy \w+\s+on public\.(\w+)/g)].map(([, t]) => t))];
}

const DECLAREES = tablesDeclarees(SQL);
const SOUS_RLS = tablesSousRls(SQL);
const SANS_ANON = tablesSansAnon(SQL);
const AVEC_POLITIQUE = tablesAvecPolitique(SQL);

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

test('les migrations déclarent les douze tables attendues', () => {
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

test('chaque table déclarée a au moins une politique', () => {
  // RLS activée sans aucune politique ne ferme pas la table : elle la rend
  // inaccessible à tout le monde, application comprise, et l'écran reste vide
  // sans message d'erreur.
  assert.deepEqual(
    DECLAREES.filter((table) => !AVEC_POLITIQUE.includes(table)),
    [],
    'une table sous RLS sans politique est inaccessible, application comprise',
  );
});

test('chaque table déclarée est fermée au rôle anonyme', () => {
  assert.deepEqual(
    DECLAREES.filter((table) => !SANS_ANON.includes(table)),
    [],
    'le rôle anon ne doit rien pouvoir, même en l’absence de politique à son intention',
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

test('le découpage par blocs voit les douze tables déclarées', () => {
  // Contrôle du contrôle, et non redondance : `tablesDeclarees` lit les en-têtes,
  // ce découpage lit les corps. S'ils divergent, l'analyse des clés étrangères
  // porterait sur un schéma partiel sans que rien ne le dise.
  assert.deepEqual(
    BLOCS.map(({ table }) => table),
    DECLAREES,
  );
});

test('l’analyse voit les quatorze clés étrangères du schéma', () => {
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
 */
const METHODES = new Map([
  ['select', 'select'],
  ['insert', 'insert'],
  ['delete', 'delete'],
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

/** Politiques écrites : clé « table.operation » → nom, rôle et corps. */
function politiquesEcrites(sql) {
  const politiques = new Map();
  const motif = /create policy (\w+)\s+on public\.(\w+) for (\w+)\s+to (\w+)([\s\S]*?);/g;

  for (const [, nom, table, operation, role, corps] of sql.matchAll(motif)) {
    politiques.set(`${table}.${operation}`, { nom, role, corps });
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
 * d'administration. Il n'en existe qu'une sur ce schéma, et elle porte sa raison
 * ici : c'est ce qui empêche d'en ajouter une sans y penser.
 */
const ALLOWANCES = new Map([
  [
    'profiles.insert',
    "filet de sécurité si `handle_new_user` n'a pas pu s'exécuter — le rôle y est " +
      'figé à « membre », donc on ne s’attribue pas de droits en s’insérant soi-même',
  ],
]);

test('l’analyse des requêtes trouve les dix-neuf appels attendus', () => {
  // Contrôle, et invariant en même temps : le nombre est celui que SECURITY.md
  // annonce. Une expression régulière trop stricte qui ne trouverait rien ferait
  // passer les quatre tests suivants sur zéro cas.
  //
  // Dix-neuf **appels** pour dix-huit clés distinctes : un même couple
  // table/méthode est écrit deux fois. Le décompte porte sur les appels parce que
  // c'est ce que l'analyse parcourt ; la liste, elle, porte sur les clés, parce
  // qu'une politique se réclame par couple et non par appel.
  assert.equal(REQUETES.length, 19);
  assert.deepEqual(CLES_REQUETES, [
    'agenda_events.select',
    'annonces.select',
    'cantine_menus.select',
    'cantine_reservations.delete',
    'cantine_reservations.insert',
    'cantine_reservations.select',
    'discussion_messages.insert',
    'discussion_messages.select',
    'documents.select',
    'messages.insert',
    'messages.select',
    'profiles.select',
    'signalements.insert',
    'signalements.select',
    'sondage_choices.select',
    'sondage_votes.insert',
    'sondage_votes.select',
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
      'le tableau de bord (voir MISE-EN-SERVICE.md), et aucun test du dépôt ne peut la lire',
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

test('l’application ne modifie aucune ligne', () => {
  // Deux choses d'un coup : la phrase de SECURITY.md — « aucune modification » —
  // et le refus d'une méthode non reconnue, qui serait comptée pour rien par
  // l'analyse.
  const methodes = [...new Set(REQUETES.map(({ methode }) => methode))].sort();

  assert.deepEqual(
    methodes,
    [...METHODES.keys()].sort(),
    'une méthode hors de cette liste doit être tranchée : `upsert` exige `insert` ET ' +
      '`update`, et la compter pour une seule ferait passer le contrôle à côté',
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
      'discussion_messages.delete',
      'documents.delete',
      'documents.insert',
      'documents.update',
      'messages.delete',
      'messages.update',
      'profiles.insert',
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
