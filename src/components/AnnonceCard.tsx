import { Ionicons } from '@expo/vector-icons';
import { Image, Pressable, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/AppText';
import { Badge } from '@/components/Badge';
import { Card } from '@/components/Card';
import { accents, colors, radius, spacing } from '@/theme';
import { annonceCategoryStyle } from '@/theme/categories';
import { ANNONCE_CATEGORY_LABELS, type AnnonceWithAuthor } from '@/types/models';
import { formatRelativeDay } from '@/utils/date';

/**
 * Côté de la vignette, en points.
 *
 * POURQUOI UNE VALEUR FIXE, ET POURQUOI CELLE-LÀ
 * ----------------------------------------------
 * La vignette est **carrée**, et sa largeur décide de ce qui reste au titre :
 * sur un écran de 360 points, la carte en occupe 328 une fois ses marges
 * retirées, et une vignette de 92 laisse 224 points au texte — de quoi lire un
 * titre sur deux lignes à 18 points. Une vignette plus large chasserait le titre
 * sur trois lignes ; plus étroite, elle ne se verrait plus comme une photo.
 *
 * Elle ne suit pas la taille de police du téléphone, et c'est volontaire : c'est
 * une **réservation de place**, comme la pastille de la barre d'onglets. Ce qui
 * doit grandir avec la police, c'est le texte, et il grandit.
 */
const VIGNETTE = 92;

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
  /**
   * Ouvre l'actualité entière. **Sans elle, la carte n'est pas touchable** — et
   * c'est ce qui distingue une carte qu'on lit d'une carte qu'on ouvre.
   *
   * Le repère « Lire la suite » n'apparaît que si les deux sont donnés : une
   * carte déjà entière (`lines === undefined`) n'a rien à ouvrir, et le
   * promettre serait un mensonge visible — le texte entier est sous les yeux.
   */
  readonly onPress?: () => void;
  /**
   * L'adresse **signée** de la photo de l'actualité, ou `null` quand elle n'en a
   * pas.
   *
   * POURQUOI L'ADRESSE ARRIVE DÉJÀ SIGNÉE
   * --------------------------------------
   * Le compartiment est privé : chaque photo demande une adresse signée, donc un
   * aller-retour réseau. Les résoudre ici, dans la carte, ferait dix requêtes
   * pour dix cartes, toutes au même instant, et l'écran se remplirait par
   * vagues. C'est l'écran qui signe **une fois pour toute sa liste**
   * (`photosDesAnnonces`) et qui passe le résultat ; la carte ne fait que
   * peindre.
   *
   * `null` et non `undefined` : la carte ne distingue que deux cas — il y a une
   * photo, ou il n'y en a pas. « Pas encore résolue » n'existe pas ici, puisque
   * l'écran ne rend ses cartes qu'une fois sa liste chargée.
   */
  readonly photoUrl?: string | null;
}

/**
 * Une actualité : vignette, badge de catégorie, titre, repère de date, texte.
 *
 * LA VIGNETTE, ET CE QU'ELLE REMPLACE QUAND ELLE MANQUE
 * -----------------------------------------------------
 * La maquette veut une photo sur la carte, **avant** d'ouvrir l'article : c'est
 * ce qui fait qu'on ouvre ou qu'on passe. Toutes les actualités n'en ont pas
 * pour autant — le bureau publie souvent du texte seul —, et une carte sans
 * photo ne doit pas ressembler à une carte cassée : elle porte alors
 * l'**illustration de sa catégorie**, l'icône du badge posée sur le pastel de
 * son accent.
 *
 * Cette icône n'est pas mesurée une seconde fois dans
 * `scripts/check-contrast.test.mjs`, et c'est cohérent : elle est posée sur
 * exactement le fond qui porte déjà le libellé de son badge, dont le seuil est
 * plus strict — 4,5:1 pour du texte contre 3:1 pour une icône seule. Le couple
 * `ink`/`soft` est donc déjà tenu, et l'ajouter ailleurs ne mesurerait rien de
 * neuf.
 *
 * LA VIGNETTE EST DÉCORATIVE, LE TEXTE NE L'EST PAS
 * ------------------------------------------------
 * L'image est masquée aux lecteurs d'écran : la catégorie est déjà annoncée par
 * le badge, le titre par le titre. Un lecteur d'écran qui énumérerait « Photo de
 * l'actualité : … » avant chaque titre doublerait chaque entrée sans rien
 * apprendre.
 */
export function AnnonceCard({ annonce, lines = 3, onPress, photoUrl = null }: AnnonceCardProps) {
  const style = annonceCategoryStyle(annonce.category);
  const teinte = accents[style.accent];

  const carte = (
    <Card elevated style={styles.carte}>
      <View style={styles.entete}>
        {photoUrl === null ? (
          <View
            style={[styles.vignette, styles.illustration, { backgroundColor: teinte.soft }]}
            accessibilityElementsHidden
          >
            <Ionicons name={style.icon} size={32} color={teinte.ink} />
          </View>
        ) : (
          <Image
            source={{ uri: photoUrl }}
            style={[styles.vignette, styles.photo]}
            resizeMode="cover"
            accessibilityElementsHidden
          />
        )}

        <View style={styles.texte}>
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
        </View>
      </View>

      <AppText variant="body" numberOfLines={lines}>
        {annonce.body}
      </AppText>

      {onPress === undefined || lines === undefined ? null : (
        <View style={styles.suite}>
          <AppText variant="caption" style={styles.suiteTexte}>
            Lire la suite
          </AppText>
          <Ionicons name="chevron-forward" size={14} color={colors.primary} />
        </View>
      )}
    </Card>
  );

  if (onPress === undefined) {
    return carte;
  }

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`Lire l’actualité : ${annonce.title}`}
      style={({ pressed }) => (pressed ? styles.pressee : undefined)}
    >
      {carte}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  carte: {
    gap: spacing.sm,
  },
  entete: {
    //  Le texte s'aligne sur le **haut** de la vignette, et non sur son centre :
    //  un titre de deux lignes doit rester collé au badge au-dessus de lui,
    //  sinon le bloc entier se décale vers le bas et la vignette paraît flotter.
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
  },
  vignette: {
    width: VIGNETTE,
    height: VIGNETTE,
    borderRadius: radius.md,
    overflow: 'hidden',
  },
  photo: {
    //  La couleur tient la place pendant le chargement de l'image : sans elle,
    //  le cadre est transparent et la carte se réorganise quand la photo arrive.
    backgroundColor: colors.surfaceMuted,
  },
  illustration: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  texte: {
    //  `flex: 1` donne au texte la place qui reste après la vignette. Sans lui,
    //  le bloc se dimensionne sur son contenu et un titre long déborde de la
    //  carte au lieu de se replier.
    flex: 1,
    gap: spacing.xs,
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
  suite: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginTop: spacing.xs,
  },
  suiteTexte: {
    color: colors.primary,
  },
  pressee: {
    // L'appui doit se voir : sans retour visuel, une carte qui n'ouvre rien et
    // une carte qui ouvre se ressemblent, et l'adhérent appuie deux fois.
    opacity: 0.7,
  },
});
