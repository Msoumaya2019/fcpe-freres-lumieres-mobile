import { Ionicons } from '@expo/vector-icons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useCallback } from 'react';
import { FlatList, Pressable, StyleSheet, View } from 'react-native';

import { useAuth } from '@/auth/AuthProvider';
import { AppText, Button, Card, Screen } from '@/components';
import { useNonLus } from '@/hooks/useNonLus';
import type { PlusStackParamList } from '@/navigation/types';
import { accents, colors, radius, spacing, type AccentName } from '@/theme';
import type { MemberStatus } from '@/types/models';

interface Entree {
  readonly cle: keyof PlusStackParamList;
  readonly titre: string;
  readonly sousTitre: string;
  readonly icone: keyof typeof Ionicons.glyphMap;
  readonly accent: AccentName;
  /**
   * Vrai pour les rubriques qui n'ont de sens qu'avec une session ouverte.
   *
   * Ce n'est pas un contrôle de sécurité — il vit dans les politiques RLS, et
   * lui seul décide. C'est une **honnêteté d'affichage** : proposer
   * « Discussion » à un parent sans compte le mènerait à un écran vide, et il
   * croirait l'application cassée.
   */
  readonly membres: boolean;
  /**
   * Vrai pour les rubriques réservées au **bureau** de l'association.
   *
   * Même nature que `membres`, et la même réserve : la sécurité vit dans les
   * fonctions SQL, qui vérifient `is_admin()` dans leur corps. Ce drapeau n'est
   * qu'une honnêteté d'affichage — proposer « Messages des familles » à un
   * adhérent ordinaire le mènerait à un refus, et il croirait l'application
   * cassée.
   *
   * Déclaré sur **chaque** entrée, et non facultatif : une rubrique ajoutée
   * sans y penser se retrouverait visible de tous, alors que l'oubli inverse —
   * un `false` de trop — ne coûte qu'une entrée absente.
   */
  readonly bureau: boolean;
}

/**
 * Les rubriques rangées sous « Plus », dans l'ordre d'usage.
 *
 * La discussion vient en premier : c'est la seule de ces rubriques qu'on ouvre
 * plusieurs fois par semaine, et elle porte un badge. Les messages des familles
 * la suivent, parce que c'est le même geste — lire et répondre — et que le
 * bureau y revient aussi souvent ; elle n'apparaît qu'à lui. Les documents et
 * les actualités se consultent de temps en temps ; le profil et les réglages,
 * presque jamais.
 */
const ENTREES: readonly Entree[] = [
  {
    cle: 'Discussion',
    titre: 'Discussion',
    sousTitre: 'Espace membres',
    icone: 'chatbubbles-outline',
    accent: 'bleu',
    membres: true,
    bureau: false,
  },
  {
    cle: 'ConversationsBureau',
    titre: 'Messages des familles',
    sousTitre: 'Conversations privées avec les parents',
    icone: 'mail-unread-outline',
    accent: 'ambre',
    membres: true,
    bureau: true,
  },
  {
    cle: 'AdhesionsBureau',
    titre: 'Adhésions',
    sousTitre: 'Accepter, refuser, suspendre',
    icone: 'people-outline',
    accent: 'vert',
    membres: true,
    bureau: true,
  },
  {
    cle: 'Documents',
    titre: 'Documents importants',
    sousTitre: 'Formulaires, règlements, comptes rendus',
    icone: 'document-text-outline',
    accent: 'ambre',
    membres: false,
    bureau: false,
  },
  {
    cle: 'Actualites',
    titre: 'Actualités',
    sousTitre: 'Toutes les informations publiées',
    icone: 'megaphone-outline',
    accent: 'rose',
    membres: false,
    bureau: false,
  },
  {
    cle: 'MesSignalements',
    titre: 'Mes signalements',
    sousTitre: 'Suivre leur avancement',
    icone: 'alert-circle-outline',
    accent: 'vert',
    membres: true,
    bureau: false,
  },
  {
    cle: 'Profil',
    titre: 'Mon profil',
    sousTitre: 'Nom affiché et rôle',
    icone: 'person-circle-outline',
    accent: 'violet',
    membres: true,
    bureau: false,
  },
  {
    cle: 'Reglages',
    titre: 'Réglages',
    sousTitre: 'Préférences, confidentialité, déconnexion',
    icone: 'settings-outline',
    accent: 'bleu',
    membres: true,
    bureau: false,
  },
];

