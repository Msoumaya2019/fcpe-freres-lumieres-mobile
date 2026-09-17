/**
 * Accès à la table `profiles`.
 *
 * Chaque fonction traduit l'erreur technique en `AppError` avant de la
 * propager : les écrans n'ont ainsi jamais à interpréter un message de
 * PostgreSQL, et le `catch` d'un écran se réduit à `appErrorMessage(error)`.
 */

import { requireSupabase } from '@/config/supabase';
import { toAppError } from '@/errors';
import type { Profile } from '@/types/models';

/** Profil de l'utilisateur connecté, ou `null` si la ligne n'existe pas encore. */
export async function fetchProfile(userId: string): Promise<Profile | null> {
  const { data, error } = await requireSupabase()
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .maybeSingle();

  if (error !== null) {
    throw toAppError(error);
  }

  return data;
}

/**
 * Noms d'affichage pour une liste d'identifiants.
 *
 * Une seule requête pour tous les auteurs d'une page, plutôt qu'une par
 * message : sur un fil de discussion, la différence est de l'ordre de la
 * trentaine d'allers-retours. Les identifiants sont dédoublonnés au passage,
 * un même membre écrivant souvent plusieurs messages.
 *
 * Un identifiant absent de la table `profiles` n'apparaît pas dans la table
 * retournée : c'est à l'appelant de choisir son libellé de repli.
 *
 * Ce cas n'est **pas atteignable avec le schéma actuel**, et c'est délibéré.
 * `discussion_messages.author_id` est `not null` et suit son profil en cascade,
 * donc un message sans auteur ne peut pas exister ; `annonces`, dont la colonne
 * est nullable, traite le cas explicitement de son côté. Le repli de
 * `discussion.ts` est une ceinture de sécurité, pas un chemin vivant. Le dire
 * évite qu'on croie la situation possible et qu'on rende la colonne nullable
 * « pour correspondre au code » — ce qui changerait ce qui survit à la
 * fermeture d'un compte, une décision qui appartient à SECURITY.md.
 */
export async function fetchAuthorNames(
  userIds: readonly string[],
): Promise<ReadonlyMap<string, string>> {
  const uniqueIds = [...new Set(userIds)];
  if (uniqueIds.length === 0) {
    return new Map();
  }

  const { data, error } = await requireSupabase()
    .from('profiles')
    .select('id, display_name')
    .in('id', uniqueIds);

  if (error !== null) {
    throw toAppError(error);
  }

  return new Map(data.map((row) => [row.id, row.display_name] as const));
}
