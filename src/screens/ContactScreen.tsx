import { useCallback, useState } from 'react';
import {
  FlatList,
  Keyboard,
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
  Button,
  Card,
  ErrorNotice,
  Screen,
  TextField,
} from '@/components';
import { userMessage } from '@/errors';
import { useAsyncData } from '@/hooks/useAsyncData';
import {
  creerConversation,
  lireConversation,
  listerFils,
  repondreConversation,
  type FilLocal,
} from '@/services/conversations';
import { colors, radius, spacing } from '@/theme';
import {
  MESSAGE_CATEGORIES,
  MESSAGE_CATEGORY_LABELS,
  type ConversationMessage,
  type MessageCategory,
} from '@/types/models';
import { formatDateTime } from '@/utils/date';

/**
 * Contacter le bureau — une conversation privée, et **sans compte**.
 *
 * CE QUE CET ÉCRAN N'EST PAS
 * --------------------------
 * Ce n'est pas la discussion. La discussion est un fil entre adhérents, où tout
 * le monde lit tout le monde ; elle vit sous « Plus », et elle est réservée aux
 * membres acceptés. Ici, le message part au bureau, et **personne d'autre** ne
 * le lit.
 *
 * La distinction n'est pas cosmétique. Un parent qui signale une situation
 * personnelle — un enfant harcelé, une difficulté de paiement — écrit ici parce
 * qu'il croit s'adresser au bureau. Fusionner les deux écrans publierait ce
 * message au vu de tous, et le dégât serait irréversible. L'écran le dit donc
 * lui-même, en toutes lettres, avant le formulaire.
 *
 * POURQUOI LE PARENT N'A PAS DE COMPTE, ET CE QUE CELA COÛTE
 * ----------------------------------------------------------
 * L'ancienne version écrivait dans `messages`, une table dont l'auteur est une
 * ligne de `auth.users` : il fallait donc un compte, et le parent sans compte ne
 * pouvait pas écrire — il ne pouvait pas non plus **recevoir de réponse**, faute
 * d'endroit où la lui adresser.
 *
 * Une conversation n'appartient à aucun compte. Elle est identifiée par un
 * numéro et protégée par un **secret**, tous deux tirés par la base, et le
 * secret n'est rendu qu'une fois — à la création. Le téléphone le garde, et
 * c'est ce qui rouvre le fil.
 *
 * Le prix est réel et il est dit à l'écran : le secret ne vit que sur ce
 * téléphone. Le perdre — réinstallation, changement d'appareil —, c'est perdre
 * l'accès au fil, et l'application n'a aucun moyen de le rendre. C'est le prix
 * d'un accès sans compte, et il vaut mieux l'annoncer que le découvrir.
 */

const VIDE_FILS: readonly FilLocal[] = [];
const VIDE_MESSAGES: readonly ConversationMessage[] = [];

/**
 * Bornes alignées sur les contraintes de la migration — `conversations_subject_length`,
 * `conversation_messages_body_length`, `conversations_reply_to_length`.
 *
 * Sans elles, un objet trop long était refusé par le serveur et l'adhérent
 * lisait « La valeur envoyée n'est pas acceptée par le serveur » — sans savoir
 * quel champ ni quelle longueur. Le banc `check-input-limits` compare les trois
 * valeurs à celles des contraintes.
 */
const MAX_SUBJECT_LENGTH = 120;
const MAX_BODY_LENGTH = 4000;
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

/** Le geste de rafraîchissement, écrit une fois et posé sur les deux listes. */
function rafraichir(refreshing: boolean, refresh: () => void) {
  return <RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={colors.primary} />;
}

/** La phrase qui rappelle ce que cet écran n'est pas. */
function RappelDiscussion() {
  return (
    <AppText variant="caption">
      Ceci est une conversation privée avec le bureau. Pour échanger avec les autres adhérents,
      utilisez la discussion, sous « Plus » : tout le monde y lit tout le monde.
    </AppText>
  );
}

interface ListeFilsProps {
  readonly onOuvrir: (fil: FilLocal) => void;
}

/**
 * Les conversations retenues par ce téléphone, et le formulaire qui en ouvre une.
 *
 * Le chargement passe par `useAsyncData` alors que la lecture est locale
 * (`AsyncStorage`) : c'est ce qui donne à l'écran un état de chargement, une
 * erreur et une relecture, au lieu d'une liste qui apparaît vide le temps d'une
 * lecture de fichier.
 */
