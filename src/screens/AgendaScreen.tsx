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

import {
  AppText,
  AsyncErrorBanner,
  AsyncFallback,
  Badge,
  Button,
  Card,
  ErrorNotice,
  FilCommentaires,
  Screen,
} from '@/components';
import { useAsyncData } from '@/hooks/useAsyncData';
import type { AgendaOnglet, MainTabParamList } from '@/navigation/types';
import { fetchAgendaEvents } from '@/services/agenda';
import { castVote, fetchResultats, fetchSondages } from '@/services/sondages';
import { accents, colors, radius, spacing } from '@/theme';
import type { AgendaEvent, SondageResultat, SondageWithChoices } from '@/types/models';
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
    // `fetchSondages()` ne prend plus d'identifiant d'adhérent : le vote se
    // rattache à une clé d'appareil, et le choix de cet appareil est relu dans
    // les préférences locales. Un parent sans compte vote donc comme un autre.
    const [evenements, sondages] = await Promise.all([fetchAgendaEvents(), fetchSondages()]);

    return { evenements, sondages, maintenant: Date.now() };
  }, []);

  const { status, data, errorMessage, refreshing, refresh, reload } = useAsyncData(loader);

  const [voteError, setVoteError] = useState<unknown>(null);
  const [voteEnCours, setVoteEnCours] = useState<string | null>(null);

  const voter = useCallback(
    (sondageId: string, choiceId: string) => {
      setVoteError(null);
      setVoteEnCours(sondageId);

      void (async () => {
        try {
          await castVote({ sondageId, choiceId });
          reload();
        } catch (caught) {
          setVoteError(caught);
        } finally {
          setVoteEnCours(null);
        }
      })();
    },
    [reload],
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
          // `keyboardShouldPersistTaps` vaut « never » par défaut : la liste
          // consommerait le premier appui pour fermer le clavier, et « Envoyer »
          // ne le recevrait jamais. La règle est portée par l'**écran**, pas par
          // la seule liste qui se trouve héberger le formulaire : les deux
          // onglets n'en sont qu'un, et déplacer le fil de commentaires de l'un
          // à l'autre ne doit pas rouvrir le défaut. Mesuré par
          // scripts/check-clavier-liste.test.mjs.
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          automaticallyAdjustKeyboardInsets
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
          // `keyboardShouldPersistTaps` vaut « never » par défaut : la liste
          // consommerait le premier appui pour fermer le clavier, et « Envoyer »
          // ne le recevrait jamais. Mesuré par scripts/check-clavier-liste.test.mjs.
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          automaticallyAdjustKeyboardInsets
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

  /**
   * Le résultat, chargé **à la demande** et non au montage.
   *
   * POURQUOI PAS DANS LE CHARGEUR DE L'ÉCRAN
   * ----------------------------------------
   * Il y a autant de sondages que le bureau en publie, et un décompte par
   * sondage ferait autant d'allers-retours à chaque affichage de l'agenda —
   * pour une information que la plupart des gens ne regardent pas. Un appui
   * explicite coûte une requête, et seulement pour qui la demande.
   *
   * Le résultat est **public** dès lors que le sondage est clos ou qu'on a
   * voté : `resultats_sondage()` rend des compteurs par réponse, jamais une
   * ligne de vote. Le nom d'un votant ne sort donc pas de la base.
   */
  const [resultats, setResultats] = useState<readonly SondageResultat[] | null>(null);
  const [erreurResultats, setErreurResultats] = useState<unknown>(null);
  const [chargementResultats, setChargementResultats] = useState(false);

  const voirResultats = useCallback(() => {
    setChargementResultats(true);
    setErreurResultats(null);

    void (async () => {
      try {
        setResultats(await fetchResultats(sondage.id));
      } catch (caught) {
        setErreurResultats(caught);
      } finally {
        setChargementResultats(false);
      }
    })();
  }, [sondage.id]);

  const total = (resultats ?? []).reduce((somme, ligne) => somme + Number(ligne.voix), 0);

  /**
   * Le fil de commentaires du sondage, déplié sur demande.
   *
   * Pourquoi **pas** chargé avec le reste : les sondages d'un même écran
   * partagent une seule requête, et y ajouter les commentaires de chacun ferait
   * autant d'allers-retours à chaque affichage de l'agenda — pour une
   * information que la plupart des gens ne regardent pas. C'est le même
   * raisonnement que pour les résultats, juste au-dessus.
   *
   * L'état vit dans la carte, comme celui des résultats : deux sondages peuvent
   * donc être dépliés en même temps, et refermer l'un ne referme pas l'autre.
   * Ce qui compte ici, c'est qu'un sondage ne charge **rien** tant qu'on ne l'a
   * pas demandé.
   */
  const [filOuvert, setFilOuvert] = useState(false);

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
                // d'unicité `(sondage_id, voter_key)` le refuserait, et l'appui
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

      {resultats === null ? null : (
        <View style={styles.resultats}>
          {resultats.map((ligne) => (
            <View key={ligne.choice_id} style={styles.resultatLigne}>
              <AppText variant="caption" style={styles.titreCarte}>
                {ligne.label}
              </AppText>
              <AppText variant="caption" bold>
                {ligne.voix} voix
                {total === 0 ? '' : ` · ${Math.round((Number(ligne.voix) / total) * 100)} %`}
              </AppText>
            </View>
          ))}
          {total === 0 ? (
            <AppText variant="caption">Aucune réponse enregistrée pour l’instant.</AppText>
          ) : null}
        </View>
      )}

      {erreurResultats === null ? null : <ErrorNotice error={erreurResultats} />}

      {/*  Le résultat ne se montre pas avant qu'il veuille dire quelque chose :
          sur un sondage ouvert qu'on n'a pas encore voté, l'afficher
          influencerait les suivants — et c'est aussi la règle que le bureau
          attend d'un sondage. Il s'ouvre donc après avoir voté, ou une fois le
          sondage clos. */}
      {resultats === null && (aVote || !ouvert) ? (
        <Button
          label="Voir les résultats"
          variant="ghost"
          onPress={voirResultats}
          loading={chargementResultats}
        />
      ) : null}

      {/*  Ce que le décompte vaut, et ce qu'il ne vaut pas.

          Un vote se rattache à une **clé d'appareil**, tirée par la base et
          gardée sur le téléphone : un second vote est donc difficile depuis le
          même appareil. Mais réinstaller l'application donne une nouvelle clé,
          et aucun identifiant d'appareil ne peut empêcher cela. Écrire ici
          « un vote par personne » serait faux, et c'est le genre de phrase
          qu'on finit par croire. */}
      {resultats === null ? null : (
        <AppText variant="caption">
          Un vote par appareil. Réinstaller l’application permet de voter de nouveau : ce résultat
          donne une tendance, il n’est pas un vote certifié.
        </AppText>
      )}

      {/*  Un sondage se discute autant qu'il se vote : la question est posée à
          toutes les familles, et la réponse appelle souvent une précision. Le
          fil est ici, sous le sondage, et non dans un écran séparé — c'est le
          même geste que « Voir les résultats », juste au-dessus. */}
      <Button
        label={filOuvert ? 'Masquer les commentaires' : 'Commentaires'}
        variant="ghost"
        onPress={() => {
          setFilOuvert(!filOuvert);
        }}
      />

      {filOuvert ? <FilCommentaires cible={{ type: 'sondage', id: sondage.id }} /> : null}
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
  resultats: {
    gap: spacing.xs,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: spacing.sm,
  },
  resultatLigne: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
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
