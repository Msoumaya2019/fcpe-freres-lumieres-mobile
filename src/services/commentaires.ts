/**
 * Commentaires sous une actualité, un sondage ou un jour de cantine — déposés
 * par les familles, publiés après validation.
 *
 * POURQUOI LE DÉPÔT EST OUVERT À TOUS
 * -----------------------------------
 * Un commentaire se dépose **sans compte**, avec la clé d'appareil — la même que
 * le vote d'un sondage. C'est ce qui rend la rubrique utile : la très grande
 * majorité des familles consulte l'application sans jamais créer de compte, et
 * une parole réservée aux adhérents aurait manqué ceux qu'elle visait.
 *
 * TROIS CIBLES, ET UN SEUL ENDROIT QUI LES CONNAÎT
 * ------------------------------------------------
 * Un commentaire se rattache à **une** cible, et à une seule : une actualité, un
 * sondage, ou un jour de cantine. La base le garantit par
 * `commentaires_une_seule_cible`, et TypeScript ne peut pas exprimer « exactement
 * un des trois » — il n'a pas d'union exclusive. Le type `CibleCommentaire`
 * ci-dessous porte donc la partie qu'il peut porter : **on ne peut pas appeler
 * ces fonctions sans dire sur quoi on commente**. Le reste est tenu par la base,
 * et mesuré par `scripts/check-commentaires.test.mjs`.
 *
 * `COLONNE_DE_LA_CIBLE` est le seul endroit qui traduit un type de cible en nom
 * de colonne. Une seconde table de correspondance ailleurs dans l'application
 * finirait par diverger, et l'écart se lirait à l'écran — un fil vide, jamais un
 * message.
 *
 * POURQUOI LA CANTINE SE COMMENTE PAR **JOUR**
 * --------------------------------------------
 * `cantine_menus` porte une contrainte d'unicité sur `service_date` : une ligne
 * **est** un jour. Un fil par semaine aurait mêlé le lundi et le vendredi, et
 * c'est exactement ce qu'un parent veut distinguer — « le jeudi, mon enfant est
 * allergique » ne se dit pas d'une semaine entière.
 *
 * CE QUE LE SERVEUR GARANTIT, ET QUE CE FICHIER NE PEUT PAS GARANTIR
 * ------------------------------------------------------------------
 * `commentaires_insert_public` impose, **en base**, trois choses que le code ne
 * pourrait pas tenir contre un client modifié :
 *
 *   - le commentaire naît `en_attente` : le statut ne vient pas du téléphone ;
 *   - `moderated_at` et `moderated_by` sont nuls à la naissance ;
 *   - la cible existe, et une actualité commentée **n'est pas un brouillon**.
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

/** Le nombre de commentaires affichés sous une cible. */
const MAX_COMMENTAIRES = 50;

/** Ce sur quoi un commentaire peut porter. Une seule cible à la fois. */
export type CibleCommentaire =
  | { readonly type: 'annonce'; readonly id: string }
  | { readonly type: 'sondage'; readonly id: string }
  | { readonly type: 'menu'; readonly id: string };

/** Les trois colonnes de rattachement, telles que la septième migration les crée. */
type ColonneCible = 'annonce_id' | 'sondage_id' | 'menu_id';

/** La traduction d'une cible en colonne — la seule du dépôt. */
const COLONNE_DE_LA_CIBLE: Readonly<Record<CibleCommentaire['type'], ColonneCible>> = {
  annonce: 'annonce_id',
  sondage: 'sondage_id',
  menu: 'menu_id',
};

/** Un commentaire à déposer. Le statut n'en fait pas partie : voir l'en-tête. */
export interface NouveauCommentaire {
  readonly cible: CibleCommentaire;
  readonly auteurNom: string;
  readonly corps: string;
}

/**
 * Le rattachement, écrit **en toutes lettres** — les trois colonnes, dont deux
 * valent `null`.
 *
 * POURQUOI NE PAS SE CONTENTER DE LA COLONNE UTILE
 * ------------------------------------------------
 * Écrire les trois rend l'invariant lisible à l'endroit où il est appliqué : un
 * commentaire porte exactement une cible. Une clé calculée (`[colonne]: id`)
 * ferait la même chose, et ne le dirait pas — et le jour où un client enverrait
 * deux cibles, la ligne fautive ne se relirait nulle part.
 */
function rattachement(cible: CibleCommentaire): Readonly<Record<ColonneCible, string | null>> {
  switch (cible.type) {
    case 'annonce':
      return { annonce_id: cible.id, sondage_id: null, menu_id: null };
    case 'sondage':
      return { annonce_id: null, sondage_id: cible.id, menu_id: null };
    case 'menu':
      return { annonce_id: null, sondage_id: null, menu_id: cible.id };
  }
}

/**
 * Les commentaires **publiés** d'une cible, du plus ancien au plus récent.
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
  cible: CibleCommentaire,
  limit: number = MAX_COMMENTAIRES,
): Promise<Commentaire[]> {
  const { data, error } = await requireSupabase()
    .from('commentaires')
    .select('*')
    .eq(COLONNE_DE_LA_CIBLE[cible.type], cible.id)
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

  const { error } = await requireSupabase()
    .from('commentaires')
    .insert({
      ...rattachement(input.cible),
      auteur_nom: input.auteurNom.trim(),
      corps: input.corps.trim(),
      voter_key: voterKey,
    });

  if (error !== null) {
    throw toAppError(error);
  }
}
