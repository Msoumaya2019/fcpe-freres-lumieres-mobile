import { useCallback, useState } from 'react';
import {
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  View,
  type ListRenderItemInfo,
} from 'react-native';

import { useAuth } from '@/auth/AuthProvider';
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
import {
  MAX_DEMANDES,
  deciderAdhesion,
  listerAdhesions,
  type DemandeAdhesion,
} from '@/services/profiles';
import { colors, radius, spacing } from '@/theme';
import type { MemberStatus } from '@/types/models';
import { formatShortDate } from '@/utils/date';
import { pendingTarget, type PendingAction } from '@/utils/pendingAction';

/**
 * Les adhésions, vues du bureau : accepter, refuser, suspendre.
 *
 * POURQUOI CET ÉCRAN EXISTE
 * -------------------------
 * Les quatre statuts étaient déclarés en base depuis le début, et le verrou qui
 * empêche un compte de s'accepter lui-même était écrit et éprouvé. Mais **rien
 * ne pouvait les changer depuis l'application** : `profiles` n'a aucune
 * politique de modification, et la seule voie était l'éditeur SQL de Supabase,
 * avec sa parenthèse `disable trigger` — un geste de développeur pour une
 * décision d'association.
 *
 * Le résultat était le pire des deux mondes : un parent s'inscrivait, lisait
 * « Votre demande sera examinée par le bureau », et restait en attente
 * indéfiniment, sans que rien ne le signale.
 *
 * POURQUOI LES QUATRE STATUTS SONT ACCESSIBLES, ET PAS SEULEMENT L'ATTENTE
 * ----------------------------------------------------------------------
 * Une adhésion n'est pas une décision qu'on prend une fois. Un refus se revoit,
 * une acceptation se suspend, une suspension se lève. Ne montrer que la file
 * d'attente aurait rendu les trois autres statuts **inatteignables depuis
 * l'application** — c'est-à-dire écrits dans l'énumération et dans les écrans,
 * et modifiables seulement par SQL. Le filtre est donc le mécanisme, et la
 * table `TRANSITIONS` ci-dessous dit ce qui est possible depuis chaque état.
 *
 * CE QUE L'ÉCRAN NE FAIT PAS
 * --------------------------
 * Il ne touche pas au **rôle**. Promouvoir un administrateur reste le geste de
 * l'éditeur SQL, documenté dans `MISE-EN-SERVICE.md` : c'est une décision rare,
 * et elle mérite d'être prise à la main. La fonction `decider_adhesion()` ne
 * connaît que le statut, et c'est ce qui rend la capacité étroite.
 */

const VIDE: readonly DemandeAdhesion[] = [];

/** L'ordre du filtre : celui dans lequel le bureau travaille. */
const STATUTS: readonly { readonly statut: MemberStatus; readonly label: string }[] = [
  { statut: 'en_attente', label: 'En attente' },
  { statut: 'accepte', label: 'Acceptés' },
  { statut: 'refuse', label: 'Refusés' },
  { statut: 'suspendu', label: 'Suspendus' },
];

/** Ce qu'un statut permet de dire ensuite, et le libellé de chaque geste. */
const TRANSITIONS: Readonly<
  Record<
    MemberStatus,
    readonly {
      readonly statut: MemberStatus;
      readonly label: string;
      readonly variant: 'primary' | 'secondary';
    }[]
  >
> = {
  en_attente: [
    { statut: 'accepte', label: 'Accepter', variant: 'primary' },
    { statut: 'refuse', label: 'Refuser', variant: 'secondary' },
  ],
  accepte: [
    { statut: 'suspendu', label: 'Suspendre', variant: 'secondary' },
    { statut: 'refuse', label: 'Retirer l’adhésion', variant: 'secondary' },
  ],
  refuse: [{ statut: 'accepte', label: 'Accepter finalement', variant: 'primary' }],
  suspendu: [
    { statut: 'accepte', label: 'Rétablir', variant: 'primary' },
    { statut: 'refuse', label: 'Refuser', variant: 'secondary' },
  ],
};

/** La phrase qui dit ce qu'un statut ouvre, ou ferme. */
const EXPLICATIONS: Readonly<Record<MemberStatus, string>> = {
  en_attente: 'Un compte en attente lit tout le contenu public, et rien de la discussion.',
  accepte: 'Un compte accepté accède à la discussion et à ses propres signalements.',
  refuse: 'Un compte refusé garde l’accès public : les menus, l’agenda, les actualités.',
  suspendu:
    'Un compte suspendu perd l’accès à l’espace membres, et le retrouve si vous le rétablissez.',
};

interface ChipProps {
  readonly label: string;
  readonly selected: boolean;
  readonly onSelect: () => void;
}

function Chip({ label, selected, onSelect }: ChipProps) {
  return (
    <Pressable
      onPress={onSelect}
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      style={({ pressed }) => [
        styles.chip,
        selected && styles.chipSelectionne,
        pressed && styles.chipAppuye,
      ]}
    >
      <AppText
        variant="caption"
        bold={selected}
        color={selected ? colors.textOnPrimary : colors.textPrimary}
      >
        {label}
      </AppText>
    </Pressable>
  );
}

/**
 * L'écran, et son filtre.
 *
 * Le composant qui charge est **remonté** à chaque changement de filtre par sa
 * `key` : sans cela, la liste précédente resterait affichée pendant la lecture
 * de la suivante, et le bureau verrait « Acceptés » au-dessus des noms d'une
 * autre liste.
 */
