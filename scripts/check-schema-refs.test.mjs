/**
 * Vérifie que les renvois internes du schéma SQL aboutissent.
 *
 * Une seule idée, trois familles : **un nom cité doit exister**.
 *
 *   1. les **renvois structurels** — une clé étrangère vise une table et une
 *      colonne déclarées, un type énuméré cité est déclaré ;
 *   2. les **colonnes citées par une requête** — dans une politique, un
 *      déclencheur, une insertion de `seed.sql`, ou le corps d'une fonction
 *      écrite en SQL. Chaque référence se résout dans la portée où elle est
 *      écrite, ou dans une portée qui l'englobe ;
 *   3. les **options des fonctions** — toute fonction `security definer` fixe son
 *      `search_path`.
 *
 * POURQUOI CE FICHIER
 * -------------------
 * C'est le seul angle mort qui restait sur le schéma. Les trois contrôles
 * existants le lisent déjà, mais aucun ne regarde les **renvois** :
 *
 *   - `npm run sql:check` fait analyser le fichier par le véritable analyseur
 *     PostgreSQL — il valide la **syntaxe**, et `author_di = auth.uid()` est une
 *     syntaxe parfaitement valide ;
 *   - `check-rls-guards` lit la **structure** des politiques — quels rôles, quels
 *     ordres, quelles tables sont protégées — sans se demander si les colonnes
 *     qu'elles nomment existent ;
 *   - `check-schema-types` compare le schéma à son miroir TypeScript, colonne par
 *     colonne, mais il part des colonnes **déclarées**, jamais de celles
 *     **citées**.
 *
 * Une faute de frappe est donc muette jusqu'au `db push` — c'est-à-dire au pire
 * moment, celui que `sql:check` a été écrit pour éviter. Et le défaut est
 * asymétrique, ce qui le rend plus grave qu'une faute de syntaxe : une politique
 * qui ne se crée pas **arrête** le déploiement, mais une politique qui se crée en
 * visant la mauvaise colonne laisse la table ouverte sans rien dire.
 *
 * POURQUOI PARCOURIR L'ARBRE, ET NON CHERCHER DES MOTIFS
 * -----------------------------------------------------
 * Un relevé par expression régulière aurait été plus court, et il aurait fallu
 * lui fournir la liste des mots à ignorer : `select`, `using`, `auth`, `uid`,
 * `now`, `char_length`… Cette liste est une source de faux positifs — un banc qui
 * tombe sur du schéma juste est un défaut du banc — et elle s'allonge à chaque
 * fonction ajoutée. L'analyseur rend un **arbre** : un `ColumnRef` y est un
 * `ColumnRef`, jamais un mot qui ressemble à une colonne. La liste de mots
 * disparaît, et avec elle sa maintenance.
 *
 * POURQUOI UNE RÉSOLUTION DE PORTÉE, ET NON UNE TABLE PAR DÉFAUT
 * -------------------------------------------------------------
 * Une colonne non qualifiée appartient à la table de la requête qui l'écrit —
 * sauf si elle est écrite dans une sous-requête, où elle appartient à la table
 * **interne** si celle-ci la porte, et à la table **externe** sinon. PostgreSQL
 * résout de l'intérieur vers l'extérieur, et c'est ce que fait `resoudre`.
 * Attribuer toute colonne non qualifiée à la table de la politique aurait rendu
 * le contrôle faux dès la première sous-requête portant un `from` — et il y en a
 * dix dans ce schéma.
 *
 * CE QUE CE CONTRÔLE NE PEUT PAS VOIR
 * -----------------------------------
 * - **Le corps des fonctions PL/pgSQL.** Quatre des cinq fonctions du schéma sont
 *   en PL/pgSQL : leur corps est du **texte**, non analysable comme du SQL
 *   (`begin`, `if`, `raise exception`). Seule `is_admin`, écrite en `language
 *   sql`, est lue — et c'est la seule dont le corps est une requête.
 * - **Un `alter table` qui renomme ou supprime une colonne.** Le contrôle suit
 *   `enable row level security` et `add column` ; les autres formes sont
 *   **refusées** par le dernier test, pour que la question se pose au lieu d'être
 *   tranchée à tort.
 * - **Ce qui n'est ni une migration ni `seed.sql`** : un fichier SQL ajouté
 *   ailleurs ne serait pas lu.
 */

