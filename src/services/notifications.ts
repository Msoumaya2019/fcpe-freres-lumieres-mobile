/**
 * Notifications — l'appareil s'enregistre auprès du bureau.
 *
 * POURQUOI L'ENREGISTREMENT EST SÉPARÉ DE L'AUTORISATION
 * ------------------------------------------------------
 * Obtenir un jeton demande `expo-notifications` : c'est l'OS qui le délivre, et
 * l'utilisateur doit avoir accepté les notifications. Ce fichier ne fait pas ce
 * travail. Il prend un jeton **déjà obtenu** et le dépose en base.
 *
 * La séparation n'est pas cosmétique : elle rend l'écriture vérifiable sans
 * appareil, sans émulateur et sans dépendance native. Le jour où le service qui
 * demande l'autorisation est écrit, il n'aura qu'à appeler cette fonction.
 *
 * UNE SEULE LIGNE EST MODIFIÉE PAR L'APPLICATION
 * ----------------------------------------------
 * Le reste de l'application n'écrit que des lignes nouvelles. Ici, un appareil
 * déjà connu **rafraîchit sa date** au lieu d'échouer sur une clé existante —
 * sans quoi il serait purgé au bout de quelques mois alors qu'il est toujours
 * installé. La capacité est étroite : elle porte sur la ligne dont on connaît
 * déjà le jeton, et les deux colonnes qu'elle touche sont une date et un nom de
 * plateforme.
 */

import { requireSupabase } from '@/config/supabase';
import { toAppError } from '@/errors';

/**
 * Code PostgreSQL du doublon de clé primaire.
 *
 * Nommé plutôt qu'écrit « 23505 » au milieu d'un test : le jour où quelqu'un se
 * demande ce que ce nombre signifie, la réponse est ici.
 */
const DOUBLON = '23505';

export type Plateforme = 'ios' | 'android';

/**
 * Enregistrer l'appareil, ou rafraîchir sa date s'il est déjà connu.
 *
 * L'ordre des deux appels porte tout le sens : la modification d'abord, qui ne
 * fait rien quand la ligne n'existe pas encore ; l'insertion ensuite, dont le
 * doublon est alors la **preuve** que la première a suffi. L'inverse — insérer
 * puis rattraper l'erreur — demanderait de lire l'erreur pour décider, et
 * confondrait un vrai refus avec un doublon.
 */
export async function enregistrerAppareil(token: string, platform: Plateforme): Promise<void> {
  const client = requireSupabase();
  const maintenant = new Date().toISOString();

  const { error: erreurDeMaj } = await client
    .from('push_tokens')
    .update({ platform, last_seen_at: maintenant })
    .eq('token', token);

  if (erreurDeMaj !== null) {
    throw toAppError(erreurDeMaj);
  }

  const { error: erreurDInsertion } = await client
    .from('push_tokens')
    .insert({ token, platform, last_seen_at: maintenant });

  // Un doublon n'est pas un échec : il signifie que l'appareil était déjà
  // enregistré, et que l'appel précédent vient de rafraîchir sa date.
  if (erreurDInsertion !== null && erreurDInsertion.code !== DOUBLON) {
    throw toAppError(erreurDInsertion);
  }
}
