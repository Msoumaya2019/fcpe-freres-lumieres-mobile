/**
 * Vérifie qu'une adresse publiée est écrite **une fois** dans le code, et que
 * ses recopies ne dérivent pas.
 *
 * POURQUOI CE FICHIER
 * -------------------
 * L'adresse de l'information des familles sur leurs données personnelles a été
 * écrite le 21 septembre 2026 dans **six** endroits : la constante du code
 * (`src/config/liens.ts`), le `README.md`, `MISE-EN-SERVICE.md`,
 * `supabase/README.md`, le modèle du courriel d'inscription, et le message d'un
 * script de diagnostic. C'est la famille des **vérités recopiées**, et celle-ci
 * a une conséquence que les autres n'ont pas : si la page déménage, les copies
 * ne cassent rien — elles envoient un parent sur une page qui n'existe plus, et
 * personne ne le voit avant qu'il le signale.
 *
 * La constante existe pour cela. Ce banc tient les deux moitiés de la règle :
 *
 *   - **dans `src/`**, l'adresse n'est écrite qu'une fois. Un second exemplaire
 *     dans un écran serait un premier pas vers la dérive, et il n'y a aucune
 *     raison d'en écrire un : la constante s'importe ;
 *   - **hors de `src/`** (documents et scripts), chaque citation porte
 *     exactement la même adresse — ni barre oblique ajoutée, ni chemin d'hier.
 *
 * CE QU'IL NE COUVRE PAS, ET IL FAUT LE DIRE
 * ------------------------------------------
 * Les documents de travail vivent **hors du dépôt** — `NOTE-RGPD.md`,
 * `MISE-EN-PLACE-RGPD.md`, `CE-QUI-ME-RESTE-A-FAIRE.md`, à la racine de
 * l'espace de travail. Un contrôle du dépôt n'a pas à parcourir le dossier
 * parent : ces fichiers-là restent tenus à la main, et c'est écrit ici pour que
 * personne ne croie la couverture plus large qu'elle n'est.
 *
 * LE TÉMOIN
 * ---------
 * Le détecteur est éprouvé sur une adresse **délibérément dérivée**, avec sa
 * barre oblique finale. Sans ce témoin, un détecteur qui ne trouverait rien
 * serait indiscernable d'un dépôt en règle — et c'est exactement l'erreur qu'un
 * contrôle de recopie commet le plus souvent.
 */

import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const RACINE = fileURLToPath(new URL('../', import.meta.url));

const { INFORMATION_DONNEES_URL } = await import(
  new URL('../src/config/liens.ts', import.meta.url).href
);

/** Le fichier qui a le droit de porter l'adresse, et lui seul. */
const SOURCE = 'src/config/liens.ts';

/** Le segment qui désigne la page, et qui sert à la reconnaître dans un texte. */
const SEGMENT = '/donnees-personnelles';

/** Les dossiers qu'on ne parcourt pas : ni dépendances, ni sorties, ni notes. */
const IGNORES = new Set(['node_modules', '.git', '.expo', 'dist', 'coverage', '.workbuddy-ai']);

/** Tous les fichiers d'un dossier, récursivement, en chemins relatifs au dépôt. */
function fichiers(dossier, extensions, prefixe = '') {
  const trouves = [];

  for (const entree of readdirSync(dossier)) {
    if (IGNORES.has(entree)) {
      continue;
    }

    const complet = join(dossier, entree);
    const relatif = prefixe === '' ? entree : `${prefixe}/${entree}`;

    if (statSync(complet).isDirectory()) {
      trouves.push(...fichiers(complet, extensions, relatif));
      continue;
    }

    if (extensions.some((extension) => entree.endsWith(extension))) {
      trouves.push(relatif);
    }
  }

  return trouves;
}

/**
 * Les adresses de cette page telles qu'elles sont **écrites** dans un texte.
 *
 * On part des jetons `https://…` et on retire ce qui les **entoure** plutôt que
 * de décrire ce qu'ils peuvent contenir : un accent grave de balisage, une
 * chevron d'autolien, une parenthèse, un point de fin de phrase. Décrire le
 * contenu demanderait une classe de caractères où l'accent grave se confond avec
 * la fin d'un littéral de gabarit — mesuré, le motif ne correspondait alors à
 * **rien**, et un contrôle qui ne trouve rien ressemble à un dépôt en règle.
 *
 * La barre oblique finale, elle, n'est **pas** retirée : c'est justement la
 * dérive qu'on veut voir.
 */
function adressesCitees(texte) {
  return [...texte.matchAll(/https?:\/\/\S+/g)]
    .map(([brute]) => brute.replace(/[.,;:!?`'")\]>]+$/, ''))
    .filter((adresse) => adresse.includes(SEGMENT));
}

test("l'adresse de l'information des familles n'est écrite qu'une fois dans le code", () => {
  //  Le préfixe est passé explicitement : les chemins rendus doivent être
  //  relatifs au **dépôt**, comme `SOURCE`, sinon la lecture cherche le fichier
  //  au mauvais endroit — et un `ENOENT` dans un filtre se lit mal.
  const fautifs = fichiers(join(RACINE, 'src'), ['.ts', '.tsx'], 'src')
    .filter((chemin) => chemin !== SOURCE)
    .filter((chemin) => readFileSync(join(RACINE, chemin), 'utf8').includes(SEGMENT));

  assert.deepEqual(
    fautifs,
    [],
    `cette adresse doit s’importer depuis \`${SOURCE}\` : ${fautifs.join(', ')}`,
  );
});

test('chaque citation de la page porte exactement l’adresse publiée', () => {
  const fautifs = [];

  for (const chemin of fichiers(RACINE, ['.md', '.mjs'])) {
    if (chemin === SOURCE) {
      continue;
    }

    for (const citee of adressesCitees(readFileSync(join(RACINE, chemin), 'utf8'))) {
      if (citee !== INFORMATION_DONNEES_URL) {
        fautifs.push(`${chemin} cite « ${citee} »`);
      }
    }
  }

  assert.deepEqual(
    fautifs,
    [],
    `l’adresse publiée est « ${INFORMATION_DONNEES_URL} » : ${fautifs.join(' ; ')}`,
  );
});

test('le détecteur voit une adresse dérivée — le témoin, sans quoi rien ne serait mesuré', () => {
  const derivee = `${INFORMATION_DONNEES_URL}/`;

  assert.deepEqual(
    adressesCitees(`Le détail est ici : <${derivee}>.`),
    [derivee],
    'le détecteur doit extraire l’adresse telle qu’elle est écrite, barre oblique comprise',
  );
  assert.notEqual(
    derivee,
    INFORMATION_DONNEES_URL,
    'le témoin doit être une adresse différente, sinon il ne prouve rien',
  );
});

test('le détecteur ne prend pas la ponctuation de la phrase pour l’adresse', () => {
  assert.deepEqual(
    adressesCitees(`Voir ${INFORMATION_DONNEES_URL}.`),
    [INFORMATION_DONNEES_URL],
    'le point final appartient à la phrase, et une adresse amputée d’un point doit passer',
  );
});