import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { parse } from 'libpg-query';

const RACINE = fileURLToPath(new URL('../', import.meta.url));
const MIGRATIONS = join(RACINE, 'supabase/migrations');
const SEED = join(RACINE, 'supabase/seed.sql');

/** Les six tables que le schéma doit déclarer. */
const TABLES_ATTENDUES = [
  'profiles',
  'annonces',
  'cantine_menus',
  'cantine_reservations',
  'signalements',
  'discussion_messages',
];

/**
 * Les seules cibles **hors du schéma `public`** que le schéma a le droit de
 * citer. `auth.users` appartient à Supabase : sa table n'est pas dans nos
 * migrations, et un contrôle qui l'exigerait tomberait sur du schéma juste.
 *
 * L'ensemble est **fermé** et tenu par un test : citer une table d'un autre
 * schéma est une décision, et elle doit être écrite ici plutôt que découverte
 * par un faux positif.
 */
const CIBLES_EXTERNES = new Set(['auth.users']);

/**
 * Le seul **genre** d'objet que le schéma a le droit de poser sur une table qui
 * n'est pas la sienne : un déclencheur. `on_auth_user_created` doit se poser sur
 * `auth.users` — c'est la seule façon de créer une ligne de `profiles` à
 * l'inscription.
 *
 * Une **politique** sur une table externe n'a pas de raison d'être, et elle
 * serait le pire cas de ce fichier : une politique posée là passerait sans être
 * vérifiée, et `CIBLES_EXTERNES` ne le verrait pas, puisque la cible y est déjà
 * nommée. Mesuré : sans cette règle, déplacer une politique sur `auth.users` ne
 * faisait tomber **aucun** test.
 */
const GENRES_EXTERNES_AUTORISES = new Set(['déclencheur']);

/** Le schéma dont ce dépôt est responsable. */
const SCHEMA_PUBLIC = 'public';

/** Les formes d'`alter table` que ce contrôle sait suivre. */
const FORMES_SUIVIES = new Set(['AT_EnableRowSecurity', 'AT_AddColumn']);

/** Le dernier segment d'un nom qualifié (`public.member_role` → `member_role`). */
function dernierSegment(noeuds) {
  return noeuds[noeuds.length - 1].String.sval;
}

/** Les options d'une fonction, par nom (`security`, `set`, `language`…). */
function optionsDe(fonction) {
  const options = new Map();
  for (const option of fonction.options ?? []) {
    options.set(option.DefElem.defname, option.DefElem.arg);
  }
  return options;
}

/** Le corps d'une fonction, quand l'analyseur en rend le texte. */
function corpsDe(fonction) {
  const corps = optionsDe(fonction).get('as');
  const premier = corps?.List?.items?.[0]?.String?.sval;
  return typeof premier === 'string' ? premier : null;
}

/**
 * Le nom du type énuméré que porte une colonne, ou `null` si le type n'est pas
 * de ceux que ce dépôt déclare.
 *
 * **Deux segments ne suffisent pas à dire « énuméré ».** L'analyseur
 * *qualifie* les types du langage, et il le fait de façon non uniforme :
 * mesuré, `boolean` arrive en `pg_catalog.bool`, `character varying` en
 * `pg_catalog.varchar`, `numeric` en `pg_catalog.numeric`, `double precision`
 * en `pg_catalog.float8` — mais `jsonb`, `uuid`, `text` et `date` restent d'un
 * seul segment. Compter les segments ferait donc tomber ce contrôle sur du
 * schéma juste dès la première colonne `boolean`, `numeric` ou `varchar` — et
 * le schéma n'en a aucune aujourd'hui, ce qui rendait le défaut invisible.
 *
 * Le seul type que ce fichier ait à exiger est celui que le schéma écrit
 * lui-même : `public.<nom>`. Un type non qualifié est un type du langage, et
 * un type qualifié par `pg_catalog` en est un aussi.
 */
