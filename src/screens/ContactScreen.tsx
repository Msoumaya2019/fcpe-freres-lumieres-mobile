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
  Button,
  Card,
  ErrorNotice,
  Screen,
  TextField,
} from '@/components';
import { userMessage } from '@/errors';
import { useAsyncData } from '@/hooks/useAsyncData';
import { createMessage, fetchMyMessages } from '@/services/messages';
import { colors, radius, spacing } from '@/theme';
import {
  MESSAGE_CATEGORIES,
  MESSAGE_CATEGORY_LABELS,
  type MemberMessage,
  type MessageCategory,
} from '@/types/models';
import { formatDateTime } from '@/utils/date';

const VIDE: readonly MemberMessage[] = [];

/**
 * Bornes alignées sur les contraintes de la migration
 * (`char_length(btrim(subject)) between 1 and 160`, idem pour le corps à 4000).
 *
 * Sans elles, un objet trop long était refusé par le serveur et l'adhérent
 * lisait « La valeur envoyée n'est pas acceptée par le serveur » — sans savoir
 * quel champ ni quelle longueur.
 */
const MAX_SUBJECT_LENGTH = 160;
const MAX_BODY_LENGTH = 4000;

/** Longueur d'une adresse, alignée sur `messages_reply_length`. */
const MAX_EMAIL_LENGTH = 254;

interface CategoryChipProps {
  readonly category: MessageCategory;
  readonly selected: boolean;
  readonly disabled: boolean;
  readonly onSelect: (category: MessageCategory) => void;
}

function CategoryChip({ category, selected, disabled, onSelect }: CategoryChipProps) {
  return (
    <Pressable
      onPress={() => {
        onSelect(category);
      }}
      disabled={disabled}
      accessibilityRole="radio"
      accessibilityState={{ selected, disabled }}
      style={({ pressed }) => [
        styles.chip,
        selected && styles.chipSelected,
        pressed && styles.chipPressed,
        disabled && styles.chipDisabled,
      ]}
    >
      <AppText
        variant="caption"
        bold={selected}
        color={selected ? colors.textOnPrimary : colors.textPrimary}
      >
        {MESSAGE_CATEGORY_LABELS[category]}
      </AppText>
    </Pressable>
  );
}

/**
 * Contacter le bureau.
 *
 * CE QUE CET ÉCRAN N'EST PAS
 * --------------------------
 * Ce n'est pas la discussion. La discussion est un fil entre adhérents, où tout
 * le monde lit tout le monde. Ici, le message part au bureau, et **personne
 * d'autre** ne le voit : la politique de lecture de `messages` ne laisse passer
 * que l'auteur et les administrateurs.
 *
 * La distinction n'est pas cosmétique. Un parent qui signale une situation
 * personnelle — un enfant harcelé, une difficulté de paiement — écrit ici parce
 * qu'il croit s'adresser au bureau. Fusionner les deux écrans publierait ce
 * message au vu de tous, et le dégât serait irréversible.
 *
 * C'est pourquoi l'écran le dit lui-même, en une phrase, avant le formulaire :
 * l'adhérent doit savoir qui lira ce qu'il écrit.
 */
