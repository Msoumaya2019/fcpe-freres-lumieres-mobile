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
 * UNE FONCTION, ET NON DEUX APPELS ENCHAÎNÉS
 * ------------------------------------------
 * Ce fichier modifiait d'abord la ligne de l'appareil, puis insérait — et le
 * doublon de l'insertion devait prouver que la modification avait suffi. Elle ne
 * suffisait pas, et la cause mérite d'être écrite ici : **une clause `WHERE` qui
 * lit une colonne exige que la ligne soit lisible.** PostgreSQL applique alors
 * les politiques de `select` en plus de celles de `update`, et `push_tokens` n'a
 * aucune politique de lecture pour un visiteur sans compte — elle ne doit pas en
 * avoir, elle rendrait publics les jetons de tous les appareils.
 *
 * La modification touchait donc **zéro ligne, sans erreur** : `error` valait
 * `null`, et le client croyait avoir rafraîchi. La date de l'appareil restait
 * figée à sa première installation, et l'écran du bureau — qui trie dessus —
 * annonçait comme « plus récent » un téléphone vu des mois plus tôt.
 *
 * L'enregistrement et le rafraîchissement passent désormais par une seule
 * opération, `enregistrer_jeton`, une fonction `security definer` : elle
 * s'exécute avec les droits de son propriétaire, donc sans dépendre d'une
 * politique de lecture, et elle fait l'insertion **ou** la mise à jour selon que
 * la ligne existe déjà.
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

/**
 * Ce que PostgREST répond quand la fonction demandée n'existe pas.
 *
 * Il sert au repli, et à lui seul : une base où la migration n'a pas encore été
 * collée doit continuer de fonctionner.
 */
const FONCTION_ABSENTE = 'PGRST202';

export type Plateforme = 'ios' | 'android';

/**
 * Enregistrer l'appareil, ou rafraîchir sa date s'il est déjà connu.
 *
 * LE REPLI N'EST PAS UNE PRÉCAUTION DE STYLE
 * ------------------------------------------
 * `enregistrer_jeton` arrive avec une migration que l'opérateur colle à la
 * main. Une version de l'application peut donc tourner avant elle — c'est même
 * le cas normal, puisqu'un binaire installé ne se met pas à jour tout seul.
 * Sans repli, un appareil ne s'enregistrerait plus du tout, et **les
 * notifications s'arrêteraient** pour tous ceux qui n'ont pas réinstallé.
 *
 * Le repli est l'ancienne écriture, réduite à ce qui fonctionnait réellement :
 * l'insertion. La modification, elle, est retirée — elle ne touchait rien.
 */
export async function enregistrerAppareil(token: string, platform: Plateforme): Promise<void> {
  const client = requireSupabase();

  const { error } = await client.rpc('enregistrer_jeton', {
    p_token: token,
    p_platform: platform,
  });

  if (error === null) {
    return;
  }

  if (error.code !== FONCTION_ABSENTE) {
    throw toAppError(error);
  }

  const { error: erreurDInsertion } = await client
    .from('push_tokens')
    .insert({ token, platform, last_seen_at: new Date().toISOString() });

  // Un doublon n'est pas un échec : l'appareil est déjà enregistré, et c'est la
  // fonction qui le rafraîchira dès que la migration sera collée.
  if (erreurDInsertion !== null && erreurDInsertion.code !== DOUBLON) {
    throw toAppError(erreurDInsertion);
  }
}