function enumereDe(colonne) {
  const type = colonne.type;
  if (type.length < 2) {
    return null;
  }
  return type[type.length - 2] === SCHEMA_PUBLIC ? type[type.length - 1] : null;
}

/** Les colonnes d'une contrainte `references`, où qu'elle soit écrite. */
function cleEtrangere(table, contrainte) {
  const cible = contrainte.pktable;
  if (cible === undefined) {
    return null;
  }
  return {
    table,
    vise: cible.relname,
    viseSchema: cible.schemaname,
    viseColonnes: (contrainte.pk_attrs ?? []).map((attribut) => attribut.String.sval),
  };
}

/**
 * Le schéma entier, lu dans l'arbre syntaxique des migrations.
 *
 * Toutes les migrations sont lues, dans l'ordre des noms : un contrôle qui n'en
 * lirait qu'une deviendrait faux le jour où la seconde arrive, sans le dire.
 */
async function lireLeSchema() {
  const fichiers = readdirSync(MIGRATIONS)
    .filter((nom) => nom.endsWith('.sql'))
    .sort();
  assert.ok(fichiers.length > 0, 'aucune migration à lire sous `supabase/migrations/`');

  const tables = new Map();
  const enums = new Set();
  const politiques = [];
  const declencheurs = [];
  const fonctions = [];
  const cles = [];
  const formes = [];

  for (const fichier of fichiers) {
    const arbre = await parse(readFileSync(join(MIGRATIONS, fichier), 'utf8'));

    for (const { stmt } of arbre.stmts) {
      const table = stmt.CreateStmt;
      if (table !== undefined) {
        const colonnes = [];
        for (const element of table.tableElts) {
          const definition = element.ColumnDef;
          if (definition !== undefined) {
            colonnes.push({
              nom: definition.colname,
              type: definition.typeName.names.map((partie) => partie.String.sval),
            });
            for (const contrainte of definition.constraints ?? []) {
              const cle = cleEtrangere(table.relation.relname, contrainte.Constraint);
              if (cle !== null) {
                cles.push({ ...cle, colonne: definition.colname });
              }
            }
            continue;
          }

          const contrainte = element.Constraint;
          if (contrainte !== undefined && contrainte.pktable !== undefined) {
            // Clé étrangère écrite au niveau de la table : `foreign key (a) references …`.
            const cle = cleEtrangere(table.relation.relname, contrainte);
            const locale = (contrainte.fk_attrs ?? []).map((a) => a.String.sval).join(', ');
            cles.push({ ...cle, colonne: locale });
          }
        }
        tables.set(table.relation.relname, colonnes);
        continue;
      }

      const enumeration = stmt.CreateEnumStmt;
      if (enumeration !== undefined) {
        enums.add(dernierSegment(enumeration.typeName));
        continue;
      }

      const politique = stmt.CreatePolicyStmt;
      if (politique !== undefined) {
        politiques.push({
          nom: politique.policy_name,
          genre: 'politique',
          table: politique.table.relname,
          schema: politique.table.schemaname,
          expressions: [politique.qual, politique.with_check].filter((e) => e !== undefined),
        });
        continue;
      }

      const declencheur = stmt.CreateTrigStmt;
      if (declencheur !== undefined) {
        declencheurs.push({
          nom: declencheur.trigname,
          genre: 'déclencheur',
          table: declencheur.relation.relname,
          schema: declencheur.relation.schemaname,
          expressions: [declencheur.whenClause].filter((e) => e !== undefined),
        });
        continue;
      }

      const fonction = stmt.CreateFunctionStmt;
      if (fonction !== undefined) {
        const options = optionsDe(fonction);
        fonctions.push({
          nom: fonction.funcname.map((partie) => partie.String.sval).join('.'),
          definer: options.get('security')?.Boolean?.boolval === true,
          langue: options.get('language')?.String?.sval ?? null,
          fixeSearchPath: options.get('set')?.VariableSetStmt?.name === 'search_path',
          corps: corpsDe(fonction),
        });
        continue;
      }

      const modification = stmt.AlterTableStmt;
      if (modification !== undefined) {
        for (const commande of modification.cmds) {
          const ajout = commande.AlterTableCmd;
          formes.push(ajout.subtype);
          if (ajout.subtype !== 'AT_AddColumn') {
            continue;
          }
          const definition = ajout.def?.ColumnDef;
          if (definition === undefined) {
            continue;
          }
          const tableVisee = tables.get(modification.relation.relname);
          assert.ok(
            tableVisee !== undefined,
            `\`alter table\` ajoute une colonne à une table non déclarée : ${modification.relation.relname}`,
          );
          tableVisee.push({
            nom: definition.colname,
            type: definition.typeName.names.map((partie) => partie.String.sval),
          });
        }
      }
    }
  }

  return { tables, enums, politiques, declencheurs, fonctions, cles, formes };
}

