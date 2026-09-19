import { Ionicons } from '@expo/vector-icons';
import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import { useCallback } from 'react';
import {
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  View,
  type ListRenderItemInfo,
} from 'react-native';

import { useAuth } from '@/auth/AuthProvider';
import {
  AnnonceCard,
  AppText,
  AsyncErrorBanner,
  AsyncFallback,
  Badge,
  Button,
  Card,
  Screen,
  SectionHeader,
  ShortcutCard,
} from '@/components';
import { useAsyncData } from '@/hooks/useAsyncData';
import { useNonLus } from '@/hooks/useNonLus';
import type { MainTabParamList } from '@/navigation/types';
import { fetchAnnonces } from '@/services/annonces';
import { fetchSondages, sondageOuvert } from '@/services/sondages';
import { accents, colors, radius, spacing } from '@/theme';
import type { AnnonceWithAuthor } from '@/types/models';

const VIDE: readonly AnnonceWithAuthor[] = [];

/** Ce que l'accueil charge en une fois. */
interface DonneesAccueil {
  readonly annonces: readonly AnnonceWithAuthor[];
  readonly sondage: ReturnType<typeof sondageOuvert>;
}

/**
 * Les raccourcis, dans l'ordre de la maquette.
 *
 * Déclarés comme données plutôt qu'écrits à la main dans le rendu : chaque
 * entrée porte à la fois son libellé, son sous-titre, son icône, son accent et
 * sa destination. Écrits en JSX, ces cinq éléments se retrouveraient dispersés
 * sur trente lignes, et l'oubli de l'un d'eux — un sous-titre, un accent — ne se
 * verrait qu'à l'écran.
 */
const RACCOURCIS = [
  {
    cle: 'cantine',
    titre: 'Cantine',
    sousTitre: 'Menus et réservations',
    icone: 'restaurant-outline',
    accent: 'vert',
  },
  {
    cle: 'agenda',
    titre: 'Agenda',
    sousTitre: 'Tous les événements',
    icone: 'calendar-outline',
    accent: 'rose',
  },
  {
    cle: 'contact',
    titre: 'Nous contacter',
    sousTitre: 'Une question ?',
    icone: 'chatbubble-ellipses-outline',
    accent: 'violet',
  },
  {
    cle: 'sondages',
    titre: 'Sondages',
    sousTitre: 'Donnez votre avis',
    icone: 'stats-chart-outline',
    accent: 'bleu',
  },
] as const;

export function AccueilScreen({ navigation }: BottomTabScreenProps<MainTabParamList, 'Accueil'>) {
  const { profile, session } = useAuth();
  const userId = session?.user.id ?? '';

  const loader = useCallback(async (): Promise<DonneesAccueil> => {
    // Les deux chargements partent ensemble : l'écran affiche tout d'un coup, au
    // lieu de se remplir par morceaux. Sur une connexion mobile médiocre, un
    // enchaînement séquentiel se verrait — la salutation, puis les actualités,
    // chacune après sa propre attente.
    //
    // Le nombre de non-lus n'en fait plus partie. Il est **partagé** avec la
    // pastille de l'onglet « Plus » et la ligne « Discussion », et il vivait donc
    // ici en double : cette copie-ci se rafraîchissait au montage et au tirer
    // pour rafraîchir, jamais au retour d'une lecture. La cloche annonçait des
    // messages déjà lus. Voir `src/hooks/useNonLus.ts`.
    const [annonces, sondages] = await Promise.all([fetchAnnonces(), fetchSondages(userId)]);

    return { annonces, sondage: sondageOuvert(sondages) };
  }, [userId]);

  const { status, data, errorMessage, refreshing, refresh, reload } = useAsyncData(loader);

  const annonces = data?.annonces ?? VIDE;
  const sondage = data?.sondage ?? null;
  const prenom = profile?.display_name ?? '';
  const nonLus = useNonLus(userId);

  const ouvrir = useCallback(
    (cle: (typeof RACCOURCIS)[number]['cle']) => {
      if (cle === 'cantine') {
        navigation.navigate('Cantine');
        return;
      }
      if (cle === 'contact') {
        navigation.navigate('Contact');
        return;
      }
      navigation.navigate('Agenda', { onglet: cle === 'sondages' ? 'sondages' : 'agenda' });
    },
    [navigation],
  );

  const renderItem = useCallback(
    ({ item }: ListRenderItemInfo<AnnonceWithAuthor>) => <AnnonceCard annonce={item} />,
    [],
  );

  return (
    <Screen padded={false} edges={[]}>
      <FlatList
        data={annonces}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        contentContainerStyle={[styles.liste, annonces.length === 0 && styles.listeVide]}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={colors.primary} />
        }
        ListHeaderComponent={
          <>
            <Hero
              prenom={prenom}
              nonLus={nonLus}
              onNotifications={() => {
                navigation.navigate('Plus', { screen: 'Discussion' });
              }}
            />

            <AsyncErrorBanner
              status={status}
              hasData={annonces.length > 0}
              errorMessage={errorMessage}
            />

            <View style={styles.raccourcis}>
              {RACCOURCIS.map((raccourci) => (
                <ShortcutCard
                  key={raccourci.cle}
                  title={raccourci.titre}
                  subtitle={raccourci.sousTitre}
                  icon={raccourci.icone}
                  accent={raccourci.accent}
                  onPress={() => {
                    ouvrir(raccourci.cle);
                  }}
                />
              ))}
            </View>

            <SectionHeader
              title="Actualités récentes"
              actionLabel="Voir tout"
              onAction={() => {
                navigation.navigate('Plus', { screen: 'Actualites' });
              }}
            />
          </>
        }
        ListEmptyComponent={
          <AsyncFallback
            status={status}
            hasData={annonces.length > 0}
            errorMessage={errorMessage}
            onRetry={reload}
            emptyTitle="Aucune actualité publiée"
            emptyDescription="Les informations du bureau de l'association apparaîtront ici."
            emptyIcon="megaphone-outline"
            loadingMessage="Chargement des informations…"
          />
        }
        ListFooterComponent={
          <>
            {sondage === null ? null : (
              <CarteSondage
                question={sondage.question}
                precisions={sondage.details}
                aVote={sondage.myChoiceId !== null}
                onParticiper={() => {
                  navigation.navigate('Agenda', { onglet: 'sondages' });
                }}
              />
            )}
            <BandeauEngagement />
          </>
        }
      />
    </Screen>
  );
}

