/**
 * Vérifie que toute lecture de **liste** est bornée par une borne explicite.
 *
 * POURQUOI CE SCRIPT
 * ------------------
 * `fetchReservedMenuIds` lisait toutes les réservations de l'adhérent, filtrées
 * par `user_id` et rien d'autre. La lecture grandissait donc avec le temps — une
 * réservation par jour de cantine, pour toujours — alors que l'écran n'utilise
 * que les menus affichés, eux-mêmes bornés par `MAX_MENUS`.
 *
 * Le préjudice n'était pas le volume, mais la **promesse du bouton**. Son
 * libellé dit « Réserver » ou « Annuler ma réservation », donc il affirme un
 * état du serveur. Une lecture non bornée finit par être tronquée par un plafond
 * du serveur ; une réservation tombée hors de la page fait alors dire
 * « Réserver » à un repas déjà réservé. L'adhérent appuie, l'insertion viole la
 * contrainte d'unicité, le doublon est absorbé **en silence** (c'est délibéré :
 * l'intention est satisfaite), la relecture relit la même page tronquée, et le
 * libellé ne change pas. Mesuré sur le modèle de l'écran : libellé identique
 * avant et après l'appui, aucun message, indéfiniment — exactement le cycle que
 * `pendingAction.ts` a été écrit pour empêcher, rentré par une autre porte.
 *
 * LA RÈGLE
 * --------
 * Une lecture de liste — c'est-à-dire toute chaîne `.select(...)` qui ne se
 * termine pas par `.single()` ou `.maybeSingle()` — doit porter **au moins une**
 * de ces deux bornes :
 *
 *   - `.limit(n)` ou `.range(...)` : la borne est écrite dans la requête ;
 *   - `.in(colonne, valeurs)` : la borne est la liste fournie par l'appelant.
 *
 * Les deux formes bornent réellement le nombre de lignes : la première par
 * construction, la seconde parce qu'une liste fournie par l'appelant est finie.
 * Une lecture qui ne filtre que par `.eq(...)` sur une colonne non unique n'a
 * aucune borne — c'est celle qu'on refuse.
 *
 * CE QUE CE BANC NE VÉRIFIE PAS
 * -----------------------------
 * Une borne `.in(...)` n'est bornée que si **la liste reçue l'est**. Le banc
 * constate la présence de la borne, il ne remonte pas jusqu'à l'appelant. C'est
 * une limite, et elle est écrite ici pour que le prochain lecteur ne croie pas
 * le banc plus fort qu'il n'est : `fetchAuthorNames` reçoit les auteurs d'une
 * page déjà bornée par `.limit()`, et `fetchReservedMenuIds` reçoit désormais
 * les menus affichés. La chaîne tient aujourd'hui ; elle ne tient pas par ce
 * banc seul.
 */

import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const RACINE = fileURLToPath(new URL('../', import.meta.url));

/** Retire les commentaires de ligne et de bloc, en préservant `://`. */
function sansCommentaires(source) {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
}

function lireFichier(chemin) {
  return readFileSync(chemin, 'utf8');
}

/** Tous les fichiers source de `src/`, récursivement, en chemins relatifs. */
function fichiersSource() {
  const base = join(RACINE, 'src');

  return readdirSync(base, { recursive: true })
    .filter((nom) => typeof nom === 'string' && (nom.endsWith('.ts') || nom.endsWith('.tsx')))
    .map((nom) => join(base, nom));
}

/**
 * La chaîne d'appel qui suit un `.from('table')`, jusqu'au point-virgule.
 *
 * La portée s'arrête au point-virgule, jamais à la fin du fichier : sans cette
 * borne, une requête sans point-virgule avalerait tout ce qui suit et le verdict
 * porterait sur du code qui n'appartient pas à la lecture.
 */
