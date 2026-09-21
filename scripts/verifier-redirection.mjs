/**
 * =============================================================================
 *  Les adresses de retour sont-elles réellement acceptées par Supabase ?
 * =============================================================================
 *
 *  POURQUOI CE FICHIER
 *  -------------------
 *  Deux réglages du tableau de bord Supabase décident si un lien reçu par
 *  e-mail ramène l'adhérent dans l'application : le « Site URL », et la liste
 *  blanche « Redirect URLs ». Les deux vivent hors du dépôt, et le dépôt répète
 *  depuis le premier jour qu'**aucun test ne peut tenir leur accord avec le
 *  code**. C'était vrai d'un test ; ce n'était pas vrai d'une **mesure**.
 *
 *  Ce script mesure, et il l'a fallu : le 21 septembre 2026, les deux réglages
 *  étaient restés à leur valeur par défaut, et **les deux flux d'e-mail étaient
 *  cassés en silence**. L'adhérent qui confirmait son adresse lisait « ce site
 *  est inaccessible » sur `http://localhost:3000` — alors que son compte était
 *  bel et bien confirmé. L'opération avait réussi et l'écran disait le contraire.
 *
 *  COMMENT IL LE MESURE, ET POURQUOI CELA FONCTIONNE
 *  ------------------------------------------------
 *  GoTrue refuse une adresse absente de sa liste blanche, et la **remplace**
 *  alors par le « Site URL ». Le remplacement est visible : la réponse est un
 *  `303` dont l'en-tête `Location` porte l'adresse finalement retenue.
 *
 *  Ce script exploite exactement cela, avec **deux témoins** :
 *
 *    1. une adresse dont personne ne peut vouloir — un domaine `.invalid` — est
 *       envoyée en premier. Le `Location` qu'elle rend **est** le « Site URL » :
 *       il est donc *découvert*, jamais supposé ;
 *    2. chaque adresse de l'application est ensuite envoyée. Si le `Location`
 *       la porte telle quelle, elle est retenue ; s'il porte le repli, elle est
 *       refusée.
 *
 *  Les deux issues se distinguent sans ambiguïté parce qu'elles ne peuvent pas
 *  se confondre : un « Site URL » est une adresse `http(s)`, et les adresses de
 *  l'application sont des schémas personnalisés.
 *
 *  Aucun jeton valide n'est employé, aucun compte n'est touché : le jeton est
 *  volontairement invalide, et l'erreur rendue — `otp_expired` — est le
 *  véhicule du `Location`, pas son sujet.
 *
 *  CE QU'IL NE PROUVE PAS
 *  ----------------------
 *  Il ne prouve pas qu'un **envoi** d'e-mail partira : le serveur SMTP et
 *  l'activation de la confirmation d'adresse sont d'autres réglages, et aucun
 *  appel public ne les révèle. Il ne remplace pas non plus un essai réel : il
 *  dit que la redirection serait acceptée, pas que le courrier est arrivé.
 *
 *  Il demande le réseau, et ne fait donc pas partie de `npm run verify`.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const RACINE = new URL('../', import.meta.url);

/**
 * Le repli de la confirmation d'adresse, et celui de la réinitialisation.
 *
 * La liste vient du **module** qui les nomme, jamais d'une copie : recopier les
 * chemins ici ferait de ce script un second endroit à corriger le jour où le
 * schéma change — et c'est précisément l'écart qu'il existe pour mesurer.
 */
const { REDIRECT_PATHS } = await import(new URL('src/auth/redirectPaths.ts', RACINE));

/** Un domaine réservé aux exemples : il ne peut être dans aucune liste blanche. */
const TEMOIN = 'https://adresse-de-temoin.invalid/rien';

/** Le schéma déclaré, lu à la source unique : `app.json`. */
function schemaDeclare() {
  const { expo } = JSON.parse(readFileSync(fileURLToPath(new URL('app.json', RACINE)), 'utf8'));
  return expo.scheme;
}

/**
 * L'adresse du projet, sans barre finale.
 *
 * L'argument l'emporte, et le fichier `.env.local` sert de défaut : c'est le
 * même que celui de l'application, donc il ne peut pas désigner un autre projet
 * que celui qu'on éprouve.
 */
function adresseDuProjet() {
  const argument = process.argv[2];
  if (argument !== undefined) {
    return argument.replace(/\/+$/, '');
  }

  let contenu;
  try {
    contenu = readFileSync(fileURLToPath(new URL('.env.local', RACINE)), 'utf8');
  } catch {
    throw new Error(
      'adresse du projet introuvable : ni argument, ni `.env.local`.\n' +
        '  usage : node scripts/verifier-redirection.mjs https://<projet>.supabase.co',
    );
  }

  const trouve = /^EXPO_PUBLIC_SUPABASE_URL\s*=\s*(\S+)/m.exec(contenu);
  if (trouve === null) {
    throw new Error('`EXPO_PUBLIC_SUPABASE_URL` est absente de `.env.local`');
  }
  return trouve[1].replace(/\/+$/, '');
}

/**
 * L'adresse que GoTrue retient pour `redirect_to`.
 *
 * `redirect: 'manual'` est indispensable : sans lui, `fetch` suit la redirection
 * et l'on ne verrait plus l'en-tête — la mesure rendrait `null` sur un
 * dispositif qui fonctionne, et l'on conclurait à l'inverse de la vérité.
 */
async function adresseRetenue(base, adresse) {
  const requete =
    `${base}/auth/v1/verify?token=sonde-invalide&type=signup` +
    `&redirect_to=${encodeURIComponent(adresse)}`;

  const reponse = await fetch(requete, { redirect: 'manual' });
  const location = reponse.headers.get('location');

  // Le fragment porte l'erreur ; seule l'adresse nous intéresse.
  return location === null ? null : location.split('#')[0];
}

const base = adresseDuProjet();
const schema = schemaDeclare();

console.log(`Projet éprouvé : ${base}`);
console.log(`Schéma déclaré : ${schema}\n`);

const repli = await adresseRetenue(base, TEMOIN);

if (repli === null) {
  console.error(
    'Aucune redirection rendue pour le témoin : ce projet ne redirige pas du tout,\n' +
      '  et cette sonde ne peut donc rien conclure. Vérifiez l’adresse du projet.',
  );
  process.exit(1);
}

const attendues = REDIRECT_PATHS.map((chemin) => `${schema}://${chemin}`);
const refusees = [];

console.log(`Repli mesuré (le « Site URL ») : ${repli}`);
if (/^https?:\/\/(localhost|127\.0\.0\.1)/.test(repli)) {
  console.log(
    '  ✘ c’est l’adresse par défaut de Supabase : un lien refusé, ou ouvert sur un\n' +
      '    ordinateur, mène à un port fermé de la machine du lecteur.',
  );
}

console.log('');
for (const adresse of attendues) {
  const retenue = await adresseRetenue(base, adresse);

  if (retenue === adresse) {
    console.log(`  ✔ ${adresse} — retenue`);
  } else {
    console.log(`  ✘ ${adresse} — remplacée par ${retenue ?? '(rien)'}`);
    refusees.push(adresse);
  }
}

if (refusees.length > 0) {
  console.log(
    '\nCe qu’il reste à faire, dans le tableau de bord Supabase :\n' +
      '  Authentication > URL Configuration\n' +
      `    • Site URL     : une adresse réelle, jamais « http://localhost:3000 »\n` +
      `    • Redirect URLs : ajouter ${refusees.join(', ')}\n` +
      'puis relancer ce script : les trois lignes doivent passer au vert.',
  );
  process.exit(1);
}

console.log('\nLes deux réglages sont en place.');
