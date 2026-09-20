/** Documents utiles aux familles — métadonnées, le fichier vit dans Storage. */

import { requireSupabase } from '@/config/supabase';
import { toAppError } from '@/errors';
import type { DocumentFile } from '@/types/models';

const MAX_DOCUMENTS = 100;

/** Documents publiés, du plus récent au plus ancien. */
export async function fetchDocuments(limit: number = MAX_DOCUMENTS): Promise<DocumentFile[]> {
  const { data, error } = await requireSupabase()
    .from('documents')
    .select('*')
    .order('published_at', { ascending: false })
    .limit(limit);

  if (error !== null) {
    throw toAppError(error);
  }

  return data;
}

/**
 * Durée de validité d'une adresse signée, en secondes.
 *
 * Une heure est un compromis assumé : assez pour lire un document ou pour
 * parcourir une liste d'actualités, trop court pour qu'un lien partagé survive à
 * la journée.
 *
 * Une **seule** constante, et non deux littéraux : la valeur est désormais lue
 * par deux fonctions, et deux `3600` écrits côte à côte auraient fini par
 * diverger — le jour où l'un des deux serait retouché, les photos d'une liste et
 * celle d'un article n'expireraient plus ensemble, sans que rien ne le signale.
 */
const DUREE_SIGNATURE = 3600;

/**
 * Adresse **signée** d'un document.
 *
 * Le compartiment est **privé**, et ce sont les politiques de la table
 * `documents` qui bornent ce qu'on peut lire : `visibility = 'familles'` pour un
 * parent sans compte, la totalité pour un porteur de jeton. Un compartiment
 * public rendrait ces deux politiques décoratives — le fichier resterait lisible
 * par quiconque possède son adresse, y compris après la fermeture d'un compte.
 *
 * D'où une adresse **signée**, valable une heure. Elle n'est pas devinable, et
 * elle expire — ce qui laisse le temps d'ouvrir un PDF, sans laisser derrière
 * soi un lien qui fonctionne encore dans six mois.
 */
export async function documentUrl(storagePath: string): Promise<string> {
  const { data, error } = await requireSupabase()
    .storage.from('documents')
    .createSignedUrl(storagePath, DUREE_SIGNATURE);

  if (error !== null) {
    throw toAppError(error);
  }

  return data.signedUrl;
}

/**
 * Les adresses signées de **plusieurs** fichiers, en **une** requête.
 *
 * POURQUOI CETTE FONCTION EXISTE
 * ------------------------------
 * `documentUrl` signe un fichier à la fois, et c'est un aller-retour réseau par
 * appel. Une liste de dix actualités illustrées ferait donc dix requêtes pour
 * une seule page — lancées ensemble, mais facturées ensemble elles aussi, et
 * chacune susceptible d'échouer séparément. Le point d'entrée groupé existe dans
 * le paquet installé (`createSignedUrls`, vérifié dans
 * `@supabase/storage-js`) : il signe toute la liste en un `POST`.
 *
 * UN ÉCHEC PARTIEL N'EST PAS UN ÉCHEC
 * -----------------------------------
 * La réponse porte, **par chemin**, une adresse ou une erreur : un fichier
 * retiré du compartiment n'empêche pas les autres d'être signés. Les chemins en
 * échec sont donc simplement absents de la table rendue, et c'est à l'appelant
 * de retomber sur autre chose — pour une actualité, l'illustration de sa
 * catégorie.
 *
 * Seule une panne de la requête entière lève, et c'est voulu : `toAppError`
 * traduit alors un message que l'appelant peut décider d'ignorer, ce que fait
 * `photosDesAnnonces`.
 */
export async function documentsUrls(
  chemins: readonly string[],
): Promise<ReadonlyMap<string, string>> {
  // Sans cette garde, un lot vide partirait quand même en requête pour ne rien
  // signer — et l'écran sans photo attendrait un aller-retour pour rien.
  if (chemins.length === 0) {
    return new Map();
  }

  const { data, error } = await requireSupabase()
    .storage.from('documents')
    .createSignedUrls([...chemins], DUREE_SIGNATURE);

  if (error !== null) {
    throw toAppError(error);
  }

  const adresses = new Map<string, string>();

  for (const entree of data) {
    if (entree.path !== null && entree.signedUrl !== null) {
      adresses.set(entree.path, entree.signedUrl);
    }
  }

  return adresses;
}

/**
 * Le chemin de la photographie de l'école, dans le compartiment.
 *
 * POURQUOI UN CHEMIN FIXE PLUTÔT QU'UNE COLONNE EN BASE
 * -----------------------------------------------------
 * Le bureau doit pouvoir changer cette photo **sans toucher au code**, et c'est
 * la seule contrainte. Deux façons de la satisfaire : une colonne quelque part,
 * ou un chemin convenu. Le chemin convenu a été retenu, et il coûte moins cher
 * pour la même garantie — pas de table, pas de migration, pas de lecture
 * supplémentaire, et un dépôt qui **remplace** la photo au lieu d'en créer une
 * seconde. Une colonne aurait aussi demandé une politique de lecture anonyme de
 * plus, là où la politique du compartiment se contente d'une ligne.
 *
 * LE NOM EST ÉCRIT DEUX FOIS DANS LE PROJET, ET C'EST ASSUMÉ
 * ---------------------------------------------------------
 * Une fois ici, une fois dans le tableau de bord (`src/lib/stockage.ts`), parce
 * que les deux dépôts ne peuvent pas se lire. Les deux commentaires se nomment
 * l'un l'autre : c'est la même règle que partout ailleurs dans ce dépôt — une
 * valeur recopiée n'est tenable que si chaque copie dit où est l'autre.
 *
 * Ce qui les tient ensemble n'est pas un test mais la **politique du
 * compartiment**, qui compare des chaînes au caractère près : un chemin
 * légèrement différent d'un côté et de l'autre ne casse rien à la compilation,
 * ne lève rien à l'exécution, et laisse simplement le bandeau dessiné à la place
 * de la photo. C'est le repli qui rend l'erreur supportable — et c'est pourquoi
 * le repli n'est pas une décoration.
 */
export const CHEMIN_BANDEAU = 'accueil/bandeau.jpg';

/**
 * L'adresse signée de la photographie de l'école, ou `null` si elle n'existe
 * pas encore.
 *
 * `null` est le cas **courant**, pas le cas d'erreur : tant que le bureau n'a
 * rien déposé, il n'y a pas de fichier à ce chemin, et l'accueil affiche son
 * bandeau dessiné. Un dépôt, un remplacement, un retrait : les trois se
 * traduisent par la même chose ici, et aucun n'est une panne.
 */
export async function photoDuBandeau(): Promise<string | null> {
  try {
    const adresses = await documentsUrls([CHEMIN_BANDEAU]);

    return adresses.get(CHEMIN_BANDEAU) ?? null;
  } catch {
    return null;
  }
}
