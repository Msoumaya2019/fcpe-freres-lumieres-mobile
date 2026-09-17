/**
 * État d'authentification de l'application.
 *
 * La navigation ne décide jamais elle-même où aller après une connexion : elle
 * observe `status`. Un seul endroit décide, `RootNavigator`, ce qui évite les
 * doubles navigations et les écrans qui se ferment aussitôt ouverts — le
 * défaut classique d'un `navigate()` déclenché à la fois par le formulaire et
 * par un écouteur de session.
 */

import type { Session } from '@supabase/supabase-js';
import * as Linking from 'expo-linking';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';

import { RECOVERY_REDIRECT_PATH, SIGNUP_REDIRECT_PATH } from '@/auth/redirectPaths';
import { describeRecoveryError, parseRecoveryTokens } from '@/auth/recoveryLink';
import { requireSupabase, supabase } from '@/config/supabase';
import { toAppError } from '@/errors';
import { fetchProfile } from '@/services/profiles';
import type { Profile } from '@/types/models';

export type AuthStatus =
  /** La session stockée est en cours de lecture. */
  | 'loading'
  /** Les clés Supabase sont absentes ou refusées : voir `appConfig.configError`. */
  | 'unconfigured'
  | 'signedOut'
  | 'signedIn';

export interface SignUpResult {
  /** `true` si Supabase exige une confirmation par e-mail avant la connexion. */
  readonly needsEmailConfirmation: boolean;
}

export interface AuthContextValue {
  readonly status: AuthStatus;
  readonly session: Session | null;
  /** `null` tant que le profil n'est pas chargé, ou s'il n'existe pas encore. */
  readonly profile: Profile | null;
  /**
   * `true` quand un lien de réinitialisation a ouvert une session qu'il reste à
   * conclure par le choix d'un mot de passe.
   *
   * Un drapeau distinct de `status`, et non un état de plus : l'adhérent est
   * bien **connecté** à ce moment-là — la session existe — mais il ne doit pas
   * entrer dans l'application. C'est `RootNavigator` qui traduit ce cas en
   * écran, et lui seul décide de la navigation.
   */
  readonly passwordRecovery: boolean;
  /** Message à afficher quand le lien reçu n'a pas pu aboutir (lien expiré). */
  readonly recoveryError: string | null;
  /**
   * Raisons pour lesquelles le serveur juge faible le mot de passe qu'il vient
   * d'**accepter** — `null` quand il n'a rien signalé.
   *
   * Ce n'est pas une erreur, et c'est justement pourquoi cela ne peut pas
   * voyager avec `status` : la connexion a réussi, l'adhérent est entré, et le
   * serveur lui apprend seulement que son mot de passe ne respecte plus la
   * politique en vigueur. Une erreur, elle, aurait empêché d'entrer.
   *
   * Les raisons **brutes**, et non une phrase : la traduction vit dans
   * `src/errors/index.ts`, avec les autres, et c'est le seul endroit où elle est
   * écrite.
   */
  readonly weakPasswordReasons: readonly string[] | null;
  /** Referme le signalement, pour la session en cours. */
  readonly dismissWeakPassword: () => void;
  readonly signIn: (email: string, password: string) => Promise<void>;
  readonly signUp: (email: string, password: string, displayName: string) => Promise<SignUpResult>;
  readonly signOut: () => Promise<void>;
  /** Envoie un lien de réinitialisation. Ne révèle jamais si le compte existe. */
  readonly requestPasswordReset: (email: string) => Promise<void>;
  /** Applique le nouveau mot de passe, puis referme le mode récupération. */
  readonly completePasswordReset: (password: string) => Promise<void>;
  /** Abandonne la récupération : la session ouverte par le lien est fermée. */
  readonly cancelPasswordRecovery: () => Promise<void>;
  readonly dismissRecoveryError: () => void;
}

interface AuthState {
  readonly status: AuthStatus;
  readonly session: Session | null;
  readonly profile: Profile | null;
  readonly passwordRecovery: boolean;
  readonly recoveryError: string | null;
  readonly weakPasswordReasons: readonly string[] | null;
}

