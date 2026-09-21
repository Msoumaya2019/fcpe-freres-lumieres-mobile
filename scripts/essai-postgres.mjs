/**
 * =============================================================================
 *  Le socle des bancs qui EXÉCUTENT la migration
 * =============================================================================
 *
 *  Deux bancs ont besoin de la même chose : un PostgreSQL réel, en mémoire, avec
 *  ce que Supabase fournit autour de la migration. Ce fichier le leur donne, en
 *  un seul endroit — une doublure recopiée dans deux fichiers divergerait, et
 *  c'est précisément le genre d'écart que ce dépôt refuse ailleurs.
 *
 *  POURQUOI PGLITE
 *  ---------------
 *  `@electric-sql/pglite` est PostgreSQL 18.3 compilé en WebAssembly : il tourne
 *  dans le processus Node, sans serveur, sans Docker, sans réseau, sans mot de
 *  passe. Une dépendance de développement d'environ 25 Mo, jamais dans le bundle
 *  livré.
 *
 *  LA DOUBLURE EST FIDÈLE, PAS MINIMALE
 *  ------------------------------------
 *  Elle reproduit ce que la plateforme Supabase installe. Deux de ces éléments
 *  ne sont pas visibles dans la migration, et leur absence rendrait les bancs
 *  menteurs :
 *
 *  1. **les rôles `anon`, `authenticated`, `service_role`.** La migration les
 *     nomme dans ses `grant` et ses `revoke` sans jamais les créer — sur
 *     Supabase, ils préexistent ;
 *  2. **les privilèges par défaut sur les nouvelles tables.** La section
 *     « Privilèges » de la migration **révoque** les droits d'`anon`, et
 *     n'accorde rien à `authenticated` : les droits de ce dernier viennent des
 *     privilèges par défaut de la plateforme. Sans eux, un banc de comportement
 *     verrait `permission denied` partout et ne saurait plus distinguer **un
 *     refus de politique** d'**un droit absent** — c'est-à-dire qu'il ne
 *     mesurerait plus rien.
 *
 *  L'ordre compte, et c'est celui de la plateforme : les privilèges par défaut
 *  sont posés **avant** la migration, pour que ses `revoke` s'appliquent
 *  par-dessus. Les inverser rendrait à `anon` ce que la migration lui retire.
 *
 *  CE QUE CE SOCLE NE PROUVE PAS
 *  -----------------------------
 *  Rien. Il ne fait que préparer un moteur. Ce que chaque banc en tire est écrit
 *  dans son propre en-tête — et notamment, pour le banc de comportement, ce
 *  qu'un rôle joué à la main ne démontre pas d'un jeton signé par GoTrue.
 */

import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

const racine = new URL('../', import.meta.url);

/** Le texte de la migration initiale. */
export const MIGRATION = readFileSync(
  new URL('supabase/migrations/20260916120000_init.sql', racine),
  'utf8',
);

/**
 * Le texte de la seconde migration — l'agenda, les documents, les sondages et
 * le contact.
 *
 * Elle est **lue** par trois bancs qui n'exécutent rien : `check-migration-
 * rejouable` lit ses gardes, `check-schema-types` compare ses colonnes,
 * `check-input-limits` lit ses bornes. Aucun ne l'appliquait. Les 29 189 octets
 * que l'adhérent colle **après** la première n'avaient donc jamais été exécutés
 * — et son propre en-tête justifiait un choix de conception par « le banc qui
 * exécute cette migration », qui n'existait pas.
 */
export const RUBRIQUES = readFileSync(
  new URL('supabase/migrations/20260919120000_rubriques.sql', racine),
  'utf8',
);

/**
 * Le texte de la troisième migration — l'accès public, l'espace membre et les
 * conversations avec les familles.
 *
 * Elle porte le renversement le plus lourd du projet : jusqu'ici, `anon` n'avait
 * **aucun** privilège, et l'application ne montrait rien avant une connexion.
 * Ce fichier ouvre six tables en lecture au rôle anonyme et referme la
 * discussion derrière un statut d'adhésion. Un banc qui l'exécute est donc la
 * seule chose qui distingue « la politique est écrite » de « la lecture
 * aboutit » — un refus rend une liste vide, jamais une erreur.
 */
export const ACCES_PUBLIC = readFileSync(
  new URL('supabase/migrations/20260920120000_acces_public.sql', racine),
  'utf8',
);

/**
 * Le texte de la dernière migration — l'enregistrement d'un jeton d'appareil.
 *
 * Elle répare un défaut que **seule une base réelle** pouvait montrer : une
 * clause `WHERE` qui lit une colonne exige, en plus de la politique de
 * modification, que la ligne soit lisible par une politique de `select`. La
 * modification du jeton touchait donc zéro ligne **sans erreur**, et le client
 * croyait avoir rafraîchi la date de son appareil.
 *
 * Ce banc-ci ne pouvait pas le voir : il joue `anon`, qui n'a aucune politique
 * de lecture sur `push_tokens` — le défaut est précisément ce silence.
 */
export const JETON_APPAREIL = readFileSync(
  new URL('supabase/migrations/20260922130000_jeton_appareil.sql', racine),
  'utf8',
);

/** Le texte du jeu de données d'essai. */
export const SEED = readFileSync(new URL('supabase/seed.sql', racine), 'utf8');

