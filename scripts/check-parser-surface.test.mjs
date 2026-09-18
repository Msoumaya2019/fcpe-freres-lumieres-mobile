/**
 * =============================================================================
 *  La surface de l'analyseur, et ce que les bancs en lisent
 * =============================================================================
 *
 *  `check-sql.mjs` valide la syntaxe du schéma, et `check-schema-refs` lit son
 *  **arbre syntaxique** : clés étrangères, types énumérés, portées, corps de
 *  fonction, colonnes lues sur `new`/`old`. Tous deux reposent sur `libpg-query`.
 *
 *  Cela crée une fragilité qu'aucun de ces deux bancs ne peut voir : **si
 *  l'analyseur renomme une clé de nœud, les bancs deviennent aveugles en restant
 *  verts.** Un `ColumnRef` qui s'appellerait demain autrement ne serait plus
 *  trouvé, donc plus vérifié, et le rapport dirait `ok`. C'est la même famille
 *  que la règle qui a fondé `check-async-wiring` — un commentaire qui justifie
 *  une absence par une propriété universelle est une affirmation vérifiable —
 *  et le remède est le même : mesurer.
 *
 *  Le 2026-09-18, la montée `libpg-query` 17.7.4 → 18.1.4 a été mesurée avant
 *  d'être acceptée. Sur les deux fichiers SQL du projet :
 *
 *    - mêmes clés racines (`version`, `stmts`) et mêmes décomptes d'instructions
 *      (91 et 3) ;
 *    - **aucune clé perdue**, à aucun niveau de l'arbre ;
 *    - une seule clé nouvelle, `is_enforced` — un champ de PostgreSQL 18, additif ;
 *    - six entrées d'essai, valides et invalides, acceptées ou refusées à
 *      l'identique par les deux versions.
 *
 *  C'est ce qui a autorisé la montée. Ce fichier empêche la prochaine d'être
 *  acceptée sans la même mesure.
 *
 *  LES TROIS QUESTIONS, ET POURQUOI ELLES SONT SÉPARÉES
 *  ---------------------------------------------------
 *  1. **L'analyseur produit-il toujours les mêmes types de nœud ?** C'est la
 *     question du renommage. On ne cherche pas les types que les bancs lisent,
 *     mais **tous** ceux que le SQL produit : un type que personne ne lit
 *     aujourd'hui peut être lu demain, et c'est l'inventaire qui doit être juste.
 *  2. **Les bancs lisent-ils toujours la même chose ?** Un banc qui se met à lire
 *     un type nouveau, ou qui cesse d'en lire un, doit faire relire le relevé —
 *     la liste est donc **fermée dans les deux sens**.
 *  3. **Lesquels sont lus sans être produits ?** Ce sont les branches que ce SQL
 *     n'exerce pas. Les nommer les fait exister, et la liste se **rétrécit**
 *     toute seule le jour où le SQL se met à produire l'un d'eux — ce qui est
 *     une bonne nouvelle, pas une alerte.
 *
 *  PORTÉE — CE QUE CE BANC NE COUVRE PAS
 *  -------------------------------------
 *  Le point 1 est **unidirectionnel** : une disparition fait tomber, une
 *  apparition non. Une addition est sans danger, et rendre la liste fermée dans
 *  les deux sens ferait échouer la construction à chaque migration introduisant
 *  un type de nœud nouveau — un coût réel pour aucun gain de sûreté.
 *
 *  Et il ne dit rien de la **sémantique** : que deux versions produisent les
 *  mêmes clés ne dit pas qu'elles leur donnent le même sens. La montée de 2026
 *  a été acceptée sur cette mesure-là, pas sur une preuve d'équivalence.
 *
 *  Un mot enfin sur les deux extractions, parce qu'elles sont de nature
 *  différente : la première **interroge** l'analyseur, elle ne peut pas se
 *  tromper sur la forme de ce qu'il rend ; la seconde **lit le texte** des bancs
 *  par motif, après retrait des commentaires, et c'est la seule des deux qui
 *  pourrait être fausse — d'où le soin mis à la rendre fermée.
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

import { loadModule, parseSync } from 'libpg-query';

const racine = fileURLToPath(new URL('../', import.meta.url));

/** D'où vient le relevé ci-dessous, et quand il a été fait. */
const SOURCE_DU_RELEVE =
  'libpg-query 18.1.4, arbre des deux fichiers SQL du projet, relevé le 2026-09-18';

