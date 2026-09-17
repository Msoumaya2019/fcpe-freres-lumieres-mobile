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
import { createSignalement, fetchMySignalements } from '@/services/signalements';
import { colors, radius, spacing } from '@/theme';
import {
  SIGNALEMENT_CATEGORIES,
  SIGNALEMENT_CATEGORY_LABELS,
  SIGNALEMENT_STATUS_LABELS,
  type Signalement,
  type SignalementCategory,
  type SignalementStatus,
} from '@/types/models';
import { formatDateTime } from '@/utils/date';

const EMPTY: readonly Signalement[] = [];

/**
 * Longueur maximale de l'objet, alignée sur la contrainte
 * `signalements_subject_not_blank` de la migration (`char_length(btrim(subject))
 * between 1 and 160`).
 *
 * La borne basse est déjà tenue par la validation du formulaire. La haute ne
 * l'était pas : un objet de plus de 160 caractères était refusé par le serveur,
 * et l'adhérent lisait « La valeur envoyée n'est pas acceptée par le serveur »
 * — sans savoir quel champ, ni quelle longueur. La description, elle, n'a pas de
 * borne haute côté base : rien à aligner.
 */
const MAX_SUBJECT_LENGTH = 160;

const STATUS_COLORS: Readonly<Record<SignalementStatus, string>> = {
  nouveau: colors.warning,
  en_cours: colors.primary,
  traite: colors.success,
};

interface CategoryChipProps {
  readonly category: SignalementCategory;
  readonly selected: boolean;
  readonly disabled: boolean;
  readonly onSelect: (category: SignalementCategory) => void;
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
        {SIGNALEMENT_CATEGORY_LABELS[category]}
      </AppText>
    </Pressable>
  );
}

export function MesSignalementsScreen() {
  const userId = useCurrentUserId();

  const loader = useCallback(() => fetchMySignalements(userId), [userId]);
  const { status, data, errorMessage, refreshing, refresh, reload } = useAsyncData(loader);

  const signalements = data ?? EMPTY;

  const [formOpen, setFormOpen] = useState(false);
  const [category, setCategory] = useState<SignalementCategory>('cantine');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [formError, setFormError] = useState<unknown>(null);
  const [submitting, setSubmitting] = useState(false);

  const closeForm = useCallback(() => {
    setFormOpen(false);
    setFormError(null);
    setSubject('');
    setBody('');
    setCategory('cantine');
  }, []);

  const handleSubmit = useCallback(() => {
    if (subject.trim() === '') {
      // `userMessage` marque la phrase comme déjà rédigée pour l'adhérent :
      // sans elle, `appErrorMessage` la prendrait pour un message technique non
      // reconnu et afficherait « Une erreur inattendue est survenue » — en
      // invitant à réessayer, ce qui ne peut pas marcher.
      setFormError(userMessage('Indiquez un objet en quelques mots.'));
      return;
    }
    if (body.trim() === '') {
      setFormError(userMessage('Décrivez votre signalement.'));
      return;
    }

    setFormError(null);
    setSubmitting(true);

    void (async () => {
      try {
        await createSignalement({
          authorId: userId,
          category,
          subject,
          body,
        });
        closeForm();
        // `closeForm()` referme le formulaire : l'action ne peut pas être
        // rejouée pendant la relecture, et `submitting` peut donc être relâché
        // avant son arrivée. C'est exactement la raison pour laquelle la
        // réservation de cantine, elle, doit tenir son marqueur jusqu'à la
        // relecture : son bouton, lui, reste à l'écran avec son ancien libellé.
        reload();
      } catch (caught) {
        setFormError(caught);
      } finally {
        setSubmitting(false);
      }
    })();
  }, [body, category, closeForm, reload, subject, userId]);

  const renderItem = useCallback(
    ({ item }: ListRenderItemInfo<Signalement>) => (
      <Card>
        <View style={styles.itemHeader}>
          <AppText variant="heading" style={styles.itemTitle}>
            {item.subject}
          </AppText>
          <AppText variant="caption" bold color={STATUS_COLORS[item.status]}>
            {SIGNALEMENT_STATUS_LABELS[item.status]}
          </AppText>
        </View>
        <AppText variant="caption">
          {SIGNALEMENT_CATEGORY_LABELS[item.category]} · {formatDateTime(item.created_at)}
        </AppText>
        <AppText>{item.body}</AppText>
      </Card>
    ),
    [],
  );

  return (
    <Screen padded={false} edges={[]}>
      <FlatList
        data={signalements}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        contentContainerStyle={[styles.list, signalements.length === 0 && styles.listEmpty]}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={colors.primary} />
        }
        ListHeaderComponent={
          <>
            <AsyncErrorBanner
              status={status}
              hasData={signalements.length > 0}
              errorMessage={errorMessage}
            />
            <Card muted>
              {formOpen ? (
                <>
                  <AppText variant="heading">Nouveau signalement</AppText>

                  <AppText variant="caption" bold>
                    Catégorie
                  </AppText>
                  <View style={styles.chipRow}>
                    {SIGNALEMENT_CATEGORIES.map((value) => (
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
                    label="Description"
                    value={body}
                    onChangeText={setBody}
                    placeholder="Décrivez la situation, les faits et les personnes concernées."
                    multiline
                    numberOfLines={5}
                    editable={!submitting}
                    inputStyle={styles.multiline}
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
                  <AppText variant="caption">
                    Un problème de cantine, de transport ou de vie scolaire ? Signalez-le au bureau
                    : il sera traité et vous pourrez suivre son avancement ici.
                  </AppText>
                  <Button
                    label="Nouveau signalement"
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
            hasData={signalements.length > 0}
            errorMessage={errorMessage}
            onRetry={reload}
            emptyTitle="Aucun signalement"
            emptyDescription="Vos signalements et leur avancement apparaîtront ici."
            emptyIcon="alert-circle-outline"
            loadingMessage="Chargement de vos signalements…"
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
