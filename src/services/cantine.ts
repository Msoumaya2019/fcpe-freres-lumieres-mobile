/**
 * Cantine : menus à venir et réservations.
 *
 * Une réservation appartient à son auteur : les politiques RLS garantissent
 * qu'un membre ne voit et ne modifie que les siennes, sans que le code client
 * ait à filtrer. Le filtre explicite est conservé pour dire l'intention, mais
 * **ce n'est pas lui qui borne la lecture** — voir `fetchReservedMenuIds`.
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

/**
 * Identifiants des menus déjà réservés par l'utilisateur, **parmi ceux qu'on
 * affiche**.
 *
 * LA BORNE EST LE PARAMÈTRE, ET C'EST DÉLIBÉRÉ
 * --------------------------------------------
 * Cette fonction lisait autrefois *toutes* les réservations de l'adhérent,
 * filtrées par `user_id`. La lecture grandissait donc avec le temps — une
 * réservation par jour de cantine, pour toujours — alors que l'écran n'en
 * utilise que les menus affichés. Deux conséquences, et la seconde est un
 * défaut :
 *
 *   - la réponse transférait un historique entier pour n'en garder quelques
 *     lignes, ce que le commentaire d'en-tête du module prétendait déjà éviter ;
 *   - surtout, une lecture non bornée **finit par être tronquée** par un
 *     plafond du serveur. Une réservation tombée hors de la page fait alors
 *     dire « Réserver » au bouton d'un repas déjà réservé ; l'appui insère, la
 *     contrainte d'unicité absorbe le doublon **en silence**, la relecture
 *     relit la même page tronquée, et le libellé ne change pas. Le bouton ne
 *     fait rien, indéfiniment, sans un mot.
 *
 * Borner par les identifiants affichés rend la lecture exacte : elle vaut au
 * plus la taille de la liste, elle-même bornée par `MAX_MENUS`. C'est la même
 * forme que `fetchAuthorNames`, qui dédoublonne et sort tôt sur liste vide.
 */
export async function fetchReservedMenuIds(
  userId: string,
  menuIds: readonly string[],
): Promise<readonly string[]> {
  const uniqueIds = [...new Set(menuIds)];
  if (uniqueIds.length === 0) {
    return [];
  }

  const { data, error } = await requireSupabase()
    .from('cantine_reservations')
    .select('menu_id')
    .eq('user_id', userId)
    .in('menu_id', uniqueIds);

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
