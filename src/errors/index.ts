/**
 * Traduction des erreurs techniques en messages affichables.
 *
 * POURQUOI UNE FONCTION DÉDIÉE
 * ----------------------------
 * Les messages de Supabase et de PostgreSQL sont destinés aux journaux :
 * « Invalid login credentials », « duplicate key value violates unique
 * constraint "cantine_reservations_menu_id_user_id_key" », « new row violates
 * row-level security policy ». Affichés tels quels, ils sont incompréhensibles
 * pour un adhérent — et renseignent un éventuel attaquant sur la structure de
 * la base.
 *
 * Le principe est donc : un message en français pour l'utilisateur, et le
 * message d'origine conservé à part dans `technicalDetail`, affiché seulement
 * en développement.
 *
 * Ce fichier est le SEUL endroit où ces traductions sont écrites : un message
 * dupliqué dans un écran finit toujours par diverger de son original.
 */

import { isDevelopment } from '@/config/env';

/** Erreur portant à la fois un message utilisateur et un détail technique. */
export class AppError extends Error {
  readonly technicalDetail: string | null;

  constructor(
    message: string,
    technicalDetail: string | null = null,
    options?: { cause?: unknown },
  ) {
    super(message, options);
    this.name = 'AppError';
    this.technicalDetail = technicalDetail;
  }
}

/**
 * Marque un message **déjà rédigé pour l'adhérent**, pour qu'il ne soit pas
 * retraduit.
 *
 * POURQUOI CETTE FONCTION EXISTE
 * ------------------------------
 * `toAppError` part du principe qu'une chaîne reçue est un message **technique
 * anglais** à traduire, et qu'à défaut de règle correspondante il faut afficher
 * le message générique — c'est ce qui empêche un « duplicate key value violates
 * unique constraint » d'arriver sous les yeux d'un adhérent.
 *
 * Le revers de ce choix est piégeux : une phrase française écrite dans un écran
 * est traitée comme un message technique non reconnu, donc **remplacée** par
 * « Une erreur inattendue est survenue. Réessayez dans quelques instants. »
 *
 * Mesuré :
 *
 *     appErrorMessage('Indiquez votre adresse e-mail.')
 *     → « Une erreur inattendue est survenue. Réessayez dans quelques instants. »
 *
 * Ce n'est pas seulement une perte de précision : le message invite à
 * **réessayer**, alors que l'action échouera identiquement tant que le champ
 * restera vide. C'est exactement le conseil qu'il ne faut pas donner.
 *
 * `toAppError` renvoyant une `AppError` telle quelle, il suffit de la marquer
 * ici pour que le message soit préservé.
 */
export function userMessage(message: string): AppError {
  return new AppError(message);
}

interface TranslationRule {
  readonly match: RegExp;
  readonly message: string;
}

/**
 * Règles d'authentification.
 *
 * **C'est l'ordre des familles qui compte, pas celui-ci** — et cet ordre est
 * mesuré, pas supposé. `ALL_RULES` évalue `NETWORK_RULES` en dernier parce que
 * son motif est le plus générique du fichier : il contient `timeout` seul, là où
 * les autres exigent « statement timeout », « row-level security » ou
 * « duplicate key ».
 *
 * Les motifs, exécutés sur un corpus de messages représentatifs de GoTrue, de
 * PostgREST et du réseau, ne produisent qu'**un seul** recouvrement : « canceling
 * statement due to statement timeout » allume la règle de délai serveur **et** la
 * règle réseau. C'est le seul cas où l'ordre décide de ce que lit l'adhérent —
 * famille réseau placée en tête, une requête simplement trop longue ferait dire
 * « vérifiez votre connexion internet ». Un test tient ce recouvrement unique.
 *
 * Un commentaire affirmait ici une autre contrainte — « Invalid login
 * credentials » à tester avant « la règle générique sur les identifiants
 * invalides ». Cette règle n'existe pas, et la mesure le confirme.
 */
