/**
 * Notifications push — la moitié qui demande l'autorisation et obtient le jeton.
 *
 * POURQUOI CE FICHIER EST SÉPARÉ DE `notifications.ts`
 * ---------------------------------------------------
 * `notifications.ts` dépose un jeton **déjà obtenu** dans la base, et son en-tête
 * dit pourquoi : cette écriture se vérifie sans appareil, sans émulateur et sans
 * dépendance native. Importer `expo-notifications` dans ce fichier aurait détruit
 * exactement cette propriété — le jour où un banc voudra éprouver l'écriture, il
 * chargerait un module natif absent de son environnement.
 *
 * La séparation est donc tenue par deux fichiers, et non par un commentaire :
 * ici le paquet natif, là la base. Un banc vérifie qu'aucun des deux ne franchit
 * la frontière dans l'autre sens.
 *
 * CE QUE CE FICHIER N'ÉCRIT PAS
 * -----------------------------
 * Le `projectId` n'est pas écrit ici. `getExpoPushTokenAsync` le résout seul —
 * `Constants.expoConfig?.extra?.eas?.projectId`, que `app.json` porte déjà — et
 * le recopier aurait créé une seconde copie d'une même vérité, à tenir en accord
 * avec la première sans que rien ne les relie. La documentation d'Expo le
 * *recommande*, et c'est justement pourquoi il faut dire non : une
 * recommandation n'est pas une mesure.
 *
 * L'AUTORISATION SE DEMANDE SUR UN GESTE, JAMAIS TOUTE SEULE
 * ----------------------------------------------------------
 * `demanderNotifications()` est la **seule** fonction qui ouvre la boîte de
 * dialogue du système. Deux écrans l'appellent, et ils ne se recouvrent pas :
 *
 *   - `InvitationNotifications`, monté à la racine : **une fois**, à la
 *     première ouverture, après que le premier écran a été vu. C'est
 *     l'application qui pose la question, en clair, avant que le système n'en
 *     pose une.
 *   - l'écran Réglages : la porte permanente, pour qui a reporté ou refusé.
 *
 * `preparerNotifications()`, au démarrage, **ne pose aucune question** : un
 * appareil qui a déjà dit oui rafraîchit son jeton ; un appareil qui n'a jamais
 * répondu reste en paix.
 *
 * Ce qui reste vrai, et qui décide de tout : un refus est **définitif**. Depuis
 * Android 13, l'application ne peut plus reposer la question — c'est ce que
 * `peutRedemander` rapporte, et ce que l'écran doit dire. C'est précisément
 * pourquoi la question de l'application précède celle du système : le parent
 * peut répondre « Plus tard » sans avoir rien refusé.
 */

import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import { toAppError } from '@/errors';
import { enregistrerAppareil, type Plateforme } from '@/services/notifications';
import { colors } from '@/theme';

/**
 * L'identifiant du canal Android.
 *
 * Un message poussé sans `channelId` atterrit dans le canal que le **manifeste**
 * désigne, par la clé `com.google.firebase.messaging.default_notification_channel_id`.
 * C'est le rôle de `defaultChannel` dans les options du greffon
 * `expo-notifications`, déclarées dans `app.json` — et les deux valeurs doivent
 * donc être le même mot. Un banc les confronte : deux copies d'une même vérité
 * finissent toujours par diverger, à moins que quelque chose ne les regarde.
 */
const CANAL = 'default';

/**
 * Ce que le système répond, réduit à ce qui se décide.
 *
 * `indisponible` n'est pas une nuance de `refusees` : c'est le web, ou un
 * appareil qui ne sait pas recevoir de notification. L'écran n'y propose rien,
 * parce qu'il n'y a rien à proposer.
 */
export type Autorisation = 'accordees' | 'refusees' | 'jamaisDemandees' | 'indisponible';

export interface EtatPush {
  readonly autorisation: Autorisation;
  /**
   * `false` quand le système ne reposera plus la question.
   *
   * Sans ce drapeau, l'écran afficherait un bouton qui n'agit sur rien : sur
   * Android 13 et au-delà, `requestPermissionsAsync` rend la main sans rien
   * afficher après un refus. C'est le défaut que l'écran Réglages nomme
   * explicitement — un réglage qui n'agit sur rien est pire qu'un réglage absent.
   */
  readonly peutRedemander: boolean;
}

export interface ResultatDemande {
  /** L'état **après** la demande : c'est lui que l'écran réaffiche. */
  readonly etat: EtatPush;
  /**
   * `false` quand l'autorisation est accordée mais que le jeton n'a pas pu être
   * déposé.
   *
   * Les deux faits sont distincts, et les confondre ferait croire à un parent
   * qu'il recevra des notifications alors que rien n'est enregistré. Les causes
   * du second sont connues : hors connexion, ou `google-services.json` absent —
   * les installations Firebase répondent alors `403 PERMISSION_DENIED`, sans
   * exception parlante côté JavaScript.
   */
  readonly enregistre: boolean;
}

const INDISPONIBLE: EtatPush = { autorisation: 'indisponible', peutRedemander: false };

/** La plateforme, ou `null` sur le web — où il n'y a ni jeton ni canal. */
function plateforme(): Plateforme | null {
  if (Platform.OS === 'android') {
    return 'android';
  }
  return Platform.OS === 'ios' ? 'ios' : null;
}

