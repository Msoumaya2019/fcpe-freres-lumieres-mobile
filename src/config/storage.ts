/**
 * Stockage des jetons de session.
 *
 * POURQUOI PAS DIRECTEMENT AsyncStorage
 * -------------------------------------
 * Le guide Supabase pour React Native utilise AsyncStorage. C'est simple, mais
 * AsyncStorage écrit en clair dans le bac à sable de l'application : sur un
 * appareil débridé, ou via une sauvegarde système extraite, le jeton de
 * rafraîchissement est lisible — et il vaut une session complète.
 *
 * `expo-secure-store` s'appuie sur le Keychain (iOS) et sur Keystore
 * (Android), chiffrés par le matériel. Pour une application qui manipule des
 * données d'adhérents, c'est le bon endroit.
 *
 * POURQUOI UN DÉCOUPAGE EN FRAGMENTS
 * ----------------------------------
 * La documentation d'Expo annonce une limite de 2048 octets par valeur sur
 * Android, héritée de l'époque où la valeur était chiffrée directement par une
 * clé RSA du Keystore (bloc de 256 octets). Une session Supabase — deux JWT,
 * plus les métadonnées utilisateur — dépasse régulièrement cette taille, d'où
 * ce découpage en fragments de 1800 octets.
 *
 * ÉTAT VÉRIFIÉ DANS LA VERSION INSTALLÉE (expo-secure-store 57.0.4)
 * -----------------------------------------------------------------
 * Le contrôle n'existe plus : aucune occurrence de `2048`, de `byteLength`, ni
 * le moindre test de longueur dans le paquet — ni côté JavaScript, ni dans
 * `SecureStoreModule.kt`. Le journal des versions ne mentionne qu'un retrait
 * d'avertissement, et côté iOS seulement. Le chemin Android par défaut est
 * `AESEncryptor` — `Cipher.getInstance(AES_CIPHER)`, donc AES/GCM, qui n'a pas
 * de limite de bloc.
 *
 * **Le chemin hybride n'est pas celui de `requireAuthentication`**, contrairement
 * à ce qu'affirmait une version précédente de ce commentaire.
 * `requireAuthentication` ne change que le **suffixe de l'alias de clé** et
 * l'exigence d'authentification de l'utilisateur : l'encrypteur reste
 * `AESEncryptor`. Le chemin hybride (`HybridAESEncryptor`, paire de clés
 * asymétrique) sert aux enregistrements **hérités** — écrits sur d'anciennes
 * versions d'Android, où la clé symétrique n'était pas disponible — et il n'est
 * employé qu'en **déchiffrement** : dans la version installée, le chemin
 * d'écriture n'appelle jamais que `mAESEncryptor`. La conclusion est donc la
 * même, et elle tient plus solidement que la raison avancée alors.
 *
 * Le découpage est donc **conservé sans être nécessaire** : il fonctionne, il
 * coûte quelques écritures de plus à chaque rafraîchissement de jeton, et le
 * retirer ferait dépendre la connexion d'une mesure faite sur une seule
 * version. Le jour où quelqu'un voudra le supprimer, c'est cette mesure qu'il
 * faudra refaire — pas une relecture du commentaire d'origine, qui citait une
 * limite que le code n'applique plus.
 *
 * L'index du découpage est écrit **après les fragments**, et la clé de base n'est
 * purgée qu'**après lui**. Une version précédente de ce commentaire résumait
 * cela par « un enregistrement interrompu laisse une session illisible plutôt
 * qu'une session tronquée ». C'est faux, et de deux façons.
 *
 * D'abord, « illisible » est le mauvais mot pour le cas ordinaire : si la
 * session précédente tenait d'un seul tenant, la clé de base est encore là et
 * l'adhérent **reste connecté** — c'est un meilleur résultat que celui annoncé,
 * et c'est le seul intérêt de cet ordre. Ce que l'ordre achète, précisément,
 * c'est que la session précédente survit à toute la phase d'écriture des
 * fragments ; purger la clé de base plus tôt ouvrirait une fenêtre où ni l'index
 * ni la clé de base n'existent, donc une déconnexion silencieuse au milieu d'un
 * rafraîchissement de jeton.
 *
 * Ensuite, « plutôt qu'une session tronquée » attribue à l'ordre ce qui revient
 * à `getItem` : c'est la garde sur le fragment manquant qui transforme un
 * découpage incomplet en **absence**. L'ordre seul ne l'empêcherait pas — écrire
 * l'index avant les fragments, avec cette même garde, donne le même résultat.
 *
 * Les deux mécanismes sont donc conservés, et les points de coupure sont
 * énumérés par les tests plutôt que raisonnés : sur une sauvegarde donnée, la
 * relecture vaut la session précédente, ou rien, ou la nouvelle session
 * complète — jamais un texte partiel.
 *
 * Le web n'a pas de Keychain : on y retombe sur AsyncStorage, avec la limite
 * de sécurité que cela implique et qui est acceptable pour une cible de
 * développement.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

/** Interface attendue par Supabase (`SupportedStorage`), volontairement minimale. */
export interface KeyValueStorage {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
}

