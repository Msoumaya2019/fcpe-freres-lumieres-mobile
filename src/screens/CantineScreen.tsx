import { useCallback, useMemo, useState } from 'react';
import { FlatList, RefreshControl, StyleSheet, type ListRenderItemInfo } from 'react-native';

import { useCurrentUserId } from '@/auth/AuthProvider';
import {
  AppText,
  AsyncErrorBanner,
  AsyncFallback,
  Button,
  Card,
  ErrorNotice,
  Screen,
} from '@/components';
import { useAsyncData } from '@/hooks/useAsyncData';
import { fetchReservedMenuIds, fetchUpcomingMenus, setReservation } from '@/services/cantine';
import { colors, spacing } from '@/theme';
import type { CantineMenu } from '@/types/models';
import { formatMenuDate } from '@/utils/date';
import { pendingTarget, type PendingAction } from '@/utils/pendingAction';

interface CantineData {
  readonly menus: readonly CantineMenu[];
  readonly reservedMenuIds: readonly string[];
}

const EMPTY_MENUS: readonly CantineMenu[] = [];
const EMPTY_IDS: readonly string[] = [];

export function CantineScreen() {
  const userId = useCurrentUserId();

  const loader = useCallback(async (): Promise<CantineData> => {
    // Les menus d'abord, les réservations ensuite : la seconde requête est
    // **bornée par ce que l'écran affiche**, au lieu de ramener tout
    // l'historique de l'adhérent. Les deux ne peuvent donc plus partir
    // ensemble, et c'est le prix de l'exactitude : une lecture non bornée finit
    // par être tronquée par un plafond du serveur, et une réservation absente de
    // la réponse fait dire « Réserver » à un repas déjà réservé — un bouton qui
    // ne fait rien, indéfiniment, puisque la contrainte d'unicité absorbe le
    // doublon en silence et que la relecture relit la même page tronquée.
    const menus = await fetchUpcomingMenus();
    const reservedMenuIds = await fetchReservedMenuIds(
      userId,
      menus.map((menu) => menu.id),
    );
    return { menus, reservedMenuIds };
  }, [userId]);

  const { status, data, errorMessage, refreshing, refresh, reload } = useAsyncData(loader);

  const [pending, setPending] = useState<PendingAction<string> | null>(null);
  const [actionError, setActionError] = useState<unknown>(null);

  const menus = data?.menus ?? EMPTY_MENUS;
  const reservedMenuIds = data?.reservedMenuIds ?? EMPTY_IDS;
  const reservedMenuIdSet = useMemo(() => new Set(reservedMenuIds), [reservedMenuIds]);

  // L'appui couvre l'écriture **et** la relecture : tant que les données
  // affichées sont celles d'avant l'appui, le bouton porte l'indicateur.
  const pendingMenuId = pendingTarget(pending, status, data);

  const handleToggle = useCallback(
    (menuId: string, shouldReserve: boolean) => {
      setPending({ target: menuId, dataAtPress: data });
      setActionError(null);

      void (async () => {
        try {
          await setReservation(userId, menuId, shouldReserve);
          // On relit l'état serveur plutôt que de le deviner localement : la
          // réservation peut avoir été refusée par une politique RLS, et un
          // affichage optimiste mentirait jusqu'au prochain rafraîchissement.
          //
          // Pas de `finally` ici, et c'est délibéré : `reload()` ne rend pas la
          // main, donc relâcher le marqueur à cet endroit l'éteindrait avant
          // l'arrivée de la liste relue — l'écran reprendrait alors exactement
          // l'apparence d'avant l'appui. C'est `pendingTarget` qui l'éteint, au
          // rendu qui suit la relecture.
          reload();
        } catch (caught) {
          // L'écriture a échoué : aucune relecture n'aura lieu pour éteindre
          // l'indicateur, il faut donc l'éteindre ici.
          setPending(null);
          setActionError(caught);
        }
      })();
    },
    [data, reload, userId],
  );

  const renderItem = useCallback(
    ({ item }: ListRenderItemInfo<CantineMenu>) => {
      const isReserved = reservedMenuIdSet.has(item.id);

      return (
        <Card>
          <AppText variant="heading">{formatMenuDate(item.service_date)}</AppText>

          {item.starter === null ? null : (
            <AppText variant="caption">Entrée · {item.starter}</AppText>
          )}
          {item.main_course === null ? null : <AppText>Plat · {item.main_course}</AppText>}
          {item.dessert === null ? null : (
            <AppText variant="caption">Dessert · {item.dessert}</AppText>
          )}
          {item.notes === null ? null : (
            <AppText variant="caption" color={colors.warning}>
              {item.notes}
            </AppText>
          )}

          <Button
            label={isReserved ? 'Annuler ma réservation' : 'Réserver'}
            variant={isReserved ? 'secondary' : 'primary'}
            onPress={() => {
              handleToggle(item.id, !isReserved);
            }}
            loading={pendingMenuId === item.id}
            disabled={pendingMenuId !== null && pendingMenuId !== item.id}
          />
        </Card>
      );
    },
    [handleToggle, pendingMenuId, reservedMenuIdSet],
  );

  return (
    <Screen padded={false} edges={[]}>
      <FlatList
        data={menus}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        contentContainerStyle={[styles.list, menus.length === 0 && styles.listEmpty]}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={colors.primary} />
        }
        ListHeaderComponent={
          <>
            <AsyncErrorBanner
              status={status}
              hasData={menus.length > 0}
              errorMessage={errorMessage}
            />
            {actionError === null ? null : <ErrorNotice error={actionError} />}
          </>
        }
        ListEmptyComponent={
          <AsyncFallback
            status={status}
            hasData={menus.length > 0}
            errorMessage={errorMessage}
            onRetry={reload}
            emptyTitle="Aucun menu publié"
            emptyDescription="Les menus de la cantine apparaîtront ici dès leur publication."
            emptyIcon="restaurant-outline"
            loadingMessage="Chargement des menus…"
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
