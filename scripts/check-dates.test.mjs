/**
 * Vérifie le formatage des dates (`src/utils/date.ts`).
 *
 * POURQUOI CE SCRIPT
 * ------------------
 * Une date fausse ne produit ni exception, ni erreur de type, ni message : elle
 * s'affiche, et elle a l'air juste. C'est précisément la catégorie de défaut que
 * les autres fichiers de test de ce dossier visent déjà, et `date.ts` était le
 * seul module de la sorte qui n'était couvert par rien.
 *
 * Le premier test mérite un mot. `parseCivilDate` ne contrôlait que la *forme*
 * de la date, jamais ses *bornes*, et le constructeur `Date` ne refuse rien :
 * mesuré sur ce projet, `'2026-13-45'` s'affichait « Dimanche 14 février » et
 * `'2026-00-00'` « Dimanche 30 novembre ». Une date impossible devenait une date
 * plausible, donc invisible. Le contrôle ajouté rend la valeur brute — le
 * comportement que la fonction réservait déjà aux chaînes qui ne ressemblent pas
 * à une date.
 *
 * LE FUSEAU, QUI SEMBLAIT INÉPROUVABLE
 * ------------------------------------
 * Ce fichier a longtemps porté cette phrase : « Node ignore `TZ` sur cette
 * machine, donc un test de fuseau passerait partout, y compris sur un code
 * fautif ». Elle était **fausse**, et d'une façon instructive : elle généralisait
 * à partir d'**une seule forme** de la variable. Mesuré, processus fils compris :
 *
 *     TZ=America/New_York  → fuseau inchangé (GMT+0200)   ← la forme essayée
 *     TZ=Asia/Tokyo        → fuseau inchangé
 *     TZ=Europe/London     → fuseau inchangé
 *     TZ=UTC               → +00:00
 *     TZ=GMT-5             → -05:00
 *     TZ=GMT+14            → +14:00
 *
 * Les noms **IANA** ne sont pas lus, les décalages **fixes** le sont. Il y avait
 * donc bien un fuseau à essayer, et c'est celui qui compte : un fuseau **en
 * retard** sur UTC, le seul où `new Date('2020-09-16')` — minuit UTC — change de
 * jour. Les deux tests de fuseau mesurent leur propre prémisse — le décalage
 * appliqué, et le fait que le piège change bien de jour — pour qu'ils **échouent**
 * sur une machine qui ignorerait `TZ`, au lieu de passer à vide.
 *
 * Sans dépendance : `node:test` est intégré, et le *type stripping* de Node 22
 * permet d'importer directement le fichier TypeScript.
 */

import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const RACINE = fileURLToPath(new URL('../', import.meta.url));
const CHARGEUR = new URL('./register-alias.mjs', import.meta.url).href;
const MODULE = new URL('../src/utils/date.ts', import.meta.url).href;

const { formatMenuDate, formatDateTime } = await import(MODULE);

/**
 * Exécute un fragment dans un processus **fils**, sous un fuseau donné.
 *
 * Le processus fils est nécessaire : `TZ` se lit au démarrage de Node, et
 * modifier `process.env.TZ` après coup ne change plus rien. Le chargeur d'alias
 * est passé comme dans la suite, pour que le jour où `date.ts` importera un
 * module interne, ce test ne tombe pas pour une raison qui n'a rien à voir.
 */
function dansLeFuseau(fuseau) {
  const programme = [
    "const { formatMenuDate } = await import('./src/utils/date.ts');",
    "const correcte = formatMenuDate('2020-09-16');",
    "const piege = new Date('2020-09-16');",
    'console.log(',
    '  JSON.stringify({',
    '    offset: -new Date().getTimezoneOffset() / 60,',
    '    correcte,',
    '    jourDuPiege: piege.getDate(),',
    '  }),',
    ');',
  ].join('\n');

  const sortie = execFileSync(
    process.execPath,
    [
      '--disable-warning=MODULE_TYPELESS_PACKAGE_JSON',
      '--import',
      CHARGEUR,
      '--input-type=module',
      '-e',
      programme,
    ],
    { cwd: RACINE, env: { ...process.env, TZ: fuseau }, encoding: 'utf8' },
  );

  return JSON.parse(sortie);
}

