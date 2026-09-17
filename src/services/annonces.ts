/** Annonces publiées par le bureau de l'association. */

import { requireSupabase } from '@/config/supabase';
import { toAppError } from '@/errors';
import { fetchAuthorNames } from '@/services/profiles';
import type { AnnonceWithAuthor } from '@/types/models';

const DEFAULT_LIMIT = 30;

/**
 * Annonces les plus récentes d'abord.
 *
 * Les noms d'auteurs sont résolus par une seconde requête groupée plutôt que
 * par un `select` imbriqué de PostgREST : ce dernier dépend des métadonnées de
 * clés étrangères, dont une divergence avec `src/types/database.ts` ne se
 * verrait qu'à l'exécution.
 */
export async function fetchAnnonces(limit: number = DEFAULT_LIMIT): Promise<AnnonceWithAuthor[]> {
  const { data, error } = await requireSupabase()
    .from('annonces')
    .select('*')
    .order('published_at', { ascending: false })
    .limit(limit);

  if (error !== null) {
    throw toAppError(error);
  }

  const authorNames = await fetchAuthorNames(
    data.flatMap((row) => (row.author_id === null ? [] : [row.author_id])),
  );

  return data.map((row) => ({
    ...row,
    authorName: row.author_id === null ? null : (authorNames.get(row.author_id) ?? null),
  }));
}
