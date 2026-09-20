import { useCallback } from 'react';
import { FlatList, RefreshControl, StyleSheet, type ListRenderItemInfo } from 'react-native';

import { AnnonceCard, AsyncErrorBanner, AsyncFallback, Screen } from '@/components';
import { useAsyncData } from '@/hooks/useAsyncData';
import { fetchAnnonces, photosDesAnnonces } from '@/services/annonces';
import { colors, spacing } from '@/theme';
import type { AnnonceWithAuthor } from '@/types/models';

const VIDE: readonly AnnonceWithAuthor[] = [];
const AUCUNE_PHOTO: ReadonlyMap<string, string> = new Map();

/** Ce que la rubrique charge en une fois : les actualités, et leurs photos. */
interface ListeActualites {
  readonly annonces: readonly AnnonceWithAuthor[];
  readonly photos: ReadonlyMap<string, string>;
}

/**
 * Toutes les actualités, texte entier.
 *
 * POURQUOI CET ÉCRAN EXISTE ALORS QUE L'ACCUEIL LES MONTRE DÉJÀ
 * ------------------------------------------------------------
 * L'accueil en montre les plus récentes, coupées à trois lignes, sous un titre
 * qui annonce « Actualités récentes » et un lien « Voir tout ». Le lien doit
 * mener quelque part : sans cet écran, il mènerait à une liste plus courte que
 * celle qu'il promet, ou à rien du tout.
 *
 * C'est aussi ce qui remplace l'ancien onglet « Informations ». Les données, la
 * table et la politique sont les mêmes — seul l'écran change, et l'ancien a été
 * retiré plutôt que laissé en place sans être atteignable.
 *
 * LES PHOTOS SE SIGNENT ICI AUSSI, ET UNE SEULE FOIS
 * --------------------------------------------------
 * Même raison que sur l'accueil : le compartiment est privé, et signer depuis la
 * carte ferait une requête par actualité. Le chargement reste **un** chargeur
 * pour la page entière — c'est le contrat d'`useAsyncData` —, et non deux états
 * de chargement qui se succéderaient à l'écran.
 */
export function ActualitesScreen() {
  const loader = useCallback(async (): Promise<ListeActualites> => {
    const annonces = await fetchAnnonces();

    return { annonces, photos: await photosDesAnnonces(annonces) };
  }, []);

  const { status, data, errorMessage, refreshing, refresh, reload } = useAsyncData(loader);

  const annonces = data?.annonces ?? VIDE;
  const photos = data?.photos ?? AUCUNE_PHOTO;

  const renderItem = useCallback(
    ({ item }: ListRenderItemInfo<AnnonceWithAuthor>) => (
      // Le texte entier : on vient ici pour lire, pas pour parcourir.
      <AnnonceCard annonce={item} lines={undefined} photoUrl={photos.get(item.id) ?? null} />
    ),
    [photos],
  );

  return (
    <Screen padded={false} edges={[]}>
      <FlatList
        data={annonces}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        contentContainerStyle={[styles.liste, annonces.length === 0 && styles.listeVide]}
        // Un écran de pile n'est pas démonté au retour : sans rafraîchissement
        // explicite, une annonce publiée entre-temps resterait invisible.
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={colors.primary} />
        }
        ListHeaderComponent={
          <AsyncErrorBanner
            status={status}
            hasData={annonces.length > 0}
            errorMessage={errorMessage}
          />
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
            loadingMessage="Chargement des actualités…"
          />
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
  listeVide: {
    flexGrow: 1,
  },
});
