import { Ionicons } from '@expo/vector-icons';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { useCallback, type ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useAuth, useCurrentUserId } from '@/auth/AuthProvider';
import { TabBar, WeakPasswordNotice, type TabIcons } from '@/components';
import { useNonLus } from '@/hooks/useNonLus';
import { PlusStack } from '@/navigation/PlusStack';
import type { MainTabParamList } from '@/navigation/types';
import { AccueilScreen } from '@/screens/AccueilScreen';
import { AgendaScreen } from '@/screens/AgendaScreen';
import { CantineScreen } from '@/screens/CantineScreen';
import { ContactScreen } from '@/screens/ContactScreen';
import { colors, fontSize } from '@/theme';

const Tab = createBottomTabNavigator<MainTabParamList>();

/**
 * Une icône pleine pour l'onglet actif, une icône au trait pour les autres.
 *
 * Le contraste de forme, et pas seulement de couleur, rend l'onglet courant
 * identifiable sans distinguer les couleurs — utile pour les daltonismes, et
 * lisible en plein soleil. C'est le seul signal qui subsiste quand la couleur
 * disparaît, et c'est pourquoi il est porté par la table des icônes plutôt que
 * par le fond de la pastille.
 */
const TAB_ICONS: TabIcons = {
  Accueil: { active: 'home', inactive: 'home-outline' },
  Cantine: { active: 'restaurant', inactive: 'restaurant-outline' },
  Agenda: { active: 'calendar', inactive: 'calendar-outline' },
  Contact: { active: 'chatbubble-ellipses', inactive: 'chatbubble-ellipses-outline' },
  Plus: { active: 'ellipsis-horizontal', inactive: 'ellipsis-horizontal-outline' },
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
 * cinq onglets.
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
 * onglet aurait produit cinq bandeaux indépendants.
 */
function WeakPasswordGate({
  children,
  sansEnTete = false,
}: {
  readonly children: ReactNode;
  /**
   * Vrai quand l'onglet n'affiche pas d'en-tête de navigation.
   *
   * POURQUOI CE DRAPEAU EXISTE, ET POURQUOI IL EST MESURÉ ET NON SUPPOSÉ
   * --------------------------------------------------------------------
   * L'encoche n'est protégée que par l'**en-tête** : dans
   * `@react-navigation/elements` (`Screen.tsx`), `useSafeAreaInsets()` sert à
   * calculer `headerStatusBarHeight`, et la scène — donc ce que cette coque
   * enveloppe — n'est jamais décalée. Un onglet sans en-tête commence donc à
   * `y = 0`, sous la barre d'état.
   *
   * Le bandeau est rendu **au-dessus** de la scène : sur un onglet sans en-tête,
   * il se retrouverait sous la barre d'état, à moitié illisible. Il reçoit donc
   * lui-même l'encoche dans ce cas précis — et **lui seul**, jamais la scène :
   * l'onglet « Plus » empile une pile dont l'en-tête ajoute déjà l'encoche de
   * son côté (`headerStatusBarHeight = isParentHeaderShown ? 0 : insets.top`).
   * Décaler la scène entière l'aurait décalée deux fois.
   */
  readonly sansEnTete?: boolean;
}) {
  const { weakPasswordReasons, dismissWeakPassword } = useAuth();
  const insets = useSafeAreaInsets();

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
  // L'emplacement du bandeau est une View **dans tous les cas**, même vide : sa
  // condition ne change que le style, jamais le type.
  return (
    <View style={styles.shell}>
      <View style={sansEnTete ? { paddingTop: insets.top } : undefined}>
        {weakPasswordReasons === null ? null : (
          <WeakPasswordNotice reasons={weakPasswordReasons} onDismiss={dismissWeakPassword} />
        )}
      </View>
      <View style={styles.shellContent}>{children}</View>
    </View>
  );
}

/**
 * La barre à cinq onglets — Accueil, Cantine, Agenda, Contact, Plus.
 *
 * POURQUOI `tabBar` ET NON LES OPTIONS DE LA BIBLIOTHÈQUE
 * ------------------------------------------------------
 * La pastille derrière l'icône de l'onglet actif n'est atteignable par aucune des
 * deux options prévues : `tabBarIcon` rend l'icône deux fois superposées, et
 * `tabBarActiveBackgroundColor` reçoit un rayon de bord **calculé par la
 * bibliothèque**, qui vaut `0` pour une barre en bas d'écran. Les deux échouent
 * silencieusement. Le raisonnement complet et les mesures sont dans
 * `src/components/TabBar.tsx`.
 *
 * LES TROIS OPTIONS DE BARRE ONT DISPARU, ET C'EST VOULU
 * -----------------------------------------------------
 * `tabBarStyle`, `tabBarActiveTintColor` et `tabBarInactiveTintColor` ne sont
 * lues que par la barre **par défaut**. Les laisser ici les rendrait inertes :
 * présentes, elles donneraient l'illusion de régler l'apparence, et la première
 * retouche de couleur serait faite au mauvais endroit. Les couleurs de la barre
 * vivent maintenant dans `TabBar`.
 *
 * L'EN-TÊTE DE L'ACCUEIL PORTE LE NOM DE L'ÉCOLE
 * ----------------------------------------------
 * La maquette place « École Frères Lumières » en haut de l'écran d'accueil, et
 * la barre de titre dirait la même chose juste au-dessus. Le titre de l'onglet
 * **est** donc le nom de l'école : la coque reste celle qui existe — en-tête
 * visible, encoche gérée, bandeau de mot de passe faible sous l'en-tête —, et
 * rien n'est écrit deux fois.
 *
 * SEUL L'ONGLET « PLUS » MASQUE SON EN-TÊTE
 * -----------------------------------------
 * Il empile ses propres écrans, dont les en-têtes portent le titre et le retour
 * arrière : garder celui de l'onglet donnerait deux barres empilées. Les quatre
 * autres le gardent, et c'est ce qui évite d'avoir à déplacer l'encoche.
 */
export function MainTabs() {
  const userId = useCurrentUserId();
  const nonLus = useNonLus(userId);

  return (
    <Tab.Navigator
      // Le bandeau est une pièce de la coquille, identique sur les cinq
      // onglets : le mot de passe concerne le compte, pas une rubrique.
      screenLayout={({ children }) => <WeakPasswordGate>{children}</WeakPasswordGate>}
      tabBar={(props) => <TabBar {...props} icons={TAB_ICONS} />}
      screenOptions={{
        headerStyle: { backgroundColor: colors.surface },
        headerTitleStyle: { color: colors.textPrimary, fontSize: fontSize.heading },
        headerTintColor: colors.primary,
        headerRight: () => <SignOutButton />,
      }}
    >
      <Tab.Screen
        name="Accueil"
        component={AccueilScreen}
        options={{ title: 'École Frères Lumières' }}
      />
      <Tab.Screen name="Cantine" component={CantineScreen} options={{ title: 'Cantine' }} />
      <Tab.Screen name="Agenda" component={AgendaScreen} options={{ title: 'Agenda' }} />
      <Tab.Screen name="Contact" component={ContactScreen} options={{ title: 'Contact' }} />

      {/*
        Un groupe pour un seul écran, et ce n'est pas une coquetterie : c'est la
        seule manière de donner à « Plus » une coquille différente de celle des
        quatre autres. `screenLayout` déclaré sur un groupe **surcharge** celui
        du navigateur — écrit dans les types du cœur de React Navigation
        (`RouteGroupConfig.screenLayout`) —, et c'est exactement ce qu'il faut
        ici : cet onglet est le seul sans en-tête, donc le seul dont le bandeau
        doit se protéger lui-même de l'encoche.
      */}
      <Tab.Group
        screenLayout={({ children }) => <WeakPasswordGate sansEnTete>{children}</WeakPasswordGate>}
      >
        <Tab.Screen
          name="Plus"
          component={PlusStack}
          options={{
            // Le libellé reste « Plus » même quand la pile ouvre un autre écran :
            // sans `tabBarLabel`, il suivrait le titre de l'écran affiché et la
            // barre changerait de mots en naviguant.
            title: 'Plus',
            headerShown: false,
            tabBarBadge: nonLus === 0 ? undefined : nonLus > 9 ? '9+' : nonLus,
          }}
        />
      </Tab.Group>
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
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  signOutPressed: {
    opacity: 0.6,
  },
});
