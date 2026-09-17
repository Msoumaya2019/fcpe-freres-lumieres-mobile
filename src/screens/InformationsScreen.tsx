import { useCallback } from 'react';
import { FlatList, RefreshControl, StyleSheet, type ListRenderItemInfo } from 'react-native';

import { useAuth } from '@/auth/AuthProvider';
import { AppText, AsyncErrorBanner, AsyncFallback, Card, Screen } from '@/components';
import { useAsyncData } from '@/hooks/useAsyncData';
import { fetchAnnonces } from '@/services/annonces';
import { colors, spacing } from '@/theme';
import type { AnnonceWithAuthor } from '@/types/models';
import { formatDateTime } from '@/utils/date';

const EMPTY: readonly AnnonceWithAuthor[] = [];

export function InformationsScreen() {
  const { profile, session } = useAuth();

  const loader = useCallback(() => fetchAnnonces(), []);
  const { status, data, errorMessage, refreshing, refresh, reload } = useAsyncData(loader);

  const annonces = data ?? EMPTY;
  const displayName = profile?.display_name ?? '';

  const renderItem = useCallback(
    ({ item }: ListRenderItemInfo<AnnonceWithAuthor>) => (
      <Card>
        <AppText variant="heading">{item.title}</AppText>
        <AppText variant="caption">
          {item.authorName === null
            ? formatDateTime(item.published_at)
            : `${item.authorName} · ${formatDateTime(item.published_at)}`}
        </AppText>
        <AppText>{item.body}</AppText>
      </Card>
    ),
    [],
  );

  return (
    <Screen padded={false} edges={[]}>
      <FlatList
        data={annonces}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        contentContainerStyle={[styles.list, annonces.length === 0 && styles.listEmpty]}
        // Le rafraîchissement est explicite : un onglet non démonté n'est pas
        // rechargé au retour, et une annonce publiée entre-temps resterait
        // invisible sans cette commande.
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={colors.primary} />
        }
        ListHeaderComponent={
          <>
            <AsyncErrorBanner
              status={status}
              hasData={annonces.length > 0}
              errorMessage={errorMessage}
            />
            <Card muted>
              <AppText variant="caption">
                {displayName === '' ? 'Bonjour,' : `Bonjour ${displayName},`}
              </AppText>
              <AppText variant="caption">{session?.user.email ?? ''}</AppText>
            </Card>
          </>
        }
        ListEmptyComponent={
          <AsyncFallback
            status={status}
            hasData={annonces.length > 0}
            errorMessage={errorMessage}
            onRetry={reload}
            emptyTitle="Aucune information publiée"
            emptyDescription="Les annonces du bureau de l'association apparaîtront ici."
            emptyIcon="megaphone-outline"
            loadingMessage="Chargement des informations…"
          />
        }
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  list: {
    padding: spacing.lg,
    gap: spacing.md,
  },
  listEmpty: {
    flexGrow: 1,
  },
});
