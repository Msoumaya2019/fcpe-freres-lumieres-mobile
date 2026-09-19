/**
 * Types applicatifs, dérivés du schéma de la base.
 *
 * Les écrans et les services n'importent jamais `Database` directement : ils
 * passent par ces alias. Le jour où le schéma est régénéré, un seul fichier
 * porte la traduction entre les noms SQL (`main_course`) et le vocabulaire de
 * l'application.
 */

import type { Database, Tables } from '@/types/database';

export type MemberRole = Database['public']['Enums']['member_role'];
export type MemberStatus = Database['public']['Enums']['member_status'];
export type SignalementCategory = Database['public']['Enums']['signalement_category'];
export type SignalementStatus = Database['public']['Enums']['signalement_status'];
export type DocumentCategory = Database['public']['Enums']['document_category'];
export type DocumentVisibility = Database['public']['Enums']['document_visibility'];
export type MessageCategory = Database['public']['Enums']['message_category'];
export type AnnonceCategory = Database['public']['Enums']['annonce_category'];
export type ConversationStatus = Database['public']['Enums']['conversation_status'];

export type Profile = Tables<'profiles'>;
export type Annonce = Tables<'annonces'>;
export type CantineMenu = Tables<'cantine_menus'>;
export type CantineReservation = Tables<'cantine_reservations'>;
export type Signalement = Tables<'signalements'>;
export type DiscussionMessage = Tables<'discussion_messages'>;
export type AgendaEvent = Tables<'agenda_events'>;
export type DocumentFile = Tables<'documents'>;
export type Sondage = Tables<'sondages'>;
export type SondageChoice = Tables<'sondage_choices'>;
export type SondageVote = Tables<'sondage_votes'>;
export type MemberMessage = Tables<'messages'>;
export type Conversation = Tables<'conversations'>;
export type ConversationMessage = Tables<'conversation_messages'>;
export type PushToken = Tables<'push_tokens'>;

/**
 * Un message accompagné du nom de son auteur.
 *
 * La jointure est faite côté application (deux requêtes, puis un index par
 * identifiant) plutôt que par un `select` imbriqué : le typage des relations
 * imbriquées dépend des métadonnées de clés étrangères que PostgREST renvoie,
 * et une erreur à cet endroit ne se voit qu'à l'exécution. Deux requêtes
 * simples restent vérifiables à la compilation.
 */
export interface DiscussionMessageWithAuthor extends DiscussionMessage {
  readonly authorName: string;
}

export interface AnnonceWithAuthor extends Annonce {
  readonly authorName: string | null;
}

/** Libellés affichés pour les valeurs d'énumération. */
export const SIGNALEMENT_CATEGORY_LABELS: Readonly<Record<SignalementCategory, string>> = {
  cantine: 'Cantine',
  transport: 'Transport scolaire',
  vie_scolaire: 'Vie scolaire',
  autre: 'Autre',
};

export const SIGNALEMENT_STATUS_LABELS: Readonly<Record<SignalementStatus, string>> = {
  nouveau: 'Nouveau',
  en_cours: 'En cours de traitement',
  traite: 'Traité',
};

export const SIGNALEMENT_CATEGORIES: readonly SignalementCategory[] = [
  'cantine',
  'transport',
  'vie_scolaire',
  'autre',
];

export const ANNONCE_CATEGORY_LABELS: Readonly<Record<AnnonceCategory, string>> = {
  information: 'Information',
  important: 'Important',
  cantine: 'Cantine',
  evenement: 'Événement',
  reunion: 'Réunion',
};

export const DOCUMENT_CATEGORY_LABELS: Readonly<Record<DocumentCategory, string>> = {
  administratif: 'Administratif',
  scolarite: 'Scolarité',
  cantine: 'Cantine',
  activites: 'Activités',
  autre: 'Autre',
};

export const MESSAGE_CATEGORY_LABELS: Readonly<Record<MessageCategory, string>> = {
  cantine: 'Cantine',
  transport: 'Transport scolaire',
  vie_scolaire: 'Vie scolaire',
  activites: 'Activités',
  autre: 'Autre',
};

export const MESSAGE_CATEGORIES: readonly MessageCategory[] = [
  'cantine',
  'transport',
  'vie_scolaire',
  'activites',
  'autre',
];

/**
 * Un sondage, ses réponses, et le vote **de cet appareil** s'il a voté.
 *
 * POURQUOI LE VOTE EST LU LOCALEMENT
 * ----------------------------------
 * La politique de lecture de `sondage_votes` ne laissait voir que son propre
 * vote, et elle comparait `voter_id` à `auth.uid()` : deux valeurs qui sont
 * nulles pour un vote déposé sans compte. Elle a donc été retirée, et
 * l'application garde elle-même la trace de ce qu'elle a répondu.
 *
 * Ce que cela coûte est écrit sur l'écran de vote : réinstaller l'application
 * efface cette trace, et un second vote devient possible. C'est la limite
 * raisonnable d'un vote sans compte, et elle vaut mieux qu'une politique qui
 * n'autoriserait rien de ce qu'on croit.
 */
export interface SondageWithChoices extends Sondage {
  readonly choices: readonly SondageChoice[];
  readonly myChoiceId: string | null;
}

/**
 * Une ligne de résultat : une réponse, et le nombre de voix qu'elle a reçues.
 *
 * Le décompte vient de `resultats_sondage()`, une fonction `security definer`
 * qui rend des **compteurs** — jamais une ligne de vote. Le nom du votant ne
 * sort donc pas de la base, et c'est ce qui rend le résultat affichable.
 */
export interface SondageResultat {
  readonly choice_id: string;
  readonly label: string;
  readonly rang: number;
  readonly voix: number;
}
