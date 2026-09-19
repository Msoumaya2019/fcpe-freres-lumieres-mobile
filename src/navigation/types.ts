import type { NavigatorScreenParams } from '@react-navigation/native';

/**
 * Paramètres des routes.
 *
 * Déclarés dans un fichier à part, sans dépendance vers les écrans : les écrans
 * importent ces types, et un type défini dans `MainTabs` créerait un cycle
 * d'imports entre le navigateur et ses écrans.
 */

/** Sous-onglets de la rubrique Agenda. */
export type AgendaOnglet = 'agenda' | 'sondages';

/** Onglets accessibles une fois connecté. */
export type MainTabParamList = {
  Accueil: undefined;
  Cantine: undefined;
  /**
   * L'onglet à ouvrir en arrivant.
   *
   * Un raccourci de l'accueil mène directement aux sondages, qui vivent sous
   * cette rubrique. Sans ce paramètre, il faudrait soit un onglet de plus dans
   * la barre — et six libellés ne tiennent pas —, soit une rubrique Sondages
   * séparée qui répéterait la moitié de l'agenda.
   */
  Agenda: { onglet?: AgendaOnglet } | undefined;
  Contact: undefined;
  Plus: NavigatorScreenParams<PlusStackParamList> | undefined;
};

/**
 * Écrans atteints depuis « Plus ».
 *
 * Une pile, et non des onglets : ces rubriques se consultent de temps en temps,
 * pas à chaque ouverture. Leur donner un onglet resserrerait la barre sous le
 * seuil où l'on touche juste du premier coup — et c'est exactement la raison
 * pour laquelle la discussion, les signalements et les documents sont ici.
 */
export type PlusStackParamList = {
  PlusHome: undefined;
  Discussion: undefined;
  Documents: undefined;
  Actualites: undefined;
  MesSignalements: undefined;
  Profil: undefined;
  Reglages: undefined;
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
