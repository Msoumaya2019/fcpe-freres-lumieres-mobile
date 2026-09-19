import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, View } from 'react-native';

import { useAuth } from '@/auth/AuthProvider';
import { AppText, Badge, Card, Screen } from '@/components';
import { colors, radius, spacing } from '@/theme';
import { formatShortDate } from '@/utils/date';

/**
 * Mon profil — qui je suis, aux yeux de l'application.
 *
 * POURQUOI CET ÉCRAN NE MODIFIE RIEN
 * ----------------------------------
 * La politique de modification de `profiles` a été **retirée** délibérément : le
 * nom affiché est ce que l'application montre comme auteur d'un message, et il
 * est résolu à la lecture. Un adhérent qui pouvait se renommer renommait par la
 * même occasion **tous ses messages passés**, puisqu'aucun ne conserve le nom de
 * son auteur. Aucun écran ne modifie donc un profil, et celui-ci ne fait pas
 * exception.
 *
 * Le nom reste modifiable par le bureau depuis le tableau de bord, où la clé de
 * service ne passe par aucune politique — c'est le chemin prévu pour corriger un
 * libellé, et il est écrit sur l'écran pour que l'adhérent sache à qui
 * s'adresser.
 *
 * POURQUOI L'ADRESSE EST ICI
 * --------------------------
 * L'adresse vit dans `auth.users`, et non dans `profiles` : la table des profils
 * est lisible par tout porteur d'un jeton, et y recopier les adresses les
 * exposerait à tous les adhérents. Cet écran affiche donc **sa propre** adresse,
 * lue dans la session — jamais celle d'un autre.
 */
export function ProfileScreen() {
  const { profile, session } = useAuth();

  const nom = profile?.display_name ?? '';
  const initiales = nom
    .split(' ')
    .filter((mot) => mot !== '')
    .slice(0, 2)
    .map((mot) => mot.charAt(0).toUpperCase())
    .join('');

  const estAdmin = profile?.role === 'admin';

  return (
    <Screen scrollable>
      <View style={styles.contenu}>
        <Card elevated style={styles.identite}>
          <View style={styles.avatar}>
            <AppText variant="title" bold color={colors.textOnPrimary}>
              {initiales === '' ? '?' : initiales}
            </AppText>
          </View>

          <AppText variant="heading" center>
            {nom === '' ? 'Adhérent' : nom}
          </AppText>

          <Badge
            label={estAdmin ? 'Bureau de l’association' : 'Adhérent'}
            accent={estAdmin ? 'violet' : 'bleu'}
            icon={estAdmin ? 'shield-checkmark-outline' : 'person-outline'}
          />
        </Card>

        <Card>
          <AppText variant="caption" bold>
            Adresse de connexion
          </AppText>
          <AppText variant="body">{session?.user.email ?? '—'}</AppText>
          <AppText variant="caption">
            Elle sert à vous connecter et à recevoir les liens de réinitialisation. Elle n’est
            visible par aucun autre adhérent.
          </AppText>
        </Card>

        <Card>
          <AppText variant="caption" bold>
            Membre depuis
          </AppText>
          <AppText variant="body">
            {profile === null ? '—' : formatShortDate(profile.created_at)}
          </AppText>
        </Card>

        <Card muted>
          <View style={styles.note}>
            <Ionicons name="information-circle-outline" size={18} color={colors.textSecondary} />
            <AppText variant="caption" style={styles.noteTexte}>
              Votre nom affiché est celui que vous avez indiqué à l’inscription. Pour le corriger,
              écrivez au bureau depuis l’onglet Contact : lui seul peut le modifier.
            </AppText>
          </View>
        </Card>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  contenu: {
    gap: spacing.md,
  },
  identite: {
    alignItems: 'center',
    gap: spacing.sm,
  },
  avatar: {
    width: 64,
    height: 64,
    borderRadius: radius.pill,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  note: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
  },
  noteTexte: {
    flexShrink: 1,
  },
});
