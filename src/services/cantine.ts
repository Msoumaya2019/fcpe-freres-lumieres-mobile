/**
 * Cantine : les menus du jour et à venir.
 *
 * POURQUOI LA RÉSERVATION A DISPARU DE CE MODULE
 * ----------------------------------------------
 * L'écran proposait « Réserver », et ce bouton n'écrivait qu'une ligne dans
 * `cantine_reservations`. Il n'était relié à **aucun** service de restauration
 * scolaire : un parent qui appuyait croyait avoir réservé un repas, et rien
 * n'était commandé à personne. Le dégât n'est pas technique — c'est un enfant
 * sans repas, et un parent qui ne comprend pas pourquoi.
 *
 * Le module ne fait donc plus que ce que l'application sait faire réellement :
 * **consulter les menus**. La table `cantine_reservations` reste en place, avec
 * ses lignes et ses politiques : rien n'est supprimé, et le bureau peut encore
 * les consulter depuis le tableau de bord.
 */

import { requireSupabase } from '@/config/supabase';
import { toAppError } from '@/errors';
import type { CantineMenu } from '@/types/models';

const MAX_MENUS = 60;

/**
 * Date locale au format `AAAA-MM-JJ`.
 *
 * `Date.toISOString()` ne convient pas : il convertit en UTC, si bien qu'à
 * 00 h 30 heure française un menu du jour même serait considéré comme passé.
 * La colonne `service_date` est une date civile, pas un instant.
 */
function toIsoDate(date: Date): string {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Menus du jour et à venir, dans l'ordre chronologique.
 *
 * La lecture est bornée, et le tri est fait par le serveur : c'est la même
 * exigence que partout ailleurs — une lecture non bornée finit par être
 * tronquée par un plafond, et l'écran afficherait alors une semaine amputée
 * sans que rien ne le signale.
 */
export async function fetchUpcomingMenus(limit: number = MAX_MENUS): Promise<CantineMenu[]> {
  const { data, error } = await requireSupabase()
    .from('cantine_menus')
    .select('*')
    .gte('service_date', toIsoDate(new Date()))
    .order('service_date', { ascending: true })
    .limit(limit);

  if (error !== null) {
    throw toAppError(error);
  }

  return data;
}
