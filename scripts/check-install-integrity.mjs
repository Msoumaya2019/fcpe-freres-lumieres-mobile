/**
 * Détecte les paquets installés dont le point d'entrée déclaré est absent.
 *
 * POURQUOI CE SCRIPT
 * ------------------
 * Une installation interrompue peut laisser un paquet à moitié extrait : le
 * dossier existe, `package.json` annonce une version conforme au lockfile, et
 * `npm install` le considère donc comme valide — alors que `dist/index.js` n'a
 * jamais été écrit. L'erreur ne se manifeste qu'au premier `require`, c'est-à-
 * dire au moment du bundle, avec un message qui désigne le mauvais coupable.
 *
 * Ce contrôle est volontairement plus large que `npm ls` : celui-ci valide
 * l'arbre des versions, pas la présence des fichiers.
 */

import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const NODE_MODULES = path.join(ROOT, 'node_modules');

/** Liste récursive des dossiers de paquets, y compris imbriqués et scopés. */
function findPackages(directory) {
  const found = [];

  let entries;
  try {
    entries = fs.readdirSync(directory, { withFileTypes: true });
  } catch {
    return found;
  }

  for (const entry of entries) {
    // Les noms commençant par un point sont ceux de npm : `.bin`, et les
    // dossiers de préparation `.paquet-xxxx` qu'une interruption laisse parfois
    // derrière elle. Ce ne sont pas des paquets installés.
    if (!entry.isDirectory() || entry.name.startsWith('.')) {
      continue;
    }

    const full = path.join(directory, entry.name);

    if (entry.name.startsWith('@')) {
      found.push(...findPackages(full));
      continue;
    }

    const manifestPath = path.join(full, 'package.json');
    if (fs.existsSync(manifestPath)) {
      found.push({ dir: full, manifestPath });
    }

    const nested = path.join(full, 'node_modules');
    if (fs.existsSync(nested)) {
      found.push(...findPackages(nested));
    }
  }

  return found;
}

/**
 * Résout le point d'entrée déclaré, en tenant compte de `exports` qui prime sur
 * `main` dans les paquets modernes.
 *
 * Renvoie un tableau vide pour les paquets qui n'en déclarent aucun : ce ne sont
 * pas des anomalies mais des paquets de données (`@babel/compat-data`,
 * `type-fest`, `undici-types`…), consommés par chemin explicite. Les signaler
 * remplirait le rapport de faux positifs et rendrait le contrôle inutilisable.
 *
 * @returns {string[]} les chemins candidats, relatifs au paquet
 */
function entryCandidates(manifest) {
  const candidates = [];

  // `exports` s'écrit de deux façons : avec une clé « . » explicite, ou sous
  // forme abrégée où l'objet décrit directement les conditions de la racine
  // (`{"import": …, "require": …}`). Ne lire que la première forme fait
  // signaler comme cassés des paquets parfaitement valides — `@humanfs/core`,
  // par exemple, dont la cible est `./src/index.js`.
  const exported = manifest.exports;
  const hasSubpaths =
    exported !== null &&
    typeof exported === 'object' &&
    Object.keys(exported).some((key) => key.startsWith('.'));
  const root =
    exported !== null && typeof exported === 'object'
      ? hasSubpaths
        ? exported['.']
        : exported
      : undefined;

  if (typeof root === 'string') {
    candidates.push(root);
  } else if (root && typeof root === 'object') {
    for (const value of Object.values(root)) {
      if (typeof value === 'string') {
        candidates.push(value);
      } else if (value && typeof value === 'object') {
        for (const nested of Object.values(value)) {
          if (typeof nested === 'string') {
            candidates.push(nested);
          }
        }
      }
    }
  }

  if (typeof manifest.main === 'string') {
    candidates.push(manifest.main);
  }

  return candidates;
}

/** Extensions essayées par Node quand le chemin n'en porte pas. */
const EXTENSIONS = ['.js', '.json', '.node', '.mjs', '.cjs'];