const AUTH_RULES: readonly TranslationRule[] = [
  {
    match: /invalid login credentials/i,
    message: 'Adresse e-mail ou mot de passe incorrect.',
  },
  {
    match: /email not confirmed/i,
    message:
      "Cette adresse e-mail n'a pas encore été confirmée. Ouvrez le lien reçu par e-mail, puis reconnectez-vous.",
  },
  {
    match: /user already registered|already been registered/i,
    message: 'Un compte existe déjà avec cette adresse e-mail.',
  },
  {
    match: /password should be at least (\d+)/i,
    message: 'Le mot de passe doit contenir au moins $1 caractères.',
  },
  {
    // Message de GoTrue quand le tableau de bord impose des classes de
    // caractères. Le serveur énumère les classes exigées après le deux-points —
    // un vidage de `abcdefghijklmnopqrstuvwxyz, ABCDEF…` que l'adhérent n'a pas à
    // lire : rien n'est donc substitué ici, et la phrase reste la même quel que
    // soit le réglage.
    match: /password should contain at least one character/i,
    message:
      'Ce mot de passe est refusé : il ne contient pas assez de types de caractères différents. Mélangez par exemple minuscules, majuscules, chiffres et symboles.',
  },
  {
    // Message de GoTrue quand le contrôle de fuite (HaveIBeenPwned) est activé.
    match: /password is known to be weak/i,
    message:
      'Ce mot de passe figure parmi ceux déjà divulgués sur internet. Choisissez-en un autre : il serait deviné rapidement.',
  },
  {
    // Limite **dure** de bcrypt, et non un réglage : `checkPasswordStrength` de
    // GoTrue refuse tout mot de passe de plus de 72 unités, et cette branche est
    // la seule des quatre qui ne dépende d'aucune case cochée dans le tableau de
    // bord.
    //
    // La comparaison porte sur `len(password)` en Go, donc en **octets** : un
    // mot de passe accentué est refusé avant d'atteindre le nombre annoncé. Le
    // message ne nomme donc pas d'unité — « au-delà de 72 » est exact dans les
    // deux cas, « 72 caractères » ne l'aurait pas été.
    //
    // Aucune borne côté client, volontairement : `maxLength` compte des unités
    // UTF-16, pas des octets, et une borne à 72 laisserait passer des mots de
    // passe que le serveur refuse — une protection apparente vaut moins que
    // cette phrase.
    match: /password cannot be longer than (\d+)/i,
    message:
      'Ce mot de passe est trop long : le serveur refuse au-delà de $1. Choisissez-en un plus court.',
  },
  {
    match: /new password should be different/i,
    message: "Le nouveau mot de passe doit être différent de l'ancien.",
  },
  {
    match: /unable to validate email address|invalid format|is invalid/i,
    message: "Cette adresse e-mail n'est pas valide.",
  },
  {
    match: /for security purposes, you can only request this after (\d+)/i,
    message: 'Trop de tentatives. Réessayez dans $1 secondes.',
  },
  {
    match: /email rate limit exceeded|over_email_send_rate_limit/i,
    message: "Trop d'e-mails ont été envoyés récemment. Réessayez dans quelques minutes.",
  },
  {
    match: /signups not allowed|signup is disabled/i,
    message: "Les inscriptions sont fermées. Contactez un administrateur de l'association.",
  },
  {
    // Message de GoTrue lorsqu'un déclencheur sur `auth.users` échoue — ici
    // `handle_new_user()`, qui insère le profil. Le cas mesuré : un nom affiché
    // plus long que ce qu'accepte `profiles_display_name_length`, l'insertion
    // étant refusée dans la même transaction que la création du compte.
    //
    // Sans cette règle, l'adhérent lisait le message générique, qui invite à
    // **réessayer** — et réessayer avec le même nom échoue identiquement. Le
    // champ est désormais borné côté client ; cette règle reste parce que la
    // contrainte serveur est la vraie garde, et qu'un écart entre les deux
    // atterrit ici.
    match: /database error saving new user/i,
    message:
      "Le compte n'a pas pu être créé : une information a été refusée par le serveur. Vérifiez le nom qui apparaîtra auprès des autres membres, puis réessayez.",
  },
  {
    match: /jwt expired|invalid claim|refresh token/i,
    message: 'Votre session a expiré. Reconnectez-vous.',
  },
];

