/**
 * Doublure de `react-native`, réduite à `Platform`.
 *
 * `src/config/storage.ts` choisit son adaptateur à partir de `Platform.OS` :
 * le trousseau chiffré sur mobile, `AsyncStorage` — en clair — sur le web. Ce
 * choix a une conséquence de sécurité, donc il est testé ; `OS` est
 * volontairement **mutable**, pour que le test puisse charger le module une
 * fois par plateforme.
 */

export const Platform = { OS: 'android' };