/**
 * La réponse du système, traduite.
 *
 * `undetermined` est le seul état où la question n'a jamais été posée ; tout le
 * reste qui n'accorde pas est un refus. `granted` couvre l'autorisation
 * provisoire d'iOS, ce qui est exact : une notification provisoire se délivre.
 */
function lire(statut: Notifications.NotificationPermissionsStatus): EtatPush {
  const autorisation: Autorisation = statut.granted
    ? 'accordees'
    : statut.status === 'undetermined'
      ? 'jamaisDemandees'
      : 'refusees';

  return { autorisation, peutRedemander: statut.canAskAgain };
}

/**
 * Crée le canal Android, et ne fait rien ailleurs.
 *
 * Sans canal, Android 8 et au-delà refuse **silencieusement** d'afficher : la
 * notification est comptée, jamais montrée, et rien ne le signale. Le canal se
 * crée sans autorisation — il n'en faut une que pour afficher.
 *
 * La teinte vient de la palette et n'est pas recopiée : c'est la pastille que le
 * système pose à côté de la notification.
 */
async function ouvrirCanal(): Promise<void> {
  if (Platform.OS !== 'android') {
    return;
  }

  await Notifications.setNotificationChannelAsync(CANAL, {
    name: 'Actualités et messages',
    importance: Notifications.AndroidImportance.DEFAULT,
    lightColor: colors.primary,
  });
}

/**
 * Le jeton, puis la base.
 *
 * `getExpoPushTokenAsync` interroge les serveurs d'Expo, qui relaient vers FCM :
 * il échoue hors connexion, et il échoue aussi quand l'application n'est pas
 * enregistrée auprès de Firebase. L'échec remonte — c'est à l'appelant de dire
 * ce qu'il en fait, parce que lui seul sait s'il a un écran pour le dire.
 */
async function enregistrer(cible: Plateforme): Promise<void> {
  const jeton = await Notifications.getExpoPushTokenAsync();
  await enregistrerAppareil(jeton.data, cible);
}

/** Ce que le système répond, sans rien demander. */
export async function etatPush(): Promise<EtatPush> {
  if (plateforme() === null) {
    return INDISPONIBLE;
  }

  try {
    return lire(await Notifications.getPermissionsAsync());
  } catch (erreur) {
    console.warn('État des notifications illisible :', toAppError(erreur).technicalDetail);
    return INDISPONIBLE;
  }
}

/**
 * Au démarrage : montrer les notifications reçues application ouverte, puis
 * rafraîchir le jeton — sans jamais poser de question.
 *
 * Ne rend rien et ne lève rien. Une application qui ne peut pas s'enregistrer
 * perd les notifications ; elle ne perd pas l'accès aux actualités, et c'est ce
 * qui doit rester vrai.
 */
export async function preparerNotifications(): Promise<void> {
  try {
    // Sans gestionnaire, une notification reçue pendant que l'application est
    // ouverte est **silencieusement écartée** : l'adhérent la verrait sur
    // l'écran verrouillé et pas dans l'application, ce qui se lit comme une
    // panne. La bannière et la liste sont donc demandées explicitement.
    //
    // La pastille, non : le nombre de messages non lus est calculé par
    // l'application (`useNonLus`) et affiché dans ses propres écrans. Laisser
    // l'OS tenir un second compte, qu'aucun envoi ne met à jour, donnerait un
    // chiffre faux à côté d'un chiffre juste.
    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowBanner: true,
        shouldShowList: true,
        shouldPlaySound: true,
        shouldSetBadge: false,
      }),
    });

    const cible = plateforme();
    if (cible === null) {
      return;
    }

    await ouvrirCanal();

    const statut = await Notifications.getPermissionsAsync();
    if (!statut.granted) {
      return;
    }

    await enregistrer(cible);
  } catch (erreur) {
    console.warn('Préparation des notifications impossible :', toAppError(erreur).technicalDetail);
  }
}

/**
 * Sur un geste de l'adhérent : poser la question, puis enregistrer.
 *
 * L'ordre porte tout le sens — on demande d'abord, on n'écrit que si la réponse
 * est oui. L'inverse laisserait un appareil enregistré pour quelqu'un qui a
 * refusé, et l'écran afficherait « accordées » là où le système dit non.
 */
export async function demanderNotifications(): Promise<ResultatDemande> {
  const cible = plateforme();
  if (cible === null) {
    return { etat: INDISPONIBLE, enregistre: false };
  }

  let etat: EtatPush;

  try {
    await ouvrirCanal();
    etat = lire(await Notifications.requestPermissionsAsync());
  } catch (erreur) {
    console.warn('Demande d’autorisation impossible :', toAppError(erreur).technicalDetail);
    return { etat: INDISPONIBLE, enregistre: false };
  }

  if (etat.autorisation !== 'accordees') {
    return { etat, enregistre: false };
  }

  try {
    await enregistrer(cible);
    return { etat, enregistre: true };
  } catch (erreur) {
    console.warn('Enregistrement de l’appareil impossible :', toAppError(erreur).technicalDetail);
    return { etat, enregistre: false };
  }
}
