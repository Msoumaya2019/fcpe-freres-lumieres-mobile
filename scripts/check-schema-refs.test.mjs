/**
 * Vérifie que les renvois internes du schéma SQL aboutissent : qu'une clé
 * étrangère vise une table et une colonne qui existent, qu'un type énuméré cité
 * soit déclaré, et qu'une colonne citée par une politique ou un déclencheur
 * appartienne bien à sa table.
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
 * Une faute de frappe dans une politique est donc muette jusqu'au `db push` —
 * c'est-à-dire au pire moment, celui que `sql:check` a été écrit pour éviter. Et
 * le défaut est asymétrique, ce qui le rend plus grave qu'une faute de syntaxe :
 * une politique qui ne se crée pas **arrête** le déploiement, mais une politique
 * qui se crée en visant la mauvaise colonne laisse la table ouverte sans rien
 * dire.
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
 * CE QUE CE CONTRÔLE NE PEUT PAS VOIR
 * -----------------------------------
 * - **Le corps des fonctions.** `CreateFunctionStmt` porte son corps en texte :
 *   une fonction PL/pgSQL qui cite une colonne inexistante passe ici. Les cinq
 *   fonctions du schéma — mesuré — ne sont donc pas couvertes.
 * - **Le contenu de `supabase/seed.sql`**, qui n'est pas une migration et n'est
 *   pas lu par ce fichier.
 * - **Une sous-requête qui porte un `from`.** `(select auth.uid())` — l'écriture
 *   recommandée par Supabase, et celle des dix politiques de ce schéma — ne
 *   change pas la portée et est suivie. Une sous-requête qui introduit une
 *   seconde table demanderait de reproduire la résolution de portée de
 *   PostgreSQL : un nom non qualifié y désigne la table interne si elle le
 *   porte, l'externe sinon. Le contrôle **refuse** cette forme au lieu de
 *   deviner, et un test dédié le dit.
 * - **Ce qui n'est pas dans une migration** : un `alter table` d'une migration
 *   future qui **renomme** ou **supprime** une colonne n'est pas suivi. Le
 *   dernier test refuse les formes qu'il ne sait pas lire, pour que la question
 *   se pose au lieu d'être tranchée à tort.
 */

import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { parse } from 'libpg-query';

const RACINE = fileURLToPath(new URL('../', import.meta.url));
const MIGRATIONS = join(RACINE, 'supabase/migrations');

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
 * serait le pire cas de ce fichier : le test des colonnes citées saute les
 * objets hors de `public`, donc une politique posée là passerait sans être
 * vérifiée — et `CIBLES_EXTERNES` ne le verrait pas, puisque la cible y est déjà
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

