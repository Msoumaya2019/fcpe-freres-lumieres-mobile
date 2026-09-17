/**
 * Vérification syntaxique des fichiers SQL de `supabase/`.
 *
 * POURQUOI CE CONTRÔLE EXISTE
 * ---------------------------
 * Les politiques RLS de `supabase/migrations/` sont la **seule** barrière de
 * sécurité du projet : l'application mobile embarque une clé publique, et le
 * code client n'empêche rien. Une faute de frappe dans ce fichier — une virgule
 * oubliée, un `policy` mal fermé — ne se voit ni à la compilation, ni au lint,
 * ni dans l'application : elle se découvre au moment du `db push`, c'est-à-dire
 * au pire moment.
 *
 * Ce script fait analyser les fichiers par le véritable analyseur PostgreSQL
 * (libpg-query, compilé en WebAssembly), sans instance locale ni Docker.
 *
 * PORTÉE — À NE PAS SURESTIMER
 * ----------------------------
 * Un analyseur vérifie la **syntaxe**, pas la **sémantique**. Il ne dira pas
 * qu'une colonne référencée n'existe pas, ni qu'une politique laisse passer ce
 * qu'elle devrait bloquer. La vérification complète reste `supabase db reset`
 * contre une base réelle. Ce contrôle attrape le plus fréquent, pas le subtil.
 */

import { readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

import { parse } from 'libpg-query';

const projectRoot = fileURLToPath(new URL('..', import.meta.url));
const sqlRoot = join(projectRoot, 'supabase');

/** Chemin relatif, en séparateurs Unix, pour un affichage stable en CI. */
function toDisplayPath(absolutePath) {
  return relative(projectRoot, absolutePath).split('\\').join('/');
}

function findSqlFiles(directory) {
  const entries = readdirSync(directory, { recursive: true, withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile() && entry.name.endsWith('.sql'))
    .map((entry) => join(entry.parentPath ?? entry.path, entry.name))
    .sort();
}

async function main() {
  const files = findSqlFiles(sqlRoot);

  if (files.length === 0) {
    console.error('Aucun fichier .sql trouvé dans supabase/ — le contrôle ne sert à rien.');
    process.exitCode = 1;
    return;
  }

  let failures = 0;

  for (const file of files) {
    const sql = readFileSync(file, 'utf8');
    try {
      const tree = await parse(sql);
      const statementCount = tree.stmts?.length ?? 0;
      console.log(`OK    ${toDisplayPath(file)} — ${statementCount} instruction(s)`);
    } catch (error) {
      failures += 1;
      console.error(`ÉCHEC ${toDisplayPath(file)}`);
      console.error(`      ${String(error.message).split('\n')[0]}`);
      if (typeof error.cursorPosition === 'number') {
        const lineNumber = sql.slice(0, error.cursorPosition).split('\n').length;
        console.error(`      à la ligne ${lineNumber}`);
      }
    }
  }

  if (failures > 0) {
    console.error(`\n${failures} fichier(s) SQL invalide(s).`);
    process.exitCode = 1;
    return;
  }

  console.log(`\n${files.length} fichier(s) SQL analysé(s) sans erreur de syntaxe.`);
}

await main();