/**
 * L'en-tête de l'accueil.
 *
 * POURQUOI PAS DE PHOTO D'ÉCOLE
 * -----------------------------
 * La maquette place une photographie de l'école dans l'en-tête de l'accueil.
 * Aucune photographie n'est disponible dans le dépôt, et en inventer une
 * reviendrait à illustrer l'application avec un bâtiment qui n'est pas le sien —
 * sur une application destinée aux familles d'une école précise, c'est un détail
 * qui se remarque.
 *
 * La place est donc tenue par un bandeau dessiné : une icône d'école et la
 * devise de l'établissement, sur un fond bleu pâle. Une photographie peut
 * prendre sa place le jour où elle sera fournie, sans changer la mise en page —
 * le bandeau a exactement les mêmes dimensions.
 *
 * POURQUOI LE NOM DE L'ÉCOLE N'EST PAS ICI
 * ---------------------------------------
 * « École Frères Lumières » est le **titre de l'onglet**, donc écrit par
 * l'en-tête de navigation, juste au-dessus. L'écrire aussi dans la carte
 * l'afficherait deux fois, à deux centimètres d'écart. La carte garde ce qui
 * n'est dit nulle part ailleurs : la ville, la salutation et la devise.
 *
 * POURQUOI LE MESSAGE D'ACCUEIL EST ICI ET NON DANS UNE DONNÉE
 * -----------------------------------------------------------
 * « Bonjour » et la devise ne viennent pas de la base : ce sont des phrases de
 * l'application, pas des informations publiées par le bureau. Les faire
 * transiter par une table les rendrait modifiables par erreur, et obligerait à
 * une requête de plus pour afficher une phrase qui ne change pas.
 */
