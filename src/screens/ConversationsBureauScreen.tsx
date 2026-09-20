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
  TextField,
} from '@/components';
import { userMessage } from '@/errors';
import { useAsyncData } from '@/hooks/useAsyncData';
import {
  lireConversationBureau,
  listerConversationsBureau,
  repondreConversationBureau,
  type ConversationBureau,
} from '@/services/conversations';
import { colors, spacing } from '@/theme';
import {
  MESSAGE_CATEGORY_LABELS,
  type ConversationMessage,
  type ConversationStatus,
} from '@/types/models';
import { formatDateTime } from '@/utils/date';
import { pendingTarget, type PendingAction } from '@/utils/pendingAction';

/**
 * Les messages des familles, vus du bureau.
 *
 * POURQUOI CET ÉCRAN EXISTE, ET CE QU'IL RÉPARE
 * ---------------------------------------------
 * `src/services/conversations.ts` portait déjà les trois fonctions du bureau —
 * lister, lire, répondre —, et **aucun écran ne les employait**. Le parent
 * écrivait donc dans le vide : la conversation était créée, le message
 * enregistré, et personne, dans l'application, ne pouvait le lire. C'est le
 * défaut le plus coûteux de cette famille, parce qu'il ne se voit pas : rien
 * n'échoue, aucune erreur n'apparaît, et le parent attend une réponse qui ne
 * viendra jamais.
 *
 * Un banc ne pouvait pas le voir non plus. `check-async-wiring` vérifie qu'un
 * écran **importé** est monté quelque part ; ces fonctions n'étaient importées
 * nulle part, donc le contrôle était vert. Le défaut n'était pas une promesse
 * non tenue dans un commentaire : c'était un service complet sans porteur.
 *
 * POURQUOI IL EST RÉSERVÉ AU BUREAU, ET COMMENT C'EST TENU
 * -------------------------------------------------------
 * Les tables `conversations` et `conversation_messages` n'ont **aucune
 * politique RLS** : aucun rôle ne peut les lire directement, et tout passe par
 * des fonctions `security definer` qui vérifient `is_admin()` dans leur corps.
 * Un membre ordinaire qui appellerait ces fonctions reçoit « Réservé au
 * bureau. » — un refus explicite, et non une liste vide.
 *
 * L'écran le dit avant même d'essayer, et c'est une **honnêteté d'affichage**,
 * pas un contrôle : la sécurité vit dans la base, et elle seule décide. Le
 * masquage évite au membre ordinaire d'ouvrir une rubrique pour y lire un refus.
 *
 * CE QUE L'ÉCRAN MONTRE D'UN FIL
 * ------------------------------
 * L'objet, la catégorie, l'état, le nombre de messages et le début du dernier.
 * L'adresse laissée par le parent s'affiche **quand elle existe** : c'est le
 * seul moyen de répondre à quelqu'un qui ne rouvrira pas l'application, et la
 * taire reviendrait à perdre le contact qu'il a pris la peine de laisser.
 */

const VIDE_FILS: readonly ConversationBureau[] = [];
const VIDE_MESSAGES: readonly ConversationMessage[] = [];

/**
 * La borne du serveur, reprise ici — `conversation_messages_body_length`, 4000.
 *
 * Sans elle, une réponse trop longue serait refusée par la contrainte, et le
 * bureau lirait « La valeur envoyée n'est pas acceptée par le serveur » sans
 * savoir quel champ ni quelle longueur.
 */
const MAX_BODY_LENGTH = 4000;

/**
 * Les trois états d'un fil, dits en français.
 *
 * Le bureau est le seul à les voir : le parent, lui, ne connaît que « sa »
 * conversation. Les nommer ici plutôt qu'à l'endroit de l'affichage évite
 * qu'une seconde copie apparaisse le jour où l'état s'affichera ailleurs.
 */
const STATUTS: Readonly<Record<ConversationStatus, string>> = {
  nouveau: 'Nouveau',
  en_cours: 'En cours',
  clos: 'Clos',
};

/** Le geste de rafraîchissement, écrit une fois et posé sur les deux listes. */
function rafraichir(refreshing: boolean, refresh: () => void) {
  return <RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={colors.primary} />;
}

interface VueConversationProps {
  readonly conversation: ConversationBureau;
  readonly onRetour: () => void;
}

/**
 * Un fil ouvert : tout ce qui s'est dit, et de quoi répondre.
 *
 * `repondre_conversation_bureau` passe l'état du fil à `en_cours` dès la
 * première réponse : le bureau n'a donc rien à faire pour cela, et l'écran ne
 * propose pas de bouton d'état — un réglage qui n'agirait sur rien serait pire
 * qu'absent.
 */
