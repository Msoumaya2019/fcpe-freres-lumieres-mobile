import { Ionicons } from '@expo/vector-icons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import Constants from 'expo-constants';
import { useCallback, useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { useAuth } from '@/auth/AuthProvider';
import { AppText, Button, Card, Screen } from '@/components';
import { effacerMarquesDeLecture } from '@/config/preferences';
import type { PlusStackParamList } from '@/navigation/types';
import { demanderNotifications, etatPush, type EtatPush } from '@/services/push';
import { accents, colors, spacing } from '@/theme';
import { formatShortDate } from '@/utils/date';

/**
 * Réglages — ce que l'application retient, et ce qu'elle ne fait pas.
 *
 * POURQUOI CET ÉCRAN NE CONTIENT PRESQUE AUCUN INTERRUPTEUR
 * --------------------------------------------------------
 * Un réglage qui n'agit sur rien est pire qu'un réglage absent : l'adhérent
 * croit avoir changé quelque chose, et rien ne change. Cet écran ne propose donc
 * que ce qui produit un effet **mesurable** :
 *
 *   - l'effacement des marques de lecture, qui fait réapparaître les badges de
 *     messages non lus — vérifiable à l'écran ;
 *   - la déconnexion.
 *
 * Le reste est de l'information : ce que l'application conserve, ce qu'elle
 * montre aux autres adhérents, et ce qu'elle ne sait pas encore faire.
 *
 * CE QUE CE BOUTON A CESSÉ D'EMPORTER, ET POURQUOI
 * -----------------------------------------------
 * Il s'appelait « Effacer les données locales » et effaçait **toutes** les clés
 * de l'application. Il emportait donc, sans le dire, le secret des conversations
 * ouvertes avec le bureau — dont le serveur ne garde qu'une empreinte, et qui
 * n'existe nulle part ailleurs. Le parent perdait l'accès au fil **pour
 * toujours**, et le texte qu'il venait de lire ne parlait que de badges de
 * messages non lus.
 *
 * Le bouton ne fait plus que ce que son libellé annonce : il efface les marques
 * de lecture, et épargne ce qui ne se recrée pas. La phrase « et rien d'autre »,
 * qui décrivait ce que le téléphone retient, était fausse pour la même raison —
 * elle nomme maintenant les quatre familles.
 *
 * CE QUE L'APPLICATION PEUT FAIRE, ÉCRIT PLUTÔT QUE TU
 * ---------------------------------------------------
 * Les notifications existent désormais, et la carte ci-dessous est le **seul**
 * endroit qui les demande. Le démarrage, lui, se tait : un appareil qui a déjà
 * répondu oui rafraîchit son jeton, un appareil qui n'a jamais répondu reste en
 * paix. Poser la question à l'ouverture ferait apparaître une boîte système
 * avant que l'adhérent ait vu quoi que ce soit — et sur Android 13 et au-delà,
 * un refus à ce moment-là est **définitif**.
 *
 * Ce que la carte refuse de promettre : « autorisé » et « enregistré » sont deux
 * faits distincts, et ils sont dits séparément. Une autorisation accordée dont
 * le jeton n'a pas pu être déposé n'enverrait rien, et l'écran le dit à ce
 * moment-là plutôt que de laisser croire que tout va bien.
 *
 * L'application est en thème clair uniquement — `app.json` fixe
 * `userInterfaceStyle: "light"` —, et un sélecteur d'apparence ne changerait
 * rien. C'est pourquoi cette phrase est une carte, et non un interrupteur.
 */

/**
 * Ce que l'écran dit de l'état des notifications.
 *
 * Une phrase par état, et aucune ne dit « vous recevrez » : l'autorisation est
 * un fait, la réception en est un autre. La seule qui nomme un chemin de
 * réglages est celle du refus définitif, parce que c'est la seule qui en ait un
 * — et un bouton qui n'agirait pas serait pire que pas de bouton.
 */
function phraseNotifications(etat: EtatPush): string {
  switch (etat.autorisation) {
    case 'accordees':
      return 'Ce téléphone est autorisé à recevoir les notifications du bureau.';
    case 'jamaisDemandees':
      return "Ce téléphone n'est pas encore enregistré : le bureau ne peut rien lui envoyer.";
    case 'refusees':
      return etat.peutRedemander
        ? 'Les notifications sont refusées. Le bouton ci-dessous repose la question.'
        : 'Les notifications sont refusées, et Android ne repose plus la question. Pour les ' +
            'réactiver : Réglages du téléphone, puis Applications, puis FCPE Frères Lumières, ' +
            'puis Notifications.';
    case 'indisponible':
      return 'Cet appareil ne peut pas recevoir de notifications.';
  }
}

export function ReglagesScreen({
  navigation,
}: NativeStackScreenProps<PlusStackParamList, 'Reglages'>) {
  const { profile, session, signOut } = useAuth();

  const [confirmation, setConfirmation] = useState(false);
  const [occupe, setOccupe] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  // `null` tant que le système n'a pas répondu : l'écran n'affiche alors ni
  // état ni bouton, plutôt qu'un état supposé qu'il faudrait corriger après.
  const [notifications, setNotifications] = useState<EtatPush | null>(null);
  const [messageNotifications, setMessageNotifications] = useState<string | null>(null);

  const version = Constants.expoConfig?.version ?? '—';

  useEffect(() => {
    // Aucune demande ici : `etatPush` lit et rend la main, sans rien afficher.
    // L'écriture d'état est dans la retombée, jamais dans le corps de l'effet —
    // sinon React rendrait une seconde fois avant que le système ait répondu.
    void etatPush().then(setNotifications);
  }, []);

  const effacer = useCallback(async () => {
    setOccupe(true);

    try {
      await effacerMarquesDeLecture();
      setMessage('Marques de lecture effacées. Les badges de messages non lus réapparaissent.');
    } catch {
      // Le message reste sur l'écran : une alerte disparaîtrait avant d'être
      // lue, et l'adhérent ne saurait pas si l'effacement a eu lieu.
      setMessage("L'effacement n'a pas abouti. Réessayez dans un instant.");
    } finally {
      setOccupe(false);
      setConfirmation(false);
    }
  }, []);

  const demander = useCallback(async () => {
    setOccupe(true);
    setMessageNotifications(null);

    try {
      const { etat, enregistre } = await demanderNotifications();
      setNotifications(etat);

      // L'autorisation accordée et le jeton déposé sont deux faits. Quand le
      // second manque, le taire ferait croire à un parent qu'il sera prévenu —
      // alors que rien n'est enregistré, et qu'il ne recevra rien.
      if (etat.autorisation === 'accordees' && !enregistre) {
        setMessageNotifications(
          "L'autorisation est accordée, mais ce téléphone n'a pas pu être enregistré. " +
            'Réessayez dans un instant.',
        );
      }
    } catch {
      setMessageNotifications("La demande n'a pas abouti. Réessayez dans un instant.");
    } finally {
      setOccupe(false);
    }
  }, []);

  /**
   * Le bouton n'existe que là où il agit.
   *
   * Un refus définitif, un appareil sans notifications, une autorisation déjà
   * accordée : dans les trois cas, appuyer ne changerait rien. L'afficher quand
   * même serait le défaut que l'en-tête de cet écran nomme — un réglage qui
   * n'agit sur rien.
   */
  const peutDemander =
    notifications !== null &&
    (notifications.autorisation === 'jamaisDemandees' ||
      (notifications.autorisation === 'refusees' && notifications.peutRedemander));

  return (
    <Screen scrollable edges={[]}>
      <View style={styles.contenu}>
        <Card>
          <AppText variant="caption" bold>
            Compte
          </AppText>
          <AppText variant="body">{profile?.display_name ?? 'Adhérent'}</AppText>
          <AppText variant="caption">{session?.user.email ?? '—'}</AppText>
          <AppText variant="caption">
            {profile === null
              ? 'Rôle inconnu'
              : profile.role === 'admin'
                ? 'Bureau de l’association'
                : 'Adhérent'}
            {profile === null ? '' : ` · membre depuis le ${formatShortDate(profile.created_at)}`}
          </AppText>
          <Button
            label="Voir mon profil"
            variant="secondary"
            onPress={() => {
              navigation.navigate('Profil');
            }}
          />
        </Card>

        <Card>
          <AppText variant="caption" bold>
            Ce que l’application retient
          </AppText>
          <View style={styles.ligne}>
            <Ionicons name="phone-portrait-outline" size={16} color={colors.textSecondary} />
            <AppText variant="caption" style={styles.ligneTexte}>
              Sur ce téléphone : jusqu’où vous avez lu la discussion, et la clé de vote qui empêche
              d’y voter deux fois.
            </AppText>
          </View>
          <View style={styles.ligne}>
            <Ionicons name="key-outline" size={16} color={colors.textSecondary} />
            <AppText variant="caption" style={styles.ligneTexte}>
              Aussi sur ce téléphone : le secret des conversations ouvertes avec le bureau. Il
              n’existe qu’ici — le serveur n’en garde qu’une empreinte — et il ne peut pas être
              recréé.
            </AppText>
          </View>
          <View style={styles.ligne}>
            <Ionicons name="cloud-outline" size={16} color={colors.textSecondary} />
            <AppText variant="caption" style={styles.ligneTexte}>
              Sur le serveur : votre nom affiché et votre rôle. Jamais votre adresse de connexion.
            </AppText>
          </View>
          <View style={styles.ligne}>
            <Ionicons name="eye-off-outline" size={16} color={colors.textSecondary} />
            <AppText variant="caption" style={styles.ligneTexte}>
              Aucun autre adhérent ne voit votre adresse. La suppression de votre compte efface vos
              messages par cascade.
            </AppText>
          </View>
        </Card>

        <Card>
          <AppText variant="caption" bold>
            Données de l’appareil
          </AppText>
          <AppText variant="caption">
            Ce bouton efface les marques de lecture : les badges de messages non lus réapparaissent.
            C’est tout ce qu’il efface. Il ne vous déconnecte pas, et ne supprime rien sur le
            serveur.
          </AppText>
          <AppText variant="caption">
            Il ne touche pas aux conversations ouvertes avec le bureau : leur secret n’existe que
            sur ce téléphone, et le perdre serait définitif. Désinstaller l’application les perd
            aussi.
          </AppText>

          {message === null ? null : (
            <AppText variant="caption" color={accents.bleu.ink}>
              {message}
            </AppText>
          )}

          {confirmation ? (
            <View style={styles.actions}>
              <Button label="Annuler" variant="secondary" onPress={() => setConfirmation(false)} />
              <Button
                label="Confirmer l'effacement"
                loading={occupe}
                onPress={() => {
                  void effacer();
                }}
              />
            </View>
          ) : (
            <Button
              label="Effacer les marques de lecture"
              variant="secondary"
              onPress={() => {
                setConfirmation(true);
              }}
            />
          )}
        </Card>

        <Card>
          <AppText variant="caption" bold>
            Notifications
          </AppText>
          <AppText variant="caption">
            Autoriser ce téléphone à recevoir les notifications du bureau : les nouvelles
            actualités, et les messages.
          </AppText>

          {notifications === null ? null : (
            <AppText
              variant="caption"
              color={
                notifications.autorisation === 'accordees' ? accents.vert.ink : colors.textSecondary
              }
            >
              {phraseNotifications(notifications)}
            </AppText>
          )}

          {messageNotifications === null ? null : (
            <AppText variant="caption" color={accents.bleu.ink}>
              {messageNotifications}
            </AppText>
          )}

          {peutDemander ? (
            <Button
              label="Activer les notifications"
              loading={occupe}
              onPress={() => {
                void demander();
              }}
            />
          ) : null}
        </Card>

        <Card>
          <AppText variant="caption" bold>
            Apparence
          </AppText>
          <AppText variant="caption">
            L’affichage est en thème clair uniquement. Un sélecteur d’apparence ne changerait rien :
            c’est une propriété de la compilation, pas un réglage.
          </AppText>
        </Card>

        <Card muted>
          <AppText variant="caption" bold>
            Version
          </AppText>
          <AppText variant="caption">{version}</AppText>
        </Card>

        <Button
          label="Se déconnecter"
          variant="secondary"
          onPress={() => {
            void signOut();
          }}
        />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  contenu: {
    gap: spacing.md,
  },
  ligne: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
  },
  ligneTexte: {
    flexShrink: 1,
  },
  actions: {
    gap: spacing.sm,
  },
});
