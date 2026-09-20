/**
 * Vérifie qu'une liste qui peut recevoir une saisie ne consomme pas le premier
 * appui, et qu'un formulaire qui se referme emmène le clavier avec lui.
 *
 * POURQUOI CE FICHIER
 * -------------------
 * Le défaut a été signalé depuis un téléphone, dans ces mots : « quand je veux
 * laisser un commentaire sur sondage, je ne peux pas cliquer sur envoyer car le
 * clavier de l'iPhone ne descend pas ». La cause est une **valeur par défaut**,
 * et c'est ce qui la rend invisible : `keyboardShouldPersistTaps` vaut `'never'`,
 * et la documentation du paquet installé dit exactement ce qui se passe —
 *
 *     « 'never' (the default), tapping outside of the focused text input when
 *       the keyboard is up dismisses the keyboard. **When this happens,
 *       children won't receive the tap.** »
 *
 * — lue dans `node_modules/react-native/Libraries/Components/ScrollView/
 * ScrollView.js`, et non recopiée d'une page web. Le premier appui sur
 * « Envoyer » ferme donc le clavier **et n'atteint jamais le bouton**. Le
 * parent appuie une seconde fois, le commentaire part, et il n'a rien vu
 * d'anormal : il conclut seulement que le bouton est capricieux. C'est la forme
 * la plus coûteuse d'un défaut — un geste qui marche au second essai.
 *
 * POURQUOI IL N'Y AVAIT PAS DE BANC, ET POURQUOI IL Y EN A UN
 * -----------------------------------------------------------
 * Parce que la propriété n'est **pas absente** : elle est **déclarée** à deux
 * endroits — la branche `scrollable` de `Screen.tsx`, et la discussion
 * collective —, ce qui donne au dépôt l'apparence d'avoir traité la question.
 * Sept listes sur dix ne la portaient pas, et rien ne les comptait. Une
 * observation mesurée doit devenir un invariant, pas un paragraphe : c'est
 * celui-ci.
 *
 * CE QU'IL MESURE, ET CE QU'IL NE MESURE PAS
 * ------------------------------------------
 * Il lit l'**arbre** des fichiers (`typescript`), pas leur texte : un
 * commentaire qui nomme `<FlatList>` ne compte pas comme une liste. Il exige
 * `keyboardShouldPersistTaps="handled"` sur **chaque** liste d'un fichier qui
 * peut porter une saisie — pas seulement sur celle qui héberge aujourd'hui le
 * formulaire, parce que les deux onglets de l'agenda n'en sont qu'un et qu'un
 * déplacement du fil de commentaires ne doit pas rouvrir le défaut.
 *
 * Il ne dit rien de ce qui se passe à l'écran : il tient la **déclaration**, la
 * même limite que les autres bancs de forme. Et il ne juge pas la valeur
 * `'always'` — qui marcherait aussi, mais laisserait le clavier ouvert sous un
 * appui sur une carte, ce que le dépôt n'a jamais voulu.
 *
 * L'EXCEPTION EST MESURÉE, PAS SUPPOSÉE
 * -------------------------------------
 * La discussion collective dresse un `KeyboardAvoidingView`, et c'est pourquoi
 * elle n'a pas à porter les deux compléments : il compense en mesurant
 * `keyboardWillChangeFrame` et en ajoutant la hauteur du clavier à sa mise en
 * page, quand `automaticallyAdjustKeyboardInsets` ajuste le `contentInset`
 * **natif**. Les deux ensemble compenseraient deux fois, et la liste remonterait
 * du double. Le banc a d'abord refusé cette liste — le premier essai a produit
 * exactement ce faux positif —, et c'est la lecture de l'écran qui a tranché,
 * pas l'inverse : un banc qui tombe sur du code juste est un défaut du banc.
 * L'exception ne dispense jamais de la **première** propriété, parce qu'un
 * `KeyboardAvoidingView` déplace le contenu, il ne fait pas passer un appui.
 *
 * LA PORTÉE EST SUIVIE, PAS DEVINÉE
 * ---------------------------------
 * Un fichier « qui peut porter une saisie » est un fichier qui rend
 * `<TextField>` ou `<TextInput>`, **ou** qui rend un composant exporté par l'un
 * d'eux. Cette seconde moitié n'est pas un raffinement : la première version de
 * l'inventaire cherchait `<TextField>` dans les fichiers, et elle a manqué
 * **trois écrans** — l'agenda, le détail d'une actualité, la cantine — qui
 * atteignent le formulaire par le baril `@/components`. Le défaut se trouvait
 * précisément dans les fichiers que le balayage ne voyait pas, et un inventaire
 * muet se lit comme un inventaire vert. Les trois noms sont donc exigés ici, en
 * plus du plancher : le plancher attrape un balayage qui se vide, les noms
 * attrapent le balayage qui ne voit que les évidences.
 *
 * LE SECOND DÉFAUT EST LE MÊME, UN CRAN PLUS LOIN
 * -----------------------------------------------
 * Le clavier appartient au champ qui a le focus. Quand un formulaire se referme,
 * ses champs sont démontés — et le clavier part avec eux **en principe**. Cette
 * démission n'est écrite nulle part dans le contrat de React ; un clavier resté
 * ouvert recouvre alors la confirmation que le parent vient de déclencher, et
 * l'écran a l'air de n'avoir rien fait. Les trois formulaires qui masquent leurs
 * champs (`setFormOpen(false)`) appellent donc `Keyboard.dismiss()`, et ce banc
 * l'exige — avec un témoin sur le motif lui-même, car un renommage de l'état
 * ferait tomber la règle en silence.
 *
 * Ce que le dépôt n'a **pas** fait, et c'est délibéré : les deux composeurs qui
 * gardent leur champ ouvert après l'envoi — la discussion collective et la
 * réponse du bureau — ne ferment pas le clavier. Le parent peut enchaîner deux
 * messages, et rabaisser le clavier d'un geste grâce à `keyboardDismissMode`.
 */

