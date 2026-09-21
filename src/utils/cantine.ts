/**
 * La mise en forme d'un menu de cantine.
 *
 * POURQUOI CE FICHIER EXISTE
 * --------------------------
 * L'écran de cantine ne fait plus que deux choses : demander les données, et
 * les dessiner. Tout ce qui **décide** de ce qui s'affiche — quelles catégories
 * paraissent, dans quel ordre, ce qu'un jour sans aliment montre à la place, et
 * ce qu'un compteur compte — vit ici, hors de React.
 *
 * Ce n'est pas une préférence d'architecture. C'est ce qui rend la règle
 * éprouvable : une règle enfermée dans un `renderItem` ne se vérifie qu'en
 * montant l'écran entier, avec un client Supabase et un appareil. Ici, un banc
 * l'exerce sur des données écrites à la main, en une seconde.
 *
 * LES TROIS RÈGLES, ÉNONCÉES
 * --------------------------
 *   1. **Six catégories, dans l'ordre**, et une catégorie vide ne paraît pas —
 *      ni son titre, ni l'espace qu'elle aurait réservé. Un jour sans laitage ne
 *      doit pas laisser un blanc à l'endroit où le laitage se trouverait.
 *   2. **Un jour sans aliment retombe sur les anciennes colonnes.** C'est la
 *      garantie demandée : les menus saisis avant cette version continuent de
 *      s'afficher. La reprise de la migration fait le gros du travail ; ce
 *      repli couvre le cas où l'application est installée avant que la
 *      migration ne soit collée dans l'éditeur SQL — deux gestes qui ne se font
 *      pas au même moment, et dans cet ordre.
 *   3. **Le compteur compte ce qui s'affiche**, et rien d'autre.
 */

import {
  CANTINE_ITEM_CATEGORIES,
  CANTINE_ITEM_CATEGORY_LABELS,
  type CantineDishType,
  type CantineItem,
  type CantineItemCategory,
  type CantineMenu,
} from '@/types/models';
import type { AccentName } from '@/theme';

/**
 * Où va chaque ancienne colonne, et pourquoi c'est écrit ici.
 *
 * L'ancien modèle portait quatre colonnes fixes — une entrée, un plat, un
 * dessert, des informations. Les six catégories n'ont pas d'« entrée » : le menu
 * de l'école n'en publie pas. `starter` rejoint donc « autres », qui est le seul
 * endroit honnête — l'inventer en « plat » serait faux, et le perdre serait
 * pire.
 *
 * CETTE CORRESPONDANCE EST ÉCRITE DEUX FOIS
 * -----------------------------------------
 * Une fois ici, pour le repli de l'application ; une fois dans la migration, qui
 * recopie les journées déjà saisies en aliments. Les deux doivent dire la même
 * chose, sans quoi une journée reprise par la migration et une journée lue par
 * le repli afficheraient le même contenu sous deux titres différents. Aucune des
 * deux ne peut lire l'autre — l'une est du SQL, l'autre du TypeScript —, et
 * c'est `scripts/check-cantine.test.mjs` qui les tient d'accord en lisant les
 * deux.
 */
export const CORRESPONDANCE_HISTORIQUE: readonly (readonly [string, CantineItemCategory])[] = [
  ['starter', 'autres'],
  ['main_course', 'plat'],
  ['dessert', 'dessert'],
];

/**
 * La couleur de la pastille, par type de plat.
 *
 * POURQUOI CES TROIS-LÀ, ET PAS D'AUTRES
 * --------------------------------------
 * Les couples sont pris dans `accents`, où l'encre et le fond pâle ont été
 * **mesurés ensemble** : `danger` sur `dangerSoft` pour la viande, `primary` sur
 * `primarySoft` pour le poisson, `success` sur `successSoft` pour le végétarien.
 * Aucune couleur n'est inventée pour l'occasion, et le thème de l'application
 * n'est pas touché : la pastille est le seul endroit coloré, et c'est voulu.
 *
 * Le poisson prend le **bleu** et non un second vert : deux verts voisins se
 * confondraient à la taille d'une pastille, et « végétarien » est justement
 * l'information qu'un parent cherche à ne pas manquer.
 */
export const CANTINE_DISH_TYPE_ACCENTS: Readonly<Record<CantineDishType, AccentName>> = {
  viande: 'rouge',
  poisson: 'bleu',
  vegetarien: 'vert',
};

/** Un aliment tel qu'il s'affiche : son nom, et sa pastille éventuelle. */
export interface AlimentAffiche {
  /**
   * Clé de rendu, et non identifiant métier.
   *
   * Un aliment venu de la base porte son identifiant ; un aliment déduit d'une
   * ancienne colonne n'en a pas, et porte une clé construite. Le préfixe les
   * distingue, ce qui évite qu'un aliment repris par la migration et un aliment
   * déduit se disputent la même clé le jour où les deux existeraient.
   */
  readonly cle: string;
  readonly nom: string;
  readonly type: CantineDishType | null;
}

/** Une catégorie et ses aliments. Une catégorie vide n'en produit pas. */
export interface GroupeCategorie {
  readonly categorie: CantineItemCategory;
  readonly titre: string;
  readonly aliments: readonly AlimentAffiche[];
}

/** Un jour prêt à dessiner : son en-tête, ses groupes, et son compte. */
export interface JourDeCantine {
  readonly menu: CantineMenu;
  readonly groupes: readonly GroupeCategorie[];
  readonly elements: number;
}