const SCHEMA = await lireLeSchema();

/**
 * Les entrées de portée d'une requête : ce que son `from` met à disposition.
 *
 * Une entrée porte soit une table du schéma (`table`), soit des colonnes connues
 * (`colonnes`) pour une sous-requête nommée, soit **rien de connu** — c'est le
 * cas d'une table externe comme `auth.users`, dont les colonnes ne sont pas dans
 * nos migrations : accepter tout est alors la seule réponse honnête.
 */
function portee(select) {
  const entrees = [];

  for (const element of select.fromClause ?? []) {
    const variable = element.RangeVar;
    if (variable !== undefined) {
      entrees.push({
        nom: variable.alias?.aliasname ?? variable.relname,
        schema: variable.schemaname ?? SCHEMA_PUBLIC,
        table: variable.relname,
      });
      continue;
    }

    const sous = element.RangeSubselect;
    if (sous !== undefined) {
      const nommees = (sous.alias?.colnames ?? []).map((colonne) => colonne.String.sval);
      const cibles = (sous.subquery.SelectStmt?.targetList ?? [])
        .map((cible) => cible.ResTarget.name)
        .filter((nom) => typeof nom === 'string');
      entrees.push({
        nom: sous.alias?.aliasname ?? '?',
        colonnes: nommees.length > 0 ? nommees : cibles,
        sousRequete: sous.subquery.SelectStmt,
      });
      continue;
    }

    const jointure = element.JoinExpr;
    if (jointure !== undefined) {
      entrees.push(...portee({ fromClause: [jointure.larg, jointure.rarg] }));
    }
  }

  return entrees;
}

/** Les colonnes qu'une entrée de portée porte, ou `null` si elles sont inconnues. */
function colonnesDe(entree) {
  if (entree.colonnes !== undefined) {
    return entree.colonnes;
  }
  if (entree.schema !== SCHEMA_PUBLIC) {
    return null;
  }
  const table = SCHEMA.tables.get(entree.table);
  return table === undefined ? null : table.map((colonne) => colonne.nom);
}

/**
 * Résout une référence de colonne dans une pile de portées, de la plus interne à
 * la plus externe — l'ordre dans lequel PostgreSQL résout.
 *
 * Rend `null` si elle se résout, sinon la raison de l'échec.
 */
function resoudre(segments, portees) {
  if (segments.length === 1) {
    const [colonne] = segments;
    for (const entrees of portees) {
      for (const entree of entrees) {
        const colonnes = colonnesDe(entree);
        if (colonnes === null || colonnes.includes(colonne)) {
          return null;
        }
      }
    }
    return `aucune table de la portée ne porte « ${colonne} »`;
  }

  const [nom, colonne] = segments.slice(-2);
  for (const entrees of portees) {
    const entree = entrees.find((candidate) => candidate.nom === nom);
    if (entree === undefined) {
      continue;
    }
    const colonnes = colonnesDe(entree);
    if (colonnes === null || colonnes.includes(colonne)) {
      return null;
    }
    return `« ${nom} » porte sur ${entree.table ?? 'une sous-requête'}, qui n'a pas de « ${colonne} »`;
  }
  return `« ${nom} » n'est ni une table ni un alias de la portée`;
}

