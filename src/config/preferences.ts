/**
 * Préférences locales, non secrètes.
 *
 * DISTINCTES DU STOCKAGE D'AUTHENTIFICATION
 * -----------------------------------------
 * `src/config/storage.ts` garde la session, et passe par `SecureStore` sur
 * téléphone. Ce fichier-ci garde ce qui n'a rien de confidentiel — la date de
 * dernière consultation d'une rubrique — et passe par `AsyncStorage`, qui n'a
 * pas la limite de taille de `SecureStore` ni son coût.
 *
 * Mettre une date de lecture dans le trousseau serait un détournement : le
 * trousseau protège des secrets, et y ranger autre chose brouille ce qui est
 * réellement sensible. À l'inverse, une session n'a rien à faire ici.
 *
 * Le préfixe isole les clés de l'application de celles qu'une autre bibliothèque
 * pourrait écrire dans le même magasin.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

const PREFIXE = 'fcpe.';

/**
 * Clé de la dernière consultation de la discussion, par adhérent.
 *
 * L'identifiant est dans la clé, et non dans la valeur : deux comptes sur le
 * même téléphone ne partagent donc pas leur marque de lecture. Sans cela, se
 * connecter avec un second compte effacerait le badge du premier — et le premier
 * ne verrait plus ce qu'il n'a pas lu.
 */
export function cleDerniereLectureDiscussion(userId: string): string {
  return `discussion.lu.${userId}`;
}

export async function lirePreference(cle: string): Promise<string | null> {
  return AsyncStorage.getItem(PREFIXE + cle);
}

export async function ecrirePreference(cle: string, valeur: string): Promise<void> {
  await AsyncStorage.setItem(PREFIXE + cle, valeur);
}

/**
 * Toutes les clés écrites par l'application, et elles seules.
 *
 * Le filtre porte sur le préfixe, et il est nécessaire : `AsyncStorage` est
 * partagé avec toute bibliothèque qui l'emploierait. Un `clear()` effacerait
 * aussi ce qui n'appartient pas à cette application, et le défaut ne se verrait
 * que chez quelqu'un d'autre.
 */
export async function clesDeLApplication(): Promise<readonly string[]> {
  const cles = await AsyncStorage.getAllKeys();

  return cles.filter((cle) => cle.startsWith(PREFIXE));
}

/**
 * Efface les préférences locales.
 *
 * CE QUE CETTE ACTION NE FAIT PAS, ET C'EST LE POINT
 * -------------------------------------------------
 * Elle **ne déconnecte pas** : la session vit dans `SecureStore`, pas ici, et
 * c'est délibéré — le trousseau protège des secrets, ce magasin-ci garde des
 * dates de lecture. Les confondre ferait de l'effacement des préférences une
 * déconnexion, ce que personne n'attend.
 *
 * Elle n'efface rien en base non plus. Ce qu'elle remet à zéro est ce que
 * l'appareil retient : les marques de lecture, donc les badges de messages non
 * lus, qui réapparaissent.
 */
export async function effacerPreferences(): Promise<void> {
  const cles = await clesDeLApplication();

  if (cles.length === 0) {
    return;
  }

  await AsyncStorage.multiRemove([...cles]);
}
