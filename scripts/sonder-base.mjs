/**
 * =============================================================================
 *  Où en est la base, mesuré depuis l'extérieur, avec la seule clé publiable
 * =============================================================================
 *
 *  POURQUOI CE FICHIER
 *  -------------------
 *  Les dix migrations sont collées une par une dans l'éditeur SQL, et le dépôt
 *  n'a aucun moyen de savoir où en est la base distante : elle n'est pas dans le
 *  dépôt, et aucun projet Supabase n'y est lié. La question « le huitième
 *  collage est-il passé ? » se posait donc à la lecture de ce qu'on croyait
 *  avoir fait. Ce script y répond par la **mesure**, avec la clé publiable —
 *  celle que porte l'application, donc celle qui décide de ce que les familles
 *  voient.
 *
 *  CE QUI PROUVE LA PRÉSENCE, ET CE QUI PROUVE L'ABSENCE
 *  -----------------------------------------------------
 *  Le piège de cette sonde a été mesuré, et il vaut d'être écrit : **`200` ne
 *  distingue pas « lisible » de « refusé par une politique »**. Une table sous
 *  RLS sans politique de lecture rend `200` avec une liste **vide** — c'est la
 *  règle du projet, un refus de politique n'est pas une erreur. Seul un
 *  privilège manquant produit un code d'erreur.
 *
 *  La présence se lit donc sur **deux** codes, et non sur un seul :
 *
 *    `200`      la colonne existe et le privilège est accordé ;
 *    `42501`    la colonne **existe** et le privilège est refusé — PostgreSQL
 *               détecte une colonne inconnue **avant** de vérifier les
 *               privilèges, donc ce refus prouve la présence ;
 *    `42703`    la colonne n'existe pas ;
 *    `PGRST205` la table n'existe pas.
 *
 *  LES TÉMOINS SONT OBLIGATOIRES
 *  -----------------------------
 *  Un relevé qui ne sait pas dire « non » ne prouve rien : si le projet
 *  n'existait plus, tout rendrait une erreur et le relevé serait illisible. Trois
 *  témoins, dont la réponse est connue d'avance, sont donc mesurés **en premier**,
 *  et le script s'arrête si l'un d'eux se comporte autrement.
 *
 *  CE QU'IL NE PROUVE PAS
 *  ----------------------
 *  Il mesure la **forme** du schéma, jamais le contenu des politiques : un refus
 *  de politique rend une liste vide, pas un message, et la clé publiable ne
 *  distingue donc pas une table vide d'une table qu'on lui refuse. La cinquième
 *  migration (`20260921120000_vote_connecte.sql`) **n'a d'ailleurs aucun
 *  marqueur mesurable** : elle remplace une politique d'insertion, et rien ne
 *  l'observe de l'extérieur.
 *
 *  Il demande le réseau, et ne fait donc pas partie de `npm run verify`.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const RACINE = new URL('../', import.meta.url);

/** L'adresse du projet et la clé publiable, lues à la source de l'application. */
function identifiants() {
  let contenu;
  try {
    contenu = readFileSync(fileURLToPath(new URL('.env.local', RACINE)), 'utf8');
  } catch {
    throw new Error(
      'identifiants introuvables : `.env.local` est absent.\n' +
        '  Ce fichier porte les deux valeurs publiques de l’application.',
    );
  }

  const lire = (nom) => {
    const trouve = new RegExp(`^${nom}\\s*=\\s*(\\S+)`, 'm').exec(contenu);
    if (trouve === null) throw new Error(`\`${nom}\` est absente de \`.env.local\``);
    return trouve[1].replace(/^["']|["']$/g, '');
  };

  return {
    base: lire('EXPO_PUBLIC_SUPABASE_URL').replace(/\/+$/, ''),
    cle: lire('EXPO_PUBLIC_SUPABASE_ANON_KEY'),
  };
}

const { base, cle } = identifiants();
const entetes = { apikey: cle, Authorization: `Bearer ${cle}` };

/** Les codes qui prouvent qu'une colonne est là, et ceux qui prouvent qu'elle ne l'est pas. */
const PRESENTE = new Set([200, 42501]);
const ABSENTE = new Set([42703]);

/**
 * Un marqueur par migration mesurable.
 *
 * La colonne est choisie pour être **posée par une seule migration** : c'est ce
 * qui permet de lire, dans le relevé, quel collage manque plutôt que de savoir
 * seulement que « quelque chose » manque.
 */
const MARQUEURS = [
  { chemin: 'profiles.display_name', table: 'profiles', colonne: 'display_name', migration: 1 },
  {
    chemin: 'cantine_reservations.user_id',
    table: 'cantine_reservations',
    colonne: 'user_id',
    migration: 1,
  },
  { chemin: 'signalements.author_id', table: 'signalements', colonne: 'author_id', migration: 1 },
  {
    chemin: 'discussion_messages.author_id',
    table: 'discussion_messages',
    colonne: 'author_id',
    migration: 1,
  },
  { chemin: 'documents.visibility', table: 'documents', colonne: 'visibility', migration: 2 },
  { chemin: 'messages.author_id', table: 'messages', colonne: 'author_id', migration: 2 },
  { chemin: 'sondage_votes.voter_id', table: 'sondage_votes', colonne: 'voter_id', migration: 2 },
  { chemin: 'push_tokens.token', table: 'push_tokens', colonne: 'token', migration: 3 },
  { chemin: 'annonces.is_draft', table: 'annonces', colonne: 'is_draft', migration: 4 },
  { chemin: 'annonces.image_path', table: 'annonces', colonne: 'image_path', migration: 6 },
  {
    chemin: 'profiles.est_super_admin',
    table: 'profiles',
    colonne: 'est_super_admin',
    migration: 6,
  },
  { chemin: 'commentaires.sondage_id', table: 'commentaires', colonne: 'sondage_id', migration: 7 },
  { chemin: 'commentaires.menu_id', table: 'commentaires', colonne: 'menu_id', migration: 7 },
  { chemin: 'reglages.valeur', table: 'reglages', colonne: 'valeur', migration: 8 },
  { chemin: 'annonces.epinglee_at', table: 'annonces', colonne: 'epinglee_at', migration: 9 },
];

/**
 * Les marqueurs des migrations qui n'ajoutent **aucune colonne**.
 *
 * La onzième crée une table, et rien d'autre : aucune colonne d'une table
 * existante ne peut donc la signaler. Un marqueur de colonne chercherait
 * `cantine_items.category` et lirait `42703` avant le collage, `200` après —
 * mais `42703` ne dit pas « la table n'est pas là », il dit « la colonne n'est
 * pas là », et le jour où la table existerait sans sa colonne, la sonde
 * accuserait la migration à tort.
 *
 * La lecture est ici **attendue ouverte** : `cantine_items` se lit avec la seule
 * clé publiable, parce que c'est ce que les familles consultent sans compte. Un
 * `42501` n'est donc pas « la migration manque » — il dit que la table est là et
 * que sa politique ou son `grant` ne l'est pas, ce qui est un défaut d'une autre
 * nature, et le message le nomme.
 */
const MARQUEURS_TABLES = [
  {
    chemin: 'cantine_items',
    table: 'cantine_items',
    colonne: 'category',
    migration: 11,
    lecture: 'lisible sans compte — c’est ce que les familles consultent',
  },
];

/**
 * Les fonctions, sondées **sans écrire**.
 *
 * `enregistrer_jeton` reçoit une plateforme que la contrainte de la table
 * refuse : l'appel échoue sur `23514`, donc la fonction **existe**, et aucune
 * ligne n'est écrite. Un appel réussi aurait été un sondage qui écrit, ce qui
 * n'est plus une lecture.
 *
 * `decider_adhesion` et `changer_role` ne sont pas sondées : elles attendent des
 * arguments, et un appel à vide rend `PGRST202` — « fonction ou signature
 * introuvable ». Le code ne distingue donc pas « absente » de « mal appelée », et
 * une sonde qui ne sait pas dire laquelle des deux ment.
 */
const FONCTIONS = [
  {
    nom: 'lister_conversations',
    chemin: '/rest/v1/rpc/lister_conversations',
    corps: {},
    migration: 6,
    present: (r) => r.code === '42501',
    lecture: 'présente, refusée à la clé publiable',
  },
  {
    nom: 'enregistrer_jeton',
    chemin: '/rest/v1/rpc/enregistrer_jeton',
    corps: { p_token: 'sonde-sans-ecriture', p_platform: 'windows' },
    migration: 10,
    present: (r) => r.code === '23514',
    lecture: 'présente, et la contrainte de la table refuse la valeur',
  },
];

/** Les témoins : leur réponse est connue, et sans eux le relevé ne prouve rien. */
const TEMOINS = [
  {
    nom: 'annonces.colonne_inventee',
    chemin: '/rest/v1/annonces?select=colonne_inventee&limit=0',
    attendu: 'colonne absente (42703)',
    lu: (r) => r.code === '42703',
  },
  {
    nom: 'table_inventee',
    chemin: '/rest/v1/table_inventee?select=id&limit=0',
    attendu: 'table absente (PGRST205)',
    lu: (r) => r.code === 'PGRST205',
  },
  {
    nom: 'fonction_inventee',
    chemin: '/rest/v1/rpc/fonction_inventee',
    corps: {},
    attendu: 'fonction absente (PGRST202)',
    lu: (r) => r.code === 'PGRST202',
  },
];

/** Interroge un chemin et réduit la réponse à ce qui décide : code HTTP et code PostgreSQL. */
async function sonder(chemin, corps = null) {
  const reponse = await fetch(`${base}${chemin}`, {
    method: corps === null ? 'GET' : 'POST',
    headers: corps === null ? entetes : { ...entetes, 'Content-Type': 'application/json' },
    body: corps === null ? undefined : JSON.stringify(corps),
  });

  let charge = null;
  try {
    charge = await reponse.json();
  } catch {
    // Une réponse vide est une réponse : on ne conclut pas sur son corps.
  }
  return { statut: reponse.status, code: charge?.code ?? null };
}

console.log(`Projet éprouvé : ${base}\n`);

//  Les témoins d'abord : sans eux, un relevé ne se distingue pas d'un projet mort.
console.log('Témoins');
const temoinsPerdus = [];
for (const temoin of TEMOINS) {
  const resultat = await sonder(temoin.chemin, temoin.corps ?? null);
  const conforme = temoin.lu(resultat);
  console.log(
    `  ${conforme ? '✔' : '✘'} ${temoin.nom.padEnd(26)} ${temoin.attendu}` +
      `${conforme ? '' : ` — obtenu ${resultat.statut} ${resultat.code ?? ''}`}`,
  );
  if (!conforme) temoinsPerdus.push(temoin.nom);
}

if (temoinsPerdus.length > 0) {
  console.error(
    '\nUn témoin ne se comporte pas comme attendu : la sonde ne peut rien conclure.\n' +
      '  Soit l’adresse du projet est fausse, soit la clé publiable n’est plus la bonne.',
  );
  process.exit(1);
}

console.log('\nMarqueurs de migration');
const manquants = [];
for (const { chemin, table, colonne, migration } of MARQUEURS) {
  const resultat = await sonder(`/rest/v1/${table}?select=${colonne}&limit=0`);
  const code = resultat.statut === 200 ? 200 : Number(resultat.code) || resultat.statut;
  const present = PRESENTE.has(code);

  console.log(
    `  ${present ? '✔' : '✘'} ${chemin.padEnd(34)} ` +
      `${code === 200 ? 'privilège accordé' : code === 42501 ? 'refusée, donc présente' : `absente (${resultat.code ?? code})`}` +
      `${present ? `  [migration ${migration}]` : ''}`,
  );
  if (!present && ABSENTE.has(code)) manquants.push(`${chemin} (migration ${migration})`);
  else if (!present)
    manquants.push(`${chemin} — réponse inattendue ${code} (migration ${migration})`);
}

//  Les tables qui portent à elles seules leur migration. Elles ne se contentent
//  pas d'exister : leur lecture est le **service** qu'elles rendent, et un refus
//  y est un défaut distinct de l'absence.
console.log('\nMarqueurs de table');
for (const { chemin, table, colonne, migration, lecture } of MARQUEURS_TABLES) {
  const resultat = await sonder(`/rest/v1/${table}?select=${colonne}&limit=0`);
  const code = resultat.statut === 200 ? 200 : Number(resultat.code) || resultat.statut;
  const lisible = code === 200;

  console.log(
    `  ${lisible ? '✔' : '✘'} ${chemin.padEnd(34)} ` +
      `${lisible ? lecture : `obtenue ${resultat.statut} ${resultat.code ?? code}`}  [migration ${migration}]`,
  );

  if (!lisible) {
    manquants.push(
      code === 42501
        ? `${chemin} — la table est là, mais la lecture anonyme est refusée : ` +
            `la politique ou le grant manque (migration ${migration})`
        : `${chemin} (migration ${migration})`,
    );
  }
}

console.log('\nFonctions du bureau');
for (const { nom, chemin, corps, migration, present, lecture } of FONCTIONS) {
  const resultat = await sonder(chemin, corps);
  const conforme = present(resultat);
  console.log(
    `  ${conforme ? '✔' : '✘'} ${nom.padEnd(26)} ` +
      `${conforme ? lecture : `obtenu ${resultat.statut} ${resultat.code ?? ''}`}  [migration ${migration}]`,
  );
  if (!conforme) manquants.push(`${nom}() (migration ${migration})`);
}

console.log('\n--- verdict ---');
if (manquants.length === 0) {
  console.log('tous les marqueurs des onze migrations répondent.');
  console.log('la cinquième n’a pas de marqueur mesurable : elle remplace une politique,');
  console.log('et aucun appel public ne l’observe — la recoller est sans risque.');
  process.exit(0);
}

console.log('ce qui ne répond pas comme attendu :');
for (const manque of manquants) console.log(`  - ${manque}`);
console.log('\nLe numéro est celui du fichier à recoller, dans `supabase/migrations/` :');
console.log('  1  20260916120000_init.sql');
console.log('  2  20260919120000_rubriques.sql');
console.log('  3  20260920120000_acces_public.sql');
console.log('  4  20260921090000_administration.sql');
console.log('  5  20260921120000_vote_connecte.sql   (non mesurable)');
console.log('  6  20260921150000_super_admin.sql');
console.log('  7  20260921180000_commentaires_trois_cibles.sql');
console.log('  8  20260921210000_reglages_et_moderation.sql');
console.log('  9  20260922090000_annonce_epinglee.sql');
console.log('  10 20260922130000_jeton_appareil.sql');
console.log('  11 20260922190000_cantine_items.sql');
process.exit(1);
