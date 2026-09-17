/**
 * Lecture des liens reçus par e-mail.
 *
 * POURQUOI CE FICHIER EXISTE
 * --------------------------
 * Les liens envoyés par e-mail renvoient l'adhérent vers l'application
 * (`fcpefl://…`) en transportant une session temporaire. Encore faut-il
 * l'extraire de l'URL, et c'est le seul endroit du projet où l'on analyse une
 * adresse reçue de l'extérieur.
 *
 * DEUX FLUX, UN SEUL ANALYSEUR
 * ----------------------------
 * Le même mécanisme transporte deux liens différents, et les confondre a un
 * coût :
 *
 *   - `type=recovery` — réinitialisation. Le lien ouvre une session qu'il reste
 *     à conclure par le choix d'un mot de passe ; la confondre avec une
 *     confirmation connecterait l'adhérent au lieu de lui demander un mot de
 *     passe.
 *   - `type=signup` — confirmation d'inscription. Le lien **confirme l'adresse**
 *     côté serveur, et ne connecte pas : l'application n'ouvre aucune session.
 *     Rien ne le signalait, si bien que l'adhérent voyait l'écran de connexion
 *     sans aucune indication que son clic avait abouti.
 *
 * Un lien de confirmation **échoué** revient avec `error_code` et `type=signup` :
 * il était jusqu'ici écarté sans message, comme s'il ne s'était rien passé.
 *
 * POURQUOI PAS `URL`
 * ------------------
 * `getSessionFromUrl()` n'existe plus dans `@supabase/supabase-js` 2.116.0 :
 * l'analyse est donc à notre charge. Le constructeur `URL` conviendrait mal —
 * un schéma personnalisé comme `fcpefl://` n'a pas d'hôte, et le comportement
 * du polyfill diffère de celui de Node. Une lecture par découpage de chaîne est
 * plus prévisible, et surtout **testable sans navigateur ni appareil**.
 *
 * OÙ SONT LES JETONS
 * ------------------
 * Avec le flux implicite, GoTrue les place dans le **fragment** :
 *
 *     fcpefl://#access_token=…&expires_in=3600&refresh_token=…&type=recovery
 *
 * Certaines configurations les placent dans la requête (`?…`). Les deux sont
 * donc lus, et le fragment l'emporte quand les deux sont présents.
 */

/** Session temporaire portée par un lien de réinitialisation. */
export interface RecoveryTokens {
  readonly accessToken: string;
  readonly refreshToken: string;
}

const RECOVERY_TYPE = 'recovery';
const CONFIRMATION_TYPE = 'signup';

function decodeSafely(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    // Un « % » isolé fait lever `decodeURIComponent`. Rendre la valeur brute
    // vaut mieux que de perdre le lien entier pour un caractère mal encodé.
    return value;
  }
}

function absorb(parameters: Map<string, string>, raw: string): void {
  for (const pair of raw.split('&')) {
    if (pair === '') {
      continue;
    }
    const separator = pair.indexOf('=');
    if (separator === -1) {
      continue;
    }
    const name = decodeSafely(pair.slice(0, separator));
    if (name !== '') {
      parameters.set(name, decodeSafely(pair.slice(separator + 1)));
    }
  }
}

/** Paramètres de l'URL, requête et fragment confondus. */
function readParameters(url: string): Map<string, string> {
  const parameters = new Map<string, string>();

  const queryIndex = url.indexOf('?');
  const hashIndex = url.indexOf('#');

  // La requête s'arrête au fragment. Sans cette borne, `slice` allait jusqu'à la
  // fin de la chaîne et la **dernière paire de la requête absorbait le début du
  // fragment** : dans `?type=recovery#access_token=…`, `type` valait
  // « recovery#access_token=… ». Mesuré, et les deux conséquences sont
  // silencieuses — le contrôle sur `type` refusait alors un lien parfaitement
  // valide (aucun jeton, aucun message), et `describeRecoveryError` renvoyait
  // `null` sur un lien expiré, donc l'écran restait muet.
  if (queryIndex !== -1) {
    absorb(parameters, url.slice(queryIndex + 1, hashIndex === -1 ? undefined : hashIndex));
  }

  // Le fragment, lui, n'est pas borné par un `?` : le point d'interrogation y est
  // un caractère de valeur légitime, et le découper amputerait un jeton.
  if (hashIndex !== -1) {
    absorb(parameters, url.slice(hashIndex + 1));
  }

  return parameters;
}

