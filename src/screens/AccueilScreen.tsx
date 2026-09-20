import { Ionicons } from '@expo/vector-icons';
import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import { useCallback } from 'react';
import {
  FlatList,
  Image,
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
import { photoDuBandeau } from '@/services/documents';
import {
  REGLAGES_PAR_DEFAUT,
  fetchReglagesBandeau,
  type ReglagesBandeau,
} from '@/services/reglages';
import { fetchSondages, sondageOuvert } from '@/services/sondages';
import { accents, colors, radius, spacing, type TintedAccent } from '@/theme';
import type { AnnonceWithAuthor } from '@/types/models';

const VIDE: readonly AnnonceWithAuthor[] = [];

/**
 * Hauteur du bandeau de l'école, en points.
 *
 * Assez haute pour qu'une photographie se voie — c'est le premier écran, et
 * c'est là que passe le regard —, assez courte pour que la salutation et la
 * première actualité restent visibles sans faire défiler. Sur un téléphone de
 * 800 points de haut, elle en occupe un peu plus du cinquième.
 *
 * Elle est écrite ici plutôt que dans le tableau de styles parce qu'elle ne sert
 * qu'à cet endroit, et qu'un nombre isolé dans un `StyleSheet` se cherche.
 */
const BANDEAU = 172;

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
  /**
   * L'adresse signée de la photographie de l'école, ou `null`.
   *
   * `null` tant que le bureau n'en a pas déposé, et c'est le cas courant : le
   * bandeau de l'accueil est alors **dessiné** — la même mise en page, le même
   * emplacement, la même hauteur. Une photographie prend sa place sans que rien
   * d'autre ne bouge, ce qui évite le saut de mise en page qu'une hauteur
   * différente produirait à l'arrivée de la photo.
   */
  readonly bandeau: string | null;
  /**
   * Le titre et la devise affichés sous la photographie de l'école.
   *
   * Ils ne viennent plus du code : le bureau les règle depuis le tableau de bord,
   * et `fetchReglagesBandeau` rend les textes d'avant quand la base n'a rien à
   * dire. Voir `src/services/reglages.ts` — c'est le seul endroit du dépôt où une
   * lecture avale son erreur, et la raison y est écrite.
   */
  readonly reglages: ReglagesBandeau;
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
    //
    //  Le bandeau part **avec** les photos, dans le même `Promise.all` : deux
    //  attentes menées de front valent mieux qu'une troisième à la suite, et le
    //  bandeau n'a besoin de rien de ce que les annonces rapportent — son chemin
    //  est convenu, il n'est pas lu en base.
    //
    //  Le titre et la devise du bandeau, eux, **sont** lus en base, et ils
    //  rejoignent cette attente plutôt que d'en ouvrir une quatrième. La lecture
    //  ne peut pas échouer : elle rend les textes d'avant si la table manque.
    const [photos, bandeau, reglages] = await Promise.all([
      photosDesAnnonces(annonces),
      photoDuBandeau(),
      fetchReglagesBandeau(),
    ]);

    return { annonces, photos, bandeau, reglages, sondage: sondageOuvert(sondages) };
  }, []);

  const { status, data, errorMessage, refreshing, refresh, reload } = useAsyncData(loader);

  const annonces = data?.annonces ?? VIDE;
  const photos = data?.photos ?? AUCUNE_PHOTO;
  const bandeau = data?.bandeau ?? null;
  const reglages = data?.reglages ?? REGLAGES_PAR_DEFAUT;
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
              photoUrl={bandeau}
              reglages={reglages}
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
 * L'en-tête de l'accueil : le bandeau de l'école, puis la salutation.
 *
 * LE BANDEAU EST DESSINÉ TANT QU'AUCUNE PHOTO N'EST DÉPOSÉE
 * ---------------------------------------------------------
 * La maquette place une photographie de l'école en tête de l'accueil. Aucune
 * photographie n'est disponible dans le dépôt, et en inventer une reviendrait à
 * illustrer l'application avec un bâtiment qui n'est pas le sien — sur une
 * application destinée aux familles d'une école précise, c'est un détail qui se
 * remarque.
 *
 * Le bandeau est donc **dessiné** tant que le bureau n'a rien déposé : l'icône
 * de l'école, le nom de l'établissement et sa devise, sur le bleu pâle de la
 * marque. Dès qu'une photographie existe au chemin convenu
 * (`CHEMIN_BANDEAU`), elle prend la place du dessin **sans que la mise en page
 * change d'un point** — même hauteur, mêmes rayons, même place pour le texte.
 * C'est ce qui rend le dépôt depuis le tableau de bord invisible pour
 * l'application : rien n'est à recompiler, rien n'est à modifier.
 *
 * POURQUOI LE TEXTE EST POSÉ SUR LA PHOTO, ET COMMENT IL RESTE LISIBLE
 * --------------------------------------------------------------------
 * La maquette veut le nom de l'école **par-dessus** la photographie. Un texte
 * blanc sur une photographie quelconque n'a aucune lisibilité garantie : le
 * bureau peut déposer une photo de cour enneigée, où le blanc sur blanc
 * disparaît. Deux voiles sombres sont donc posés entre la photo et le texte —
 * un léger sur toute l'image, qui unifie, et un plus dense sous le texte, qui
 * porte la lecture.
 *
 * Les valeurs sont **mesurées sur le pire cas**, et le pire cas est une
 * photographie entièrement blanche : les deux voiles s'y composent en un fond
 * `#6D7179`, sur lequel le blanc vaut **4,90:1** — au-dessus des 4,5:1 qu'exige
 * une légende de 13 points. Sur une photographie sombre, le rapport ne peut
 * qu'être meilleur. Les voiles sont écrits en clair plutôt que pris dans la
 * palette : ce ne sont pas des couleurs de l'application, ce sont des
 * **opacités posées sur une image inconnue**, et leur valeur n'a de sens qu'avec
 * le calcul ci-dessus.
 *
 * POURQUOI LE MESSAGE D'ACCUEIL EST ICI ET NON DANS UNE DONNÉE
 * -----------------------------------------------------------
 * « Bonjour », la phrase de présentation et la ligne de rentrée ne viennent pas
 * de la base : ce sont des phrases de l'application, pas des informations
 * publiées par le bureau. Les faire transiter par une table les rendrait
 * modifiables par erreur, et obligerait à une requête de plus pour afficher une
 * phrase qui ne change pas.
 *
 * LE NOM DE L'ÉCOLE ET SA DEVISE, EUX, ONT CHANGÉ DE CAMP
 * ------------------------------------------------------
 * Ils étaient rangés du même côté que les phrases ci-dessus, et c'était cohérent
 * tant que personne ne demandait à les changer. Le bureau l'a demandé — et une
 * phrase que le bureau change est, par définition, une information **publiée**.
 * Le titre et la devise sont donc devenus des données (`public.reglages`), lus
 * une fois avec le reste de l'accueil et repliés sur les textes d'avant si la
 * base n'a rien à dire. La frontière n'a pas bougé : ce que le bureau publie
 * vient de la base, ce que l'application dit d'elle-même reste ici.
 *
 * CE QUI A CHANGÉ, ET POURQUOI RIEN N'A ÉTÉ PERDU
 * ----------------------------------------------
 * L'ancienne carte portait la devise « Ensemble pour la réussite et le
 * bien-être de nos enfants », suivie d'un cœur. La maquette met à cette place
 * deux autres phrases, et elles **disent davantage** : la première explique ce
 * que contient l'application, la seconde souhaite la rentrée. La devise, elle,
 * n'est pas perdue — elle est passée dans le bandeau, sous le nom de l'école,
 * qui est l'endroit où elle se lit comme une signature plutôt que comme une
 * phrase de plus.
 *
 * Le cœur, enfin, n'a pas disparu non plus : le bandeau du bas le porte.
 */
