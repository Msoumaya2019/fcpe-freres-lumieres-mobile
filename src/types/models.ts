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
export type SignalementCategory = Database['public']['Enums']['signalement_category'];
export type SignalementStatus = Database['public']['Enums']['signalement_status'];
export type DocumentCategory = Database['public']['Enums']['document_category'];
export type MessageCategory = Database['public']['Enums']['message_category'];
export type AnnonceCategory = Database['public']['Enums']['annonce_category'];

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
 * Un sondage, ses réponses, et le vote de l'adhérent s'il a voté.
 *
 * POURQUOI AUCUN DÉCOMPTE DE VOIX N'EST AFFICHÉ
 * --------------------------------------------
 * La politique de lecture de `sondage_votes` ne laisse voir que **son propre**
 * vote. Un `count` côté client renverrait donc 0 ou 1, jamais le résultat — et
 * un écran affichant « 1 voix » pour un sondage qui en a quarante serait pire
 * que de n'afficher aucun chiffre.
 *
 * Un décompte exact demanderait une fonction `security definer` qui rende des
 * compteurs sans exposer les votants, donc une migration de plus. Le bureau lit
 * les résultats depuis le tableau de bord, où la clé de service ne passe par
 * aucune politique ; c'est suffisant aujourd'hui, et l'écran se contente de
 * montrer ce à quoi on peut répondre.
 */
export interface SondageWithChoices extends Sondage {
  readonly choices: readonly SondageChoice[];
  readonly myChoiceId: string | null;
}
