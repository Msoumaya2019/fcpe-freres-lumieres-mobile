/**
 * Vérifie les contrastes de la palette, sur les paires réellement employées.
 *
 * POURQUOI CE SCRIPT
 * ------------------
 * Rien, dans ce dépôt, ne mesurait une couleur. La palette était pourtant le
 * seul endroit dont une erreur ne produit **aucune** alerte : un contraste trop
 * faible ne casse ni la compilation, ni le lint, ni un test, et ne se voit que
 * sur un écran — au soleil, ou par un œil qui voit mal. Le projet revendiquait
 * pourtant l'accessibilité à deux endroits (l'onglet actif distingué par la
 * **forme** de son icône et pas seulement par sa couleur, la lisibilité en plein
 * soleil) sans que personne n'ait mesuré quoi que ce soit.
 *
 * Mesure faite : cinq paires en échec, dont trois vivantes.
 *
 *   - le libellé d'un bouton **occupé** tombait à 1,55:1, parce que le gris des
 *     boutons inactifs était appliqué aussi pendant l'envoi — alors que le
 *     commentaire du composant annonçait exactement le contraire ;
 *   - la bordure d'un champ valait 1,26:1 sur blanc, et c'est la **seule** chose
 *     qui désigne un champ sur une carte blanche ;
 *   - le statut « Nouveau » d'un signalement valait 4,24:1.
 *
 * CE QUE CE BANC TIENT
 * --------------------
 * Trois choses, et la troisième est celle qu'on oublie :
 *
 *   1. les rapports de contraste, recalculés à chaque exécution — les seuils ne
 *      sont pas écrits à la main mais **dérivés** de la taille et de la graisse,
 *      puisque c'est la règle WCAG elle-même (« grand texte » : 24 px, ou
 *      18,66 px en gras) ;
 *   2. l'apparence du bouton ne dépend pas de `loading` — un test de **forme**,
 *      seul moyen de tenir une décision d'affichage sans rendre un composant ;
 *   3. **aucun jeton de la palette n'est mort.** Une valeur que personne
 *      n'emploie est une valeur que personne n'a mesurée contre le fond où
 *      quelqu'un finira par la poser : c'est la règle déjà appliquée aux exports
 *      de `src/config/env.ts`.
 *
 * Les valeurs ne sont pas recopiées ici : elles sont lues dans
 * `src/theme/index.ts`, sans quoi ce fichier resterait vert après un changement
 * de palette — un test qui recopie ce qu'il vérifie ne peut pas le voir changer.
 */

import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const RACINE = fileURLToPath(new URL('../', import.meta.url));
const THEME = join(RACINE, 'src', 'theme', 'index.ts');
const BOUTON = join(RACINE, 'src', 'components', 'Button.tsx');
const CHAMP = join(RACINE, 'src', 'components', 'TextField.tsx');

function lire(chemin) {
  return readFileSync(chemin, 'utf8');
}

/**
 * Retire les commentaires avant toute extraction par motif.
 *
 * Ce n'est pas une précaution de principe : le tableau de styles du bouton
 * porte un commentaire qui nomme `loading` pour expliquer qu'il n'en dépend
 * pas, et le premier jet de ce banc l'a compté comme une dépendance. Le `//` se
 * coupe avec un `[^:]` devant, sinon `'https://'` ampute la fin de la ligne.
 * Rencontré cinq fois dans ce projet, dont ici.
 */
function sansCommentaires(source) {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
}

/** Les jetons de la palette, tels qu'écrits dans le thème. */
function palette() {
  const jetons = {};

  for (const [, nom, valeur] of lire(THEME).matchAll(/^\s{2}(\w+):\s*'(#[0-9A-Fa-f]{6})'/gm)) {
    jetons[nom] = valeur;
  }

  return jetons;
}

