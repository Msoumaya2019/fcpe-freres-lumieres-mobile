/**
 * Doublure de `react-native-url-polyfill/auto`.
 *
 * Ce paquet installe un `URL` conforme au standard, parce que React Native n'en
 * fournit pas. Node en a un depuis toujours : la doublure ne fait donc rien, et
 * c'est exactement ce qu'il faut.
 *
 * POURQUOI ELLE EST NÉCESSAIRE, ET PAS SEULEMENT COMMODE
 * -----------------------------------------------------
 * `src/config/supabase.ts` commence par `import 'react-native-url-polyfill/auto'`.
 * Node ne résout **pas** les sous-chemins sans extension d'un paquet en ESM, et
 * `react-native-url-polyfill` n'a pas de table `exports` : `…/auto` n'y désigne
 * aucun fichier, alors que le paquet est installé et que `auto.js` existe.
 *
 * Sans cette doublure, aucun banc ne peut charger un service — et donc aucun banc
 * ne peut éprouver un service par son **comportement**. C'est ce qu'elle a
 * débloqué, après deux autres défauts du même chargeur.
 *
 * Le remplacement porte sur le **sous-chemin** et non sur le nom du paquet :
 * `supabase.ts` n'importe que celui-là, et remplacer le paquet entier masquerait
 * des exports qu'on voudrait peut-être charger un jour. C'est la règle que
 * `scripts/alias-loader.mjs` énonce déjà pour ses doublures.
 */
export {};
