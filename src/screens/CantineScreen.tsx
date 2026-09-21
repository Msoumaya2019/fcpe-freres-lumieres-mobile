import { Ionicons } from '@expo/vector-icons';
import { useCallback, useState } from 'react';
import { FlatList, RefreshControl, StyleSheet, View, type ListRenderItemInfo } from 'react-native';

import {
  AppText,
  AsyncErrorBanner,
  AsyncFallback,
  Badge,
  Button,
  Card,
  FilCommentaires,
  Screen,
} from '@/components';
import { useAsyncData } from '@/hooks/useAsyncData';
import { fetchCantine } from '@/services/cantine';
import { accents, colors, radius, spacing, tints } from '@/theme';
import {
  CANTINE_DISH_TYPE_ACCENTS,
  type AlimentAffiche,
  type GroupeCategorie,
  type JourDeCantine,
  joursDeCantine,
  libelleElements,
} from '@/utils/cantine';
import { CANTINE_DISH_TYPE_LABELS, type CantineDishType } from '@/types/models';
import { formatMenuDate } from '@/utils/date';

const EMPTY_JOURS: readonly JourDeCantine[] = [];

/** Les trois types de plat, dans l'ordre de la légende. */
const TYPES_DE_PLAT: readonly CantineDishType[] = ['viande', 'poisson', 'vegetarien'];

/**
 * La cantine : les menus, et rien d'autre.
 *
 * CE QUE CET ÉCRAN A CESSÉ DE FAIRE, ET POURQUOI
 * ---------------------------------------------
 * Il proposait « Réserver » et « Annuler ma réservation ». Ces boutons
 * n'écrivaient qu'une ligne dans `cantine_reservations` : ils n'étaient reliés à
 * aucun service de restauration scolaire. Un parent qui appuyait dessus croyait
 * avoir réservé un repas, et personne n'était prévenu — le pire défaut possible
 * ici, parce qu'il ne se voit pas dans l'application.
 *
 * Les réservations se font donc **auprès du service de restauration**, comme
 * avant l'application, et l'écran le dit à la place du bouton. La table et ses
 * lignes n'ont pas été supprimées : le bureau peut encore les consulter.
 *
 * Consulter les menus, en revanche, ne demande **aucun compte** : c'est la
 * première chose qu'un parent vient chercher, et l'exiger aurait été le premier
 * obstacle de l'application.
 *
 * CE QUE CET ÉCRAN A APPRIS À FAIRE
 * ---------------------------------
 * Un jour ne porte plus quatre champs fixes mais **des aliments rangés par
 * catégorie** : plusieurs plats, deux laitages, quatre éléments « au menu ». Une
 * catégorie sans aliment ne paraît pas, et une pastille dit ce qu'un parent
 * cherche d'un coup d'œil — viande, poisson, ou végétarien.
 *
 * TOUT CE QUI DÉCIDE EST AILLEURS
 * -------------------------------
 * Quelles catégories paraissent, dans quel ordre, et ce qu'un jour sans aliment
 * montre à la place : ces règles vivent dans `src/utils/cantine.ts`, hors de
 * React, et c'est un banc qui les exerce. L'écran ne fait plus que dessiner.
 */
