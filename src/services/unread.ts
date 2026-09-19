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
 *
 * LE COMPTE EST PUBLIÉ, PAS RECALCULÉ PAR CHAQUE ÉCRAN
 * ---------------------------------------------------
 * Trois endroits affichent ce nombre : la pastille de l'onglet « Plus », la
 * cloche de l'accueil, et la ligne « Discussion » de l'écran « Plus ». Chacun le
 * calculait pour son compte, à son propre moment — au montage pour les deux
 * premiers, au retour sur l'écran pour le troisième.
 *
 * Mesuré : après une lecture de la discussion, l'écran « Plus » affichait zéro
 * pendant que la pastille de l'onglet et la cloche annonçaient encore trois.
 * **Trois chiffres pour une seule vérité, dont deux faux** — et le plus visible
 * des trois était le faux, puisqu'il reste à l'écran sur les cinq onglets.
 *
 * Le compte vit donc ici, et il est publié à ses abonnés quand il change. Deux
 * événements le font changer : une relecture depuis le serveur, et la lecture de
 * la discussion, qui le remet à zéro **sans requête** — c'est le seul moment où
 * l'application sait quelque chose que le serveur ne lui a pas dit.
 *
 * Le compte est rangé **avec l'adhérent auquel il appartient**. Deux comptes sur
 * le même téléphone ne partagent pas leur lecture : sans cette clé, le second
 * verrait le chiffre du premier jusqu'à sa propre relecture — et indéfiniment si
 * celle-ci échoue.
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

/** Le compte publié, et l'adhérent auquel il se rapporte. */
let etat: { readonly userId: string; readonly nombre: number } = { userId: '', nombre: 0 };

const abonnes = new Set<() => void>();

/**
 * Le compte connu pour cet adhérent, ou zéro tant qu'il n'a pas été calculé.
 *
 * Zéro est la bonne valeur d'attente : un badge s'ajoute à l'écran, il ne s'y
 * affiche pas par défaut. Le calcul arrive ensuite et le fait apparaître s'il y
 * a lieu.
 */
export function compteNonLus(userId: string): number {
  return etat.userId === userId ? etat.nombre : 0;
}

/** Abonne une vue au compte. Rend la fonction qui l'en détache. */
export function abonnerAuCompte(abonne: () => void): () => void {
  abonnes.add(abonne);

  return () => {
    abonnes.delete(abonne);
  };
}

function publier(userId: string, nombre: number): void {
  if (etat.userId === userId && etat.nombre === nombre) {
    return;
  }

  etat = { userId, nombre };

  for (const abonne of abonnes) {
    abonne();
  }
}

/**
 * La relecture en vol, et pour quel adhérent.
 *
 * POURQUOI UNE SEULE À LA FOIS
 * ----------------------------
 * Les trois afficheurs montent ensemble, donc les trois demandent le compte au
 * même instant. Sans ce garde, l'ouverture de l'application enverrait **six**
 * requêtes au lieu de deux, pour une valeur identique. La clé d'adhérent est
 * comparée elle aussi : une relecture en vol pour l'adhérent précédent ne doit
 * pas répondre à la place du suivant.
 */
let enVol: { readonly userId: string; readonly promesse: Promise<void> } | null = null;

/**
 * Relit le compte et le publie. **Ne rejette jamais.**
 *
 * Un badge n'a aucune raison d'empêcher l'application de s'ouvrir, ni d'occuper
 * un écran d'erreur : en cas d'échec on garde le dernier compte connu. Cette
 * règle vivait recopiée chez chaque afficheur ; elle est ici, une fois.
 */
export function rafraichirNonLus(userId: string): Promise<void> {
  if (enVol !== null && enVol.userId === userId) {
    return enVol.promesse;
  }

  const promesse = compterMessagesNonLus(userId)
    .then((nombre) => {
      publier(userId, nombre);
    })
    .catch(() => {
      // Silencieux à dessein : voir le contrat ci-dessus.
    })
    .finally(() => {
      if (enVol?.promesse === promesse) {
        enVol = null;
      }
    });

  enVol = { userId, promesse };

  return promesse;
}

/**
 * Retient que la discussion a été lue jusqu'à ce message.
 *
 * `marque` est le `created_at` du message le plus récent affiché, ou `null` s'il
 * n'y a aucun message — auquel cas il n'y a rien à marquer, et écrire une valeur
 * inventée ferait disparaître les messages arrivés entre-temps.
 *
 * Le compte est remis à zéro ici, sans relire le serveur : l'écran vient
 * d'afficher la liste, et `compterMessagesNonLus` interroge **la même** liste,
 * avec la même borne. Une relecture donnerait donc zéro, au prix de deux
 * requêtes. Le cas contraire est un message arrivé pendant la lecture : il est
 * alors plus récent que la marque, et la prochaine relecture le comptera.
 */
export async function marquerDiscussionLue(userId: string, marque: string | null): Promise<void> {
  if (marque === null) {
    return;
  }

  await ecrirePreference(cleDerniereLectureDiscussion(userId), marque);
  publier(userId, 0);
}
