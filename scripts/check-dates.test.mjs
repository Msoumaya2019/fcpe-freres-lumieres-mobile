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
 * fautif ». Elle était **fausse** — mais la correction qui a suivi en a produit
 * une seconde, plus coûteuse, parce qu'elle a généralisé une mesure faite sur
 * **une seule plateforme**.
 *
 * Mesuré sous **Windows** (Node 22.22.2, processus fils, `TZ` passé par `env`) :
 *
 *     TZ=GMT-5               → -05:00    TZ=Etc/GMT+5          → -05:00
 *     TZ=GMT+14              → +14:00    TZ=Etc/GMT-14         → +14:00
 *     TZ=America/Bogota      → -05:00    TZ=Pacific/Kiritimati → +14:00
 *     TZ=Asia/Tokyo          → +09:00    TZ=America/New_York   → -04:00 (DST)
 *     TZ=UTC                 → +00:00    (aucun TZ)            → +02:00
 *
 * Conclusion de l'époque : « les noms IANA ne sont pas lus, les décalages fixes
 * le sont ». **Faux**, et le tableau ci-dessus le montre : `Asia/Tokyo` donne bien
 * `+09:00`. Ce qui s'était passé est plus instructif que l'erreur elle-même — la
 * forme essayée d'abord était un nom IANA **à décalage variable**, et sa valeur
 * d'été a été lue comme « la variable n'est pas appliquée ».
 *
 * Le vrai piège était ailleurs, et il a fallu pousser le dépôt pour le voir :
 * `GMT-5` ne veut pas dire la même chose partout. Sous Windows, `-05:00` ; sous
 * Linux, `+05:00` — l'une lit « moins cinq », l'autre applique la convention
 * POSIX, où le décalage est celui qu'on **ajoute** à l'heure locale pour obtenir
 * UTC. Au premier `push` de ce dépôt, le 18 septembre 2026, l'intégration continue
 * a donc rendu « le fuseau demandé n'a pas été appliqué au processus fils —
 * 5 !== -5 » : le banc ne mesurait rien sous Linux, et il ne pouvait pas le dire,
 * n'ayant jamais tourné ailleurs.
 *
 * La correction ne consiste pas à ajouter une forme de plus, mais à **chercher**
 * celle qui produit le décalage voulu, parmi des noms IANA — leur sens est le même
 * partout, y compris leur signe inversé, bizarrerie stable de la base de données.
 * Les deux tests mesurent toujours leur propre prémisse — le décalage appliqué, et
 * le fait que le piège change bien de jour — pour qu'ils **échouent** sur une
 * machine qui ignorerait `TZ`, au lieu de passer à vide.
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
function mesurer(fuseau) {
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

/**
 * Les formes de `TZ` essayées, dans l'ordre, pour chaque décalage voulu.
 *
 * `Etc/GMT+n` porte le signe **inversé** : `Etc/GMT+5` est UTC-5. C'est une
 * bizarrerie de la base IANA, mais elle est stable et lue de la même façon par
 * toutes les plateformes — contrairement à `GMT-5`, dont le sens s'inverse.
 * Les seconds choix sont des zones **sans heure d'été**, donc à décalage fixe.
 */
const FORMES = {
  '-5': ['Etc/GMT+5', 'America/Bogota'],
  14: ['Etc/GMT-14', 'Pacific/Kiritimati'],
};

/**
 * Mesure dans le premier fuseau qui produit réellement le décalage voulu.
 *
 * Chercher, plutôt que déclarer : c'est ce qui rend le test portable. La valeur
 * retenue est celle qui a été **mesurée**, et `essais` est rendue à l'appelant
 * pour que l'assertion de prémisse puisse nommer ce qui a été tenté si aucun
 * fuseau ne s'applique.
 */
function dansLeFuseau(attendu) {
  const candidats = FORMES[String(attendu)];
  if (candidats === undefined) {
    throw new Error(`aucune forme de TZ connue pour le décalage ${attendu}`);
  }

  const essais = [];
  let dernier = null;
  for (const fuseau of candidats) {
    dernier = mesurer(fuseau);
    essais.push(`${fuseau} → ${dernier.offset}`);
    if (dernier.offset === attendu) return { ...dernier, essais };
  }

  return { ...dernier, essais };
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
  const mesure = dansLeFuseau(-5);

  // Les deux prémisses, et elles ne sont pas décoratives : sans elles, ce test
  // serait vert sur une machine qui ignore `TZ` — c'est-à-dire qu'il ne
  // mesurerait rien tout en ayant l'air de passer.
  assert.equal(
    mesure.offset,
    -5,
    `aucun fuseau n’a été appliqué au processus fils — essayé : ${mesure.essais.join(', ')}`,
  );
  assert.equal(
    mesure.jourDuPiege,
    15,
    'dans ce fuseau, minuit UTC doit tomber la veille — sinon l’entrée ne prouve rien',
  );

  assert.equal(mesure.correcte, 'Mercredi 16 septembre');
});

test('une date civile tient aussi dans un fuseau en avance sur UTC', () => {
  const mesure = dansLeFuseau(14);

  assert.equal(
    mesure.offset,
    14,
    `aucun fuseau n’a été appliqué au processus fils — essayé : ${mesure.essais.join(', ')}`,
  );

  // Ce fuseau-là ne discrimine pas : minuit UTC y tombe le même jour. Il est là
  // pour l'autre moitié de la promesse — le rendu ne doit pas dépendre du **sens**
  // de l'écart, et une correction qui ne tiendrait que les fuseaux en retard
  // serait une correction à moitié faite.
  assert.equal(mesure.jourDuPiege, 16);
  assert.equal(mesure.correcte, 'Mercredi 16 septembre');
});
