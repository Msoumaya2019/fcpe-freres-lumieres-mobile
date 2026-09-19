import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/AppText';
import { colors, spacing } from '@/theme';

export interface SectionHeaderProps {
  readonly title: string;
  /** Action de droite — « Voir tout ». Omise, l'en-tête n'affiche qu'un titre. */
  readonly actionLabel?: string;
  readonly onAction?: () => void;
}

/**
 * Titre de section, avec une action facultative à droite.
 *
 * L'action n'est rendue que si **les deux** — son libellé et son geste — sont
 * fournis. Un bouton qui annonce « Voir tout » et ne fait rien est pire que pas
 * de bouton : l'adhérent appuie, rien ne se passe, et il conclut que
 * l'application est cassée. Le type rend l'oubli visible à la compilation
 * plutôt qu'à l'usage.
 */
export function SectionHeader({ title, actionLabel, onAction }: SectionHeaderProps) {
  const actionPossible = actionLabel !== undefined && onAction !== undefined;

  return (
    <View style={styles.header}>
      <AppText variant="heading">{title}</AppText>

      {actionPossible ? (
        <Pressable
          onPress={onAction}
          accessibilityRole="button"
          accessibilityLabel={actionLabel}
          hitSlop={12}
          style={({ pressed }) => [styles.action, pressed && styles.pressed]}
        >
          <AppText variant="caption" bold color={colors.primary}>
            {actionLabel}
          </AppText>
          <Ionicons name="chevron-forward" size={14} color={colors.primary} />
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  action: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  pressed: {
    opacity: 0.6,
  },
});