export function CantineScreen() {
  const loader = useCallback(() => fetchCantine(), []);

  const { status, data, errorMessage, refreshing, refresh, reload } = useAsyncData(loader);

  const jours = data === null ? EMPTY_JOURS : joursDeCantine(data.menus, data.itemsParJour);

  /**
   * La légende des pastilles, et **seulement si une pastille s'affiche**.
   *
   * Une légende qui explique des couleurs absentes est du bruit : elle occupe le
   * haut de l'écran, et le parent cherche dans les menus une pastille rouge qui
   * n'y est pas. La condition est donc mesurée sur les données affichées, et non
   * sur la présence de la fonctionnalité.
   */
  const aUnePastille = jours.some((jour) =>
    jour.groupes.some((groupe) => groupe.aliments.some((aliment) => aliment.type !== null)),
  );

  /**
   * Le jour dont le fil de commentaires est déplié, ou `null`.
   *
   * UN SEUL FIL À LA FOIS, ET C'EST LE CŒUR DU CHOIX
   * ------------------------------------------------
   * Chaque jour de cantine porte son propre fil — c'est ce qu'un parent veut
   * distinguer, et « le jeudi, mon enfant est allergique » ne se dit pas d'une
   * semaine entière. Mais les fils ne se chargent **pas** tous à l'ouverture de
   * l'écran : la cantine affiche les menus à venir, et charger les commentaires
   * de chacun ferait autant de requêtes pour une information que personne ne
   * demande. Un appui en déplie un, et une seule requête part.
   *
   * L'identifiant plutôt qu'un booléen par carte : l'état vit **une fois**, dans
   * l'écran, et non dans chaque carte — une carte ne peut donc pas rester
   * dépliée après que sa voisine l'a été.
   */
  const [filOuvert, setFilOuvert] = useState<string | null>(null);

  const renderItem = useCallback(
    ({ item }: ListRenderItemInfo<JourDeCantine>) => {
      const { menu, groupes, elements } = item;

      return (
        <Card>
          {/*  Le carré vert et le jour, côte à côte. Un parent qui ouvre la
              cantine cherche **un jour précis** ; le titre seul, en haut d'une
              carte blanche, se lit comme la première ligne d'une liste et non
              comme une date. Le carré reprend l'accent vert du raccourci
              « Cantine » de l'accueil, ce qui rattache l'écran à la carte par
              laquelle on y arrive. */}
          <View style={styles.entete}>
            <View style={styles.carre} accessibilityElementsHidden>
              <Ionicons name="restaurant-outline" size={20} color={accents.vert.ink} />
            </View>
            <View style={styles.titres}>
              <AppText variant="heading">{formatMenuDate(menu.service_date)}</AppText>
              {/*  Le compte se lit sous la date, en légende : il renseigne sur
                  l'ampleur du repas sans concurrencer le jour. Il compte ce qui
                  s'affiche, et rien d'autre — un compteur qui annoncerait
                  « 11 éléments » au-dessus de neuf lignes ferait douter de
                  l'écran entier. */}
              <AppText variant="caption">{libelleElements(elements)}</AppText>
            </View>
          </View>

          {groupes.map((groupe) => (
            <Groupe key={groupe.categorie} groupe={groupe} />
          ))}

          {/*  Les informations — allergies, plat de substitution — restent en
              avertissement, et sous les aliments : elles se lisent après le
              menu, pas avant. */}
          {menu.notes === null ? null : (
            <AppText variant="caption" color={colors.warning}>
              {menu.notes}
            </AppText>
          )}

          <Button
            label={filOuvert === menu.id ? 'Masquer les commentaires' : 'Commentaires'}
            variant="ghost"
            onPress={() => {
              setFilOuvert(filOuvert === menu.id ? null : menu.id);
            }}
          />

          {filOuvert === menu.id ? <FilCommentaires cible={{ type: 'menu', id: menu.id }} /> : null}
        </Card>
      );
    },
    [filOuvert],
  );

  return (
    <Screen padded={false} edges={[]}>
      <FlatList
        data={jours}
        keyExtractor={(item) => item.menu.id}
        renderItem={renderItem}
        contentContainerStyle={[styles.list, jours.length === 0 && styles.listEmpty]}
        // `keyboardShouldPersistTaps` vaut « never » par défaut : la liste
        // consommerait le premier appui pour fermer le clavier, et « Envoyer »
        // ne le recevrait jamais. Mesuré par scripts/check-clavier-liste.test.mjs.
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        automaticallyAdjustKeyboardInsets
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={colors.primary} />
        }
        ListHeaderComponent={
          <>
            <AsyncErrorBanner
              status={status}
              hasData={jours.length > 0}
              errorMessage={errorMessage}
            />
            {/*  La phrase qui remplace le bouton. Elle est là **avant** les menus,
                et non en bas de liste : c'est la question que se pose un parent
                qui cherche à réserver, et il la cherche en haut. */}
            {/*  Le pastel vert, comme le bandeau du bas de l'accueil : une carte
                d'information qui n'est pas une donnée publiée porte la couleur de
                son écran. Les deux `caption` ci-dessous restent en
                `textSecondary`, mesuré à 5,33:1 sur ce fond — au-dessus des
                4,5:1 qu'exige une légende. */}
            <Card style={{ backgroundColor: accents.vert.soft }}>
              <AppText variant="heading" color={accents.vert.ink}>
                Les menus de la cantine
              </AppText>
              <AppText variant="caption">
                Les menus publiés par l’école, du jour et des semaines à venir.
              </AppText>
              <AppText variant="caption">
                Les réservations et les annulations se font auprès du service de restauration de
                l’école : cette application ne les enregistre pas, et ne peut donc pas confirmer
                votre repas.
              </AppText>
            </Card>

            {aUnePastille ? <LegendePastilles /> : null}
          </>
        }
        ListEmptyComponent={
          <AsyncFallback
            status={status}
            hasData={jours.length > 0}
            errorMessage={errorMessage}
            onRetry={reload}
            emptyTitle="Aucun menu publié"
            emptyDescription="Les menus de la cantine apparaîtront ici dès leur publication."
            emptyIcon="restaurant-outline"
            loadingMessage="Chargement des menus…"
          />
        }
      />
    </Screen>
  );
}

