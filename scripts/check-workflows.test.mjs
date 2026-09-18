/**
 * Banc de `scripts/check-workflows.mjs` — la **fermeture de la liste des flux**.
 *
 * POURQUOI CE BANC EXISTE
 * -----------------------
 * Le contrôle découvre ses sujets par `readdir`. C'est le seul de ses contrôles
 * dont l'absence d'un sujet produit un **vert** : il mesure ce qui reste, jamais
 * ce qui manque. Tous les autres attrapent un défaut dans un fichier qu'ils
 * lisent ; celui-ci lit ce que le dossier contient.
 *
 * Conséquence : il ne peut pas être éprouvé par une mutation des vrais fichiers
 * du dépôt. Retirer un défaut d'un fichier ne dit rien de ce qui se passe quand
 * un fichier **disparaît** — or c'est exactement le scénario à couvrir, et il
 * est silencieux par construction.
 *
 * D'où un dossier temporaire, alimenté par ce banc, et l'option `--dossier` du
 * script. Le dossier ne contient que ce que chaque cas veut montrer, ce qui
 * évite qu'un refus vienne d'ailleurs : les flux écrits ici sont **valides**
 * hormis le défaut visé, sans quoi le banc ne mesurerait rien.
 *
 * Le quatrième cas éprouve le passage à `bash -n`. Sans lui, un remaniement qui
 * perdrait l'appel au shell laisserait le banc vert et la CI muette — jusqu'au
 * jour où un script `run:` refusé ferait échouer un build de vingt minutes.
 */

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const SCRIPT = fileURLToPath(new URL('./check-workflows.mjs', import.meta.url));

/**
 * Un flux minimal, mais **valide** : il satisfait les cinq contrôles
 * structurels et ses deux étapes font quelque chose.
 *
 * C'est ce qui rend les cas négatifs lisibles — un dossier refusé parce que le
 * flux est mal écrit ne dirait rien de la liste fermée.
 */
const FLUX_VALIDE = [
  'name: Minimal',
  'on: push',
  'permissions:',
  '  contents: read',
  'jobs:',
  '  travail:',
  '    name: Travail',
  '    runs-on: ubuntu-latest',
  '    steps:',
  '      - name: Récupérer le dépôt',
  '        uses: actions/checkout@v7',
  '      - name: Salut',
  '        run: echo bonjour',
  '',
].join('\n');

/** Le même flux, dont un script `run:` n'est pas analysable par bash. */
const FLUX_BASH_INVALIDE = FLUX_VALIDE.replace(
  '        run: echo bonjour\n',
  '        run: |\n          if [ -z "$X" ]\n            echo bonjour\n          fi\n',
);

/**
 * Écrit un dossier temporaire, lance le contrôle dessus, et le supprime.
 *
 * @param {Record<string, string>} flux nom de fichier → contenu
 * @returns {{ code: number, sortie: string }}
 */
function controler(flux) {
  const dossier = mkdtempSync(join(tmpdir(), 'fcpe-workflows-'));

  try {
    for (const [nom, contenu] of Object.entries(flux)) {
      writeFileSync(join(dossier, nom), contenu, 'utf8');
    }

    const resultat = spawnSync(process.execPath, [SCRIPT, '--dossier', dossier], {
      encoding: 'utf8',
    });

    // Les défauts vont sur la sortie d'erreur, le décompte sur la sortie
    // standard : les deux sont nécessaires pour juger.
    return {
      code: resultat.status,
      sortie: `${resultat.stdout ?? ''}${resultat.stderr ?? ''}`,
    };
  } finally {
    rmSync(dossier, { recursive: true, force: true });
  }
}

test('un dossier conforme est accepté — le témoin, sans quoi rien ne serait mesuré', () => {
  const { code, sortie } = controler({
    'ci.yml': FLUX_VALIDE,
    'eas-build.yml': FLUX_VALIDE,
  });

  assert.equal(code, 0, `le contrôle refuse un dossier conforme :\n${sortie}`);
  assert.match(sortie, /0 défaut\(s\)/, 'le décompte ne confirme pas l’absence de défaut');
});

