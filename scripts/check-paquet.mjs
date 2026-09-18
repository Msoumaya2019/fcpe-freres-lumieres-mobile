/**
 * Vérifie le **contenu** d'un paquet iOS compilé, au lieu de supposer que la
 * compilation a emporté la configuration.
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
 * `<chemin>` est le `.app` compilé ou directement son `main.jsbundle`. Les deux
 * variables `EXPO_PUBLIC_SUPABASE_URL` et `EXPO_PUBLIC_SUPABASE_ANON_KEY`
 * doivent être posées dans l'environnement. Aucune valeur n'est jamais
 * imprimée : un journal de compilation ne doit pas devenir une fuite.
 */

import { readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

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

  const bundle = statSync(chemin).isDirectory() ? join(chemin, 'main.jsbundle') : chemin;

  let contenu;
  try {
    contenu = readFileSync(bundle, 'latin1');
  } catch {
    console.error(`  [paquet-introuvable] aucun bundle lisible ici : ${bundle}`);
    console.error('\nLa compilation n’a pas produit ce qu’elle annonce.');
    process.exitCode = 1;
    return;
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