function ListeFils({ onOuvrir }: ListeFilsProps) {
  const charger = useCallback(() => listerFils(), []);
  const { status, data, errorMessage, refreshing, refresh, reload } = useAsyncData(charger);

  const fils = data ?? VIDE_FILS;

  const [formOpen, setFormOpen] = useState(false);
  const [category, setCategory] = useState<MessageCategory>('vie_scolaire');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [replyTo, setReplyTo] = useState('');
  const [formError, setFormError] = useState<unknown>(null);
  const [submitting, setSubmitting] = useState(false);

  const closeForm = useCallback(() => {
    // Le formulaire quitte l'écran : le clavier doit partir avec lui. Les champs
    // démontés le relâchent en principe, mais cette démission n'est écrite nulle
    // part dans le contrat de React — et un clavier resté ouvert recouvrirait ce
    // que le parent vient de lire.
    Keyboard.dismiss();
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
        const fil = await creerConversation({
          subject,
          category,
          body,
          replyTo: replyTo.trim() === '' ? null : replyTo,
        });
        // L'écran change : sans cela, le clavier resterait ouvert par-dessus la
        // conversation qui s'ouvre, et le parent ne verrait pas son message.
        Keyboard.dismiss();
        // On ouvre la conversation qui vient de naître, au lieu de revenir à la
        // liste : le parent voit son message envoyé, et la réponse du bureau
        // arrivera exactement là.
        onOuvrir(fil);
      } catch (caught) {
        setFormError(caught);
      } finally {
        setSubmitting(false);
      }
    })();
  }, [body, category, onOuvrir, replyTo, subject]);

  const renderItem = useCallback(
    ({ item }: ListRenderItemInfo<FilLocal>) => (
      <Pressable
        onPress={() => {
          onOuvrir(item);
        }}
        accessibilityRole="button"
        style={({ pressed }) => (pressed ? styles.pressed : undefined)}
      >
        <Card elevated>
          <View style={styles.itemHeader}>
            <AppText variant="heading" style={styles.itemTitle}>
              {item.subject}
            </AppText>
            <AppText variant="caption" color={colors.primary}>
              Ouvrir
            </AppText>
          </View>
          <AppText variant="caption">
            {MESSAGE_CATEGORY_LABELS[item.category]} · {formatDateTime(item.creeLe)}
          </AppText>
        </Card>
      </Pressable>
    ),
    [onOuvrir],
  );

  return (
    <Screen padded={false} edges={[]}>
      <FlatList
        data={fils}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        contentContainerStyle={[styles.list, fils.length === 0 && styles.listEmpty]}
        // `keyboardShouldPersistTaps` vaut « never » par défaut : la liste
        // consommerait le premier appui pour fermer le clavier, et « Envoyer »
        // ne le recevrait jamais. Mesuré par scripts/check-clavier-liste.test.mjs.
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        automaticallyAdjustKeyboardInsets
        refreshControl={rafraichir(refreshing, refresh)}
        ListHeaderComponent={
          <>
            <AsyncErrorBanner
              status={status}
              hasData={fils.length > 0}
              errorMessage={errorMessage}
            />
            <Card muted>
              {formOpen ? (
                <>
                  <AppText variant="heading">Votre message au bureau</AppText>
                  <RappelDiscussion />

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
                    hint="Laissez vide pour être recontacté dans l’application."
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
                  <RappelDiscussion />
                  <AppText variant="caption">
                    Vous n’avez pas besoin de compte. Votre message part au bureau de l’association,
                    et vous retrouverez sa réponse ici.
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
            {fils.length === 0 ? null : (
              <AppText variant="caption" bold>
                Vos conversations
              </AppText>
            )}
          </>
        }
        ListEmptyComponent={
          <AsyncFallback
            status={status}
            hasData={fils.length > 0}
            errorMessage={errorMessage}
            onRetry={reload}
            emptyTitle="Aucune conversation"
            emptyDescription="Écrivez au bureau : votre échange apparaîtra ici, et vous pourrez le poursuivre."
            emptyIcon="chatbubble-ellipses-outline"
            loadingMessage="Chargement de vos conversations…"
          />
        }
      />
    </Screen>
  );
}

interface VueFilProps {
  readonly fil: FilLocal;
  readonly onRetour: () => void;
}

/**
 * Un fil, ouvert : les messages échangés, et de quoi poursuivre.
 *
 * LE SECRET EST CE QUI OUVRE, ET LE NUMÉRO NE SUFFIT PAS
 * -----------------------------------------------------
 * `lireConversation` envoie les deux : la base compare l'empreinte du secret à
 * celle qu'elle garde, et un mauvais secret rend **la même chose** qu'un
 * identifiant inconnu — aucune ligne. Connaître le numéro d'une conversation ne
 * permet donc pas d'en lire le contenu, et il n'y a rien à énumérer.
 *
 * Une liste vide est ambiguë par construction — « secret refusé » et
 * « conversation sans message » se ressemblent —, mais le cas ne se produit pas :
 * une conversation naît avec son premier message, dans la même transaction.
 */
function VueFil({ fil, onRetour }: VueFilProps) {
  const charger = useCallback(() => lireConversation(fil), [fil]);
  const { status, data, errorMessage, refreshing, refresh, reload } = useAsyncData(charger);

  const messages = data ?? VIDE_MESSAGES;

  const [reponse, setReponse] = useState('');
  const [erreur, setErreur] = useState<unknown>(null);
  const [envoi, setEnvoi] = useState(false);
  const [refuse, setRefuse] = useState(false);

  const envoyer = useCallback(() => {
    if (reponse.trim() === '') {
      setErreur(userMessage('Écrivez votre message.'));
      return;
    }

    setErreur(null);
    setEnvoi(true);

    void (async () => {
      try {
        const accepte = await repondreConversation(fil, reponse);

        // `false` n'est pas une panne : c'est un refus, et il se dit en
        // français. Le confondre avec une erreur technique afficherait
        // « Réessayez » à quelqu'un pour qui réessayer ne marchera jamais.
        if (!accepte) {
          setRefuse(true);
          return;
        }

        setReponse('');
        reload();
      } catch (caught) {
        setErreur(caught);
      } finally {
        setEnvoi(false);
      }
    })();
  }, [fil, reponse, reload]);

  const renderItem = useCallback(
    ({ item }: ListRenderItemInfo<ConversationMessage>) => (
      <Card elevated>
        <View style={styles.itemHeader}>
          <AppText variant="caption" bold color={item.from_bureau ? colors.primary : undefined}>
            {item.from_bureau ? 'Le bureau' : 'Vous'}
          </AppText>
          <AppText variant="caption">{formatDateTime(item.created_at)}</AppText>
        </View>
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
        // `keyboardShouldPersistTaps` vaut « never » par défaut : la liste
        // consommerait le premier appui pour fermer le clavier, et « Envoyer »
        // ne le recevrait jamais. Mesuré par scripts/check-clavier-liste.test.mjs.
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        automaticallyAdjustKeyboardInsets
        refreshControl={rafraichir(refreshing, refresh)}
        ListHeaderComponent={
          <>
            <AsyncErrorBanner
              status={status}
              hasData={messages.length > 0}
              errorMessage={errorMessage}
            />
            <Card muted>
              <AppText variant="heading">{fil.subject}</AppText>
              <AppText variant="caption">
                {MESSAGE_CATEGORY_LABELS[fil.category]} · ouverte le {formatDateTime(fil.creeLe)}
              </AppText>
              <AppText variant="caption">
                Cette conversation est gardée sur ce téléphone. Si vous réinstallez l’application ou
                changez d’appareil, vous ne pourrez plus la rouvrir : notez l’objet et écrivez de
                nouveau, ou passez par l’adresse du bureau.
              </AppText>
              <Button label="Retour à mes conversations" variant="ghost" onPress={onRetour} />
            </Card>
            {refuse ? (
              <Card>
                <ErrorNotice
                  error={userMessage(
                    'Cette conversation ne s’ouvre plus depuis ce téléphone. Écrivez de nouveau au bureau : votre nouveau message créera une conversation.',
                  )}
                />
              </Card>
            ) : null}
          </>
        }
        ListFooterComponent={
          messages.length === 0 ? null : (
            <Card muted>
              <AppText variant="heading">Poursuivre</AppText>
              <TextField
                label="Votre message"
                value={reponse}
                onChangeText={setReponse}
                placeholder="Ajoutez une précision, répondez au bureau."
                multiline
                numberOfLines={4}
                maxLength={MAX_BODY_LENGTH}
                editable={!envoi}
                inputStyle={styles.multiline}
              />
              {erreur === null ? null : <ErrorNotice error={erreur} />}
              <Button label="Envoyer" onPress={envoyer} loading={envoi} />
            </Card>
          )
        }
        ListEmptyComponent={
          <AsyncFallback
            status={status}
            hasData={messages.length > 0}
            errorMessage={errorMessage}
            onRetry={reload}
            emptyTitle="Aucun message"
            emptyDescription="Le premier message de cette conversation n’a pas pu être relu."
            emptyIcon="chatbubble-ellipses-outline"
            loadingMessage="Ouverture de la conversation…"
          />
        }
      />
    </Screen>
  );
}

/**
 * L'écran de contact, et son aiguillage.
 *
 * DEUX COMPOSANTS, ET NON UN SEUL AVEC UNE CONDITION
 * --------------------------------------------------
 * Le fil est monté **à la place** de la liste, pas à côté : c'est ce qui repart
 * d'un état de chargement franc. Avec un seul composant, le changement de fil
 * laissait la liste affichée pendant la lecture de la conversation — un
 * clignotement qui montre le mauvais contenu au mauvais moment.
 *
 * Le `key` rend la garantie explicite : ouvrir un autre fil remonte le composant
 * plutôt que de le mettre à jour.
 */
export function ContactScreen() {
  const [fil, setFil] = useState<FilLocal | null>(null);

  const retour = useCallback(() => {
    setFil(null);
  }, []);

  if (fil === null) {
    return <ListeFils onOuvrir={setFil} />;
  }

  return <VueFil key={fil.id} fil={fil} onRetour={retour} />;
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
  pressed: {
    opacity: 0.85,
  },
  multiline: {
    minHeight: 110,
    textAlignVertical: 'top',
  },
});
