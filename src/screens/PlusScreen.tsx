import { Ionicons } from '@expo/vector-icons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useCallback } from 'react';
import { FlatList, Pressable, StyleSheet, View } from 'react-native';

import { useAuth, useCurrentUserId } from '@/auth/AuthProvider';
import { AppText, Button, Card, Screen } from '@/components';
import { useNonLus } from '@/hooks/useNonLus';
import type { PlusStackParamList } from '@/navigation/types';
import { accents, colors, radius, spacing, type AccentName } from '@/theme';

interface Entree {
  readonly cle: keyof PlusStackParamList;
  readonly titre: string;
  readonly sousTitre: string;
  readonly icone: keyof typeof Ionicons.glyphMap;
  readonly accent: AccentName;
}

/**
 * Les rubriques rangées sous « Plus », dans l'ordre d'usage.
 *
 * La discussion vient en premier : c'est la seule de ces rubriques qu'on ouvre
 * plusieurs fois par semaine, et elle porte un badge. Les documents et les
 * actualités se consultent de temps en temps ; le profil et les réglages,
 * presque jamais.
 */
const ENTREES: readonly Entree[] = [
  {
    cle: 'Discussion',
    titre: 'Discussion',
    sousTitre: 'Espace membres',
    icone: 'chatbubbles-outline',
    accent: 'bleu',
  },
  {
    cle: 'Documents',
    titre: 'Documents importants',
    sousTitre: 'Formulaires, règlements, comptes rendus',
    icone: 'document-text-outline',
    accent: 'ambre',
  },
  {
    cle: 'Actualites',
    titre: 'Actualités',
    sousTitre: 'Toutes les informations publiées',
    icone: 'megaphone-outline',
    accent: 'rose',
  },
  {
    cle: 'MesSignalements',
    titre: 'Mes signalements',
    sousTitre: 'Suivre leur avancement',
    icone: 'alert-circle-outline',
    accent: 'vert',
  },
  {
    cle: 'Profil',
    titre: 'Mon profil',
    sousTitre: 'Nom affiché et rôle',
    icone: 'person-circle-outline',
    accent: 'violet',
  },
  {
    cle: 'Reglages',
    titre: 'Réglages',
    sousTitre: 'Préférences, confidentialité, déconnexion',
    icone: 'settings-outline',
    accent: 'bleu',
  },
];

/**
 * « Plus » — le menu des rubriques qui ne tiennent pas dans la barre.
 *
 * POURQUOI CES RUBRIQUES SONT ICI ET PAS DANS LA BARRE
 * ---------------------------------------------------
 * Cinq entrées est le maximum lisible dans une barre d'onglets : au-delà, les
 * libellés se tronquent et les cibles tactiles se resserrent sous le seuil où
 * l'on touche juste du premier coup. Les rubriques de cet écran se consultent en
 * outre beaucoup moins souvent que l'accueil, la cantine, l'agenda ou le
 * contact — et rien ne justifie de leur donner la même place.
 *
 * AUCUNE N'EST SUPPRIMÉE
 * ----------------------
 * La discussion, les signalements et les actualités existaient comme onglets
 * avant la refonte. Elles sont **reclassées**, pas retirées : leurs écrans, leurs
 * tables et leurs politiques sont inchangés, et on y accède par ce menu.
 *
 * POURQUOI CET ÉCRAN NE CHARGE PLUS RIEN LUI-MÊME
 * -----------------------------------------------
 * Il portait un `useAsyncData` dont la seule donnée était le nombre de non-lus,
 * relu au retour sur l'écran pour corriger un badge périmé. C'était la troisième
 * copie du même chiffre — et la seule des trois qui se corrigeait. Les deux
 * autres, la pastille de l'onglet et la cloche de l'accueil, continuaient
 * d'annoncer des messages déjà lus.
 *
 * Le compte est maintenant partagé, publié par `src/services/unread.ts` et lu par
 * `useNonLus` : plus de relecture au retour, plus de drapeau de premier
 * affichage, et plus de tirer-pour-rafraîchir sur un menu dont le contenu ne
 * dépend pas du réseau. L'écran redevient ce qu'il est — une liste de rubriques —
 * et il reste utilisable hors ligne, ce que la version précédente ne garantissait
 * que par un commentaire.
 */
