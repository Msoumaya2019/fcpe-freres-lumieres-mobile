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
  /**
   * L'accès à l'espace membres : connexion, inscription, mot de passe oublié.
   *
   * Cette route vit **dans la pile de « Plus »** et non à la racine, parce que
   * c'est de là qu'on la demande. La racine ne garde que `Recuperation`, le seul
   * cas où l'écran doit prendre toute la place.
   */
  AccesMembre: undefined;
  Discussion: undefined;
  /**
   * Les messages adressés au bureau par les familles.
   *
   * Elle vit ici, avec les autres rubriques de « Plus », et non à la racine :
   * elle se consulte depuis ce menu, et le retour arrière de la pile suffit.
   */
  ConversationsBureau: undefined;
  /**
   * Les adhésions à décider : accepter, refuser, suspendre.
   *
   * Réservée au bureau, comme la précédente, et pour la même raison : c'est une
   * décision d'association, pas une lecture.
   */
  AdhesionsBureau: undefined;
  Documents: undefined;
  Actualites: undefined;
  MesSignalements: undefined;
  Profil: undefined;
  Reglages: undefined;
};

/**
 * Pile racine.
 *
 * `Application` occupe le fond, et `Recuperation` se pose dessus — c'est la
 * route **subie**, celle qu'ouvre un lien de réinitialisation reçu par e-mail,
 * et elle prend toute la place tant qu'elle dure.
 *
 * La connexion **demandée**, elle, vit dans la pile de « Plus » (`AccesMembre`) :
 * c'est de là qu'un adhérent la demande, et elle se referme d'elle-même une fois
 * la session ouverte.
 */
export type RootStackParamList = {
  Application: NavigatorScreenParams<MainTabParamList> | undefined;
  Recuperation: undefined;
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
