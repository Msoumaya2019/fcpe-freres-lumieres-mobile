import { Ionicons } from '@expo/vector-icons';
import { useBottomTabBarHeight } from '@react-navigation/bottom-tabs';
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  RefreshControl,
  StyleSheet,
  TextInput,
  View,
  type ListRenderItemInfo,
} from 'react-native';

import { useAuth, useCurrentUserId } from '@/auth/AuthProvider';
import {
  AppText,
  AsyncErrorBanner,
  AsyncFallback,
  Card,
  ErrorNotice,
  LoadingView,
  Screen,
} from '@/components';
import { useAsyncData } from '@/hooks/useAsyncData';
import { fetchDiscussionMessages, postDiscussionMessage } from '@/services/discussion';
import { marquerDiscussionLue } from '@/services/unread';
import { colors, fontSize, radius, spacing } from '@/theme';
import type { DiscussionMessageWithAuthor } from '@/types/models';
import { formatDateTime } from '@/utils/date';
import { pendingTarget, type PendingAction } from '@/utils/pendingAction';

const EMPTY: readonly DiscussionMessageWithAuthor[] = [];
const MAX_MESSAGE_LENGTH = 2000;

interface MessageBubbleProps {
  readonly message: DiscussionMessageWithAuthor;
  readonly isOwn: boolean;
}

function MessageBubble({ message, isOwn }: MessageBubbleProps) {
  return (
    <View style={[styles.bubbleRow, isOwn ? styles.bubbleRowOwn : styles.bubbleRowOther]}>
      <View style={[styles.bubble, isOwn ? styles.bubbleOwn : styles.bubbleOther]}>
        <AppText variant="caption" bold color={isOwn ? colors.primarySoft : colors.textSecondary}>
          {isOwn ? 'Vous' : message.authorName}
        </AppText>
        <AppText color={isOwn ? colors.textOnPrimary : colors.textPrimary}>{message.body}</AppText>
        <AppText variant="caption" color={isOwn ? colors.primarySoft : colors.textSecondary}>
          {formatDateTime(message.created_at)}
        </AppText>
      </View>
    </View>
  );
}

/**
 * Le salon, tel qu'un adhérent accepté le voit.
 *
 * Il est séparé de `DiscussionMembresScreen`, qui l'aiguille, et ce n'est pas un
 * découpage de confort : `useCurrentUserId()` **lève** quand il n'y a pas de
 * session, et c'est sa raison d'être — il évite de parsemer les écrans de
 * `session?.user.id ?? ''`, qui produirait des requêtes silencieusement vides si
 * la garantie tombait. Ce composant-ci n'est donc monté que lorsque la garantie
 * tient, et le seul endroit qui la vérifie est l'aiguillage ci-dessous.
 */
