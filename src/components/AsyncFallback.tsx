// `Ionicons` n'est utilisé ici que dans une position de type (`typeof …glyphMap`) :
// l'import de type évite d'embarquer l'icône dans le bundle pour rien.
import type { Ionicons } from '@expo/vector-icons';
import type { ReactElement } from 'react';
import { StyleSheet, View } from 'react-native';

import { Button } from '@/components/Button';
import { EmptyState } from '@/components/EmptyState';
import { ErrorNotice } from '@/components/ErrorNotice';
import { LoadingView } from '@/components/LoadingView';
import { userMessage } from '@/errors';
import type { AsyncStatus } from '@/hooks/useAsyncData';
import { spacing } from '@/theme';

export interface AsyncFallbackProps {
  readonly status: AsyncStatus;
  /** `true` si une donnée exploitable est déjà affichable. */
  readonly hasData: boolean;
  readonly errorMessage: string | null;
  readonly onRetry: () => void;
  readonly emptyTitle: string;
  readonly emptyDescription?: string;
  readonly emptyIcon?: keyof typeof Ionicons.glyphMap;
  readonly loadingMessage?: string;
}

/**
 * Affichage de remplacement pendant un chargement, après une erreur, ou sur une
 * liste vide.
 *
 * Renvoie `null` quand la liste peut être rendue. Regroupe quatre cas qui,
 * écrits à la main dans chaque écran, finissent par diverger : c'est ainsi
 * qu'un écran oublie de proposer « Réessayer » après une erreur réseau, alors
 * qu'un autre le fait.
 *
 * Le texte de l'état vide vient de l'écran : lui seul sait quel filtre est
 * actif, et « aucun signalement » n'a pas le même sens selon le filtre.
 *
 * `hasData` décrit le quatrième cas — erreur **et** contenu affiché —, où il n'y
 * a rien à remplacer : c'est `AsyncErrorBanner` qui parle alors, au-dessus de la
 * liste. **Aucun appelant ne l'exerce aujourd'hui** : trois écrans le montent
 * dans un `ListEmptyComponent`, qui n'est rendu que si la liste est vide, et le
 * quatrième passe le littéral `false`. Les deux `&& !hasData` ci-dessous sont
 * donc toujours vrais. La prop reste — elle rend le composant utilisable sans
 * cette garde — mais elle n'est pas un chemin vivant, et il ne faut surtout pas
 * en déduire que le cas « erreur avec contenu » est couvert ici.
 */
export function AsyncFallback({
  status,
  hasData,
  errorMessage,
  onRetry,
  emptyTitle,
  emptyDescription,
  emptyIcon,
  loadingMessage,
}: AsyncFallbackProps): ReactElement | null {
  if (status === 'loading' && !hasData) {
    return <LoadingView message={loadingMessage} />;
  }

  if (status === 'error' && !hasData) {
    return (
      <View style={styles.container}>
        {/* `errorMessage` est **déjà** une phrase française : elle sort d'un
            premier `appErrorMessage`, appliqué dans `useAsyncData`. Or
            `ErrorNotice` en applique un second, et ce second passage ne
            reconnaît aucune règle : sans le marquage, il remplace la phrase par
            « Une erreur inattendue est survenue ». Mesuré — la cause réelle
            (réseau coupé, droits refusés) disparaissait au profit du générique,
            alors que c'est justement l'information qui aide à agir. */}
        <ErrorNotice error={userMessage(errorMessage ?? 'Chargement impossible.')} />
        <Button label="Réessayer" variant="secondary" onPress={onRetry} />
      </View>
    );
  }

  if (!hasData) {
    return <EmptyState title={emptyTitle} description={emptyDescription} icon={emptyIcon} />;
  }

  // Arriver ici avec `status === 'error'` signifie « erreur **et** contenu
  // affiché » : la liste reste en place, ce qui est le comportement attendu d'un
  // rafraîchissement raté. C'est `AsyncErrorBanner`, au-dessus de la liste, qui
  // empêche l'échec de passer inaperçu — les deux vont ensemble.
  return null;
}

export interface AsyncErrorBannerProps {
  readonly status: AsyncStatus;
  /** `true` si une donnée exploitable reste affichée. */
  readonly hasData: boolean;
  readonly errorMessage: string | null;
}

/**
 * Bandeau signalant qu'une relecture a échoué **alors que du contenu est à
 * l'écran**.
 *
 * `AsyncFallback` ne peut pas s'en charger : il vit dans `ListEmptyComponent`,
 * qui n'est pas rendu quand la liste porte des éléments. Sans ce bandeau,
 * conserver le contenu après un échec rendrait la panne silencieuse — l'adhérent
 * lirait des données périmées en croyant qu'elles viennent d'être actualisées.
 *
 * Il ne s'affiche donc que dans ce cas précis : en erreur **sans** contenu,
 * c'est l'écran d'erreur d'`AsyncFallback` qui parle, avec son bouton
 * « Réessayer », et superposer les deux dirait deux fois la même chose.
 *
 * Pour recharger, l'adhérent tire la liste vers le bas : `refresh` est déjà
 * branché sur le `RefreshControl` de chaque écran.
 */
export function AsyncErrorBanner({
  status,
  hasData,
  errorMessage,
}: AsyncErrorBannerProps): ReactElement | null {
  if (status !== 'error' || !hasData || errorMessage === null) {
    return null;
  }

  // Même raison qu'au-dessus : `errorMessage` a déjà traversé `appErrorMessage`
  // une fois, dans `useAsyncData`. Le marquer empêche le second passage de le
  // remplacer par le message générique.
  return <ErrorNotice error={userMessage(errorMessage)} />;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    padding: spacing.xl,
    gap: spacing.lg,
  },
});