/**
 * Parcourt un nœud et relève ses références de colonne.
 *
 * `rapport` porte deux listes : **toutes** les références lues, et celles qui ne
 * se résolvent pas. La première sert à mesurer que le parcours descend vraiment —
 * sans elle, un contrôle qui ne lirait rien serait vert.
 *
 * La portée est empilée en entrant dans un `SelectStmt`, et la résolution remonte
 * la pile : c'est ce qui permet de suivre une sous-requête, et de couvrir une
 * référence **corrélée** — une colonne de la requête externe citée dans la
 * requête interne — sans la signaler à tort.
 */
function lireRequete(noeud, portees, contexte, rapport) {
  if (Array.isArray(noeud)) {
    for (const element of noeud) {
      lireRequete(element, portees, contexte, rapport);
    }
    return;
  }
  if (noeud === null || typeof noeud !== 'object') {
    return;
  }

  const select = noeud.SelectStmt;
  if (select !== undefined) {
    const entrees = portee(select);
    const pile = [entrees, ...portees];

    // Une sous-requête du `from` voit la portée qu'elle vient d'ouvrir, plus les
    // portées englobantes — PostgreSQL autorise la seconde même sans `lateral`,
    // et l'accepter ne peut que manquer une erreur, jamais en inventer une.
    for (const entree of entrees) {
      if (entree.sousRequete !== undefined) {
        lireRequete(entree.sousRequete, pile, contexte, rapport);
      }
    }

    for (const [cle, valeur] of Object.entries(select)) {
      if (cle === 'fromClause') {
        continue;
      }
      lireRequete(valeur, pile, contexte, rapport);
    }
    return;
  }

  const reference = noeud.ColumnRef;
  if (reference !== undefined) {
    const segments = reference.fields.map((champ) =>
      champ.String !== undefined ? champ.String.sval : '*',
    );
    if (segments.includes('*')) {
      return;
    }
    rapport.references.push(segments.join('.'));
    const echec = resoudre(segments, portees);
    if (echec !== null) {
      rapport.fautives.push(`${contexte} : ${segments.join('.')} — ${echec}`);
    }
    return;
  }

  for (const valeur of Object.values(noeud)) {
    lireRequete(valeur, portees, contexte, rapport);
  }
}

/** Un rapport vide, pour une lecture. */
function nouveauRapport() {
  return { references: [], fautives: [] };
}

/** La portée d'une politique ou d'un déclencheur : sa propre table. */
function porteeDeLObjet(objet) {
  return [[{ nom: objet.table, schema: objet.schema, table: objet.table }]];
}

/** Les objets porteurs d'expressions : politiques et déclencheurs. */
function objetsAExpressions() {
  return [...SCHEMA.politiques, ...SCHEMA.declencheurs];
}

/** Lit toutes les expressions des politiques et déclencheurs. */
function lireLesExpressions() {
  const rapport = nouveauRapport();
  for (const objet of objetsAExpressions()) {
    for (const expression of objet.expressions) {
      lireRequete(expression, porteeDeLObjet(objet), objet.nom, rapport);
    }
  }
  return rapport;
}

