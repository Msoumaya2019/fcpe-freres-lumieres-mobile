/**
 * Le nombre de messages non lus a **une seule source**, et elle est publiée.
 *
 * POURQUOI CE FICHIER
 * -------------------
 * Trois endroits affichent ce nombre : la pastille de l'onglet « Plus », la cloche
 * de l'accueil, et la ligne « Discussion » de l'écran « Plus ». Chacun le
 * calculait pour son compte — `compterMessagesNonLus` était appelé depuis trois
 * fichiers, à trois moments différents : au montage pour deux d'entre eux, au
 * retour sur l'écran pour le troisième.
 *
 * Mesuré : après une lecture de la discussion, l'écran « Plus » affichait zéro
 * pendant que la pastille de l'onglet et la cloche annonçaient encore trois.
 * **Trois chiffres pour une seule vérité, dont deux faux** — et le plus visible
 * des trois était le faux, puisqu'il reste affiché sur les cinq onglets.
 *
 * Ce que le code disait, et qui était faux : un commentaire justifiait l'absence
 * de relecture par « l'écran de discussion marque les messages lus en s'ouvrant —
 * le badge se corrige donc de lui-même au retour ». La première moitié est vraie,
 * la seconde non : le badge ne se relisait qu'au **retour au premier plan**, pas
 * au retour depuis la discussion. Une phrase qui décrit une conséquence que rien
 * n'exécute se lit comme une garantie, et c'est pour cela qu'elle mérite un banc.
 *
 * L'INVARIANT, ÉNONCÉ UNE FOIS
 * ----------------------------
 * **Le compte se calcule à un seul endroit, et il est publié quand il change.**
 *
 * Deux faits le font changer, et deux seulement : une relecture depuis le
 * serveur, et la lecture de la discussion, qui le remet à zéro sans requête.
 * C'est le second qui rend l'invariant nécessaire : aucune requête ne le
 * signalerait, donc rien ne le corrigerait si la publication disparaissait.
 *
 * POURQUOI LA MOITIÉ DES TESTS PORTENT SUR LE COMPORTEMENT
 * --------------------------------------------------------
 * La publication, le regroupement des relectures et le refus d'une marque nulle
 * sont des **effets**, et un motif ne les mesure pas : il mesure l'écriture qui
 * les produit, et tombe sur une reformulation juste. Le magasin est un module
 * sans React ni réseau — `AsyncStorage` est doublé sous `node:test` — donc ces
 * effets s'éprouvent directement, en appelant les fonctions.
 *
 * CE QUE CE CONTRÔLE NE PEUT PAS VOIR
 * -----------------------------------
 * Il ne peut pas établir qu'un écran **affiche** le compte, seulement qu'il lit
 * la source partagée : aucun moteur de rendu n'est installé. Et la liste des trois
 * afficheurs est écrite à la main — un quatrième ajouté demain ne serait pas vu.
 * La protection contre une copie privée, elle, est exhaustive : elle porte sur
 * **tous** les fichiers de l'application.
 *
 * Le banc exige enfin que **le client Supabase soit absent** : les tests de
 * comportement mesurent le magasin, pas le réseau. C'est une précondition
 * vérifiée, pas une supposition.
 */

import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const RACINE = fileURLToPath(new URL('../', import.meta.url));

const UNREAD = new URL('../src/services/unread.ts', import.meta.url).href;
const SUPABASE = new URL('../src/config/supabase.ts', import.meta.url).href;

const { abonnerAuCompte, compteNonLus, marquerDiscussionLue, rafraichirNonLus } = await import(
  UNREAD
);
const { requireSupabase } = await import(SUPABASE);

/** Le source sans ses commentaires : le fichier qui explique un appel le nomme. */
function sansCommentaires(source) {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
}

/** Tous les fichiers de l'application, `src/` **et** la racine. */
function fichiersApplication() {
  const dedans = readdirSync(join(RACINE, 'src'), { recursive: true })
    .filter((nom) => typeof nom === 'string' && /\.tsx?$/.test(nom))
    .map((nom) => `src/${nom.replace(/\\/g, '/')}`);

  // `App.tsx` est à la racine, et une recherche limitée à `src/` a déjà rendu une
  // réponse fausse sur ce dépôt — voir `check-env-guard`, qui l'ajoute pour la
  // même raison.
  return [...dedans, 'App.tsx'];
}

const FICHIERS = new Map(
  fichiersApplication().map((chemin) => [
    chemin,
    sansCommentaires(readFileSync(join(RACINE, chemin), 'utf8')),
  ]),
);

/** Les fichiers qui affichent le compte, et doivent lire la source partagée. */
const AFFICHEURS = [
  'src/navigation/MainTabs.tsx',
  'src/screens/AccueilScreen.tsx',
  'src/screens/PlusScreen.tsx',
];

const UNREAD_RELATIF = 'src/services/unread.ts';

/** Une marque de lecture plausible : un `created_at` rendu par PostgreSQL. */
const MARQUE = '2026-09-19T10:00:00+00:00';