/** Date civile `AAAA-MM-JJ` d'un jour décalé, lue sur l'horloge courante. */
function civilDate(reference, dayOffset) {
  const date = new Date(
    reference.getFullYear(),
    reference.getMonth(),
    reference.getDate() + dayOffset,
  );
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

test('un jour impossible rend la valeur brute, au lieu d’en inventer un', () => {
  // Mesuré avant correction : « Dimanche 14 février » et « Dimanche
  // 30 novembre ». Les deux sont faux, et les deux ont l'air vrais.
  for (const impossible of ['2026-13-45', '2026-02-30', '2026-00-00', '2026-09-31', '2026-04-31']) {
    assert.equal(
      formatMenuDate(impossible),
      impossible,
      `${impossible} ne doit pas être converti en une autre date`,
    );
  }
});

test('un jour impossible est refusé aussi pour une date passée', () => {
  // Le contrôle ne doit pas dépendre du repère relatif : une date passée passe
  // par la même analyse.
  assert.equal(formatMenuDate('2020-02-30'), '2020-02-30');
  assert.equal(formatMenuDate('2020-11-31'), '2020-11-31');
});

test('une année sur deux chiffres n’est pas décalée de 1900', () => {
  // `new Date(26, 8, 16)` vaut le 16 septembre **1926**. La forme
  // `AAAA-MM-JJ` de l'expression régulière accepte `0026`, et le report
  // silencieux donnerait une date d'un autre siècle.
  assert.equal(formatMenuDate('0026-09-16'), '0026-09-16');
});

test('une chaîne qui ne ressemble pas à une date est rendue telle quelle', () => {
  for (const valeur of ['', 'pas une date', '2026-1-5', '16/09/2026', '2026', '2026-09']) {
    assert.equal(formatMenuDate(valeur), valeur);
  }
});

test('un horodatage complet est lu comme la date civile du même jour', () => {
  // L'expression régulière est ancrée au début et pas à la fin : un
  // `service_date` renvoyé sous forme d'horodatage reste exploitable.
  const attendu = 'Jeudi 5 mars';

  assert.equal(formatMenuDate('2020-03-05'), attendu);
  assert.equal(formatMenuDate('2020-03-05T12:00:00Z'), attendu);
});

test('le jour même et le lendemain portent deux repères distincts', () => {
  const reference = new Date();
  const aujourdHui = formatMenuDate(civilDate(reference, 0));
  const demain = formatMenuDate(civilDate(reference, 1));

  assert.match(aujourdHui, /^Aujourd'hui — /);
  assert.match(demain, /^Demain — /);

  // L'assertion qui compte : si les deux seuils se confondaient, les deux
  // libellés seraient identiques et l'utilisateur ne verrait plus la différence
  // entre le menu du jour et celui du lendemain.
  assert.notEqual(aujourdHui, demain);
});

test('au-delà de demain, le libellé perd le repère relatif', () => {
  const reference = new Date();
  const apresDemain = formatMenuDate(civilDate(reference, 2));

  assert.doesNotMatch(apresDemain, /Aujourd'hui|Demain/);
  assert.match(apresDemain, /^[A-ZÉÈÀ]/);
});

test('un même instant écrit de deux façons donne le même rendu', () => {
  // `19:24:31+00:00` et `21:24:31+02:00` désignent le même instant : le
  // décalage porté par la chaîne doit être honoré, pas recopié tel quel.
  assert.equal(
    formatDateTime('2026-09-16T19:24:31+00:00'),
    formatDateTime('2026-09-16T21:24:31+02:00'),
  );
});

test('deux instants différents donnent deux rendus différents', () => {
  // Le pendant du test précédent : honorer le décalage ne doit pas revenir à
  // ignorer l'heure.
  assert.notEqual(
    formatDateTime('2026-09-16T19:24:31+00:00'),
    formatDateTime('2026-09-16T19:25:31+00:00'),
  );
});

test('un horodatage illisible est rendu tel quel', () => {
  for (const valeur of ['', 'pas une date']) {
    assert.equal(formatDateTime(valeur), valeur);
  }
});

test('une date civile ne glisse pas dans un fuseau en retard sur UTC', () => {
  const mesure = dansLeFuseau('GMT-5');

  // Les deux prémisses, et elles ne sont pas décoratives : sans elles, ce test
  // serait vert sur une machine qui ignore `TZ` — c'est-à-dire qu'il ne
  // mesurerait rien tout en ayant l'air de passer.
  assert.equal(mesure.offset, -5, 'le fuseau demandé n’a pas été appliqué au processus fils');
  assert.equal(
    mesure.jourDuPiege,
    15,
    'dans ce fuseau, minuit UTC doit tomber la veille — sinon l’entrée ne prouve rien',
  );

  assert.equal(mesure.correcte, 'Mercredi 16 septembre');
});

test('une date civile tient aussi dans un fuseau en avance sur UTC', () => {
  const mesure = dansLeFuseau('GMT+14');

  assert.equal(mesure.offset, 14, 'le fuseau demandé n’a pas été appliqué au processus fils');

  // Ce fuseau-là ne discrimine pas : minuit UTC y tombe le même jour. Il est là
  // pour l'autre moitié de la promesse — le rendu ne doit pas dépendre du **sens**
  // de l'écart, et une correction qui ne tiendrait que les fuseaux en retard
  // serait une correction à moitié faite.
  assert.equal(mesure.jourDuPiege, 16);
  assert.equal(mesure.correcte, 'Mercredi 16 septembre');
});
