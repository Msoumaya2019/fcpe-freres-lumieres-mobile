import { useCallback } from 'react';
import { FlatList, RefreshControl, StyleSheet, type ListRenderItemInfo } from 'react-native';

import { AppText, AsyncErrorBanner, AsyncFallback, Card, Screen } from '@/components';
import { useAsyncData } from '@/hooks/useAsyncData';
import { fetchUpcomingMenus } from '@/services/cantine';
import { colors, spacing } from '@/theme';
import type { CantineMenu } from '@/types/models';
import { formatMenuDate } from '@/utils/date';

const EMPTY_MENUS: readonly CantineMenu[] = [];

/**
 * La cantine : les menus, et rien d'autre.
 *
 * CE QUE CET ÉCRAN A CESSÉ DE FAIRE, ET POURQUOI
 * ---------------------------------------------
 * Il proposait « Réserver » et « Annuler ma réservation ». Ces boutons
 * n'écrivaient qu'une ligne dans `cantine_reservations` : ils n'étaient reliés à
 * aucun service de restauration scolaire. Un parent qui appuyait dessus croyait
 * avoir réservé un repas, et personne n'était prévenu — le pire défaut possible
 * ici, parce qu'il ne se voit pas dans l'application.
 *
 * Les réservations se font donc **auprès du service de restauration**, comme
 * avant l'application, et l'écran le dit à la place du bouton. La table et ses
 * lignes n'ont pas été supprimées : le bureau peut encore les consulter.
 *
 * Consulter les menus, en revanche, ne demande **aucun compte** : c'est la
 * première chose qu'un parent vient chercher, et l'exiger aurait été le premier
 * obstacle de l'application.
 */
export function CantineScreen() {
  const loader = useCallback(() => fetchUpcomingMenus(), []);

  const { status, data, errorMessage, refreshing, refresh, reload } = useAsyncData(loader);

  const menus = data ?? EMPTY_MENUS;

  const renderItem = useCallback(
    ({ item }: ListRenderItemInfo<CantineMenu>) => (
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
      </Card>
    ),
    [],
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
            {/*  La phrase qui remplace le bouton. Elle est là **avant** les menus,
                et non en bas de liste : c'est la question que se pose un parent
                qui cherche à réserver, et il la cherche en haut. */}
            <Card muted>
              <AppText variant="heading">Les menus de la cantine</AppText>
              <AppText variant="caption">
                Les menus publiés par l’école, du jour et des semaines à venir.
              </AppText>
              <AppText variant="caption">
                Les réservations et les annulations se font auprès du service de restauration de
                l’école : cette application ne les enregistre pas, et ne peut donc pas confirmer
                votre repas.
              </AppText>
            </Card>
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
