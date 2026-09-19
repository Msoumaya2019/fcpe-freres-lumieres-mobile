import { Ionicons } from '@expo/vector-icons';
import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import { useCallback, useState } from 'react';
import {
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  View,
  type ListRenderItemInfo,
} from 'react-native';

import { useCurrentUserId } from '@/auth/AuthProvider';
import {
  AppText,
  AsyncErrorBanner,
  AsyncFallback,
  Badge,
  Button,
  Card,
  ErrorNotice,
  Screen,
} from '@/components';
import { useAsyncData } from '@/hooks/useAsyncData';
import type { AgendaOnglet, MainTabParamList } from '@/navigation/types';
import { fetchAgendaEvents } from '@/services/agenda';
import { castVote, fetchSondages } from '@/services/sondages';
import { accents, colors, radius, spacing } from '@/theme';
import type { AgendaEvent, SondageWithChoices } from '@/types/models';
import { formatLongDay, formatTime } from '@/utils/date';

interface DonneesAgenda {
  readonly evenements: readonly AgendaEvent[];
  readonly sondages: readonly SondageWithChoices[];
  /**
   * L'instant du chargement, en millisecondes.
   *
   * POURQUOI IL VOYAGE AVEC LES DONNÉES
   * -----------------------------------
   * Deux cartes ont besoin de « maintenant » : celle d'un événement, pour dire
   * s'il est passé, et celle d'un sondage, pour dire s'il est encore ouvert.
   * Appeler `Date.now()` dans le rendu rend le composant **impur** — le même
   * message ne s'afficherait pas de la même façon selon le moment du rendu —, et
   * le lint le refuse (`react-hooks/purity`).
   *
   * Le capturer dans la fonction de chargement résout les deux : c'est un
   * instantané pris au moment exact où les données sont arrivées, il est
   * **stable** pendant tout l'affichage, et il se rafraîchit quand les données se
   * rafraîchissent — au tirer-pour-rafraîchir, ou après un vote. Un compte à
   * rebours ne se mettrait pas à jour tout seul ; c'est assumé, et cohérent avec
   * une liste qui ne se rafraîchit pas non plus toute seule.
   */
  readonly maintenant: number;
}

/**
 * Agenda et sondages.
 *
 * POURQUOI DEUX SOUS-ONGLETS PLUTÔT QUE DEUX ONGLETS
 * --------------------------------------------------
 * La barre du bas porte déjà cinq entrées, et c'est le maximum lisible : au-delà,
 * les libellés se tronquent et les cibles tactiles se resserrent. Les sondages se
 * consultent en outre bien moins souvent que l'agenda, et ils lui ressemblent —
 * une liste de choses datées auxquelles on répond.
 *
 * POURQUOI LE SOUS-ONGLET VIT DANS LE PARAMÈTRE DE ROUTE
 * ------------------------------------------------------
 * Un raccourci de l'accueil demande directement les sondages. Le premier jet
 * gardait un état local **et** le recopiait depuis le paramètre dans un effet :
 * deux sources pour une même vérité, et un effet dont le seul rôle était de les
 * faire tenir ensemble. React déconseille explicitement ce motif
 * (`set-state-in-effect`), et le lint l'a refusé.
 *
 * Une seule source supprime le problème au lieu de le déplacer : appuyer sur
 * « Sondages » depuis l'accueil **écrit** le paramètre, et cet écran le lit.
 * Aucun effet, aucune synchronisation, et le raccourci ne peut pas sembler
 * cassé — il n'y a plus deux valeurs à faire coïncider.
 */