/** Les colonnes d'une contrainte `references`, où qu'elle soit écrite. */
function cleEtrangere(table, contrainte) {
  const cible = contrainte.pktable;
  if (cible === undefined) {
    return null;
  }
  const colonnes = (contrainte.pk_attrs ?? []).map((attribut) => attribut.String.sval);
  return {
    table,
    vise: cible.relname,
    viseSchema: cible.schemaname,
    viseColonnes: colonnes,
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

  return { tables, enums, politiques, declencheurs, cles, formes };
}

/**
 * Les colonnes citées par une expression, avec la table qu'elles désignent.
 *
 * Les sous-requêtes **sans `from`** sont suivies : `(select auth.uid())` est
 * l'écriture recommandée par Supabase pour n'évaluer `auth.uid()` qu'une fois par
 * requête au lieu d'une fois par ligne, et elle ne change pas la portée — c'est
 * le cas des dix politiques de ce schéma, **mesuré**, et un contrôle qui les
 * refuserait tomberait sur du schéma juste.
 *
 * Une sous-requête **avec `from`** introduit une seconde table. Un nom non
 * qualifié y désigne la table interne si elle le porte, la table externe sinon :
 * trancher demande de reproduire la résolution de portée de PostgreSQL, où une
 * portée interne masque l'externe et où l'externe reste visible. Le contrôle
 * refuse donc la forme au lieu de deviner, et le dernier test le dit.
 */
function colonnesCitees(expression, tableParDefaut) {
  const citees = [];
  const changementsDePortee = [];

  function descendre(noeud) {
    if (Array.isArray(noeud)) {
      for (const element of noeud) {
        descendre(element);
      }
      return;
    }
    if (noeud === null || typeof noeud !== 'object') {
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
      if (segments.length === 1) {
        citees.push({ table: tableParDefaut, colonne: segments[0] });
      } else {
        // `table.colonne` ou `schéma.table.colonne` : les deux derniers segments.
        citees.push({
          table: segments[segments.length - 2],
          colonne: segments[segments.length - 1],
        });
      }
      return;
    }

    const sousLien = noeud.SubLink;
    if (sousLien !== undefined) {
      const select = sousLien.subselect?.SelectStmt;
      if ((select?.fromClause ?? []).length > 0) {
        changementsDePortee.push(sousLien.subLinkType);
        return;
      }
      descendre(select);
      return;
    }

    for (const valeur of Object.values(noeud)) {
      descendre(valeur);
    }
  }

  descendre(expression);
  return { citees, changementsDePortee };
}

const SCHEMA = await lireLeSchema();

test('le schéma se lit, et les six tables attendues y sont', async () => {
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
  assert.ok(SCHEMA.cles.length >= 4, `clés étrangères lues : ${SCHEMA.cles.length}`);

  // Le plancher qui compte le plus : la plupart des politiques ne nomment
  // **aucune** colonne — elles se contentent de `to authenticated`. Si le
  // parcours cessait de descendre dans les expressions, le test des colonnes
  // citées serait vert en ne lisant rien du tout. Mesuré : douze références.
  const citees = [...SCHEMA.politiques, ...SCHEMA.declencheurs].flatMap((objet) =>
    objet.expressions.flatMap((expression) => colonnesCitees(expression, objet.table).citees),
  );
  assert.ok(
    citees.length >= 10,
    `références de colonne lues dans les politiques : ${citees.length} — le parcours ne descend plus`,
  );
});

test('chaque clé étrangère vise une table déclarée, et une colonne qui existe', () => {
  const fautives = [];

  for (const cle of SCHEMA.cles) {
    if (cle.viseSchema !== SCHEMA_PUBLIC) {
      // `auth.users` : hors de nos migrations, et tenu par le dernier test.
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

  for (const [table, colonnes] of SCHEMA.tables) {
    for (const colonne of colonnes) {
      if (colonne.type.length < 2) {
        // Type du langage (`uuid`, `text`, `timestamptz`…) : rien à déclarer.
        continue;
      }
      const nom = colonne.type[colonne.type.length - 1];
      if (!SCHEMA.enums.has(nom)) {
        fautifs.push(`${table}.${colonne.nom} → type « ${nom} » non déclaré`);
      }
    }
  }

  assert.deepEqual(fautifs, [], `colonnes au type inconnu :\n${fautifs.join('\n')}`);
});

test('chaque colonne citée par une politique ou un déclencheur existe dans sa table', () => {
  const fautives = [];
  const objets = [...SCHEMA.politiques, ...SCHEMA.declencheurs];

  for (const objet of objets) {
    if (objet.schema !== SCHEMA_PUBLIC) {
      // Le déclencheur posé sur `auth.users` n'est pas de notre schéma.
      continue;
    }

    const table = SCHEMA.tables.get(objet.table);
    assert.ok(
      table !== undefined,
      `${objet.nom} porte sur une table non déclarée : ${objet.table}`,
    );

    for (const expression of objet.expressions) {
      const { citees } = colonnesCitees(expression, objet.table);
      for (const citee of citees) {
        const visee = SCHEMA.tables.get(citee.table);
        if (visee === undefined) {
          fautives.push(`${objet.nom} cite la table « ${citee.table} », qui n'existe pas`);
          continue;
        }
        if (!visee.map((colonne) => colonne.nom).includes(citee.colonne)) {
          fautives.push(
            `${objet.nom} (${objet.table}) cite « ${citee.table}.${citee.colonne} », qui n'existe pas`,
          );
        }
      }
    }
  }

  assert.deepEqual(fautives, [], `renvois qui ne mènent nulle part :\n${fautives.join('\n')}`);
});

test('aucune expression ne contient de sous-requête qui change de portée', () => {
  // Ce test ne vérifie pas le schéma : il vérifie le **contrôle**. Une
  // sous-requête qui porte un `from` introduit une seconde table, et le parcours
  // ci-dessus ne sait pas résoudre la portée qui en découle. Il refuse donc la
  // forme au lieu de l'attribuer à la mauvaise table — ce qui rendrait le test
  // précédent **vert pour la mauvaise raison**, ou rouge sur du schéma juste.
  // C'est à l'auteur de l'étendre, et ce test le lui demandera.
  const objets = [...SCHEMA.politiques, ...SCHEMA.declencheurs];
  const deplacees = [];

  for (const objet of objets) {
    for (const expression of objet.expressions) {
      const { changementsDePortee } = colonnesCitees(expression, objet.table);
      for (const type of changementsDePortee) {
        deplacees.push(`${objet.nom} (${type})`);
      }
    }
  }

  assert.deepEqual(
    deplacees,
    [],
    `sous-requête avec \`from\` : la portée change, étendre le parcours avant de conclure — ${deplacees.join(', ')}`,
  );
});

test('les renvois hors du schéma `public` sont exactement ceux qui sont nommés', () => {
  // Sans ce test, les deux précédents seraient verts **en ne mesurant rien** sur
  // tout ce qui sort de `public` : ils sautent ces lignes. Une table d'un autre
  // schéma ajoutée plus tard passerait donc sans que personne ne le décide.
  const citees = new Set();

  for (const cle of SCHEMA.cles) {
    if (cle.viseSchema !== SCHEMA_PUBLIC) {
      citees.add(`${cle.viseSchema}.${cle.vise}`);
    }
  }
  for (const objet of [...SCHEMA.politiques, ...SCHEMA.declencheurs]) {
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
  const genres = [...SCHEMA.politiques, ...SCHEMA.declencheurs]
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