function SalonMembres() {
  const userId = useCurrentUserId();
  const tabBarHeight = useBottomTabBarHeight();

  const loader = useCallback(() => fetchDiscussionMessages(), []);
  const { status, data, errorMessage, refreshing, refresh, reload } = useAsyncData(loader);

  const messages = data ?? EMPTY;

  /**
   * La discussion est marquée lue dès que la liste est affichée.
   *
   * POURQUOI LA MARQUE SUIT LA LISTE AFFICHÉE, ET NON L'OUVERTURE DE L'ÉCRAN
   * ----------------------------------------------------------------------
   * C'est `messages[0]` qui décide, et non l'heure de l'appareil : la marque est
   * le `created_at` du message le plus récent **réellement chargé**. Un message
   * arrivé pendant le chargement ne peut donc pas être marqué lu par erreur — il
   * n'est pas dans la liste, donc il n'est pas dans la marque.
   *
   * La liste arrive du plus récent au plus ancien : c'est l'ordre qu'exige la
   * liste inversée qui l'affiche, et c'est aussi celui de l'index zéro.
   *
   * `status === 'ready'` est nécessaire : pendant un chargement, `data` vaut
   * `null`, donc `messages` est vide, et marquer une liste vide effacerait la
   * marque précédente. `marquerDiscussionLue` refuse d'ailleurs `null` pour la
   * même raison.
   */
  useEffect(() => {
    if (status !== 'ready') {
      return;
    }

    void marquerDiscussionLue(userId, messages[0]?.created_at ?? null);
  }, [messages, status, userId]);

  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [envoi, setEnvoi] = useState<PendingAction<string> | null>(null);
  const [sendError, setSendError] = useState<unknown>(null);

  /**
   * L'envoi couvre l'écriture **et** la relecture, et deux mécanismes y
   * pourvoient parce qu'aucun des deux ne suffit seul.
   *
   * `sending` couvre l'aller-retour de l'insertion ; `pendingTarget` prend le
   * relais jusqu'à l'arrivée de la liste relue. Le second ne peut pas couvrir le
   * premier : il s'éteint dès que le statut est en erreur, et le compositeur,
   * lui, reste à l'écran dans cet état — contrairement au bouton d'une carte de
   * menu, qui n'existe plus quand la liste est vide.
   *
   * MESURÉ, ET C'EST CE QUI A CHANGÉ
   * Le brouillon vidé empêchait de rejouer le **même** texte, et cela était pris
   * pour une raison suffisante. Elle ne l'est pas : l'écran invitait à en écrire
   * un autre. Modèle d'état de l'écran, salon vide, quatre instants :
   *
   *   avant l'appui       « Aucun message / Ouvrez la discussion en écrivant le
   *                         premier message »        invitation, envoi ouvert
   *   insertion en vol    la même invitation          invitation, envoi bloqué
   *   relecture EN VOL    la même invitation          invitation, envoi OUVERT
   *   relecture atterrie  liste : 1 message
   *
   * La troisième ligne est le défaut : le serveur a accepté le message, le champ
   * est vide, et l'écran propose d'écrire le premier. Aucune contrainte
   * d'unicité n'absorbe ce doublon — `discussion_messages` n'en a pas — et le
   * second message part chez **tous** les membres.
   *
   * Pas d'affichage optimiste pour autant : montrer la bulle avant la relecture
   * mentirait dès qu'une politique RLS refuse l'insertion, ce que la cantine a
   * déjà tranché. Tant que l'envoi dure, l'écran dit donc qu'il envoie.
   *
   * LIMITE ASSUMÉE
   * `pendingTarget` relâche le marqueur sur une relecture en échec, sans quoi
   * l'indicateur tournerait sans fin. Le compositeur rouvre donc si la relecture
   * échoue **alors que le statut était déjà en erreur** au moment de l'appui
   * (`reload()` ne repasse pas par « chargement » quand il y a du contenu à
   * conserver). Le cas est mesuré, laissé ouvert, et `check-pending-action` le
   * tient pour tel au lieu de le supposer fermé.
   */
  const envoiEnCours = sending || pendingTarget(envoi, status, data) !== null;

  const canSend = draft.trim() !== '' && !envoiEnCours;

  const handleSend = useCallback(() => {
    const body = draft.trim();
    if (body === '' || envoiEnCours) {
      return;
    }

    setSending(true);
    setSendError(null);
    setEnvoi({ target: body, dataAtPress: data });

    void (async () => {
      try {
        await postDiscussionMessage(userId, body);
        // Le champ est vidé avant le rechargement : si celui-ci échoue, le
        // message est tout de même parti, et le laisser à l'écran ferait
        // croire à un échec — donc à un renvoi, donc à un doublon.
        setDraft('');
        reload();
      } catch (caught) {
        // L'écriture a échoué : aucune relecture n'aura lieu pour éteindre le
        // marqueur, il faut donc l'éteindre ici.
        setEnvoi(null);
        setSendError(caught);
      } finally {
        // Seul l'aller-retour de l'insertion s'arrête ici. Le marqueur, lui,
        // reste allumé tant que les données affichées sont celles d'avant
        // l'appui : c'est `pendingTarget` qui l'éteint, au rendu qui suit la
        // relecture.
        setSending(false);
      }
    })();
  }, [data, draft, envoiEnCours, reload, userId]);

  const renderItem = useCallback(
    ({ item }: ListRenderItemInfo<DiscussionMessageWithAuthor>) => (
      <MessageBubble message={item} isOwn={item.author_id === userId} />
    ),
    [userId],
  );

  return (
    <Screen padded={false} edges={[]}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        // Sans ce décalage, le clavier iOS pousse le champ de saisie derrière
        // la barre d'onglets.
        keyboardVerticalOffset={tabBarHeight}
      >
        {/* Un envoi en cours n'est pas une liste vide. Sans cette branche,
            l'écran affichait « Ouvrez la discussion en écrivant le premier
            message » pendant tout l'aller-retour — y compris après que le
            serveur a accepté le message, avec un champ vidé et ouvert. */}
        {messages.length === 0 ? (
          envoiEnCours ? (
            <LoadingView message="Envoi de votre message…" />
          ) : (
            <AsyncFallback
              status={status}
              hasData={false}
              errorMessage={errorMessage}
              onRetry={reload}
              emptyTitle="Aucun message"
              emptyDescription="Ouvrez la discussion en écrivant le premier message."
              emptyIcon="chatbubbles-outline"
              loadingMessage="Chargement de la discussion…"
            />
          )
        ) : (
          <FlatList
            // Inversée : l'ancrage se fait en bas, comme dans une messagerie.
            // Les données arrivent déjà du plus récent au plus ancien, ce qui
            // est l'ordre attendu par une liste inversée.
            inverted
            data={messages}
            keyExtractor={(item) => item.id}
            renderItem={renderItem}
            contentContainerStyle={styles.list}
            keyboardShouldPersistTaps="handled"
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={refresh}
                tintColor={colors.primary}
              />
            }
          />
        )}

        {/* Un échec de relecture alors que des messages sont affichés, ou un
            échec d'envoi : les deux se disent ici, sous la liste et au-dessus
            du champ de saisie. La condition reprend celle du bandeau, pour ne
            pas laisser une zone vide de `spacing.sm` quand il n'y a rien à
            dire. */}
        {sendError !== null || (status === 'error' && messages.length > 0) ? (
          <View style={styles.errorWrapper}>
            <AsyncErrorBanner
              status={status}
              hasData={messages.length > 0}
              errorMessage={errorMessage}
            />
            {sendError === null ? null : <ErrorNotice error={sendError} />}
          </View>
        ) : null}

        <View style={styles.composer}>
          <TextInput
            style={styles.composerInput}
            value={draft}
            onChangeText={setDraft}
            placeholder="Écrire un message…"
            placeholderTextColor={colors.textSecondary}
            multiline
            maxLength={MAX_MESSAGE_LENGTH}
            editable={!envoiEnCours}
            accessibilityLabel="Votre message"
          />
          <Pressable
            onPress={handleSend}
            disabled={!canSend}
            accessibilityRole="button"
            accessibilityLabel="Envoyer le message"
            accessibilityState={{ disabled: !canSend, busy: envoiEnCours }}
            style={({ pressed }) => [
              styles.sendButton,
              !canSend && styles.sendButtonDisabled,
              pressed && canSend && styles.sendButtonPressed,
            ]}
          >
            {envoiEnCours ? (
              <ActivityIndicator size="small" color={colors.textOnPrimary} />
            ) : (
              <Ionicons name="send" size={18} color={colors.textOnPrimary} />
            )}
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </Screen>
  );
}

