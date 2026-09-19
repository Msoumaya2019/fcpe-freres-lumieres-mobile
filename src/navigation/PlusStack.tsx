import { createNativeStackNavigator } from '@react-navigation/native-stack';

import type { PlusStackParamList } from '@/navigation/types';
import { ActualitesScreen } from '@/screens/ActualitesScreen';
import { DiscussionMembresScreen } from '@/screens/DiscussionMembresScreen';
import { DocumentsScreen } from '@/screens/DocumentsScreen';
import { MesSignalementsScreen } from '@/screens/MesSignalementsScreen';
import { PlusScreen } from '@/screens/PlusScreen';
import { ProfileScreen } from '@/screens/ProfileScreen';
import { ReglagesScreen } from '@/screens/ReglagesScreen';
import { colors, fontSize } from '@/theme';

const Stack = createNativeStackNavigator<PlusStackParamList>();

/**
 * La pile des rubriques rangées sous « Plus ».
 *
 * POURQUOI UNE PILE, ET NON DES ONGLETS
 * -------------------------------------
 * Ces sept écrans se consultent de temps en temps, et plusieurs se suivent :
 * on ouvre la discussion, puis le profil ; on lit une actualité, puis on
 * revient. Une pile donne le retour arrière gratuitement, et son en-tête porte
 * le titre de l'écran courant. Sept onglets de plus ne tiendraient de toute
 * façon pas dans la barre.
 *
 * LA DISCUSSION, LES SIGNALEMENTS ET LES ACTUALITÉS SONT ICI
 * ---------------------------------------------------------
 * Ces trois rubriques étaient des onglets avant la refonte. Elles sont
 * **reclassées**, jamais retirées : leurs écrans, leurs tables et leurs
 * politiques sont inchangés. C'est la barre qui a changé, pas elles.
 *
 * L'en-tête est déclaré ici plutôt que dans chaque écran : c'est la seule
 * manière d'avoir une apparence unique pour les sept, et d'éviter que l'un
 * d'eux, écrit plus tard, en oublie les couleurs.
 */
export function PlusStack() {
  return (
    <Stack.Navigator
      screenOptions={{
        headerStyle: { backgroundColor: colors.surface },
        headerTitleStyle: { color: colors.textPrimary, fontSize: fontSize.heading },
        headerTintColor: colors.primary,
      }}
    >
      <Stack.Screen name="PlusHome" component={PlusScreen} options={{ title: 'Plus' }} />
      <Stack.Screen
        name="Discussion"
        component={DiscussionMembresScreen}
        options={{ title: 'Discussion' }}
      />
      <Stack.Screen
        name="Documents"
        component={DocumentsScreen}
        options={{ title: 'Documents importants' }}
      />
      <Stack.Screen
        name="Actualites"
        component={ActualitesScreen}
        options={{ title: 'Actualités' }}
      />
      <Stack.Screen
        name="MesSignalements"
        component={MesSignalementsScreen}
        options={{ title: 'Mes signalements' }}
      />
      <Stack.Screen name="Profil" component={ProfileScreen} options={{ title: 'Mon profil' }} />
      <Stack.Screen name="Reglages" component={ReglagesScreen} options={{ title: 'Réglages' }} />
    </Stack.Navigator>
  );
}
