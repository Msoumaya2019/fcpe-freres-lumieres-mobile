/** Annonces publiées par le bureau de l'association. */

import { requireSupabase } from '@/config/supabase';
import { toAppError } from '@/errors';
import { documentsUrls } from '@/services/documents';
import type { Annonce, AnnonceWithAuthor } from '@/types/models';

const DEFAULT_LIMIT = 30;

/**
 * Le nom sous lequel une actualité est signée.
 *
 * POURQUOI CE N'EST PAS LE NOM DU COMPTE QUI L'A PUBLIÉE
 * ------------------------------------------------------
 * Les actualités sont écrites par une personne, et signées par le **bureau**.
 * C'est une décision de l'association, et elle a une raison de fond : un
 * article publié sous un nom personnel engage la personne qui le signe, alors
 * qu'il engage le bureau — c'est le bureau qui décide de publier, et c'est à lui
 * que les familles répondent.
 *
 * CE QUE CELA CHANGE POUR LA LECTURE, ET CE QUE CELA LUI ÉPARGNE
 * --------------------------------------------------------------
 * Le nom affiché était auparavant résolu par une **seconde requête** sur
 * `profiles`, à partir de `author_id`. Cette requête n'existe plus sur le chemin
 * des actualités : `public.profiles` n'est lisible que par un porteur de jeton,
 * et un visiteur sans compte se voyait refuser la lecture — ce qui faisait
 * tomber l'accueil **entier** pour un nom d'auteur, photographie et bandeau
 * compris. Un nom fixe ne demande rien à personne, et le défaut ne peut plus se
 * reproduire : il n'y a plus de requête à refuser.
 *
 * `author_id` reste en base et continue de servir à ce qu'il sert vraiment —
 * savoir qui peut **modifier** son article. Seul le nom affiché ne le lit plus.
 *
 * POURQUOI UNE SEULE SIGNATURE POUR TOUTES LES ACTUALITÉS
 * -------------------------------------------------------
 * Si le bureau souhaite un jour signer au nom de leur auteur, c'est ici que cela
 * se décide, et la colonne `author_id` est toujours là pour le permettre. Le
 * choix d'aujourd'hui est l'inverse, et il est explicite plutôt que deviné : une
 * actualité sans auteur (`author_id` nul, ce qu'une suppression de compte
 * produit) reste sans signature, et rien ne lui en invente une.
 */
export const AUTEUR_COLLECTIF = 'Membre de parents d’élèves';

/**
 * Les noms d'auteurs d'un lot de lignes.
 *
 * Le nom est **le même pour tout le monde**, et c'est pourquoi cette fonction
 * n'a plus rien à demander à la base : voir `AUTEUR_COLLECTIF`. Elle garde sa
 * forme — un lot de lignes entre, un lot de lignes enrichies sort — pour que les
 * écrans qui l'appellent n'aient pas à connaître la règle.
 */
function avecAuteurs(rows: readonly Annonce[]): AnnonceWithAuthor[] {
  return rows.map((row) => ({
    ...row,
    //  `select('*')` rend les colonnes qui **existent**, pas celles qu'on attend :
    //  sur une base qui n'a pas encore reçu la neuvième migration, `epinglee_at`
    //  est **absent** de la ligne, et non nul. Sans cette normalisation, la carte
    //  lirait `undefined`, son test `=== null` serait faux, et **toutes** les
    //  actualités s'annonceraient « Épinglée » — un défaut bien plus visible que
    //  celui qu'on cherche à éviter, et qui ne lèverait rien. Un repli ne sert à
    //  rien si la donnée qu'il rend n'a pas la forme attendue.
    epinglee_at: row.epinglee_at ?? null,
    authorName: row.author_id === null ? null : AUTEUR_COLLECTIF,
  }));
}