/**
 * L'écran, et son aiguillage par l'adhésion.
 *
 * POURQUOI L'AIGUILLAGE EST ICI, ET NON DANS LE MENU
 * --------------------------------------------------
 * La politique de `discussion_messages` exige un membre **accepté** : pour tout
 * autre, elle rend une **liste vide**, jamais une erreur. « Plus » masque bien
 * l'entrée à qui n'est pas membre, mais l'**accueil** y mène sans condition — sa
 * cloche appelle `navigate('Plus', { screen: 'Discussion' })`. Un parent sans
 * compte y arrivait donc, et deux choses l'y attendaient : le composant appelait
 * `useCurrentUserId()`, qui **lève** sans session, puis la politique aurait rendu
 * une liste vide, affichée comme « Aucun message / Ouvrez la discussion en
 * écrivant le premier message » — l'invitation à faire exactement ce que la base
 * refuse, sous la même phrase pour trois situations distinctes : pas de compte,
 * demande en attente, accès suspendu.
 *
 * Aiguiller ici couvre **tous** les chemins d'accès, présents et à venir, au lieu
 * du seul que l'on connaît aujourd'hui.
 *
 * La phrase ne recopie pas les explications de statut de « Plus », qui en est la
 * source : elle y renvoie, plutôt que d'entretenir une seconde copie qui
 * divergerait à la première reformulation.
 */
export function DiscussionMembresScreen() {
  const { session, profile } = useAuth();

  //  `session !== null` d'abord : un profil peut survivre à une déconnexion le
  //  temps d'un rendu, et un statut lu sans session ne prouverait rien.
  if (session === null || profile?.status !== 'accepte') {
    return (
      <Screen scrollable edges={[]}>
        <Card muted>
          <AppText variant="heading">Réservé aux adhérents</AppText>
          <AppText variant="caption">
            {session === null
              ? 'Cette discussion est ouverte aux membres de l’association. Vous pouvez créer un compte depuis « Plus », sous « Espace membres » : le bureau validera votre demande.'
              : 'Votre adhésion n’est pas encore acceptée. Son état, et sa raison, sont indiqués dans « Plus », sous « Espace membres ».'}
          </AppText>
        </Card>
      </Screen>
    );
  }

  return <SalonMembres />;
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  list: {
    padding: spacing.lg,
    gap: spacing.sm,
  },
  bubbleRow: {
    flexDirection: 'row',
  },
  bubbleRowOwn: {
    justifyContent: 'flex-end',
  },
  bubbleRowOther: {
    justifyContent: 'flex-start',
  },
  bubble: {
    maxWidth: '85%',
    borderRadius: radius.lg,
    borderWidth: 1,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    gap: spacing.xs,
  },
  bubbleOwn: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  bubbleOther: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
  },
  errorWrapper: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.sm,
  },
  composer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: spacing.sm,
    padding: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.surface,
  },
  composerInput: {
    flex: 1,
    maxHeight: 120,
    minHeight: 44,
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    fontSize: fontSize.body,
    color: colors.textPrimary,
  },
  sendButton: {
    width: 44,
    height: 44,
    borderRadius: radius.pill,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendButtonDisabled: {
    opacity: 0.4,
  },
  sendButtonPressed: {
    opacity: 0.8,
  },
});