/**
 * Une catégorie et ses aliments.
 *
 * Le titre est en **capitales grises**, comme une étiquette de section : il
 * sépare sans crier, et c'est ce qui distingue « PLAT » du nom d'un plat, écrit
 * en corps normal et en noir. Un titre de la même couleur que les aliments
 * qu'il introduit se lirait comme le premier aliment de la liste.
 */
function Groupe({ groupe }: { readonly groupe: GroupeCategorie }) {
  return (
    <View style={styles.groupe}>
      <AppText variant="caption" bold color={colors.textSecondary} style={styles.titreGroupe}>
        {groupe.titre}
      </AppText>

      {groupe.aliments.map((aliment) => (
        <LigneAliment key={aliment.cle} aliment={aliment} />
      ))}
    </View>
  );
}

/**
 * Un aliment : sa puce, son nom, et sa pastille s'il en porte une.
 *
 * LA PASTILLE EST SOUS LE NOM, ET C'EST VOULU
 * -------------------------------------------
 * À côté du nom, elle en prendrait la moitié de la largeur sur un téléphone
 * étroit, et « Filet de colin sauce ciboulette » se replierait sur trois lignes
 * pour laisser respirer une étiquette de six lettres. En dessous, elle se lit
 * comme une précision sur le plat qui la précède.
 *
 * La puce, elle, reste **grise pour tous les aliments**. La couleur ne sert
 * qu'à identifier le type de plat : une puce verte devant un laitage parce que
 * le laitage serait « sain » ne dirait rien, et ferait douter du sens des
 * pastilles.
 */
function LigneAliment({ aliment }: { readonly aliment: AlimentAffiche }) {
  return (
    <View style={styles.ligne}>
      <View style={styles.puce} accessibilityElementsHidden />
      <View style={styles.corps}>
        <AppText>{aliment.nom}</AppText>
        {aliment.type === null ? null : (
          <Badge
            label={CANTINE_DISH_TYPE_LABELS[aliment.type]}
            accent={CANTINE_DISH_TYPE_ACCENTS[aliment.type]}
          />
        )}
      </View>
    </View>
  );
}