/**
 * Exceptions assumées : paquets dont le point d'entrée déclaré est absent du
 * paquet **publié**.
 *
 * `@expo/router-server` annonce `main: build/index`, fichier qui n'existe pas
 * dans le tarball officiel — vérifié en comparant l'installation au tarball,
 * fichier par fichier : les deux sont identiques, l'anomalie est donc amont et
 * non locale. La signaler à chaque exécution rendrait ce contrôle inutilisable,
 * puisqu'il échouerait toujours.
 *
 * Cette liste doit rester vide ou quasi vide. Y ajouter une entrée revient à
 * renoncer à vérifier un paquet : vérifiez d'abord contre le tarball.
 */
const UPSTREAM_QUIRKS = new Set(['expo/node_modules/@expo/cli/node_modules/@expo/router-server']);

/**
 * Reproduit la résolution de fichier de Node pour un chemin relatif.
 *
 * Indispensable pour ne pas produire de faux positifs : un `main` valant
 * `./index` désigne `index.js`, et un `main` valant `lib/walker` désigne
 * `lib/walker.js`. Comparer les chemins caractère par caractère signalerait
 * comme cassés la quasi-totalité des paquets CommonJS.
 *
 * @param {string} base répertoire du paquet
 * @param {string} candidate chemin déclaré, relatif
 * @returns {boolean}
 */
function resolvesToFile(base, candidate) {
  const target = path.resolve(base, candidate.replace(/^\.\//, ''));

  try {
    if (fs.statSync(target).isFile()) {
      return true;
    }
    if (fs.statSync(target).isDirectory()) {
      return (
        fs.existsSync(path.join(target, 'index.js')) ||
        fs.existsSync(path.join(target, 'package.json'))
      );
    }
  } catch {
    // Chemin inexistant : on tente les extensions ci-dessous.
  }

  return EXTENSIONS.some((extension) => fs.existsSync(target + extension));
}

/** Nom du paquet relatif à `node_modules`, toujours en barres obliques. */
function relativeName(directory) {
  return path.relative(NODE_MODULES, directory).split(path.sep).join('/');
}

const packages = findPackages(NODE_MODULES);
const broken = [];
const quirks = [];

for (const { dir, manifestPath } of packages) {
  const name = relativeName(dir);

  let manifest;
  try {
    manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  } catch {
    broken.push({ name, reason: 'package.json illisible' });
    continue;
  }

  const candidates = entryCandidates(manifest);

  // Aucune entrée déclarée : le paquet ne peut pas être importé par son nom,
  // donc il n'y a rien à vérifier. C'est le cas des paquets de données, et
  // aussi de ceux qui s'en remettent au `index.js` implicite de CommonJS.
  if (candidates.length === 0) {
    continue;
  }

  if (candidates.some((candidate) => resolvesToFile(dir, candidate))) {
    continue;
  }

  const reason = `point d'entrée déclaré mais absent : ${candidates.slice(0, 3).join(', ')}`;

  if (UPSTREAM_QUIRKS.has(name)) {
    quirks.push({ name, reason });
  } else {
    broken.push({ name, reason });
  }
}

console.log(`Paquets inspectés : ${packages.length}`);
console.log(`Paquets au point d'entrée manquant : ${broken.length}`);

for (const entry of broken) {
  console.log(`  - ${entry.name} — ${entry.reason}`);
}

if (quirks.length > 0) {
  console.log(`Anomalies amont connues (ignorées) : ${quirks.length}`);
  for (const entry of quirks) {
    console.log(`  ~ ${entry.name} — ${entry.reason}`);
  }
}

if (broken.length > 0) {
  console.log();
  console.log("Une installation a probablement été interrompue : réinstallez l'arbre avec");
  console.log('`npm ci` (au besoin après avoir déplacé `node_modules`).');
}

process.exitCode = broken.length === 0 ? 0 : 1;
