/**
 * Vérifie les flux de travail GitHub Actions — forme du YAML, sûreté de la
 * structure, et syntaxe de chaque script `run:`.
 *
 * POURQUOI CE CONTRÔLE EXISTE
 * ---------------------------
 * Un flux de travail se teste normalement en le poussant, et c'est le pire
 * moment pour découvrir une faute de frappe : `eas-build.yml` installe Node,
 * les dépendances, puis lance un build EAS qui prend une vingtaine de minutes —
 * et consomme du quota. Une erreur de syntaxe dans le dernier `run:` se
 * découvre donc après tout ce temps.
 *
 * Deux familles de défauts, très inégales en coût :
 *
 *   - un YAML mal formé empêche le flux de démarrer : immédiat, bruyant ;
 *   - un script `run:` invalide laisse le flux démarrer et échouer à la fin :
 *     vingt minutes, silencieux.
 *
 * C'est la seconde qui justifie ce fichier. `bash -n` l'attrape en deux
 * secondes.
 *
 * PORTÉE — CE QUE `bash -n` NE VOIT PAS
 * -------------------------------------
 * `bash -n` analyse sans **évaluer** les expansions. Mesuré : `echo ${{ a }}`
 * est accepté par `-n` alors que le même script échoue à l'exécution
 * (`bad substitution`, code 1) ; `echo ${a b}` et `echo ${}` sont acceptés
 * aussi. Sur dix-huit formes d'expression essayées, une seule est refusée, et
 * c'est une erreur structurelle — un `${` jamais fermé.
 *
 * Autrement dit, ce contrôle attrape la **syntaxe** — un `then` manquant, un
 * `fi` orphelin, une quote non fermée — pas une expansion fautive. C'est la
 * limite à connaître avant de lui faire confiance : une faute de frappe dans
 * `${CHEMIN}` ne sera signalée ni ici, ni par `tsc`, ni par ESLint.
 *
 * LA LISTE DES FLUX EST FERMÉE, ET C'EST LE POINT LE PLUS IMPORTANT
 * -----------------------------------------------------------------
 * Ce contrôle découvre ses sujets par `readdir` : il mesure donc ce qui
 * **reste**, jamais ce qui **manque**. C'est le seul de ses contrôles dont
 * l'absence d'un sujet produit un **vert** — et un vert trompeur est pire
 * qu'un rouge. Écarter `ci.yml`, le flux qui lance tous les autres, ferait
 * baisser le nombre de vérifications sans que rien ne le compare à un attendu.
 *
 * `FLUX_ATTENDUS` est ce à quoi il se compare, dans les deux sens : un fichier
 * attendu qui disparaît échoue, et un fichier **ajouté** qui n'est pas déclaré
 * échoue aussi — sans quoi une garde qui refuserait tout passerait pour
 * concluante. Déclarer est le prix, et il est utile : il force à se demander si
 * le nouveau flux doit tourner dans la chaîne de vérification ou seulement sur
 * un tag.
 *
 * CE QUE CE CONTRÔLE NE PEUT PAS VOIR
 * -----------------------------------
 *  - la sémantique des actions tierces : `actions/checkout@v7` est épinglé,
 *    mais ce que cette version fait n'est pas lisible ici ;
 *  - ce que le service EAS fera du fichier : le flux est analysé, pas exécuté ;
 *  - les réglages du dépôt sur GitHub (protection de branche, secrets,
 *    permissions par défaut), qui vivent hors du dépôt.
 */

import { spawnSync } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { parse } from 'yaml';

const RACINE = fileURLToPath(new URL('..', import.meta.url));
const DOSSIER_PAR_DEFAUT = join(RACINE, '.github', 'workflows');

/**
 * Les flux que ce dépôt doit contenir.
 *
 * Liste **fermée** : voir l'en-tête. Toute entrée ajoutée ici est un flux dont
 * la disparition fera échouer la vérification — et non un flux qu'on espère
 * présent.
 */
const FLUX_ATTENDUS = ['ci.yml', 'eas-build.yml'];

/** Extensions reconnues par GitHub. */
const EXTENSIONS = ['.yml', '.yaml'];