import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import ts from 'typescript';

const RACINE = fileURLToPath(new URL('../', import.meta.url));

function fichiersSous(dossier, extension) {
  const base = join(RACINE, dossier);

  return readdirSync(base, { recursive: true })
    .filter((nom) => typeof nom === 'string' && nom.endsWith(extension))
    .map((nom) => join(base, nom));
}

/** Les fichiers où un formulaire peut vivre : les écrans, et les composants partagés. */
const SOURCES = [...fichiersSous('src/screens', '.tsx'), ...fichiersSous('src/components', '.tsx')];

/** La coque : c'est elle qui porte la règle pour les écrans qui n'ont pas de liste. */
const COQUE = join(RACINE, 'src', 'components', 'Screen.tsx');

const LISTES = new Set(['FlatList', 'ScrollView', 'SectionList']);
const CHAMPS = new Set(['TextField', 'TextInput']);

/**
 * Les noms des trois écrans qui atteignent le formulaire **par composition**.
 *
 * Ce sont ceux qu'un balayage fichier par fichier ne voit pas : le nom
 * `FormulaireCommentaire` n'apparaît nulle part dans `AnnonceDetailScreen.tsx`,
 * qui l'importe du baril. Les exiger nommément, c'est refuser de croire un
 * inventaire qui les aurait perdus de nouveau.
 */
const PAR_COMPOSITION = ['AgendaScreen.tsx', 'AnnonceDetailScreen.tsx', 'CantineScreen.tsx'];

/* -------------------------------------------------------------------------- *
 *  Les extracteurs
 *
 *  Fonctions pures — une source entre, un verdict sort — pour que les témoins
 *  puissent les exercer sur des sources écrites dans ce fichier. Un extracteur
 *  qui ne trouve plus rien rendrait les tests verts en ne mesurant rien.
 * -------------------------------------------------------------------------- */

