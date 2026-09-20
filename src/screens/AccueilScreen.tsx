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
import { fetchAnnonces, photosDesAnnonces } from '@/services/annonces';
import { fetchSondages, sondageOuvert } from '@/services/sondages';
import { accents, colors, radius, spacing, type TintedAccent } from '@/theme';
import type { AnnonceWithAuthor } from '@/types/models';

const VIDE: readonly AnnonceWithAuthor[] = [];

/**
 * Aucune photo, et la même table pour tous les rendus.
 *
 * Une table vide écrite à chaque rendu (`new Map()`) changerait d'identité à
 * chaque passage, ce qui suffirait à recréer le `renderItem` de la liste — donc
 * à redemander le rendu de chaque carte — sans qu'aucune donnée n'ait bougé.
 */
const AUCUNE_PHOTO: ReadonlyMap<string, string> = new Map();

/** Ce que l'accueil charge en une fois. */
interface DonneesAccueil {
  readonly annonces: readonly AnnonceWithAuthor[];
  /**
   * Les photos, indexées par identifiant d'actualité.
   *
   * Elles sont chargées **avec** les annonces, et non par les cartes : le
   * compartiment est privé, chaque photo demande une adresse signée, et c'est
   * ici que la signature se fait — une fois pour toute la liste. Voir
   * `photosDesAnnonces`.
   */
  readonly photos: ReadonlyMap<string, string>;
  readonly sondage: ReturnType<typeof sondageOuvert>;
}

/**
 * Les raccourcis, dans l'ordre et les teintes de la maquette.
 *
 * DÉCLARÉS PAR RANGÉES, ET NON EN UNE SEULE LISTE
 * ----------------------------------------------
 * La maquette montre **deux cartes par rangée**. Écrire une liste plate puis la
 * découper au rendu obligerait à relire le rendu pour savoir ce que l'écran
 * affiche ; écrite par rangées, la grille se lit dans la donnée. Les quatre
 * entrées portent à la fois leur libellé, leur sous-titre, leur icône, leur
 * accent et leur destination — dispersés en JSX, ces cinq éléments tiendraient
 * sur trente lignes, et l'oubli de l'un d'eux ne se verrait qu'à l'écran.
 *
 * LES TEINTES SONT CELLES DE LA MAQUETTE
 * --------------------------------------
 * « Nous contacter » en bleu, « Sondages » en violet, « Cantine » en vert,
 * « Agenda » en ambre. L'ambre a demandé un carré de plus dans la palette
 * (`warningTint`), mesuré à 3,73:1 — voir `src/theme/index.ts`.
 */
interface Raccourci {
  readonly cle: 'cantine' | 'agenda' | 'contact' | 'sondages';
  readonly titre: string;
  readonly sousTitre: string;
  readonly icone: keyof typeof Ionicons.glyphMap;
  readonly accent: TintedAccent;
}