/**
 * Ce que l'écran dit du statut d'une adhésion.
 *
 * Les quatre statuts viennent de la base (`member_status`), et c'est là qu'ils
 * sont appliqués : un compte non accepté lit une discussion **vide**, parce que
 * la politique RLS le refuse. L'écran ne peut donc pas se contenter de ne rien
 * afficher — une liste vide et un refus se ressemblent, et le parent conclurait
 * que l'application ne marche pas. Il doit dire lequel des deux il vit.
 */
const STATUTS: Record<MemberStatus, { titre: string; explication: string }> = {
  en_attente: {
    titre: 'Demande en attente',
    explication:
      'Votre demande d’adhésion a bien été reçue. Le bureau de l’association la ' +
      'valide, et votre statut changera sur cet écran. L’application n’envoie ' +
      'aucune notification : revenez ici pour le consulter. En attendant, vous ' +
      'pouvez lire les actualités, les menus, l’agenda et les documents destinés ' +
      'aux familles.',
  },
  accepte: {
    titre: 'Adhérent',
    explication: 'Votre accès à l’espace membres est actif.',
  },
  refuse: {
    titre: 'Demande non retenue',
    explication:
      'Le bureau n’a pas retenu votre demande d’adhésion. Vous conservez l’accès ' +
      'à toutes les informations publiques de l’application.',
  },
  suspendu: {
    titre: 'Accès suspendu',
    explication:
      'Votre accès à l’espace membres est momentanément suspendu. Contactez le ' +
      'bureau de l’association si vous souhaitez en connaître la raison.',
  },
};

/**
 * « Plus » — le menu des rubriques qui ne tiennent pas dans la barre.
 *
 * POURQUOI CES RUBRIQUES SONT ICI ET PAS DANS LA BARRE
 * ---------------------------------------------------
 * Cinq entrées est le maximum lisible dans une barre d'onglets : au-delà, les
 * libellés se tronquent et les cibles tactiles se resserrent sous le seuil où
 * l'on touche juste du premier coup. Les rubriques de cet écran se consultent en
 * outre beaucoup moins souvent que l'accueil, la cantine, l'agenda ou le
 * contact — et rien ne justifie de leur donner la même place.
 *
 * AUCUNE N'EST SUPPRIMÉE
 * ----------------------
 * La discussion, les signalements et les actualités existaient comme onglets
 * avant la refonte. Elles sont **reclassées**, pas retirées : leurs écrans, leurs
 * tables et leurs politiques sont inchangés, et on y accède par ce menu.
 *
 * POURQUOI CET ÉCRAN NE CHARGE PLUS RIEN LUI-MÊME
 * -----------------------------------------------
 * Il portait un `useAsyncData` dont la seule donnée était le nombre de non-lus,
 * relu au retour sur l'écran pour corriger un badge périmé. C'était la troisième
 * copie du même chiffre — et la seule des trois qui se corrigeait. Les deux
 * autres, la pastille de l'onglet et la cloche de l'accueil, continuaient
 * d'annoncer des messages déjà lus.
 *
 * Le compte est maintenant partagé, publié par `src/services/unread.ts` et lu par
 * `useNonLus` : plus de relecture au retour, plus de drapeau de premier
 * affichage, et plus de tirer-pour-rafraîchir sur un menu dont le contenu ne
 * dépend pas du réseau. L'écran redevient ce qu'il est — une liste de rubriques —
 * et il reste utilisable hors ligne, ce que la version précédente ne garantissait
 * que par un commentaire.
 */
