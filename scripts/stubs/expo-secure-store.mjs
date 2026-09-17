/**
 * Doublure d'`expo-secure-store` pour `node:test`.
 *
 * POURQUOI CETTE DOUBLURE
 * -----------------------
 * `src/config/storage.ts` décide **où vivent les jetons de session** — le
 * Keychain sur iOS, le Keystore sur Android — et c'est la seule barrière qui
 * protège une session complète sur un appareil débridé. Ce fichier n'avait
 * aucun test, faute de pouvoir charger un module natif sous Node.
 *
 * La doublure est un simple `Map`, instrumenté : les tests observent l'ordre
 * réel des écritures, qui est le cœur du découpage en fragments.
 *
 * `__abortAfter(n)` fait **échouer** la doublure à partir de la n-ième
 * opération, sans l'exécuter : c'est le seul moyen de simuler une coupure en
 * plein appel, la fonction du module ne rendant la main qu'à la fin. Les tests
 * s'en servent pour énumérer tous les points de coupure d'une sauvegarde au lieu
 * d'en raisonner deux ou trois.
 *
 * Elle est branchée par `scripts/alias-loader.mjs`, jamais par le code de
 * l'application : le paquet réel reste celui qui est livré.
 */

/** Le « trousseau », en mémoire. */
const store = new Map();

/** Journal des opérations, dans l'ordre : `[opération, clé]`. */
const operations = [];

/** Rang de l'opération à partir duquel la doublure simule une coupure. */
let abortAfter = Number.POSITIVE_INFINITY;

export const __store = store;
export const __operations = operations;

/** Remet la doublure à zéro entre deux cas, y compris la coupure simulée. */
export function __reset() {
  store.clear();
  operations.length = 0;
  abortAfter = Number.POSITIVE_INFINITY;
}

/** Simule une coupure à partir de la n-ième opération (0 = avant la première). */
export function __abortAfter(n) {
  abortAfter = n;
}

function record(operation, key) {
  if (operations.length >= abortAfter) {
    throw new Error('coupure simulée');
  }
  operations.push([operation, key]);
}

export async function getItemAsync(key) {
  record('get', key);
  return store.has(key) ? store.get(key) : null;
}

export async function setItemAsync(key, value) {
  record('set', key);
  store.set(key, value);
}

export async function deleteItemAsync(key) {
  record('delete', key);
  store.delete(key);
}
