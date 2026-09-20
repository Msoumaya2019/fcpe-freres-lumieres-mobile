import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useCallback, useMemo } from 'react';
import {
  FlatList,
  Image,
  RefreshControl,
  StyleSheet,
  View,
  type ListRenderItemInfo,
} from 'react-native';

import {
  AppText,
  AsyncErrorBanner,
  AsyncFallback,
  Badge,
  Card,
  CarteCommentaire,
  FormulaireCommentaire,
  Screen,
  SectionHeader,
} from '@/components';
import { useAsyncData } from '@/hooks/useAsyncData';
import type { PlusStackParamList } from '@/navigation/types';
import { fetchAnnonce } from '@/services/annonces';
import { fetchCommentaires, type CibleCommentaire } from '@/services/commentaires';
import { documentUrl } from '@/services/documents';
import { colors, radius, spacing } from '@/theme';
import { annonceCategoryStyle } from '@/theme/categories';
import { ANNONCE_CATEGORY_LABELS, type AnnonceWithAuthor, type Commentaire } from '@/types/models';
import { formatRelativeDay } from '@/utils/date';

const VIDE: readonly Commentaire[] = [];

/**
 * Ce que l'écran charge en un seul aller-retour.
 *
 * POURQUOI UN SEUL CHARGEUR, ET NON TROIS
 * ---------------------------------------
 * L'article, sa photo et ses commentaires s'affichent ensemble : trois
 * `useAsyncData` donneraient trois indicateurs de chargement, trois états
 * d'erreur, et trois boutons « Réessayer » pour une seule page. Le contrat du
 * hook — un état, une relecture, un rafraîchissement — vaut pour la page
 * entière.
 *
 * `photoIndisponible` existe pour une raison précise : l'adresse d'une photo est
 * **signée**, et la signature peut être refusée — politique de compartiment
 * absente, fichier retiré. Un échec à cet endroit ne doit pas emporter
 * l'article : le texte reste lisible, et l'écran **le dit** au lieu de laisser
 * un cadre vide que personne ne saurait expliquer.
 */
interface Article {
  readonly annonce: AnnonceWithAuthor;
  readonly photoUrl: string | null;
  readonly photoIndisponible: boolean;
  readonly commentaires: readonly Commentaire[];
}

/**
 * L'adresse signée d'une photo, ou `null` — sans jamais faire échouer la page.
 *
 * Le compartiment `documents` est privé : l'adresse est signée pour une heure,
 * et jamais écrite en base. Une adresse signée posée en base expirerait au bout
 * d'une heure, et les photos se casseraient toutes seules.
 */
async function adresseDeLaPhoto(chemin: string | null): Promise<string | null> {
  if (chemin === null) {
    return null;
  }

  try {
    return await documentUrl(chemin);
  } catch {
    return null;
  }
}

/**
 * Une actualité, entière — l'écran qu'ouvre « Lire la suite ».
 *
 * POURQUOI CET ÉCRAN EXISTE, ALORS QUE LA RUBRIQUE MONTRE DÉJÀ LE TEXTE ENTIER
 * ---------------------------------------------------------------------------
 * L'accueil coupe ses cartes à trois lignes, et c'est voulu : une carte donne
 * envie d'ouvrir, elle ne remplace pas la lecture. Mais la seule façon d'aller
 * plus loin était le lien « Voir tout », qui mène à la **liste** — on y perdait
 * l'article qu'on venait de commencer, et il fallait le retrouver.
 *
 * « Lire la suite » mène donc à l'article lui-même, et non à une liste où il
 * faut le chercher.
 *
 * L'ARTICLE EST L'EN-TÊTE, LES COMMENTAIRES SONT LA LISTE
 * -------------------------------------------------------
 * C'est la structure qui donne à la fois le tirer-pour-rafraîchir, la garde de
 * vacuité qu'exige le contrôle des câblages, et un état vide qui veut dire
 * quelque chose : « aucun commentaire » est l'état vide de **cette** liste, et
 * l'absence d'article est celui de la page.
 *
 * L'IDENTIFIANT VIENT DE LA ROUTE, PAS DE LA LISTE
 * ------------------------------------------------
 * L'écran relit l'actualité par son identifiant au lieu de recevoir son texte
 * en paramètre. Un paramètre de route est sérialisé et recopié dans l'état de
 * navigation : y faire passer un texte de plusieurs paragraphes le figerait au
 * moment de l'appui, et une correction publiée entre-temps ne se verrait pas.
 * C'est aussi ce qui rend le rafraîchissement utile.
 *
 * L'ABSENCE N'EST PAS UNE PANNE
 * -----------------------------
 * `fetchAnnonce` rend `null` quand l'actualité n'existe plus — retirée entre
 * l'affichage de la liste et l'appui. L'écran le dit alors simplement, au lieu
 * d'annoncer une erreur de lecture : le bandeau rouge est réservé à ce qui a
 * échoué.
 */
