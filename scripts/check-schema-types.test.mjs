/**
 * Vérifie que le schéma SQL et son miroir TypeScript s'accordent.
 *
 * POURQUOI CE SCRIPT
 * ------------------
 * `src/types/database.ts` est écrit **à la main** — le dépôt doit compiler sans
 * la CLI Supabase — et son en-tête porte un contrat : « Toute modification du
 * SQL doit être répercutée ici dans le même commit : TypeScript ne voit pas la
 * base, un écart entre les deux ne se manifesterait qu'à l'exécution, sur
 * l'appareil. »
 *
 * Ce contrat n'était vérifié par personne, et il décrit exactement ce qu'aucun
 * autre test ne peut voir. Mesuré : les deux s'accordent aujourd'hui, colonne par
 * colonne — ce fichier ne corrige donc rien, il **empêche la dérive**.
 *
 * CE QUE LA DÉRIVE PRODUIRAIT
 * ---------------------------
 * Les trois écarts possibles, et aucun n'est bruyant :
 *
 *   - une valeur d'énumération ajoutée en SQL et absente d'ici : l'application
 *     reçoit une valeur qu'elle ne connaît pas, et `SIGNALEMENT_CATEGORY_LABELS`
 *     rend `undefined` — un écran affiche « undefined » sans qu'aucune erreur ne
 *     soit levée ;
 *   - une colonne ajoutée en SQL et absente d'ici : `select('*')` la rapporte, le
 *     type l'ignore, et la donnée reste inutilisée en silence ;
 *   - une colonne `not null` sans valeur par défaut marquée **facultative** dans
 *     `Insert` : un service peut l'omettre sans que TypeScript proteste, et
 *     l'insertion échoue à l'exécution sur une contrainte `not-null`.
 *
 * LA CHAÎNE EST COMPLÈTE, ET C'EST LE BUT
 * ---------------------------------------
 * `src/types/models.ts` dérive ses alias de `Database`, et ses tables de
 * libellés sont des `Record<Enum, string>`. Une valeur ajoutée **ici** fait donc
 * échouer `tsc` tant que son libellé manque ; une valeur ajoutée **en SQL** fait
 * échouer ce fichier. Il n'y a plus de chemin silencieux.
 */

import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const RACINE = fileURLToPath(new URL('../', import.meta.url));
const MIGRATIONS = join(RACINE, 'supabase', 'migrations');
const TYPES = join(RACINE, 'src', 'types', 'database.ts');

function lireFichier(chemin) {
  return readFileSync(chemin, 'utf8');
}

/** Retire les commentaires de ligne et de bloc en TypeScript, `--` en SQL. */
function sansCommentaires(source) {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
}

function sansCommentairesSql(source) {
  return source.replace(/--[^\n]*/g, '');
}

/**
 * Le SQL de **toutes** les migrations, concaténé.
 *
 * POURQUOI TOUTES, ET NON LA PREMIÈRE
 * -----------------------------------
 * Ce fichier lisait `20260916120000_init.sql` **par son nom**. Tant qu'il n'y
 * avait qu'une migration, la différence était nulle — et donc invisible. À la
 * seconde, elle est devenue un trou : les six tables ajoutées par
 * `20260919120000_rubriques.sql` n'étaient comparées à rien, et ce banc
 * répondait « rien à signaler » sur ce qu'il ne regardait pas. C'est exactement
 * le défaut qu'il est écrit pour traquer ailleurs, et il l'a porté lui-même.
 *
 * Un nom de fichier en dur aurait aussi fait tomber le banc le jour d'un
 * renommage — en silence, pour la même raison.
 *
 * L'ordre de lecture est celui du nom, qui porte la date : deux migrations ne
 * peuvent pas déclarer la même table sans que la seconde échoue à s'appliquer,
 * et `check-migration-applicable` s'en charge. Ici, seule compte la réunion.
 */