/**
 * Taille d'un fragment, exprimée en **unités UTF-16** — `String.length` — et non
 * en octets. La nuance n'est pas cosmétique : 1800 unités font jusqu'à 3600
 * octets pour du texte accentué, et 5400 pour du CJK. La marge sous les 2048
 * octets d'origine n'est donc tenue que parce que cette limite n'est plus
 * appliquée, ce qui est mesuré en tête de fichier. Le seul contenu non ASCII
 * d'une session est le nom affiché, borné à 80 caractères par la base, si bien
 * que l'écart reste théorique — mais il le deviendrait pour de mauvaises
 * raisons si quelqu'un rétablissait la limite sans relire cette ligne.
 */
const CHUNK_SIZE = 1800;

const CHUNK_COUNT_SUFFIX = '.__chunks';

function chunkKey(key: string, index: number): string {
  return `${key}.${index}`;
}

function chunkCountKey(key: string): string {
  return `${key}${CHUNK_COUNT_SUFFIX}`;
}

async function readChunkCount(key: string): Promise<number> {
  const raw = await SecureStore.getItemAsync(chunkCountKey(key));
  if (raw === null) {
    return 0;
  }
  const count = Number.parseInt(raw, 10);
  return Number.isInteger(count) && count > 0 ? count : 0;
}

async function clearChunks(key: string): Promise<void> {
  const count = await readChunkCount(key);
  for (let index = 0; index < count; index += 1) {
    await SecureStore.deleteItemAsync(chunkKey(key, index));
  }
  if (count > 0) {
    await SecureStore.deleteItemAsync(chunkCountKey(key));
  }
}

const secureStoreAdapter: KeyValueStorage = {
  async getItem(key) {
    const count = await readChunkCount(key);
    if (count === 0) {
      // Soit une valeur courte écrite d'un seul tenant, soit une session
      // enregistrée par une version antérieure du schéma : dans les deux cas,
      // la clé de base est la bonne source.
      return SecureStore.getItemAsync(key);
    }

    const parts: string[] = [];
    for (let index = 0; index < count; index += 1) {
      const part = await SecureStore.getItemAsync(chunkKey(key, index));
      if (part === null) {
        // Découpage incomplet : on préfère « pas de session » à « session
        // tronquée ». L'utilisateur se reconnecte, ce qui est réparable.
        return null;
      }
      parts.push(part);
    }
    return parts.join('');
  },

  async setItem(key, value) {
    await clearChunks(key);

    if (value.length <= CHUNK_SIZE) {
      await SecureStore.deleteItemAsync(chunkCountKey(key));
      await SecureStore.setItemAsync(key, value);
      return;
    }

    const count = Math.ceil(value.length / CHUNK_SIZE);
    for (let index = 0; index < count; index += 1) {
      const part = value.slice(index * CHUNK_SIZE, (index + 1) * CHUNK_SIZE);
      await SecureStore.setItemAsync(chunkKey(key, index), part);
    }

    // L'index en dernier : tant qu'il n'est pas écrit, `getItem` retombe sur la
    // clé de base. Celle-ci n'est **pas** encore purgée — `clearChunks` ne touche
    // qu'aux fragments et à l'index — donc un enregistrement interrompu laisse la
    // session **précédente**, complète et encore valable. Si cette précédente
    // valeur était elle-même découpée, la clé de base n'existe plus et `getItem`
    // renvoie `null` : dans les deux cas la connexion reste cohérente, jamais
    // tronquée, ce qui est le but de cet ordre.
    await SecureStore.setItemAsync(chunkCountKey(key), String(count));
    await SecureStore.deleteItemAsync(key);
  },

  async removeItem(key) {
    await clearChunks(key);
    await SecureStore.deleteItemAsync(key);
  },
};

const asyncStorageAdapter: KeyValueStorage = {
  getItem: (key) => AsyncStorage.getItem(key),
  setItem: (key, value) => AsyncStorage.setItem(key, value),
  removeItem: (key) => AsyncStorage.removeItem(key),
};

/** Stockage retenu par le client Supabase. */
export const authStorage: KeyValueStorage =
  Platform.OS === 'web' ? asyncStorageAdapter : secureStoreAdapter;
