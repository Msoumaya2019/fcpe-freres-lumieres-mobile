/**
 * Accès à la table `profiles`.
 *
 * Chaque fonction traduit l'erreur technique en `AppError` avant de la
 * propager : les écrans n'ont ainsi jamais à interpréter un message de
 * PostgreSQL, et le `catch` d'un écran se réduit à `appErrorMessage(error)`.
 */

import { requireSupabase } from '@/config/supabase';
import { toAppError } from '@/errors';
import type { MemberStatus, Profile } from '@/types/models';

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
 * retournée : c'est à l'appelant de choisir son libellé de repli. **Et sans
 * jeton, la table est vide** — le nom est un ornement, l'actualité est le
 * contenu ; voir le commentaire de la fonction.
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

  //  SANS JETON, LA QUESTION N'A PAS DE DESTINATAIRE
  //  ------------------------------------------------
  //  `profiles` n'est lisible que par un **porteur de jeton** : le rôle anonyme
  //  y est refusé (`42501 permission denied`, mesuré le 20 septembre 2026 avec
  //  la seule clef publique).
  //
  //  Ce qui se produisait alors n'était pas une absence de nom, c'était **la
  //  page entière qui tombait** : la requête refusée levait, l'erreur remontait
  //  jusqu'au chargeur de l'écran, et un visiteur lisait « Vous n'avez pas les
  //  droits nécessaires pour cette action » à la place des actualités. Le
  //  défaut ne se voyait que sans compte — c'est-à-dire dans le seul mode que
  //  l'équipe ne teste jamais en étant connectée.
  //
  //  DEUX BARRIÈRES SE SUCCÈDENT, ELLES NE SE REMPLACENT PAS
  //  ------------------------------------------------------
  //  La première est **en amont** : le chemin des actualités ne passe plus ici.
  //  Une actualité est signée « Membre de parents d'élèves », une constante, et
  //  `annonces.ts` ne lit donc plus `profiles` du tout. C'est la correction de
  //  fond — le défaut ne peut plus se reproduire, puisqu'il n'y a plus de
  //  requête à refuser.
  //
  //  La seconde est cette garde, et elle couvre ce qui reste : `fetchAuthorNames`
  //  est aujourd'hui appelée par la **discussion collective**, dont l'écran rend
  //  « Réservé aux adhérents » avant de charger quoi que ce soit. La garde n'y
  //  est donc jamais franchie par un visiteur — et c'est bien pourquoi elle
  //  reste : elle protège la **fonction**, pas l'écran d'aujourd'hui. Un futur
  //  appelant public la trouverait ici plutôt que de la réinventer.
  //
  //  La garde est **avant** la lecture, et non un `catch` autour d'elle : on ne
  //  demande pas ce qu'on sait ne pas pouvoir lire, et un refus qui
  //  surviendrait malgré un jeton reste une vraie panne — il doit remonter.
  //
  //  `RootNavigator` rend un écran de chargement tant que `status` vaut
  //  `'loading'`, donc la session est **toujours** déjà lue quand un écran monte
  //  sa liste : il n'y a pas de course où un adhérent connecté passerait ici
  //  avant que sa session ne soit posée.
  const { data: session } = await requireSupabase().auth.getSession();

  if (session.session === null) {
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

/** Une adhésion qui attend la décision du bureau. */
export interface DemandeAdhesion {
  readonly id: string;
  readonly display_name: string;
  readonly status: MemberStatus;
  readonly created_at: string;
}

/**
 * La borne de la liste des demandes.
 *
 * `check-read-bounds` exige une borne **explicite** sur toute lecture de liste,
 * et un `.eq('status', …)` n'en est pas une : il filtre, il ne limite pas. La
 * constante **est** donc la borne, et elle est exportée pour que l'écran puisse
 * la nommer quand elle mord — sans quoi la troncature serait silencieuse, et le
 * bureau croirait avoir tout vu.
 *
 * Deux cents est très au-dessus de ce qu'une association reçoit, et c'est
 * voulu : la borne est un garde-fou contre une croissance imprévue, pas un
 * choix d'affichage.
 */
export const MAX_DEMANDES = 200;

/**
 * Les comptes d'un statut donné, du plus ancien au plus récent — l'ordre dans
 * lequel le bureau veut les traiter.
 *
 * Le statut est un **paramètre** et non une constante : l'écran du bureau
 * filtre, parce qu'une adhésion acceptée se rouvre, qu'une adhésion refusée se
 * revoit, et qu'une suspension se lève. Quatre statuts, quatre listes, une
 * seule requête.
 */
export async function listerAdhesions(statut: MemberStatus): Promise<DemandeAdhesion[]> {
  const { data, error } = await requireSupabase()
    .from('profiles')
    .select('id, display_name, status, created_at')
    .eq('status', statut)
    .order('created_at', { ascending: true })
    .limit(MAX_DEMANDES);

  if (error !== null) {
    throw toAppError(error);
  }

  return data;
}

/**
 * Décider d'une adhésion : accepter, refuser, ou suspendre.
 *
 * Passe par la fonction `decider_adhesion()` plutôt que par une écriture
 * directe, parce que `profiles` n'a **aucune politique de modification** — et
 * c'est délibéré : une politique `for update` porterait sur toutes les colonnes,
 * pour tout administrateur, alors que la capacité voulue est « un statut, par le
 * bureau ». La fonction est `security definer` et vérifie `is_admin()` dans son
 * corps ; un membre ordinaire reçoit « Réservé au bureau. », un refus explicite
 * et non un silence.
 */
export async function deciderAdhesion(id: string, statut: MemberStatus): Promise<void> {
  const { error } = await requireSupabase().rpc('decider_adhesion', {
    p_id: id,
    p_statut: statut,
  });

  if (error !== null) {
    throw toAppError(error);
  }
}