/**
 * La lecture habituelle : l'épinglée d'abord, puis les dates.
 *
 * Le tri par épinglage est fait par le **serveur**, et ce n'est pas un détail de
 * style : `fetchAnnonces` ne lit que les `limit` actualités les plus récentes.
 * Une actualité plus ancienne que la page n'est donc pas dans le résultat, et
 * aucun réordonnancement fait ensuite dans l'application ne pourrait l'y
 * remettre. L'épinglage d'une annonce que les familles ne voient plus — le cas
 * où il sert vraiment — ne ferait **rien**, sans le dire.
 *
 * Les deux `order` ne s'additionnent pas : le premier trie, le second ne
 * départage que les lignes que le premier laisse à égalité. Une actualité
 * épinglée passe donc devant, et les autres restent du plus récent au plus
 * ancien.
 *
 * `nullsFirst: false` EST LA LIGNE QUI DÉCIDE
 * -------------------------------------------
 * PostgreSQL range les valeurs nulles **comme plus grandes que tout le reste** :
 * en tri décroissant, elles passent donc **en tête**. Sans ce réglage, toutes les
 * actualités non épinglées — c'est-à-dire presque toutes — passeraient devant
 * celle qui est épinglée, et la fonctionnalité serait inversée sans qu'aucune
 * erreur ne soit levée. C'est `check-migration-applicable` qui le mesure, sur un
 * vrai PostgreSQL, et non ce commentaire.
 */
async function lireAvecEpinglee(limit: number) {
  return await requireSupabase()
    .from('annonces')
    .select('*')
    .order('epinglee_at', { ascending: false, nullsFirst: false })
    .order('published_at', { ascending: false })
    .limit(limit);
}

/**
 * La même liste, sans l'épinglage — pour une base qui n'a pas encore reçu la
 * neuvième migration.
 *
 * POURQUOI CE REPLI EXISTE, ET CE QU'IL COÛTE SI ON LE RETIRE
 * ----------------------------------------------------------
 * C'est un défaut **mesuré**, le 20 septembre 2026, et il est du pire genre :
 * PostgreSQL refuse une requête qui nomme une colonne absente, et il la refuse
 * **en bloc** — `42703`, « column annonces.epinglee_at does not exist ». Le
 * `order` d'une seule colonne fait donc tomber la lecture **entière**, et avec
 * elle l'accueil de toutes les familles, photographie et bandeau compris.
 *
 * Une application ne peut pas exiger qu'une migration ait été collée pour
 * continuer d'afficher ce qu'elle affichait la veille. Ici, la colonne manquante
 * ne prive que d'une **nouveauté** : la liste reste exactement celle d'avant, du
 * plus récent au plus ancien, et l'épinglage est simplement sans effet jusqu'au
 * collage. C'est le seul arbitrage qui respecte « ne rien casser ».
 *
 * CE QUE CE REPLI NE DOIT PAS DEVENIR
 * ----------------------------------
 * Un repli qui avalerait n'importe quelle erreur cacherait un vrai refus — une
 * politique RLS, un réseau coupé — derrière une liste qui a l'air normale. C'est
 * pourquoi il n'est pris que sur la reconnaissance écrite dans
 * `colonneEpingleeAbsente`, et pourquoi la seconde lecture lève à son tour si
 * elle échoue. `check-async-wiring` tient les deux moitiés : la colonne gardée
 * est **la même** que celle qui est triée, et le code gardé est celui d'une
 * colonne absente.
 */
async function lireSansEpinglee(limit: number) {
  return await requireSupabase()
    .from('annonces')
    .select('*')
    .order('published_at', { ascending: false })
    .limit(limit);
}

/**
 * L'erreur dit-elle, et dit-elle **seulement**, que la colonne de l'épinglage
 * manque ?
 *
 * La question est étroite à dessein : le code `42703` est celui d'une colonne
 * inconnue, et le nom de la colonne est vérifié pour qu'un autre objet disparu
 * ne se déguise pas en épinglage absent. La requête ne nomme qu'une colonne, donc
 * les deux conditions ensemble ne peuvent désigner que ce cas.
 *
 * Le nom est écrit ici **et** dans `lireAvecEpinglee` : deux littéraux, une seule
 * vérité. Un écart d'une lettre ferait un repli qui ne se déclencherait jamais —
 * et `check-async-wiring` compare les deux, plutôt que de faire confiance à la
 * relecture.
 */
function colonneEpingleeAbsente(erreur: { code?: string; message?: string } | null): boolean {
  return erreur?.code === '42703' && (erreur.message ?? '').includes('epinglee_at');
}

/**
 * Les annonces de l'accueil : l'épinglée en tête, les autres par date.
 *
 * ELLE N'ÉCRIT AUCUNE REQUÊTE, ET C'EST VOULU
 * -------------------------------------------
 * Les deux lectures qu'elle choisit — `lireAvecEpinglee`, `lireSansEpinglee` —
 * portent chacune leur propre tri, et leurs commentaires disent pourquoi. Ce qui
 * se décide **ici**, et seulement ici, c'est le passage de l'une à l'autre : le
 * repli n'est pris que sur la reconnaissance d'une colonne absente, et toute
 * autre erreur remonte telle quelle.
 *
 * La seconde lecture lève à son tour si elle échoue : un repli qui rendrait une
 * liste vide sur un second refus ferait afficher « aucune actualité » à des
 * familles qui en ont — le défaut que le tableau de bord interdit par un contrôle
 * exprès, et qui fait douter du contenu plutôt que de l'outil.
 */
