import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useCallback } from 'react';
import { FlatList, RefreshControl, StyleSheet, View, type ListRenderItemInfo } from 'react-native';

import { AppText, AsyncErrorBanner, AsyncFallback, Badge, Screen } from '@/components';
import { useAsyncData } from '@/hooks/useAsyncData';
import type { PlusStackParamList } from '@/navigation/types';
import { fetchAnnonce } from '@/services/annonces';
import { colors, spacing } from '@/theme';
import { annonceCategoryStyle } from '@/theme/categories';
import { ANNONCE_CATEGORY_LABELS, type AnnonceWithAuthor } from '@/types/models';
import { formatRelativeDay } from '@/utils/date';

const VIDE: readonly AnnonceWithAuthor[] = [];

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
 * POURQUOI LA LISTE D'UN SEUL ÉLÉMENT
 * -----------------------------------
 * L'écran passe par une `FlatList` à un élément plutôt que par une vue
 * défilante : c'est la forme qui donne le tirer-pour-rafraîchir **et** la garde
 * de vacuité que le contrôle des câblages exige. Un article est une liste de
 * zéro ou une ligne, et l'écrire ainsi rend l'état vide représentable sans
 * condition supplémentaire : `ListEmptyComponent` est l'emplacement prévu pour
 * cela, et il n'est monté que si la liste est vide.
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

  const loader = useCallback(() => fetchAnnonce(id), [id]);
  const { status, data, errorMessage, refreshing, refresh, reload } = useAsyncData(loader);

  // Une liste de zéro ou une ligne : l'absence d'article est l'état vide de
  // cette liste, et non un cas à part.
  const articles = data === null ? VIDE : [data];

  const renderItem = useCallback(({ item }: ListRenderItemInfo<AnnonceWithAuthor>) => {
    const style = annonceCategoryStyle(item.category);

    return (
      <View style={styles.article}>
        <Badge
          label={ANNONCE_CATEGORY_LABELS[item.category] ?? 'Information'}
          accent={style.accent}
          icon={style.icon}
        />

        <AppText variant="title">{item.title}</AppText>

        <View style={styles.repere}>
          <AppText variant="caption">{formatRelativeDay(item.published_at)}</AppText>
          {item.authorName === null ? null : (
            <AppText variant="caption" numberOfLines={1} style={styles.auteur}>
              · {item.authorName}
            </AppText>
          )}
        </View>

        {/* Le texte entier, sans coupe : c'est la raison d'être de l'écran. */}
        <AppText variant="body">{item.body}</AppText>
      </View>
    );
  }, []);

  return (
    <Screen padded={false} edges={[]}>
      <FlatList
        data={articles}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        contentContainerStyle={[styles.page, articles.length === 0 && styles.pageVide]}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={colors.primary} />
        }
        ListHeaderComponent={
          <AsyncErrorBanner
            status={status}
            hasData={articles.length > 0}
            errorMessage={errorMessage}
          />
        }
        ListEmptyComponent={
          <AsyncFallback
            status={status}
            hasData={articles.length > 0}
            errorMessage={errorMessage}
            onRetry={reload}
            emptyTitle="Actualité introuvable"
            emptyDescription="Elle a peut-être été retirée depuis l'affichage de la liste."
            emptyIcon="megaphone-outline"
            loadingMessage="Chargement de l'actualité…"
          />
        }
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  page: {
    padding: spacing.lg,
  },
  pageVide: {
    flexGrow: 1,
  },
  article: {
    gap: spacing.sm,
  },
  repere: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  auteur: {
    flexShrink: 1,
  },
});
