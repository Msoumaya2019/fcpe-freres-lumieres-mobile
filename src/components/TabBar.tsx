import { Ionicons } from '@expo/vector-icons';
import {
  BottomTabBarHeightCallbackContext,
  type BottomTabBarProps,
} from '@react-navigation/bottom-tabs';
import { use } from 'react';
import { Platform, Pressable, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/AppText';
import { colors, fontSize, radius, spacing } from '@/theme';

/** Icônes d'un onglet, dans ses deux états. */
export interface TabIcon {
  readonly active: keyof typeof Ionicons.glyphMap;
  readonly inactive: keyof typeof Ionicons.glyphMap;
}

/** Icônes par nom de route. Voir `src/navigation/MainTabs.tsx`. */
export type TabIcons = Readonly<Record<string, TabIcon>>;

/**
 * Repli d'un onglet dont l'icône n'a pas été déclarée.
 *
 * Un onglet ajouté sans entrée dans la table apparaîtrait ainsi, plutôt que de
 * rester invisible — un écran qu'on ne peut pas atteindre est un écran perdu.
 */
const FALLBACK_ICON: TabIcon = { active: 'ellipse', inactive: 'ellipse-outline' };

const ICON_SIZE = 20;
const ICON_SIZE_ACTIVE = 22;

/**
 * Largeur et hauteur de la pastille, et hauteur de ligne du libellé.
 *
 * POURQUOI LA PASTILLE A DES DIMENSIONS FIXES ALORS QUE L'ICÔNE CHANGE
 * --------------------------------------------------------------------
 * L'onglet actif demande une icône plus grande (22 au lieu de 20) ; sans
 * dimensions fixes, la pastille **changerait de taille en changeant d'onglet**,
 * et toute la barre sauterait à chaque appui. Les deux valeurs réservent donc la
 * place du plus grand des deux états : c'est le plus grand qui décide, et le
 * plus petit se centre dedans.
 *
 * La largeur est un **minimum**, pas une largeur : c'est ce qui permet à la
 * pastille de s'élargir si la taille de police du téléphone agrandit la
 * pastille de comptage posée dessus.
 *
 * Elles ne dépendent pas de la taille de police du téléphone, et c'est
 * volontaire : ce sont des **réservations de place**, pas des tailles de texte.
 * Ce qui doit grandir avec la police, c'est le libellé lui-même, et il grandit —
 * voir `MAX_LABEL_SCALE`.
 */
const PILL_WIDTH = 56;
const PILL_HEIGHT = 30;
const LABEL_LINE_HEIGHT = 18;

/**
 * Plafond de mise à l'échelle du libellé.
 *
 * Au-delà, « Mes signalements » se tronquerait en « Mes signal… », ce qui ne se
 * lit pas : un mot entier à 19 points vaut mieux qu'un mot coupé à 39. Le
 * plafond porte sur le libellé et non sur la barre, qui reste en flux normal et
 * prend la hauteur de son contenu.
 */
const MAX_LABEL_SCALE = 1.5;

/**
 * Barre d'onglets, écrite à la main.
 *
 * POURQUOI PAS LA BARRE PAR DÉFAUT
 * --------------------------------
 * La maquette demande une pastille arrondie derrière l'onglet actif, et **aucun
 * des deux leviers** offerts par la bibliothèque ne le permet. Les deux échouent
 * silencieusement : rien ne plante, aucun avertissement n'apparaît, la barre
 * s'affiche simplement autrement que demandé.
 *
 *   - `tabBarIcon` rend l'icône **deux fois, superposées** — une version active
 *     et une version inactive qui se fondent l'une dans l'autre — dans une boîte
 *     de taille fixe. Une pastille posée là serait dessinée deux fois, et rognée ;
 *   - `tabBarActiveBackgroundColor` colore bien le fond de l'onglet, mais le
 *     rayon de ce fond est **calculé par la bibliothèque** et vaut `0` pour une
 *     barre en bas d'écran — il ne vaut 10 que pour une barre latérale. On
 *     obtiendrait un rectangle plein, pas la pastille.
 *
 * Ces deux points ne sont pas repris d'une documentation : ils sont **mesurés
 * dans le paquet installé** (`@react-navigation/bottom-tabs` 7.19.1), où
 * `TabBarIcon` déclare `ICON_SIZE_WIDE = 31` et `ICON_SIZE_TALL = 28`, et où
 * `BottomTabItem` calcule `borderRadius = … : sidebar && horizontal ? 10 : 0`.
 *
 * CE QUI EST REPRIS DE L'IMPLÉMENTATION PAR DÉFAUT
 * ------------------------------------------------
 * Trois choses, et les retirer casserait des comportements que personne ne
 * remarque tant qu'ils sont là :
 *
 *   1. l'appui émet `tabPress` avec `canPreventDefault`, puis navigue seulement
 *      si l'événement n'a pas été intercepté **et** si l'onglet n'est pas déjà
 *      actif. Sans la seconde condition, réappuyer sur l'onglet courant ne
 *      remonte plus la liste en haut — un geste que les adhérents font sans y
 *      penser ;
 *   2. le libellé accessible annonce la position — « Cantine, onglet 3 sur 5 ».
 *      Le rôle `tab` ne produit pas l'annonce attendue sur iOS, où la
 *      bibliothèque retombe elle aussi sur `button` ;
 *   3. la hauteur mesurée est republiée dans le contexte de la bibliothèque.
 *      Sans cela, `useBottomTabBarHeight` répondrait la hauteur de la barre **par
 *      défaut** (49 points) pour une barre qui en mesure 84, et tout écran qui
 *      s'en sert pour se réserver une marge serait faux.
 *
 * CE QUI PORTE L'IDENTIFICATION DE L'ONGLET ACTIF
 * -----------------------------------------------
 * Trois signaux, et le fond de la pastille n'est que le troisième :
 *
 *   - la **forme** de l'icône — pleine pour l'onglet actif, au trait pour les
 *     autres. C'est le signal qui subsiste pour un daltonisme, et il ne repose
 *     sur aucune couleur ;
 *   - la **couleur du libellé et de l'icône**, mesurée dans
 *     `scripts/check-contrast.test.mjs` : `primary` sur `primarySoft` vaut
 *     5,44:1, très au-dessus des 4,5:1 exigés ;
 *   - le **fond de la pastille**, qui ne vaut que 1,16:1 contre la surface.
 *     C'est pourquoi il est **décoratif** : il renforce un signal déjà porté par
 *     la forme et par la couleur, et le retirer ne rendrait pas l'onglet actif
 *     ambigu. C'est aussi pourquoi il ne figure pas dans les paires non
 *     textuelles du contrôle de contraste, qui exigent 3:1.
 */
export function TabBar({ state, descriptors, navigation, insets, icons }: TabBarProps) {
  const reportHeight = use(BottomTabBarHeightCallbackContext);

  return (
    <View
      role="tablist"
      onLayout={(event) => {
        reportHeight?.(event.nativeEvent.layout.height);
      }}
      style={[
        styles.bar,
        {
          backgroundColor: colors.surface,
          borderTopColor: colors.border,
          paddingTop: spacing.xs,
          paddingBottom: spacing.xs + insets.bottom,
        },
      ]}
    >
      {state.routes.map((route, position) => {
        // Le descripteur est typé comme pouvant manquer, sans que cela puisse
        // arriver : le navigateur le construit à partir des mêmes routes. S'il
        // manquait malgré tout, l'onglet reste rendu et prend le nom de sa
        // route — le faire disparaître rendrait un écran inatteignable.
        const options = descriptors[route.key]?.options;
        const selected = state.index === position;
        const icon = icons[route.name] ?? FALLBACK_ICON;

        // `tabBarLabel` peut être une fonction ; ce projet ne s'en sert pas et
        // le titre déclaré suffit alors à nommer l'onglet.
        const raw = options?.tabBarLabel;
        const label = typeof raw === 'string' ? raw : (options?.title ?? route.name);

        const onPress = () => {
          const event = navigation.emit({
            type: 'tabPress',
            target: route.key,
            canPreventDefault: true,
          });

          if (!selected && !event.defaultPrevented) {
            navigation.navigate(route.name, route.params);
          }
        };

        const onLongPress = () => {
          navigation.emit({ type: 'tabLongPress', target: route.key });
        };

        const tint = selected ? colors.primary : colors.textSecondary;
        const badge = options?.tabBarBadge;

        return (
          <Pressable
            key={route.key}
            onPress={onPress}
            onLongPress={onLongPress}
            // `role: 'tab'` ne produit pas l'annonce attendue sur iOS — la
            // bibliothèque retombe elle aussi sur `button` pour cette
            // plateforme —, et le libellé explicite porte alors l'information.
            role={Platform.select({ ios: 'button', default: 'tab' })}
            aria-selected={selected}
            accessibilityLabel={
              options?.tabBarAccessibilityLabel ??
              `${label}, onglet ${position + 1} sur ${state.routes.length}`
            }
            style={styles.tab}
          >
            {/*
              La pastille porte l'icône **seule**, le libellé reste dessous.
              C'est ce que montre la maquette, relevé au pixel, et ce n'est pas
              un détail de dessin : une pastille qui engloberait le libellé
              changerait de largeur avec la longueur du mot, et « Mes
              signalements » déborderait de son onglet.
            */}
            <View style={[styles.pill, selected ? { backgroundColor: colors.primarySoft } : null]}>
              <Ionicons
                name={selected ? icon.active : icon.inactive}
                size={selected ? ICON_SIZE_ACTIVE : ICON_SIZE}
                color={tint}
              />
              {/*
                La pastille de comptage est posée **dans** la boîte de l'icône,
                pas à côté : elle se place par rapport à l'icône et suit donc
                l'onglet actif, dont l'icône est plus grande.
              */}
              {badge === undefined || badge === null ? null : (
                <View
                  style={[
                    styles.badge,
                    {
                      backgroundColor: colors.danger,
                      borderColor: colors.surface,
                    },
                  ]}
                >
                  <AppText
                    variant="caption"
                    bold
                    color={colors.textOnPrimary}
                    numberOfLines={1}
                    maxFontSizeMultiplier={1}
                    style={styles.badgeText}
                  >
                    {String(badge)}
                  </AppText>
                </View>
              )}
            </View>

            <AppText
              variant="caption"
              numberOfLines={1}
              maxFontSizeMultiplier={MAX_LABEL_SCALE}
              bold={selected}
              color={tint}
              style={[styles.label, selected && styles.labelActive]}
            >
              {label}
            </AppText>
          </Pressable>
        );
      })}
    </View>
  );
}

export interface TabBarProps extends BottomTabBarProps {
  readonly icons: TabIcons;
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  tab: {
    // Les cinq onglets se partagent la largeur à parts égales. Aucune largeur
    // fixe : elle serait fausse sur l'un des formats d'iPhone.
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
  pill: {
    minWidth: PILL_WIDTH,
    height: PILL_HEIGHT,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  /**
   * La pastille de comptage.
   *
   * Elle est posée en absolu **dans** la pastille de l'onglet, qui est son
   * repère : elle suit donc l'icône, y compris quand celle-ci grandit sur
   * l'onglet actif. La bordure est de la couleur de la barre, ce qui la détache
   * de l'icône qu'elle recouvre partiellement — sans elle, le chiffre se lirait
   * posé sur l'icône et non sur une pastille.
   */
  badge: {
    position: 'absolute',
    top: -4,
    right: -8,
    minWidth: 16,
    height: 16,
    borderRadius: radius.pill,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 3,
  },
  badgeText: {
    fontSize: 10,
    lineHeight: 12,
  },
  label: {
    fontSize: fontSize.caption,
    lineHeight: LABEL_LINE_HEIGHT,
  },
  labelActive: {
    fontSize: fontSize.caption + 1,
  },
});