/** Le SQL du projet, celui dont l'arbre est interrogé. */
const FICHIERS_SQL = ['supabase/migrations/20260916120000_init.sql', 'supabase/seed.sql'];

/** Les bancs qui lisent l'arbre : ce sont eux qui deviendraient aveugles. */
const BANCS_QUI_LISENT_L_ARBRE = ['scripts/check-schema-refs.test.mjs', 'scripts/check-sql.mjs'];

/**
 * Les types de nœud que le SQL du projet **produit**, relevés le 2026-09-18.
 *
 * Trente-sept, et non trente-six : `CreateEnumStmt` n'apparaît pas dans l'arbre
 * du fichier. PostgreSQL n'a pas de `create type if not exists`, donc la seule
 * forme rejouable est le bloc `do`, dont le corps est une **chaîne** pour
 * l'analyseur. Le type n'existe que dans l'arbre obtenu en **réanalysant** ce
 * corps — ce que fait `check-schema-refs`, et ce que ce banc refait ici, de son
 * côté, pour ne pas hériter d'un défaut de cet extracteur-là.
 */
const TYPES_PRODUITS = [
  'A_Const',
  'A_Expr',
  'AccessPriv',
  'AlterTableCmd',
  'AlterTableStmt',
  'BoolExpr',
  'Boolean',
  'ColumnDef',
  'ColumnRef',
  'CommentStmt',
  'Constraint',
  'CreateEnumStmt',
  'CreateFunctionStmt',
  'CreatePolicyStmt',
  'CreateStmt',
  'CreateTrigStmt',
  'DefElem',
  'DoStmt',
  'DropStmt',
  'FuncCall',
  'GrantStmt',
  'IndexElem',
  'IndexStmt',
  'InsertStmt',
  'List',
  'ObjectWithArgs',
  'RangeSubselect',
  'RangeVar',
  'ResTarget',
  'RoleSpec',
  'SQLValueFunction',
  'SelectStmt',
  'SortBy',
  'String',
  'SubLink',
  'TypeCast',
  'VariableSetStmt',
];

/**
 * Les types de nœud que les deux bancs **lisent**, relevés le 2026-09-18.
 *
 * Ce sont les accès en propriété dont le nom commence par une majuscule —
 * `stmt.CreateStmt`, `noeud.ColumnRef` —, les constantes du dépôt étant écartées
 * par leur forme (`SCHEMA`, `CIBLES_EXTERNES` sont en capitales d'un bout à
 * l'autre, un type de nœud jamais).
 *
 * `check-sql.mjs` n'en lit aucun : il valide la syntaxe et ne parcourt pas
 * l'arbre. Il figure pourtant dans la liste des fichiers interrogés, pour que le
 * jour où il se mettra à lire un nœud, cela se voie.
 */
const TYPES_LUS = [
  'AlterTableCmd',
  'AlterTableStmt',
  'Boolean',
  'ColumnDef',
  'ColumnRef',
  'Constraint',
  'CreateEnumStmt',
  'CreateFunctionStmt',
  'CreatePolicyStmt',
  'CreateStmt',
  'CreateTrigStmt',
  'DefElem',
  'DoStmt',
  'IndexElem',
  'InsertStmt',
  'JoinExpr',
  'List',
  'RangeSubselect',
  'RangeVar',
  'ResTarget',
  'SelectStmt',
  'String',
  'VariableSetStmt',
];