/**
 * La légende des trois pastilles.
 *
 * Elle n'est affichée que si au moins une pastille est visible dans les menus
 * (voir `aUnePastille`), et elle énumère les trois types **dans l'ordre de la
 * constante** : viande, poisson, végétarien. Elle est écrite ici plutôt que
 * déduite des menus affichés, parce qu'une légende qui ne montrerait que les
 * couleurs du jour n'apprendrait rien pour demain.
 */
function LegendePastilles() {
  return (
    <View style={styles.legende}>
      {TYPES_DE_PLAT.map((type) => (
        <Badge
          key={type}
          label={CANTINE_DISH_TYPE_LABELS[type]}
          accent={CANTINE_DISH_TYPE_ACCENTS[type]}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  list: {
    padding: spacing.lg,
    gap: spacing.md,
  },
  listEmpty: {
    flexGrow: 1,
  },
  /**
   * Le jour, et le carré qui le précède.
   *
   * `alignItems: 'center'` plutôt que `flex-start` : les deux éléments d'un
   * en-tête de cantine font une seule ligne de haut — une date courte, un carré
   * de quarante points —, et un alignement sur le haut laisserait le texte
   * flotter au-dessus du carré. C'est l'inverse de la carte d'actualité, dont le
   * titre se replie sur deux lignes et doit rester collé à son badge.
   */
  entete: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  /**
   * Le carré vert qui porte l'icône du jour.
   *
   * Le fond est `tints.vert` — le ton **soutenu** de l'accent —, et non le
   * pastel `accents.vert.soft` : l'icône est posée sur le carré, pas sur la
   * carte, et c'est ce couple-là qui a été mesuré (`success` sur `successTint`,
   * 3,79:1, au-dessus des 3:1 qu'exige une icône seule). Confondre les deux tons
   * effacerait le relief et ferait mesurer l'icône contre un fond qui n'est pas
   * le sien.
   */
  carre: {
    width: 40,
    height: 40,
    borderRadius: radius.md,
    backgroundColor: tints.vert,
    alignItems: 'center',
    justifyContent: 'center',
  },
  titres: {
    // `flex: 1` : une date longue — « mercredi 30 septembre » — se replie au
    // lieu de pousser le carré hors de la carte.
    flex: 1,
  },
  /**
   * Une catégorie : son titre, puis ses aliments.
   *
   * `marginTop: spacing.sm` s'ajoute à l'écart que la carte pose déjà entre ses
   * enfants. Sans lui, le titre d'une catégorie serait aussi proche du groupe
   * précédent que deux aliments le sont entre eux, et la séparation se perdrait
   * — or c'est exactement ce que le regroupement doit rendre lisible.
   */
  groupe: {
    marginTop: spacing.sm,
    gap: spacing.sm,
  },
  /**
   * Le titre de catégorie.
   *
   * `letterSpacing` et l'écart au-dessus viennent de la maquette de référence :
   * un titre de section en capitales se lit d'autant mieux qu'il respire, et
   * c'est ce qui le sépare visuellement des aliments sans qu'un trait soit
   * nécessaire.
   */
  titreGroupe: {
    letterSpacing: 0.8,
  },
  ligne: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
  },
  /**
   * La puce d'un aliment.
   *
   * `marginTop: 7` l'aligne sur la **première ligne** du nom, et non sur le haut
   * de la boîte : un nom qui se replie sur deux lignes laisserait sinon la puce
   * collée au-dessus du texte. La valeur est dérivée de la hauteur de ligne du
   * corps (15 px de corps, ligne de 22 px) moins la moitié du diamètre.
   */
  puce: {
    width: 5,
    height: 5,
    borderRadius: radius.pill,
    backgroundColor: colors.borderInteractive,
    marginTop: 8,
  },
  corps: {
    flex: 1,
    gap: spacing.xs,
  },
  legende: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    paddingHorizontal: spacing.xs,
  },
});