function VueConversation({ conversation, onRetour }: VueConversationProps) {
  const charger = useCallback(() => lireConversationBureau(conversation.id), [conversation.id]);
  const { status, data, errorMessage, refreshing, refresh, reload } = useAsyncData(charger);

  const messages = data ?? VIDE_MESSAGES;

  const [reponse, setReponse] = useState('');
  const [erreur, setErreur] = useState<unknown>(null);

  /**
   * L'envoi couvre l'écriture **et** la relecture, et deux mécanismes y
   * pourvoient — exactement comme dans la discussion, et pour la même raison.
   *
   * `sending` couvre l'aller-retour de l'appel ; `pendingTarget` prend le
   * relais jusqu'à ce que la liste relue arrive. Un `finally` seul relâcherait
   * l'indicateur **pendant** la relecture : la réponse serait partie, le champ
   * serait vide, et l'écran aurait repris l'apparence qu'il avait avant
   * l'appui — le bureau conclurait à un échec et répondrait une seconde fois.
   */
  const [sending, setSending] = useState(false);
  const [envoi, setEnvoi] = useState<PendingAction<string> | null>(null);

  const envoiEnCours = sending || pendingTarget(envoi, status, data) !== null;

  const envoyer = useCallback(() => {
    if (reponse.trim() === '') {
      // `userMessage` marque la phrase comme déjà rédigée pour le bureau : sans
      // elle, `appErrorMessage` la prendrait pour un message technique non
      // reconnu et afficherait « Une erreur inattendue est survenue ».
      setErreur(userMessage('Écrivez votre réponse.'));
      return;
    }
    if (envoiEnCours) {
      return;
    }

    setErreur(null);
    setSending(true);
    setEnvoi({ target: reponse, dataAtPress: data });

    void (async () => {
      try {
        await repondreConversationBureau(conversation.id, reponse);
        // Le champ est vidé **avant** la relecture : si celle-ci échoue, la
        // réponse est tout de même partie, et la laisser à l'écran ferait
        // croire à un échec — donc à un second envoi.
        setReponse('');
        reload();
      } catch (caught) {
        // L'écriture a échoué : aucune relecture n'aura lieu pour éteindre le
        // marqueur, il faut donc l'éteindre ici.
        setEnvoi(null);
        setErreur(caught);
      } finally {
        // Seul l'aller-retour de l'appel s'arrête ici ; le marqueur, lui, reste
        // allumé tant que les données affichées sont celles d'avant l'appui.
        setSending(false);
      }
    })();
  }, [conversation.id, data, envoiEnCours, reponse, reload]);

  const renderItem = useCallback(
    ({ item }: ListRenderItemInfo<ConversationMessage>) => (
      <Card elevated>
        <View style={styles.ligneEntete}>
          <AppText variant="caption" bold color={item.from_bureau ? colors.primary : undefined}>
            {item.from_bureau ? 'Le bureau' : 'Le parent'}
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
        contentContainerStyle={[styles.liste, messages.length === 0 && styles.listeVide]}
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
              <AppText variant="heading">{conversation.subject}</AppText>
              <AppText variant="caption">
                {MESSAGE_CATEGORY_LABELS[conversation.category]} · {STATUTS[conversation.status]} ·
                ouverte le {formatDateTime(conversation.created_at)}
              </AppText>
              {/* L'adresse n'est montrée que lorsqu'elle existe : un champ vide
                  affiché en clair ferait croire à un oubli du parent. */}
              {conversation.reply_to === null ? null : (
                <AppText variant="caption" bold>
                  Répondre par e-mail : {conversation.reply_to}
                </AppText>
              )}
              <Button label="Retour aux messages" variant="ghost" onPress={onRetour} />
            </Card>
          </>
        }
        ListFooterComponent={
          messages.length === 0 ? null : (
            <Card muted>
              <AppText variant="heading">Répondre</AppText>
              <TextField
                label="Votre réponse"
                value={reponse}
                onChangeText={setReponse}
                placeholder="La réponse s’affichera chez le parent, dans son application."
                multiline
                numberOfLines={5}
                maxLength={MAX_BODY_LENGTH}
                editable={!envoiEnCours}
                inputStyle={styles.multiligne}
              />
              {erreur === null ? null : <ErrorNotice error={erreur} />}
              <Button label="Envoyer la réponse" onPress={envoyer} loading={envoiEnCours} />
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
            emptyDescription="Cette conversation ne contient aucun message lisible."
            emptyIcon="chatbubble-ellipses-outline"
            loadingMessage="Ouverture de la conversation…"
          />
        }
      />
    </Screen>
  );
}

interface ListeConversationsProps {
  readonly onOuvrir: (conversation: ConversationBureau) => void;
}

/** Les fils ouverts par les familles, du plus récemment modifié au plus ancien. */
function ListeConversations({ onOuvrir }: ListeConversationsProps) {
  const charger = useCallback(() => listerConversationsBureau(), []);
  const { status, data, errorMessage, refreshing, refresh, reload } = useAsyncData(charger);

  const fils = data ?? VIDE_FILS;

  const renderItem = useCallback(
    ({ item }: ListRenderItemInfo<ConversationBureau>) => (
      <Pressable
        onPress={() => {
          onOuvrir(item);
        }}
        accessibilityRole="button"
        accessibilityLabel={`${item.subject}. ${MESSAGE_CATEGORY_LABELS[item.category]}. ${STATUTS[item.status]}.`}
        style={({ pressed }) => (pressed ? styles.appuye : undefined)}
      >
        <Card elevated>
          <View style={styles.ligneEntete}>
            <AppText variant="heading" style={styles.titre}>
              {item.subject}
            </AppText>
            <AppText variant="caption" color={colors.primary}>
              {STATUTS[item.status]}
            </AppText>
          </View>
          <AppText variant="caption">
            {MESSAGE_CATEGORY_LABELS[item.category]} · {formatDateTime(item.updated_at)} ·{' '}
            {item.message_count} message{item.message_count > 1 ? 's' : ''}
          </AppText>
          {item.last_body === null ? null : (
            <AppText variant="caption" numberOfLines={2}>
              {item.last_body}
            </AppText>
          )}
          {item.reply_to === null ? null : (
            <AppText variant="caption" bold>
              Adresse laissée : {item.reply_to}
            </AppText>
          )}
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
        contentContainerStyle={[styles.liste, fils.length === 0 && styles.listeVide]}
        // Même règle que la liste des messages : l'écran héberge un champ de
        // réponse, et le premier appui sur « Envoyer » ne doit pas être consommé
        // par la liste pour fermer le clavier. Mesuré par
        // scripts/check-clavier-liste.test.mjs.
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
              <AppText variant="caption">
                Ces conversations viennent des familles, depuis l’onglet « Contact ». Elles sont
                privées : chaque famille ne voit que la sienne, et le bureau voit toutes celles qui
                lui sont adressées.
              </AppText>
            </Card>
          </>
        }
        ListEmptyComponent={
          <AsyncFallback
            status={status}
            hasData={fils.length > 0}
            errorMessage={errorMessage}
            onRetry={reload}
            emptyTitle="Aucun message"
            emptyDescription="Les familles n’ont pas encore écrit au bureau. Leurs messages apparaîtront ici."
            emptyIcon="mail-unread-outline"
            loadingMessage="Chargement des messages…"
          />
        }
      />
    </Screen>
  );
}

/**
 * L'écran, et son aiguillage.
 *
 * DEUX COMPOSANTS, ET NON UN SEUL AVEC UNE CONDITION
 * --------------------------------------------------
 * La conversation est montée **à la place** de la liste, jamais à côté : c'est
 * ce qui repart d'un état de chargement franc quand on ouvre un autre fil. Le
 * `key` rend la garantie explicite plutôt que de la laisser au hasard d'un
 * changement de propriété.
 */
export function ConversationsBureauScreen() {
  const { profile } = useAuth();
  const [conversation, setConversation] = useState<ConversationBureau | null>(null);

  const retour = useCallback(() => {
    setConversation(null);
  }, []);

  // Le refus est dit **avant** l'appel : les fonctions du bureau refusent un
  // membre ordinaire par une erreur, et l'écran afficherait alors un message
  // d'échec technique là où il n'y a qu'une question de rôle.
  if (profile?.role !== 'admin') {
    return (
      <Screen scrollable edges={[]}>
        <Card muted>
          <AppText variant="heading">Réservé au bureau</AppText>
          <AppText variant="caption">
            Les messages adressés au bureau sont lus par ses membres. Votre compte ne donne pas
            accès à cette rubrique.
          </AppText>
        </Card>
      </Screen>
    );
  }

  if (conversation === null) {
    return <ListeConversations onOuvrir={setConversation} />;
  }

  return <VueConversation key={conversation.id} conversation={conversation} onRetour={retour} />;
}

const styles = StyleSheet.create({
  liste: {
    padding: spacing.lg,
    gap: spacing.md,
  },
  listeVide: {
    flexGrow: 1,
  },
  ligneEntete: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  titre: {
    flexShrink: 1,
  },
  appuye: {
    opacity: 0.85,
  },
  multiligne: {
    minHeight: 110,
    textAlignVertical: 'top',
  },
});