const AuthContext = createContext<AuthContextValue | null>(null);

/**
 * L'adresse est normalisée ici, et une seule fois.
 *
 * Supabase ne distingue pas la casse des adresses : « Jean@Exemple.fr » et
 * « jean@exemple.fr » désignent le même compte. Sans normalisation, la
 * connexion échoue avec un message d'identifiants invalides alors que
 * l'utilisateur a saisi la bonne adresse — simplement pas dans la même casse
 * que celle utilisée à l'inscription.
 */
function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function AuthProvider({ children }: { readonly children: ReactNode }) {
  const [state, setState] = useState<AuthState>(() => ({
    // L'état initial est décidé au premier rendu : poser « chargement » depuis
    // un effet ferait clignoter l'écran de connexion avant l'écran d'attente.
    status: supabase === null ? 'unconfigured' : 'loading',
    session: null,
    profile: null,
    passwordRecovery: false,
    recoveryError: null,
    weakPasswordReasons: null,
  }));

  /**
   * L'application de la session ouverte par un lien de réinitialisation, tant
   * qu'elle n'est pas terminée.
   *
   * `setSession` fait un aller-retour réseau (il relit l'utilisateur). Pendant
   * ce temps, l'adhérent voit déjà l'écran de choix du mot de passe et peut
   * appuyer sur « Annuler et se déconnecter ». Si la déconnexion partait avant
   * que la session soit posée, la session arriverait **après** elle et
   * rouvrirait ce que l'annulation vient de fermer. « Annuler » attend donc que
   * cette promesse soit réglée, puis déconnecte — l'ordre est ainsi garanti.
   */
  const recoverySessionRef = useRef<Promise<void> | null>(null);

  // --- Lecture de la session, puis écoute des changements -------------------
  useEffect(() => {
    const client = supabase;
    if (client === null) {
      return;
    }

    let active = true;

    void client.auth
      .getSession()
      .then(({ data, error }) => {
        if (!active) {
          return;
        }
        if (error !== null) {
          console.warn('Lecture de la session impossible :', error.message);
        }
        setState((previous) => ({
          ...previous,
          status: data.session === null ? 'signedOut' : 'signedIn',
          session: data.session,
        }));
      })
      .catch((error: unknown) => {
        if (!active) {
          return;
        }
        console.warn('Lecture de la session impossible :', toAppError(error).technicalDetail);
        setState((previous) => ({ ...previous, status: 'signedOut' }));
      });

    const { data: listener } = client.auth.onAuthStateChange((_event, session) => {
      if (!active) {
        return;
      }
      setState((previous) => ({
        ...previous,
        status: session === null ? 'signedOut' : 'signedIn',
        session,
        // Le profil est vidé à la déconnexion. Le conserver afficherait le nom
        // du compte précédent si l'on se reconnecte avec un autre compte sur le
        // même appareil — un mélange d'identités visible par toute la discussion.
        profile: session === null ? null : previous.profile,
        // Même raison pour la récupération : sans session, il n'y a plus rien à
        // réinitialiser. Sans cette remise à zéro, abandonner la récupération
        // laisserait l'application bloquée sur l'écran de choix du mot de passe,
        // sans session pour l'appliquer.
        passwordRecovery: session === null ? false : previous.passwordRecovery,
        // Le signalement suit le compte, pas l'appareil. Sans cette remise à
        // zéro, le mot de passe faible d'un compte s'afficherait après la
        // connexion d'un autre sur le même téléphone. `signIn` réécrit la valeur
        // de toute façon, mais l'effacer ici rend la règle indépendante de
        // l'ordre des deux écritures.
        weakPasswordReasons: session === null ? null : previous.weakPasswordReasons,
      }));
    });

    return () => {
      active = false;
      listener.subscription.unsubscribe();
    };
  }, []);

  // --- Lien de réinitialisation reçu par l'application ----------------------
  useEffect(() => {
    const client = supabase;
    if (client === null) {
      return;
    }

    let active = true;

    /**
     * Traite une adresse reçue de l'extérieur.
     *
     * Deux cas seulement, et ils ne se recouvrent pas : le lien porte une
     * session à compléter, ou il porte une erreur (expiré). Tout le reste est
     * ignoré en silence — un lien de confirmation d'inscription, par exemple,
     * dont le traitement n'a pas à changer ici.
     */
    const handleUrl = (url: string | null): void => {
      if (url === null) {
        return;
      }

      const tokens = parseRecoveryTokens(url);
      if (tokens !== null) {
        // Le drapeau est posé **avant** `setSession`, et non après.
        //
        // `setSession` déclenche lui-même `onAuthStateChange` : dans
        // `@supabase/auth-js` 2.116.0, `_setSession` appelle
        // `_notifyAllSubscribers` (qui invoque le rappel) et l'attend **avant**
        // de rendre la main. Poser le drapeau dans le `.then()` laissait donc
        // passer au moins un rendu où `status` valait déjà « connecté » alors
        // que `passwordRecovery` valait encore « faux » : `RootNavigator`
        // montait l'application, dont les quatre écrans lançaient leurs
        // requêtes, avant qu'ils soient remplacés par l'écran de choix du mot
        // de passe. Le drapeau d'abord rend cet entre-deux impossible.
        //
        // Le correctif ne dépend pas de cet ordre interne : lever le drapeau
        // avant l'appel est juste quel que soit le moment où la notification
        // arrive. Le détail ci-dessus explique le défaut, il ne le conditionne
        // pas — une version future de la bibliothèque ne peut pas le rendre faux.
        setState((previous) => ({ ...previous, passwordRecovery: true, recoveryError: null }));

        // Un échec tardif ne doit rien réécrire si l'adhérent a annulé
        // entre-temps : `passwordRecovery` vaut alors déjà `false`, et poser un
        // message d'erreur ferait apparaître « lien expiré » sur l'écran de
        // connexion, après une annulation volontaire.
        const reportFailure = (error: unknown): void => {
          if (!active) {
            return;
          }
          setState((previous) =>
            previous.passwordRecovery
              ? { ...previous, passwordRecovery: false, recoveryError: toAppError(error).message }
              : previous,
          );
        };

        recoverySessionRef.current = client.auth
          .setSession({ access_token: tokens.accessToken, refresh_token: tokens.refreshToken })
          .then(({ error }) => {
            // Cas nominal : plus rien à poser, le drapeau est déjà en place et
            // `onAuthStateChange` a basculé `status` sur « connecté ».
            if (error !== null) {
              // Le lien portait une session que le serveur refuse (déjà
              // utilisée, révoquée). On referme la récupération, sans quoi
              // l'écran de choix du mot de passe resterait affiché sans session
              // pour l'appliquer.
              reportFailure(error);
            }
          })
          .catch(reportFailure);
        return;
      }

      const message = describeRecoveryError(url);
      if (message !== null) {
        setState((previous) => ({ ...previous, recoveryError: message }));
      }
    };

    // `getInitialURL` couvre l'application **fermée** au moment du clic,
    // l'écouteur couvre l'application déjà ouverte. Les deux sont nécessaires :
    // n'en garder qu'un laisserait la moitié des cas sans effet, et de façon
    // invisible selon l'état de l'application au moment du clic.
    void Linking.getInitialURL()
      .then(handleUrl)
      .catch((error: unknown) => {
        console.warn('Lecture du lien de départ impossible :', toAppError(error).technicalDetail);
      });

    const subscription = Linking.addEventListener('url', ({ url }) => handleUrl(url));

    return () => {
      active = false;
      subscription.remove();
    };
  }, []);

  // --- Chargement du profil rattaché à la session --------------------------
  const userId = state.session?.user.id ?? null;

  useEffect(() => {
    if (userId === null) {
      return;
    }

    let active = true;

    void fetchProfile(userId)
      .then((profile) => {
        if (!active) {
          return;
        }
        // Le profil n'est écrit que s'il correspond encore à l'utilisateur
        // courant : une réponse lente ne doit pas écraser le profil d'un
        // compte connecté entre-temps.
        setState((previous) =>
          previous.session?.user.id === userId ? { ...previous, profile } : previous,
        );
      })
      .catch((error: unknown) => {
        if (!active) {
          return;
        }
        // Un profil illisible ne doit pas bloquer l'accès : l'application
        // fonctionne, seul le nom affiché est indisponible.
        console.warn('Chargement du profil impossible :', toAppError(error).technicalDetail);
      });

    return () => {
      active = false;
    };
  }, [userId]);

  const signIn = useCallback(async (email: string, password: string) => {
    const { data, error } = await requireSupabase().auth.signInWithPassword({
      email: normalizeEmail(email),
      password,
    });
    if (error !== null) {
      throw toAppError(error);
    }

    // Le serveur peut signaler ici un mot de passe qu'il vient d'**accepter**
    // tout en le jugeant faible. Ce n'est pas une erreur, et rien d'autre ne le
    // rapporterait : `error` vaut `null`, et `status` passe à « connecté ».
    //
    // L'écriture est inconditionnelle, y compris pour effacer. Ne poser la
    // valeur que lorsqu'elle existe laisserait le signalement d'un compte
    // survivre à la connexion d'un autre sur le même appareil.
    setState((previous) => ({
      ...previous,
      weakPasswordReasons: data.weakPassword?.reasons ?? null,
    }));
  }, []);

  const signUp = useCallback(
    async (email: string, password: string, displayName: string): Promise<SignUpResult> => {
      const { data, error } = await requireSupabase().auth.signUp({
        email: normalizeEmail(email),
        password,
        options: {
          // Adresse de retour du lien de confirmation. Sans elle, `signUp`
          // n'envoie aucun `redirect_to` et GoTrue retombe sur le « Site URL »
          // du tableau de bord : l'adhérent confirmerait son adresse dans un
          // navigateur, sans revenir ici. Calculée à l'appel pour la même
          // raison que dans `requestPasswordReset` — `Linking.createURL` lit la
          // configuration d'Expo, indisponible à l'import du module.
          emailRedirectTo: Linking.createURL(SIGNUP_REDIRECT_PATH),
          // Repris par le déclencheur `handle_new_user` côté base, qui crée la
          // ligne `profiles` correspondante. Passer par les métadonnées plutôt
          // que par une insertion depuis l'application évite un état
          // intermédiaire sans profil si l'application est fermée trop tôt.
          data: { display_name: displayName.trim() },
        },
      });

      if (error !== null) {
        throw toAppError(error);
      }

      return { needsEmailConfirmation: data.session === null };
    },
    [],
  );

  const signOut = useCallback(async () => {
    const { error } = await requireSupabase().auth.signOut();
    if (error !== null) {
      // Rien à signaler à l'adhérent, parce que dans ce cas l'état local a déjà
      // été vidé : l'interface cesse d'afficher l'application, et l'absence du
      // changement attendu est le seul symptôme.
      //
      // Vérifié dans `@supabase/auth-js` 2.116.0, fonction `_signOut` : toute
      // erreur rendue ici a été précédée de `_removeSession()`, qui notifie
      // `SIGNED_OUT` — donc `onAuthStateChange` bascule `status`. Une seule
      // branche rend une erreur **sans** retirer la session : un échec de
      // **lecture du stockage** (`_useSession`). Là, aucun appel public ne peut
      // effacer une session dont le stockage est illisible, et l'interface reste
      // celle d'un utilisateur connecté — ce qui est exact, et un second appui
      // retente.
      //
      // Un commentaire précédent citait « Auth session missing! » comme le cas
      // d'ici. Ce message ne peut pas y arriver : `_signOut` absorbe lui-même
      // les erreurs 401, 403 et 404, si bien qu'un jeton invalide est traité
      // comme une déconnexion réussie et rend `error === null`.
      console.warn('Déconnexion :', error.message);
    }
  }, []);

  const requestPasswordReset = useCallback(async (email: string) => {
    const { error } = await requireSupabase().auth.resetPasswordForEmail(normalizeEmail(email), {
      // L'adresse est calculée ici, à l'appel, et non au chargement du module :
      // `Linking.createURL` lit la configuration d'Expo, qui n'est pas encore
      // disponible à l'import.
      redirectTo: Linking.createURL(RECOVERY_REDIRECT_PATH),
    });
    if (error !== null) {
      throw toAppError(error);
    }
  }, []);

  const completePasswordReset = useCallback(async (password: string) => {
    const { error } = await requireSupabase().auth.updateUser({ password });
    if (error !== null) {
      throw toAppError(error);
    }
    // La session ouverte par le lien devient une session normale : l'adhérent
    // entre dans l'application, cette fois avec un mot de passe qu'il connaît.
    setState((previous) => ({ ...previous, passwordRecovery: false }));
  }, []);

  const cancelPasswordRecovery = useCallback(async () => {
    // L'ordre compte, et il compte deux fois.
    //
    // D'abord on referme le mode, sinon la déconnexion laisserait un instant
    // l'écran de choix du mot de passe affiché sans session pour l'appliquer.
    // `signOut` remet le drapeau à zéro de son côté.
    setState((previous) => ({ ...previous, passwordRecovery: false, recoveryError: null }));

    // Ensuite on attend que la session du lien soit posée **avant** de
    // déconnecter. `setSession` est un aller-retour réseau : déconnecter plus
    // tôt ferait arriver la session après la déconnexion, et « Annuler »
    // rouvrirait alors ce qu'il vient de fermer — l'adhérent entrerait dans
    // l'application par un lien qu'il a pourtant explicitement refusé.
    //
    // L'attente ne doit pas pouvoir empêcher la déconnexion : c'est elle qui
    // est obligatoire, pas le compte rendu du lien.
    try {
      await recoverySessionRef.current;
    } catch {
      // Volontairement ignoré : l'échec du lien est déjà rapporté par
      // `handleUrl`, et rien ici ne justifie de renoncer à la déconnexion.
    }
    recoverySessionRef.current = null;
    await signOut();
  }, [signOut]);

  const dismissRecoveryError = useCallback(() => {
    // Rendre `previous` à l'identique quand il n'y a rien à effacer évite un
    // rendu inutile, React abandonnant la mise à jour.
    setState((previous) =>
      previous.recoveryError === null ? previous : { ...previous, recoveryError: null },
    );
  }, []);

  /**
   * Referme le signalement de mot de passe faible.
   *
   * La durée de vie est la session : la valeur n'est pas persistée, et la
   * connexion suivante la repose si le serveur la signale encore. C'est le bon
   * compromis — un adhérent qui a lu le message n'a pas à le relire à chaque
   * ouverture de l'application, et celui qui ne l'a pas encore changé doit le
   * revoir à sa prochaine connexion.
   */
  const dismissWeakPassword = useCallback(() => {
    setState((previous) =>
      previous.weakPasswordReasons === null ? previous : { ...previous, weakPasswordReasons: null },
    );
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      status: state.status,
      session: state.session,
      profile: state.profile,
      passwordRecovery: state.passwordRecovery,
      recoveryError: state.recoveryError,
      weakPasswordReasons: state.weakPasswordReasons,
      signIn,
      signUp,
      signOut,
      requestPasswordReset,
      completePasswordReset,
      cancelPasswordRecovery,
      dismissRecoveryError,
      dismissWeakPassword,
    }),
    [
      state.status,
      state.session,
      state.profile,
      state.passwordRecovery,
      state.recoveryError,
      state.weakPasswordReasons,
      signIn,
      signUp,
      signOut,
      requestPasswordReset,
      completePasswordReset,
      cancelPasswordRecovery,
      dismissRecoveryError,
      dismissWeakPassword,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (context === null) {
    throw new Error("useAuth doit être utilisé à l'intérieur de <AuthProvider>.");
  }
  return context;
}

/**
 * Identifiant de l'utilisateur connecté, garanti non nul.
 *
 * À n'appeler que depuis un écran rendu après connexion — ce que garantit
 * `RootNavigator`. Évite de parsemer les écrans de `session?.user.id ?? ''`,
 * qui produirait des requêtes silencieusement vides si la garantie tombait.
 */
export function useCurrentUserId(): string {
  const { session } = useAuth();
  const userId = session?.user.id;
  if (userId === undefined) {
    throw new Error('Aucun utilisateur connecté.');
  }
  return userId;
}
