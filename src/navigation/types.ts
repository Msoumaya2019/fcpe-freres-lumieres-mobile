import type { NavigatorScreenParams } from '@react-navigation/native';

/**
 * Paramètres des routes.
 *
 * Déclarés dans un fichier à part, sans dépendance vers les écrans : les écrans
 * importent ces types, et un type défini dans `RootNavigator` créerait un
 * cycle d'imports entre le navigateur et ses écrans.
 */

/** Onglets accessibles une fois connecté. */
export type MainTabParamList = {
  Informations: undefined;
  Cantine: undefined;
  MesSignalements: undefined;
  DiscussionMembres: undefined;
};

/** Pile racine : l'écran affiché dépend de l'état d'authentification. */
export type RootStackParamList = {
  Connexion: undefined;
  Application: NavigatorScreenParams<MainTabParamList> | undefined;
};

declare global {
  // La syntaxe `namespace` est imposée par React Navigation : son type global
  // `ReactNavigation.RootParamList` se fusionne par déclaration de namespace.
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace ReactNavigation {
    // Interface volontairement vide : elle ne fait que fusionner avec celle de
    // React Navigation pour typer `useNavigation()` sans paramètre générique.
    // eslint-disable-next-line @typescript-eslint/no-empty-object-type
    interface RootParamList extends RootStackParamList {}
  }
}
