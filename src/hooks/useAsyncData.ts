import { useCallback, useEffect, useState } from 'react';

import { appErrorMessage } from '@/errors';

export type AsyncStatus = 'loading' | 'ready' | 'error';

export interface AsyncData<T> {
  readonly status: AsyncStatus;
  /** `null` tant que le premier chargement n'a pas abouti. */
  readonly data: T | null;
  readonly errorMessage: string | null;
  /** `true` pendant un rafraîchissement déclenché par l'utilisateur. */
  readonly refreshing: boolean;
  /** Recharge en repassant par l'état « chargement », s'il n'y a rien à l'écran. */
  readonly reload: () => void;
  /**
   * Recharge en conservant le contenu affiché (tirer pour rafraîchir).
   *
   * Si la relecture échoue, le contenu reste à l'écran et l'échec est signalé
   * par `AsyncErrorBanner` : il n'est ni perdu, ni tu.
   */
  readonly refresh: () => void;
}

interface InternalState<T> {
  readonly status: AsyncStatus;
  readonly data: T | null;
  readonly errorMessage: string | null;
}

/**
 * Chargement asynchrone d'une donnée, avec états explicites.
 *
 * POURQUOI PAS `useState` + `setLoading(true)` DANS L'EFFET
 * --------------------------------------------------------
 * C'est le motif qui semble naturel, et il est faux pour deux raisons :
 *
 *   1. `setLoading(true)` dans le corps d'un effet provoque un rendu
 *      supplémentaire systématique, et ESLint le refuse
 *      (`react-hooks/set-state-in-effect`) — la règle attrape ici une vraie
 *      boucle de rendu, pas un détail de style ;
 *   2. l'état initial « chargement » doit être posé **au premier rendu**, pas
 *      après. Sinon l'écran affiche brièvement « aucune donnée » avant
 *      « chargement », ce que l'utilisateur perçoit comme un clignotement.
 *
 * Ici, l'état initial est `loading`, et le corps de l'effet n'écrit rien :
 * seules les retombées asynchrones écrivent l'état — plus `reload`, depuis un
 * gestionnaire d'événement, qui est le seul écrivain synchrone du module. Une
 * réponse devenue obsolète est écartée par le drapeau
 * `active`, que la fonction de nettoyage passe à `false` : quand `reloadToken`
 * change, React exécute ce nettoyage **avant** de relancer l'effet. Une réponse
 * lente arrivée après un rechargement ne peut donc plus écrire, alors qu'elle
 * écraserait une réponse récente sans ce drapeau.
 *
 * Ce n'est pas un compteur de génération, et la distinction n'est pas
 * décorative : un compteur se comparerait à la génération courante dans chaque
 * retombée, alors qu'ici c'est le nettoyage qui invalide. La garantie vient donc
 * de l'ordre d'exécution de React, et non d'un test écrit dans le corps des
 * promesses — ce commentaire a d'ailleurs décrit un compteur qui n'a jamais
 * existé.
 *
 * `loader` doit être stable (`useCallback`) : il est une dépendance de l'effet,
 * et une fonction recréée à chaque rendu relancerait la requête en boucle.
 */
export function useAsyncData<T>(loader: () => Promise<T>): AsyncData<T> {
  const [state, setState] = useState<InternalState<T>>({
    status: 'loading',
    data: null,
    errorMessage: null,
  });
  const [refreshing, setRefreshing] = useState(false);
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    let active = true;

    void loader()
      .then((data) => {
        if (!active) {
          return;
        }
        setState({ status: 'ready', data, errorMessage: null });
        setRefreshing(false);
      })
      .catch((error: unknown) => {
        if (!active) {
          return;
        }
        // `data` est **conservé**, et non remis à `null`.
        //
        // Un rafraîchissement raté ne doit pas faire disparaître ce que
        // l'adhérent est en train de lire : c'est ce qui distingue « rien à
        // afficher » — premier chargement en échec, où `previous.data` vaut
        // `null` et l'écran d'erreur s'affiche — de « contenu peut-être
        // périmé », où la liste reste en place.
        //
        // Conserver le contenu **sans rien dire** rendrait l'échec silencieux :
        // l'adhérent lirait des données périmées en croyant qu'elles viennent
        // d'être actualisées. Les deux vont donc ensemble, et c'est le bandeau
        // qui parle : les écrans affichent `AsyncErrorBanner` **au-dessus** de la
        // liste, avec `hasData={liste.length > 0}` — le seul `hasData` vivant du
        // projet, parce qu'il est rendu quel que soit le contenu.
        //
        // La liste ne reste pas en place parce que `hasData` serait vrai :
        // `AsyncFallback` ne le reçoit **jamais** vrai. Il vit dans
        // `ListEmptyComponent`, ou derrière un `length === 0 ? … : …`, donc il
        // n'est pas monté du tout quand il y a du contenu. C'est cette absence de
        // montage qui préserve l'affichage, et non un état qu'on lui passerait.
        setState((previous) => ({
          status: 'error',
          data: previous.data,
          errorMessage: appErrorMessage(error),
        }));
        setRefreshing(false);
      });

    return () => {
      active = false;
    };
  }, [loader, reloadToken]);

  /**
   * Recharge, en repassant par l'état « chargement » **quand il n'y a rien à
   * conserver à l'écran**.
   *
   * La nuance n'est pas cosmétique : c'est elle qui permet aux deux appelants
   * de ce hook de coexister.
   *
   *   - Depuis l'écran d'erreur (`onRetry`), `data` vaut `null` : on repasse
   *     donc par « chargement », et l'utilisateur voit enfin quelque chose se
   *     produire. Sans cette remise à zéro, appuyer sur « Réessayer » ne
   *     changeait **rien** à l'affichage — le bouton semblait mort. Et si la
   *     tentative échouait aussi vite qu'elle partait, l'écran restait
   *     identique alors que la requête avait bien été envoyée, ce qui invite à
   *     appuyer encore.
   *   - Après une écriture réussie (message envoyé, signalement créé,
   *     réservation posée), `data` porte la liste affichée : on la conserve
   *     pendant la relecture. La vider ferait disparaître le message que
   *     l'utilisateur vient d'envoyer, remplacé par un indicateur de chargement
   *     — un clignotement juste après une action pourtant réussie.
   *
   * `setState` renvoyant `previous` à l'identique — même référence, donc
   * `Object.is` — React abandonne le rendu de ce composant **et de ses enfants** :
   * la seconde branche ne descend jamais dans la liste.
   *
   * Elle peut en revanche coûter **un** rendu de ce composant : la référence de
   * React est explicite — « in some cases React may still need to call your
   * component before skipping the children ». Écrire ici que React « ne rend
   * rien » serait donc faux, même si le coût perçu est le même.
   */
  const reload = useCallback(() => {
    setState((previous) =>
      previous.data === null ? { status: 'loading', data: null, errorMessage: null } : previous,
    );
    setReloadToken((token) => token + 1);
  }, []);

  const refresh = useCallback(() => {
    setRefreshing(true);
    setReloadToken((token) => token + 1);
  }, []);

  return {
    status: state.status,
    data: state.data,
    errorMessage: state.errorMessage,
    refreshing,
    reload,
    refresh,
  };
}