/** Règles côté base de données (PostgREST, PostgreSQL, politiques RLS). */
const DATABASE_RULES: readonly TranslationRule[] = [
  {
    match: /row-level security|permission denied|42501/i,
    message: "Vous n'avez pas les droits nécessaires pour cette action.",
  },
  {
    match: /duplicate key value violates unique constraint/i,
    message: 'Cet élément existe déjà.',
  },
  {
    match: /violates foreign key constraint/i,
    message: "Cet élément fait référence à une donnée qui n'existe plus.",
  },
  {
    match: /violates check constraint|invalid input value for enum/i,
    message: "La valeur envoyée n'est pas acceptée par le serveur.",
  },
  {
    match: /null value in column .* violates not-null constraint/i,
    message: 'Un champ obligatoire est vide.',
  },
  {
    // Sa place dans cette famille est le sujet : `DATABASE_RULES` est évalué
    // **avant** `NETWORK_RULES`, et c'est nécessaire ici. Le motif réseau contient
    // `timeout` seul, qui correspond aussi à ce message — mesuré. Sans cette
    // règle, un délai d'attente serveur était traduit en panne de connexion, et
    // l'adhérent était envoyé vérifier un réseau qui fonctionnait.
    match: /statement timeout|57014/i,
    message: 'Le serveur a mis trop de temps à répondre. Réessayez dans quelques instants.',
  },
];

/** Règles réseau : les plus fréquentes sur mobile, et les plus mal expliquées. */
const NETWORK_RULES: readonly TranslationRule[] = [
  {
    match: /network request failed|failed to fetch|fetch failed|timeout|timed out|aborted/i,
    message: 'Connexion au serveur impossible. Vérifiez votre connexion internet, puis réessayez.',
  },
];

const ALL_RULES: readonly TranslationRule[] = [...AUTH_RULES, ...DATABASE_RULES, ...NETWORK_RULES];

function technicalMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  if (typeof error === 'string') {
    return error;
  }
  if (error !== null && typeof error === 'object' && 'message' in error) {
    const value = (error as { message?: unknown }).message;
    if (typeof value === 'string') {
      return value;
    }
  }
  return '';
}

/**
 * Convertit n'importe quoi de lancé en `AppError`.
 *
 * Une `AppError` est retournée telle quelle : un message déjà traduit ne doit
 * pas être retraduit, sous peine de perdre le contexte ajouté par l'appelant.
 */
export function toAppError(error: unknown): AppError {
  if (error instanceof AppError) {
    return error;
  }

  const raw = technicalMessage(error);
  const fallback = new AppError(
    'Une erreur inattendue est survenue. Réessayez dans quelques instants.',
    raw === '' ? null : raw,
    { cause: error },
  );

  if (raw === '') {
    return fallback;
  }

  for (const rule of ALL_RULES) {
    const found = rule.match.exec(raw);
    if (found !== null) {
      // Remplace $1, $2… par les groupes capturés (nombre de secondes, de
      // caractères), ce qui évite d'écrire une règle par seuil.
      const message = rule.message.replace(/\$(\d)/g, (_match, index: string) => {
        const group = found[Number.parseInt(index, 10)];
        return group ?? '';
      });
      return new AppError(message, raw, { cause: error });
    }
  }

  return fallback;
}

/** Message en français, prêt à être affiché à l'utilisateur. */
export function appErrorMessage(error: unknown): string {
  return toAppError(error).message;
}

/**
 * Détail technique à afficher **uniquement en développement**.
 * Renvoie `null` en production : l'utilisateur n'a rien à faire d'un code
 * PostgreSQL, et le message d'origine peut décrire la structure de la base.
 */
export function appErrorDetail(error: unknown): string | null {
  if (!isDevelopment) {
    return null;
  }
  return toAppError(error).technicalDetail;
}

/* -------------------------------------------------------------------------- *
 * LE MOT DE PASSE FAIBLE, SIGNALÉ SUR UNE CONNEXION RÉUSSIE
 *
 * GoTrue ne refuse pas une connexion parce que le mot de passe est faible : il
 * l'accepte, **puis** signale le constat dans la réponse. Vérifié dans sa source
 * (`internal/api/token.go`, `ResourceOwnerPasswordGrant`) : le contrôle a lieu
 * seulement après que le mot de passe a été reconnu correct, et
 * `token.WeakPassword = weakPasswordError` est posé sur une réponse `200 OK`.
 * Un échec du contrôle lui-même — HaveIBeenPwned injoignable — n'est qu'un
 * avertissement de journal, et la connexion aboutit.
 *
 * C'est un cas qu'aucune autre partie de ce fichier ne couvre : `toAppError` ne
 * voit que des erreurs, et les règles ci-dessus traduisent des **refus**. Ici,
 * rien n'a échoué. D'où cette table, et d'où le ton « information » du bandeau
 * qui l'affiche : un ton d'erreur annoncerait un échec qui n'a pas eu lieu.
 *
 * LES TROIS RAISONS SONT UN ENSEMBLE FERMÉ
 * ----------------------------------------
 * `checkPasswordStrength` (`internal/api/password.go`) n'ajoute que trois
 * valeurs, et **chacune au plus une fois** : `length` (mot de passe plus court
 * que `Password.MinLength`), `characters` (classes de caractères exigées) et
 * `pwned` (mot de passe trouvé chez HaveIBeenPwned). Les trois `append` sont
 * uniques, et la boucle des classes sort par `break`.
 *
 * Le repli sur une phrase générique n'est donc pas décoratif : `reasons` peut
 * être absent — le champ est omis quand il n'y a rien à signaler — ou porter une
 * valeur qu'une version future ajouterait. Coordonner une raison inconnue
 * laisserait un trou dans la phrase, du genre « … en vigueur : . ».
 * -------------------------------------------------------------------------- */

