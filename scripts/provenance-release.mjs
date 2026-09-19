/**
 * Recompose le **texte** d'une version GitHub à partir des provenances qu'elle
 * porte déjà, et de celle du fichier qu'on vient de déposer.
 *
 * POURQUOI CE SCRIPT EXISTE
 * -------------------------
 * Une version GitHub est un objet à **deux durées de vie**. Ses fichiers sont
 * remplacés à chaque compilation (`gh release upload --clobber`) ; son texte,
 * lui, n'était écrit qu'à la création. Le texte survivait donc aux fichiers, et
 * il affirmait :
 *
 *     « Binaires de la version 0.1.0, compilés depuis le commit dd5f872… »
 *
 * Mesuré le 2026-09-19 : les deux binaires déposés ensuite venaient de
 * `e49297d`, et la page annonçait toujours l'ancien commit. Or c'est la
 * **seule** adresse d'où un parent peut télécharger — les artefacts d'un flux
 * exigent un compte (`401`), un fichier de version non (`302`). La provenance
 * publique était donc fausse, et elle le redevenait à chaque recompilation,
 * c'est-à-dire à chaque modification de `src/`.
 *
 * Le défaut n'était pas la valeur écrite : c'était de l'avoir écrite **une
 * fois**. Ce script fait du texte une fonction des fichiers, recalculée à chaque
 * dépôt.
 *
 * CE QU'IL FAIT EXACTEMENT
 * ------------------------
 * Il lit le texte existant, en extrait les lignes de provenance — la seule forme
 * qu'il sait relire, ``- `fichier` — compilé depuis le commit `…`.`` —, remplace
 * celle du fichier qu'on lui donne, et **écarte tout le reste**. C'est ainsi que
 * la phrase d'origine, qui n'a pas cette forme, disparaît au premier dépôt
 * suivant sans qu'on ait à la retirer à la main.
 *
 * Appelé **sans** fichier, il rend l'en-tête et le pied seuls : c'est la forme
 * utilisée à la création de la version, avant que le premier binaire n'existe.
 * Un seul endroit porte donc ces phrases, et non deux qui divergeraient.
 *
 * CE QU'IL NE PEUT PAS FAIRE
 * --------------------------
 * Il n'établit pas que le commit qu'on lui donne est celui du binaire : il
 * l'écrit. C'est le flux qui le relève (`gitCommitHash`, à défaut le commit de
 * l'exécution) — le script ne déduit rien.
 *
 * Il ne connaît pas non plus la course entre les deux flux, qui réécrivent le
 * même texte à la même minute : le dernier écrivain gagne. Le pire cas est
 * **une ligne omise**, jamais une ligne fausse — c'est la propriété qui compte
 * ici, et c'est précisément celle qu'un texte figé ne pouvait pas offrir.
 *
 * Usage : `gh release view <tag> --json body --jq .body | node
 * scripts/provenance-release.mjs [<fichier> <commit>]`
 */

import { readFileSync } from 'node:fs';

/** La première ligne du texte, et celle qui annonce la règle de relecture. */
const ENTETE = 'Binaires déposés par les flux de compilation — un par plateforme.';

const PIED = [
  'Ce texte est réécrit à chaque dépôt de binaire : la ligne d’un fichier dit le commit',
  'de sa dernière compilation. Téléchargez depuis cette page — l’adresse d’un artefact de',
  'flux exige un compte, celle d’un fichier de version non.',
];

/**
 * La seule forme que ce script sait **relire**. Volontairement étroite : une
 * ligne qui ne l'épouse pas est écartée, et c'est ce qui retire les phrases
 * écrites par une version antérieure du flux.
 */
const LIGNE = /^- `([^`]+)` — compilé depuis le commit `([0-9a-f]{7,40})`\.$/;

/**
 * Un nom de fichier déposé par nos flux, et un commit en minuscules. Les deux
 * sont validés parce qu'ils entrent dans un texte Markdown : un accent grave ou
 * un saut de ligne dans le nom casserait la ligne qu'on prétend écrire.
 */
const NOM = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
const COMMIT = /^[0-9a-f]{7,40}$/;

/**
 * Le texte complet de la version.
 *
 * @param {string} corpsExistant le texte actuel, quel qu'il soit
 * @param {string} [fichier] le fichier qui vient d'être déposé
 * @param {string} [commit] le commit depuis lequel il a été compilé
 * @returns {string}
 */
function composer(corpsExistant, fichier, commit) {
  const provenances = new Map();

  for (const ligne of String(corpsExistant).split('\n')) {
    const trouve = LIGNE.exec(ligne.trim());
    if (trouve !== null) {
      provenances.set(trouve[1], trouve[2]);
    }
  }

  if (fichier !== undefined) {
    if (!NOM.test(fichier)) {
      throw new Error(`nom de fichier inattendu : ${JSON.stringify(fichier)}`);
    }
    if (!COMMIT.test(commit ?? '')) {
      throw new Error(`commit inattendu : ${JSON.stringify(commit)}`);
    }
    provenances.set(fichier, commit);
  }

  // Trié par nom : deux exécutions sur le même contenu rendent le même texte,
  // ce qui évite qu'un simple redépôt réordonne la page.
  const decrites = [...provenances.keys()]
    .sort()
    .map((nom) => `- \`${nom}\` — compilé depuis le commit \`${provenances.get(nom)}\`.`);

  const blocs = [ENTETE];
  if (decrites.length > 0) {
    blocs.push('', ...decrites);
  }
  blocs.push('', ...PIED);

  return `${blocs.join('\n')}\n`;
}

function main() {
  const [fichier, commit] = process.argv.slice(2);

  let corpsExistant = '';
  try {
    // Le descripteur 0 est l'entrée standard : le flux y branche le texte
    // courant de la version. Absente — tube fermé —, on part d'un texte vide.
    corpsExistant = readFileSync(0, 'utf8');
  } catch {
    // Ce rattrapage est une **ceinture**, pas un chemin vivant : mesuré, un
    // tube vide comme un tube fermé rendent une chaîne vide, sans lever. Il
    // n'est là que pour l'appel à la main, où l'entrée standard d'un terminal
    // se comporte autrement — et il ne sert alors qu'à éviter une pile d'appels
    // là où « aucun texte » est la bonne lecture.
    corpsExistant = '';
  }

  try {
    process.stdout.write(composer(corpsExistant, fichier, commit));
  } catch (erreur) {
    console.error(`::error::${erreur.message}`);
    process.exitCode = 1;
  }
}

main();
