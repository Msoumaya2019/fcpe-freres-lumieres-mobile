/**
 * Vérifie que les limites de saisie du client sont celles que le serveur impose.
 *
 * POURQUOI CE SCRIPT
 * ------------------
 * Le serveur borne la longueur de trois colonnes que l'adhérent saisit :
 * `profiles.display_name`, `signalements.subject` et `discussion_messages.body`.
 * Le client n'en bornait qu'une. Mesuré avant correction :
 *
 *   - un nom affiché de 81 caractères faisait échouer l'insertion du profil
 *     **dans le déclencheur** `handle_new_user()`, donc la création du compte
 *     entier — même transaction. GoTrue renvoyait « Database error saving new
 *     user », que l'adhérent lisait sous forme de message générique invitant à
 *     **réessayer** : un conseil qui ne peut pas aboutir, puisque le nom est la
 *     cause ;
 *   - un objet de signalement de 161 caractères était refusé par le serveur, et
 *     l'adhérent lisait « La valeur envoyée n'est pas acceptée par le serveur »
 *     — sans savoir quel champ, ni quelle longueur.
 *
 * CE QUI EST LU, ET D'OÙ
 * ----------------------
 * La borne n'est **pas recopiée ici** : elle est lue dans la migration, et la
 * constante est lue dans l'écran. Un test qui recopierait la valeur qu'il éprouve
 * ne pourrait pas la voir changer — c'est exactement le défaut qu'il surveille.
 *
 * Le fichier tient aussi la complétude : une colonne bornée qui apparaîtrait
 * dans la migration sans être déclarée ici fait échouer le banc. Ajouter une
 * limite est une décision, pas un oubli.
 */

import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const RACINE = fileURLToPath(new URL('../', import.meta.url));
const MIGRATIONS = join(RACINE, 'supabase', 'migrations');

/** Retire les commentaires de ligne et de bloc en TypeScript, `--` en SQL. */
function sansCommentaires(source) {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
}

function sansCommentairesSql(source) {
  return source.replace(/--[^\n]*/g, '');
}

function lireFichier(chemin) {
  return readFileSync(chemin, 'utf8');
}

/** Tous les fichiers source de `src/`, récursivement. */
function fichiersSource() {
  const base = join(RACINE, 'src');

  return readdirSync(base, { recursive: true })
    .filter((nom) => typeof nom === 'string' && (nom.endsWith('.ts') || nom.endsWith('.tsx')))
    .map((nom) => join(base, nom));
}

/**
 * Le SQL de **toutes** les migrations, dans l'ordre des noms.
 *
 * POURQUOI TOUTES, ET NON LA PREMIÈRE
 * -----------------------------------
 * La version précédente lisait un seul fichier, désigné par son nom. Tant qu'il
 * n'y en avait qu'un, la différence était invisible ; à la deuxième migration,
 * ce banc a répondu « rien à signaler » sur des tables qu'il n'avait jamais
 * ouvertes. Une borne ajoutée dans une migration ultérieure aurait donc été
 * invisible, et l'adhérent aurait retrouvé le message générique que ce fichier
 * existe pour éviter.
 *
 * C'est la même famille de défaut que `check-schema-types`, corrigé de la même
 * manière le même jour : un contrôle qui lit **un** fichier par son nom mesure
 * ce fichier-là, pas la propriété qu'il annonce.
 */
function sqlDesMigrations() {
  return readdirSync(MIGRATIONS)
    .filter((nom) => nom.endsWith('.sql'))
    .sort()
    .map((nom) => sansCommentairesSql(lireFichier(join(MIGRATIONS, nom))))
    .join('\n');
}

/**
 * Le contenu d'une parenthèse, parenthèses comptées.
 *
 * POURQUOI ON COMPTE, ET POURQUOI CE N'EST PAS UN DÉTAIL
 * ------------------------------------------------------
 * Un filtre par ligne — « la contrainte tient sur une ligne » — suffit tant que
 * toutes les contraintes tiennent sur une ligne. `messages_reply_format` s'écrit
 * sur trois lignes, et la version précédente de `check-schema-types` a produit à
 * cause de cela une colonne imaginaire nommée `or`. La propriété cherchée est
 * **structurelle** — « à l'intérieur de cette contrainte » —, et une structure
 * se lit en comptant les parenthèses, jamais en découpant des lignes.
 *
 * `null` quand la parenthèse n'est jamais refermée : un fichier tronqué rend
 * `null`, et l'appelant l'ignore au lieu de lire la fin du fichier comme si elle
 * appartenait à la contrainte.
 */
function corpsParenthese(source, indexOuvrante) {
  let profondeur = 0;

  for (let i = indexOuvrante; i < source.length; i += 1) {
    if (source[i] === '(') {
      profondeur += 1;
    } else if (source[i] === ')') {
      profondeur -= 1;

      if (profondeur === 0) {
        return source.slice(indexOuvrante + 1, i);
      }
    }
  }

  return null;
}