/**
 * Les scripts sont analysés par `bash`, ce qui vaut pour un exécuteur Linux ou
 * macOS. Une étape qui demanderait un autre interpréteur n'est pas analysable
 * ici : elle est signalée plutôt que sautée en silence.
 */
const SHELLS_ANALYSABLES = new Set(['bash', 'sh']);

/** Les défauts trouvés, et le nombre de vérifications réellement effectuées. */
const defauts = [];
let verifications = 0;

/**
 * Compte une vérification, et enregistre un défaut si elle échoue.
 *
 * Le comptage n'est pas décoratif : c'est ce qui rend le rapport croyable. Un
 * rapport qui annonce « 2 flux analysés, 34 vérifications, aucun défaut » se
 * contrôle d'un coup d'œil contre le nombre de `run:` du dépôt. Un rapport qui
 * annonce seulement « OK » ne dit pas s'il a regardé quelque chose.
 *
 * @param {boolean} condition ce qui doit être vrai
 * @param {{ fichier: string, etape?: string|null, tag: string, message: string }} defaut
 * @returns {boolean} la condition, pour enchaîner sans la recalculer
 */
function verifier(condition, defaut) {
  verifications += 1;
  if (!condition) {
    defauts.push(defaut);
  }
  return condition;
}

/**
 * Remplace les expressions GitHub par une valeur inerte.
 *
 * Ce n'est **pas** ce qui fait passer les scripts d'aujourd'hui : mesuré,
 * `bash -n` tolère `${{ … }}` — dix-sept formes essayées sur dix-huit sont
 * acceptées, la seule refusée l'étant pour une raison structurelle. La
 * neutralisation ne change donc aucun verdict ici.
 *
 * Elle est conservée pour une autre raison, qui est de fidélité : GitHub
 * substitue ces expressions **avant** de confier le script au shell, donc le
 * texte exécuté n'est pas le texte du fichier. Analyser le texte substitué,
 * c'est analyser ce que le shell verra réellement — et c'est ce qui empêchera
 * un futur contrôle, portant sur le contenu du script, de juger une chaîne
 * qu'aucune machine n'exécutera jamais.
 */
function neutraliser(script) {
  return script.replace(/\$\{\{[^}]*\}\}/g, 'VALEUR');
}

/**
 * Fait analyser un script par `bash -n` — analyse sans exécution — en le
 * passant par l'entrée standard, ce qui évite d'écrire un fichier temporaire.
 *
 * @returns {{ ok: boolean, detail: string }}
 */
function analyserScript(script) {
  const resultat = spawnSync('bash', ['-n'], {
    input: neutraliser(script),
    encoding: 'utf8',
  });

  if (resultat.error) {
    return { ok: false, detail: `bash n’a pas pu être lancé : ${resultat.error.message}` };
  }

  if (resultat.status === 0) {
    return { ok: true, detail: '' };
  }

  const sortie = `${resultat.stderr ?? ''}${resultat.stdout ?? ''}`;
  const premiere = sortie.split('\n').find((ligne) => ligne.trim() !== '');
  return { ok: false, detail: premiere?.trim() ?? `code de sortie ${resultat.status}` };
}

/**
 * Une action est « épinglée » si elle désigne une version.
 *
 * `actions/checkout@v7` oui ; `actions/checkout` non : une action non épinglée
 * peut changer de comportement sans qu'une seule ligne du dépôt ait bougé.
 *
 * Une action **locale** (`./.github/actions/…`) est exemptée : elle est
 * versionnée avec le dépôt, donc figée par le commit qui la porte.
 */
function estEpinglee(uses) {
  if (typeof uses !== 'string' || uses.trim() === '') {
    return false;
  }
  if (uses.startsWith('./')) {
    return true;
  }
  return /^[^@\s/]+\/[^@\s/]+@[^@\s]+$/.test(uses);
}

/**
 * Analyse un flux de travail déjà lu, et enregistre ses défauts.
 *
 * @param {string} nom nom du fichier, pour nommer le défaut
 * @param {string} source contenu du fichier
 */