function Hero({
  prenom,
  nonLus,
  onNotifications,
}: {
  readonly prenom: string;
  readonly nonLus: number;
  readonly onNotifications: () => void;
}) {
  const initiales = prenom
    .split(' ')
    .filter((mot) => mot !== '')
    .slice(0, 2)
    .map((mot) => mot.charAt(0).toUpperCase())
    .join('');

  return (
    <Card elevated style={styles.hero}>
      <View style={styles.heroHaut}>
        <View style={styles.heroTexte}>
          <AppText variant="caption">Montmagny</AppText>
          <AppText variant="title">Bonjour{prenom === '' ? ' !' : ` ${prenom} !`}</AppText>
          <View style={styles.devise}>
            <AppText variant="caption" style={styles.deviseTexte}>
              Ensemble pour la réussite et le bien-être de nos enfants
            </AppText>
            <Ionicons name="heart" size={14} color={accents.rose.ink} />
          </View>
        </View>

        <View style={styles.heroActions}>
          <Pressable
            onPress={onNotifications}
            accessibilityRole="button"
            accessibilityLabel={
              nonLus === 0 ? 'Messages' : `Messages, ${nonLus} non lu${nonLus > 1 ? 's' : ''}`
            }
            hitSlop={8}
            style={styles.cloche}
          >
            <Ionicons name="notifications-outline" size={22} color={colors.textPrimary} />
            {nonLus === 0 ? null : (
              <View style={styles.pastilleCloche}>
                <AppText variant="caption" bold color={colors.textOnPrimary} style={styles.compte}>
                  {nonLus > 9 ? '9+' : nonLus}
                </AppText>
              </View>
            )}
          </Pressable>

          <View style={styles.avatar} accessibilityElementsHidden>
            <AppText variant="caption" bold color={colors.textOnPrimary}>
              {initiales === '' ? '?' : initiales}
            </AppText>
          </View>
        </View>
      </View>

      <View style={styles.panneau} accessibilityElementsHidden>
        <Ionicons name="school" size={22} color={colors.primary} />
        <AppText variant="caption" style={styles.deviseEcole}>
          Grandir · Apprendre · S’épanouir ensemble
        </AppText>
      </View>
    </Card>
  );
}

/** La carte de sondage mise en avant, quand un sondage est ouvert. */
function CarteSondage({
  question,
  precisions,
  aVote,
  onParticiper,
}: {
  readonly question: string;
  readonly precisions: string | null;
  readonly aVote: boolean;
  readonly onParticiper: () => void;
}) {
  return (
    <Card elevated style={[styles.carteSondage, { backgroundColor: accents.violet.soft }]}>
      <Badge label="Sondage" accent="violet" icon="stats-chart-outline" />
      <AppText variant="heading">Votre avis nous intéresse</AppText>
      <AppText variant="body">{question}</AppText>
      {precisions === null ? null : (
        <AppText variant="caption" numberOfLines={2}>
          {precisions}
        </AppText>
      )}
      <Button
        label={aVote ? 'Voir le sondage' : 'Participer'}
        variant={aVote ? 'secondary' : 'primary'}
        onPress={onParticiper}
      />
    </Card>
  );
}

/**
 * Le bandeau du bas.
 *
 * Comme le message d'accueil, c'est une phrase de l'application et non une
 * donnée : elle ne vient d'aucune table, et personne ne la publie.
 */
function BandeauEngagement() {
  return (
    <Card style={[styles.bandeau, { backgroundColor: accents.bleu.soft }]}>
      <View style={styles.bandeauTexte}>
        <AppText variant="heading" color={accents.bleu.ink}>
          Des enfants heureux aujourd’hui, un meilleur demain !
        </AppText>
        <AppText variant="caption">Merci à tous les parents engagés.</AppText>
      </View>
      <Ionicons name="heart-circle" size={40} color={accents.rose.ink} />
    </Card>
  );
}

const styles = StyleSheet.create({
  liste: {
    padding: spacing.lg,
    gap: spacing.md,
  },
  listeVide: {
    flexGrow: 1,
  },
  hero: {
    gap: spacing.md,
  },
  heroHaut: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  heroActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  cloche: {
    padding: spacing.xs,
  },
  pastilleCloche: {
    position: 'absolute',
    top: 0,
    right: 0,
    minWidth: 18,
    height: 18,
    borderRadius: radius.pill,
    backgroundColor: colors.danger,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 3,
  },
  compte: {
    fontSize: 11,
    lineHeight: 14,
  },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: radius.pill,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroTexte: {
    flex: 1,
    gap: spacing.xs,
  },
  devise: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.xs,
  },
  deviseTexte: {
    flexShrink: 1,
  },
  panneau: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    borderRadius: radius.lg,
    backgroundColor: accents.bleu.soft,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
  },
  deviseEcole: {
    flexShrink: 1,
    fontSize: 12,
    lineHeight: 16,
    color: colors.primary,
  },
  raccourcis: {
    flexDirection: 'row',
    // Les quatre cartes se partagent la largeur. Elles ne passent pas à la
    // ligne : sur un petit écran elles se resserrent, et le sous-titre est coupé
    // à deux lignes plutôt que de faire déborder la rangée.
    gap: spacing.sm,
  },
  carteSondage: {
    gap: spacing.sm,
  },
  bandeau: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  bandeauTexte: {
    flexShrink: 1,
    gap: spacing.xs,
  },
});