export function PlusScreen({ navigation }: NativeStackScreenProps<PlusStackParamList, 'PlusHome'>) {
  const userId = useCurrentUserId();
  const { profile, signOut } = useAuth();
  const nonLus = useNonLus(userId);
  const role = profile?.role === 'admin' ? 'Bureau de l’association' : 'Adhérent';

  const renderItem = useCallback(
    ({ item }: { readonly item: Entree }) => {
      const { ink, soft } = accents[item.accent];
      const badge = item.cle === 'Discussion' && nonLus > 0 ? nonLus : null;

      return (
        <Pressable
          onPress={() => {
            navigation.navigate(item.cle);
          }}
          accessibilityRole="button"
          accessibilityLabel={
            badge === null
              ? `${item.titre}. ${item.sousTitre}`
              : `${item.titre}. ${item.sousTitre}. ${badge} non lu${badge > 1 ? 's' : ''}`
          }
          style={({ pressed }) => [styles.entree, pressed && styles.entreeAppuyee]}
        >
          <View style={[styles.pastille, { backgroundColor: soft }]}>
            <Ionicons name={item.icone} size={20} color={ink} />
          </View>

          <View style={styles.entreeTexte}>
            <AppText variant="body" bold>
              {item.titre}
            </AppText>
            <AppText variant="caption" numberOfLines={1}>
              {item.sousTitre}
            </AppText>
          </View>

          {badge === null ? null : (
            <View style={styles.badge}>
              <AppText
                variant="caption"
                bold
                color={colors.textOnPrimary}
                style={styles.badgeTexte}
              >
                {badge > 9 ? '9+' : badge}
              </AppText>
            </View>
          )}

          <Ionicons name="chevron-forward" size={18} color={colors.textSecondary} />
        </Pressable>
      );
    },
    [navigation, nonLus],
  );

  return (
    <Screen padded={false} edges={[]}>
      <FlatList
        data={ENTREES}
        keyExtractor={(item) => item.cle}
        renderItem={renderItem}
        contentContainerStyle={styles.liste}
        ListHeaderComponent={
          <Card elevated style={styles.identite}>
            <AppText variant="heading">{profile?.display_name ?? 'Adhérent'}</AppText>
            <AppText variant="caption">{role}</AppText>
          </Card>
        }
        ListFooterComponent={
          <View style={styles.pied}>
            {/* Ni bandeau d'erreur ni bouton « Réessayer » : le seul chargement
                de cet écran est le compte des non-lus, et il n'a pas d'échec
                visible — voir `rafraichirNonLus`, qui ne rejette jamais. Une
                rubrique injoignable se signale dans son propre écran, là où
                l'adhérent la demande. */}
            <Button
              label="Se déconnecter"
              variant="secondary"
              onPress={() => {
                void signOut();
              }}
            />
          </View>
        }
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  liste: {
    padding: spacing.lg,
    gap: spacing.md,
  },
  identite: {
    gap: spacing.xs,
  },
  entree: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.md,
  },
  entreeAppuyee: {
    opacity: 0.7,
  },
  pastille: {
    width: 40,
    height: 40,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  entreeTexte: {
    flex: 1,
    gap: 2,
  },
  badge: {
    minWidth: 22,
    height: 22,
    borderRadius: radius.pill,
    backgroundColor: colors.danger,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 5,
  },
  badgeTexte: {
    fontSize: 11,
    lineHeight: 14,
  },
  pied: {
    gap: spacing.md,
    marginTop: spacing.md,
  },
});
