/**
 * Configuration de l'application — **point d'entrée unique** vers les clés d'API.
 *
 * POURQUOI CE FICHIER EXISTE
 * --------------------------
 * Aucun autre module ne lit `process.env`. Deux raisons, et elles tiennent
 * toutes les deux à la sécurité :
 *
 *  1. **Une seule porte, donc des gardes possibles.** Les variables préfixées
 *     `EXPO_PUBLIC_` sont injectées en clair dans le bundle livré aux
 *     utilisateurs. En centralisant leur lecture, on peut y interposer un
 *     contrôle — ici, le refus d'une clé `service_role`, qui contourne toutes
 *     les politiques Row Level Security. Sans ce point de passage, la garde
 *     devrait être répétée dans chaque fichier qui touche à la base.
 *
 *  2. **Une application qui démarre sans configuration.** Si les clés sont
 *     absentes, l'application ne plante pas : `configError` porte une
 *     explication en français et l'interface affiche un écran de configuration.
 *     C'est ce qui permet à la CI de vérifier la compilation (`expo export`)
 *     sans aucun secret — le seul contrôle qui prouve réellement que tous les
 *     modules se résolvent dans le bundle.
 *
 * Où sont les valeurs : `.env.local` en développement (ignoré par Git, voir
 * `.gitignore`), variables d'environnement EAS pour les builds distants (les
 * fichiers `.env.local` ne sont jamais téléversés). Modèle : `.env.example`.
 */

/** Environnement logique, choisi par `EXPO_PUBLIC_APP_ENV` ou par le profil EAS. */
export type AppEnvironment = 'development' | 'preview' | 'production';

export interface SupabaseConfig {
  readonly url: string;
  readonly anonKey: string;
}

export interface AppConfig {
  readonly appEnv: AppEnvironment;
  /** `null` si la configuration est absente ou refusée — voir `configError`. */
  readonly supabase: SupabaseConfig | null;
  /** Explication en français, affichée telle quelle sur l'écran de configuration. */
  readonly configError: string | null;
}

const APP_ENVIRONMENTS: readonly AppEnvironment[] = ['development', 'preview', 'production'];

const BASE64_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

/**
 * `true` tant que l'on n'est pas dans un bundle de production.
 *
 * On s'appuie sur `NODE_ENV`, que Metro remplace à la compilation, plutôt que
 * sur `__DEV__` : ce dernier n'est pas déclaré dans les types de React Native
 * 0.86, et une variable globale non typée se traduit par une erreur de
 * compilation sans rapport avec la cause.
 */
export const isDevelopment = process.env.NODE_ENV !== 'production';

/**
 * Lit et normalise une valeur d'environnement.
 *
 * L'ARGUMENT DOIT ÊTRE UN ACCÈS LITTÉRAL — `process.env.EXPO_PUBLIC_URL`, jamais
 * `process.env[nom]`. La substitution d'Expo est une réécriture **statique de
 * l'arbre syntaxique** : `babel-preset-expo` ne remplace que les nœuds dont le
 * nom de propriété est écrit en toutes lettres et commence par `EXPO_PUBLIC_`
 * (vérifié dans `plugins/inline-env-vars.js` : `isProcessEnv` puis
 * `toMemberProperty`), et le sérialiseur Metro s'efface en production au profit
 * de cette substitution. Un accès calculé n'est donc remplacé par **rien**.
 *
 * Conséquence, mesurée sur un bundle de production : `process.env['EXPO_PUBLIC_…']`
 * vaut `undefined`, la clé est lue comme absente, et l'application affiche
 * l'écran de configuration alors que les clés sont correctement renseignées.
 * Aucun test ne peut le voir : sous Node, l'accès calculé fonctionne — le défaut
 * n'existe que dans le bundle.
 */
function readEnv(value: string | undefined): string {
  return typeof value === 'string' ? value.trim() : '';
}

/**
 * Décodage base64url minimal — le rôle d'une clé JWT est dans sa charge utile,
 * qui n'est pas chiffrée, seulement encodée.
 *
 * Écrit à la main plutôt qu'importé : `atob` n'existe pas dans Hermes, et
 * ajouter une dépendance pour lire trois caractères d'un jeton serait
 * disproportionné. Le `react-native-url-polyfill` du client Supabase ne
 * fournit que `URL` et `URLSearchParams`.
 */
function decodeBase64Url(segment: string): string | null {
  let output = '';
  let buffer = 0;
  let bits = 0;

  for (const character of segment) {
    if (character === '=') {
      break;
    }
    // base64url remplace « + » par « - » et « / » par « _ ». Sans cette
    // normalisation, une charge utile qui contient l'un de ces deux caractères
    // fait échouer le décodage : la fonction renvoie `null` et la garde
    // ci-dessous laisse alors passer une clé `service_role` sans rien signaler.
    //
    // Le cas est rare — une charge utile JWT est du JSON, donc de l'ASCII — mais
    // il est atteignable : un « ? » (0x3F) placé au bon rang modulo 3 produit un
    // « _ ». Vérifié par `scripts/check-env-guard.test.mjs`, qui refuse de
    // tester une charge utile ne contenant ni « - » ni « _ », puisqu'un tel cas
    // ne prouverait rien.
    const normalized = character === '-' ? '+' : character === '_' ? '/' : character;
    const value = BASE64_ALPHABET.indexOf(normalized);
    if (value === -1) {
      return null;
    }
    buffer = (buffer << 6) | value;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      output += String.fromCharCode((buffer >> bits) & 0xff);
    }
  }

  return output;
}

