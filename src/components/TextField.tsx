import {
  StyleSheet,
  TextInput,
  View,
  type StyleProp,
  type TextInputProps,
  type TextStyle,
} from 'react-native';

import { AppText } from '@/components/AppText';
import { colors, fontSize, radius, spacing } from '@/theme';

export interface TextFieldProps extends Omit<TextInputProps, 'style'> {
  readonly label: string;
  /** Message d'erreur affiché sous le champ, et qui colore sa bordure. */
  readonly error?: string | null;
  /** Précision affichée tant qu'il n'y a pas d'erreur. */
  readonly hint?: string | null;
  /**
   * Style du champ lui-même (hauteur d'une zone multiligne, par exemple).
   * Distinct de `style`, réservé au conteneur — sans quoi ajuster la hauteur
   * d'un champ déplacerait aussi son libellé et son message d'erreur.
   */
  readonly inputStyle?: StyleProp<TextStyle>;
}

export function TextField({
  label,
  error = null,
  hint = null,
  inputStyle,
  ...rest
}: TextFieldProps) {
  const invalid = error !== null;

  return (
    <View style={styles.container}>
      <AppText variant="caption" bold style={styles.label}>
        {label}
      </AppText>
      <TextInput
        placeholderTextColor={colors.textSecondary}
        accessibilityLabel={label}
        style={[styles.input, invalid && styles.inputInvalid, inputStyle]}
        {...rest}
      />
      {invalid ? (
        <AppText variant="caption" color={colors.danger}>
          {error}
        </AppText>
      ) : hint === null ? null : (
        <AppText variant="caption">{hint}</AppText>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: spacing.xs,
  },
  label: {
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  input: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    // `borderInteractive` et non `border` : sur une carte blanche, la bordure
    // est la **seule** chose qui désigne le champ. `border` vaut 1,26:1 sur
    // `surface` — invisible pour qui voit mal, et illisible en plein soleil.
    // Mesuré par `scripts/check-contrast.test.mjs`.
    borderColor: colors.borderInteractive,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    fontSize: fontSize.body,
    color: colors.textPrimary,
  },
  inputInvalid: {
    borderColor: colors.danger,
  },
});
