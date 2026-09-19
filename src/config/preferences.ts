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

/**
 * Clé de l'appareil, tirée par la base à la première demande.
 *
 * POURQUOI ELLE N'EST PAS TIRÉE ICI
 * ---------------------------------
 * React Native n'expose pas de générateur aléatoire cryptographique, et
 * `Math.random()` n'en est pas un. La fonction `cle_appareil()` la tire avec
 * `gen_random_uuid()`, côté serveur, et l'application la garde ensuite.
 *
 * Ce n'est pas un secret : elle ne donne accès à rien. La ranger dans
 * `AsyncStorage` — et non dans le trousseau — est donc le bon endroit.
 */
export const CLE_APPAREIL = 'appareil.cle';

/**
 * Le choix déposé par cet appareil sur un sondage.
 *
 * L'identifiant du sondage est dans la clé, comme celui de l'adhérent pour la
 * discussion : deux sondages ne se recouvrent donc pas, et relire un vote ne
 * demande pas de parcourir une liste.
 */
export function cleVoteSondage(sondageId: string): string {
  return `sondage.vote.${sondageId}`;
}

/**
 * Le secret d'une conversation, et son identifiant.
 *
 * C'est la **seule** façon de relire un fil : le serveur ne rend le secret qu'à
 * la création, et il n'en garde qu'une empreinte. Le perdre, c'est perdre
 * l'accès — d'où l'avertissement affiché sur l'écran de contact.
 */
export function cleConversation(): string {
  return 'contact.conversations';
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
