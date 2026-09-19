/** Agenda — les dates importantes, lues par tous les adhérents. */

import { requireSupabase } from '@/config/supabase';
import { toAppError } from '@/errors';
import type { AgendaEvent } from '@/types/models';

const MAX_EVENTS = 200;

/**
 * Événements de l'agenda, du plus proche au plus lointain.
 *
 * L'ordre est **croissant** sur `start_at`, contrairement aux autres listes du
 * projet qui vont du plus récent au plus ancien : sur un agenda, ce qui compte
 * est ce qui vient. Les événements passés sont rendus plus bas par l'écran, et
 * un `order` décroissant les mettrait en tête, là où personne ne les cherche.
 *
 * Aucun filtre sur la date n'est posé ici : l'écran a besoin des deux — les
 * prochains rendez-vous, et ce qui vient d'avoir lieu. Filtrer en base
 * demanderait deux requêtes pour une seule liste.
 */
export async function fetchAgendaEvents(limit: number = MAX_EVENTS): Promise<AgendaEvent[]> {
  const { data, error } = await requireSupabase()
    .from('agenda_events')
    .select('*')
    .order('start_at', { ascending: true })
    .limit(limit);

  if (error !== null) {
    throw toAppError(error);
  }

  return data;
}
