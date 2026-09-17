/// <reference types="expo/types" />

/**
 * Déclarations globales du projet.
 *
 * `expo/types` fournit `process.env` (Metro l'injecte à la compilation) ainsi
 * que `__DEV__`. Il est référencé ici, dans un fichier versionné, plutôt que
 * dans `expo-env.d.ts` — ce dernier est généré par la CLI Expo et ignoré par
 * Git : sur un clone frais (et donc en CI), il n'existe pas encore et
 * `npm run typecheck` échouerait avant même d'avoir démarré.
 *
 * L'augmentation ci-dessous liste explicitement les seules variables que
 * l'application lit. Elle **n'empêche pas** une faute de frappe, contrairement
 * à ce que ce commentaire a affirmé un temps : `ProcessEnv` hérite de
 * `Dict<string>`, soit `[key: string]: string | undefined`, donc toute clé est
 * acceptée. Mesuré — une sonde contenant `process.env.EXPO_PUBLIC_SUPABASE_ANON_KEYK`
 * (un « K » de trop) et une variable entièrement inventée passait `tsc --noEmit`
 * avec un code de sortie de 0.
 *
 * Le type décrit donc l'intention ; ce qui la fait respecter est le test « les
 * variables lues sont exactement celles déclarées », dans
 * `scripts/check-env-guard.test.mjs`. Sans lui, une faute de frappe serait lue
 * comme une absence de configuration : l'application afficherait l'écran de
 * configuration alors que les clés sont correctement renseignées.
 */
declare namespace NodeJS {
  interface ProcessEnv {
    /** URL du projet Supabase, par exemple `https://abcdefgh.supabase.co`. */
    readonly EXPO_PUBLIC_SUPABASE_URL?: string;
    /** Clé publishable (ex-« anon public »). Publique par conception. */
    readonly EXPO_PUBLIC_SUPABASE_ANON_KEY?: string;
    /** Environnement logique : development | preview | production. */
    readonly EXPO_PUBLIC_APP_ENV?: string;
  }
}
