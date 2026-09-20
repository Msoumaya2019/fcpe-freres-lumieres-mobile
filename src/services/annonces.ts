/** Annonces publiées par le bureau de l'association. */

import { requireSupabase } from '@/config/supabase';
import { toAppError } from '@/errors';
import { fetchAuthorNames } from '@/services/profiles';
import type { Annonce, AnnonceWithAuthor } from '@/types/models';

const DEFAULT_LIMIT = 30;

/**
 * Les noms d'auteurs d'un lot de lignes, résolus en une requête.
 *
 * Une seule requête groupée pour tout un écran, et non une par annonce : c'est
 * ce que faisait la version précédente, et l'accueil affichait trois annonces
 * pour trois allers-retours.
 *
 * Le nom est résolu par une seconde requête plutôt que par un `select` imbriqué
 * de PostgREST : ce dernier dépend des métadonnées de clés étrangères, dont une
 * divergence avec `src/types/database.ts` ne se verrait qu'à l'exécution.
 */
async function avecAuteurs(rows: readonly Annonce[]): Promise<AnnonceWithAuthor[]> {
  const authorNames = await fetchAuthorNames(
    rows.flatMap((row) => (row.author_id === null ? [] : [row.author_id])),
  );

  return rows.map((row) => ({
    ...row,
    authorName: row.author_id === null ? null : (authorNames.get(row.author_id) ?? null),
  }));
}

/** Annonces les plus récentes d'abord. */
export async function fetchAnnonces(limit: number = DEFAULT_LIMIT): Promise<AnnonceWithAuthor[]> {
  const { data, error } = await requireSupabase()
    .from('annonces')
    .select('*')
    .order('published_at', { ascending: false })
    .limit(limit);

  if (error !== null) {
    throw toAppError(error);
  }

  return await avecAuteurs(data);
}

/**
 * Une annonce, par son identifiant — pour l'écran qui la montre entière.
 *
 * `maybeSingle()` et non `single()` : `single()` lève une erreur quand la ligne
 * n'existe pas, et l'écran annoncerait « lecture impossible » pour une annonce
 * simplement retirée entre l'affichage de la liste et l'appui. `null` dit la
 * même chose sans faire passer une absence pour une panne — la distinction que
 * ce dépôt tient partout ailleurs.
 */
export async function fetchAnnonce(id: string): Promise<AnnonceWithAuthor | null> {
  const { data, error } = await requireSupabase()
    .from('annonces')
    .select('*')
    .eq('id', id)
    .maybeSingle();

  if (error !== null) {
    throw toAppError(error);
  }

  if (data === null) {
    return null;
  }

  const [annonce] = await avecAuteurs([data]);
  return annonce ?? null;
}
