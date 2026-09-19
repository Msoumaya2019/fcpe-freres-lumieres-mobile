/**
 * Vérifie le **contenu** d'un paquet compilé — `.app` iOS, `main.jsbundle`, ou
 * `.apk` — au lieu de supposer que la compilation a emporté la configuration.
 *
 * L'APK A ÉTÉ AJOUTÉ APRÈS COUP, ET VOICI POURQUOI
 * ------------------------------------------------
 * `ios-unsigned.yml` appelait ce contrôle depuis le premier jour ;
 * `eas-build.yml` ne l'appelait pas. L'APK était donc publié sans que personne
 * ne lise son contenu. La vérification avait pourtant été faite — **une fois, à
 * la main**, et elle avait trouvé les deux valeurs présentes. Mais une
 * vérification faite à la main ne se refait pas au build suivant : c'est la
 * définition d'un contrôle absent, et le prochain APK aurait pu partir muet.
 *
 * Le bundle Android ne vit pas au même endroit que celui d'iOS — il est rangé
 * dans l'archive sous un nom fixé par le format — et il faut donc l'en extraire.
 * L'extraction se fait ici, sans dépendance externe, pour deux raisons : `unzip`
 * n'existe pas sur toutes les machines, et surtout un banc ne peut éprouver que
 * ce qu'il peut construire lui-même. `zlib` est dans Node.
 *
 * POURQUOI CE CONTRÔLE EXISTE
 * ---------------------------
 * Une compilation qui réussit ne dit rien du contenu. `EXPO_PUBLIC_*` est
 * remplacé au **regroupement**, par une réécriture statique de l'arbre
 * syntaxique : si la variable manquait sur l'exécuteur, l'application se
 * compile, s'installe, s'ouvre, et n'affiche aucune donnée — sans que rien,
 * nulle part, ne signale d'erreur. Un paquet se vérifie donc en le **lisant**.
 *
 * LA LEÇON DES QUATRE ESSAIS
 * --------------------------
 * Ce contrôle a été écrit quatre fois. Les quatre fois, le défaut a été le
 * même : il cherchait dans le paquet quelque chose que le **code source**
 * contient déjà, ou que le **format** du bundle fabrique. Chaque version
 * refusait un paquet sain.
 *
 *   1. `grep "service_role"` — ce mot est dans `src/config/env.ts`, qui refuse
 *      les clefs de service et les nomme. Mesure : présent dans le bundle.
 *   2. `grep "sb_secret_"` — ce préfixe est à `src/config/env.ts:139`, dans
 *      `anonKey.startsWith('sb_secret_')`. Mesure : présent aussi.
 *   3. `grep "supabase.co"` — le domaine apparaît **87 fois** dans le paquet
 *      `@supabase/supabase-js`. Ce contrôle ne mesurait donc rien du tout : il
 *      aurait été vert sur un bundle sans aucune configuration.
 *   4. Un motif « préfixe suivi de vingt caractères » — mesuré sur un vrai
 *      bundle Hermes, la chaîne `sb_secret_` y est suivie de `storedError`, soit
 *      **onze** caractères de clef : le seuil a sauvé le contrôle à neuf
 *      caractères près. Une chaîne voisine un peu plus longue aurait fabriqué
 *      une fausse clef secrète.
 *
 * La cause est la même à chaque fois : dans une table de chaînes Hermes, les
 * chaînes sont **collées bout à bout**, sans séparateur. Un motif qui cherche
 * un préfixe et laisse courir le corps ne peut pas distinguer une clef de deux
 * chaînes voisines mises bout à bout. Mesuré sur le même bundle : la sentinelle
 * de l'URL est suivie de `FAULT_HEADERS_RECEIVEDOMException…`, ce qui produit
 * une fausse « clef » de cent trente caractères.
 *
 * CE QUE CE CONTRÔLE FAIT DONC
 * ----------------------------
 * Il ne lit plus aucun motif sur les clefs préfixées. Il compare des **valeurs
 * exactes**, ce qui ne peut ni déborder sur une chaîne voisine, ni confondre un
 * mot du code avec une clef :
 *
 *   - l'URL attendue est présente, littéralement ;
 *   - la clef attendue est présente, littéralement ;
 *   - la clef attendue est bien une clef **publique** — c'est le risque réel,
 *     un copier-coller depuis la mauvaise ligne du tableau de bord ;
 *   - le paquet ne contient aucun jeton `service_role`.
 *
 * Le dernier contrôle garde un motif, mais un motif **délimité** : un JWT a
 * trois segments séparés par des points, donc sa charge utile est bornée des
 * deux côtés et le collage des chaînes voisines ne peut pas la contaminer.
 * Mesure sur un bundle sain : zéro occurrence de cette forme.
 *
 * CE QUE CE CONTRÔLE NE PEUT PAS VOIR
 * -----------------------------------
 * Il lit un fichier, pas une application. Il ne dit pas si la clef trouvée est
 * acceptée par Supabase, si les politiques RLS protègent les tables, ni si
 * l'adhérent verra ses données : cela se joue au banc des politiques, et à
 * l'essai sur un appareil.
 *
 * Et il ne détecte pas une clef secrète **inconnue** qui aurait été écrite
 * ailleurs que dans la variable vérifiée. Chercher une clef dont on ne connaît
 * pas la valeur demanderait un motif, et la mesure ci-dessus montre qu'un motif
 * est sans valeur ici. Ce cas se couvre à la source : `src/config/env.ts` ne
 * lit que `process.env`, et `check-env-guard` monte la garde sur ce point.
 *
 * USAGE
 * -----
 *     node scripts/check-paquet.mjs <chemin>
 *
 * `<chemin>` est le `.app` compilé, son `main.jsbundle`, ou l'`.apk` — dans ce
 * dernier cas le bundle est extrait de l'archive. Les deux variables
 * `EXPO_PUBLIC_SUPABASE_URL` et `EXPO_PUBLIC_SUPABASE_ANON_KEY` doivent être
 * posées dans l'environnement. Aucune valeur n'est jamais imprimée : un journal
 * de compilation ne doit pas devenir une fuite.
 */

import { readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { inflateRawSync } from 'node:zlib';

/**
 * Une clef de l'ancienne famille : un JWT à trois segments.
 *
 * Les points sont ce qui rend ce motif sûr : la charge utile est bornée des
 * deux côtés, donc insensible au collage des chaînes voisines.
 */
const JETON = /eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{16,}\.[A-Za-z0-9_-]{4,}/g;

/**
 * La charge utile d'un JWT, ou `null` si elle n'est pas lisible.
 *
 * Le rôle d'une clef est dans sa charge utile, qui n'est pas chiffrée, seulement
 * encodée. C'est la même lecture que celle de la garde de l'application, mais
 * elle est refaite ici plutôt qu'importée : `src/config/env.ts` est du
 * TypeScript destiné au bundler, et le charger depuis un script Node
 * demanderait un transpileur pour trois lignes.
 */
function chargeUtile(jeton) {
  const segment = jeton.split('.')[1] ?? '';
  const base64 = segment.replace(/-/g, '+').replace(/_/g, '/');
  const complete = base64 + '='.repeat((4 - (base64.length % 4)) % 4);

  try {
    return JSON.parse(Buffer.from(complete, 'base64').toString('utf8'));
  } catch {
    return null;
  }
}

/** Le rôle porté par un jeton, ou `null`. */
function roleDuJeton(jeton) {
  const charge = chargeUtile(jeton);
  if (charge === null || typeof charge !== 'object') {
    return null;
  }
  const role = charge.role;
  return typeof role === 'string' ? role : null;
}

/**
 * Décrit une clef **sans la reproduire**.
 *
 * Un contrôle qui imprime la clef qu'il vient de trouver écrirait un secret
 * dans le journal de compilation, qui est public sur un dépôt public. Seuls le
 * préfixe et la longueur sortent d'ici.
 */
function decrire(clef) {
  const prefixe = /^sb_(publishable|secret)_/.exec(clef);
  if (prefixe !== null) {
    return `sb_${prefixe[1]}_… (${clef.length} caractères)`;
  }
  const role = roleDuJeton(clef);
  return `JWT (${clef.length} caractères${role === null ? '' : `, rôle « ${role} »`})`;
}

/**
 * Pourquoi une clef n'est pas une clef *publique*, ou `null`.
 *
 * C'est la garde de l'application, reprise telle quelle dans son intention :
 * les deux familles de clefs Supabase coexistent, et chacune a sa façon de
 * désigner un rôle privilégié.
 */
function problemeDeClef(clef) {
  if (clef.startsWith('sb_secret_')) {
    return 'est une clef secrète (« sb_secret_ »)';
  }

  const segments = clef.split('.');
  if (segments.length === 3 && roleDuJeton(clef) === 'service_role') {
    return 'est un jeton « service_role »';
  }

  return null;
}

/**
 * Le bundle JavaScript d'un APK, tel que le format le nomme.
 *
 * Ce nom n'est pas un choix : c'est celui qu'Expo inscrit dans l'archive. Le
 * chercher ailleurs serait chercher un fichier qui n'existe pas.
 */
const BUNDLE_ANDROID = 'assets/index.android.bundle';

/** La signature d'un en-tête local d'archive ZIP : « PK\x03\x04 ». */
const ENTETE_ZIP = 0x04034b50;

/**
 * Extrait une entrée d'une archive ZIP, sans dépendance externe.
 *
 * Le parcours suit les **en-têtes locaux**, l'un après l'autre, plutôt que le
 * répertoire central : chaque en-tête local porte la taille compressée de son
 * entrée, ce qui suffit à atteindre le suivant. C'est plus court, et c'est
 * exactement ce qu'un APK contient — les tailles y sont renseignées.
 *
 * Ce que ce parcours ne sait pas faire, et il faut le dire : une entrée dont la
 * taille serait écrite **après** les données, dans un descripteur, porterait une
 * taille compressée nulle et ferait dérailler la lecture. Aucun outil qui
 * produit un APK n'écrit ainsi — `unzip -l` a servi de témoin sur le binaire
 * réel, et ses tailles sont renseignées. Le jour où une archive résisterait, la
 * sortie le dirait par `bundle-absent`, jamais par un silence.
 *
 * @param {Buffer} octets l'archive entière
 * @param {string} nomCherche le nom exact de l'entrée
 * @returns {Buffer|null} le contenu décompressé, ou `null` si l'entrée est absente
 */
function extraireDuZip(octets, nomCherche) {
  let position = 0;

  while (position + 30 <= octets.length) {
    if (octets.readUInt32LE(position) !== ENTETE_ZIP) {
      return null;
    }

    const methode = octets.readUInt16LE(position + 8);
    const tailleCompressee = octets.readUInt32LE(position + 18);
    const tailleNom = octets.readUInt16LE(position + 26);
    const tailleSupplement = octets.readUInt16LE(position + 28);

    const debutNom = position + 30;
    const debutDonnees = debutNom + tailleNom + tailleSupplement;
    const nom = octets.toString('utf8', debutNom, debutNom + tailleNom);

    if (nom === nomCherche) {
      const donnees = octets.subarray(debutDonnees, debutDonnees + tailleCompressee);
      // Méthode 0 : rangée telle quelle. Méthode 8 : déflatée — le seul autre
      // cas qu'un APK emploie.
      return methode === 0 ? donnees : inflateRawSync(donnees);
    }

    position = debutDonnees + tailleCompressee;
  }

  return null;
}

function main() {
  const defauts = [];
  let verifications = 0;

  const verifier = (condition, defaut) => {
    verifications += 1;
    if (!condition) {
      defauts.push(defaut);
    }
  };

  const chemin = process.argv[2];
  if (chemin === undefined) {
    console.error('usage : node scripts/check-paquet.mjs <chemin-du-.app-ou-du-main.jsbundle>');
    process.exitCode = 2;
    return;
  }

  const url = (process.env.EXPO_PUBLIC_SUPABASE_URL ?? '').trim();
  const clefAttendue = (process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '').trim();

  // Une variable vide rendrait les comparaisons suivantes **muettes** : une
  // recherche de chaîne vide réussit toujours, et le contrôle serait vert sans
  // avoir rien mesuré. C'est le pire des états, alors il est refusé ici.
  verifier(url !== '', {
    tag: 'variable-url-vide',
    message:
      'EXPO_PUBLIC_SUPABASE_URL est vide : le contrôle ne peut rien comparer, ' +
      'et une comparaison à vide réussit toujours',
  });

  verifier(clefAttendue !== '', {
    tag: 'variable-clef-vide',
    message:
      'EXPO_PUBLIC_SUPABASE_ANON_KEY est vide : le contrôle ne peut rien comparer, ' +
      'et une comparaison à vide réussit toujours',
  });

  if (defauts.length > 0) {
    for (const defaut of defauts) {
      console.error(`  [${defaut.tag}] ${defaut.message}`);
    }
    console.error('\nLe paquet n’a pas été lu : les variables d’environnement manquent.');
    process.exitCode = 1;
    return;
  }

  const cible = statSync(chemin).isDirectory() ? join(chemin, 'main.jsbundle') : chemin;

  let octets;
  try {
    octets = readFileSync(cible);
  } catch {
    console.error(`  [paquet-introuvable] aucun bundle lisible ici : ${cible}`);
    console.error('\nLa compilation n’a pas produit ce qu’elle annonce.');
    process.exitCode = 1;
    return;
  }

  // Un APK est une archive : le bundle y est rangé, et il faut l'ouvrir avant de
  // pouvoir le lire. La détection porte sur la **signature du format**, pas sur
  // l'extension du fichier — un `.apk` renommé reste une archive, et un fichier
  // qui porterait ce nom sans en être une doit être lu pour ce qu'il est.
  let contenu;
  if (octets.length >= 4 && octets.readUInt32LE(0) === ENTETE_ZIP) {
    const extrait = extraireDuZip(octets, BUNDLE_ANDROID);
    if (extrait === null) {
      console.error(
        `  [bundle-absent] l’archive ne contient pas « ${BUNDLE_ANDROID} » : ce n’est ` +
          'pas un paquet Android, ou la compilation n’a rien regroupé',
      );
      process.exitCode = 1;
      return;
    }
    contenu = extrait.toString('latin1');
  } else {
    contenu = octets.toString('latin1');
  }

  verifier(contenu.includes(url), {
    tag: 'url-absente',
    message:
      'l’URL Supabase est absente du bundle : les variables EXPO_PUBLIC_* ne sont ' +
      'pas arrivées jusqu’au regroupement, et l’application s’ouvrira sans données',
  });

  verifier(contenu.includes(clefAttendue), {
    tag: 'clef-publique-absente',
    message:
      'la clef attendue est absente du bundle : l’application refusera de se ' +
      'connecter alors que le paquet semble correct',
  });

  // Le risque réel, et celui qui coûte le plus cher : un copier-coller depuis la
  // mauvaise ligne du tableau de bord. La comparaison porte sur la **variable**,
  // donc elle est exacte — aucun motif, aucune place pour un faux positif.
  const probleme = problemeDeClef(clefAttendue);
  verifier(probleme === null, {
    tag: 'clef-attendue-non-publique',
    message:
      `EXPO_PUBLIC_SUPABASE_ANON_KEY ${probleme}. Cette clef contourne toutes les ` +
      'politiques RLS : remplacez-la par la clef « publishable », puis refaites la ' +
      'compilation — le paquet produit avec elle serait à retirer',
  });

  const jetons = [...new Set(contenu.match(JETON) ?? [])];
  const deService = jetons.filter((jeton) => roleDuJeton(jeton) === 'service_role');

  verifier(deService.length === 0, {
    tag: 'jeton-de-service',
    message:
      'le paquet contient un jeton « service_role » ' +
      `(${deService.map(decrire).join(', ')}) : il contourne toutes les politiques RLS`,
  });

  console.log(
    `${verifications} vérification(s), ${defauts.length} défaut(s) — ` +
      `bundle de ${contenu.length} octets, ` +
      `clef attendue ${decrire(clefAttendue)}, ` +
      `${jetons.length} jeton(s) de forme JWT dans le bundle : ` +
      `${jetons.map(decrire).join(', ') || 'aucun'}`,
  );

  for (const defaut of defauts) {
    console.error(`  [${defaut.tag}] ${defaut.message}`);
  }

  if (defauts.length > 0) {
    console.error('\nCorrigez les défauts ci-dessus avant de distribuer ce paquet.');
    process.exitCode = 1;
  }
}

main();
