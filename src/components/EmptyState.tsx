import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, View } from 'react-native';

import { AppText } from '@/components/AppText';
import { colors, spacing } from '@/theme';

export interface EmptyStateProps {
  readonly title: string;
  readonly description?: string;
  readonly icon?: keyof typeof Ionicons.glyphMap;
}

/**
 * Affiché quand une liste est vide **après** chargement.
 *
 * Le texte est fourni par l'écran, jamais déduit ici : seul l'écran connaît le
 * filtre actif. Un message générique affiché sous un filtre « Mes signalements »
 * ferait croire à une absence de données alors que le filtre seul est en cause.
 */
export function EmptyState({ title, description, icon = 'file-tray-outline' }: EmptyStateProps) {
  return (
    <View style={styles.container}>
      <Ionicons name={icon} size={36} color={colors.textSecondary} />
      <AppText variant="heading" center>
        {title}
      </AppText>
      {description === undefined ? null : (
        <AppText variant="caption" center>
          {description}
        </AppText>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.xxl,
    paddingHorizontal: spacing.xl,
    gap: spacing.sm,
  },
});
