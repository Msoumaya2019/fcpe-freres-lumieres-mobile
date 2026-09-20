import { createNativeStackNavigator } from '@react-navigation/native-stack';

import type { PlusStackParamList } from '@/navigation/types';
import { ActualitesScreen } from '@/screens/ActualitesScreen';
import { AdhesionsBureauScreen } from '@/screens/AdhesionsBureauScreen';
import { AnnonceDetailScreen } from '@/screens/AnnonceDetailScreen';
import { ConnexionScreen } from '@/screens/ConnexionScreen';
import { ConversationsBureauScreen } from '@/screens/ConversationsBureauScreen';
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
 * Ces routes se consultent de temps en temps, et plusieurs se suivent :
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
 * manière d'avoir une apparence unique pour toutes, et d'éviter que l'une
 * d'elles, écrite plus tard, en oublie les couleurs.
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
      {/*  « Espace membres » est le seul écran de cette pile **sans en-tête**, et
          c'est pour l'encoche : `ConnexionScreen` protège lui-même la zone sûre
          (`edges = ['top']`), parce qu'il sert aussi bien ici que plein écran
          pendant une récupération. Un en-tête ajouterait sa propre protection et
          le contenu descendrait d'une hauteur de barre d'état.

          Le retour n'est pas perdu pour autant : l'écran offre un bouton
          « Retour » quand `canGoBack()` est vrai, ce qui est le cas ici. */}
      <Stack.Screen
        name="AccesMembre"
        component={ConnexionScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="Discussion"
        component={DiscussionMembresScreen}
        options={{ title: 'Discussion' }}
      />
      {/*  L'en-tête est déclaré ici comme pour les autres : l'écran passe donc
          `edges = []`, et l'encoche est protégée une seule fois. */}
      <Stack.Screen
        name="ConversationsBureau"
        component={ConversationsBureauScreen}
        options={{ title: 'Messages des familles' }}
      />
      <Stack.Screen
        name="AdhesionsBureau"
        component={AdhesionsBureauScreen}
        options={{ title: 'Adhésions' }}
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
      {/*  Le titre est générique à dessein : celui de l'actualité est dans son
          texte, en grand, juste sous l'en-tête. Le répéter ici le tronquerait à
          la largeur d'une barre, et deux titres pour un seul article font
          douter de celui qu'on lit. */}
      <Stack.Screen
        name="Annonce"
        component={AnnonceDetailScreen}
        options={{ title: 'Actualité' }}
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
