import { Ionicons } from '@expo/vector-icons';
import { useBottomTabBarHeight } from '@react-navigation/bottom-tabs';
import { useCallback, useState } from 'react';
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

import { useCurrentUserId } from '@/auth/AuthProvider';
import { AppText, AsyncErrorBanner, AsyncFallback, ErrorNotice, Screen } from '@/components';
import { useAsyncData } from '@/hooks/useAsyncData';
import { fetchDiscussionMessages, postDiscussionMessage } from '@/services/discussion';
import { colors, fontSize, radius, spacing } from '@/theme';
import type { DiscussionMessageWithAuthor } from '@/types/models';
import { formatDateTime } from '@/utils/date';

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

export function DiscussionMembresScreen() {
  const userId = useCurrentUserId();
  const tabBarHeight = useBottomTabBarHeight();

  const loader = useCallback(() => fetchDiscussionMessages(), []);
  const { status, data, errorMessage, refreshing, refresh, reload } = useAsyncData(loader);

  const messages = data ?? EMPTY;

  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<unknown>(null);

  const canSend = draft.trim() !== '' && !sending;

  const handleSend = useCallback(() => {
    const body = draft.trim();
    if (body === '' || sending) {
      return;
    }

    setSending(true);
    setSendError(null);

    void (async () => {
      try {
        await postDiscussionMessage(userId, body);
        // Le champ est vidé avant le rechargement : si celui-ci échoue, le
        // message est tout de même parti, et le laisser à l'écran ferait
        // croire à un échec — donc à un renvoi, donc à un doublon.
        //
        // `sending` est relâché dans le `finally`, donc avant l'arrivée de la
        // liste relue — là où la réservation de cantine, elle, doit tenir son
        // marqueur jusqu'à la relecture, sans quoi le bouton reprendrait le
        // libellé d'avant l'appui. Ici c'est sans conséquence : `canSend` exige
        // un brouillon non vide, et le brouillon vient d'être vidé. L'action ne
        // peut donc pas être rejouée, et le message apparaît dès que la
        // relecture atterrit.
        setDraft('');
        reload();
      } catch (caught) {
        setSendError(caught);
      } finally {
        setSending(false);
      }
    })();
  }, [draft, reload, sending, userId]);

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
        {messages.length === 0 ? (
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
            editable={!sending}
            accessibilityLabel="Votre message"
          />
          <Pressable
            onPress={handleSend}
            disabled={!canSend}
            accessibilityRole="button"
            accessibilityLabel="Envoyer le message"
            accessibilityState={{ disabled: !canSend, busy: sending }}
            style={({ pressed }) => [
              styles.sendButton,
              !canSend && styles.sendButtonDisabled,
              pressed && canSend && styles.sendButtonPressed,
            ]}
          >
            {sending ? (
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
