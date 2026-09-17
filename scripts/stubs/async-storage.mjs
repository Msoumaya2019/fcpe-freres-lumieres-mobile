/**
 * Doublure d'`@react-native-async-storage/async-storage`.
 *
 * Sur le web, `src/config/storage.ts` y retombe, faute de trousseau : les
 * jetons y sont alors écrits en clair. Le test correspondant vérifie que ce
 * choix est bien celui qui est fait, et que le trousseau reste intact dans ce
 * cas — c'est-à-dire qu'on n'écrit pas à moitié dans l'un et à moitié dans
 * l'autre.
 */

const store = new Map();

export const __store = store;

export function __reset() {
  store.clear();
}

const AsyncStorage = {
  async getItem(key) {
    return store.has(key) ? store.get(key) : null;
  },
  async setItem(key, value) {
    store.set(key, value);
  },
  async removeItem(key) {
    store.delete(key);
  },
};

export default AsyncStorage;
