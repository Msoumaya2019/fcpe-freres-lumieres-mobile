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
  primarySoft: '#E6F0FD',
  primaryTint: '#C3DFF9',

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
  successSoft: '#E3F9EC',
  successTint: '#B0E7C5',
  warning: '#9D5D00',
  warningSoft: '#FDEEE5',

  /**
   * Accents de catégorie, pris sur la maquette.
   *
   * POURQUOI DES COUPLES ET NON DES COULEURS ISOLÉES
   * -----------------------------------------------
   * Chaque accent paraît toujours sur son propre fond pâle — une pastille de
   * raccourci, un badge d'actualité — et jamais sur un autre. Les deux valeurs
   * forment donc un couple inséparable, mesuré ensemble : `pink` sur `pinkSoft`
   * vaut 5,82:1, `violet` sur `violetSoft` 6,98:1, `warning` sur `warningSoft`
   * 4,63:1. Les séparer laisserait croire qu'on peut poser `pink` ailleurs.
   *
   * `success` et `danger` servent déjà de couples avec leurs fonds pâles : les
   * accents vert et rouge de la maquette sont ceux-là, et non de nouveaux
   * jetons. Deux verts légèrement différents dans la même palette se
   * confondraient à l'écran sans que personne ne sache lequel employer.
   */
  pink: '#B0164A',
  pinkSoft: '#FDE8EF',
  pinkTint: '#FACAD5',
  violet: '#5B34A8',
  violetSoft: '#F0EDFC',
  violetTint: '#DCD2F7',
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

/**
 * Ombre douce des cartes.
 *
 * Deux mécanismes pour une même intention, et il faut les deux : iOS lit
 * `shadowColor` et ses compagnons, Android ignore ces propriétés et ne connaît
 * que `elevation`. Poser l'un sans l'autre donne une carte plate sur la moitié
 * des téléphones — et cela ne se voit que sur l'appareil, jamais au simulateur.
 *
 * Les valeurs sont volontairement discrètes. Une ombre marquée sépare les cartes
 * du fond, ce qui est l'effet cherché, mais elle assombrit aussi le texte posé
 * dessus : une ombre ne doit jamais coûter de la lisibilité.
 */
export const shadow = {
  color: '#0B1220',
  opacity: 0.07,
  radius: 12,
  offsetY: 4,
  elevation: 2,
} as const;

/**
 * Accents de catégorie : une encre et son fond pâle, inséparables.
 *
 * Un accent n'est jamais employé seul. Une carte de raccourci, un badge, une
 * pastille prennent toujours **le couple** — sinon la mesure de contraste porte
 * sur une couleur posée sur un fond qui n'est pas le sien, et le rapport obtenu
 * ne veut rien dire.
 *
 * Le nom dit la couleur, pas l'usage. Nommer un accent `cantine` obligerait à en
 * créer un second le jour où l'agenda veut du vert, alors que la palette est
 * déjà mesurée pour ce fond-là.
 */
export const accents = {
  bleu: { ink: colors.primary, soft: colors.primarySoft },
  vert: { ink: colors.success, soft: colors.successSoft },
  rose: { ink: colors.pink, soft: colors.pinkSoft },
  violet: { ink: colors.violet, soft: colors.violetSoft },
  ambre: { ink: colors.warning, soft: colors.warningSoft },
  rouge: { ink: colors.danger, soft: colors.dangerSoft },
} as const;

export type AccentName = keyof typeof accents;

/**
 * Le second ton d'un accent : le carré qui porte une **icône seule**.
 *
 * POURQUOI DEUX TONS, ET POURQUOI ILS NE SE CONFONDENT PAS
 * --------------------------------------------------------
 * La maquette relève deux tons par accent, et la mesure le confirme : le fond
 * de la carte de raccourci « Cantine » vaut `#E3F9EC` tandis que le carré de son
 * icône vaut `#B0E7C5` — même teinte, deux valeurs. Relever les deux au pixel
 * plutôt que de les supposer a évité de peindre les deux au même ton.
 *
 * La distinction n'est pas décorative, elle **décide du seuil**. Un fond qui
 * porte du texte doit laisser ce texte à 4,5:1 ; un fond qui ne porte qu'une
 * icône n'en exige que 3:1. `success` sur `successSoft` vaut 4,79:1 et passe
 * comme fond de badge ; le même `success` sur `successTint` vaut 3,79:1 — assez
 * pour une icône, **pas** pour un libellé. Confondre les deux listes reviendrait
 * à peindre un badge sur `tint`, où son texte tomberait sous le seuil sans que
 * rien ne le signale.
 *
 * QUATRE ACCENTS, PAS SIX
 * -----------------------
 * Seuls les quatre raccourcis de l'accueil posent une icône sur un carré. Les
 * accents ambre et rouge n'en ont pas : leur ajouter un ton serait déclarer une
 * couleur que personne n'emploie, et le contrôle de contraste la refuserait à
 * juste titre. Le jour où l'agenda voudra un carré ambre, il ajoutera la ligne.
 */
export const tints = {
  bleu: colors.primaryTint,
  vert: colors.successTint,
  rose: colors.pinkTint,
  violet: colors.violetTint,
} as const;

export type TintedAccent = keyof typeof tints;