/** Les tailles de texte, lues elles aussi — le seuil en dépend. */
function tailles() {
  const bloc = lire(THEME).match(/export const fontSize = \{([\s\S]*?)\}/);

  assert.ok(bloc, 'bloc `fontSize` introuvable dans le thème');

  const trouvees = {};

  for (const [, nom, valeur] of bloc[1].matchAll(/(\w+):\s*(\d+)/g)) {
    trouvees[nom] = Number(valeur);
  }

  return trouvees;
}

/**
 * Taille du libellé de bouton, lue dans le composant qui la déclare — elle
 * n'appartient pas au thème, et la recopier ici la figerait.
 */
function tailleLibelleBouton() {
  const trouve = lire(BOUTON).match(/label:\s*\{[^}]*fontSize:\s*(\d+)/);

  assert.ok(trouve, 'taille du libellé de bouton introuvable dans Button.tsx');

  return Number(trouve[1]);
}

const COULEURS = palette();
const TAILLES = tailles();
const LIBELLE_BOUTON = tailleLibelleBouton();

/* -------------------------------------------------------------------------- *
 * WCAG 2.x
 * -------------------------------------------------------------------------- */

function canaux(hexa) {
  return [1, 3, 5].map((i) => Number.parseInt(hexa.slice(i, i + 2), 16));
}

function luminance(hexa) {
  const [r, v, b] = canaux(hexa).map((valeur) => {
    const c = valeur / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });

  return 0.2126 * r + 0.7152 * v + 0.0722 * b;
}

