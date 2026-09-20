import { DefaultTheme, NavigationContainer, type Theme } from '@react-navigation/native';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { AuthProvider } from '@/auth/AuthProvider';
import { isSupabaseConfigured } from '@/config/env';
import { RootNavigator } from '@/navigation/RootNavigator';
import { ConfigurationScreen } from '@/screens/ConfigurationScreen';
import { preparerNotifications } from '@/services/push';
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

/**
 * L'enregistrement du téléphone auprès du bureau, monté sans rien rendre.
 *
 * POURQUOI CE N'EST PAS UN EFFET DANS `App`
 * -----------------------------------------
 * `App` rend aussi l'écran de configuration, affiché quand les clés d'API
 * manquent. Un effet posé là s'exécuterait donc sur une application qui n'a
 * aucune base à qui parler — et l'enregistrement, lui, écrit en base. Le
 * composant est monté **à l'intérieur** d'`AuthProvider`, c'est-à-dire
 * exactement là où la configuration est valide.
 *
 * Il ne pose aucune question : `preparerNotifications` se tait tant que
 * l'autorisation n'a pas été accordée. La demande, elle, vit dans les Réglages,
 * sur un geste de l'adhérent.
 */
function EnregistrementAppareil() {
  useEffect(() => {
    void preparerNotifications();
  }, []);

  return null;
}

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
          <EnregistrementAppareil />
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
