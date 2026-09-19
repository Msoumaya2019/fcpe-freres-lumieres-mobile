import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/AppText';
import { accents, colors, radius, spacing, tints, type TintedAccent } from '@/theme';

export interface ShortcutCardProps {
  readonly title: string;
  readonly subtitle: string;
  readonly icon: keyof typeof Ionicons.glyphMap;
  readonly accent: TintedAccent;
  readonly onPress: () => void;
}

/**
 * Carte de raccourci de l'accueil — fond pastel, icône cerclée, sous-titre.
 *
 * LE RÔLE ACCESSIBLE EST « button », PAS « link »
 * -----------------------------------------------
 * Ces cartes naviguent dans l'application sans changer d'adresse : un lecteur
 * d'écran qui annonce « lien » promet un comportement que l'appui ne produit
 * pas. Le libellé réunit le titre et le sous-titre, sans quoi l'annonce se
 * limiterait à « Cantine » et perdrait « Menus publiés » — qui est justement ce
 * qui distingue cette carte d'une autre.
 *
 * POURQUOI LA TAILLE MINIMALE EST POSÉE
 * -------------------------------------
 * Une carte de raccourci se touche au pouce, souvent d'une main, en tenant le
 * téléphone en marchant. En dessous de 44 points de haut, on rate la cible une
 * fois sur plusieurs. La hauteur n'est pas fixée pour autant : elle vient du
 * contenu, et `minHeight` laisse le texte grandir avec la taille de police du
 * téléphone au lieu de le rogner.
 */
export function ShortcutCard({ title, subtitle, icon, accent, onPress }: ShortcutCardProps) {
  const { ink, soft } = accents[accent];
  const tint = tints[accent];

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${title}. ${subtitle}`}
      style={({ pressed }) => [styles.card, { backgroundColor: soft }, pressed && styles.pressed]}
    >
      <View style={[styles.iconSquare, { backgroundColor: tint }]}>
        <Ionicons name={icon} size={20} color={ink} />
      </View>

      <AppText
        variant="caption"
        bold
        numberOfLines={1}
        maxFontSizeMultiplier={1.4}
        style={styles.title}
      >
        {title}
      </AppText>

      <View style={styles.subtitleRow}>
        <AppText
          variant="caption"
          numberOfLines={2}
          maxFontSizeMultiplier={1.3}
          color={colors.textSecondary}
          style={styles.subtitle}
        >
          {subtitle}
        </AppText>
        <Ionicons name="chevron-forward" size={12} color={colors.textSecondary} />
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    flex: 1,
    minHeight: 44,
    borderRadius: radius.lg,
    padding: spacing.sm,
    alignItems: 'center',
    gap: spacing.xs,
  },
  pressed: {
    opacity: 0.7,
  },
  /**
   * Le carré qui porte l'icône — `tint`, et non `soft`.
   *
   * Le fond de la carte et celui du carré sont deux tons du même accent, et le
   * carré est le plus soutenu. Les confondre effacerait le relief, et surtout
   * ferait mesurer l'icône contre un fond qui n'est pas le sien.
   */
  iconSquare: {
    width: 44,
    height: 44,
    borderRadius: radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.xs,
  },
  subtitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
  title: {
    textAlign: 'center',
  },
  subtitle: {
    flexShrink: 1,
    fontSize: 10,
    textAlign: 'center',
  },
});
