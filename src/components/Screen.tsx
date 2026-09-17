import type { ReactNode } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView, type Edge } from 'react-native-safe-area-context';

import { colors, spacing } from '@/theme';

export interface ScreenProps {
  readonly children: ReactNode;
  /**
   * Bords à protéger de l'encoche.
   *
   * Par défaut `['top']`, ce qui convient aux écrans **sans** en-tête de
   * navigation (les onglets en ont un, mais il gère lui-même l'encoche).
   * Un écran sous une pile native doit passer `[]` : sinon l'en-tête et la
   * zone sûre se cumulent et le contenu descend d'une hauteur d'encoche.
   */
  readonly edges?: readonly Edge[];
  /** Enveloppe le contenu dans une vue défilante. */
  readonly scrollable?: boolean;
  readonly padded?: boolean;
}

export function Screen({
  children,
  edges = ['top'],
  scrollable = false,
  padded = true,
}: ScreenProps) {
  return (
    <SafeAreaView style={styles.container} edges={edges}>
      {scrollable ? (
        <ScrollView
          contentContainerStyle={[padded && styles.padded, styles.grow]}
          keyboardShouldPersistTaps="handled"
        >
          {children}
        </ScrollView>
      ) : (
        <View style={[styles.flex, padded && styles.padded]}>{children}</View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  flex: {
    flex: 1,
  },
  grow: {
    flexGrow: 1,
  },
  padded: {
    padding: spacing.lg,
    gap: spacing.lg,
  },
});
