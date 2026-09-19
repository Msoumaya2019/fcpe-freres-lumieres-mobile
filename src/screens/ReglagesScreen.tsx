import { Ionicons } from '@expo/vector-icons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import Constants from 'expo-constants';
import { useCallback, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { useAuth } from '@/auth/AuthProvider';
import { AppText, Button, Card, Screen } from '@/components';
import { effacerPreferences } from '@/config/preferences';
import type { PlusStackParamList } from '@/navigation/types';
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
 *   - l'effacement des données locales, qui fait réapparaître les badges de
 *     messages non lus — vérifiable à l'écran ;
 *   - la déconnexion.
 *
 * Le reste est de l'information : ce que l'application conserve, ce qu'elle
 * montre aux autres adhérents, et ce qu'elle ne sait pas encore faire.
 *
 * CE QUE L'APPLICATION NE SAIT PAS FAIRE, ÉCRIT PLUTÔT QUE TU
 * ----------------------------------------------------------
 * Il n'y a **aucune notification push** : l'application ne prévient personne
 * d'une actualité ni d'un message. Le dire évite qu'un parent attende une alerte
 * qui n'arrivera pas, et se croie oublié. De même, l'application est en thème
 * clair uniquement — `app.json` fixe `userInterfaceStyle: "light"` —, et un
 * sélecteur d'apparence ne changerait rien.
 */
export function ReglagesScreen({
  navigation,
}: NativeStackScreenProps<PlusStackParamList, 'Reglages'>) {
  const { profile, session, signOut } = useAuth();

  const [confirmation, setConfirmation] = useState(false);
  const [occupe, setOccupe] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const version = Constants.expoConfig?.version ?? '—';

  const effacer = useCallback(async () => {
    setOccupe(true);

    try {
      await effacerPreferences();
      setMessage('Données locales effacées. Les badges de messages non lus réapparaissent.');
    } catch {
      // Le message reste sur l'écran : une alerte disparaîtrait avant d'être
      // lue, et l'adhérent ne saurait pas si l'effacement a eu lieu.
      setMessage("L'effacement n'a pas abouti. Réessayez dans un instant.");
    } finally {
      setOccupe(false);
      setConfirmation(false);
    }
  }, []);

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
              Sur ce téléphone : jusqu’où vous avez lu la discussion, et rien d’autre.
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
            Effacer les données locales remet à zéro les marques de lecture : les badges de messages
            non lus réapparaissent. Cela ne vous déconnecte pas et ne supprime rien sur le serveur.
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
              label="Effacer les données locales"
              variant="secondary"
              onPress={() => {
                setConfirmation(true);
              }}
            />
          )}
        </Card>

        <Card>
          <AppText variant="caption" bold>
            Notifications et apparence
          </AppText>
          <AppText variant="caption">
            L’application n’envoie aucune notification : actualités et messages se lisent en ouvrant
            les rubriques. L’affichage est en thème clair uniquement.
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