export async function fetchAnnonces(limit: number = DEFAULT_LIMIT): Promise<AnnonceWithAuthor[]> {
  const premier = await lireAvecEpinglee(limit);

  if (premier.error === null) {
    return avecAuteurs(premier.data);
  }

  if (!colonneEpingleeAbsente(premier.error)) {
    throw toAppError(premier.error);
  }

  const repli = await lireSansEpinglee(limit);

  if (repli.error !== null) {
    throw toAppError(repli.error);
  }

  return avecAuteurs(repli.data);
}

/**
 * Les photos d'un lot d'actualités, indexées par identifiant d'actualité.
 *
 * POURQUOI ELLE VIT ICI, ET NON DANS LA CARTE
 * -------------------------------------------
 * `annonces.image_path` porte un **chemin dans le compartiment**, pas une
 * adresse : le compartiment est privé, et afficher la photo demande une adresse
 * signée. Signer depuis la carte ferait autant de requêtes que de cartes — dix
 * actualités, dix allers-retours, tous au même instant. C'est donc l'**écran**
 * qui signe, une fois, pour toute sa liste, et qui passe le résultat à chaque
 * carte. Le service sait ce qu'est une actualité ; la carte, elle, ne sait que
 * peindre ce qu'on lui donne.
 *
 * DEUX TABLES PLUTÔT QU'UNE SEULE
 * -------------------------------
 * Le chemin est dédoublonné avant signature — deux actualités qui partagent une
 * photo ne la font signer qu'une fois —, et le résultat est ensuite **retourné**
 * par identifiant d'actualité. Rendre la table des chemins obligerait chaque
 * appelant à refaire cette seconde correspondance, et c'est exactement le genre
 * de recopie qui diverge en silence.
 *
 * UNE PHOTO QU'ON NE PEUT PAS SIGNER N'EST PAS UNE PANNE
 * ------------------------------------------------------
 * Fichier retiré du compartiment, politique absente, réseau coupé : dans les
 * trois cas l'actualité reste parfaitement lisible, et sa carte montre alors
 * l'illustration de sa catégorie. Faire échouer la page entière pour une
 * vignette serait le pire des arbitrages — c'est déjà la décision prise par
 * l'écran d'article, qui affiche le texte même quand sa photo manque.
 */
export async function photosDesAnnonces(
  annonces: readonly Annonce[],
): Promise<ReadonlyMap<string, string>> {
  const chemins = [
    ...new Set(
      annonces.flatMap((annonce) => (annonce.image_path === null ? [] : [annonce.image_path])),
    ),
  ];

  if (chemins.length === 0) {
    return new Map();
  }

  let adresses: ReadonlyMap<string, string>;

  try {
    adresses = await documentsUrls(chemins);
  } catch {
    return new Map();
  }

  const parAnnonce = new Map<string, string>();

  for (const annonce of annonces) {
    const adresse = annonce.image_path === null ? undefined : adresses.get(annonce.image_path);

    if (adresse !== undefined) {
      parAnnonce.set(annonce.id, adresse);
    }
  }

  return parAnnonce;
}

/**
 * Une annonce, par son identifiant — pour l'écran qui la montre entière.
 *
 * `maybeSingle()` et non `single()` : `single()` lève une erreur quand la ligne
 * n'existe pas, et l'écran annoncerait « lecture impossible » pour une annonce
 * simplement retirée entre l'affichage de la liste et l'appui. `null` dit la
 * même chose sans faire passer une absence pour une panne — la distinction que
 * ce dépôt tient partout ailleurs.
 */
export async function fetchAnnonce(id: string): Promise<AnnonceWithAuthor | null> {
  const { data, error } = await requireSupabase()
    .from('annonces')
    .select('*')
    .eq('id', id)
    .maybeSingle();

  if (error !== null) {
    throw toAppError(error);
  }

  if (data === null) {
    return null;
  }

  const [annonce] = avecAuteurs([data]);
  return annonce ?? null;
}