const RACCOURCIS: readonly (readonly Raccourci[])[] = [
  [
    {
      cle: 'contact',
      titre: 'Nous contacter',
      sousTitre: 'Une question ?',
      icone: 'chatbubble-ellipses-outline',
      accent: 'bleu',
    },
    {
      cle: 'sondages',
      titre: 'Sondages',
      sousTitre: 'Donnez votre avis',
      icone: 'stats-chart-outline',
      accent: 'violet',
    },
  ],
  [
    {
      cle: 'cantine',
      titre: 'Cantine',
      // « Menus et réservations » jusqu'ici, et c'était devenu faux : l'écran de
      // cantine ne réserve plus rien, et il le dit lui-même. Un sous-titre qui
      // annonce une action que l'écran refuse est la pire des promesses — celle
      // qui ne se voit que sur l'appareil, après avoir appuyé.
      sousTitre: 'Menus publiés',
      icone: 'restaurant-outline',
      accent: 'vert',
    },
    {
      cle: 'agenda',
      titre: 'Agenda',
      sousTitre: 'Tous les événements',
      icone: 'calendar-outline',
      accent: 'ambre',
    },
  ],
];

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
    //
    // `fetchSondages()` ne prend plus d'identifiant d'adhérent : un sondage se
    // lit et se vote **sans compte**, et le choix de cet appareil est relu dans
    // les préférences locales plutôt que filtré par `auth.uid()`.
    const [annonces, sondages] = await Promise.all([fetchAnnonces(), fetchSondages()]);

    //  Les photos se signent **après** la lecture des annonces, et non en
    //  parallèle : il faut connaître les chemins pour les demander. C'est un
    //  second aller-retour, mais un seul pour toute la liste — et il est nul
    //  quand aucune actualité n'est illustrée, ce qui reste le cas courant.
    return {
      annonces,
      photos: await photosDesAnnonces(annonces),
      sondage: sondageOuvert(sondages),
    };
  }, []);

  const { status, data, errorMessage, refreshing, refresh, reload } = useAsyncData(loader);

  const annonces = data?.annonces ?? VIDE;
  const photos = data?.photos ?? AUCUNE_PHOTO;
  const sondage = data?.sondage ?? null;
  const prenom = profile?.display_name ?? '';
  const nonLus = useNonLus(userId);

  const ouvrir = useCallback(
    (cle: Raccourci['cle']) => {
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

  //  La carte coupée à trois lignes ouvre l'article, et le repère « Lire la
  //  suite » le dit. C'est le seul endroit de l'application où la carte est
  //  touchable : la rubrique « Actualités » montre déjà le texte entier, et y
  //  promettre une suite qui est sous les yeux serait un mensonge visible.
  //
  //  La photo est passée, jamais résolue : elle est déjà signée, une fois pour
  //  la liste entière. Une actualité sans photo reçoit `null` et sa carte porte
  //  alors l'illustration de sa catégorie.
  const renderItem = useCallback(
    ({ item }: ListRenderItemInfo<AnnonceWithAuthor>) => (
      <AnnonceCard
        annonce={item}
        photoUrl={photos.get(item.id) ?? null}
        onPress={() => navigation.navigate('Plus', { screen: 'Annonce', params: { id: item.id } })}
      />
    ),
    [navigation, photos],
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
              {RACCOURCIS.map((rangee, rang) => (
                <View key={rang} style={styles.rangeeRaccourcis}>
                  {rangee.map((raccourci) => (
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
 * « Bonjour », la phrase de présentation et la ligne de rentrée ne viennent pas
 * de la base : ce sont des phrases de l'application, pas des informations
 * publiées par le bureau. Les faire transiter par une table les rendrait
 * modifiables par erreur, et obligerait à une requête de plus pour afficher une
 * phrase qui ne change pas.
 *
 * CE QUI A CHANGÉ, ET POURQUOI RIEN N'A ÉTÉ PERDU
 * ----------------------------------------------
 * L'ancienne carte portait la devise « Ensemble pour la réussite et le
 * bien-être de nos enfants », suivie d'un cœur. La maquette met à cette place
 * deux autres phrases, et elles **disent davantage** : la première explique ce
 * que contient l'application, la seconde souhaite la rentrée. La devise, elle,
 * n'est pas perdue — elle est la même intention que celle du panneau, qui
 * affiche « Grandir · Apprendre · S'épanouir ensemble ». Écrire les deux
 * revenait à dire deux fois la même chose à deux centimètres d'écart.
 *
 * Le cœur, enfin, n'a pas disparu non plus : le bandeau du bas le porte.
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

          {/*
            La phrase de la maquette, et elle dit quelque chose que rien d'autre
            ne dit : ce que cette application contient. Le titre au-dessus
            salue, la devise du panneau en dessous est une intention — aucune
            des deux n'apprend à un parent qui ouvre l'application pour la
            première fois ce qu'il va y trouver.
          */}
          <AppText variant="caption" style={styles.heroSousTitre}>
            Les informations de l’école et de l’association de parents.
          </AppText>

          {/*
            La ligne manuscrite de la maquette. Elle est écrite **en italique et
            en bleu** plutôt que dans une police manuscrite : ajouter une police
            à l'application pour une phrase serait une dépendance de plus, et
            une police qui manque au chargement ne se voit qu'au premier
            lancement, hors ligne.
          */}
          <View style={styles.tagline}>
            <Ionicons name="sunny" size={15} color={accents.ambre.ink} />
            <AppText variant="caption" color={accents.bleu.ink} style={styles.taglineTexte}>
              Une belle année ensemble !
            </AppText>
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
  heroSousTitre: {
    // Deux lignes au plus avant que le panneau ne prenne toute la carte : la
    // phrase est courte, et sur un écran étroit elle se replie d'elle-même.
    flexShrink: 1,
  },
  tagline: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginTop: spacing.xs,
  },
  taglineTexte: {
    flexShrink: 1,
    fontStyle: 'italic',
    fontSize: 14,
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
    // Deux rangées de deux cartes, empilées. Une seule rangée de quatre
    // obligeait chaque carte à tenir dans un quart de largeur, et le texte y
    // descendait à dix points ; deux rangées lui rendent sa taille. La grille
    // se lit ici, l'ordre des cartes dans la donnée.
    gap: spacing.sm,
  },
  rangeeRaccourcis: {
    flexDirection: 'row',
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