export function PlusScreen({ navigation }: NativeStackScreenProps<PlusStackParamList, 'PlusHome'>) {
  const { session, profile, signOut } = useAuth();
  const connecte = session !== null;
  const nonLus = useNonLus(session?.user.id ?? '');

  // Le statut vient du profil, et vaut « en attente » tant qu'il n'est pas lu :
  // c'est le seul défaut qui ne promette rien. Supposer « accepté » afficherait
  // l'espace membres à un compte que la base refuse.
  const statut: MemberStatus = profile?.status ?? 'en_attente';
  const membre = connecte && statut === 'accepte';

  // Le rôle, et non le statut : les deux conditions ne se recouvrent pas. Un
  // administrateur suspendu reste administrateur, et la base le laisse lire les
  // messages des familles — c'est `is_admin()` qui décide, et il ne regarde que
  // le rôle. Afficher l'entrée sur le statut ferait disparaître du menu une
  // rubrique que la base autorise encore.
  const estBureau = connecte && profile?.role === 'admin';

  const entrees = ENTREES.filter(
    (entree) => (!entree.membres || membre) && (!entree.bureau || estBureau),
  );

  const renderItem = useCallback(
    ({ item }: { readonly item: Entree }) => {
      const { ink, soft } = accents[item.accent];
      const badge = item.cle === 'Discussion' && nonLus > 0 ? nonLus : null;

      return (
        <Pressable
          onPress={() => {
            navigation.navigate(item.cle);
          }}
          accessibilityRole="button"
          accessibilityLabel={
            badge === null
              ? `${item.titre}. ${item.sousTitre}`
              : `${item.titre}. ${item.sousTitre}. ${badge} non lu${badge > 1 ? 's' : ''}`
          }
          style={({ pressed }) => [styles.entree, pressed && styles.entreeAppuyee]}
        >
          <View style={[styles.pastille, { backgroundColor: soft }]}>
            <Ionicons name={item.icone} size={20} color={ink} />
          </View>

          <View style={styles.entreeTexte}>
            <AppText variant="body" bold>
              {item.titre}
            </AppText>
            <AppText variant="caption" numberOfLines={1}>
              {item.sousTitre}
            </AppText>
          </View>

          {badge === null ? null : (
            <View style={styles.badge}>
              <AppText
                variant="caption"
                bold
                color={colors.textOnPrimary}
                style={styles.badgeTexte}
              >
                {badge > 9 ? '9+' : badge}
              </AppText>
            </View>
          )}

          <Ionicons name="chevron-forward" size={18} color={colors.textSecondary} />
        </Pressable>
      );
    },
    [navigation, nonLus],
  );

  return (
    <Screen padded={false} edges={[]}>
      <FlatList
        data={entrees}
        keyExtractor={(item) => item.cle}
        renderItem={renderItem}
        contentContainerStyle={styles.liste}
        ListHeaderComponent={
          connecte ? (
            <Card elevated style={styles.identite}>
              <AppText variant="heading">{profile?.display_name ?? 'Membre'}</AppText>
              <AppText variant="caption">{STATUTS[statut].titre}</AppText>
              {membre ? null : (
                <AppText variant="caption" style={styles.explication}>
                  {STATUTS[statut].explication}
                </AppText>
              )}
            </Card>
          ) : (
            <Card elevated style={styles.identite}>
              <AppText variant="heading">Espace membres</AppText>
              <AppText variant="caption" style={styles.explication}>
                L’accès à la discussion et aux signalements est réservé aux adhérents de
                l’association. Tout le reste de l’application se consulte sans compte.
              </AppText>
              <Button
                label="Se connecter ou adhérer"
                onPress={() => {
                  navigation.navigate('AccesMembre');
                }}
              />
            </Card>
          )
        }
        ListFooterComponent={
          <View style={styles.pied}>
            {/* Ni bandeau d'erreur ni bouton « Réessayer » : le seul chargement
                de cet écran est le compte des non-lus, et il n'a pas d'échec
                visible — voir `rafraichirNonLus`, qui ne rejette jamais. Une
                rubrique injoignable se signale dans son propre écran, là où
                l'adhérent la demande. */}
            {connecte ? (
              <Button
                label="Se déconnecter"
                variant="secondary"
                onPress={() => {
                  void signOut();
                }}
              />
            ) : null}
          </View>
        }
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  liste: {
    padding: spacing.lg,
    gap: spacing.md,
  },
  identite: {
    gap: spacing.xs,
  },
  explication: {
    marginBottom: spacing.sm,
  },
  entree: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.md,
  },
  entreeAppuyee: {
    opacity: 0.7,
  },
  pastille: {
    width: 40,
    height: 40,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  entreeTexte: {
    flex: 1,
    gap: 2,
  },
  badge: {
    minWidth: 22,
    height: 22,
    borderRadius: radius.pill,
    backgroundColor: colors.danger,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 5,
  },
  badgeTexte: {
    fontSize: 11,
    lineHeight: 14,
  },
  pied: {
    gap: spacing.md,
    marginTop: spacing.md,
  },
});
