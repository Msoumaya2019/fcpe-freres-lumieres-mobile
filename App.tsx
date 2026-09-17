import { DefaultTheme, NavigationContainer, type Theme } from '@react-navigation/native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { AuthProvider } from '@/auth/AuthProvider';
import { isSupabaseConfigured } from '@/config/env';
import { RootNavigator } from '@/navigation/RootNavigator';
import { ConfigurationScreen } from '@/screens/ConfigurationScreen';
import { colors } from '@/theme';

/**
 * Thème de React Navigation, aligné sur celui de l'application.
 *
 * Construit à partir de `DefaultTheme` plutôt que de zéro : le type `Theme`
 * porte aussi les polices, qu'une définition complète devrait répéter — et
 * qu'un oubli rendrait silencieusement par défaut.
 */
const navigationTheme: Theme = {
  ...DefaultTheme,
  colors: {
    ...DefaultTheme.colors,
    primary: colors.primary,
    background: colors.background,
    card: colors.surface,
    text: colors.textPrimary,
    border: colors.border,
    notification: colors.danger,
  },
};

export default function App() {
  return (
    <SafeAreaProvider>
      <StatusBar style="dark" />
      {/* `isSupabaseConfigured` vient de `env.ts` plutôt que d'être réécrit ici :
          c'est précisément ce qu'il exporte, et deux expressions de la même règle
          finiraient par diverger.

          `AuthProvider` n'est monté que lorsque la configuration est valide :
          aucun écran n'a donc à gérer le cas « clés absentes », et
          `requireSupabase()` ne peut pas être appelé par erreur. */}
      {isSupabaseConfigured ? (
        <AuthProvider>
          <NavigationContainer theme={navigationTheme}>
            <RootNavigator />
          </NavigationContainer>
        </AuthProvider>
      ) : (
        <ConfigurationScreen />
      )}
    </SafeAreaProvider>
  );
}
