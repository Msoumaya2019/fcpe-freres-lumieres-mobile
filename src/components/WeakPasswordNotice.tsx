import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, View } from 'react-native';

import { ErrorNotice } from '@/components/ErrorNotice';
import { userMessage, weakPasswordMessage } from '@/errors';
import { colors, spacing } from '@/theme';

export interface WeakPasswordNoticeProps {
  /**
   * Les raisons envoyées par le serveur, telles quelles.
   *
   * Le composant ne les interprète pas : il les traduit, et c'est
   * `weakPasswordMessage` qui sait lesquelles existent. Une raison qu'elle ne
   * connaît pas fait basculer la phrase entière sur la formule générique, plutôt
   * que de laisser un trou au milieu.
   */
  readonly reasons: readonly string[] | undefined;
  readonly onDismiss: () => void;
}

/**
 * Le bandeau qui rapporte un mot de passe faible signalé par le serveur.
 *
 * POURQUOI CE COMPOSANT EXISTE
 * ----------------------------
 * GoTrue ne refuse pas une connexion pour un mot de passe faible : il l'accepte
 * et joint le constat à la réponse. Sans cet affichage, `data.weakPassword` était
 * **lu puis jeté** — l'adhérent ne saurait jamais que son mot de passe ne
 * respecte plus la politique en vigueur. Rien d'autre ne le lui dirait : pas une
 * erreur, puisqu'il n'y en a pas, et pas un écran non plus, puisqu'il n'existe
 * pas d'écran « mon compte ».
 *
 * LE TON EST « INFORMATION », ET CE N'EST PAS UN DÉTAIL
 * -----------------------------------------------------
 * `danger` annoncerait un échec qui n'a pas eu lieu — la connexion a réussi.
 * `success` annoncerait une réussite, alors que la phrase demande une action.
 * Reste « information », déjà employé pour les avis de confirmation : c'est le
 * registre d'un constat qui n'empêche rien.
 *
 * La phrase est marquée par `userMessage` avant d'entrer dans `ErrorNotice` :
 * sans ce marquage, `ErrorNotice` la prendrait pour un message technique anglais
 * non reconnu et la remplacerait par le message générique, qui invite à
 * réessayer — alors que rien n'a échoué et que réessayer ne changerait rien au
 * mot de passe.
 */
export function WeakPasswordNotice({ reasons, onDismiss }: WeakPasswordNoticeProps) {
  return (
    <View style={styles.container}>
      <View style={styles.notice}>
        <ErrorNotice tone="info" error={userMessage(weakPasswordMessage(reasons))} />
      </View>

      {/* Le seul moyen de refermer : sans lui, le bandeau resterait affiché
          jusqu'à la déconnexion, sur les quatre onglets.

          La couleur de l'icône est `textSecondary` sur le fond du contenu —
          exactement l'association de la légende d'un écran, que
          `check-contrast` mesure déjà à 4,5:1, donc au-delà des 3:1 qu'exige un
          composant qu'on manipule. C'est aussi pourquoi elle n'est pas ajoutée à
          la liste des non-textuels : elle y serait mesurée deux fois, la seconde
          avec un seuil plus faible. */}
      <Pressable
        onPress={onDismiss}
        hitSlop={12}
        accessibilityRole="button"
        accessibilityLabel="Fermer ce message"
        style={({ pressed }) => [styles.close, pressed && styles.closePressed]}
      >
        <Ionicons name="close" size={22} color={colors.textSecondary} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.md,
    // Le fond du contenu, et non celui de l'en-tête : le bandeau est posé sous
    // l'en-tête, il appartient donc à la zone de contenu.
    backgroundColor: colors.background,
  },
  notice: {
    flex: 1,
  },
  close: {
    justifyContent: 'center',
    minHeight: 44,
    paddingVertical: spacing.sm,
  },
  closePressed: {
    opacity: 0.6,
  },
});
