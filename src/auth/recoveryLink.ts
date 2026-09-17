/**
 * Lecture du lien de réinitialisation de mot de passe.
 *
 * POURQUOI CE FICHIER EXISTE
 * --------------------------
 * Le lien envoyé par e-mail renvoie l'adhérent vers l'application
 * (`fcpefl://…`) en transportant une session temporaire. Encore faut-il
 * l'extraire de l'URL, et c'est le seul endroit du projet où l'on analyse une
 * adresse reçue de l'extérieur.
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

/**
 * Chemin vers lequel Supabase renvoie l'adhérent après le clic.
 *
 * Avec le schéma déclaré dans `app.json`, `Linking.createURL()` produit
 * `fcpefl://reinitialisation` — vérifié en lisant `expo-linking` 57.0.10 :
 * `createURL` assemble `<schéma>://<chemin>` sans hôte, et le schéma est
 * personnalisé, donc aucun préfixe `--/` d'Expo Go ne s'intercale.
 *
 * Cette valeur doit figurer **telle quelle** dans les « Redirect URLs » du
 * tableau de bord Supabase, sinon Supabase refuse la redirection et l'adhérent
 * ne reçoit aucun lien utilisable. Un chemin explicite plutôt que le schéma
 * nu rend l'entrée de la liste lisible et sans ambiguïté.
 */
export const RECOVERY_REDIRECT_PATH = 'reinitialisation';

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
 * Message à afficher quand le lien n'a pas pu aboutir, ou `null`.
 *
 * Sans ce cas, un lien expiré — ce qui arrive dès qu'un adhérent ouvre son
 * e-mail le lendemain — ne produirait **rien du tout** : l'application
 * s'ouvrirait sur l'écran de connexion, sans explication. L'adhérent en
 * conclurait que le lien ne fonctionne pas, pas qu'il a expiré.
 *
 * Le message d'origine est en anglais et destiné aux journaux : il est traduit
 * ici, comme partout ailleurs dans le projet.
 */
export function describeRecoveryError(url: string): string | null {
  const parameters = readParameters(url);

  const code = parameters.get('error_code') ?? parameters.get('error') ?? '';
  if (code === '') {
    return null;
  }

  // Un `type` présent et différent désigne un autre flux (confirmation
  // d'inscription, changement d'adresse) : son erreur ne concerne pas la
  // réinitialisation, et lui donner ce message serait trompeur.
  const type = parameters.get('type');
  if (type !== null && type !== RECOVERY_TYPE) {
    return null;
  }

  if (code === 'otp_expired') {
    return "Ce lien de réinitialisation a expiré. Demandez-en un nouveau depuis l'écran de connexion.";
  }

  return "Ce lien de réinitialisation n'a pas pu être utilisé. Demandez-en un nouveau depuis l'écran de connexion.";
}
