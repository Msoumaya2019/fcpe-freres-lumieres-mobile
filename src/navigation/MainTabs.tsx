import { Ionicons } from '@expo/vector-icons';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { useCallback, type ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { useAuth } from '@/auth/AuthProvider';
import { WeakPasswordNotice } from '@/components';
import type { MainTabParamList } from '@/navigation/types';
import { CantineScreen } from '@/screens/CantineScreen';
import { DiscussionMembresScreen } from '@/screens/DiscussionMembresScreen';
import { InformationsScreen } from '@/screens/InformationsScreen';
import { MesSignalementsScreen } from '@/screens/MesSignalementsScreen';
import { colors, fontSize, spacing } from '@/theme';

const Tab = createBottomTabNavigator<MainTabParamList>();

interface TabIcons {
  readonly active: keyof typeof Ionicons.glyphMap;
  readonly inactive: keyof typeof Ionicons.glyphMap;
}

/**
 * Une icône pleine pour l'onglet actif, une icône au trait pour les autres.
 *
 * Le contraste de forme, et pas seulement de couleur, rend l'onglet courant
 * identifiable sans distinguer les couleurs — utile pour les daltonismes, et
 * lisible en plein soleil.
 */
const TAB_ICONS: Readonly<Record<keyof MainTabParamList, TabIcons>> = {
  Informations: { active: 'information-circle', inactive: 'information-circle-outline' },
  Cantine: { active: 'restaurant', inactive: 'restaurant-outline' },
  MesSignalements: { active: 'alert-circle', inactive: 'alert-circle-outline' },
  DiscussionMembres: { active: 'chatbubbles', inactive: 'chatbubbles-outline' },
};

function SignOutButton() {
  const { signOut } = useAuth();

  const handlePress = useCallback(() => {
    void signOut();
  }, [signOut]);

  return (
    <Pressable
      onPress={handlePress}
      hitSlop={12}
      accessibilityRole="button"
      accessibilityLabel="Se déconnecter"
      style={({ pressed }) => [styles.signOut, pressed && styles.signOutPressed]}
    >
      <Ionicons name="log-out-outline" size={22} color={colors.textSecondary} />
    </Pressable>
  );
}

/**
 * Le bandeau de mot de passe faible, **sous** l'en-tête, une seule fois pour les
 * quatre onglets.
 *
 * POURQUOI `screenLayout`
 * -----------------------
 * C'est le seul emplacement de coquille qui soit sous l'en-tête, et ce n'est pas
 * une intuition. Dans `@react-navigation/bottom-tabs` 7.x
 * (`views/BottomTabView.tsx`), l'en-tête est passé en **prop** à
 * `<Screen header={…}>` tandis que le contenu — donc ce que `screenLayout`
 * enveloppe — est rendu en `children` de ce même `<Screen>`. Ce que `screenLayout`
 * reçoit n'a donc aucun en-tête à lui : le `SceneView` du cœur de React
 * Navigation, qui est l'élément enveloppé, ne mentionne `header` nulle part.
 *
 * Envelopper `MainTabs` de l'extérieur aurait posé le bandeau **au-dessus** de
 * l'en-tête, et sous l'encoche, que `Screen` protège déjà.
 *
 * Une instance par onglet, mais un seul état : les raisons vivent dans
 * `AuthProvider`, donc refermer le bandeau sur un onglet le referme partout.
 * C'est ce qui rend le choix de `screenLayout` supportable — un état local par
 * onglet aurait produit quatre bandeaux indépendants.
 */
function WeakPasswordGate({ children }: { readonly children: ReactNode }) {
  const { weakPasswordReasons, dismissWeakPassword } = useAuth();

  // La coque est rendue **dans tous les cas**, et c'est elle qui décide
  // d'afficher le bandeau — jamais l'inverse.
  //
  // La version précédente retournait un Fragment quand il n'y avait rien à
  // signaler, et une View sinon. React réconcilie par **type** à une position
  // donnée : deux types différents, et il **démonte** le sous-arbre au lieu de le
  // mettre à jour. Deux conséquences mesurées : fermer le bandeau remontait
  // l'écran sous lui — données rechargées, brouillon de la discussion perdu — et
  // à la connexion, les écrans se montaient **deux fois**, une fois sans le
  // bandeau puis une fois avec, donc deux chargements pour la même arrivée.
  //
  // Le retour est donc unique et la forme fixe : seule la place du bandeau varie.
  return (
    <View style={styles.shell}>
      {weakPasswordReasons === null ? null : (
        <WeakPasswordNotice reasons={weakPasswordReasons} onDismiss={dismissWeakPassword} />
      )}
      <View style={styles.shellContent}>{children}</View>
    </View>
  );
}

export function MainTabs() {
  return (
    <Tab.Navigator
      // Le bandeau est une pièce de la coquille, identique sur les quatre
      // onglets : le mot de passe concerne le compte, pas une rubrique.
      screenLayout={({ children }) => <WeakPasswordGate>{children}</WeakPasswordGate>}
      screenOptions={({ route }) => ({
        headerStyle: { backgroundColor: colors.surface },
        headerTitleStyle: { color: colors.textPrimary, fontSize: fontSize.heading },
        headerTintColor: colors.primary,
        headerRight: () => <SignOutButton />,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textSecondary,
        tabBarStyle: { backgroundColor: colors.surface, borderTopColor: colors.border },
        tabBarIcon: ({ focused, color, size }) => {
          const icons = TAB_ICONS[route.name];
          return (
            <Ionicons name={focused ? icons.active : icons.inactive} size={size} color={color} />
          );
        },
      })}
    >
      <Tab.Screen
        name="Informations"
        component={InformationsScreen}
        options={{ title: 'Informations' }}
      />
      <Tab.Screen name="Cantine" component={CantineScreen} options={{ title: 'Cantine' }} />
      <Tab.Screen
        name="MesSignalements"
        component={MesSignalementsScreen}
        options={{ title: 'Mes signalements' }}
      />
      <Tab.Screen
        name="DiscussionMembres"
        component={DiscussionMembresScreen}
        options={{ title: 'Discussion' }}
      />
    </Tab.Navigator>
  );
}

const styles = StyleSheet.create({
  shell: {
    flex: 1,
  },
  shellContent: {
    flex: 1,
  },
  signOut: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  signOutPressed: {
    opacity: 0.6,
  },
});