test('le schéma se lit, et les six tables attendues y sont', () => {
  // Mesure de la prémisse : un contrôle qui lit un arbre peut être vert en
  // n'ayant rien lu. Les planchers portent sur ce que le schéma contient
  // aujourd'hui, et sur les noms — pas sur des nombres, qui bougeraient à chaque
  // colonne ajoutée.
  for (const nom of TABLES_ATTENDUES) {
    assert.ok(SCHEMA.tables.has(nom), `table absente de la lecture : ${nom}`);
    assert.ok(SCHEMA.tables.get(nom).length > 0, `table lue sans aucune colonne : ${nom}`);
  }

  assert.ok(SCHEMA.enums.size >= 3, `types énumérés lus : ${SCHEMA.enums.size}`);
  assert.ok(SCHEMA.politiques.length >= 19, `politiques lues : ${SCHEMA.politiques.length}`);
  assert.ok(SCHEMA.fonctions.length >= 5, `fonctions lues : ${SCHEMA.fonctions.length}`);
  assert.ok(SCHEMA.cles.length >= 4, `clés étrangères lues : ${SCHEMA.cles.length}`);

  // Le plancher qui compte le plus : la plupart des politiques ne nomment
  // **aucune** colonne — elles se contentent de `to authenticated`. Si le
  // parcours cessait de descendre dans les expressions, le test des colonnes
  // citées serait vert en ne lisant rien du tout. Mesuré : douze références.
  const lues = lireLesExpressions().references.length;
  assert.ok(lues >= 10, `références de colonne lues dans les politiques : ${lues}`);
});

test('chaque clé étrangère vise une table déclarée, et une colonne qui existe', () => {
  const fautives = [];

  for (const cle of SCHEMA.cles) {
    if (cle.viseSchema !== SCHEMA_PUBLIC) {
      // `auth.users` : hors de nos migrations, et tenu par un test dédié.
      continue;
    }

    const visee = SCHEMA.tables.get(cle.vise);
    if (visee === undefined) {
      fautives.push(`${cle.table}.${cle.colonne} → table inconnue « ${cle.vise} »`);
      continue;
    }
    const colonnes = visee.map((colonne) => colonne.nom);
    for (const colonne of cle.viseColonnes) {
      if (!colonnes.includes(colonne)) {
        fautives.push(`${cle.table}.${cle.colonne} → ${cle.vise}.${colonne} n'existe pas`);
      }
    }
  }

  assert.deepEqual(
    fautives,
    [],
    `clés étrangères qui ne mènent nulle part :\n${fautives.join('\n')}`,
  );
});

test('chaque type énuméré cité par une colonne est déclaré', () => {
  const fautifs = [];
  let vus = 0;

  for (const [table, colonnes] of SCHEMA.tables) {
    for (const colonne of colonnes) {
      const nom = enumereDe(colonne);
      if (nom === null) {
        // Type du langage (`uuid`, `text`, `timestamptz`, `pg_catalog.bool`…) :
        // rien à déclarer dans ce dépôt.
        continue;
      }
      vus += 1;
      if (!SCHEMA.enums.has(nom)) {
        fautifs.push(`${table}.${colonne.nom} → type « ${nom} » non déclaré`);
      }
    }
  }

  // Une colonne peut être déclarée `public.<table>`, un type composite : ce
  // n'est pas un énuméré, et le compter ici le ferait passer pour tel. Mesure
  // de la prémisse : sans plancher, une lecture qui ne verrait plus aucun type
  // qualifié serait verte.
  assert.ok(vus >= 3, `colonnes à type qualifié par le schéma : ${vus}`);
  assert.deepEqual(fautifs, [], `colonnes au type inconnu :\n${fautifs.join('\n')}`);
});

test('chaque colonne citée par une politique ou un déclencheur se résout', () => {
  for (const objet of objetsAExpressions()) {
    if (objet.schema !== SCHEMA_PUBLIC) {
      // Le déclencheur posé sur `auth.users` n'est pas de notre schéma : ses
      // colonnes ne sont pas dans nos migrations. Un test dédié tient la liste.
      continue;
    }
    assert.ok(
      SCHEMA.tables.has(objet.table),
      `${objet.nom} porte sur une table non déclarée : ${objet.table}`,
    );
  }

  const { fautives } = lireLesExpressions();
  assert.deepEqual(fautives, [], `références qui ne se résolvent pas :\n${fautives.join('\n')}`);
});

