import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, View } from 'react-native';

import { AppText } from '@/components/AppText';
import { Badge } from '@/components/Badge';
import { Card } from '@/components/Card';
import { colors, spacing } from '@/theme';
import { annonceCategoryStyle } from '@/theme/categories';
import { ANNONCE_CATEGORY_LABELS, type AnnonceWithAuthor } from '@/types/models';
import { formatRelativeDay } from '@/utils/date';

export interface AnnonceCardProps {
  readonly annonce: AnnonceWithAuthor;
  /**
   * Nombre de lignes du texte affiché. `undefined` affiche le texte entier.
   *
   * POURQUOI LA COUPE EST UNE PROP ET NON UNE SECONDE CARTE
   * ------------------------------------------------------
   * L'accueil montre trois lignes — la carte donne envie d'ouvrir —, tandis que
   * la rubrique « Actualités » montre le texte entier, puisqu'on y vient pour
   * lire. Deux cartes distinctes auraient divergé à la première retouche : le
   * badge, le repère de date et la coupe sont les mêmes, seul le nombre de lignes
   * change.
   *
   * `numberOfLines` et non un `substring` : couper la chaîne se ferait au milieu
   * d'un mot, et compterait les caractères accentués de travers.
   */
  readonly lines?: number;
}

/** Une actualité : badge de catégorie, titre, repère de date, texte. */
export function AnnonceCard({ annonce, lines = 3 }: AnnonceCardProps) {
  const style = annonceCategoryStyle(annonce.category);

  return (
    <Card elevated style={styles.carte}>
      <Badge
        label={ANNONCE_CATEGORY_LABELS[annonce.category] ?? 'Information'}
        accent={style.accent}
        icon={style.icon}
      />

      <AppText variant="heading">{annonce.title}</AppText>

      <View style={styles.repere}>
        <Ionicons name="time-outline" size={13} color={colors.textSecondary} />
        <AppText variant="caption">{formatRelativeDay(annonce.published_at)}</AppText>
        {annonce.authorName === null ? null : (
          <AppText variant="caption" numberOfLines={1} style={styles.auteur}>
            · {annonce.authorName}
          </AppText>
        )}
      </View>

      <AppText variant="body" numberOfLines={lines}>
        {annonce.body}
      </AppText>
    </Card>
  );
}

const styles = StyleSheet.create({
  carte: {
    gap: spacing.sm,
  },
  repere: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  auteur: {
    // Le nom de l'auteur est coupé avant la date : sur une carte étroite, c'est
    // la date qui doit rester lisible, et un nom long la pousserait hors du
    // cadre.
    flexShrink: 1,
  },
});
