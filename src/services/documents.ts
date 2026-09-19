/** Documents utiles aux familles — métadonnées, le fichier vit dans Storage. */

import { requireSupabase } from '@/config/supabase';
import { toAppError } from '@/errors';
import type { DocumentFile } from '@/types/models';

const MAX_DOCUMENTS = 100;

/** Documents publiés, du plus récent au plus ancien. */
export async function fetchDocuments(limit: number = MAX_DOCUMENTS): Promise<DocumentFile[]> {
  const { data, error } = await requireSupabase()
    .from('documents')
    .select('*')
    .order('published_at', { ascending: false })
    .limit(limit);

  if (error !== null) {
    throw toAppError(error);
  }

  return data;
}

/**
 * Adresse publique d'un document.
 *
 * Le bucket est **privé**, et c'est la politique de la table `documents` qui
 * réserve la liste aux adhérents. Un lien public rendrait cette politique
 * décorative : le fichier resterait lisible par quiconque possède son adresse.
 *
 * D'où une adresse **signée**, valable une heure. Elle n'est pas devinable, et
 * elle expire — ce qui laisse le temps d'ouvrir un PDF, sans laisser derrière
 * soi un lien qui fonctionne encore dans six mois.
 *
 * Une heure est un compromis assumé : assez pour lire un document, trop court
 * pour qu'un lien partagé survive à la journée.
 */
export async function documentUrl(storagePath: string): Promise<string> {
  const { data, error } = await requireSupabase()
    .storage.from('documents')
    .createSignedUrl(storagePath, 3600);

  if (error !== null) {
    throw toAppError(error);
  }

  return data.signedUrl;
}
