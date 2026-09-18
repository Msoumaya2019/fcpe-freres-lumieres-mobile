/**
 * =============================================================================
 *  Ce qui est livré, et ce qui est seulement construit
 * =============================================================================
 *
 *  `npm audit` signale onze vulnérabilités modérées sur ce projet. Toutes
 *  remontent à une seule alerte racine, `uuid` < 11.1.1 — GHSA-w5hq-g745-h8pq —
 *  atteinte par `xcode`, que `@expo/config-plugins` emploie pendant le prebuild
 *  pour manipuler les fichiers de projet Xcode.
 *
 *  `SECURITY.md` affirme que cette chaîne **n'est pas présente dans le bundle
 *  livré**. C'était une lecture de la chaîne de dépendances ; c'est ici un
 *  invariant, et il est mesurable.
 *
 *  Mesuré le 2026-09-18, `npm ls` :
 *
 *      expo-splash-screen@57.0.9
 *        └─ @expo/config-plugins@57.0.9
 *             └─ xcode@3.0.1
 *                  └─ uuid@7.0.3
 *
 *  L'affirmation tient sur deux faits, et le banc les vérifie séparément :
 *
 *  1. **Aucun fichier de `src/` n'importe la chaîne signalée.** Metro ne
 *     construit le bundle qu'à partir de ce que `src/` atteint ; une seule
 *     importation de `uuid` ou de `xcode` depuis les sources ferait entrer la
 *     chaîne dans le paquet livré, et l'affirmation de `SECURITY.md` deviendrait
 *     fausse **sans qu'aucune alerte ne change**.
 *  2. **Le code d'exécution des dépendances signalées ne l'atteint pas.** Pour
 *     `expo-splash-screen`, npm installe `@expo/config-plugins` dans
 *     `dependencies` — il ne sait pas exprimer « outil de construction ». C'est
 *     donc le **répertoire du `main`** qu'il faut regarder, pas le paquet.
 *
 *  PORTÉE — CE QUE CE BANC NE COUVRE PAS
 *  -------------------------------------
 *  Le second point est un **faisceau** : il lit le répertoire publié du `main`,
 *  qui est ce que Metro peut atteindre, et non une fermeture transitive calculée.
 *  Un paquet qui importerait la chaîne par un chemin dynamique lui échapperait.
 *  Le premier point, lui, est exact : il porte sur des spécificateurs écrits.
 *
 *  Et le banc ne dit rien du **bien-fondé** de l'alerte : il dit que la chaîne
 *  signalée ne peut pas se trouver dans le paquet livré. Si `npm audit` signale
 *  demain autre chose, `CHAINE_SIGNALEE` doit être relu — c'est écrit là pour
 *  que la recopie vieillisse visiblement.
 */

import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

/**
 * `fileURLToPath`, et non `racine.pathname` : `pathname` **encode en
 * pourcentage**, donc le dossier `WorkBuddy AI` de ce dépôt arrivait ici sous la
 * forme `WorkBuddy%20AI`, et les deux cas tombaient en `ENOENT` — un rouge qui
 * accusait le dépôt alors qu'il accusait la lecture du chemin.
 */
const racineDisque = fileURLToPath(new URL('../', import.meta.url));

/** D'où vient la chaîne ci-dessous, et quand elle a été relevée. */
const SOURCE_DU_RELEVE = 'npm audit --json / npm ls, relevé le 2026-09-18';

/**
 * La chaîne signalée par `npm audit`, et la dépendance directe par laquelle elle
 * entre dans l'installation. Liste **close** : si l'audit signale autre chose,
 * il faut la relire — et le test le dit.
 */
const CHAINE_SIGNALEE = {
  alerte: 'uuid < 11.1.1 — GHSA-w5hq-g745-h8pq',
  paquets: ['uuid', 'xcode', '@expo/config-plugins'],
  dependanceDirecte: 'expo-splash-screen',
};

/** Retire commentaires de ligne et de bloc : un nom cité n'est pas un emploi. */
function sansCommentaires(source) {
  return source.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\/\/[^\n]*/g, ' ');
}

/** Les fichiers de `src/`, récursivement. */
function fichiersDeSrc() {
  const base = join(racineDisque, 'src');
  return readdirSync(base, { recursive: true, withFileTypes: true })
    .filter((e) => e.isFile() && /\.(ts|tsx|js|jsx|mjs|cjs)$/.test(e.name))
    .map((e) => join(e.parentPath ?? e.path, e.name));
}

/** Le nom de paquet d'un spécificateur : `@portee/nom/sous-chemin` → `@portee/nom`. */
function nomDePaquet(specificateur) {
  const morceaux = specificateur.split('/');
  return specificateur.startsWith('@') ? morceaux.slice(0, 2).join('/') : morceaux[0];
}

test('aucun fichier de `src/` n’importe la chaîne signalée', () => {
  const fautifs = [];

  for (const chemin of fichiersDeSrc()) {
    const source = sansCommentaires(readFileSync(chemin, 'utf8'));
    for (const motif of [
      /from\s+['"]([^'"]+)['"]/g,
      /import\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
      /require\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
    ]) {
      for (const [, specificateur] of source.matchAll(motif)) {
        const paquet = nomDePaquet(specificateur);
        if (CHAINE_SIGNALEE.paquets.includes(paquet)) {
          fautifs.push(
            `${relative(racineDisque, chemin)} importe \`${paquet}\` : la chaîne signalée entrerait dans le bundle livré`,
          );
        }
      }
    }
  }

  assert.deepEqual(
    fautifs,
    [],
    `${SOURCE_DU_RELEVE} — alerte « ${CHAINE_SIGNALEE.alerte} »\n  ${fautifs.join('\n  ')}`,
  );
});

test('le code d’exécution des dépendances signalées n’atteint pas la chaîne', () => {
  const directe = CHAINE_SIGNALEE.dependanceDirecte;
  const paquet = JSON.parse(
    readFileSync(join(racineDisque, 'node_modules', directe, 'package.json'), 'utf8'),
  );

  assert.equal(
    typeof paquet.main,
    'string',
    `\`${directe}\` doit déclarer un \`main\` : c'est ce que Metro atteint`,
  );

  const dossier = join(racineDisque, 'node_modules', directe, dirname(paquet.main));
  const fautifs = [];

  for (const fichier of readdirSync(dossier)) {
    if (!fichier.endsWith('.js')) continue;
    const source = readFileSync(join(dossier, fichier), 'utf8');
    for (const nom of CHAINE_SIGNALEE.paquets) {
      if (source.includes(`'${nom}'`) || source.includes(`"${nom}"`)) {
        fautifs.push(`${fichier} référence \`${nom}\``);
      }
    }
  }

  assert.deepEqual(
    fautifs,
    [],
    `le code d'exécution de \`${directe}\` (\`${paquet.main}\`) ne doit pas atteindre la chaîne signalée :\n  ${fautifs.join('\n  ')}`,
  );
});