/**
 * Les types lus que le SQL **ne produit pas** — les branches que rien n'exerce.
 *
 * Un seul, et c'est mesuré : le SQL du projet ne contient **aucune jointure**.
 * `portee()` sait descendre dans un `JoinExpr`, mais rien ne l'y amène
 * aujourd'hui. Le nommer ici le fait exister ; la liste se rétrécira le jour où
 * une jointure entrera dans le schéma.
 *
 * Ces branches ne sont pas pour autant sans preuve : elles sont éprouvées par
 * les campagnes de mutation, qui ajoutent la jointure absente à une copie du
 * SQL. C'est la même distinction que partout ailleurs — une garde s'éprouve, et
 * une garde que rien n'exerce n'existe pas tant qu'on ne l'a pas éprouvée.
 */
const TYPES_LUS_SANS_ETRE_PRODUITS = ['JoinExpr'];

/** Retire commentaires de ligne et de bloc : un nom cité n'est pas un emploi. */
function sansCommentaires(source) {
  return source.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\/\/[^\n]*/g, ' ');
}

/**
 * Les types de nœud d'un arbre : une clé qui commence par une majuscule et dont
 * la valeur est un objet.
 *
 * `libpg-query` rend un nœud sous forme abrégée — un objet à **une seule clé**,
 * qui est le nom du type. Les autres clés d'un objet sont des champs, en
 * minuscules (`relname`, `sval`, `location`). La forme suffit donc à distinguer
 * un type d'un champ, sans liste de mots à tenir à jour.
 */
function typesDeLArbre(noeud, trouves = new Set()) {
  if (Array.isArray(noeud)) {
    for (const element of noeud) typesDeLArbre(element, trouves);
    return trouves;
  }
  if (noeud === null || typeof noeud !== 'object') return trouves;

  for (const [cle, valeur] of Object.entries(noeud)) {
    if (
      /^[A-Z]/.test(cle) &&
      valeur !== null &&
      typeof valeur === 'object' &&
      !Array.isArray(valeur)
    ) {
      trouves.add(cle);
    }
    typesDeLArbre(valeur, trouves);
  }
  return trouves;
}

/** Le corps d'un bloc `do $$ … $$`, que l'analyseur rend comme une chaîne. */
function corpsDeDo(bloc) {
  const corps = (bloc.args ?? [])
    .map((element) => element.DefElem)
    .find((option) => option?.defname === 'as');
  return typeof corps?.arg?.String?.sval === 'string' ? corps.arg.String.sval : null;
}

/**
 * Le SQL contenu dans un corps de bloc `do`.
 *
 * Le corps est du PL/pgSQL — `begin … exception … end` — et l'analyseur n'analyse
 * que du SQL. On retire l'enveloppe, comme PostgreSQL le fait lui-même en
 * confiant chaque instruction au moteur SQL.
 */
function instructionsDeDo(corps) {
  const lignes = corps.split('\n');
  const ouverture = lignes.findIndex((ligne) => ligne.trim() === 'begin');
  assert.notEqual(
    ouverture,
    -1,
    'un corps de bloc `do` sans `begin` : ce banc ne sait pas le découper',
  );
  const fermeture = lignes.findIndex(
    (ligne, rang) => rang > ouverture && ['exception', 'end'].includes(ligne.trim()),
  );
  assert.notEqual(
    fermeture,
    -1,
    'un corps de bloc `do` sans `end` ni `exception` : ce banc ne sait pas le découper',
  );
  return lignes.slice(ouverture + 1, fermeture).join('\n');
}

/** L'inventaire des types produits : l'arbre du fichier, et celui de chaque bloc `do`. */
function inventaireProduit() {
  const trouves = new Set();

  for (const relatif of FICHIERS_SQL) {
    const sql = readFileSync(join(racine, relatif), 'utf8');
    const arbre = parseSync(sql);
    typesDeLArbre(arbre, trouves);

    for (const { stmt } of arbre.stmts) {
      const bloc = stmt.DoStmt;
      if (bloc === undefined) continue;
      const corps = corpsDeDo(bloc);
      assert.notEqual(
        corps,
        null,
        `bloc \`do\` de ${relatif} dont le corps n'est pas une chaîne : ` +
          'ce banc ne saurait pas quels types il produit',
      );
      typesDeLArbre(parseSync(instructionsDeDo(corps)), trouves);
    }
  }

  return trouves;
}

