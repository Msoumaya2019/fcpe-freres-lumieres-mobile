/**
 * Résolution de l'alias « @/ » pour `node:test`.
 *
 * POURQUOI CE FICHIER
 * -------------------
 * Le code source importe par alias (`@/config/env`), ce que Metro résout grâce
 * aux `paths` de `tsconfig.json`. Node, lui, ne connaît que les chemins relatifs
 * et les paquets : un test ne pouvait donc importer que les rares modules sans
 * dépendance interne — `src/config/env.ts`, et c'est tout.
 *
 * Ce chargeur lève la limite sans ajouter de paquet : `node:module` est intégré.
 * Il ouvre au test tout le dossier `src/`, ce qui compte pour les modules dont
 * la logique est invisible autrement — la traduction des erreurs, notamment.
 *
 * Il reproduit la résolution de Metro, extensions comprises : un import
 * `@/errors` doit trouver `src/errors/index.ts`.
 */

import { existsSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';

const SOURCE_ROOT = fileURLToPath(new URL('../src/', import.meta.url));

const EXTENSIONS = ['.ts', '.tsx', '/index.ts', '/index.tsx'];

/**
 * Paquets natifs remplacés par des doublures, pour `node:test`.
 *
 * `src/config/storage.ts` importe `expo-secure-store`, `react-native` et
 * `AsyncStorage` : trois paquets qui exigent un environnement React Native et
 * que Node ne peut pas charger. Sans ces doublures, le seul module qui décide
 * **où vivent les jetons de session** restait intestable.
 *
 * La liste est explicite, paquet par paquet, et non un préfixe : un préfixe
 * finirait par remplacer en silence un paquet qu'on voulait réellement charger.
 * Les doublures ne sont branchées que sous `node:test` — le paquet livré dans
 * l'application reste l'original.
 */
const STUBS = new Map([
  ['expo-secure-store', './stubs/expo-secure-store.mjs'],
  ['react-native', './stubs/react-native.mjs'],
  ['@react-native-async-storage/async-storage', './stubs/async-storage.mjs'],
]);

export function resolve(specifier, context, next) {
  const stub = STUBS.get(specifier);
  if (stub !== undefined) {
    return next(new URL(stub, import.meta.url).href, context);
  }

  if (!specifier.startsWith('@/')) {
    return next(specifier, context);
  }

  const base = SOURCE_ROOT + specifier.slice(2);

  for (const candidate of [base, ...EXTENSIONS.map((extension) => `${base}${extension}`)]) {
    if (existsSync(candidate)) {
      return next(pathToFileURL(candidate).href, context);
    }
  }

  // Échouer ici, avec le chemin cherché, évite l'erreur « Cannot find module »
  // qui ne dit pas quel alias a été mal orthographié.
  throw new Error(`Alias « @/ » non résolu : « ${specifier} » (cherché sous ${base})`);
}
