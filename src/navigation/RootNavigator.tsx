import { createNativeStackNavigator } from '@react-navigation/native-stack';

import { useAuth } from '@/auth/AuthProvider';
import { LoadingView } from '@/components';
import { MainTabs } from '@/navigation/MainTabs';
import type { RootStackParamList } from '@/navigation/types';
import { ConnexionScreen } from '@/screens/ConnexionScreen';

const Stack = createNativeStackNavigator<RootStackParamList>();

/**
 * Pile racine : l'écran de connexion et l'application connectée s'excluent.
 *
 * Les deux écrans sont déclarés conditionnellement plutôt qu'empilés puis
 * remplacés par un `navigate()`. Ce choix a une conséquence directe et
 * souhaitable : à la déconnexion, l'écran de connexion est **monté**, donc
 * vierge, et non réaffiché avec le mot de passe précédemment saisi. Il rend
 * aussi impossible le retour arrière vers un écran authentifié, que le bouton
 * « précédent » d'Android permettrait sinon d'atteindre.
 *
 * La récupération de mot de passe est le troisième cas, et le moins évident :
 * un lien reçu par e-mail ouvre une **vraie session**, donc `status` vaut
 * `signedIn` alors que l'adhérent n'a pas encore choisi son mot de passe. Le
 * laisser entrer dans l'application à ce moment-là viderait le lien de son sens
 * — le mot de passe resterait inchangé, et le lien encore valable. C'est
 * pourquoi `passwordRecovery` l'emporte sur `status`.
 */
export function RootNavigator() {
  const { status, passwordRecovery } = useAuth();

  if (status === 'loading') {
    return <LoadingView message="Chargement de votre session…" />;
  }

  const entersApplication = status === 'signedIn' && !passwordRecovery;

  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      {entersApplication ? (
        <Stack.Screen name="Application" component={MainTabs} />
      ) : (
        <Stack.Screen name="Connexion" component={ConnexionScreen} />
      )}
    </Stack.Navigator>
  );
}