function sqlDesMigrations() {
  const noms = readdirSync(MIGRATIONS)
    .filter((nom) => nom.endsWith('.sql'))
    .sort();

  return noms.map((nom) => sansCommentairesSql(lireFichier(join(MIGRATIONS, nom)))).join('\n');
}

/* -------------------------------------------------------------------------- *
 * Côté SQL — la référence
 * -------------------------------------------------------------------------- */

/** Nombre d'occurrences d'un caractère, pour suivre la profondeur des parenthèses. */
function occurrences(texte, caractere) {
  return [...texte].filter((lettre) => lettre === caractere).length;
}

/**
 * Retire du corps d'une table les blocs `constraint …`.
 *
 * POURQUOI PAS UN SIMPLE FILTRE DE LIGNE
 * --------------------------------------
 * Le relevé écartait les lignes commençant par `constraint`, et cela suffisait
 * tant que **chaque contrainte tenait sur une seule ligne** — ce qui était le
 * cas de la première migration, et de toutes ses contraintes.
 *
 * Dès qu'une contrainte s'écrit sur plusieurs lignes, la suite n'est plus une
 * déclaration de contrainte : elle commence par `or`, ou par une expression
 * quelconque, et le filtre la prend pour une colonne. Mesuré exactement ainsi :
 * la contrainte de format d'adresse de `messages` a produit
 * `messages.or absente de Row`, et deux tests sont tombés sur du SQL juste.
 *
 * La propriété cherchée est **structurelle** — une contrainte est un bloc
 * équilibré — et l'outil devait l'être aussi. On compte donc les parenthèses, au
 * lieu de regarder le premier mot de chaque ligne. C'est la même correction
 * qu'`check-async-wiring`, passé du texte à l'arbre syntaxique pour la même
 * raison : un motif qui approche une propriété produit des faux positifs, et un
 * banc qui tombe sur du code juste est un défaut du banc.
 */
function sansContraintes(corps) {
  const gardees = [];
  let profondeur = 0;

  for (const ligne of corps.split('\n')) {
    if (profondeur === 0 && !/^\s*constraint\b/i.test(ligne)) {
      gardees.push(ligne);
      continue;
    }

    profondeur += occurrences(ligne, '(') - occurrences(ligne, ')');
  }

  return gardees.join('\n');
}

/** Colonnes d'un corps de `create table`, avec ce qui décide de leur caractère obligatoire. */
function colonnesSql(corps) {
  const colonnes = [];

  for (const brute of sansContraintes(corps).split('\n')) {
    const ligne = brute.trim().replace(/,$/, '');

    if (ligne === '') {
      continue;
    }

    const trouve = /^(\w+)\s+(.+)$/.exec(ligne);

    if (trouve === null) {
      continue;
    }

    const [, nom, definition] = trouve;

    colonnes.push({
      nom,
      // `primary key` implique `not null` en PostgreSQL, sans l'écrire. Ne
      // chercher que le littéral faisait signaler les six colonnes `id` comme
      // nullables alors qu'elles ne le sont pas — six faux positifs, mesurés.
      nonNulle: /\bnot null\b/.test(definition) || /\bprimary key\b/.test(definition),
      parDefaut: /\bdefault\b/.test(definition),
    });
  }

  return colonnes;
}

function tablesSql() {
  const sql = sqlDesMigrations();
  const motif = /create table (?:if not exists )?public\.(\w+)\s*\(([\s\S]*?)\n\);/g;
  const tables = new Map();

  let table;
  while ((table = motif.exec(sql)) !== null) {
    tables.set(table[1], colonnesSql(table[2]));
  }

  return tables;
}

function enumsSql() {
  const sql = sqlDesMigrations();
  const motif = /create type public\.(\w+) as enum\s*\(([^)]*)\)/g;
  const enums = new Map();

  let type;
  while ((type = motif.exec(sql)) !== null) {
    enums.set(
      type[1],
      type[2]
        .split(',')
        .map((valeur) => valeur.trim().replace(/^'|'$/g, ''))
        .filter((valeur) => valeur !== ''),
    );
  }

  return enums;
}

