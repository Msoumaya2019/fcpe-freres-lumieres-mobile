/**
 * Enregistre le chargeur d'alias avant l'exécution des tests.
 *
 * `--import` exécute ce fichier avant tout autre, y compris avant la
 * découverte des fichiers de test : le chargeur est donc en place pour eux.
 */

import { register } from 'node:module';

register('./alias-loader.mjs', import.meta.url);