export function ContactScreen() {
  const userId = useCurrentUserId();

  const loader = useCallback(() => fetchMyMessages(userId), [userId]);
  const { status, data, errorMessage, refreshing, refresh, reload } = useAsyncData(loader);

  const messages = data ?? VIDE;

  const [formOpen, setFormOpen] = useState(false);
  const [category, setCategory] = useState<MessageCategory>('vie_scolaire');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [replyTo, setReplyTo] = useState('');
  const [formError, setFormError] = useState<unknown>(null);
  const [submitting, setSubmitting] = useState(false);

  const closeForm = useCallback(() => {
    setFormOpen(false);
    setFormError(null);
    setSubject('');
    setBody('');
    setReplyTo('');
    setCategory('vie_scolaire');
  }, []);

  const handleSubmit = useCallback(() => {
    if (subject.trim() === '') {
      // `userMessage` marque la phrase comme déjà rédigée pour l'adhérent :
      // sans elle, `appErrorMessage` la prendrait pour un message technique non
      // reconnu et afficherait « Une erreur inattendue est survenue ».
      setFormError(userMessage('Indiquez un objet en quelques mots.'));
      return;
    }
    if (body.trim() === '') {
      setFormError(userMessage('Écrivez votre message.'));
      return;
    }

    setFormError(null);
    setSubmitting(true);

    void (async () => {
      try {
        await createMessage({
          authorId: userId,
          category,
          subject,
          body,
          replyTo: replyTo.trim() === '' ? null : replyTo,
        });
        closeForm();
        // Le formulaire est refermé : l'action ne peut plus être rejouée, et
        // `submitting` peut être relâché avant la fin de la relecture. Le
        // bouton de réservation de cantine, lui, reste à l'écran et doit tenir
        // son marqueur jusqu'au bout.
        reload();
      } catch (caught) {
        setFormError(caught);
      } finally {
        setSubmitting(false);
      }
    })();
  }, [body, category, closeForm, reload, replyTo, subject, userId]);

  const renderItem = useCallback(
    ({ item }: ListRenderItemInfo<MemberMessage>) => (
      <Card elevated>
        <View style={styles.itemHeader}>
          <AppText variant="heading" style={styles.itemTitle}>
            {item.subject}
          </AppText>
          <AppText variant="caption" bold color={item.handled ? colors.success : colors.warning}>
            {item.handled ? 'Traité' : 'Reçu'}
          </AppText>
        </View>
        <AppText variant="caption">
          {MESSAGE_CATEGORY_LABELS[item.category]} · {formatDateTime(item.created_at)}
        </AppText>
        <AppText>{item.body}</AppText>
      </Card>
    ),
    [],
  );

  return (
    <Screen padded={false} edges={[]}>
      <FlatList
        data={messages}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        contentContainerStyle={[styles.list, messages.length === 0 && styles.listEmpty]}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={colors.primary} />
        }
        ListHeaderComponent={
          <>
            <AsyncErrorBanner
              status={status}
              hasData={messages.length > 0}
              errorMessage={errorMessage}
            />
            <Card muted>
              {formOpen ? (
                <>
                  <AppText variant="heading">Votre message au bureau</AppText>
                  <AppText variant="caption">
                    Seul le bureau de l’association lira ce message.
                  </AppText>

                  <AppText variant="caption" bold>
                    Sujet
                  </AppText>
                  <View style={styles.chipRow}>
                    {MESSAGE_CATEGORIES.map((value) => (
                      <CategoryChip
                        key={value}
                        category={value}
                        selected={value === category}
                        disabled={submitting}
                        onSelect={setCategory}
                      />
                    ))}
                  </View>

                  <TextField
                    label="Objet"
                    value={subject}
                    onChangeText={setSubject}
                    placeholder="En quelques mots"
                    maxLength={MAX_SUBJECT_LENGTH}
                    editable={!submitting}
                  />
                  <TextField
                    label="Message"
                    value={body}
                    onChangeText={setBody}
                    placeholder="Posez votre question, signalez un problème, proposez une idée."
                    multiline
                    numberOfLines={5}
                    maxLength={MAX_BODY_LENGTH}
                    editable={!submitting}
                    inputStyle={styles.multiline}
                  />
                  <TextField
                    label="Adresse pour la réponse (facultatif)"
                    value={replyTo}
                    onChangeText={setReplyTo}
                    placeholder="vous@exemple.fr"
                    keyboardType="email-address"
                    autoCapitalize="none"
                    autoCorrect={false}
                    maxLength={MAX_EMAIL_LENGTH}
                    editable={!submitting}
                    hint="Laissez vide pour être recontacté dans l'application."
                  />

                  {formError === null ? null : <ErrorNotice error={formError} />}

                  <Button label="Envoyer" onPress={handleSubmit} loading={submitting} />
                  <Button
                    label="Annuler"
                    variant="ghost"
                    onPress={closeForm}
                    disabled={submitting}
                  />
                </>
              ) : (
                <>
                  <AppText variant="heading">Comment pouvons-nous vous aider ?</AppText>
                  <AppText variant="caption">
                    Une question, un problème à signaler, une idée à proposer ? Écrivez au bureau de
                    l’association : votre message lui parvient directement, et vous retrouverez sa
                    réponse ici.
                  </AppText>
                  <Button
                    label="Écrire au bureau"
                    onPress={() => {
                      setFormOpen(true);
                    }}
                  />
                </>
              )}
            </Card>
          </>
        }
        ListEmptyComponent={
          <AsyncFallback
            status={status}
            hasData={messages.length > 0}
            errorMessage={errorMessage}
            onRetry={reload}
            emptyTitle="Aucun message envoyé"
            emptyDescription="Vos échanges avec le bureau apparaîtront ici."
            emptyIcon="chatbubble-ellipses-outline"
            loadingMessage="Chargement de vos messages…"
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
  itemHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  itemTitle: {
    flexShrink: 1,
  },
  chipRow: {
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
  chipSelected: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  chipPressed: {
    opacity: 0.8,
  },
  chipDisabled: {
    opacity: 0.5,
  },
  multiline: {
    minHeight: 110,
    textAlignVertical: 'top',
  },
});
