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
 * Carte de raccourci de l'accueil — fond pastel, icône sur carré, chevron.
 *
 * LA CARTE EST HORIZONTALE, ET CE N'EST PAS QU'UNE QUESTION DE GOÛT
 * -----------------------------------------------------------------
 * La première version empilait l'icône, le titre puis le sous-titre, dans une
 * carte étroite — quatre cartes sur une seule rangée. La maquette en montre
 * deux par rangée, et chaque carte **allongée** : le carré d'icône passe à
 * gauche, les deux textes s'alignent à sa droite, le chevron ferme la ligne.
 *
 * Le changement n'est pas cosmétique : empilés dans une carte de 80 points de
 * large, « Nous contacter » se coupait, et le sous-titre descendait à 10 points
 * sur deux lignes centrées. Allongée, la même carte écrit les deux textes
 * complets à leur taille normale. Une disposition qui oblige à rapetisser le
 * texte pour tenir n'est pas une disposition.
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

      <View style={styles.textes}>
        <AppText variant="caption" bold numberOfLines={1} maxFontSizeMultiplier={1.4}>
          {title}
        </AppText>
        <AppText
          variant="caption"
          numberOfLines={2}
          maxFontSizeMultiplier={1.3}
          color={colors.textSecondary}
          style={styles.subtitle}
        >
          {subtitle}
        </AppText>
      </View>

      <Ionicons name="chevron-forward" size={14} color={colors.textSecondary} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    // La carte prend la moitié de la rangée : c'est ce qui laisse au titre et au
    // sous-titre la place de s'écrire en entier.
    flex: 1,
    minHeight: 56,
    borderRadius: radius.lg,
    padding: spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
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
    width: 40,
    height: 40,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  /**
   * Le bloc des deux textes.
   *
   * `flex: 1` et non une largeur : c'est ce qui laisse le titre se rétrécir
   * plutôt que de pousser le chevron hors de la carte quand la taille de police
   * du téléphone est augmentée.
   */
  textes: {
    flex: 1,
    gap: 1,
  },
  subtitle: {
    fontSize: 11,
    lineHeight: 14,
  },
});