/** Un aliment, avec la catégorie sous laquelle il se rangera. */
interface AlimentRange {
  readonly cle: string;
  readonly categorie: CantineItemCategory;
  readonly nom: string;
  readonly type: CantineDishType | null;
}

/**
 * Les aliments déduits des anciennes colonnes d'un jour.
 *
 * Un libellé vide ou fait d'espaces ne produit rien : la colonne est facultative
 * en base, et `''` y est une valeur possible. Sans ce filtre, la journée
 * afficherait une puce sans texte, ce qui se lit comme un défaut d'affichage.
 */
function alimentsHistoriques(menu: CantineMenu): readonly AlimentRange[] {
  const deduits: AlimentRange[] = [];

  for (const [colonne, categorie] of CORRESPONDANCE_HISTORIQUE) {
    const valeur = menu[colonne as keyof CantineMenu];

    if (typeof valeur !== 'string' || valeur.trim() === '') {
      continue;
    }

    deduits.push({
      cle: `historique-${menu.id}-${colonne}`,
      categorie,
      nom: valeur,
      type: null,
    });
  }

  return deduits;
}

/**
 * Les aliments d'un jour : ceux de la base, ou, à défaut, les anciennes colonnes.
 *
 * LE REPLI N'EST PAS UN DOUBLON
 * -----------------------------
 * Les deux sources ne sont pas cumulées : dès qu'un jour porte **un** aliment,
 * les anciennes colonnes ne sont plus lues. Les additionner afficherait deux
 * fois le plat d'une journée reprise par la migration — la ligne d'origine, et
 * sa copie en aliment.
 */
function alimentsDuJour(menu: CantineMenu, items: readonly CantineItem[]): readonly AlimentRange[] {
  if (items.length === 0) {
    return alimentsHistoriques(menu);
  }

  return items.map((item) => ({
    cle: item.id,
    categorie: item.category,
    nom: item.label,
    type: item.dish_type,
  }));
}

/**
 * Un jour, ses groupes et son compte.
 *
 * L'ORDRE VIENT DE `CANTINE_ITEM_CATEGORIES`, ET D'ELLE SEULE
 * ----------------------------------------------------------
 * Les aliments sont rangés par catégorie **après** avoir été lus, et non
 * `order by category` en SQL : l'ordre d'une énumération PostgreSQL est un
 * détail de stockage, alors que l'ordre d'affichage est une décision. Le lire
 * depuis la constante qui le déclare évite que les deux divergent — et c'est
 * cette constante que `check-migration-applicable` confronte au catalogue.
 *
 * L'ordre des aliments **à l'intérieur** d'un groupe est celui de la lecture :
 * le service trie par date de création, donc l'ordre où le bureau les a saisis.
 * Un aliment ajouté se place donc à la fin de son groupe, ce qui est ce qu'on
 * attend d'un ajout.
 */
export function grouperJour(menu: CantineMenu, items: readonly CantineItem[]): JourDeCantine {
  const ranges = alimentsDuJour(menu, items);
  const groupes: GroupeCategorie[] = [];

  for (const categorie of CANTINE_ITEM_CATEGORIES) {
    const aliments = ranges
      .filter((aliment) => aliment.categorie === categorie)
      .map(({ cle, nom, type }) => ({ cle, nom, type }));

    // La règle, en une ligne : une catégorie sans aliment ne produit **rien** —
    // ni titre, ni groupe vide. C'est ce qui fait disparaître l'espace qu'elle
    // aurait occupé.
    if (aliments.length === 0) {
      continue;
    }

    groupes.push({
      categorie,
      titre: CANTINE_ITEM_CATEGORY_LABELS[categorie],
      aliments,
    });
  }

  return { menu, groupes, elements: ranges.length };
}

/**
 * Les journées, dans l'ordre où elles arrivent, chacune mise en forme.
 *
 * `itemsParJour` est construit une fois par le service : les aliments sont lus
 * en une requête pour tous les jours affichés, et non une requête par jour. Un
 * menu de cantine se lit en entier — c'est la différence avec un fil de
 * commentaires, qu'on ne déplie qu'un à la fois.
 */
export function joursDeCantine(
  menus: readonly CantineMenu[],
  itemsParJour: ReadonlyMap<string, readonly CantineItem[]>,
): readonly JourDeCantine[] {
  return menus.map((menu) => grouperJour(menu, itemsParJour.get(menu.id) ?? []));
}

/** Range les aliments lus en une fois sous leur journée. */
export function rangerParJour(
  items: readonly CantineItem[],
): ReadonlyMap<string, readonly CantineItem[]> {
  const parJour = new Map<string, CantineItem[]>();

  for (const item of items) {
    const liste = parJour.get(item.menu_id);

    if (liste === undefined) {
      parJour.set(item.menu_id, [item]);
    } else {
      liste.push(item);
    }
  }

  return parJour;
}

/**
 * Le compte affiché sous le jour — « 11 éléments ».
 *
 * Écrit ici plutôt que dans l'écran parce que le **singulier** est la partie
 * qu'on oublie : un jour à un seul aliment afficherait « 1 éléments », et ce
 * n'est pas une faute que l'œil attrape sur une capture d'écran. Le seuil est
 * `<= 1` et non `=== 1` : un jour sans aliment ne s'affiche pas, mais si un jour
 * vide arrivait jusqu'ici, « 0 éléments » est la forme juste — et c'est le
 * pluriel qui serait faux.
 */
export function libelleElements(nombre: number): string {
  return nombre <= 1 ? `${nombre} élément` : `${nombre} éléments`;
}
