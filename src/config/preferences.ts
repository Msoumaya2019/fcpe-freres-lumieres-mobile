/**
 * Préférences locales — ce que l'application retient sur le téléphone.
 *
 * DISTINCTES DU STOCKAGE D'AUTHENTIFICATION
 * -----------------------------------------
 * `src/config/storage.ts` garde la session, et passe par `SecureStore` sur
 * téléphone. Ce fichier-ci garde le reste, et passe par `AsyncStorage`, qui n'a
 * pas la limite de taille de `SecureStore` ni son coût.
 *
 * SIX FAMILLES DE CLÉS, TROIS SONT DES PRÉFÉRENCES
 * ------------------------------------------------
 * Le préfixe `fcpe.` isole ces clés de celles qu'une autre bibliothèque
 * écrirait dans le même magasin. Il ne dit pas qu'elles se ressemblent :
 *
 *   `discussion.lu.*`        une **marque de lecture**. Elle se recalcule, et
 *                            la remettre à zéro est un effet visible — c'est
 *                            la **seule** chose que « Effacer » efface.
 *   `appareil.cle`           la clé de vote de cet appareil. C'est ce qui
 *                            empêche de voter deux fois : l'effacer ne
 *                            remettrait pas un réglage à zéro, cela **lèverait
 *                            une limite**. Elle ne se remet pas à zéro depuis
 *                            un écran de réglages.
 *   `sondage.vote.*`         le vote que cet appareil a déposé. L'effacer
 *                            reproposerait de voter, et le serveur refuserait
 *                            le doublon — un bouton qui mène à un refus.
 *   `contact.conversations`  le **secret** de chaque conversation ouverte avec
 *                            le bureau. Le serveur n'en garde qu'une empreinte,
 *                            et ne le rend qu'à la création : c'est l'**unique
 *                            copie**. L'effacer, c'est perdre l'accès au fil
 *                            **définitivement** — là où un parent signale
 *                            parfois une situation personnelle.
 *   `notifications.invitation` la marque de l'invitation déjà posée. L'effacer
 *                            repose la question une fois de plus, et rien
 *                            d'autre : c'est une préférence au même titre que
 *                            les marques de lecture, à ceci près qu'aucun
 *                            bouton ne la remet à zéro.
 *   `donnees.information`    la marque de l'avis sur les données personnelles,
 *                            déjà lu. Même nature que la précédente : l'effacer
 *                            repose l'avis une fois de plus, et rien d'autre —
 *                            l'information elle-même reste publiée, et la page
 *                            reste joignable depuis les Réglages.
 *
 * D'où la règle que tient ce module : **l'effacement emporte ce qui se recrée,
 * jamais ce qui ne se recrée pas.** Il portait auparavant sur toutes les clés du
 * préfixe, et il détruisait donc en silence la seule copie des conversations
 * avec le bureau — sous un libellé qui parlait de badges de messages non lus.
 * `scripts/check-effacement.test.mjs` exerce les cinq familles à la fois.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

const PREFIXE = 'fcpe.';

/** La famille des marques de lecture, isolée pour que la clé et l'effacement s'accordent. */
const FAMILLE_MARQUES = 'discussion.lu.';

/**
 * Clé de la dernière consultation de la discussion, par adhérent.
 *
 * L'identifiant est dans la clé, et non dans la valeur : deux comptes sur le
 * même téléphone ne partagent donc pas leur marque de lecture. Sans cela, se
 * connecter avec un second compte effacerait le badge du premier — et le premier
 * ne verrait plus ce qu'il n'a pas lu.
 */
export function cleDerniereLectureDiscussion(userId: string): string {
  return `${FAMILLE_MARQUES}${userId}`;
}

/**
 * Clé de l'appareil, tirée par la base à la première demande.
 *
 * POURQUOI ELLE N'EST PAS TIRÉE ICI
 * ---------------------------------
 * React Native n'expose pas de générateur aléatoire cryptographique, et
 * `Math.random()` n'en est pas un. La fonction `cle_appareil()` la tire avec
 * `gen_random_uuid()`, côté serveur, et l'application la garde ensuite.
 *
 * Ce n'est pas un secret : elle ne donne accès à rien. La ranger dans
 * `AsyncStorage` — et non dans le trousseau — est donc le bon endroit.
 */
export const CLE_APPAREIL = 'appareil.cle';