/** Les types de nœud que les bancs lisent, extraits de leur source. */
function typesLus() {
  const trouves = new Set();

  for (const relatif of BANCS_QUI_LISENT_L_ARBRE) {
    const source = sansCommentaires(readFileSync(join(racine, relatif), 'utf8'));
    for (const [, nom] of source.matchAll(/\.([A-Z][A-Za-z0-9_]*)\b/g)) {
      // Une constante du dépôt s'écrit en capitales d'un bout à l'autre ; un
      // type de nœud, jamais. C'est le seul discriminant, et il suffit.
      if (/^[A-Z0-9_]+$/.test(nom)) continue;
      trouves.add(nom);
    }
  }

  return trouves;
}

const trie = (ensemble) => [...ensemble].sort();

await loadModule();

test('l’analyseur produit toujours les types de nœud du relevé', () => {
  const vivants = inventaireProduit();
  const disparus = TYPES_PRODUITS.filter((type) => !vivants.has(type));

  assert.deepEqual(
    disparus,
    [],
    `${SOURCE_DU_RELEVE}\n` +
      'Ces types de nœud ne sont plus produits par l’arbre. Deux causes, et une\n' +
      'seule est rassurante :\n' +
      '  — **l’analyseur les a renommés.** Alors `check-schema-refs` et\n' +
      '    `check-sql` lisent des clés qui n’existent plus : ils deviennent\n' +
      '    aveugles en restant verts, et tout ce qu’ils prétendaient vérifier\n' +
      '    cesse de l’être sans le dire. C’est la raison d’être de ce banc.\n' +
      '  — **le SQL n’en produit plus.** Une migration a retiré la construction\n' +
      '    correspondante : le relevé est simplement périmé, et il faut le\n' +
      '    réécrire.\n' +
      `Disparus : ${disparus.join(', ')}`,
  );
});

test('les bancs ne lisent que les types de nœud du relevé', () => {
  const vivants = trie(typesLus());

  assert.deepEqual(
    vivants,
    trie(TYPES_LUS),
    `${SOURCE_DU_RELEVE}\n` +
      'Ce que les bancs lisent de l’arbre a changé. Ce n’est pas une faute en soi —\n' +
      'mais la liste est fermée dans les deux sens pour qu’une lecture nouvelle ne\n' +
      'puisse pas s’installer sans que le relevé soit relu. Un type lu mais jamais\n' +
      'produit est une branche que rien n’exerce : c’est le troisième cas de ce\n' +
      'fichier, qui doit être mis à jour dans le même mouvement.',
  );
});

test('un seul type est lu sans être produit par le SQL, et il est nommé', () => {
  const vivants = inventaireProduit();
  const orphelins = trie(typesLus()).filter((type) => !vivants.has(type));

  assert.deepEqual(
    orphelins,
    trie(TYPES_LUS_SANS_ETRE_PRODUITS),
    `${SOURCE_DU_RELEVE}\n` +
      'La liste des types lus que le SQL ne produit pas a changé. Deux sens, deux\n' +
      'lectures :\n' +
      '  — **un type de plus.** Un banc lit une clé que ce SQL ne produit jamais :\n' +
      '    la branche est morte pour ce schéma, et il faut soit l’exercer, soit la\n' +
      '    nommer ici.\n' +
      '  — **un type de moins.** Le SQL produit désormais ce type : une branche\n' +
      '    jusqu’ici inerte est devenue vivante. C’est une bonne nouvelle, et la\n' +
      '    liste doit rétrécir.',
  );
});
