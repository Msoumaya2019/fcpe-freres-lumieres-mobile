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
    authorName: row.author_id === null ? null : AUTEUR_COLLECTIF,
  }));
}

/**
 * Annonces les plus récentes d'abord, l'épinglée en tête.
 *
 * POURQUOI DEUX `order`, ET POURQUOI LE PREMIER N'EST PAS UN TRI DANS L'ÉCRAN
 * -------------------------------------------------------------------------
 * Le tri par épinglage est fait par le **serveur**, et ce n'est pas un détail
 * de style : cette fonction ne lit que les `limit` actualités les plus récentes.
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
 * en tri décroissant, elles passent donc **en tête**. Sans ce réglage, toutes
 * les actualités non épinglées — c'est-à-dire presque toutes — passeraient
 * devant celle qui est épinglée, et la fonctionnalité serait inversée sans
 * qu'aucune erreur ne soit levée. C'est `check-migration-applicable` qui le
 * mesure, sur un vrai PostgreSQL, et non ce commentaire.
 */
export async function fetchAnnonces(limit: number = DEFAULT_LIMIT): Promise<AnnonceWithAuthor[]> {
  const { data, error } = await requireSupabase()
    .from('annonces')
    .select('*')
    .order('epinglee_at', { ascending: false, nullsFirst: false })
    .order('published_at', { ascending: false })
    .limit(limit);

  if (error !== null) {
    throw toAppError(error);
  }

  return avecAuteurs(data);
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
