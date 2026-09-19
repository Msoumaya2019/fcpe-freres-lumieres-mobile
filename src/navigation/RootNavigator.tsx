import { createNativeStackNavigator } from '@react-navigation/native-stack';

import { useAuth } from '@/auth/AuthProvider';
import { LoadingView } from '@/components';
import { MainTabs } from '@/navigation/MainTabs';
import type { RootStackParamList } from '@/navigation/types';
import { ConnexionScreen } from '@/screens/ConnexionScreen';

const Stack = createNativeStackNavigator<RootStackParamList>();

/**
 * Pile racine : l'application, et l'écran de connexion **par-dessus**.
 *
 * POURQUOI L'APPLICATION N'EST PLUS DERRIÈRE UNE CONNEXION
 * --------------------------------------------------------
 * La version précédente rendait l'un **ou** l'autre : sans session, il n'y avait
 * que l'écran de connexion. C'était juste tant que tout était réservé aux
 * adhérents, et c'est devenu faux le jour où les familles ont dû consulter les
 * menus, l'agenda et les actualités **sans compte**. Un parent qui installe
 * l'application n'a aucune raison de créer un compte pour lire un menu de
 * cantine, et le lui demander était le premier obstacle de l'application.
 *
 * La pile est donc : l'application en premier, la connexion empilée par-dessus
 * quand on la demande. Le parent qui n'ouvre jamais la connexion ne la voit
 * jamais.
 *
 * LES TROIS CAS, ET POURQUOI ILS SONT DISTINGUÉS
 * ----------------------------------------------
 *   - `loading` : la session stockée se lit. Rien d'autre ne peut être décidé
 *     avant, sans quoi l'application afficherait un état puis le corrigerait.
 *   - `passwordRecovery` : un lien reçu par e-mail a ouvert une **vraie
 *     session**, mais l'adhérent n'a pas encore choisi son mot de passe. La
 *     connexion prend alors toute la place — l'application reste démontée —,
 *     parce qu'entrer maintenant viderait le lien de son sens.
 *   - le cas ordinaire : l'application, et la connexion disponible.
 *
 * La récupération porte un **nom de route distinct** (`Recuperation`) et non
 * `Connexion` avec une condition. Deux noms, deux ensembles de routes, donc deux
 * montages distincts : quand la récupération se termine, la pile ne peut pas
 * conserver l'écran de récupération par-dessus l'application, ce qu'un même nom
 * aurait laissé faire.
 */
export function RootNavigator() {
  const { status, passwordRecovery } = useAuth();

  if (status === 'loading') {
    return <LoadingView message="Chargement de votre session…" />;
  }

  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      {passwordRecovery ? (
        <Stack.Screen name="Recuperation" component={ConnexionScreen} />
      ) : (
        <Stack.Screen name="Application" component={MainTabs} />
      )}
    </Stack.Navigator>
  );
}
