/** Signalements des adhérents — lus et écrits par leur seul auteur. */

import { requireSupabase } from '@/config/supabase';
import { toAppError } from '@/errors';
import type { Signalement, SignalementCategory } from '@/types/models';

const MAX_SIGNALEMENTS = 100;

export interface NewSignalement {
  readonly authorId: string;
  readonly category: SignalementCategory;
  readonly subject: string;
  readonly body: string;
}

/**
 * Signalements de l'utilisateur, du plus récent au plus ancien.
 *
 * Le filtre sur `author_id` est redondant avec la politique RLS, et c'est
 * volontaire : la politique empêche de lire les signalements des autres, le
 * filtre évite de les transférer pour rien. Une requête qui dépend d'une seule
 * des deux protections casse le jour où l'autre évolue.
 */
export async function fetchMySignalements(
  authorId: string,
  limit: number = MAX_SIGNALEMENTS,
): Promise<Signalement[]> {
  const { data, error } = await requireSupabase()
    .from('signalements')
    .select('*')
    .eq('author_id', authorId)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error !== null) {
    throw toAppError(error);
  }

  return data;
}

export async function createSignalement(input: NewSignalement): Promise<void> {
  const { error } = await requireSupabase().from('signalements').insert({
    author_id: input.authorId,
    category: input.category,
    subject: input.subject.trim(),
    body: input.body.trim(),
  });

  if (error !== null) {
    throw toAppError(error);
  }
}