function chainesDeLecture(source) {
  const lectures = [];
  const motif = /\.from\(\s*'(\w+)'\s*\)/g;

  for (const trouve of source.matchAll(motif)) {
    const fin = source.indexOf(';', trouve.index);
    const chaine = source.slice(trouve.index, fin === -1 ? undefined : fin);

    if (!/\.select\s*\(/.test(chaine)) {
      continue;
    }

    lectures.push({ table: trouve[1], chaine: chaine.replace(/\s+/g, ' ').trim() });
  }

  return lectures;
}

/** Une lecture d'une seule ligne est bornée par construction. */
function estLectureUnique(chaine) {
  return /\.(maybeSingle|single)\s*\(/.test(chaine);
}

/** Une lecture de liste porte-t-elle une borne explicite ? */
function estBornee(chaine) {
  return /\.(limit|range)\s*\(/.test(chaine) || /\.in\s*\(/.test(chaine);
}

/** Les lectures de liste sans borne, avec leur origine. */
function lecturesNonBornees() {
  const fautives = [];

  for (const chemin of fichiersSource()) {
    const source = sansCommentaires(lireFichier(chemin));

    for (const lecture of chainesDeLecture(source)) {
      if (!estLectureUnique(lecture.chaine) && !estBornee(lecture.chaine)) {
        fautives.push(
          `${relative(RACINE, chemin).replace(/\\/g, '/')} : ${lecture.table} — ${lecture.chaine}`,
        );
      }
    }
  }

  return fautives;
}

/** Toutes les tables lues par une chaîne `.select(...)`, triées et dédoublonnées. */
function tablesLues() {
  const tables = new Set();

  for (const chemin of fichiersSource()) {
    const source = sansCommentaires(lireFichier(chemin));

    for (const lecture of chainesDeLecture(source)) {
      tables.add(lecture.table);
    }
  }

  return [...tables].sort();
}

test('l’extraction lit bien les services, et rien d’autre', () => {
  // Sans ce garde-fou, une extraction qui ne trouverait rien rendrait le test
  // suivant vert en ne vérifiant rien — un défaut qui a l'apparence d'une
  // protection, ce qui est pire que pas de protection du tout.
  //
  // L'ancre est la **liste des tables lues**, pas un décompte : une lecture
  // ajoutée sur une nouvelle table doit obliger à venir relire ce fichier.
  assert.deepEqual(tablesLues(), [
    'agenda_events',
    'annonces',
    'cantine_menus',
    'cantine_reservations',
    'discussion_messages',
    'documents',
    'messages',
    'profiles',
    'signalements',
    'sondage_choices',
    'sondage_votes',
    'sondages',
  ]);

  const lectures = fichiersSource().flatMap((chemin) =>
    chainesDeLecture(sansCommentaires(lireFichier(chemin))),
  );

  assert.ok(lectures.length >= 7, `lectures relevées : ${lectures.length}`);
});

test('aucune lecture de liste n’est sans borne', () => {
  assert.deepEqual(
    lecturesNonBornees(),
    [],
    'une lecture non bornée finit par être tronquée, et une promesse calculée dessus devient fausse',
  );
});

test('la règle reconnaît les deux bornes, et refuse ce qui n’en a pas', () => {
  // Le témoin : la règle est exercée sur des chaînes écrites ici. Sans lui, une
  // expression régulière cassée — ou devenue trop large — rendrait le test
  // précédent vert sans rien mesurer.
  const borneeParLimit = ".from('t').select('*').order('a').limit(60)";
  const borneeParIn = ".from('t').select('a').in('a', ids)";
  const borneeParRange = ".from('t').select('*').range(0, 49)";
  const unique = ".from('t').select('*').eq('id', x).maybeSingle()";
  const sansBorne = ".from('t').select('*').eq('user_id', userId)";

  assert.ok(estBornee(borneeParLimit), 'limit() doit être reconnu comme une borne');
  assert.ok(estBornee(borneeParIn), 'in() doit être reconnu comme une borne');
  assert.ok(estBornee(borneeParRange), 'range() doit être reconnu comme une borne');
  assert.ok(estLectureUnique(unique), 'maybeSingle() doit être reconnu comme une lecture unique');
  assert.ok(!estBornee(sansBorne), 'un eq() seul ne borne rien');
  assert.ok(!estLectureUnique(sansBorne), 'un eq() seul ne fait pas une lecture unique');
});

test('la lecture des réservations est bornée par les menus affichés', () => {
  // L'invariant nommé, et non seulement la règle générale : c'est ce défaut-là
  // qui a motivé ce fichier, et sa forme exacte mérite d'être tenue.
  const source = sansCommentaires(lireFichier(join(RACINE, 'src', 'services', 'cantine.ts')));
  const lecture = chainesDeLecture(source).find((l) => l.table === 'cantine_reservations');

  assert.ok(lecture, 'la lecture de cantine_reservations a disparu de src/services/cantine.ts');
  assert.match(
    lecture.chaine,
    /\.in\(\s*'menu_id'/,
    'la lecture doit être bornée par les identifiants des menus affichés',
  );

  const ecran = sansCommentaires(lireFichier(join(RACINE, 'src', 'screens', 'CantineScreen.tsx')));

  // Seule l'existence du **second argument** est exigée, jamais son écriture :
  // extraire le `map` dans une variable est une remise en forme légitime, et un
  // banc qui la refuserait mesurerait l'écriture au lieu de l'invariant.
  assert.match(
    ecran,
    /fetchReservedMenuIds\(\s*userId\s*,\s*[^)\s]/,
    'l’écran doit passer les menus affichés à la lecture des réservations',
  );
});