/**
 * Le choix déposé par cet appareil sur un sondage.
 *
 * L'identifiant du sondage est dans la clé, comme celui de l'adhérent pour la
 * discussion : deux sondages ne se recouvrent donc pas, et relire un vote ne
 * demande pas de parcourir une liste.
 */
export function cleVoteSondage(sondageId: string): string {
  return `sondage.vote.${sondageId}`;
}

/**
 * Le secret d'une conversation, et son identifiant.
 *
 * C'est la **seule** façon de relire un fil : le serveur ne rend le secret qu'à
 * la création, et il n'en garde qu'une empreinte. Le perdre, c'est perdre
 * l'accès — d'où l'avertissement affiché sur l'écran de contact, et d'où le fait
 * que l'effacement des préférences n'y touche pas.
 */
export function cleConversation(): string {
  return 'contact.conversations';
}

/**
 * La marque de l'invitation à activer les notifications, posée une fois.
 *
 * POURQUOI ELLE EST NÉCESSAIRE, ALORS QUE LE SYSTÈME SAIT DÉJÀ RÉPONDRE
 * --------------------------------------------------------------------
 * Le système rend `undetermined` tant que la question n'a jamais été posée, et
 * c'est presque la même information — mais pas tout à fait. Un parent qui
 * répond « Plus tard » ne change **pas** cet état : Android considère toujours
 * n'avoir jamais demandé. Sans cette marque, l'invitation reviendrait donc à
 * chaque ouverture, indéfiniment, jusqu'à ce que le parent cède ou refuse pour
 * se débarrasser du message. Une question qui se répète n'est plus une question,
 * c'est une pression — et le refus qu'elle finit par obtenir est **définitif**
 * depuis Android 13.
 *
 * La marque vaut `vue` dès que le parent a répondu, dans un sens ou dans
 * l'autre. Elle ne dit pas **ce qu'il** a répondu : l'état du système le dit
 * déjà, et le recopier ici créerait deux copies d'une même vérité, dont la
 * divergence serait silencieuse. C'est aussi ce qui la rend sans conséquence à
 * effacer : la perdre repose la question une fois de plus, rien d'autre.
 */
export const INVITATION_NOTIFICATIONS = 'notifications.invitation';

/**
 * La marque de l'avis sur les données personnelles, posé une fois.
 *
 * POURQUOI UN AVIS, ET POURQUOI UNE MARQUE
 * ----------------------------------------
 * L'information sur les données personnelles n'est pas un consentement : elle
 * se **donne**, et l'article 13 du RGPD demande qu'elle le soit au moment de la
 * collecte. Il n'y a donc rien à recueillir ici, et aucune réponse à retenir —
 * seulement le fait que le parent l'a vue.
 *
 * Cette marque sert à une seule chose : que l'avis ne se repose pas à chaque
 * ouverture. Elle ne dit pas si le parent a **lu** la page, et c'est voulu :
 * prétendre le savoir demanderait de le lui demander, ce qui transformerait une
 * information en formulaire.
 *
 * Comme la précédente, elle est sans conséquence à effacer : la perdre repose
 * l'avis une fois de plus, rien d'autre.
 */
export const INFORMATION_DONNEES = 'donnees.information';

export async function lirePreference(cle: string): Promise<string | null> {
  return AsyncStorage.getItem(PREFIXE + cle);
}

export async function ecrirePreference(cle: string, valeur: string): Promise<void> {
  await AsyncStorage.setItem(PREFIXE + cle, valeur);
}

/**
 * Efface les marques de lecture de la discussion — et **rien d'autre**.
 *
 * Le filtre porte sur la famille des marques, et non sur le préfixe entier.
 * C'est la propriété que tient le banc : ce qui est effacé se recalcule, ce qui
 * ne se recalcule pas reste. Les **cinq** autres familles sont nommées dans
 * l'en-tête de ce fichier, avec la raison de chacune.
 *
 * Le filtre reste nécessaire même réduit à une famille : `AsyncStorage` est
 * partagé avec toute bibliothèque qui l'emploierait, et un `clear()` effacerait
 * aussi ce qui ne vient pas de cette application.
 */
export async function effacerMarquesDeLecture(): Promise<void> {
  const cles = await AsyncStorage.getAllKeys();
  const marques = cles.filter((cle) => cle.startsWith(PREFIXE + FAMILLE_MARQUES));

  if (marques.length === 0) {
    return;
  }

  await AsyncStorage.multiRemove([...marques]);
}