/* -------------------------------------------------------------------------- *
 * Côté TypeScript — le miroir
 * -------------------------------------------------------------------------- */

/** Membres d'un bloc `{ nom: type; … }`. */
function membres(bloc) {
  const trouves = [];

  for (const brute of bloc.split('\n')) {
    const ligne = brute.trim();
    const trouve = /^(\w+)(\??):\s*(.+);$/.exec(ligne);

    if (trouve === null) {
      continue;
    }

    trouves.push({ nom: trouve[1], optionnel: trouve[2] === '?', type: trouve[3].trim() });
  }

  return trouves;
}

function tablesTypes() {
  const source = sansCommentaires(lireFichier(TYPES));
  const motif =
    /(\w+):\s*\{\s*Row:\s*\{([\s\S]*?)\}\s*;\s*Insert:\s*\{([\s\S]*?)\}\s*;\s*Update:\s*\{([\s\S]*?)\}\s*;\s*Relationships:/g;
  const tables = new Map();

  let table;
  while ((table = motif.exec(source)) !== null) {
    tables.set(table[1], {
      row: membres(table[2]),
      insert: membres(table[3]),
    });
  }

  return tables;
}

function enumsTypes() {
  const source = sansCommentaires(lireFichier(TYPES));
  const bloc = /Enums:\s*\{([\s\S]*?)\n\s*\};/.exec(source)?.[1] ?? '';
  const enums = new Map();

  for (const brute of bloc.split('\n')) {
    const trouve = /^\s*(\w+):\s*(.+);$/.exec(brute);

    if (trouve === null) {
      continue;
    }

    enums.set(
      trouve[1],
      trouve[2]
        .split('|')
        .map((valeur) => valeur.trim().replace(/^'|'$/g, ''))
        .filter((valeur) => valeur !== ''),
    );
  }

  return enums;
}

const TABLES_SQL = tablesSql();
const TABLES_TYPES = tablesTypes();
const ENUMS_SQL = enumsSql();
const ENUMS_TYPES = enumsTypes();

/* -------------------------------------------------------------------------- *
 * Tests
 * -------------------------------------------------------------------------- */

test('l’extraction lit bien la migration et le miroir', () => {
  // Sans ce garde-fou, un motif qui ne correspond plus rendrait tous les tests
  // suivants verts en ne comparant rien — un défaut avec l'apparence d'une
  // protection. C'est le pire des états possibles.
  assert.ok(TABLES_SQL.size >= 5, `tables lues dans la migration : ${TABLES_SQL.size}`);
  assert.ok(TABLES_TYPES.size >= 5, `tables lues dans database.ts : ${TABLES_TYPES.size}`);
  assert.ok(ENUMS_SQL.size >= 3, `énumérations lues dans la migration : ${ENUMS_SQL.size}`);
  assert.ok(ENUMS_TYPES.size >= 3, `énumérations lues dans database.ts : ${ENUMS_TYPES.size}`);

  for (const [nom, colonnes] of TABLES_SQL) {
    assert.ok(colonnes.length >= 2, `table ${nom} : ${colonnes.length} colonne(s) lue(s)`);
  }
});

test('les mêmes tables sont déclarées des deux côtés', () => {
  assert.deepEqual(
    [...TABLES_TYPES.keys()].sort(),
    [...TABLES_SQL.keys()].sort(),
    'une table ajoutée d’un seul côté ne se voit qu’à l’exécution',
  );
});

test('chaque table porte les mêmes colonnes', () => {
  const ecarts = [];

  for (const [nom, colonnes] of TABLES_SQL) {
    const miroir = TABLES_TYPES.get(nom);

    if (miroir === undefined) {
      continue; // déjà signalé par le test précédent
    }

    const attendues = colonnes.map((colonne) => colonne.nom).sort();
    const declarees = miroir.row.map((colonne) => colonne.nom).sort();

    const manquantes = attendues.filter((colonne) => !declarees.includes(colonne));
    const enTrop = declarees.filter((colonne) => !attendues.includes(colonne));

    if (manquantes.length > 0) {
      ecarts.push(`${nom} : ${manquantes.join(', ')} absente(s) de Row`);
    }

    if (enTrop.length > 0) {
      ecarts.push(`${nom} : ${enTrop.join(', ')} déclarée(s) sans exister en base`);
    }
  }

  assert.deepEqual(ecarts, []);
});

test('la nullabilité déclarée est celle du schéma', () => {
  // Une colonne nullable annoncée non nulle fait écrire du code qui ne prévoit
  // pas le `null` ; l'inverse fait écrire des contrôles inutiles. Les deux se
  // paient à l'exécution, pas à la compilation.
  const ecarts = [];

  for (const [nom, colonnes] of TABLES_SQL) {
    const miroir = TABLES_TYPES.get(nom);

    if (miroir === undefined) {
      continue;
    }

    for (const colonne of colonnes) {
      const declaree = miroir.row.find((candidate) => candidate.nom === colonne.nom);

      if (declaree === undefined) {
        continue; // déjà signalé par le test précédent
      }

      const nullable = declaree.type.includes('| null');

      if (colonne.nonNulle && nullable) {
        ecarts.push(`${nom}.${colonne.nom} : not null en base, « ${declaree.type} » dans Row`);
      }

      if (!colonne.nonNulle && !nullable) {
        ecarts.push(`${nom}.${colonne.nom} : nullable en base, « ${declaree.type} » dans Row`);
      }
    }
  }

  assert.deepEqual(ecarts, []);
});

test('une colonne obligatoire en base est obligatoire dans Insert', () => {
  // Le cas le plus coûteux des trois : marquer facultative une colonne `not null`
  // sans valeur par défaut laisse un service l'omettre sans que TypeScript
  // proteste, et l'insertion échoue sur une contrainte `not-null` — donc après
  // que l'adhérent a rempli son formulaire.
  const ecarts = [];

  for (const [nom, colonnes] of TABLES_SQL) {
    const miroir = TABLES_TYPES.get(nom);

    if (miroir === undefined) {
      continue;
    }

    for (const colonne of colonnes) {
      const declaree = miroir.insert.find((candidate) => candidate.nom === colonne.nom);

      if (declaree === undefined) {
        ecarts.push(`${nom}.${colonne.nom} : absente de Insert`);
        continue;
      }

      const obligatoireEnBase = colonne.nonNulle && !colonne.parDefaut;

      if (obligatoireEnBase && declaree.optionnel) {
        ecarts.push(`${nom}.${colonne.nom} : not null sans défaut, mais facultative dans Insert`);
      }

      if (!obligatoireEnBase && !declaree.optionnel) {
        ecarts.push(`${nom}.${colonne.nom} : facultative en base, mais obligatoire dans Insert`);
      }
    }
  }

  assert.deepEqual(ecarts, []);
});

test('les énumérations portent les mêmes valeurs, dans l’ordre du SQL', () => {
  // L'ordre est vérifié ici, contrairement aux colonnes : il est porté par le
  // `create type`, et le miroir d'une régénération le conserve. Un décalage
  // d'ordre signale une énumération réécrite à la main plutôt que régénérée.
  const ecarts = [];

  for (const [nom, valeurs] of ENUMS_SQL) {
    const declarees = ENUMS_TYPES.get(nom);

    if (declarees === undefined) {
      ecarts.push(`${nom} : énumération absente de database.ts`);
      continue;
    }

    if (declarees.join(' | ') !== valeurs.join(' | ')) {
      ecarts.push(`${nom} : « ${declarees.join(' | ')} » au lieu de « ${valeurs.join(' | ')} »`);
    }
  }

  for (const nom of ENUMS_TYPES.keys()) {
    if (!ENUMS_SQL.has(nom)) {
      ecarts.push(`${nom} : énumération déclarée sans exister en base`);
    }
  }

  assert.deepEqual(ecarts, []);
});