test('un flux attendu qui disparaît est refusé — le vert trompeur à interdire', () => {
  // C'est le scénario central : `eas-build.yml` écarté, le dossier contient
  // encore un flux parfaitement valide. Sans la liste fermée, le contrôle
  // annoncerait « 0 défaut » et sortirait en 0.
  const { code, sortie } = controler({ 'ci.yml': FLUX_VALIDE });

  assert.equal(code, 1, `le contrôle reste vert alors qu’un flux a disparu :\n${sortie}`);
  assert.match(sortie, /1 défaut\(s\)/, `le décompte des défauts est faux :\n${sortie}`);
  assert.match(sortie, /\[flux-absent\]/, `le défaut signalé n’est pas le bon :\n${sortie}`);
  assert.match(sortie, /eas-build\.yml/, 'le rapport ne nomme pas le flux manquant');
});

test('un flux ajouté mais non déclaré est refusé — sinon une garde qui refuse tout passerait', () => {
  // Sans ce second sens, une garde qui refuserait n'importe quel dossier
  // passerait pour concluante. Le fichier ajouté est **valide** : le refus ne
  // peut donc venir que de la déclaration.
  const { code, sortie } = controler({
    'ci.yml': FLUX_VALIDE,
    'eas-build.yml': FLUX_VALIDE,
    'publication.yml': FLUX_VALIDE,
  });

  assert.equal(code, 1, `un flux non déclaré est accepté :\n${sortie}`);
  assert.match(sortie, /1 défaut\(s\)/, `le décompte des défauts est faux :\n${sortie}`);
  assert.match(sortie, /\[flux-non-declare\]/, `le défaut signalé n’est pas le bon :\n${sortie}`);
  assert.match(sortie, /publication\.yml/, 'le rapport ne nomme pas le flux non déclaré');
});

test('un script `run:` refusé par bash fait tomber le contrôle', () => {
  // Éprouve le passage à `bash -n`, qui est la raison d'être du script : un
  // flux bien formé dont un script ne compile pas.
  const { code, sortie } = controler({
    'ci.yml': FLUX_VALIDE,
    'eas-build.yml': FLUX_BASH_INVALIDE,
  });

  assert.equal(code, 1, `un script invalide est accepté :\n${sortie}`);
  assert.match(sortie, /1 défaut\(s\)/, `le décompte des défauts est faux :\n${sortie}`);
  assert.match(sortie, /\[script-invalide\]/, `le défaut signalé n’est pas le bon :\n${sortie}`);
  assert.match(sortie, /Salut/, 'le rapport ne nomme pas l’étape fautive');
});

test('un script contenant une expression GitHub n’est pas signalé à tort', () => {
  // Garde contre les **faux positifs** : `ci.yml` et `eas-build.yml` en
  // contiennent, et un contrôle qui les refuserait serait inutilisable.
  //
  // Ce cas ne mesure **pas** la neutralisation des expressions, et il ne faut
  // pas le lui faire dire : la neutralisation retirée, il reste vert. Mesuré,
  // `bash -n` tolère `${{ … }}` — dix-sept formes essayées sur dix-huit sont
  // acceptées, alors que le même script échoue à l'exécution (`bad
  // substitution`). C'est la raison pour laquelle la neutralisation est décrite
  // dans le script comme une mesure de **fidélité**, non de détection.
  const flux = FLUX_VALIDE.replace(
    '        run: echo bonjour\n',
    '        run: echo "${{ secrets.EXPO_TOKEN }}" "${{ github.ref }}"\n',
  );

  const { code, sortie } = controler({ 'ci.yml': flux, 'eas-build.yml': flux });

  assert.equal(code, 0, `une expression GitHub fait échouer l’analyse :\n${sortie}`);
});

test('la fermeture de la liste porte aussi sur un dossier vide', () => {
  // Cas limite : aucun flux du tout. Sans la liste fermée, `readdir` renverrait
  // un tableau vide, la boucle ne s'exécuterait pas, et le contrôle annoncerait
  // « 0 flux analysé, 0 défaut » en sortant en 0 — le vert le plus trompeur de
  // tous, puisqu'il ne reste plus rien à analyser.
  const { code, sortie } = controler({});

  assert.equal(code, 1, `un dossier vide est accepté :\n${sortie}`);
  assert.match(sortie, /2 défaut\(s\)/, `le décompte des défauts est faux :\n${sortie}`);
  assert.match(sortie, /\[flux-absent\]/, `le défaut signalé n’est pas le bon :\n${sortie}`);
});