export function AgendaScreen({
  route,
  navigation,
}: BottomTabScreenProps<MainTabParamList, 'Agenda'>) {
  const userId = useCurrentUserId();

  const onglet: AgendaOnglet = route.params?.onglet ?? 'agenda';

  const choisirOnglet = useCallback(
    (valeur: AgendaOnglet) => {
      // `setParams` et non `navigate` : changer de sous-onglet ne doit pas
      // empiler une entrée d'historique, sinon le bouton « précédent »
      // d'Android ramènerait à l'agenda après chaque bascule vers les sondages.
      navigation.setParams({ onglet: valeur });
    },
    [navigation],
  );

  const loader = useCallback(async (): Promise<DonneesAgenda> => {
    const [evenements, sondages] = await Promise.all([fetchAgendaEvents(), fetchSondages(userId)]);

    return { evenements, sondages, maintenant: Date.now() };
  }, [userId]);

  const { status, data, errorMessage, refreshing, refresh, reload } = useAsyncData(loader);

  const [voteError, setVoteError] = useState<unknown>(null);
  const [voteEnCours, setVoteEnCours] = useState<string | null>(null);

  const voter = useCallback(
    (sondageId: string, choiceId: string) => {
      setVoteError(null);
      setVoteEnCours(sondageId);

      void (async () => {
        try {
          await castVote({ sondageId, choiceId, voterId: userId });
          reload();
        } catch (caught) {
          setVoteError(caught);
        } finally {
          setVoteEnCours(null);
        }
      })();
    },
    [reload, userId],
  );

  const evenements = data?.evenements ?? [];
  const sondages = data?.sondages ?? [];
  const maintenant = data?.maintenant ?? 0;
  const chargement = data === null;

  return (
    <Screen padded={false} edges={[]}>
      <View style={styles.barre}>
        <SousOnglet
          label="Agenda"
          actif={onglet === 'agenda'}
          onPress={() => {
            choisirOnglet('agenda');
          }}
        />
        <SousOnglet
          label="Sondages"
          actif={onglet === 'sondages'}
          onPress={() => {
            choisirOnglet('sondages');
          }}
        />
      </View>

      {onglet === 'agenda' ? (
        <FlatList
          data={evenements}
          keyExtractor={(item) => item.id}
          renderItem={({ item }: ListRenderItemInfo<AgendaEvent>) => (
            <CarteEvenement evenement={item} maintenant={maintenant} />
          )}
          contentContainerStyle={[styles.liste, evenements.length === 0 && styles.listeVide]}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={refresh}
              tintColor={colors.primary}
            />
          }
          ListHeaderComponent={
            <AsyncErrorBanner
              status={status}
              hasData={evenements.length > 0}
              errorMessage={errorMessage}
            />
          }
          ListEmptyComponent={
            <AsyncFallback
              status={status}
              hasData={evenements.length > 0}
              errorMessage={errorMessage}
              onRetry={reload}
              emptyTitle="Aucun événement"
              emptyDescription="Les réunions, sorties et dates importantes de l'école apparaîtront ici."
              emptyIcon="calendar-outline"
              loadingMessage="Chargement de l'agenda…"
            />
          }
        />
      ) : (
        <FlatList
          data={sondages}
          keyExtractor={(item) => item.id}
          renderItem={({ item }: ListRenderItemInfo<SondageWithChoices>) => (
            <CarteSondage
              sondage={item}
              maintenant={maintenant}
              enCours={voteEnCours === item.id}
              onVoter={(choiceId) => {
                voter(item.id, choiceId);
              }}
            />
          )}
          contentContainerStyle={[styles.liste, sondages.length === 0 && styles.listeVide]}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={refresh}
              tintColor={colors.primary}
            />
          }
          ListHeaderComponent={
            <>
              <AsyncErrorBanner
                status={status}
                hasData={sondages.length > 0}
                errorMessage={errorMessage}
              />
              {voteError === null ? null : <ErrorNotice error={voteError} />}
            </>
          }
          ListEmptyComponent={
            <AsyncFallback
              status={status}
              hasData={sondages.length > 0}
              // Pendant que les sondages chargent encore, `data` est nul : les
              // deux listes partagent la même requête, et l'agenda peut déjà
              // être rempli alors que les sondages arrivent. Sans ce garde-fou,
              // l'onglet afficherait « Aucun sondage » avant de se remplir.
              errorMessage={chargement ? null : errorMessage}
              onRetry={reload}
              emptyTitle="Aucun sondage"
              emptyDescription="Les questions posées aux familles apparaîtront ici."
              emptyIcon="stats-chart-outline"
              loadingMessage="Chargement des sondages…"
            />
          }
        />
      )}
    </Screen>
  );
}

/** Un sous-onglet de la rubrique, rendu comme un segment. */
function SousOnglet({
  label,
  actif,
  onPress,
}: {
  readonly label: string;
  readonly actif: boolean;
  readonly onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="tab"
      accessibilityState={{ selected: actif }}
      style={[styles.segment, actif && styles.segmentActif]}
    >
      <AppText variant="caption" bold={actif} color={actif ? colors.primary : colors.textSecondary}>
        {label}
      </AppText>
    </Pressable>
  );
}

/**
 * Une carte d'événement.
 *
 * `maintenant` est reçu en prop plutôt que lu ici : `Date.now()` dans le rendu
 * rendrait le composant impur, et deux cartes rendues dans le même passage
 * pourraient recevoir deux instants différents — l'une marquée « Passé », sa
 * voisine non, pour une seconde d'écart.
 */