test('chaque insertion de `seed.sql` nomme des colonnes qui existent', async () => {
  const arbre = await parse(readFileSync(SEED, 'utf8'));
  const fautives = [];
  let insertions = 0;

  for (const { stmt } of arbre.stmts) {
    const insertion = stmt.InsertStmt;
    if (insertion === undefined) {
      continue;
    }
    insertions += 1;

    const table = SCHEMA.tables.get(insertion.relation.relname);
    assert.ok(
      table !== undefined,
      `\`seed.sql\` insère dans une table non déclarée : ${insertion.relation.relname}`,
    );
    const colonnes = table.map((colonne) => colonne.nom);

    for (const cible of insertion.cols ?? []) {
      if (!colonnes.includes(cible.ResTarget.name)) {
        fautives.push(
          `insertion dans ${insertion.relation.relname} : colonne « ${cible.ResTarget.name} » inconnue`,
        );
      }
    }

    // `on conflict (service_date)` désigne une colonne de la même table, et
    // échouerait aussi à l'exécution si elle n'existait pas.
    for (const element of insertion.onConflictClause?.infer?.indexElems ?? []) {
      if (!colonnes.includes(element.IndexElem.name)) {
        fautives.push(
          `\`on conflict\` sur ${insertion.relation.relname} : colonne « ${element.IndexElem.name} » inconnue`,
        );
      }
    }
  }

  assert.ok(insertions >= 3, `insertions lues dans \`seed.sql\` : ${insertions}`);
  assert.deepEqual(
    fautives,
    [],
    `\`seed.sql\` cite des colonnes inconnues :\n${fautives.join('\n')}`,
  );
});

test('chaque colonne lue par `seed.sql` se résout dans sa portée', async () => {
  const arbre = await parse(readFileSync(SEED, 'utf8'));
  const rapport = nouveauRapport();
  let insertions = 0;

  for (const { stmt } of arbre.stmts) {
    if (stmt.InsertStmt === undefined) {
      continue;
    }
    insertions += 1;
    lireRequete(stmt.InsertStmt, [], 'seed.sql', rapport);
  }

  // Les insertions de `seed.sql` lisent leurs colonnes par **alias** :
  // `v.title`, `p.created_at`. C'est ce qui rend ce test utile — et ce qui le
  // rendrait faux si la résolution de portée cessait de fonctionner. Le plancher
  // mesure qu'il y a bien des références à résoudre.
  assert.ok(insertions >= 3, `insertions lues : ${insertions}`);
  assert.ok(
    rapport.references.length >= 4,
    `références lues dans \`seed.sql\` : ${rapport.references.length}`,
  );
  assert.deepEqual(
    rapport.fautives,
    [],
    `\`seed.sql\` cite des colonnes inconnues :\n${rapport.fautives.join('\n')}`,
  );
});

test('chaque fonction `security definer` fixe son `search_path`', () => {
  // Le piège classique de `security definer` : la fonction s'exécute avec les
  // droits de son propriétaire, et résout ses noms dans le `search_path` de
  // l'**appelant**. Un schéma placé plus haut détourne alors une table ou une
  // fonction. `set search_path = ''` ferme la porte, et oblige à qualifier.
  //
  // Rien ne tenait cette propriété : elle est aujourd'hui respectée par les
  // quatre fonctions concernées, et une sixième fonction ajoutée sans la clause
  // passerait sans bruit — c'est exactement le genre de défaut que ce fichier
  // existe pour rendre bruyant.
  const definers = SCHEMA.fonctions.filter((fonction) => fonction.definer);
  assert.ok(definers.length >= 4, `fonctions \`security definer\` lues : ${definers.length}`);

  const sansSearchPath = definers
    .filter((fonction) => !fonction.fixeSearchPath)
    .map((fonction) => fonction.nom);

  assert.deepEqual(
    sansSearchPath,
    [],
    `\`security definer\` sans \`set search_path\` : ${sansSearchPath.join(', ')}`,
  );
});

