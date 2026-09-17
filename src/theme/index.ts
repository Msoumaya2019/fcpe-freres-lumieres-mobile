/**
 * Jetons visuels de l'application.
 *
 * Une seule palette, claire : `app.json` fixe `userInterfaceStyle: "light"`.
 * Introduire un thème sombre suppose de définir une seconde palette **et** de
 * la propager partout ; tant que ce n'est pas demandé, mieux vaut une
 * interface cohérente qu'un mode sombre à moitié fait.
 *
 * CES VALEURS NE SONT PAS LIBRES
 * ------------------------------
 * Chacune est mesurée contre les fonds sur lesquels elle est **réellement**
 * posée, et `scripts/check-contrast.test.mjs` recalcule ces rapports : 4,5:1
 * pour du texte courant, 3:1 pour ce qui **identifie** un composant. Trois
 * valeurs ont été corrigées après mesure — `warning` (4,24:1 sur blanc),
 * `success` (4,47:1 sur son fond pâle) et la bordure des champs, qui n'existait
 * pas : `border` ne vaut que 1,26:1 sur blanc, ce qui suffit à un cadre
 * décoratif mais pas à la seule chose qui désigne un champ à l'écran.
 *
 * D'où deux bordures distinctes, et la distinction n'est pas cosmétique :
 * `border` sépare sans rien identifier (cartes, listes, barre d'onglets) et
 * relève du décor ; `borderInteractive` délimite un composant qu'on manipule et
 * doit atteindre 3:1.
 */

export const colors = {
  primary: '#2554D6',
  primarySoft: '#E8EEFB',

  background: '#F6F7FB',
  surface: '#FFFFFF',
  surfaceMuted: '#F0F2F8',
  /** Décor : cartes, séparateurs, barre d'onglets. */
  border: '#E2E5EE',
  /** Composant manipulable : bordure de champ. 3,74:1 sur `surface`. */
  borderInteractive: '#7C8499',

  textPrimary: '#141A2A',
  textSecondary: '#5A6480',
  textOnPrimary: '#FFFFFF',

  danger: '#C62828',
  dangerSoft: '#FDECEC',
  success: '#1A7B49',
  successSoft: '#E7F5EE',
  warning: '#9D5D00',
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
} as const;

export const radius = {
  sm: 6,
  md: 10,
  lg: 16,
  pill: 999,
} as const;

export const fontSize = {
  title: 24,
  heading: 18,
  body: 15,
  caption: 13,
} as const;