export function AnnonceDetailScreen({
  route,
}: NativeStackScreenProps<PlusStackParamList, 'Annonce'>) {
  const { id } = route.params;

  //  La cible est construite **une fois**, et typée : c'est le seul endroit de
  //  l'écran qui sache que ce fil commente une actualité. Le service ne connaît
  //  que trois types de cible, et refuse un appel qui n'en désignerait aucune.
  const cible = useMemo<CibleCommentaire>(() => ({ type: 'annonce', id }), [id]);

  const loader = useCallback(async (): Promise<Article | null> => {
    const annonce = await fetchAnnonce(id);

    if (annonce === null) {
      return null;
    }

    const [commentaires, photoUrl] = await Promise.all([
      fetchCommentaires(cible),
      adresseDeLaPhoto(annonce.image_path),
    ]);

    return {
      annonce,
      photoUrl,
      photoIndisponible: annonce.image_path !== null && photoUrl === null,
      commentaires,
    };
  }, [cible, id]);

  const { status, data, errorMessage, refreshing, refresh, reload } = useAsyncData(loader);

  const article = data;
  const commentaires = article?.commentaires ?? VIDE;

  /**
   * Le fil est rendu par les **mêmes composants** que la cantine et les sondages.
   *
   * C'est la raison pour laquelle le formulaire ne vit plus ici : un commentaire
   * se dépose sous trois cibles, et trois copies du formulaire auraient été
   * trois jeux de bornes de saisie — dont deux que `check-input-limits` ne
   * regarde pas, puisqu'il lit une constante **là où il l'attend**.
   */
  const renderItem = useCallback(
    ({ item }: ListRenderItemInfo<Commentaire>) => <CarteCommentaire commentaire={item} />,
    [],
  );

  return (
    <Screen padded={false} edges={[]}>
      <FlatList
        data={commentaires}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        contentContainerStyle={[styles.page, commentaires.length === 0 && styles.pageVide]}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={colors.primary} />
        }
        ListHeaderComponent={
          <>
            <AsyncErrorBanner
              status={status}
              hasData={article !== null}
              errorMessage={errorMessage}
            />

            {article === null ? null : (
              <>
                <Card>
                  <Badge
                    label={ANNONCE_CATEGORY_LABELS[article.annonce.category] ?? 'Information'}
                    accent={annonceCategoryStyle(article.annonce.category).accent}
                    icon={annonceCategoryStyle(article.annonce.category).icon}
                  />

                  <AppText variant="title">{article.annonce.title}</AppText>

                  <View style={styles.repere}>
                    <AppText variant="caption">
                      {formatRelativeDay(article.annonce.published_at)}
                    </AppText>
                    {article.annonce.authorName === null ? null : (
                      <AppText variant="caption" numberOfLines={1} style={styles.auteur}>
                        · {article.annonce.authorName}
                      </AppText>
                    )}
                  </View>

                  {article.photoUrl === null ? null : (
                    <Image
                      source={{ uri: article.photoUrl }}
                      style={styles.photo}
                      resizeMode="cover"
                      accessibilityLabel={'Photo de l’actualité : ' + article.annonce.title}
                    />
                  )}
                  {/* Une photo qui ne s'affiche pas ne doit pas emporter
                      l'article : le texte reste lisible, et l'écran le dit
                      plutôt que de laisser un cadre vide inexpliqué. */}
                  {article.photoIndisponible ? (
                    <AppText variant="caption" color={colors.danger}>
                      La photo de cette actualité n’a pas pu être chargée.
                    </AppText>
                  ) : null}

                  {/* Le texte entier, sans coupe : c'est la raison d'être de
                      l'écran. */}
                  <AppText variant="body">{article.annonce.body}</AppText>
                </Card>

                <SectionHeader title="Commentaires" />

                <FormulaireCommentaire cible={cible} onDepose={reload} />
              </>
            )}
          </>
        }
        ListEmptyComponent={
          article === null ? (
            <AsyncFallback
              status={status}
              hasData={false}
              errorMessage={errorMessage}
              onRetry={reload}
              emptyTitle="Actualité introuvable"
              emptyDescription="Elle a peut-être été retirée depuis l'affichage de la liste."
              emptyIcon="megaphone-outline"
              loadingMessage="Chargement de l'actualité…"
            />
          ) : (
            <AsyncFallback
              status={status}
              hasData={false}
              errorMessage={errorMessage}
              onRetry={reload}
              emptyTitle="Aucun commentaire"
              emptyDescription="Les commentaires publiés apparaîtront ici, sous l'actualité."
              emptyIcon="chatbubble-outline"
              loadingMessage="Chargement des commentaires…"
            />
          )
        }
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  page: {
    padding: spacing.lg,
    gap: spacing.md,
  },
  pageVide: {
    flexGrow: 1,
  },
  repere: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  auteur: {
    flexShrink: 1,
  },
  photo: {
    width: '100%',
    aspectRatio: 16 / 9,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceMuted,
  },
});
