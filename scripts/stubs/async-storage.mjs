/**
 * Doublure d'`@react-native-async-storage/async-storage`.
 *
 * Sur le web, `src/config/storage.ts` y retombe, faute de trousseau : les
 * jetons y sont alors écrits en clair. Le test correspondant vérifie que ce
 * choix est bien celui qui est fait, et que le trousseau reste intact dans ce
 * cas — c'est-à-dire qu'on n'écrit pas à moitié dans l'un et à moitié dans
 * l'autre.
 *
 * TOUTES LES MÉTHODES QUE LE PROJET EMPLOIE, ET PAS SEULEMENT CELLES DE
 * `storage.ts`
 * -----------------------------------------------
 * Cette doublure ne portait que `getItem`, `setItem` et `removeItem` — les trois
 * qu'emploie `storage.ts`. `getAllKeys` et `multiRemove` manquaient, si bien que
 * `src/config/preferences.ts` — le seul module qui décide **ce qu'un effacement
 * emporte** — n'était exerçable par aucun banc. Une doublure incomplète ne rend
 * pas un module intestable : elle rend son test impossible, et personne ne s'en
 * aperçoit tant qu'on ne l'écrit pas.
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
  async getAllKeys() {
    return [...store.keys()];
  },
  async multiRemove(keys) {
    for (const key of keys) {
      store.delete(key);
    }
  },
};

export default AsyncStorage;
