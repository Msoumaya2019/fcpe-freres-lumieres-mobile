import { Ionicons } from '@expo/vector-icons';
import { useCallback, useState } from 'react';
import { FlatList, RefreshControl, StyleSheet, View, type ListRenderItemInfo } from 'react-native';

import {
  AppText,
  AsyncErrorBanner,
  AsyncFallback,
  Button,
  Card,
  FilCommentaires,
  Screen,
} from '@/components';
import { useAsyncData } from '@/hooks/useAsyncData';
import { fetchUpcomingMenus } from '@/services/cantine';
import { accents, colors, radius, spacing, tints } from '@/theme';
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

  /**
   * Le jour dont le fil de commentaires est déplié, ou `null`.
   *
   * UN SEUL FIL À LA FOIS, ET C'EST LE CŒUR DU CHOIX
   * ------------------------------------------------
   * Chaque jour de cantine porte son propre fil — c'est ce qu'un parent veut
   * distinguer, et « le jeudi, mon enfant est allergique » ne se dit pas d'une
   * semaine entière. Mais les fils ne se chargent **pas** tous à l'ouverture de
   * l'écran : la cantine affiche les menus à venir, et charger les commentaires
   * de chacun ferait autant de requêtes pour une information que personne ne
   * demande. Un appui en déplie un, et une seule requête part.
   *
   * L'identifiant plutôt qu'un booléen par carte : l'état vit **une fois**, dans
   * l'écran, et non dans chaque carte — une carte ne peut donc pas rester
   * dépliée après que sa voisine l'a été.
   */
  const [filOuvert, setFilOuvert] = useState<string | null>(null);

  const renderItem = useCallback(
    ({ item }: ListRenderItemInfo<CantineMenu>) => (
      <Card>
        {/*  Le carré vert et le jour, côte à côte. Un parent qui ouvre la
            cantine cherche **un jour précis** ; le titre seul, en haut d'une
            carte blanche, se lit comme la première ligne d'une liste et non
            comme une date. Le carré reprend l'accent vert du raccourci
            « Cantine » de l'accueil, ce qui rattache l'écran à la carte par
            laquelle on y arrive. */}
        <View style={styles.entete}>
          <View style={styles.carre} accessibilityElementsHidden>
            <Ionicons name="restaurant-outline" size={20} color={accents.vert.ink} />
          </View>
          <AppText variant="heading" style={styles.jour}>
            {formatMenuDate(item.service_date)}
          </AppText>
        </View>

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
          label={filOuvert === item.id ? 'Masquer les commentaires' : 'Commentaires'}
          variant="ghost"
          onPress={() => {
            setFilOuvert(filOuvert === item.id ? null : item.id);
          }}
        />

        {filOuvert === item.id ? <FilCommentaires cible={{ type: 'menu', id: item.id }} /> : null}
      </Card>
    ),
    [filOuvert],
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
            {/*  Le pastel vert, comme le bandeau du bas de l'accueil : une carte
                d'information qui n'est pas une donnée publiée porte la couleur de
                son écran. Les deux `caption` ci-dessous restent en
                `textSecondary`, mesuré à 5,33:1 sur ce fond — au-dessus des
                4,5:1 qu'exige une légende. */}
            <Card style={{ backgroundColor: accents.vert.soft }}>
              <AppText variant="heading" color={accents.vert.ink}>
                Les menus de la cantine
              </AppText>
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
  /**
   * Le jour, et le carré qui le précède.
   *
   * `alignItems: 'center'` plutôt que `flex-start` : les deux éléments d'un
   * en-tête de cantine font une seule ligne de haut — une date courte, un carré
   * de quarante points —, et un alignement sur le haut laisserait le texte
   * flotter au-dessus du carré. C'est l'inverse de la carte d'actualité, dont le
   * titre se replie sur deux lignes et doit rester collé à son badge.
   */
  entete: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  /**
   * Le carré vert qui porte l'icône du jour.
   *
   * Le fond est `tints.vert` — le ton **soutenu** de l'accent —, et non le
   * pastel `accents.vert.soft` : l'icône est posée sur le carré, pas sur la
   * carte, et c'est ce couple-là qui a été mesuré (`success` sur `successTint`,
   * 3,79:1, au-dessus des 3:1 qu'exige une icône seule). Confondre les deux tons
   * effacerait le relief et ferait mesurer l'icône contre un fond qui n'est pas
   * le sien.
   */
  carre: {
    width: 40,
    height: 40,
    borderRadius: radius.md,
    backgroundColor: tints.vert,
    alignItems: 'center',
    justifyContent: 'center',
  },
  jour: {
    // `flex: 1` : une date longue — « mercredi 30 septembre » — se replie au
    // lieu de pousser le carré hors de la carte.
    flex: 1,
  },
});
