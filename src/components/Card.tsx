import { StyleSheet, View, type ViewProps } from 'react-native';

import { colors, radius, shadow, spacing } from '@/theme';

export interface CardProps extends ViewProps {
  readonly muted?: boolean;
  /**
   * Carte posée sur le fond plutôt que délimitée par un trait.
   *
   * La maquette sépare les cartes par une **ombre** et non par une bordure, ce
   * qui les fait flotter au-dessus du fond. Les deux ne se cumulent pas : une
   * ombre sous une bordure donne un trait double, et c'est ce qui se voit
   * lorsqu'on essaie.
   */
  readonly elevated?: boolean;
}

/** Conteneur de contenu : fond blanc, coins arrondis, bordure ou ombre. */
export function Card({ muted = false, elevated = false, style, ...rest }: CardProps) {
  return (
    <View
      style={[styles.card, muted && styles.muted, elevated && styles.elevated, style]}
      {...rest}
    />
  );
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
  elevated: {
    borderWidth: 0,
    shadowColor: shadow.color,
    shadowOpacity: shadow.opacity,
    shadowRadius: shadow.radius,
    shadowOffset: { width: 0, height: shadow.offsetY },
    elevation: shadow.elevation,
  },
});
