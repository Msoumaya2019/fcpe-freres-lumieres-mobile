/**
 * L'accent de chaque catégorie d'actualité, et son icône.
 *
 * POURQUOI CE FICHIER EXISTE SÉPARÉMENT
 * -------------------------------------
 * L'accueil affiche le badge d'une actualité, et l'écran « Actualités » affiche
 * le même. Deux tables écrites dans deux écrans divergeraient au premier ajout
 * de catégorie — et l'écart ne se verrait qu'à l'écran, une couleur ici, une
 * autre là.
 *
 * Le `Record` est total sur l'énumération : ajouter une valeur en base sans lui
 * donner d'accent fait échouer `tsc`, et non l'affichage. C'est le même
 * mécanisme que les tables de libellés de `src/types/models.ts`.
 */

import type { Ionicons } from '@expo/vector-icons';

import { type AccentName } from '@/theme';
import type { AnnonceCategory } from '@/types/models';

interface CategoryStyle {
  readonly accent: AccentName;
  readonly icon: keyof typeof Ionicons.glyphMap;
}

export const ANNONCE_CATEGORY_STYLES: Readonly<Record<AnnonceCategory, CategoryStyle>> = {
  information: { accent: 'bleu', icon: 'information-circle-outline' },
  important: { accent: 'rouge', icon: 'megaphone-outline' },
  cantine: { accent: 'vert', icon: 'restaurant-outline' },
  evenement: { accent: 'ambre', icon: 'calendar-outline' },
  reunion: { accent: 'violet', icon: 'people-outline' },
};

/**
 * L'accent d'une catégorie, avec un repli.
 *
 * Le repli n'est pas décoratif : la valeur vient de la base, et une ligne
 * écrite avant l'ajout d'une catégorie — ou par un `update` fait à la main dans
 * le tableau de bord — peut porter une valeur que ce fichier ne connaît pas. Le
 * `Record` protège la compilation, pas les données déjà écrites.
 */
export function annonceCategoryStyle(category: AnnonceCategory): CategoryStyle {
  return ANNONCE_CATEGORY_STYLES[category] ?? ANNONCE_CATEGORY_STYLES.information;
}