function analyserFlux(nom, source) {
  let doc;
  try {
    doc = parse(source);
  } catch (erreur) {
    verifier(false, {
      fichier: nom,
      tag: 'yaml-invalide',
      message: `le YAML est illisible : ${String(erreur.message).split('\n')[0]}`,
    });
    return;
  }

  if (
    !verifier(doc !== null && typeof doc === 'object' && !Array.isArray(doc), {
      fichier: nom,
      tag: 'yaml-invalide',
      message: 'la racine du flux n’est pas une correspondance clé/valeur',
    })
  ) {
    return;
  }

  // Le déclencheur. Un analyseur en schéma YAML 1.1 lit `on:` comme le booléen
  // `true` — la clé disparaît alors, et le flux ne se déclencherait jamais. Le
  // second contrôle est donc un garde-fou, pas une redondance.
  const declencheur = doc['on'];
  verifier(declencheur !== undefined, {
    fichier: nom,
    tag: 'declencheur-absent',
    message: 'aucune clé `on:` : le flux ne se déclencherait jamais',
  });
  verifier(typeof declencheur !== 'boolean', {
    fichier: nom,
    tag: 'declencheur-booleen',
    message:
      'la clé `on:` est lue comme un booléen — l’analyseur applique le schéma ' +
      'YAML 1.1, et le déclencheur serait vide',
  });

  // Sans bloc `permissions:`, le jeton reçoit le réglage par défaut du dépôt,
  // qui peut accorder l'écriture. Le déclarer est le seul moyen de savoir ce
  // que le jeton peut faire.
  verifier(doc['permissions'] !== undefined, {
    fichier: nom,
    tag: 'permissions-absentes',
    message:
      'aucun bloc `permissions:` : le jeton reçoit alors le réglage par défaut ' +
      'du dépôt, qui peut accorder l’écriture',
  });

  const travaux = doc.jobs;
  const nomsTravaux =
    travaux !== null && typeof travaux === 'object' && !Array.isArray(travaux)
      ? Object.keys(travaux)
      : [];

  if (
    !verifier(nomsTravaux.length > 0, {
      fichier: nom,
      tag: 'travaux-absents',
      message: 'aucun travail déclaré : le contrôle ne porterait sur rien',
    })
  ) {
    return;
  }

  for (const idTravail of nomsTravaux) {
    const travail = travaux[idTravail];
    const etiquette = travail?.name ?? idTravail;

    const runsOn = travail?.['runs-on'];
    const executeur = typeof runsOn === 'string' || Array.isArray(runsOn) ? runsOn : null;

    verifier(executeur !== null, {
      fichier: nom,
      etape: etiquette,
      tag: 'executeur-absent',
      message: 'aucun `runs-on:` : le travail n’a pas d’exécuteur',
    });

    // Les scripts sont analysés par `bash`. Un travail confié à Windows
    // utiliserait `pwsh` par défaut, et `bash -n` ne dirait rien de son script :
    // mieux vaut refuser la forme que la laisser passer en silence.
    if (typeof executeur === 'string') {
      verifier(!/^windows/i.test(executeur.trim()), {
        fichier: nom,
        etape: etiquette,
        tag: 'executeur-windows',
        message:
          `le travail s’exécute sur « ${executeur} », où le shell par défaut ` +
          'est PowerShell : ce contrôle ne sait analyser que bash',
      });
    }

    // Un travail réutilisable (`uses:` au niveau du travail) n'a pas d'étapes.
    if (travail?.uses !== undefined) {
      verifier(estEpinglee(travail.uses), {
        fichier: nom,
        etape: etiquette,
        tag: 'action-non-epinglee',
        message: `le flux réutilisé « ${travail.uses} » n’est pas épinglé à une version`,
      });
      continue;
    }

    const etapes = travail?.steps;
    if (
      !verifier(Array.isArray(etapes) && etapes.length > 0, {
        fichier: nom,
        etape: etiquette,
        tag: 'etapes-absentes',
        message: 'aucune étape : le travail ne ferait rien',
      })
    ) {
      continue;
    }

    for (const [rang, etape] of etapes.entries()) {
      const nomEtape = typeof etape?.name === 'string' ? etape.name : `étape ${rang + 1}`;
      const aUses = typeof etape?.uses === 'string';
      const aRun = typeof etape?.run === 'string';

      // Une étape fait quelque chose, et une seule chose : `uses` ou `run`.
      verifier(aUses !== aRun, {
        fichier: nom,
        etape: nomEtape,
        tag: 'etape-vide',
        message: aUses
          ? 'l’étape déclare à la fois `uses` et `run` : GitHub n’en exécutera qu’un'
          : 'l’étape ne déclare ni `uses` ni `run` : elle ne ferait rien',
      });

      if (aUses) {
        verifier(estEpinglee(etape.uses), {
          fichier: nom,
          etape: nomEtape,
          tag: 'action-non-epinglee',
          message:
            `« ${etape.uses} » ne désigne pas de version : une action non ` +
            'épinglée peut changer de comportement sans qu’une ligne du dépôt bouge',
        });
      }

      if (!aRun) {
        continue;
      }

      const shell = etape.shell;
      const interpréteur = shell === undefined ? 'bash' : String(shell).trim().split(/\s+/)[0];

      if (!SHELLS_ANALYSABLES.has(interpréteur)) {
        verifier(false, {
          fichier: nom,
          etape: nomEtape,
          tag: 'shell-non-analysable',
          message:
            `l’étape déclare \`shell: ${shell}\` : ce contrôle ne sait analyser ` +
            'que les scripts confiés à bash',
        });
        continue;
      }

      const analyse = analyserScript(etape.run);
      verifier(analyse.ok, {
        fichier: nom,
        etape: nomEtape,
        tag: 'script-invalide',
        message: `le script est refusé par \`bash -n\` : ${analyse.detail}`,
      });
    }
  }
}

