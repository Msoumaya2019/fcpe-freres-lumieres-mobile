/**
 * Vérifie que chaque visage de l'écran de connexion a son formulaire.
 *
 * POURQUOI CE FICHIER
 * -------------------
 * `Mode` est un type énuméré, et la carte de `ConnexionScreen` traite ses valeurs
 * une par une. **Rien ne reliait les deux** : la cinquième valeur — le renvoi de
 * l'e-mail de confirmation — a été ajoutée à la main dans le type *et* dans la
 * chaîne de rendu, et un oubli n'aurait produit aucune alerte. C'est le pire cas
 * de cette famille : le dernier `else` de la chaîne est le formulaire de
 * connexion, donc une valeur non traitée n'affiche ni erreur ni écran vide —
 * elle affiche un formulaire qui a l'air juste, sous un titre qui ne correspond
 * pas à ce que l'adhérent croyait demander.
 *
 * Deux directions sont tenues, et la seconde est celle qu'on oublie : une branche
 * qui vise une valeur que le type ne déclare plus est **inatteignable** — le cas
 * se produit en renommant une valeur dans le type seul, et le lint ne le voit
 * pas, `effectiveMode === 'ancien-nom'` restant une comparaison valide.
 *
 * LA TROISIÈME MESURE
 * -------------------
 * Le contrôle a besoin de savoir quelles valeurs le `else` sert, puisque la
 * chaîne ne les nomme pas. Cette liste — « les deux visages de base » — est une
 * affirmation, et elle est donc **mesurée ailleurs** : ce sont exactement les
 * valeurs que la carte ne compare pas et que les boutons de pied de carte
 * comparent, eux. Deux endroits qui portent la même vérité sans se lire, comme le
 * schéma SQL et son miroir TypeScript.
 *
 * CE QUE CE CONTRÔLE NE PEUT PAS VOIR
 * -----------------------------------
 * Il lit les **littéraux comparés**, pas ce que chaque branche rend. Une branche
 * qui afficherait le mauvais formulaire pour la bonne valeur passerait : le
 * contrôle dit qu'aucun visage n'est oublié, pas que chacun est le bon.
 *
 * Le dernier test, lui, mesure qu'une valeur est **nommée** ailleurs que dans le
 * type et dans la carte — une transition vers ce visage, ou la condition qui le
 * force. C'est un indice de joignabilité, pas une preuve : il ne suit pas le
 * chemin, et un bouton qui appellerait la mauvaise transition lui échapperait.
 * Sans lui, un sixième visage ajouté au type et à la carte, mais que **rien** ne
 * déclenche, serait vert partout.
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const RACINE = fileURLToPath(new URL('../', import.meta.url));
const ECRAN = join(RACINE, 'src/screens/ConnexionScreen.tsx');

/**
 * Les valeurs que le `else` de la chaîne sert. Une affirmation, mesurée par le
 * dernier test : ce sont les valeurs que la carte ne compare pas.
 */
const VISAGES_DE_BASE = ['connexion', 'inscription'];

/**
 * Le source **sans ses commentaires**.
 *
 * Aucun commentaire de cet écran ne nomme aujourd'hui une comparaison — mesuré :
 * retirer ce nettoyage ne change rien au résultat. Il est là pour ce qui
 * viendrait. Un commentaire JSX glissé dans la carte et citant une comparaison
 * serait compté comme une branche, et le contrôle deviendrait **vert pour la
 * mauvaise raison** — exactement la forme de défaut que ce banc existe pour
 * empêcher. Mesuré dans les deux sens : avec ce nettoyage, ce commentaire laisse
 * le banc vert ; sans lui, le même commentaire le fait tomber.
 */
function sansCommentaires(texte) {
  // La variante `(^|[^:])` est celle des autres bancs : sans elle, le `//` d'une
  // adresse (`https://…`) serait pris pour un commentaire.
  return texte.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
}

/** Le source, la carte des formulaires, et tout ce qui n'est pas elle. */
function decouper() {
  const source = sansCommentaires(readFileSync(ECRAN, 'utf8'));

  const carte = /<Card>([\s\S]*?)<\/Card>/.exec(source);
  assert.ok(carte !== null, 'la carte des formulaires doit être délimitée par <Card>…</Card>');

  return { source, carte: carte[1], horsCarte: source.replace(carte[0], '') };
}

/** Les valeurs déclarées par le type `Mode`. */
function valeursDeclarees(source) {
  const declaration = /type Mode =([\s\S]*?);/.exec(source);
  assert.ok(declaration !== null, 'le type `Mode` doit être déclarable par ce contrôle');

  return [...declaration[1].matchAll(/'([^']+)'/g)].map(([, valeur]) => valeur);
}

/** Les valeurs comparées dans un texte donné. */
function valeursComparees(texte) {
  return [...texte.matchAll(/effectiveMode === '([^']+)'/g)].map(([, valeur]) => valeur);
}

test('aucune valeur déclarée par `Mode` ne reste sans branche', () => {
  const { source, carte } = decouper();

  const declarees = valeursDeclarees(source);
  assert.ok(declarees.length >= 5, `le type doit déclarer ses valeurs (${declarees.length} lues)`);

  const traitees = valeursComparees(carte);
  const attendues = declarees.filter((valeur) => !VISAGES_DE_BASE.includes(valeur));
  const oubliees = attendues.filter((valeur) => !traitees.includes(valeur));

  assert.deepEqual(
    oubliees,
    [],
    `sans branche, cette valeur tombe sur le formulaire de connexion : ${oubliees.join(', ')}`,
  );
});

test('aucune branche ne vise une valeur absente du type', () => {
  const { source, carte } = decouper();

  const declarees = valeursDeclarees(source);
  const orphelines = valeursComparees(carte).filter((valeur) => !declarees.includes(valeur));

  assert.deepEqual(
    orphelines,
    [],
    `branche inatteignable, la valeur n'est pas dans le type : ${orphelines.join(', ')}`,
  );
});

test('les deux visages de base sont ceux que la carte ne compare pas', () => {
  const { carte, horsCarte } = decouper();

  const dansLaCarte = new Set(valeursComparees(carte));
  const horsLaCarte = [...new Set(valeursComparees(horsCarte))];

  // Les boutons de pied de carte ne s'affichent que sur les visages de base : ils
  // nomment donc les mêmes valeurs, et c'est ce qui rend la constante ci-dessus
  // mesurable. Ajouter un bouton à un troisième visage est une décision — ce test
  // la demande explicitement, au lieu de la laisser passer.
  assert.deepEqual(
    [...horsLaCarte].sort(),
    [...VISAGES_DE_BASE].sort(),
    'les valeurs comparées hors de la carte doivent être exactement les visages de base',
  );

  const compares = VISAGES_DE_BASE.filter((valeur) => dansLaCarte.has(valeur));
  assert.deepEqual(
    compares,
    [],
    `le \`else\` sert cette valeur, la carte ne doit pas la comparer : ${compares.join(', ')}`,
  );
});

test('aucun visage déclaré n’est un visage que rien ne déclenche', () => {
  const { source, horsCarte } = decouper();

  // Hors du type et hors de la carte, il ne reste que les transitions — et la
  // condition qui force le mode de récupération, qui est de ce genre-là.
  const ailleurs = horsCarte.replace(/type Mode =[\s\S]*?;/, '');
  const muets = valeursDeclarees(source).filter((valeur) => !ailleurs.includes(`'${valeur}'`));

  assert.deepEqual(
    muets,
    [],
    `cette valeur a un formulaire que rien n'atteint : ${muets.join(', ')}`,
  );
});
