/**
 * Commentaires sous une actualité — déposés par les familles, publiés après
 * validation.
 *
 * POURQUOI LE DÉPÔT EST OUVERT À TOUS
 * -----------------------------------
 * Un commentaire se dépose **sans compte**, avec la clé d'appareil — la même que
 * le vote d'un sondage. C'est ce qui rend la rubrique utile : la très grande
 * majorité des familles consulte l'application sans jamais créer de compte, et
 * une parole réservée aux adhérents aurait manqué ceux qu'elle visait.
 *
 * CE QUE LE SERVEUR GARANTIT, ET QUE CE FICHIER NE PEUT PAS GARANTIR
 * ------------------------------------------------------------------
 * `commentaires_insert_public` impose, **en base**, trois choses que le code ne
 * pourrait pas tenir contre un client modifié :
 *
 *   - le commentaire naît `en_attente` : le statut ne vient pas du téléphone ;
 *   - `moderated_at` et `moderated_by` sont nuls à la naissance ;
 *   - l'actualité commentée existe **et n'est pas un brouillon**.
 *
 * La fonction ci-dessous n'écrit donc pas `statut` : le poser ici laisserait
 * croire que c'est lui qui décide, alors qu'un client modifié qui écrirait
 * `'publie'` serait refusé par la politique, et non par ce code.
 *
 * POURQUOI LA LECTURE N'EST PAS FILTRÉE PAR AUTEUR
 * ------------------------------------------------
 * `voter_key` désigne un **appareil**, pas une personne : il ne peut pas être
 * comparé à `auth.uid()`. Une politique qui prétendrait rendre à son auteur son
 * commentaire en attente n'autoriserait rien de ce qu'elle annonce. L'écran dit
 * donc ce qui se passe — « sera publié après validation » — au lieu de promettre
 * une relecture qui n'existe pas.
 */

import { requireSupabase } from '@/config/supabase';
import { toAppError } from '@/errors';
import { cleAppareil } from '@/services/sondages';
import type { Commentaire } from '@/types/models';

/** Le nombre de commentaires affichés sous un article. */
const MAX_COMMENTAIRES = 50;

/** Un commentaire à déposer. Le statut n'en fait pas partie : voir l'en-tête. */
export interface NouveauCommentaire {
  readonly annonceId: string;
  readonly auteurNom: string;
  readonly corps: string;
}

/**
 * Les commentaires **publiés** d'une actualité, du plus ancien au plus récent.
 *
 * L'ordre est celui d'une conversation : on lit ce qui a été dit avant de
 * répondre. C'est l'inverse de la liste des actualités, et c'est voulu.
 *
 * Le filtre `statut = 'publie'` est écrit **aussi** ici, bien que la politique
 * de lecture le pose déjà. Le doublon est délibéré : un `select` refusé par la
 * politique rend une **liste vide sans erreur**, et le filtre explicite rend le
 * code lisible par quelqu'un qui ne lit pas le SQL. Il ne protège rien, il
 * explique.
 */
export async function fetchCommentaires(
  annonceId: string,
  limit: number = MAX_COMMENTAIRES,
): Promise<Commentaire[]> {
  const { data, error } = await requireSupabase()
    .from('commentaires')
    .select('*')
    .eq('annonce_id', annonceId)
    .eq('statut', 'publie')
    .order('created_at', { ascending: true })
    .limit(limit);

  if (error !== null) {
    throw toAppError(error);
  }

  return data;
}

/**
 * Déposer un commentaire, qui part **en attente de validation**.
 *
 * La clé d'appareil est tirée avant l'insertion, comme pour un vote : elle est
 * lue dans les préférences, et la base la tire à la première demande. Elle sert
 * à reconnaître un envoi répété depuis le même téléphone, jamais à identifier
 * une personne — et elle n'est pas un secret, elle ne donne accès à rien.
 */
export async function publierCommentaire(input: NouveauCommentaire): Promise<void> {
  const voterKey = await cleAppareil();

  const { error } = await requireSupabase().from('commentaires').insert({
    annonce_id: input.annonceId,
    auteur_nom: input.auteurNom.trim(),
    corps: input.corps.trim(),
    voter_key: voterKey,
  });

  if (error !== null) {
    throw toAppError(error);
  }
}
