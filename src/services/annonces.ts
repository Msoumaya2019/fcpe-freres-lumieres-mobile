/** Annonces publiées par le bureau de l'association. */

import { requireSupabase } from '@/config/supabase';
import { toAppError } from '@/errors';
import { documentsUrls } from '@/services/documents';
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
 * Les photos d'un lot d'actualités, indexées par identifiant d'actualité.
 *
 * POURQUOI ELLE VIT ICI, ET NON DANS LA CARTE
 * -------------------------------------------
 * `annonces.image_path` porte un **chemin dans le compartiment**, pas une
 * adresse : le compartiment est privé, et afficher la photo demande une adresse
 * signée. Signer depuis la carte ferait autant de requêtes que de cartes — dix
 * actualités, dix allers-retours, tous au même instant. C'est donc l'**écran**
 * qui signe, une fois, pour toute sa liste, et qui passe le résultat à chaque
 * carte. Le service sait ce qu'est une actualité ; la carte, elle, ne sait que
 * peindre ce qu'on lui donne.
 *
 * DEUX TABLES PLUTÔT QU'UNE SEULE
 * -------------------------------
 * Le chemin est dédoublonné avant signature — deux actualités qui partagent une
 * photo ne la font signer qu'une fois —, et le résultat est ensuite **retourné**
 * par identifiant d'actualité. Rendre la table des chemins obligerait chaque
 * appelant à refaire cette seconde correspondance, et c'est exactement le genre
 * de recopie qui diverge en silence.
 *
 * UNE PHOTO QU'ON NE PEUT PAS SIGNER N'EST PAS UNE PANNE
 * ------------------------------------------------------
 * Fichier retiré du compartiment, politique absente, réseau coupé : dans les
 * trois cas l'actualité reste parfaitement lisible, et sa carte montre alors
 * l'illustration de sa catégorie. Faire échouer la page entière pour une
 * vignette serait le pire des arbitrages — c'est déjà la décision prise par
 * l'écran d'article, qui affiche le texte même quand sa photo manque.
 */
export async function photosDesAnnonces(
  annonces: readonly Annonce[],
): Promise<ReadonlyMap<string, string>> {
  const chemins = [
    ...new Set(
      annonces.flatMap((annonce) => (annonce.image_path === null ? [] : [annonce.image_path])),
    ),
  ];

  if (chemins.length === 0) {
    return new Map();
  }

  let adresses: ReadonlyMap<string, string>;

  try {
    adresses = await documentsUrls(chemins);
  } catch {
    return new Map();
  }

  const parAnnonce = new Map<string, string>();

  for (const annonce of annonces) {
    const adresse = annonce.image_path === null ? undefined : adresses.get(annonce.image_path);

    if (adresse !== undefined) {
      parAnnonce.set(annonce.id, adresse);
    }
  }

  return parAnnonce;
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