/** L'arbre d'un fichier TSX, lu depuis sa source. */
function arbre(source, nom = 'source.tsx') {
  return ts.createSourceFile(nom, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
}

/**
 * Les balises JSX d'une source : leur nom, et la valeur déclarée de chaque
 * attribut.
 *
 * Un attribut sans valeur (`automaticallyAdjustKeyboardInsets`) vaut `true` ; un
 * attribut dont la valeur est une expression (`{…}`) vaut la chaîne vide, ce qui
 * ne satisfait aucune des valeurs attendues — c'est voulu : une propriété posée
 * par une expression n'est pas relisible ici, et la déclarer littéralement est
 * la seule forme que ce banc sache tenir.
 */
function balises(source) {
  const racine = arbre(source);
  const trouvees = [];

  const visiter = (noeud) => {
    if (ts.isJsxSelfClosingElement(noeud) || ts.isJsxOpeningElement(noeud)) {
      const attributs = new Map();

      for (const propriete of noeud.attributes.properties) {
        if (!ts.isJsxAttribute(propriete)) {
          continue;
        }

        const nom = propriete.name.getText(racine);
        const valeur = propriete.initializer;

        if (valeur === undefined) {
          attributs.set(nom, true);
        } else if (ts.isStringLiteral(valeur)) {
          attributs.set(nom, valeur.text);
        } else {
          attributs.set(nom, '');
        }
      }

      trouvees.push({ nom: noeud.tagName.getText(racine), attributs });
    }

    ts.forEachChild(noeud, visiter);
  };

  visiter(racine);
  return trouvees;
}

/** Vrai si la source rend un champ de saisie. */
function porteUneSaisie(source) {
  return balises(source).some((balise) => CHAMPS.has(balise.nom));
}

/** Les listes défilantes d'une source. */
function listesDe(source) {
  return balises(source).filter((balise) => LISTES.has(balise.nom));
}

/** Les composants qu'une source exporte — ceux qu'un autre fichier peut rendre. */
function composantsExportes(source) {
  const racine = arbre(source);
  const noms = [];

  for (const declaration of racine.statements) {
    const exporte = (declaration.modifiers ?? []).some(
      (modificateur) => modificateur.kind === ts.SyntaxKind.ExportKeyword,
    );

    if (!exporte) {
      continue;
    }

    if (ts.isFunctionDeclaration(declaration) && declaration.name !== undefined) {
      noms.push(declaration.name.text);
    } else if (ts.isVariableStatement(declaration)) {
      for (const declarant of declaration.declarationList.declarations) {
        if (ts.isIdentifier(declarant.name)) {
          noms.push(declarant.name.text);
        }
      }
    }
  }

  return noms;
}

/**
 * Les fichiers qui peuvent porter une saisie : ceux qui la rendent, et ceux qui
 * rendent un composant partagé qui la rend.
 *
 * La composition ne se propage **que** depuis `src/components/` : un écran est
 * atteint par le navigateur, jamais rendu dans la liste d'un autre écran, et
 * propager depuis les écrans ferait entrer la navigation entière dans la portée.
 */
function porteurs() {
  const directs = SOURCES.filter((chemin) => porteUneSaisie(readFileSync(chemin, 'utf8')));
  const nomsPartages = new Set();

  for (const chemin of directs) {
    if (!chemin.includes(`${sep}components${sep}`)) {
      continue;
    }
    for (const nom of composantsExportes(readFileSync(chemin, 'utf8'))) {
      nomsPartages.add(nom);
    }
  }

  const parComposition = SOURCES.filter((chemin) => {
    if (directs.includes(chemin)) {
      return false;
    }
    return balises(readFileSync(chemin, 'utf8')).some((balise) => nomsPartages.has(balise.nom));
  });

  return [...directs, ...parComposition];
}

/** La phrase d'un manquement, avec le fichier et la liste : un défaut sans son endroit oblige à tout relire. */
function manquement(chemin, liste, nom, attendu) {
  return `${relative(RACINE, chemin)} — <${liste.nom}> : ${nom} ${attendu}`;
}

/* -------------------------------------------------------------------------- *
 *  Les témoins des extracteurs
 * -------------------------------------------------------------------------- */

test('les extracteurs lisent ce qu’ils prétendent lire', () => {
  // Sans ces témoins, un extracteur cassé rendrait tout le reste vert.
  const exemple = `
    <Screen padded={false}>
      <FlatList data={x} renderItem={({ item }) => <Card />} />
      <ScrollView automaticallyAdjustKeyboardInsets>
        <TextField label="Nom" />
      </ScrollView>
    </Screen>
  `;

  // L'ordre est celui de l'arbre, et il surprend : le `<Card />` du `renderItem`
  // est un **enfant du `FlatList`**, donc visité avant le `ScrollView` qui le
  // suit dans le texte. L'attente a d'abord été écrite dans l'ordre de lecture
  // du fichier, et c'est le témoin qui avait tort — pas l'extracteur.
  assert.deepEqual(
    balises(exemple).map((balise) => balise.nom),
    ['Screen', 'FlatList', 'Card', 'ScrollView', 'TextField'],
    'le balayage des balises ne rend plus ce qu’il doit',
  );

  assert.equal(porteUneSaisie(exemple), true, 'un `<TextField>` doit suffire à porter une saisie');
  assert.equal(porteUneSaisie('<Card />'), false, 'une carte n’est pas un champ');

  const listes = listesDe(exemple);
  assert.deepEqual(
    listes.map((liste) => liste.nom),
    ['FlatList', 'ScrollView'],
    'les listes défilantes ne sont plus reconnues',
  );

  // La valeur d'un attribut : littérale, absente, ou posée par une expression.
  assert.equal(listes[0].attributs.get('keyboardShouldPersistTaps'), undefined);
  assert.equal(listes[1].attributs.get('automaticallyAdjustKeyboardInsets'), true);
  assert.equal(balises('<FlatList data={x} />')[0].attributs.get('data'), '');

  // Le `=>` d'un `renderItem` ne doit pas être pris pour la fin de la balise :
  // c'est le piège d'un balayage au caractère, et la raison de lire l'arbre.
  const flechee = balises('<FlatList renderItem={({ item }) => <Card titre="a > b" />} />');
  assert.deepEqual(
    flechee.map((balise) => balise.nom),
    ['FlatList', 'Card'],
    'une balise contenant une flèche et un `>` en chaîne est mal découpée',
  );

  assert.deepEqual(
    composantsExportes('export function A() {}\nexport const B = 1;\nfunction C() {}'),
    ['A', 'B'],
    'les composants exportés ne sont plus relevés',
  );
});

/* -------------------------------------------------------------------------- *
 *  Les invariants
 * -------------------------------------------------------------------------- */

test('la coque déclare la règle pour les écrans qui n’ont pas de liste', () => {
  // Cinq écrans passent par `<Screen scrollable>` : ils n'ont aucune liste à eux,
  // et c'est la coque qui décide pour eux. Si elle perdait la propriété, ces
  // écrans tomberaient sans qu'aucune liste ne soit en cause.
  const scrollables = listesDe(readFileSync(COQUE, 'utf8')).filter(
    (liste) => liste.nom === 'ScrollView',
  );

  assert.ok(
    scrollables.length >= 1,
    '`Screen.tsx` ne rend plus de `ScrollView` : ce test ne mesure plus rien',
  );

  assert.ok(
    scrollables.every((liste) => liste.attributs.get('keyboardShouldPersistTaps') === 'handled'),
    'la branche `scrollable` de `Screen.tsx` doit porter keyboardShouldPersistTaps="handled" — ' +
      'sans elle, l’écran de connexion et les quatre autres écrans sans liste consomment le premier appui',
  );
});

test('chaque liste d’un écran qui porte un formulaire laisse passer l’appui', () => {
  const fichiers = porteurs();

  // Le plancher attrape un balayage qui se vide ; les noms, un balayage qui ne
  // voit que les évidences. Ni l'un ni l'autre n'est un décompte : ils disent
  // « il en manque », jamais « il y en a exactement tant ».
  assert.ok(
    fichiers.length >= 8,
    `porteurs de saisie trouvés : ${fichiers.length} — le suivi de composition ne trouve plus les écrans`,
  );

  const noms = fichiers.map((chemin) => relative(RACINE, chemin).split(sep).pop());
  const perdus = PAR_COMPOSITION.filter((nom) => !noms.includes(nom));

  assert.deepEqual(
    perdus,
    [],
    `ces écrans atteignent le formulaire par le baril \`@/components\` et doivent être suivis : ${perdus.join(', ')}`,
  );

  const fautifs = [];
  let listes = 0;
  let compensees = 0;

  for (const chemin of fichiers) {
    const source = readFileSync(chemin, 'utf8');

    // Un fichier qui dresse déjà un `KeyboardAvoidingView` compense le clavier
    // lui-même, en mesurant `keyboardWillChangeFrame` et en ajoutant la hauteur
    // du clavier à sa mise en page. Ajouter par-dessus
    // `automaticallyAdjustKeyboardInsets` — qui ajuste, lui, le `contentInset`
    // **natif** — compenserait deux fois, et la liste remonterait du double de
    // la hauteur du clavier. C'est la seule exception, elle est mesurée ici, et
    // elle ne dispense pas de la première propriété : un `KeyboardAvoidingView`
    // ne fait pas passer un appui, il déplace le contenu.
    const compense = balises(source).some((balise) => balise.nom === 'KeyboardAvoidingView');
    compensees += compense ? 1 : 0;

    for (const liste of listesDe(source)) {
      listes += 1;

      if (liste.attributs.get('keyboardShouldPersistTaps') !== 'handled') {
        fautifs.push(
          manquement(
            chemin,
            liste,
            'keyboardShouldPersistTaps="handled"',
            'est absent — « never », la valeur par défaut, consomme le premier appui pour fermer ' +
              'le clavier, et le bouton ne le reçoit jamais',
          ),
        );
      }

      if (compense) {
        continue;
      }

      // `'on-drag'` est inter-plateformes (mesuré dans la documentation du
      // paquet) : c'est le geste qui rabat le clavier, et il répond mot pour mot
      // au signalement.
      if (liste.attributs.get('keyboardDismissMode') !== 'on-drag') {
        fautifs.push(
          manquement(
            chemin,
            liste,
            'keyboardDismissMode="on-drag"',
            'est absent — sans lui, aucun geste ne rabat le clavier',
          ),
        );
      }

      if (liste.attributs.get('automaticallyAdjustKeyboardInsets') !== true) {
        fautifs.push(
          manquement(
            chemin,
            liste,
            'automaticallyAdjustKeyboardInsets',
            'est absent — la liste ne remonte pas au-dessus du clavier, et le champ reste caché',
          ),
        );
      }
    }
  }

  assert.ok(
    listes >= 10,
    `listes mesurées : ${listes} — la portée s’est vidée, et ce test ne mesurerait rien`,
  );

  // L'exception doit être **exercée**, sinon elle pourrait absorber la portée
  // entière sans que rien ne le dise : c'est un `continue` qui avale deux
  // exigences, et un `continue` que rien ne traverse est un trou.
  assert.ok(
    compensees >= 1 && compensees < fichiers.length,
    `fichiers dispensés des deux compléments : ${compensees} sur ${fichiers.length} — ` +
      'l’exception est soit inerte, soit devenue la règle',
  );

  assert.deepEqual(
    fautifs,
    [],
    `des listes consomment le premier appui :\n  ${fautifs.join('\n  ')}`,
  );
});

test('un formulaire qui se referme emmène le clavier avec lui', () => {
  // Le motif est nommé, pas deviné : `setFormOpen(false)` est le geste qui
  // **démonte les champs**. C'est lui qui laisse le clavier orphelin, et c'est
  // donc lui qui doit s'accompagner du rabaissement.
  const refermants = SOURCES.filter((chemin) =>
    readFileSync(chemin, 'utf8').includes('setFormOpen(false)'),
  );

  assert.ok(
    refermants.length >= 3,
    `formulaires qui masquent leurs champs : ${refermants.length} — le motif a changé de nom, ` +
      'et cette règle ne mesure plus rien',
  );

  const fautifs = refermants
    .filter((chemin) => !readFileSync(chemin, 'utf8').includes('Keyboard.dismiss()'))
    .map((chemin) => relative(RACINE, chemin));

  assert.deepEqual(
    fautifs,
    [],
    `ces formulaires se referment sans rabaisser le clavier — il recouvrirait la confirmation :\n  ` +
      fautifs.join('\n  '),
  );
});
