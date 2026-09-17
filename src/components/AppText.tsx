import { StyleSheet, Text, type TextProps } from 'react-native';

import { colors, fontSize } from '@/theme';

type TextVariant = 'title' | 'heading' | 'body' | 'caption';

export interface AppTextProps extends TextProps {
  readonly variant?: TextVariant;
  /** Couleur explicite ; par défaut celle de la variante. */
  readonly color?: string;
  readonly bold?: boolean;
  readonly center?: boolean;
}

/**
 * Texte de l'application.
 *
 * Passe-partout plutôt que `Text` directement : la taille et la couleur de
 * chaque niveau de titre sont décidées ici, une fois. Sans cela, la même
 * « taille 15 gris » finit recopiée dans quinze écrans et dérive au premier
 * ajustement.
 */
export function AppText({
  variant = 'body',
  color,
  bold = false,
  center = false,
  style,
  ...rest
}: AppTextProps) {
  return (
    <Text
      style={[
        styles.base,
        styles[variant],
        bold && styles.bold,
        center && styles.center,
        color === undefined ? null : { color },
        style,
      ]}
      {...rest}
    />
  );
}

const styles = StyleSheet.create({
  base: {
    color: colors.textPrimary,
  },
  title: {
    fontSize: fontSize.title,
    fontWeight: '700',
    letterSpacing: -0.3,
  },
  heading: {
    fontSize: fontSize.heading,
    fontWeight: '600',
  },
  body: {
    fontSize: fontSize.body,
    lineHeight: fontSize.body * 1.45,
  },
  caption: {
    fontSize: fontSize.caption,
    lineHeight: fontSize.caption * 1.4,
    color: colors.textSecondary,
  },
  bold: {
    fontWeight: '600',
  },
  center: {
    textAlign: 'center',
  },
});
