/**
 * Les textes du bandeau d'accueil, publiés par le bureau.
 *
 * POURQUOI CES DEUX PHRASES SONT ENFIN DES DONNÉES
 * -----------------------------------------------
 * Le nom de l'école et sa devise étaient écrits **dans le code** de l'écran
 * d'accueil, et c'était un choix argumenté : « ce sont des phrases de
 * l'application, pas des informations publiées par le bureau ». Le bureau a
 * demandé à pouvoir les changer — et une phrase que le bureau change est, par
 * définition, une information publiée. Le choix a donc changé avec la demande,
 * et ces deux phrases vivent désormais dans `public.reglages`.
 *
 * LA TABLE N'EST PAS UNE DÉCORATION : ELLE PORTE LE REPLI
 * ------------------------------------------------------
 * Une base qui n'a pas reçu la huitième migration n'a pas de table `reglages`,
 * et une base qui l'a reçue mais dont le bureau a vidé une ligne n'a pas de
 * valeur. Les deux cas rendent **la même chose ici** : les textes par défaut
 * ci-dessous, qui sont exactement ceux que l'application affichait avant que
 * cette table n'existe.
 *
 * C'est délibéré, et c'est la leçon d'un défaut mesuré sur cet écran même : une
 * lecture qui échoue ne doit jamais faire tomber ce qu'elle **décore**. Le titre
 * du bandeau est une ornementation de l'accueil ; les actualités sont le
 * contenu. Une base en retard doit laisser un accueil qui s'affiche, avec le nom
 * de l'école d'avant.
 *
 * POURQUOI LE REPLI EST ICI, ET NON DANS L'ÉCRAN
 * ---------------------------------------------
 * Parce qu'il doit être **le même** dans les deux cas — table absente, clé
 * absente —, et qu'un repli écrit au point d'usage se serait écrit deux fois.
 * C'est aussi ce que lit le banc qui éprouve ce fichier.
 */

import { requireSupabase } from '@/config/supabase';

/**
 * Le nom de l'école, tel que l'accueil l'affichait avant que le bureau puisse le
 * changer.
 *
 * Il n'est **pas** une vérité recopiée de la migration, et les deux ont le droit
 * de diverger : d'un côté c'est une valeur initiale, de l'autre un repli de
 * dépannage. Le jour où le bureau choisit un autre titre, c'est le but.
 */
export const TITRE_BANDEAU_PAR_DEFAUT = 'École Frères Lumières';

/** La devise, même rôle : valeur initiale d'un côté, repli de l'autre. */
export const DEVISE_BANDEAU_PAR_DEFAUT = 'Grandir · Apprendre · S’épanouir ensemble';

/** Les deux textes affichés sous la photographie de l'école. */
export interface ReglagesBandeau {
  readonly titre: string;
  readonly devise: string;
}

/**
 * Les clés lues dans `public.reglages`.
 *
 * Écrites une fois, et non recomposées à chaque appel : la clé est comparée au
 * caractère près par la base, et une clé écrite deux fois est une clé qui
 * divergera. La contrainte `reglages_cle_forme` refuse d'ailleurs une clé
 * accentuée ou espacée — la faute serait sinon invisible, le repli prenant
 * silencieusement la place du texte choisi.
 */
const CLES = {
  titre: 'bandeau_titre',
  devise: 'bandeau_devise',
} as const;

/**
 * Le repli, en un seul endroit, pour que les deux cas d'absence s'y rejoignent.
 *
 * Exporté parce que l'écran en a besoin **avant** que la lecture n'ait rendu :
 * tant que la première attente n'est pas terminée, il n'y a pas de données, et
 * afficher un bandeau vide ferait clignoter un en-tête sans nom. Une seconde
 * copie de ces deux phrases dans l'écran serait la copie qui divergera.
 */
export const REGLAGES_PAR_DEFAUT: ReglagesBandeau = {
  titre: TITRE_BANDEAU_PAR_DEFAUT,
  devise: DEVISE_BANDEAU_PAR_DEFAUT,
};

/**
 * Une valeur lue, ou le repli si elle est absente ou vide.
 *
 * Une valeur vide n'est pas un titre : la contrainte de la table l'interdit,
 * mais une base modifiée à la main ne la respecterait pas, et un titre vide
 * laisserait un bandeau sans nom plutôt qu'un bandeau avec celui d'avant.
 */
function ou(valeur: string | undefined, repli: string): string {
  return valeur === undefined || valeur.trim() === '' ? repli : valeur;
}

/**
 * Le titre et la devise du bandeau.
 *
 * NE LÈVE JAMAIS
 * --------------
 * Toute erreur — table absente parce que la migration n'est pas collée, réseau,
 * droits — rend les textes par défaut. C'est le seul cas de ce dépôt où une
 * lecture avale son erreur, et il est justifié : ce qui est lu ici **habille**
 * l'accueil, il ne le constitue pas. Un `throw` ferait d'un ornement la cause
 * d'un écran vide, et c'est précisément le défaut qui a rendu l'accueil
 * inaccessible aux visiteurs sans compte.
 *
 * Ce que cela coûte : un bureau dont le titre ne change pas ne saura pas d'ici
 * que sa migration manque. C'est le tableau de bord qui le lui dit — la page
 * « Accueil » y écrit ces deux textes, et y échoue bruyamment si la table
 * n'existe pas.
 */
export async function fetchReglagesBandeau(): Promise<ReglagesBandeau> {
  try {
    const { data, error } = await requireSupabase()
      .from('reglages')
      .select('cle, valeur')
      .in('cle', [CLES.titre, CLES.devise]);

    if (error !== null || data === null) {
      return REGLAGES_PAR_DEFAUT;
    }

    const parCle = new Map(data.map((ligne) => [ligne.cle, ligne.valeur] as const));

    return {
      titre: ou(parCle.get(CLES.titre), REGLAGES_PAR_DEFAUT.titre),
      devise: ou(parCle.get(CLES.devise), REGLAGES_PAR_DEFAUT.devise),
    };
  } catch {
    return REGLAGES_PAR_DEFAUT;
  }
}