/**
 * Ce que Supabase installe et que PGlite n'a pas.
 *
 * Liste **close** : un ajout ici est une décision, et c'est le but. Elle a été
 * établie en énumérant les identifiants de la migration, commentaires retirés —
 * `anon`, `authenticated`, `auth.uid()`, `auth.users`, `gen_random_uuid()`
 * (natif depuis PostgreSQL 13) — puis complétée des privilèges par défaut de la
 * plateforme.
 *
 * Elle a été complétée **une fois**, pas deux : le premier essai s'arrêtait sur
 * `role "authenticated" does not exist` une fois le `42P01` corrigé. Un point de
 * coupure s'énumère, il ne se découvre pas un par un.
 */
export const DOUBLURE_SUPABASE = `
create schema if not exists auth;

create table if not exists auth.users (
  id                 uuid primary key default gen_random_uuid(),
  email              text,
  raw_user_meta_data jsonb default '{}'::jsonb,
  created_at         timestamptz not null default now()
);

-- Sur Supabase, auth.uid() lit le sujet du jeton de la requete. Ici, la meme
-- valeur est posee par le banc avec set_config.
create or replace function auth.uid()
returns uuid
language sql
stable
as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;

do $$ begin create role anon          nologin noinherit;           exception when duplicate_object then null; end $$;
do $$ begin create role authenticated nologin noinherit;           exception when duplicate_object then null; end $$;
do $$ begin create role service_role  nologin noinherit bypassrls; exception when duplicate_object then null; end $$;

grant usage on schema public to anon, authenticated;

-- Les privileges par defaut de la plateforme, poses AVANT la migration : toute
-- table creee ensuite les recoit, et les revoke de la migration s'appliquent
-- par-dessus. Les poser apres rendrait a anon ce que la migration lui retire.
alter default privileges in schema public grant all on tables    to anon, authenticated;
alter default privileges in schema public grant all on sequences to anon, authenticated;
`;

/**
 * Un moteur neuf, avec la doublure posée.
 *
 * La migration n'est **pas** appliquée : chaque banc décide quand, combien de
 * fois, et ce qu'il attend de l'échec éventuel.
 */
export async function ouvrirBase() {
  const db = await PGlite.create();
  await db.exec(DOUBLURE_SUPABASE);
  return db;
}

/**
 * Le numéro de ligne, dans le fichier, de la position signalée par PostgreSQL.
 *
 * `position` est un décalage en caractères dans le texte envoyé. Sans cette
 * conversion, un échec dit « 42P01 » sans dire **où** — et c'est précisément ce
 * que le message reçu par l'adhérent apportait, `LINE 111`, qui a permis de
 * trouver la cause en une lecture.
 *
 * ATTENTION AU TYPE : PGlite rend `position` sous forme de **chaîne** — `"4930"`,
 * pas `4930`. Un `typeof position === 'number'` la rejette en silence et le
 * message perd son repère. Mesuré sur le fichier fautif : 4930 → ligne 111, dont
 * le contenu est `    from public.profiles`, soit exactement le `LINE 111` de
 * l'adhérent.
 */
export function ligneDepuisPosition(texte, position) {
  const decalage = Number(position);
  if (!Number.isFinite(decalage) || decalage < 1) {
    return null;
  }
  return texte.slice(0, decalage - 1).split('\n').length;
}

/** Un échec de PostgreSQL, réduit à ce qui aide : le message et la ligne. */
export function resumer(erreur, texte) {
  const message = String(erreur.message ?? erreur).split('\n')[0];
  const ligne = ligneDepuisPosition(texte, erreur.position);
  const ou = ligne === null ? '' : ` (ligne ${ligne} du fichier)`;

  // Le diagnostic du défaut d'origine, écrit une fois pour toutes : qui lit ce
  // message n'a pas à refaire l'enquête.
  //
  // Il a d'abord visé une seule cause — l'ordre des sections dans un fichier —,
  // parce que c'était celle du défaut d'origine : un corps `language sql` lu à sa
  // création, avant les tables qu'il lit. Une seconde cause produit le **même**
  // code, et elle se rencontre en collant les fichiers : la table manquante
  // appartient alors au fichier **précédent**. Le message distingue les deux par
  // ce qu'il nomme, et c'est cette distinction qui est écrite ici — sans elle, le
  // diagnostic enverrait chercher un ordre de sections là où il manque un
  // fichier.
  const explication =
    erreur.code === '42P01'
      ? '\n  Une relation absente a deux causes, et le message dit laquelle : ' +
        "si la table nommée vient d'une migration PRÉCÉDENTE, c'est l'ordre des " +
        "FICHIERS qu'il faut vérifier ; si elle vient de ce fichier-ci, c'est " +
        "l'ORDRE DES SECTIONS — un corps `language sql` est analysé à sa " +
        'création, un corps PL/pgSQL seulement à son exécution, donc la section ' +
        '« Fonctions utilitaires » doit suivre la section « Tables ».'
      : '';

  return `${message}${ou}${explication}`;
}

/**
 * Applique un texte SQL, et rend `null` s'il passe — le résumé de l'échec sinon.
 *
 * Ne lève pas : un banc qui veut prouver qu'une instruction est **refusée** a
 * besoin de recevoir le refus, pas d'être interrompu par lui.
 */
export async function appliquer(db, sql) {
  try {
    await db.exec(sql);
    return null;
  } catch (erreur) {
    return resumer(erreur, sql);
  }
}