/**
 * Jetons portés par un lien de réinitialisation, ou `null` si ce n'en est pas
 * un.
 *
 * Le contrôle sur `type=recovery` n'est pas décoratif : le même mécanisme
 * transporte les liens de confirmation d'inscription (`type=signup`). Les
 * confondre connecterait l'adhérent au lieu de lui demander un mot de passe.
 */
export function parseRecoveryTokens(url: string): RecoveryTokens | null {
  const parameters = readParameters(url);

  if (parameters.get('type') !== RECOVERY_TYPE) {
    return null;
  }

  const accessToken = parameters.get('access_token') ?? '';
  const refreshToken = parameters.get('refresh_token') ?? '';

  if (accessToken === '' || refreshToken === '') {
    return null;
  }

  return { accessToken, refreshToken };
}

/**
 * `true` quand l'URL est le retour d'un lien de confirmation d'inscription
 * **abouti**.
 *
 * Trois conditions, et chacune écarte un cas réel :
 *
 *   - `type=signup` — sans lui, on lirait une réinitialisation ;
 *   - un jeton d'accès présent — GoTrue ne le joint qu'après avoir validé le
 *     lien côté serveur. C'est la **preuve** que l'adresse est confirmée, et
 *     non une supposition tirée de la seule présence du `type` ;
 *   - aucune erreur portée — un lien expiré revient avec `error_code`, et
 *     annoncer « adresse confirmée » serait alors exactement l'inverse de la
 *     vérité. C'est un **garde-fou** : l'échec ne porte aujourd'hui aucun jeton,
 *     donc la condition précédente l'écarte déjà. Il est là pour que la règle ne
 *     dépende pas de cette propriété d'un paquet tiers, et il est mesuré sur un
 *     cas où les deux signaux coexistent — sans quoi le retirer ne ferait
 *     tomber aucun banc.
 *
 * Le contrôle est volontairement plus strict que nécessaire : un lien de
 * confirmation dont on ne saurait pas dire s'il a abouti ne doit rien annoncer.
 */
export function isEmailConfirmationLink(url: string): boolean {
  const parameters = readParameters(url);

  return (
    parameters.get('type') === CONFIRMATION_TYPE &&
    parameters.get('access_token') !== undefined &&
    parameters.get('error_code') === undefined &&
    parameters.get('error') === undefined
  );
}

/**
 * Message à afficher quand un lien reçu n'a pas pu aboutir, ou `null`.
 *
 * Sans ce cas, un lien expiré — ce qui arrive dès qu'un adhérent ouvre son
 * e-mail le lendemain — ne produirait **rien du tout** : l'application
 * s'ouvrirait sur l'écran de connexion, sans explication. L'adhérent en
 * conclurait que le lien ne fonctionne pas, pas qu'il a expiré.
 *
 * Les **deux** flux sont traduits, et c'est délibéré : un lien de confirmation
 * expiré laissait l'adhérent sans message **et** sans recours, alors que c'est
 * le cas le plus coûteux des deux — son adresse n'est pas confirmée, donc il ne
 * peut pas se connecter, et rien ne le lui dit.
 *
 * Un `type` **inconnu** (changement d'adresse, invitation) reste sans message :
 * lui en donner un de réinitialisation serait trompeur, et il n'existe pas de
 * flux correspondant dans cette application.
 *
 * Le message d'origine est en anglais et destiné aux journaux : il est traduit
 * ici, comme partout ailleurs dans le projet.
 */
export function describeLinkError(url: string): string | null {
  const parameters = readParameters(url);

  const code = parameters.get('error_code') ?? parameters.get('error') ?? '';
  if (code === '') {
    return null;
  }

  // Un `type` absent est traité comme une réinitialisation : c'est le flux
  // d'origine, et un lien de réinitialisation amputé de son `type` en reste un.
  const type = parameters.get('type');
  const expire = code === 'otp_expired';

  if (type === null || type === RECOVERY_TYPE) {
    return expire
      ? "Ce lien de réinitialisation a expiré. Demandez-en un nouveau depuis l'écran de connexion."
      : "Ce lien de réinitialisation n'a pas pu être utilisé. Demandez-en un nouveau depuis l'écran de connexion.";
  }

  if (type === CONFIRMATION_TYPE) {
    return expire
      ? "Ce lien de confirmation a expiré. Votre adresse n'est pas encore confirmée : demandez un nouveau lien à l'association, puis reconnectez-vous."
      : "Ce lien de confirmation n'a pas pu être utilisé. Votre adresse n'est pas encore confirmée : demandez un nouveau lien à l'association, puis reconnectez-vous.";
  }

  return null;
}