/**
 * Les contraintes de longueur **avec borne haute**, lues dans les migrations.
 *
 * Les bornes basses ne sont pas relevées : elles sont déjà tenues par la
 * validation des formulaires, qui refuse un champ vide, et un `maxLength` ne
 * saurait les exprimer.
 *
 * La borne est cherchée **dans le corps de chaque contrainte**, et non sur la
 * ligne qui la déclare : `messages_reply_length` s'écrit
 * `check (reply_to is null or char_length(reply_to) <= 254)`, où `char_length`
 * ne suit pas immédiatement `check (`. Un motif qui l'exigeait laissait cette
 * borne invisible — et `reply_to` est saisie par l'écran de contact.
 */
function contraintesBornees() {
  const sql = sqlDesMigrations();
  const tables = /create table (?:if not exists )?public\.(\w+)\s*\(/g;
  const relevees = [];

  let table;
  while ((table = tables.exec(sql)) !== null) {
    const corpsTable = corpsParenthese(sql, table.index + table[0].length - 1);

    if (corpsTable === null) {
      continue;
    }

    const nomTable = table[1];
    const contraintes = /constraint\s+(\w+)\s+check\s*\(/g;

    let contrainte;
    while ((contrainte = contraintes.exec(corpsTable)) !== null) {
      const expression = corpsParenthese(corpsTable, contrainte.index + contrainte[0].length - 1);

      if (expression === null) {
        continue;
      }

      const bornes = expression.matchAll(
        /char_length\(\s*(?:btrim\(\s*(\w+)\s*\)|(\w+))\s*\)\s*(?:<=\s*(\d+)|between\s+\d+\s+and\s+(\d+))/g,
      );

      for (const borne of bornes) {
        relevees.push({
          contrainte: contrainte[1],
          table: nomTable,
          colonne: borne[1] ?? borne[2],
          borne: Number.parseInt(borne[3] ?? borne[4], 10),
        });
      }
    }
  }

  return relevees;
}

/**
 * Colonnes saisies dans l'application, avec l'écran qui les saisit et la
 * constante qui porte la borne. La valeur, elle, vient de la migration.
 */
const SAISIES = [
  {
    table: 'profiles',
    colonne: 'display_name',
    ecran: 'src/screens/ConnexionScreen.tsx',
    constante: 'MAX_DISPLAY_NAME_LENGTH',
  },
  {
    table: 'signalements',
    colonne: 'subject',
    ecran: 'src/screens/MesSignalementsScreen.tsx',
    constante: 'MAX_SUBJECT_LENGTH',
  },
  {
    table: 'discussion_messages',
    colonne: 'body',
    ecran: 'src/screens/DiscussionMembresScreen.tsx',
    constante: 'MAX_MESSAGE_LENGTH',
  },
  //  Les trois colonnes saisies par l'écran de contact. Elles n'étaient pas
  //  visibles tant que ce banc ne lisait que la première migration.
  {
    table: 'messages',
    colonne: 'subject',
    ecran: 'src/screens/ContactScreen.tsx',
    constante: 'MAX_SUBJECT_LENGTH',
  },
  {
    table: 'messages',
    colonne: 'body',
    ecran: 'src/screens/ContactScreen.tsx',
    constante: 'MAX_BODY_LENGTH',
  },
  {
    table: 'messages',
    colonne: 'reply_to',
    ecran: 'src/screens/ContactScreen.tsx',
    constante: 'MAX_EMAIL_LENGTH',
  },
];

/**
 * Colonnes bornées que l'application n'écrit pas. La raison est vérifiée plus
 * bas : si un écran se met à écrire dans l'une d'elles, le banc le signale.
 */
const NON_SAISIES = [
  {
    table: 'annonces',
    colonne: 'title',
    raison:
      "le bureau publie les annonces hors de l'application ; aucun écran ni service n'écrit dans cette table",
  },
  //  Les rubriques ajoutées par la seconde migration sont, elles aussi, publiées
  //  depuis le tableau de bord. Le test plus bas le **vérifie** au lieu de le
  //  supposer : le jour où un écran publiera un événement ou un sondage, il lui
  //  faudra aussi borner son titre.
  {
    table: 'agenda_events',
    colonne: 'title',
    raison: 'les événements sont publiés par le bureau ; aucun écran ne les écrit',
  },
  {
    table: 'documents',
    colonne: 'title',
    raison: 'les documents sont déposés par le bureau ; aucun écran ne les écrit',
  },
  {
    table: 'documents',
    colonne: 'storage_path',
    raison:
      'le chemin vient du nom du fichier déposé, jamais d’une saisie : il n’y a pas de champ à borner côté client',
  },
  {
    table: 'sondages',
    colonne: 'question',
    raison: 'les sondages sont rédigés par le bureau ; aucun écran ne les écrit',
  },
  {
    table: 'sondage_choices',
    colonne: 'label',
    raison: 'les réponses possibles sont rédigées par le bureau ; aucun écran ne les écrit',
  },
];

const BORNEES = contraintesBornees();

/** Bornes déclarées, indexées par `table.colonne`. */
function borneDe(table, colonne) {
  const trouvee = BORNEES.find((c) => c.table === table && c.colonne === colonne);

  assert.ok(trouvee, `aucune contrainte de longueur bornée sur ${table}.${colonne}`);

  return trouvee.borne;
}

/** Valeur d'une constante déclarée dans un fichier source. */
function constanteDe(chemin, nom) {
  const source = sansCommentaires(lireFichier(join(RACINE, chemin)));
  const trouvee = new RegExp(`const\\s+${nom}\\s*=\\s*(\\d+)\\s*;`).exec(source);

  assert.ok(trouvee, `constante ${nom} introuvable dans ${chemin}`);

  return Number.parseInt(trouvee[1], 10);
}

/** Chaînes d'écriture visant une table, dans tout `src/`. */
function ecrituresDans(table) {
  const motif = new RegExp(`\\.from\\(\\s*'${table}'\\s*\\)`, 'g');
  const fautives = [];

  for (const chemin of fichiersSource()) {
    const source = sansCommentaires(lireFichier(chemin));

    for (const trouve of source.matchAll(motif)) {
      const fin = source.indexOf(';', trouve.index);
      const chaine = source.slice(trouve.index, fin === -1 ? undefined : fin);

      if (/\.(insert|update|upsert|delete)\s*\(/.test(chaine)) {
        fautives.push(`${relative(RACINE, chemin).replace(/\\/g, '/')} : ${chaine.trim()}`);
      }
    }
  }

  return fautives;
}

test('l’extraction lit bien la migration et les écrans', () => {
  // Sans ce garde-fou, une extraction qui ne trouve rien rendrait les tests
  // suivants verts en ne vérifiant rien — un défaut avec l'apparence d'une
  // protection, ce qui est pire que pas de protection du tout.
  assert.deepEqual(
    BORNEES.map((c) => c.contrainte).sort(),
    [
      'agenda_events_title_length',
      'annonces_title_not_blank',
      'discussion_messages_body_not_blank',
      'documents_path_length',
      'documents_title_length',
      'messages_body_length',
      'messages_reply_length',
      'messages_subject_length',
      'profiles_display_name_length',
      'signalements_subject_not_blank',
      'sondage_choices_label_length',
      'sondages_question_length',
    ],
    'la migration a changé : relire les contraintes de longueur',
  );

  assert.ok(fichiersSource().length >= 20, `fichiers source lus : ${fichiersSource().length}`);
});

test('chaque colonne bornée est saisie, ou déclarée sans saisie', () => {
  const declarees = new Set([
    ...SAISIES.map((champ) => `${champ.table}.${champ.colonne}`),
    ...NON_SAISIES.map((champ) => `${champ.table}.${champ.colonne}`),
  ]);
  const nonDeclarees = BORNEES.map((c) => `${c.table}.${c.colonne}`).filter(
    (cle) => !declarees.has(cle),
  );

  assert.deepEqual(
    nonDeclarees,
    [],
    'une colonne bornée sans limite côté client laisse l’adhérent lire « la valeur envoyée n’est pas acceptée par le serveur »',
  );
});

test('la limite de saisie est celle du serveur', () => {
  const ecarts = [];

  for (const champ of SAISIES) {
    const serveur = borneDe(champ.table, champ.colonne);
    const client = constanteDe(champ.ecran, champ.constante);

    if (serveur !== client) {
      ecarts.push(
        `${champ.table}.${champ.colonne} : ${serveur} côté serveur, ${client} dans ${champ.constante}`,
      );
    }
  }

  assert.deepEqual(ecarts, []);
});

test('la borne est réellement appliquée au champ, pas seulement déclarée', () => {
  // Une constante déclarée mais posée sur aucun champ ne borne rien : c'est le
  // défaut de l'export jamais employé, transposé à une limite de saisie.
  const inappliquees = [];

  for (const champ of SAISIES) {
    const source = sansCommentaires(lireFichier(join(RACINE, champ.ecran)));

    if (!source.includes(`maxLength={${champ.constante}}`)) {
      inappliquees.push(`${champ.ecran} : maxLength={${champ.constante}} absent`);
    }
  }

  assert.deepEqual(inappliquees, []);
});

test('aucun écran n’écrit dans une table déclarée sans saisie', () => {
  // La raison donnée dans `NON_SAISIES` est une affirmation sur le code, et elle
  // est vérifiée : le jour où un écran publie une annonce, il lui faudra aussi
  // borner son titre.
  const fautives = NON_SAISIES.flatMap((champ) => ecrituresDans(champ.table));

  assert.deepEqual(fautives, []);
});