/**
 * Décrit pourquoi une clé n'est pas une clé *publique*, ou `null` si elle l'est.
 *
 * Deux familles de clés coexistent chez Supabase :
 *   - les nouvelles, préfixées : `sb_publishable_…` (publique) et
 *     `sb_secret_…` (secrète) ;
 *   - les anciennes, des JWT dont la charge utile porte `"role":"anon"` ou
 *     `"role":"service_role"`.
 *
 * La distinction n'est pas cosmétique : une clé `service_role` intégrée au
 * bundle donne à quiconque l'extrait un accès complet à la base, sans passer
 * par les politiques RLS. C'est la fuite qui coûte le plus cher, et la plus
 * facile à commettre — un copier-coller depuis la mauvaise ligne du tableau de
 * bord suffit. Le refus est donc explicite et bruyant.
 */
function describeKeyProblem(anonKey: string): string | null {
  if (anonKey.startsWith('sb_secret_')) {
    return (
      'EXPO_PUBLIC_SUPABASE_ANON_KEY contient une clé secrète (« sb_secret_… »). ' +
      'Cette clé contourne toutes les politiques de sécurité et ne doit jamais ' +
      "être intégrée à l'application. Utilisez la clé « publishable »."
    );
  }

  const segments = anonKey.split('.');
  if (segments.length === 3) {
    const payloadSegment = segments[1];
    const payload = payloadSegment === undefined ? null : decodeBase64Url(payloadSegment);
    if (payload !== null) {
      try {
        const parsed: unknown = JSON.parse(payload);
        if (
          parsed !== null &&
          typeof parsed === 'object' &&
          'role' in parsed &&
          (parsed as { role?: unknown }).role === 'service_role'
        ) {
          return (
            'EXPO_PUBLIC_SUPABASE_ANON_KEY contient une clé « service_role ». ' +
            'Cette clé contourne toutes les politiques de sécurité et ne doit jamais ' +
            "être intégrée à l'application. Utilisez la clé « anon » ou « publishable »."
          );
        }
      } catch {
        // Charge utile illisible : ce n'est pas un JWT valide. Le contrôle de
        // format ci-dessous le signalera ; inutile de doubler le message.
      }
    }
  }

  return null;
}

function readAppEnvironment(): AppEnvironment {
  const raw = readEnv(process.env.EXPO_PUBLIC_APP_ENV);
  const known = APP_ENVIRONMENTS.find((candidate) => candidate === raw);
  if (known !== undefined) {
    return known;
  }
  return isDevelopment ? 'development' : 'production';
}

function readSupabaseConfig(): { config: SupabaseConfig | null; error: string | null } {
  const url = readEnv(process.env.EXPO_PUBLIC_SUPABASE_URL);
  const anonKey = readEnv(process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY);

  if (url === '' && anonKey === '') {
    return {
      config: null,
      error:
        'Aucune configuration Supabase. Copiez `.env.example` en `.env.local`, ' +
        'puis renseignez EXPO_PUBLIC_SUPABASE_URL et EXPO_PUBLIC_SUPABASE_ANON_KEY.',
    };
  }

  if (url === '') {
    return { config: null, error: 'EXPO_PUBLIC_SUPABASE_URL est vide.' };
  }

  if (anonKey === '') {
    return { config: null, error: 'EXPO_PUBLIC_SUPABASE_ANON_KEY est vide.' };
  }

  // Une barre oblique finale produit des URL à double slash, que PostgREST
  // rejette par une 404 déroutante (« relation not found » sur une table qui
  // existe). Mieux vaut refuser tout de suite, avec la cause réelle.
  if (url.endsWith('/')) {
    return {
      config: null,
      error: `EXPO_PUBLIC_SUPABASE_URL ne doit pas se terminer par une barre oblique : « ${url} ».`,
    };
  }

  if (!url.startsWith('https://')) {
    return {
      config: null,
      error: `EXPO_PUBLIC_SUPABASE_URL doit commencer par https:// : « ${url} ».`,
    };
  }

  const keyProblem = describeKeyProblem(anonKey);
  if (keyProblem !== null) {
    return { config: null, error: keyProblem };
  }

  return { config: { url, anonKey }, error: null };
}

const supabaseRead = readSupabaseConfig();

export const appConfig: AppConfig = Object.freeze({
  appEnv: readAppEnvironment(),
  supabase: supabaseRead.config,
  configError: supabaseRead.error,
});

/** `true` si les clés Supabase sont présentes et acceptées. */
export const isSupabaseConfigured = appConfig.supabase !== null;