function CarteEvenement({
  evenement,
  maintenant,
}: {
  readonly evenement: AgendaEvent;
  readonly maintenant: number;
}) {
  const passe = Date.parse(evenement.start_at) < maintenant;
  const horaire = evenement.all_day
    ? 'Journée entière'
    : evenement.end_at === null
      ? formatTime(evenement.start_at)
      : `${formatTime(evenement.start_at)} – ${formatTime(evenement.end_at)}`;

  return (
    <Card elevated style={passe ? styles.cartePassee : undefined}>
      <View style={styles.ligneEntete}>
        <AppText variant="heading" style={styles.titreCarte}>
          {evenement.title}
        </AppText>
        {passe ? <Badge label="Passé" accent="ambre" /> : null}
      </View>

      <View style={styles.repere}>
        <Ionicons name="calendar-outline" size={13} color={colors.textSecondary} />
        <AppText variant="caption">{formatLongDay(evenement.start_at)}</AppText>
        <Ionicons name="time-outline" size={13} color={colors.textSecondary} />
        <AppText variant="caption">{horaire}</AppText>
      </View>

      {evenement.location === null ? null : (
        <View style={styles.repere}>
          <Ionicons name="location-outline" size={13} color={colors.textSecondary} />
          <AppText variant="caption" style={styles.titreCarte}>
            {evenement.location}
          </AppText>
        </View>
      )}

      {evenement.description === null ? null : (
        <AppText variant="body">{evenement.description}</AppText>
      )}
    </Card>
  );
}

function CarteSondage({
  sondage,
  maintenant,
  enCours,
  onVoter,
}: {
  readonly sondage: SondageWithChoices;
  readonly maintenant: number;
  readonly enCours: boolean;
  readonly onVoter: (choiceId: string) => void;
}) {
  const ouvert =
    sondage.is_open && (sondage.closed_at === null || Date.parse(sondage.closed_at) > maintenant);
  const aVote = sondage.myChoiceId !== null;

  return (
    <Card elevated style={[styles.carteSondage, { backgroundColor: accents.violet.soft }]}>
      <Badge
        label={ouvert ? (aVote ? 'Votre réponse' : 'Sondage ouvert') : 'Sondage clos'}
        accent="violet"
        icon="stats-chart-outline"
      />

      <AppText variant="heading">{sondage.question}</AppText>
      {sondage.details === null ? null : <AppText variant="caption">{sondage.details}</AppText>}

      {sondage.choices.length === 0 ? (
        <AppText variant="caption">Aucune réponse n’est proposée pour ce sondage.</AppText>
      ) : (
        <View style={styles.choix}>
          {sondage.choices.map((choix) => {
            const choisi = choix.id === sondage.myChoiceId;

            return (
              <Pressable
                key={choix.id}
                // Un sondage clos ou déjà voté ne se revote pas : la contrainte
                // d'unicité `(sondage_id, voter_id)` le refuserait, et l'appui
                // semblerait sans effet. Le bouton est donc inactif, et
                // l'accessibilité le dit.
                disabled={!ouvert || aVote || enCours}
                onPress={() => {
                  onVoter(choix.id);
                }}
                accessibilityRole="radio"
                accessibilityState={{ selected: choisi, disabled: !ouvert || aVote || enCours }}
                style={({ pressed }) => [
                  styles.choixItem,
                  choisi && styles.choixChoisi,
                  pressed && styles.choixAppuye,
                  (!ouvert || aVote) && styles.choixInactif,
                ]}
              >
                <Ionicons
                  name={choisi ? 'radio-button-on' : 'radio-button-off'}
                  size={18}
                  color={choisi ? colors.primary : colors.textSecondary}
                />
                <AppText variant="body" style={styles.titreCarte}>
                  {choix.label}
                </AppText>
              </Pressable>
            );
          })}
        </View>
      )}

      {aVote ? (
        <AppText variant="caption">Votre réponse est enregistrée. Merci !</AppText>
      ) : ouvert ? null : (
        <AppText variant="caption">Ce sondage est clos.</AppText>
      )}

      {enCours ? <Button label="Enregistrement…" onPress={() => undefined} loading /> : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  barre: {
    flexDirection: 'row',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
  },
  segment: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceMuted,
  },
  segmentActif: {
    backgroundColor: colors.primarySoft,
  },
  liste: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.lg,
    gap: spacing.md,
  },
  listeVide: {
    flexGrow: 1,
  },
  cartePassee: {
    opacity: 0.6,
  },
  ligneEntete: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  titreCarte: {
    flexShrink: 1,
  },
  repere: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    flexWrap: 'wrap',
  },
  carteSondage: {
    gap: spacing.sm,
  },
  choix: {
    gap: spacing.sm,
  },
  choixItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
  },
  choixChoisi: {
    borderWidth: 1,
    borderColor: colors.primary,
  },
  choixAppuye: {
    opacity: 0.8,
  },
  choixInactif: {
    opacity: 0.6,
  },
});
