import { StyleSheet, View, type ViewProps } from 'react-native';

import { colors, radius, spacing } from '@/theme';

export interface CardProps extends ViewProps {
  readonly muted?: boolean;
}

/** Conteneur de contenu : fond blanc, bordure discrète, coins arrondis. */
export function Card({ muted = false, style, ...rest }: CardProps) {
  return <View style={[styles.card, muted && styles.muted, style]} {...rest} />;
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  muted: {
    backgroundColor: colors.surfaceMuted,
  },
});
