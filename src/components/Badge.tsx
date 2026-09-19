import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, View } from 'react-native';

import { AppText } from '@/components/AppText';
import { accents, radius, spacing, type AccentName } from '@/theme';

export interface BadgeProps {
  readonly label: string;
  readonly accent: AccentName;
  readonly icon?: keyof typeof Ionicons.glyphMap;
}

/**
 * Pastille de catégorie — « Important », « Cantine », « Sondage ».
 *
 * L'encre et le fond sont pris **ensemble** dans `accents`, jamais l'un sans
 * l'autre : c'est le couple qui a été mesuré, et `primary` sur `pinkSoft`
 * n'aurait pas la même lisibilité que sur son propre fond.
 *
 * `alignSelf: 'flex-start'` empêche la pastille de s'étirer sur toute la largeur
 * de la carte : sans lui, le fond coloré couvrirait la ligne entière et le badge
 * ne se lirait plus comme une étiquette mais comme un bandeau.
 */
export function Badge({ label, accent, icon }: BadgeProps) {
  const { ink, soft } = accents[accent];

  return (
    <View style={[styles.badge, { backgroundColor: soft }]}>
      {icon === undefined ? null : <Ionicons name={icon} size={12} color={ink} />}
      <AppText variant="caption" bold color={ink} numberOfLines={1} style={styles.label}>
        {label}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: spacing.xs,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    borderRadius: radius.pill,
  },
  label: {
    fontSize: 12,
  },
});