/** Le dossier à analyser : `.github/workflows`, ou celui passé en argument. */
function dossierDemande() {
  const rang = process.argv.indexOf('--dossier');
  if (rang === -1) {
    return DOSSIER_PAR_DEFAUT;
  }

  const valeur = process.argv[rang + 1];
  if (valeur === undefined) {
    console.error('`--dossier` attend un chemin.');
    process.exit(2);
  }
  return valeur;
}

function main() {
  const dossier = dossierDemande();

  let contenu;
  try {
    contenu = readdirSync(dossier);
  } catch (erreur) {
    console.error(`Dossier illisible : ${dossier} (${erreur.code ?? 'erreur inconnue'})`);
    process.exit(1);
  }

  const fichiers = contenu
    .filter((nom) => EXTENSIONS.some((extension) => nom.endsWith(extension)))
    // `readdirSync` ne garantit aucun ordre : trier rend les rapports comparables
    // d'une exécution à l'autre.
    .sort();

  // La fermeture de la liste, dans les deux sens. C'est ce qui distingue ce
  // contrôle d'une simple boucle sur ce que le dossier contient.
  for (const attendu of FLUX_ATTENDUS) {
    verifier(fichiers.includes(attendu), {
      fichier: attendu,
      tag: 'flux-absent',
      message:
        'flux attendu absent du dossier : le contrôle ne le vérifie plus, et ' +
        'rien d’autre ne le signalerait',
    });
  }

  for (const present of fichiers) {
    verifier(FLUX_ATTENDUS.includes(present), {
      fichier: present,
      tag: 'flux-non-declare',
      message:
        'ce flux existe mais ne figure pas dans FLUX_ATTENDUS : décidez s’il ' +
        'doit tourner dans la chaîne de vérification, puis déclarez-le',
    });
  }

  for (const nom of fichiers) {
    analyserFlux(nom, readFileSync(join(dossier, nom), 'utf8'));
  }

  console.log(
    `${fichiers.length} flux analysé(s), ${verifications} vérification(s), ` +
      `${defauts.length} défaut(s)`,
  );

  for (const defaut of defauts) {
    const ou = defaut.etape ? `${defaut.fichier} › ${defaut.etape}` : defaut.fichier;
    console.error(`  [${defaut.tag}] ${ou} — ${defaut.message}`);
  }

  if (defauts.length > 0) {
    console.error('\nCorrigez les défauts ci-dessus : un flux refusé ici échouerait sur GitHub,');
    console.error('après l’installation des dépendances, voire après un build complet.');
    process.exitCode = 1;
  }
}

main();
