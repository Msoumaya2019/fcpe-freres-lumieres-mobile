/**
 * Cantine : menus à venir et réservations.
 *
 * Une réservation appartient à son auteur : les politiques RLS garantissent
 * qu'un membre ne voit et ne modifie que les siennes, sans que le code client
 * ait à filtrer (il filtre quand même, pour ne pas transférer des lignes
 * inutiles).
 */

import { requireSupabase } from '@/config/supabase';
import { toAppError } from '@/errors';
import type { CantineMenu } from '@/types/models';

const MAX_MENUS = 60;

/** Code PostgreSQL d'une violation de contrainte d'unicité. */
const UNIQUE_VIOLATION = '23505';

function isUniqueViolation(error: { code?: string }): boolean {
  return error.code === UNIQUE_VIOLATION;
}

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

/** Menus du jour et à venir, dans l'ordre chronologique. */
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

/** Identifiants des menus déjà réservés par l'utilisateur. */
export async function fetchReservedMenuIds(userId: string): Promise<readonly string[]> {
  const { data, error } = await requireSupabase()
    .from('cantine_reservations')
    .select('menu_id')
    .eq('user_id', userId);

  if (error !== null) {
    throw toAppError(error);
  }

  return data.map((row) => row.menu_id);
}

/** Pose ou retire une réservation. */
export async function setReservation(
  userId: string,
  menuId: string,
  reserved: boolean,
): Promise<void> {
  const client = requireSupabase();

  if (reserved) {
    const { error } = await client
      .from('cantine_reservations')
      .insert({ menu_id: menuId, user_id: userId });

    // Deux appuis rapides produisent deux insertions : la seconde viole la
    // contrainte d'unicité. L'intention de l'utilisateur est satisfaite, il n'y
    // a donc rien à lui signaler.
    if (error !== null && !isUniqueViolation(error)) {
      throw toAppError(error);
    }
    return;
  }

  const { error } = await client
    .from('cantine_reservations')
    .delete()
    .eq('menu_id', menuId)
    .eq('user_id', userId);

  if (error !== null) {
    throw toAppError(error);
  }
}