test('l’extraction lit l’application, et le magasin est sans client', () => {
  // Deux prémisses, et le banc ne mesure rien si l'une est fausse.
  assert.ok(FICHIERS.size >= 20, `fichiers lus : ${FICHIERS.size}`);

  // Le compte des non-lus se lit sur le serveur. Avec un client configuré, les
  // tests de comportement qui suivent partiraient sur le réseau et mesureraient
  // autre chose — plus lentement, et sans le dire.
  assert.throws(
    () => requireSupabase(),
    'les tests de comportement exigent un client Supabase absent : lancez-les hors de ' +
      'l’environnement de l’application, sans EXPO_PUBLIC_SUPABASE_URL',
  );
});

test('le compte des non-lus se calcule à un seul endroit', () => {
  // Le cœur de l'invariant. Trois appels dans trois fichiers, c'est trois chiffres
  // qui peuvent diverger — et ils ont divergé.
  const appelants = [...FICHIERS]
    .filter(
      ([chemin, source]) =>
        chemin !== UNREAD_RELATIF && /\bcompterMessagesNonLus\s*\(/.test(source),
    )
    .map(([chemin]) => chemin);

  assert.deepEqual(
    appelants,
    [],
    'le compte ne se calcule que dans son service : un écran qui l’appelle garde une copie ' +
      'privée, qui ne se corrige pas quand la discussion est lue',
  );
});

test('les trois afficheurs lisent la source partagée', () => {
  const fautifs = AFFICHEURS.filter((chemin) => !/\buseNonLus\s*\(/.test(FICHIERS.get(chemin)));

  assert.deepEqual(
    fautifs,
    [],
    'chaque afficheur du compte doit lire `useNonLus`, et non garder le sien',
  );
});

test('le crochet lit le magasin, et n’en garde pas de copie locale', () => {
  // Aucun moteur de rendu n'est installé : la forme du crochet est le seul
  // invariant vérifiable, et elle suffit — une copie locale (`useState`) est
  // exactement le défaut qui a produit trois chiffres, parce qu'une valeur
  // recopiée peut changer entre le début et la fin d'un rendu.
  const source = FICHIERS.get('src/hooks/useNonLus.ts');

  assert.notEqual(source, undefined, 'le crochet doit exister');
  assert.ok(!/\buseState\s*\(/.test(source), 'le crochet ne doit pas garder de copie locale');
  assert.match(source, /\bcompteNonLus\b/, 'le crochet doit lire l’instantané du magasin');
  assert.match(source, /\babonnerAuCompte\b/, 'le crochet doit s’abonner au magasin');
});

test('lire la discussion publie le compte, une fois par changement', async () => {
  let notifications = 0;
  const detacher = abonnerAuCompte(() => {
    notifications += 1;
  });

  try {
    await marquerDiscussionLue('adherent-a', MARQUE);
    assert.equal(notifications, 1, 'lire la discussion doit publier le compte');
    assert.equal(compteNonLus('adherent-a'), 0, 'le compte de cet adhérent tombe à zéro');

    // Le compte est rangé **avec son adhérent** : le chiffre du premier ne doit pas
    // servir au second. C'est la valeur d'attente, et non un défaut — un badge
    // s'ajoute à l'écran, il ne s'y affiche pas par défaut.
    assert.equal(compteNonLus('adherent-b'), 0);

    await marquerDiscussionLue('adherent-a', '2026-09-19T10:05:00+00:00');
    assert.equal(notifications, 1, 'publier deux fois la même valeur ne notifie qu’une fois');

    await marquerDiscussionLue('adherent-b', MARQUE);
    assert.equal(notifications, 2, 'changer d’adhérent change la valeur publiée');
  } finally {
    detacher();
  }
});

test('sans message à marquer, rien n’est publié', async () => {
  // `null` est le cas d'une discussion vide : il n'y a rien à marquer, et écrire
  // une marque inventée ferait disparaître les messages arrivés entre-temps.
  let notifications = 0;
  const detacher = abonnerAuCompte(() => {
    notifications += 1;
  });

  try {
    await marquerDiscussionLue('adherent-c', null);
    assert.equal(notifications, 0, 'sans message, il n’y a rien à publier');
  } finally {
    detacher();
  }
});

test('la relecture ne rejette jamais, et se regroupe par adhérent', async () => {
  // Ne jamais rejeter : un badge n'a aucune raison d'empêcher l'application de
  // s'ouvrir. Cette règle vivait recopiée chez chaque afficheur ; elle est
  // désormais dans le service, et c'est ici qu'elle se tient.
  const premiere = rafraichirNonLus('adherent-d');
  const seconde = rafraichirNonLus('adherent-d');

  assert.equal(seconde, premiere, 'deux demandes simultanées ne font qu’une relecture');

  const autre = rafraichirNonLus('adherent-e');
  assert.notEqual(
    autre,
    premiere,
    'un autre adhérent ne doit pas attendre la relecture du précédent — sans quoi il ' +
      'recevrait un compte qui n’est pas le sien',
  );

  await assert.doesNotReject(premiere);
  await assert.doesNotReject(autre);
});
