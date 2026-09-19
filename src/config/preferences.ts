/**
 * Préférences locales — ce que l'application retient sur le téléphone.
 *
 * DISTINCTES DU STOCKAGE D'AUTHENTIFICATION
 * -----------------------------------------
 * `src/config/storage.ts` garde la session, et passe par `SecureStore` sur
 * téléphone. Ce fichier-ci garde le reste, et passe par `AsyncStorage`, qui n'a
 * pas la limite de taille de `SecureStore` ni son coût.
 *
 * QUATRE FAMILLES DE CLÉS, UNE SEULE EST UNE PRÉFÉRENCE
 * -----------------------------------------------------
 * Le préfixe `fcpe.` isole ces clés de celles qu'une autre bibliothèque
 * écrirait dans le même magasin. Il ne dit pas qu'elles se ressemblent :
 *
 *   `discussion.lu.*`        une **marque de lecture**. Elle se recalcule, et
 *                            la remettre à zéro est un effet visible — c'est
 *                            la **seule** chose que « Effacer » efface.
 *   `appareil.cle`           la clé de vote de cet appareil. C'est ce qui
 *                            empêche de voter deux fois : l'effacer ne
 *                            remettrait pas un réglage à zéro, cela **lèverait
 *                            une limite**. Elle ne se remet pas à zéro depuis
 *                            un écran de réglages.
 *   `sondage.vote.*`         le vote que cet appareil a déposé. L'effacer
 *                            reproposerait de voter, et le serveur refuserait
 *                            le doublon — un bouton qui mène à un refus.
 *   `contact.conversations`  le **secret** de chaque conversation ouverte avec
 *                            le bureau. Le serveur n'en garde qu'une empreinte,
 *                            et ne le rend qu'à la création : c'est l'**unique
 *                            copie**. L'effacer, c'est perdre l'accès au fil
 *                            **définitivement** — là où un parent signale
 *                            parfois une situation personnelle.
 *
 * D'où la règle que tient ce module : **l'effacement emporte ce qui se recrée,
 * jamais ce qui ne se recrée pas.** Il portait auparavant sur toutes les clés du
 * préfixe, et il détruisait donc en silence la seule copie des conversations
 * avec le bureau — sous un libellé qui parlait de badges de messages non lus.
 * `scripts/check-effacement.test.mjs` exerce les quatre familles à la fois.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

const PREFIXE = 'fcpe.';

/** La famille des marques de lecture, isolée pour que la clé et l'effacement s'accordent. */
const FAMILLE_MARQUES = 'discussion.lu.';

/**
 * Clé de la dernière consultation de la discussion, par adhérent.
 *
 * L'identifiant est dans la clé, et non dans la valeur : deux comptes sur le
 * même téléphone ne partagent donc pas leur marque de lecture. Sans cela, se
 * connecter avec un second compte effacerait le badge du premier — et le premier
 * ne verrait plus ce qu'il n'a pas lu.
 */
export function cleDerniereLectureDiscussion(userId: string): string {
  return `${FAMILLE_MARQUES}${userId}`;
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
 * l'accès — d'où l'avertissement affiché sur l'écran de contact, et d'où le fait
 * que l'effacement des préférences n'y touche pas.
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
 * Efface les marques de lecture de la discussion — et **rien d'autre**.
 *
 * Le filtre porte sur la famille des marques, et non sur le préfixe entier.
 * C'est la propriété que tient le banc : ce qui est effacé se recalcule, ce qui
 * ne se recalcule pas reste. Les trois autres familles sont nommées dans
 * l'en-tête de ce fichier, avec la raison de chacune.
 *
 * Le filtre reste nécessaire même réduit à une famille : `AsyncStorage` est
 * partagé avec toute bibliothèque qui l'emploierait, et un `clear()` effacerait
 * aussi ce qui ne vient pas de cette application.
 */
export async function effacerMarquesDeLecture(): Promise<void> {
  const cles = await AsyncStorage.getAllKeys();
  const marques = cles.filter((cle) => cle.startsWith(PREFIXE + FAMILLE_MARQUES));

  if (marques.length === 0) {
    return;
  }

  await AsyncStorage.multiRemove([...marques]);
}
