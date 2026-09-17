import { StyleSheet, View } from 'react-native';

import { AppText } from '@/components/AppText';
import { appErrorDetail, appErrorMessage } from '@/errors';
import { colors, radius, spacing } from '@/theme';

type NoticeTone = 'error' | 'success' | 'info';

export interface ErrorNoticeProps {
  /** Erreur d'origine, quelle qu'elle soit : la traduction est faite ici. */
  readonly error: unknown;
  readonly tone?: NoticeTone;
}

/**
 * Les trois tons, et ce que le projet en fait réellement.
 *
 * `error` et `info` sont employés — l'un pour un échec, l'autre pour un avis de
 * confirmation ou un lien expiré. `success` ne l'est par **aucun** appelant :
 * il est conservé parce qu'il est complet et mesuré (4,70:1 sur son fond pâle),
 * mais ce n'est pas un chemin vivant. Le jour où il servira, la mesure le
 * couvre déjà ; c'est la seule raison de le garder plutôt que de le retirer.
 */
const TONE_FOREGROUND: Readonly<Record<NoticeTone, string>> = {
  error: colors.danger,
  success: colors.success,
  info: colors.primary,
};

const TONE_BACKGROUND: Readonly<Record<NoticeTone, string>> = {
  error: colors.dangerSoft,
  success: colors.successSoft,
  info: colors.primarySoft,
};

/**
 * Bandeau d'information en ligne, utilisé pour les erreurs de formulaire et les
 * confirmations.
 *
 * Le détail technique n'apparaît qu'en développement : `appErrorDetail` renvoie
 * `null` en production, car un message PostgreSQL décrit la structure de la
 * base et n'aide pas l'utilisateur — il l'inquiète, au mieux.
 */
export function ErrorNotice({ error, tone = 'error' }: ErrorNoticeProps) {
  const detail = appErrorDetail(error);

  return (
    <View
      style={[
        styles.container,
        { backgroundColor: TONE_BACKGROUND[tone], borderColor: TONE_FOREGROUND[tone] },
      ]}
    >
      <AppText variant="caption" color={TONE_FOREGROUND[tone]}>
        {appErrorMessage(error)}
      </AppText>
      {detail === null ? null : (
        <AppText variant="caption" color={colors.textSecondary}>
          {detail}
        </AppText>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: radius.md,
    borderWidth: 1,
    padding: spacing.md,
    gap: spacing.xs,
  },
});
