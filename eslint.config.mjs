import js from '@eslint/js';
import prettier from 'eslint-config-prettier/flat';
import react from 'eslint-plugin-react';
import reactHooks from 'eslint-plugin-react-hooks';
import tseslint from 'typescript-eslint';

/**
 * Configuration ESLint de l'application mobile.
 *
 * Volontairement sans vérification de types : celle-ci est assurée par
 * `npm run typecheck` (`tsc --noEmit`), ce qui garde ESLint rapide en CI.
 *
 * `react-hooks` est configuré en mode « recommended » complet : il inclut
 * `set-state-in-effect` et `purity`, qui attrapent exactement les bugs que ni
 * TypeScript ni le bundler ne voient — un état poussé depuis un effet, qui
 * produit un rendu intermédiaire faux et une boucle de re-rendu sur appareil.
 */
export default tseslint.config(
  {
    ignores: [
      'node_modules/**',
      'dist/**',
      '.expo/**',
      'android/**',
      'ios/**',
      'expo-env.d.ts',
      'eslint.config.mjs',
      // Tous les dossiers que Git ignore sont ici, sauf celui-ci — et c'est
      // celui qui reçoit des fichiers : un script d'outillage oublié dedans
      // faisait tomber `npm run lint`, sans rapport avec l'application.
      '.workbuddy-ai/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  react.configs.flat.recommended,
  react.configs.flat['jsx-runtime'],
  reactHooks.configs.flat.recommended,
  {
    settings: {
      react: {
        // React 19 : pas besoin de l'import de React dans les fichiers JSX.
        version: 'detect',
      },
    },
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/consistent-type-imports': [
        'error',
        { prefer: 'type-imports', fixStyle: 'inline-type-imports' },
      ],
      // `no-console` reste en avertissement : les messages d'erreur techniques
      // sont utiles en développement, mais ne doivent pas devenir la norme.
      'no-console': ['warn', { allow: ['warn', 'error', 'info'] }],
      eqeqeq: ['error', 'always'],
      'prefer-const': 'error',
      // `exhaustive-deps` est **élevé en erreur**, alors qu'il est un
      // avertissement dans la configuration recommandée. Mesuré : avec
      // l'avertissement, retirer `resendConfirmation` des dépendances du
      // `useMemo` d'`AuthProvider` laissait `npm run lint` sortir en succès —
      // un `useMemo` qui sert une fonction capturée ne se plaint jamais, il
      // sert l'ancienne. Aucun banc de ce dépôt ne lit les dépendances d'un
      // `useMemo`, donc la règle est le seul endroit où cet accord se tient.
      'react-hooks/exhaustive-deps': 'error',
      // Les props sont décrites par TypeScript, pas par PropTypes.
      'react/prop-types': 'off',
    },
  },
  {
    // Scripts d'outillage exécutés par Node, hors de l'application : les
    // globales Node y sont déclarées à la main plutôt qu'en ajoutant une
    // dépendance `globals` pour quatre identifiants.
    files: ['scripts/**/*.mjs'],
    languageOptions: {
      globals: {
        Buffer: 'readonly',
        console: 'readonly',
        process: 'readonly',
        URL: 'readonly',
      },
    },
    rules: {
      // Un script d'outillage communique par sa sortie standard : `console.log`
      // y est le moyen normal d'afficher un résultat, pas une trace oubliée.
      'no-console': 'off',
    },
  },
  prettier,
);