function rapport(premier, second) {
  const a = luminance(premier);
  const b = luminance(second);

  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

/**
 * Composition alpha, en sRGB et non en lumière linéaire : c'est ce que fait
 * React Native, et les deux donnent des résultats différents — assez pour
 * qu'une mesure faite dans le mauvais espace conclue à tort.
 */
function melange(premier, second, alpha) {
  const a = canaux(premier);
  const b = canaux(second);
  const melangee = a.map((valeur, i) => Math.round(alpha * valeur + (1 - alpha) * b[i]));

  return `#${melangee.map((valeur) => valeur.toString(16).padStart(2, '0')).join('')}`.toUpperCase();
}

/** Seuil WCAG, dérivé — jamais écrit à la main à côté de la paire. */
function seuil(taillePx, gras) {
  return taillePx >= 24 || (gras && taillePx >= 18.66) ? 3 : 4.5;
}

/* -------------------------------------------------------------------------- *
 * LES PAIRES
 *
 * Relevées en lisant `src/components/` et `src/screens/` : un jeton dont on ne
 * sait pas où il est posé ne peut pas être mesuré. Chaque ligne nomme donc le
 * fond réel, la taille et la graisse.
 * -------------------------------------------------------------------------- */

const TEXTES = [
  ['corps sur carte', 'textPrimary', 'surface', TAILLES.body, false],
  ['titre sur carte', 'textPrimary', 'surface', TAILLES.title, true],
  ['sous-titre sur carte', 'textPrimary', 'surface', TAILLES.heading, true],
  ['légende sur carte', 'textSecondary', 'surface', TAILLES.caption, false],
  ['corps sur le fond d’écran', 'textPrimary', 'background', TAILLES.body, false],
  ['sous-titre sur le fond d’écran', 'textPrimary', 'background', TAILLES.heading, true],
  ['légende sur le fond d’écran', 'textSecondary', 'background', TAILLES.caption, false],
  ['corps sur carte muette', 'textPrimary', 'surfaceMuted', TAILLES.body, false],
  ['légende sur carte muette', 'textSecondary', 'surfaceMuted', TAILLES.caption, false],
  ['libellé du bouton principal', 'textOnPrimary', 'primary', LIBELLE_BOUTON, true],
  ['libellé du bouton secondaire, sur carte', 'primary', 'surface', LIBELLE_BOUTON, true],
  ['libellé d’un bouton fantôme, sur le fond', 'primary', 'background', LIBELLE_BOUTON, true],
  ['bandeau d’erreur', 'danger', 'dangerSoft', TAILLES.caption, false],
  ['bandeau d’information', 'primary', 'primarySoft', TAILLES.caption, false],
  ['bandeau de succès', 'success', 'successSoft', TAILLES.caption, false],
  ['détail sur bandeau d’erreur', 'textSecondary', 'dangerSoft', TAILLES.caption, false],
  ['détail sur bandeau de succès', 'textSecondary', 'successSoft', TAILLES.caption, false],
  ['détail sur bandeau d’information', 'textSecondary', 'primarySoft', TAILLES.caption, false],
  ['erreur d’un champ, sur carte', 'danger', 'surface', TAILLES.caption, false],
  ['statut « nouveau » sur carte', 'warning', 'surface', TAILLES.caption, true],
  ['statut « en cours » sur carte', 'primary', 'surface', TAILLES.caption, true],
  ['statut « traité » sur carte', 'success', 'surface', TAILLES.caption, true],
  ['note de cantine sur carte', 'warning', 'surface', TAILLES.caption, false],

  //  Les badges d'actualité et les raccourcis de l'accueil. Chaque accent paraît
  //  sur son propre fond pâle, et jamais ailleurs : c'est ce couple-là qui est
  //  mesuré, pas la couleur seule.
  ['badge « cantine » sur son fond pâle', 'success', 'successSoft', TAILLES.caption, true],
  ['badge « important » sur son fond pâle', 'danger', 'dangerSoft', TAILLES.caption, true],
  ['badge « événement » sur son fond pâle', 'warning', 'warningSoft', TAILLES.caption, true],
  ['badge « agenda » sur son fond pâle', 'pink', 'pinkSoft', TAILLES.caption, true],
  ['badge « sondage » sur son fond pâle', 'violet', 'violetSoft', TAILLES.caption, true],
  ['titre d’un raccourci, sur fond vert', 'textPrimary', 'successSoft', TAILLES.caption, true],
  ['titre d’un raccourci, sur fond rose', 'textPrimary', 'pinkSoft', TAILLES.caption, true],
  ['titre d’un raccourci, sur fond violet', 'textPrimary', 'violetSoft', TAILLES.caption, true],
  ['titre d’un raccourci, sur fond bleu', 'textPrimary', 'primarySoft', TAILLES.caption, true],
  //  Le sous-titre d'un raccourci est gris, et il est posé sur le **même** pastel
  //  que le titre — donc mesuré, et pas supposé identique au titre. Il est écrit
  //  à 10 px dans le composant ; `caption` (13 px) donne le même seuil, 4,5:1,
  //  parce que les deux tailles restent sous les 18,66 px du « grand texte ».
  [
    'sous-titre d’un raccourci, sur fond vert',
    'textSecondary',
    'successSoft',
    TAILLES.caption,
    false,
  ],
  ['sous-titre d’un raccourci, sur fond rose', 'textSecondary', 'pinkSoft', TAILLES.caption, false],
  [
    'sous-titre d’un raccourci, sur fond violet',
    'textSecondary',
    'violetSoft',
    TAILLES.caption,
    false,
  ],
  [
    'sous-titre d’un raccourci, sur fond bleu',
    'textSecondary',
    'primarySoft',
    TAILLES.caption,
    false,
  ],
  //  Le libellé de l'onglet actif est du **texte**, et il est mesuré comme tel :
  //  4,5:1 à 14 px, et non les 3:1 d'un élément non textuel. Le placer dans
  //  l'autre liste l'aurait laissé passer à 3,5:1, ce qui ne se lit pas.
  [
    'libellé de l’onglet actif, sur sa pastille',
    'primary',
    'primarySoft',
    TAILLES.caption + 1,
    true,
  ],
  //  Le chiffre de la pastille de comptage est du texte, et il est mesuré comme
  //  tel : 10 px en gras, donc 4,5:1. Le placer parmi les éléments non textuels
  //  l'aurait laissé passer à 3:1, ce qui ne se lit pas sur un chiffre.
  ['chiffre de la pastille de comptage', 'textOnPrimary', 'danger', 10, true],
];

/**
 * Ce qui **identifie** un composant qu'on manipule : 3:1 (WCAG 1.4.11).
 *
 * `border` n'y figure pas, et c'est une décision : il ne sert qu'à séparer —
 * cartes, listes, barre d'onglets — jamais à désigner quelque chose qu'on
 * manipule. C'est précisément ce qui a fait naître `borderInteractive`.
 *
 * LE FOND DE LA PASTILLE D'ONGLET N'Y FIGURE PAS NON PLUS
 * ------------------------------------------------------
 * Mesuré : `primarySoft` sur `surface` vaut 1,16:1, très en dessous des 3:1
 * qu'exigerait cette liste. Il n'y est pas parce qu'il est **décoratif**, et
 * l'affirmation est vérifiable ailleurs : l'onglet actif est identifié par la
 * **forme** de son icône — pleine contre au trait — et par la couleur de son
 * libellé, qui sont tous deux dans cette liste. Retirer le fond ne rendrait pas
 * l'onglet courant ambigu, ce qui est exactement la définition d'un élément
 * décoratif. Une pastille qui porterait seule l'information devrait, elle,
 * atteindre 3:1.
 */
const NON_TEXTUELS = [
  ['bordure d’un champ', 'borderInteractive', 'surface'],
  ['bordure d’un bouton secondaire', 'primary', 'surface'],
  //  L'icône d'un raccourci est posée sur le carré `tint`, et **non** sur le fond
  //  `soft` de la carte : le carré est un ton plus soutenu que la carte, et
  //  mesurer l'icône contre `soft` aurait décrit un écran qui n'existe pas. Le
  //  couple `soft`/`tint` n'est donc pas un détail de dessin — c'est lui qui
  //  décide de quel fond on parle.
  ['icône d’un raccourci vert', 'success', 'successTint'],
  ['icône d’un raccourci rose', 'pink', 'pinkTint'],
  ['icône d’un raccourci violet', 'violet', 'violetTint'],
  ['icône d’un raccourci bleu', 'primary', 'primaryTint'],
  //  L'icône d'un badge, elle, est bien posée sur `soft`, le fond qui porte
  //  aussi son libellé. Elle est donc **dominée** par la paire textuelle du
  //  même badge, plus stricte — 4,5:1 contre 3:1. La mesurer une seconde fois
  //  n'ajouterait rien, et l'omettre ne laisse aucun trou.
  ['icône de l’onglet actif, sur sa pastille', 'primary', 'primarySoft'],
  //  La pastille de comptage de la barre d'onglets. Son chiffre est du **texte**
  //  et figure donc dans l'autre liste, au seuil de 4,5:1 ; ici c'est le fond
  //  de la pastille, qui doit se détacher de la barre.
  ['pastille de comptage, sur la barre', 'danger', 'surface'],
];

/* -------------------------------------------------------------------------- *
 * LES TESTS
 * -------------------------------------------------------------------------- */

test('la palette et les tailles sont bien lues', () => {
  // Sans ce garde-fou, un motif qui ne correspond plus rendrait les tests
  // suivants verts en ne mesurant rien — le défaut aurait l'apparence d'une
  // protection, ce qui est pire que pas de protection du tout.
  assert.ok(Object.keys(COULEURS).length >= 13, `jetons lus : ${Object.keys(COULEURS).length}`);
  assert.ok(Object.keys(TAILLES).length >= 4, `tailles lues : ${Object.keys(TAILLES).length}`);
  assert.ok(LIBELLE_BOUTON > 0, `taille du libellé : ${LIBELLE_BOUTON}`);

  const inconnus = [
    ...TEXTES.flatMap(([, premier, second]) => [premier, second]),
    ...NON_TEXTUELS.flatMap(([, premier, second]) => [premier, second]),
  ].filter((nom) => !(nom in COULEURS));

  assert.deepEqual(
    [...new Set(inconnus)],
    [],
    'une paire nomme un jeton absent de la palette : elle comparerait `undefined`',
  );
});

test('le texte atteint le seuil de sa taille et de sa graisse', () => {
  const fautives = [];

  for (const [libelle, premier, second, taillePx, gras] of TEXTES) {
    const mesure = rapport(COULEURS[premier], COULEURS[second]);
    const attendu = seuil(taillePx, gras);

    if (mesure < attendu) {
      fautives.push(
        `${libelle} : ${COULEURS[premier]} sur ${COULEURS[second]} = ${mesure.toFixed(2)}:1, seuil ${attendu} (${taillePx} px${gras ? ' gras' : ''})`,
      );
    }
  }

  assert.deepEqual(fautives, []);
});

test('ce qui identifie un composant atteint 3:1', () => {
  const fautives = [];

  for (const [libelle, premier, second] of NON_TEXTUELS) {
    const mesure = rapport(COULEURS[premier], COULEURS[second]);

    if (mesure < 3) {
      fautives.push(
        `${libelle} : ${COULEURS[premier]} sur ${COULEURS[second]} = ${mesure.toFixed(2)}:1`,
      );
    }
  }

  assert.deepEqual(fautives, []);

  // Et le champ doit **employer** le jeton mesuré : un rapport correct sur une
  // paire que personne ne pose ne protège personne. C'est la règle déjà tenue
  // par `check-input-limits`, qui exige l'emploi d'une constante et pas
  // seulement sa déclaration.
  const champ = sansCommentaires(lire(CHAMP));

  assert.match(
    champ,
    /colors\.borderInteractive/,
    'la bordure du champ doit employer `borderInteractive` : `border` ne vaut que 1,26:1 sur blanc',
  );
  assert.doesNotMatch(
    champ,
    /colors\.border(?!Interactive)/,
    'la bordure décorative ne doit pas servir à désigner un composant qu’on manipule',
  );
});

test("l'apparence du bouton ne dépend pas de `loading`", () => {
  // Le défaut mesuré : `opacity: 0.5` appliqué aussi pendant l'envoi, ce qui
  // faisait tomber le libellé à 1,55:1 sur son propre fond — au moment précis
  // où l'adhérent attend une confirmation, et alors que le commentaire du
  // composant annonçait l'inverse.
  //
  // Test de **forme**, et il est nécessaire : aucun test de valeur ne peut voir
  // un état rendu, faute de moteur de rendu ici. Il porte sur les **noms de
  // props** — `disabled` et `loading` — et non sur les noms de styles, pour
  // qu'un simple renommage ne le fasse pas tomber sur du code correct.
  //
  // Premier jet de ce test, et il ne prouvait rien : il exigeait la présence de
  // la chaîne `disabled`, que `styles.disabled` fournit à lui seul. Une
  // falsification l'a montré — remettre `inactive && styles.disabled` ne le
  // faisait pas tomber. La garde est donc cherchée là où elle est écrite : sur
  // l'élément du tableau qui porte **le style grisé**, désigné par son
  // `opacity: 0.5` plutôt que par son nom.
  //
  // Le nom de la variable qui réunit les deux cas est **lu** lui aussi, jamais
  // supposé : `disabled || loading` vaut `true` pendant l'envoi, et c'est ce
  // raccourci qui portait le défaut. Le chercher dans tout le tableau serait
  // trop large — `inactive` y sert légitimement à supprimer le retour visuel de
  // l'appui, ce qui n'a rien à voir avec le gris.
  const source = sansCommentaires(lire(BOUTON));
  const bloc = source.match(/style=\{\(\{ pressed \}\) => \[([\s\S]*?)\]\}/);

  assert.ok(bloc, 'tableau de styles du bouton introuvable dans Button.tsx');

  const union = source.match(/const (\w+) = disabled \|\| loading/);

  assert.ok(union, 'la variable qui réunit `disabled` et `loading` est introuvable');

  const grise = source.match(/(\w+):\s*\{\s*opacity:\s*0?\.5/);

  assert.ok(grise, 'le style grisé — celui qui porte `opacity: 0.5` — est introuvable');

  const garde = bloc[1].match(new RegExp(`([^,\\n]*?)styles\\.${grise[1]}\\b`));

  assert.ok(garde, `aucun élément du tableau ne porte \`styles.${grise[1]}\``);

  const condition = garde[1];

  assert.ok(
    condition.includes('disabled'),
    'le gris des boutons inactifs doit être conditionné par la prop `disabled`',
  );
  assert.ok(
    !condition.includes('loading') && !new RegExp(`\\b${union[1]}\\b`).test(condition),
    `le gris ne doit dépendre ni de \`loading\` ni de \`${union[1]}\`, qui valent \`true\` pendant l'envoi — mesuré à 1,55:1`,
  );
  assert.ok(
    !bloc[1].includes('loading'),
    "l'apparence du bouton ne doit pas dépendre de `loading`",
  );

  // Ce que le gris coûterait, calculé plutôt qu'affirmé : si la condition
  // ci-dessus régressait, voici le rapport obtenu.
  const fond = melange(COULEURS.primary, COULEURS.surface, 0.5);
  const libelle = melange(COULEURS.textOnPrimary, fond, 0.5);

  assert.ok(
    rapport(libelle, fond) < 4.5,
    'le calcul de contrôle ne reproduit plus le défaut : la mesure a changé de sens',
  );
});

/**
 * Fichiers de l'application — **thème compris**.
 *
 * POURQUOI LE THÈME N'EST PLUS ÉCARTÉ EN BLOC
 * ------------------------------------------
 * La version précédente retirait tout `src/theme/`, au motif que c'est lui qui
 * déclare les jetons : déclarer n'est pas employer. C'était une approximation
 * **de fichier** pour une propriété qui est **de bloc**, et elle a fini par se
 * voir. `tints` ne déclare rien : c'est une table d'emploi, qui dit quel jeton
 * porte le carré d'icône de quel accent. Écarté avec le reste du thème, il
 * faisait passer `successTint` pour mort alors qu'il est employé — et mesuré,
 * deux tests plus haut.
 *
 * C'est donc le bloc `colors` qui est retiré, **lui seul** : c'est la seule
 * partie du thème qui déclare sans employer.
 */
function fichiersApplication() {
  const base = join(RACINE, 'src');
  const dedans = readdirSync(base, { recursive: true })
    .filter((nom) => typeof nom === 'string' && /\.tsx?$/.test(nom))
    .map((nom) => join(base, nom));

  return [...dedans, join(RACINE, 'App.tsx')];
}

/** La source employeuse d'un fichier : commentaires retirés, déclarations ôtées. */
function sourceEmployeuse(chemin) {
  const source = sansCommentaires(lire(chemin));

  if (!chemin.replace(/\\/g, '/').endsWith('theme/index.ts')) {
    return source;
  }

  return source.replace(/export const colors = \{[\s\S]*?\} as const;/, '');
}

test('aucun jeton de la palette n’est mort', () => {
  // Une valeur que personne n'emploie est une valeur que personne n'a mesurée
  // contre le fond où quelqu'un finira par la poser. C'est la règle déjà
  // appliquée aux exports de `src/config/env.ts`, et elle a trouvé ici trois
  // jetons : `primaryPressed`, `warningSoft` et le type `ColorName`.
  // Les commentaires sont retirés : un jeton seulement **nommé** dans une
  // explication n'est pas un jeton employé, et le compter comme tel laisserait
  // passer exactement ce que ce test cherche.
  const sources = fichiersApplication().map(sourceEmployeuse);

  assert.ok(sources.length >= 20, `fichiers lus : ${sources.length}`);

  const morts = Object.keys(COULEURS).filter(
    (nom) => !sources.some((source) => new RegExp(`\\b${nom}\\b`).test(source)),
  );

  assert.deepEqual(
    morts,
    [],
    'ces jetons ne sont employés nulle part : les retirer ou les employer',
  );
});
