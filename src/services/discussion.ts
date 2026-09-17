/**
 * Discussion entre membres — un salon unique.
 *
 * Ce choix est assumé pour la première version : un salon unique couvre le
 * besoin (« poser une question, avoir une réponse ») avec un écran et une
 * table. Passer à des fils thématiques demandera une colonne `thread_id`, une
 * seconde table, et un écran de détail — c'est une évolution, pas une
 * réécriture, à condition de ne pas figer dès maintenant une hiérarchie que
 * personne n'a encore demandée.
 */

import { requireSupabase } from '@/config/supabase';
import { toAppError } from '@/errors';
import { fetchAuthorNames } from '@/services/profiles';
import type { DiscussionMessageWithAuthor } from '@/types/models';

const DEFAULT_LIMIT = 60;

/**
 * Libellé d'un message dont l'auteur ne serait pas résolu.
 *
 * Avec le schéma actuel, ce cas n'arrive pas : `discussion_messages.author_id`
 * est `not null` et suit son profil en cascade, donc tout message a un auteur
 * lisible. Ce n'est pas un chemin vivant — il le deviendrait si la colonne
 * passait à `on delete set null`, comme celle d'`annonces`. Le garder est une
 * ceinture de sécurité ; le prendre pour un cas réel ne le serait pas, et
 * `SECURITY.md` documente au contraire l'effacement en cascade.
 */
const UNKNOWN_AUTHOR = 'Membre';

/**
 * Derniers messages, du plus récent au plus ancien.
 *
 * L'ordre décroissant est celui attendu par une `FlatList` inversée, qui
 * ancre naturellement l'affichage en bas de l'écran — la position d'un salon
 * de discussion. Trier côté serveur plutôt qu'en mémoire garantit que ce sont
 * bien les derniers messages qui remontent, même au-delà de la limite.
 */
export async function fetchDiscussionMessages(
  limit: number = DEFAULT_LIMIT,
): Promise<DiscussionMessageWithAuthor[]> {
  const { data, error } = await requireSupabase()
    .from('discussion_messages')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error !== null) {
    throw toAppError(error);
  }

  const authorNames = await fetchAuthorNames(data.map((row) => row.author_id));

  return data.map((row) => ({
    ...row,
    authorName: authorNames.get(row.author_id) ?? UNKNOWN_AUTHOR,
  }));
}

export async function postDiscussionMessage(authorId: string, body: string): Promise<void> {
  const trimmed = body.trim();
  if (trimmed === '') {
    return;
  }

  const { error } = await requireSupabase()
    .from('discussion_messages')
    .insert({ author_id: authorId, body: trimmed });

  if (error !== null) {
    throw toAppError(error);
  }
}
