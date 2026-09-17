import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/AppText';
import { colors, radius, spacing } from '@/theme';

type ButtonVariant = 'primary' | 'secondary' | 'ghost';

export interface ButtonProps {
  readonly label: string;
  readonly onPress: () => void;
  readonly variant?: ButtonVariant;
  readonly disabled?: boolean;
  readonly loading?: boolean;
}

/**
 * Bouton unique de l'application.
 *
 * `disabled` et `loading` bloquent tous deux l'appui — sur un formulaire de
 * signalement, un second appui crée un second enregistrement — mais ils ne
 * s'affichent pas de la même façon.
 *
 * Un bouton **inactif** est grisé : il n'y a rien à en attendre tant que le
 * formulaire n'est pas complet. Un bouton **occupé** ne l'est pas : son libellé
 * doit rester lisible pendant l'envoi, et la seule indication d'activité est
 * l'indicateur qui tourne.
 *
 * Une version précédente de ce commentaire annonçait déjà cette distinction —
 * en citant un libellé « Envoi en cours… » qu'aucun écran ne passe — alors que
 * le code appliquait `opacity: 0.5` aux deux cas. Le libellé tombait donc à
 * **1,55:1** sur son propre fond, loin des 4,5:1 requis, au moment précis où
 * l'adhérent attend une confirmation. Le commentaire décrivait une intention
 * que le code ne tenait pas : c'est le code qui est corrigé ici, et le libellé
 * cité qui disparaît. Mesuré par `scripts/check-contrast.test.mjs`.
 */
export function Button({
  label,
  onPress,
  variant = 'primary',
  disabled = false,
  loading = false,
}: ButtonProps) {
  const inactive = disabled || loading;

  return (
    <Pressable
      onPress={onPress}
      disabled={inactive}
      accessibilityRole="button"
      accessibilityState={{ disabled: inactive, busy: loading }}
      style={({ pressed }) => [
        styles.base,
        styles[variant],
        pressed && !inactive && styles.pressed,
        // Le gris n'est appliqué qu'à `disabled`, jamais à `loading` : voir la
        // raison en tête de fichier.
        disabled && styles.disabled,
      ]}
    >
      <View style={styles.content}>
        {loading ? (
          <ActivityIndicator
            size="small"
            color={variant === 'primary' ? colors.textOnPrimary : colors.primary}
          />
        ) : null}
        <AppText
          bold
          color={variant === 'primary' ? colors.textOnPrimary : colors.primary}
          style={styles.label}
        >
          {label}
        </AppText>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    borderRadius: radius.md,
    paddingVertical: spacing.md + 2,
    paddingHorizontal: spacing.lg,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  primary: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  secondary: {
    backgroundColor: colors.surface,
    borderColor: colors.primary,
  },
  ghost: {
    backgroundColor: 'transparent',
    borderColor: 'transparent',
  },
  pressed: {
    opacity: 0.85,
  },
  disabled: {
    opacity: 0.5,
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  label: {
    fontSize: 16,
  },
});