function Hero({
  prenom,
  nonLus,
  photoUrl,
  reglages,
  onNotifications,
}: {
  readonly prenom: string;
  readonly nonLus: number;
  readonly photoUrl: string | null;
  readonly reglages: ReglagesBandeau;
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
      <Bandeau photoUrl={photoUrl} titre={reglages.titre} devise={reglages.devise} />

      <View style={styles.heroHaut}>
        <View style={styles.heroTexte}>
          <AppText variant="caption">Montmagny</AppText>
          <AppText variant="title">Bonjour{prenom === '' ? ' !' : ` ${prenom} !`}</AppText>

          {/*
            La phrase de la maquette, et elle dit quelque chose que rien d'autre
            ne dit : ce que cette application contient. Le titre au-dessus
            salue, la devise du bandeau au-dessus est une intention — aucune
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
    </Card>
  );
}

/**
 * Le bandeau de l'école : une photographie si le bureau en a déposé une, un
 * dessin sinon.
 *
 * LES DEUX FONDS, UN SEUL TEXTE
 * -----------------------------
 * Le texte est écrit **une fois**, et seule sa couleur change selon le fond :
 * blanc sur la photographie, bleu de marque sur le dessin. Deux blocs de texte
 * auraient été deux occasions de corriger l'un sans l'autre — et c'est le genre
 * d'écart qui ne se voit que sur un appareil, dans un seul des deux états.
 *
 * La couleur est choisie par une variable et non par un ternaire répété trois
 * fois : le sur-titre, le nom et la devise doivent basculer **ensemble**, sinon
 * un blanc se retrouverait sur le bleu pâle, où il vaut 1,1:1.
 *
 * LE TEXTE EST MASQUÉ AUX LECTEURS D'ÉCRAN
 * ----------------------------------------
 * Le nom de l'école est déjà porté par l'en-tête de navigation, juste au-dessus,
 * et la devise est une signature. Les énoncer ici doublerait chaque annonce de
 * la page pour une information que l'adhérent a déjà entendue. L'image, elle,
 * est décorative : son contenu est le nom de l'école, écrit juste à côté.
 */
function Bandeau({
  photoUrl,
  titre,
  devise,
}: {
  readonly photoUrl: string | null;
  readonly titre: string;
  readonly devise: string;
}) {
  const surPhoto = photoUrl !== null;
  const encre = surPhoto ? colors.textOnPrimary : colors.primary;

  return (
    <View style={styles.bandeauEcole} accessibilityElementsHidden>
      {photoUrl === null ? null : (
        <>
          <Image
            source={{ uri: photoUrl }}
            style={StyleSheet.absoluteFill}
            resizeMode="cover"
            accessibilityElementsHidden
          />
          {/*
            Le voile léger, sur toute l'image. Il ne porte pas la lecture : il
            empêche une photographie très claire de paraître surexposée à côté
            du blanc de la carte.
          */}
          <View style={[StyleSheet.absoluteFill, styles.voileLeger]} />
        </>
      )}

      {photoUrl === null ? (
        <Ionicons name="school" size={54} color={colors.primaryTint} style={styles.ecole} />
      ) : null}

      <View style={[styles.legende, surPhoto ? styles.legendeSurPhoto : null]}>
        <AppText variant="title" bold color={encre}>
          {titre}
        </AppText>
        <AppText variant="caption" color={encre} style={styles.deviseEcole}>
          {devise}
        </AppText>
      </View>
    </View>
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
    // Deux lignes au plus avant que le bloc ne prenne toute la carte : la
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
  /**
   * Le bandeau de l'école.
   *
   * La hauteur est **fixe**, et c'est ce qui permet à la photographie de
   * remplacer le dessin sans que rien ne bouge : une hauteur déduite du contenu
   * — `aspectRatio` sur l'image, ou la place du texte — ferait sauter toute la
   * page le jour du dépôt, et le décalage se produirait une seule fois, sur
   * l'appareil du bureau, au moment précis où personne ne regarde.
   *
   * `overflow: 'hidden'` est indispensable avec `StyleSheet.absoluteFill` : sans
   * lui, la photographie déborde des coins arrondis et le bandeau se lit comme
   * un rectangle posé sur une carte arrondie.
   *
   * Le fond bleu pâle est celui du dessin. Il ne se voit pas quand une photo est
   * là — elle le recouvre entièrement —, mais il tient la place pendant le
   * chargement de l'image, et il est le seul fond visible si la photo échoue à
   * s'afficher.
   */
  bandeauEcole: {
    height: BANDEAU,
    borderRadius: radius.lg,
    backgroundColor: accents.bleu.soft,
    overflow: 'hidden',
    justifyContent: 'flex-end',
  },
  ecole: {
    position: 'absolute',
    top: spacing.md,
    right: spacing.md,
  },
  voileLeger: {
    //  Vingt pour cent de noir bleuté sur toute la photographie. Voir le calcul
    //  du pire cas dans le commentaire de `Hero`.
    backgroundColor: 'rgba(11, 18, 32, 0.2)',
  },
  legende: {
    gap: 2,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
  },
  legendeSurPhoto: {
    //  Cinquante pour cent, sous le texte. Composés avec les vingt pour cent
    //  ci-dessus, ils donnent soixante pour cent sur le pire cas — une
    //  photographie blanche —, et 4,90:1 pour le blanc posé dessus.
    backgroundColor: 'rgba(11, 18, 32, 0.5)',
    paddingTop: spacing.sm,
  },
  deviseEcole: {
    flexShrink: 1,
    fontSize: 12,
    lineHeight: 16,
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
