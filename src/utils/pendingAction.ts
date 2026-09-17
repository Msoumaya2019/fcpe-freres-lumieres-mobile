/**
 * Marqueur d'une action en cours, et la règle qui décide qu'elle l'est encore.
 *
 * POURQUOI CETTE RÈGLE EXISTE
 * ---------------------------
 * Un écran qui écrit puis relit son état serveur a deux temps : l'écriture
 * (l'insertion, la suppression) et la **relecture**. L'indicateur qui annonce
 * l'action doit couvrir les deux, sinon il s'arrête avant que le résultat soit
 * visible.
 *
 * Mesuré sur la réservation de cantine : `reload()` ne rend pas la main — il
 * déclenche une relecture — et le `finally` du gestionnaire relâchait donc le
 * marqueur avant que la liste revienne. Pendant tout l'aller-retour, l'écran
 * était **identique à ce qu'il était avant l'appui** : même libellé, aucun
 * indicateur, bouton actif. L'adhérent lisait « Réserver » sur un repas qu'il
 * venait de réserver et appuyait de nouveau ; l'insertion en double était
 * absorbée par la contrainte d'unicité, donc **aucun effet et aucun signe** que
 * son premier appui avait été accepté.
 *
 * LA RÈGLE
 * --------
 * L'action est en cours **tant que les données affichées sont celles qui
 * l'étaient au moment de l'appui**. C'est une comparaison de **référence**, et
 * elle suffit parce que `useAsyncData` produit un nouvel objet à chaque
 * chargement réussi : dès qu'une relecture atterrit, la référence change et
 * l'indicateur s'éteint. Aucune valeur n'est comparée, donc aucune supposition
 * sur ce que le serveur va renvoyer.
 *
 * Trois conséquences voulues :
 *
 *   - une relecture **en échec** relâche le marqueur (`status === 'error'`) :
 *     `data` conserve alors sa référence, et sans cette branche l'indicateur
 *     tournerait indéfiniment ;
 *   - une insertion absorbée par la contrainte d'unicité reste couverte par
 *     l'indicateur, puisqu'elle est suivie d'une relecture comme les autres ;
 *   - un chargeur qui **mémoïserait** son résultat casserait le signal — la
 *     référence ne changerait plus. C'est la seule condition de validité de ce
 *     module, et elle est écrite ici pour ne pas être découverte par surprise.
 */

import type { AsyncStatus } from '@/hooks/useAsyncData';

export interface PendingAction<T> {
  /** Ce sur quoi l'action porte. */
  readonly target: T;
  /** Les données affichées quand l'action a été déclenchée. */
  readonly dataAtPress: unknown;
}

/**
 * La cible de l'action encore en cours, ou `null`.
 *
 * `currentData` est la donnée **chargée** — celle que l'écran affiche, jamais
 * une valeur devinée localement.
 */
export function pendingTarget<T>(
  action: PendingAction<T> | null,
  status: AsyncStatus,
  currentData: unknown,
): T | null {
  if (action === null || status === 'error') {
    return null;
  }

  return action.dataAtPress === currentData ? action.target : null;
}
