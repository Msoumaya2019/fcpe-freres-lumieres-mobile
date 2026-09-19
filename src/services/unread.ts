/**
 * Messages de discussion non lus, pour le badge de l'accueil et de « Plus ».
 *
 * POURQUOI UNE MARQUE LOCALE, ET NON UNE COLONNE EN BASE
 * ------------------------------------------------------
 * Savoir ce qui est « non lu » demande de retenir **jusqu'où** chaque adhérent a
 * lu. Le faire en base ajouterait une table, une politique et une écriture par
 * ouverture d'écran — donc une requête de plus à chaque consultation, pour une
 * information qui n'a de valeur que sur le téléphone qui l'affiche.
 *
 * La marque vit donc dans les préférences locales, et elle est **par adhérent** :
 * deux comptes sur le même téléphone ne partagent pas leur lecture.
 *
 * CE QU'ELLE NE FAIT PAS
 * ----------------------
 * Elle ne se synchronise pas entre deux téléphones. Un adhérent qui lit la
 * discussion sur sa tablette verra encore le badge sur son téléphone. C'est
 * assumé : l'alternative est une table de lecture par adhérent et par rubrique,
 * pour un badge.
 *
 * La marque est le `created_at` du message le plus récent **vu**, et non l'heure
 * de l'appareil. Deux raisons : rien n'est généré côté client, donc l'horloge du
 * téléphone n'entre pas dans la comparaison ; et la marque est exactement l'une
 * des valeurs comparées, ce qui rend l'égalité stricte possible.
 */

import {
  cleDerniereLectureDiscussion,
  ecrirePreference,
  lirePreference,
} from '@/config/preferences';
import { fetchDiscussionMessages } from '@/services/discussion';

/**
 * Nombre de messages écrits par d'autres et plus récents que la marque.
 *
 * Les messages de l'adhérent lui-même ne comptent jamais : il les a écrits, il
 * les a lus. Les compter ferait apparaître un badge à chaque fois qu'on prend la
 * parole, ce qui est l'inverse de ce qu'un badge doit signaler.
 */
export async function compterMessagesNonLus(userId: string): Promise<number> {
  const marque = await lirePreference(cleDerniereLectureDiscussion(userId));
  const messages = await fetchDiscussionMessages();

  return messages.filter(
    (message) => message.author_id !== userId && (marque === null || message.created_at > marque),
  ).length;
}

/**
 * Retient que la discussion a été lue jusqu'à ce message.
 *
 * `marque` est le `created_at` du message le plus récent affiché, ou `null` s'il
 * n'y a aucun message — auquel cas il n'y a rien à marquer, et écrire une valeur
 * inventée ferait disparaître les messages arrivés entre-temps.
 */
export async function marquerDiscussionLue(userId: string, marque: string | null): Promise<void> {
  if (marque === null) {
    return;
  }

  await ecrirePreference(cleDerniereLectureDiscussion(userId), marque);
}
