/**
 * Cantine : les menus du jour et à venir, et leurs aliments.
 *
 * POURQUOI LA RÉSERVATION A DISPARU DE CE MODULE
 * ----------------------------------------------
 * L'écran proposait « Réserver », et ce bouton n'écrivait qu'une ligne dans
 * `cantine_reservations`. Il n'était relié à **aucun** service de restauration
 * scolaire : un parent qui appuyait croyait avoir réservé un repas, et rien
 * n'était commandé à personne. Le dégât n'est pas technique — c'est un enfant
 * sans repas, et un parent qui ne comprend pas pourquoi.
 *
 * Le module ne fait donc plus que ce que l'application sait faire réellement :
 * **consulter les menus**. La table `cantine_reservations` reste en place, avec
 * ses lignes et ses politiques : rien n'est supprimé, et le bureau peut encore
 * les consulter depuis le tableau de bord.
 *
 * POURQUOI DEUX LECTURES, ET NON UNE JOINTURE IMBRIQUÉE
 * -----------------------------------------------------
 * PostgREST sait rendre une journée et ses aliments en une requête, par un
 * `select('*, cantine_items(*)')`. C'est écrit ici parce que c'est le réflexe
 * naturel, et qu'il a été écarté en connaissance de cause : le typage d'une
 * relation imbriquée dépend des métadonnées de clés étrangères que PostgREST
 * renvoie, et une erreur à cet endroit ne se voit **qu'à l'exécution**, sur
 * l'appareil. Deux lectures simples restent vérifiables à la compilation — et
 * c'est déjà la règle du projet, écrite dans `src/types/models.ts`.
 *
 * Le coût est d'une requête pour l'écran entier, et non d'une par journée : les
 * aliments sont demandés en **une** fois pour les journées affichées, par
 * `.in('menu_id', …)`. C'est la différence avec un fil de commentaires, qu'on ne
 * déplie qu'un à la fois — ici, un menu de cantine se lit en entier.
 */

import { requireSupabase } from '@/config/supabase';
import { toAppError } from '@/errors';
import type { CantineItem, CantineMenu } from '@/types/models';
import { rangerParJour } from '@/utils/cantine';

const MAX_MENUS = 60;

/**
 * Codes par lesquels PostgREST dit que la table des aliments n'est pas là.
 *
 * `42P01` est le refus de PostgreSQL : la relation n'existe pas. `PGRST205` est
 * celui de PostgREST : il ne la trouve pas dans son cache de schéma, ce qui est
 * l'état d'un instant qui suit l'application d'une migration.
 *
 * CES DEUX CODES SONT TOLÉRÉS, ET C'EST UNE DÉCISION
 * --------------------------------------------------
 * L'application et la base ne se mettent pas à jour au même moment : le SQL est
 * collé à la main dans l'éditeur du tableau de bord, et l'application s'installe
 * depuis un lien. Dans l'intervalle — qui peut durer — une lecture refusée
 * ferait tomber l'écran de cantine **entier**, alors qu'il fonctionnait la
 * veille. Un parent n'a pas à voir une panne parce que deux gestes d'installation
 * n'ont pas été faits dans le même quart d'heure.
 *
 * Le repli est donc : les journées s'affichent, et l'application retombe sur les
 * anciennes colonnes — exactement ce qu'elle montrait avant. Rien n'est perdu,
 * et rien n'est masqué : **tout autre refus est propagé** et s'affiche. C'est la
 * distinction qui compte — un refus de lecture pour droits insuffisants
 * (`42501`) signalerait une politique manquante, et le taire ferait disparaître
 * une panne réelle derrière un affichage d'apparence normale.
 */
const TABLE_ABSENTE = new Set(['42P01', 'PGRST205']);

/** Les journées à venir, et les aliments rangés sous chacune. */
export interface MenusDeLaCantine {
  readonly menus: readonly CantineMenu[];
  readonly itemsParJour: ReadonlyMap<string, readonly CantineItem[]>;
}

/**
 * Date locale au format `AAAA-MM-JJ`.
 *
 * `Date.toISOString()` ne convient pas : il convertit en UTC, si bien qu'à
 * 00 h 30 heure française un menu du jour même serait considéré comme passé.
 * La colonne `service_date` est une date civile, pas un instant.
 */
function toIsoDate(date: Date): string {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Menus du jour et à venir, dans l'ordre chronologique, avec leurs aliments.
 *
 * La lecture est bornée, et le tri est fait par le serveur : c'est la même
 * exigence que partout ailleurs — une lecture non bornée finit par être
 * tronquée par un plafond, et l'écran afficherait alors une semaine amputée
 * sans que rien ne le signale.
 *
 * Le tri des aliments est celui de leur **création** : le bureau les saisit dans
 * l'ordre où il les lit sur le menu de l'école, et un aliment ajouté se range
 * donc à la fin de sa catégorie. `label` départage les aliments écrits dans la
 * même transaction, dont l'horodatage est identique — sans quoi l'ordre
 * dépendrait du hasard du plan d'exécution.
 */
export async function fetchCantine(limit: number = MAX_MENUS): Promise<MenusDeLaCantine> {
  const client = requireSupabase();

  const { data: menus, error } = await client
    .from('cantine_menus')
    .select('*')
    .gte('service_date', toIsoDate(new Date()))
    .order('service_date', { ascending: true })
    .limit(limit);

  if (error !== null) {
    throw toAppError(error);
  }

  // Aucune journée : la seconde lecture n'a rien à demander. Sans ce retour, la
  // requête partirait avec un `in` vide, ce qui est une requête pour rien.
  if (menus.length === 0) {
    return { menus, itemsParJour: new Map() };
  }

  const { data: items, error: erreurAliments } = await client
    .from('cantine_items')
    .select('*')
    .in(
      'menu_id',
      menus.map((menu) => menu.id),
    )
    .order('created_at', { ascending: true })
    .order('label', { ascending: true });

  if (erreurAliments !== null) {
    if (TABLE_ABSENTE.has(erreurAliments.code)) {
      return { menus, itemsParJour: new Map() };
    }

    throw toAppError(erreurAliments);
  }

  return { menus, itemsParJour: rangerParJour(items) };
}