/**
 * Une proposition par raison, et non une phrase : elles se coordonnent.
 *
 * Aucune ne nomme de chiffre. Le minimum exigé par le serveur est un réglage du
 * tableau de bord (`Authentication > Providers > Email > Minimum password
 * length`) que ce dépôt ne porte pas — même situation que l'adresse de retour du
 * lien de réinitialisation, consignée dans le `README.md` (§4), et même raison de
 * ne pas la recopier ici : « au moins 6 caractères » affirmerait une valeur que
 * l'application ne peut pas lire, et qui peut avoir changé sans elle.
 */
const WEAK_PASSWORD_CLAUSES = {
  length: 'il est plus court que le minimum demandé pour les nouveaux mots de passe',
  characters: 'il ne contient pas assez de types de caractères différents',
  pwned: 'il figure parmi ceux déjà divulgués sur internet',
} as const;

/** Les raisons connues, dérivées de la table : une seule source, pas deux. */
const WEAK_PASSWORD_REASONS: readonly string[] = Object.keys(WEAK_PASSWORD_CLAUSES);

/** Ce que le serveur constate, dans tous les cas. */
const WEAK_PASSWORD_ACCEPTE =
  'Votre mot de passe a été accepté, mais il ne respecte plus les règles en vigueur';

/**
 * La marche à suivre, identique quelle que soit la raison.
 *
 * Elle nomme un libellé d'un autre écran, et c'est un accord à tenir : le bouton
 * porte exactement ce texte dans `ConnexionScreen.tsx`, où le lien de
 * réinitialisation est le **seul** chemin de changement de mot de passe — il n'y
 * a pas d'écran « mon compte ». `scripts/check-weak-password.test.mjs` relit les
 * deux sources pour que la phrase ne devienne pas fausse en silence.
 */
const WEAK_PASSWORD_ACTION =
  ' Pour en choisir un autre : déconnectez-vous, puis appuyez sur « Mot de passe oublié ? ».';

/** Coordination française : « a », « a et b », « a, b et c ». */
function enumeration(propositions: readonly string[]): string {
  if (propositions.length <= 1) {
    return propositions.join('');
  }

  return `${propositions.slice(0, -1).join(', ')} et ${propositions[propositions.length - 1]}`;
}

/**
 * La phrase lue par l'adhérent, à partir des raisons envoyées par le serveur.
 *
 * Le résultat doit être passé à `userMessage()` avant d'atteindre un
 * `ErrorNotice` : sans ce marquage, une phrase française est prise pour un
 * message technique anglais non reconnu et remplacée par « Une erreur
 * inattendue est survenue. Réessayez dans quelques instants. » — un conseil
 * doublement faux ici, puisque rien n'a échoué et que réessayer ne changerait
 * rien au mot de passe.
 */
export function weakPasswordMessage(reasons: readonly string[] | undefined): string {
  const propositions: string[] = [];
  let inconnue = false;

  for (const raison of reasons ?? []) {
    if (WEAK_PASSWORD_REASONS.includes(raison)) {
      propositions.push(WEAK_PASSWORD_CLAUSES[raison as keyof typeof WEAK_PASSWORD_CLAUSES]);
    } else {
      inconnue = true;
    }
  }

  if (inconnue || propositions.length === 0) {
    return `${WEAK_PASSWORD_ACCEPTE}.${WEAK_PASSWORD_ACTION}`;
  }

  return `${WEAK_PASSWORD_ACCEPTE} : ${enumeration(propositions)}.${WEAK_PASSWORD_ACTION}`;
}
