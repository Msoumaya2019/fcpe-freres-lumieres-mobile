/**
 * Client Supabase — le seul du projet.
 *
 * Ce fichier est séparé de `env.ts` à dessein :
 *   - `env.ts` **lit et valide** la configuration, sans dépendre de Supabase ;
 *   - `supabase.ts` **construit le client**, sans connaître l'origine des clés.
 *
 * Cette séparation permet de tester la validation de configuration sans
 * instancier de client, et de remplacer un jour la source des clés (EAS,
 * `app.config.ts`, service distant) sans toucher au client.
 */

import 'react-native-url-polyfill/auto';

import { createClient, type SupabaseClient } from '@supabase/supabase-js';

import { appConfig } from '@/config/env';
import { authStorage } from '@/config/storage';
import type { Database } from '@/types/database';

export type AppSupabaseClient = SupabaseClient<Database>;

/**
 * `null` tant que les clés ne sont pas fournies.
 *
 * L'application affiche alors un écran de configuration au lieu de planter au
 * démarrage — voir `App.tsx`. Les écrans, eux, passent par `requireSupabase()`
 * et n'ont donc jamais à gérer ce cas : ils ne sont rendus que lorsque la
 * configuration est valide.
 *
 * Le test `appConfig.supabase === null` est écrit ici plutôt que remplacé par
 * `isSupabaseConfigured`, et c'est une contrainte du langage, pas un oubli :
 * TypeScript **ne rétrécit pas** `appConfig.supabase` à travers un booléen
 * importé. Mesuré sur une sonde — `isSupabaseConfigured ? appConfig.supabase.url
 * : null` échoue à `tsc --noEmit` avec `TS18047: 'appConfig.supabase' is possibly
 * 'null'`. C'est donc ce test-ci qui rétrécit le type, et il doit rester ; le
 * prédicat exporté sert partout où seul le **booléen** est nécessaire.
 */
export const supabase: AppSupabaseClient | null =
  appConfig.supabase === null
    ? null
    : createClient<Database>(appConfig.supabase.url, appConfig.supabase.anonKey, {
        auth: {
          storage: authStorage,
          // La session est rafraîchie automatiquement et conservée entre deux
          // lancements : sans cela, l'adhérent se reconnecterait à chaque
          // ouverture de l'application.
          autoRefreshToken: true,
          persistSession: true,
          // Une application native n'a pas d'URL à analyser : la session arrive
          // par le stockage, jamais par un fragment d'URL.
          detectSessionInUrl: false,
          // Flux implicite, qui est aussi la valeur par défaut de la
          // bibliothèque — on l'écrit pour que la décision soit visible.
          //
          // Le flux PKCE, recommandé pour les redirections OAuth, exige
          // `crypto.subtle` pour calculer l'empreinte SHA-256. Hermes ne
          // l'expose pas : la bibliothèque se rabattrait alors silencieusement
          // sur une vérification « plain », c'est-à-dire sans hachage — moins
          // sûre que le flux implicite, pour un bénéfice nul tant que
          // l'authentification se limite à e-mail + mot de passe.
          //
          // Si l'on ajoute plus tard une connexion Google ou Apple : installer
          // un polyfill WebCrypto, passer à `flowType: 'pkce'`, et vérifier le
          // retour de redirection avec `expo-linking`.
          flowType: 'implicit',
        },
      });

/**
 * Client garanti non nul.
 *
 * À n'appeler que depuis du code rendu après le contrôle de configuration :
 * lèverait une erreur explicite dans le cas contraire, plutôt que de laisser
 * passer un `undefined` et d'échouer plus loin, sur un message incompréhensible.
 */
export function requireSupabase(): AppSupabaseClient {
  if (supabase === null) {
    throw new Error(appConfig.configError ?? 'Configuration Supabase absente.');
  }
  return supabase;
}