test('le corps des fonctions écrites en SQL se résout', async () => {
  // Une fonction `language sql` porte une **requête** : elle passe donc par le
  // même parcours que le reste. Les autres sont en PL/pgSQL, dont le corps est du
  // texte (`begin`, `if`, `raise exception`) que cet analyseur ne lit pas — le
  // test les **nomme**, plutôt que de laisser croire qu'elles sont couvertes.
  const enSql = SCHEMA.fonctions.filter((fonction) => fonction.langue === 'sql');
  const enPlpgsql = SCHEMA.fonctions.filter((fonction) => fonction.langue === 'plpgsql');

  assert.ok(enSql.length >= 1, `fonctions \`language sql\` lues : ${enSql.length}`);
  assert.ok(
    enPlpgsql.length >= 1,
    'aucune fonction PL/pgSQL : la limite annoncée dans l’en-tête n’a plus lieu d’être',
  );

  const rapport = nouveauRapport();
  for (const fonction of enSql) {
    assert.ok(fonction.corps !== null, `corps illisible : ${fonction.nom}`);
    const arbre = await parse(fonction.corps);
    lireRequete(arbre, [], fonction.nom, rapport);
  }

  assert.ok(
    rapport.references.length >= 2,
    `références lues dans les corps : ${rapport.references.length}`,
  );
  assert.deepEqual(
    rapport.fautives,
    [],
    `corps de fonction qui ne se résout pas :\n${rapport.fautives.join('\n')}`,
  );
});

test('les renvois hors du schéma `public` sont exactement ceux qui sont nommés', () => {
  // Sans ce test, les tests précédents seraient verts **en ne mesurant rien** sur
  // tout ce qui sort de `public` : ils sautent ces lignes. Une table d'un autre
  // schéma ajoutée plus tard passerait donc sans que personne ne le décide.
  const citees = new Set();

  for (const cle of SCHEMA.cles) {
    if (cle.viseSchema !== SCHEMA_PUBLIC) {
      citees.add(`${cle.viseSchema}.${cle.vise}`);
    }
  }
  for (const objet of objetsAExpressions()) {
    if (objet.schema !== SCHEMA_PUBLIC) {
      citees.add(`${objet.schema}.${objet.table}`);
    }
  }

  assert.deepEqual(
    [...citees].sort(),
    [...CIBLES_EXTERNES].sort(),
    'cible hors de `public` citée par le schéma, et non nommée dans `CIBLES_EXTERNES`',
  );

  // La cible est nommée, mais cela ne dit pas **quoi** on y pose. Le test des
  // colonnes citées saute les objets hors de `public` : une politique posée là
  // passerait donc sans être vérifiée, alors que `auth.users` est déjà dans
  // l'ensemble ci-dessus. Le genre, lui, se voit.
  const genres = objetsAExpressions()
    .filter((objet) => objet.schema !== SCHEMA_PUBLIC)
    .map((objet) => objet.genre);
  const interdits = genres.filter((genre) => !GENRES_EXTERNES_AUTORISES.has(genre));

  assert.deepEqual(
    interdits,
    [],
    `objet posé sur une table externe, et que le contrôle ne sait pas vérifier : ${interdits.join(', ')}`,
  );
  assert.ok(genres.length > 0, 'aucun objet externe lu — ce contrôle ne mesure rien');
});

test('les `alter table` des migrations n’emploient que des formes suivies', () => {
  // Le contrôle suit `enable row level security` et `add column`, lues dans
  // l'arbre comme le reste. Une migration future qui **renommerait** ou
  // **supprimerait** une colonne rendrait la carte des colonnes fausse sans que
  // rien ne le dise : la question doit se poser ici, pas être tranchée à tort.
  const inconnues = [...new Set(SCHEMA.formes)].filter((forme) => !FORMES_SUIVIES.has(forme));

  assert.deepEqual(
    inconnues,
    [],
    `forme d'\`alter table\` que la carte des colonnes ne suit pas : ${inconnues.join(', ')}`,
  );
  assert.ok(
    SCHEMA.formes.length > 0,
    'aucune instruction `alter table` lue — le contrôle ne mesure rien',
  );
});