export function AdhesionsBureauScreen() {
  const { profile } = useAuth();
  const [statut, setStatut] = useState<MemberStatus>('en_attente');

  // Le refus est dit **avant** l'appel : `decider_adhesion()` refuse un membre
  // ordinaire par une erreur, et l'écran afficherait alors un échec technique
  // là où il n'y a qu'une question de rôle.
  if (profile?.role !== 'admin') {
    return (
      <Screen scrollable edges={[]}>
        <Card muted>
          <AppText variant="heading">Réservé au bureau</AppText>
          <AppText variant="caption">
            Les adhésions sont décidées par le bureau de l’association. Votre compte ne donne pas
            accès à cette rubrique.
          </AppText>
        </Card>
      </Screen>
    );
  }

  return <ListeAdhesions key={statut} statut={statut} onFiltrer={setStatut} />;
}

interface ListeAdhesionsProps {
  readonly statut: MemberStatus;
  readonly onFiltrer: (statut: MemberStatus) => void;
}

function ListeAdhesions({ statut, onFiltrer }: ListeAdhesionsProps) {
  const charger = useCallback(() => listerAdhesions(statut), [statut]);
  const { status, data, errorMessage, refreshing, refresh, reload } = useAsyncData(charger);

  const adhesions = data ?? VIDE;

  const [sending, setSending] = useState(false);
  const [decision, setDecision] = useState<PendingAction<string> | null>(null);
  const [erreur, setErreur] = useState<unknown>(null);

  /**
   * L'identifiant de la ligne sur laquelle une décision est en cours.
   *
   * Deux mécanismes, comme dans la discussion : `sending` couvre l'aller-retour
   * de l'appel, `pendingTarget` prend le relais jusqu'à ce que la liste relue
   * arrive. Un `finally` seul relâcherait l'indicateur pendant la relecture, et
   * la ligne — toujours affichée avec ses boutons actifs — inviterait à
   * appuyer une seconde fois sur une décision déjà prise.
   */
  const enCours = sending ? (decision?.target ?? null) : pendingTarget(decision, status, data);

  const decider = useCallback(
    (demande: DemandeAdhesion, cible: MemberStatus) => {
      if (enCours !== null) {
        return;
      }

      setErreur(null);
      setSending(true);
      setDecision({ target: demande.id, dataAtPress: data });

      void (async () => {
        try {
          await deciderAdhesion(demande.id, cible);
          // La décision est écrite : sans cette relecture, le bureau verrait son
          // geste réussir et la ligne rester à sa place, conclurait à un échec,
          // et recommencerait.
          reload();
        } catch (caught) {
          // L'écriture a échoué : aucune relecture n'aura lieu pour éteindre le
          // marqueur, il faut donc l'éteindre ici.
          setDecision(null);
          setErreur(caught);
        } finally {
          setSending(false);
        }
      })();
    },
    [data, enCours, reload],
  );

  const renderItem = useCallback(
    ({ item }: ListRenderItemInfo<DemandeAdhesion>) => (
      <Card elevated>
        <AppText variant="heading">{item.display_name}</AppText>
        <AppText variant="caption">Demande du {formatShortDate(item.created_at)}</AppText>

        <View style={styles.actions}>
          {TRANSITIONS[item.status].map((geste) => (
            <Button
              key={geste.statut}
              label={geste.label}
              variant={geste.variant}
              loading={enCours === item.id}
              disabled={enCours !== null && enCours !== item.id}
              onPress={() => {
                decider(item, geste.statut);
              }}
            />
          ))}
        </View>
      </Card>
    ),
    [decider, enCours],
  );

  return (
    <Screen padded={false} edges={[]}>
      <FlatList
        data={adhesions}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        contentContainerStyle={[styles.liste, adhesions.length === 0 && styles.listeVide]}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={colors.primary} />
        }
        ListHeaderComponent={
          <>
            <AsyncErrorBanner
              status={status}
              hasData={adhesions.length > 0}
              errorMessage={errorMessage}
            />
            <Card muted>
              <AppText variant="caption">
                Un compte accepté accède à la discussion et à ses propres signalements. Tout le
                reste de l’application — menus, agenda, actualités, documents destinés aux familles
                — se consulte sans compte, quel que soit le statut.
              </AppText>
              <View style={styles.chips}>
                {STATUTS.map((entree) => (
                  <Chip
                    key={entree.statut}
                    label={entree.label}
                    selected={entree.statut === statut}
                    onSelect={() => {
                      onFiltrer(entree.statut);
                    }}
                  />
                ))}
              </View>
              <AppText variant="caption">{EXPLICATIONS[statut]}</AppText>
              {/* La borne de `listerAdhesions` est un garde-fou, pas un choix
                  d'affichage : si elle mord, il faut le dire, sinon le bureau
                  croirait avoir tout vu et laisserait des demandes sans réponse. */}
              {adhesions.length < MAX_DEMANDES ? null : (
                <AppText variant="caption" bold>
                  Seules les {MAX_DEMANDES} premières demandes sont affichées. Traitez celles-ci
                  pour faire apparaître les suivantes.
                </AppText>
              )}
            </Card>
            {erreur === null ? null : <ErrorNotice error={erreur} />}
          </>
        }
        ListEmptyComponent={
          <AsyncFallback
            status={status}
            hasData={adhesions.length > 0}
            errorMessage={errorMessage}
            onRetry={reload}
            emptyTitle="Personne dans cette liste"
            emptyDescription="Les demandes d’adhésion apparaissent ici dès qu’une famille s’inscrit."
            emptyIcon="people-outline"
            loadingMessage="Chargement des adhésions…"
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
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  chip: {
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  chipSelectionne: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  chipAppuye: {
    opacity: 0.8,
  },
  actions: {
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
});
