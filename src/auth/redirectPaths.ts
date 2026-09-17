/**
 * Adresses de retour vers l'application.
 *
 * POURQUOI CE FICHIER EXISTE
 * --------------------------
 * Supabase refuse toute redirection absente de sa liste blanche « Redirect
 * URLs ». Chaque adresse produite par l'application est donc **recopiée à la
 * main** dans les documents qui font enregistrer cette liste, et doit rester
 * d'accord avec `expo.scheme`, lu dans `app.json`. Trois sources qu'aucun
 * compilateur ne relie : changer le schéma laisse la suite entièrement verte
 * tout en cassant le lien.
 *
 * Les regrouper ici rend l'ensemble **lisible d'un coup**. `REDIRECT_PATHS`
 * énumère les adresses que l'opérateur doit enregistrer, et `check-recovery-link`
 * exige que chaque constante exportée y figure : une adresse ajoutée ailleurs,
 * ou une constante oubliée dans la liste, fait tomber le banc.
 *
 * Ce module ne lit rien : il ne fait que nommer. La lecture des liens
 * **entrants** reste dans `recoveryLink.ts`.
 */

/**
 * Chemin de la réinitialisation de mot de passe.
 *
 * Avec le schéma déclaré dans `app.json`, `Linking.createURL()` produit
 * `fcpefl://reinitialisation` — vérifié en lisant `expo-linking` 57.0.10 :
 * `createURL` assemble `<schéma>://<chemin>` sans hôte, et le schéma est
 * personnalisé, donc aucun préfixe `--/` d'Expo Go ne s'intercale.
 *
 * Un chemin explicite plutôt que le schéma nu rend l'entrée de la liste lisible
 * et sans ambiguïté.
 */
export const RECOVERY_REDIRECT_PATH = 'reinitialisation';

/**
 * Chemin de la confirmation d'inscription.
 *
 * Sans cette adresse, `signUp` n'envoie aucun `redirect_to` et GoTrue retombe
 * sur le « Site URL » du tableau de bord — c'est-à-dire **hors de
 * l'application** : l'adhérent confirme son adresse dans un navigateur, puis
 * reste devant une page web sans lien de retour.
 *
 * La confirmation n'est utile que si les e-mails partent réellement : le
 * service d'e-mail fourni par défaut avec Supabase est limité à **deux envois
 * par heure** et destiné aux essais. Un SMTP personnalisé est donc requis, et
 * ce réglage vit dans le tableau de bord, hors de portée de ces tests.
 */
export const SIGNUP_REDIRECT_PATH = 'confirmation';

/**
 * Toutes les adresses à enregistrer dans « Redirect URLs », sans exception.
 *
 * Cette liste est l'**énumération** de ce que l'opérateur doit recopier, et
 * `check-recovery-link` la confronte aux constantes ci-dessus : en ajouter une
 * sans l'inscrire ici fait échouer la suite, plutôt que de produire un lien
 * silencieusement refusé par Supabase.
 */
export const REDIRECT_PATHS = Object.freeze([RECOVERY_REDIRECT_PATH, SIGNUP_REDIRECT_PATH]);
