/**
 * Types de la base Supabase.
 *
 * Ce fichier décrit le schéma défini par `supabase/migrations/`. Il est écrit
 * à la main pour que le dépôt compile sans dépendre de la CLI Supabase ; il
 * peut être régénéré à tout moment, ce qui est préférable dès que le schéma
 * bouge :
 *
 *     npx supabase gen types typescript --project-id <référence> --schema public \
 *       > src/types/database.ts
 *
 * Toute modification du SQL doit être répercutée ici dans le même commit :
 * TypeScript ne voit pas la base, un écart entre les deux ne se manifesterait
 * qu'à l'exécution, sur l'appareil.
 */

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          display_name: string;
          role: Database['public']['Enums']['member_role'];
          status: Database['public']['Enums']['member_status'];
          est_super_admin: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          display_name?: string;
          role?: Database['public']['Enums']['member_role'];
          status?: Database['public']['Enums']['member_status'];
          est_super_admin?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          display_name?: string;
          role?: Database['public']['Enums']['member_role'];
          status?: Database['public']['Enums']['member_status'];
          est_super_admin?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      annonces: {
        Row: {
          id: string;
          title: string;
          body: string;
          category: Database['public']['Enums']['annonce_category'];
          author_id: string | null;
          published_at: string;
          is_draft: boolean;
          image_path: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          title: string;
          body: string;
          category?: Database['public']['Enums']['annonce_category'];
          author_id?: string | null;
          published_at?: string;
          is_draft?: boolean;
          image_path?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          title?: string;
          body?: string;
          category?: Database['public']['Enums']['annonce_category'];
          author_id?: string | null;
          published_at?: string;
          is_draft?: boolean;
          image_path?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      cantine_menus: {
        Row: {
          id: string;
          service_date: string;
          starter: string | null;
          main_course: string | null;
          dessert: string | null;
          notes: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          service_date: string;
          starter?: string | null;
          main_course?: string | null;
          dessert?: string | null;
          notes?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          service_date?: string;
          starter?: string | null;
          main_course?: string | null;
          dessert?: string | null;
          notes?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      cantine_reservations: {
        Row: {
          id: string;
          menu_id: string;
          user_id: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          menu_id: string;
          user_id: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          menu_id?: string;
          user_id?: string;
          created_at?: string;
        };
        Relationships: [];
      };
      signalements: {
        Row: {
          id: string;
          author_id: string;
          category: Database['public']['Enums']['signalement_category'];
          subject: string;
          body: string;
          status: Database['public']['Enums']['signalement_status'];
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          author_id: string;
          category?: Database['public']['Enums']['signalement_category'];
          subject: string;
          body: string;
          status?: Database['public']['Enums']['signalement_status'];
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          author_id?: string;
          category?: Database['public']['Enums']['signalement_category'];
          subject?: string;
          body?: string;
          status?: Database['public']['Enums']['signalement_status'];
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      discussion_messages: {
        Row: {
          id: string;
          author_id: string;
          body: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          author_id: string;
          body: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          author_id?: string;
          body?: string;
          created_at?: string;
        };
        Relationships: [];
      };
      agenda_events: {
        Row: {
          id: string;
          title: string;
          description: string | null;
          start_at: string;
          end_at: string | null;
          location: string | null;
          all_day: boolean;
          author_id: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          title: string;
          description?: string | null;
          start_at: string;
          end_at?: string | null;
          location?: string | null;
          all_day?: boolean;
          author_id?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          title?: string;
          description?: string | null;
          start_at?: string;
          end_at?: string | null;
          location?: string | null;
          all_day?: boolean;
          author_id?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      documents: {
        Row: {
          id: string;
          title: string;
          description: string | null;
          category: Database['public']['Enums']['document_category'];
          visibility: Database['public']['Enums']['document_visibility'];
          storage_path: string;
          size_bytes: number | null;
          published_at: string;
          author_id: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          title: string;
          description?: string | null;
          category?: Database['public']['Enums']['document_category'];
          visibility?: Database['public']['Enums']['document_visibility'];
          storage_path: string;
          size_bytes?: number | null;
          published_at?: string;
          author_id?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          title?: string;
          description?: string | null;
          category?: Database['public']['Enums']['document_category'];
          visibility?: Database['public']['Enums']['document_visibility'];
          storage_path?: string;
          size_bytes?: number | null;
          published_at?: string;
          author_id?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      sondages: {
        Row: {
          id: string;
          question: string;
          details: string | null;
          is_open: boolean;
          closed_at: string | null;
          author_id: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          question: string;
          details?: string | null;
          is_open?: boolean;
          closed_at?: string | null;
          author_id?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          question?: string;
          details?: string | null;
          is_open?: boolean;
          closed_at?: string | null;
          author_id?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      sondage_choices: {
        Row: {
          id: string;
          sondage_id: string;
          label: string;
          position: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          sondage_id: string;
          label: string;
          position?: number;
          created_at?: string;
        };
        Update: {
          id?: string;
          sondage_id?: string;
          label?: string;
          position?: number;
          created_at?: string;
        };
        Relationships: [];
      };
      sondage_votes: {
        Row: {
          id: string;
          sondage_id: string;
          choice_id: string;
          voter_id: string | null;
          voter_key: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          sondage_id: string;
          choice_id: string;
          voter_id?: string | null;
          voter_key?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          sondage_id?: string;
          choice_id?: string;
          voter_id?: string | null;
          voter_key?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
      messages: {
        Row: {
          id: string;
          subject: string;
          body: string;
          category: Database['public']['Enums']['message_category'];
          reply_to: string | null;
          author_id: string;
          handled: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          subject: string;
          body: string;
          category?: Database['public']['Enums']['message_category'];
          reply_to?: string | null;
          author_id: string;
          handled?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          subject?: string;
          body?: string;
          category?: Database['public']['Enums']['message_category'];
          reply_to?: string | null;
          author_id?: string;
          handled?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      conversations: {
        Row: {
          id: string;
          secret_hash: string;
          subject: string;
          category: Database['public']['Enums']['message_category'];
          reply_to: string | null;
          status: Database['public']['Enums']['conversation_status'];
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          secret_hash: string;
          subject: string;
          category?: Database['public']['Enums']['message_category'];
          reply_to?: string | null;
          status?: Database['public']['Enums']['conversation_status'];
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          secret_hash?: string;
          subject?: string;
          category?: Database['public']['Enums']['message_category'];
          reply_to?: string | null;
          status?: Database['public']['Enums']['conversation_status'];
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      conversation_messages: {
        Row: {
          id: string;
          conversation_id: string;
          from_bureau: boolean;
          body: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          conversation_id: string;
          from_bureau?: boolean;
          body: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          conversation_id?: string;
          from_bureau?: boolean;
          body?: string;
          created_at?: string;
        };
        Relationships: [];
      };
      push_tokens: {
        Row: {
          token: string;
          platform: string;
          created_at: string;
          last_seen_at: string;
        };
        Insert: {
          token: string;
          platform: string;
          created_at?: string;
          last_seen_at?: string;
        };
        Update: {
          token?: string;
          platform?: string;
          created_at?: string;
          last_seen_at?: string;
        };
        Relationships: [];
      };
      /**
       * Les commentaires déposés sous une actualité, publiés après validation.
       *
       * `statut` est **obligatoire à l'insertion** côté SQL — la colonne porte un
       * défaut, donc `Insert` la marque facultative, mais la politique
       * `commentaires_insert_public` impose `'en_attente'`. Le type ne peut pas
       * l'exprimer : c'est le service qui pose la valeur, et le banc de
       * comportement qui vérifie qu'un client modifié ne peut pas publier.
       *
       * `moderated_by` désigne le **modérateur**, jamais l'auteur — celui-ci
       * n'est qu'une clé d'appareil, dans `voter_key`, sans clé étrangère.
       */
      commentaires: {
        Row: {
          id: string;
          annonce_id: string;
          auteur_nom: string;
          corps: string;
          statut: Database['public']['Enums']['commentaire_statut'];
          voter_key: string;
          moderated_at: string | null;
          moderated_by: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          annonce_id: string;
          auteur_nom: string;
          corps: string;
          statut?: Database['public']['Enums']['commentaire_statut'];
          voter_key: string;
          moderated_at?: string | null;
          moderated_by?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          annonce_id?: string;
          auteur_nom?: string;
          corps?: string;
          statut?: Database['public']['Enums']['commentaire_statut'];
          voter_key?: string;
          moderated_at?: string | null;
          moderated_by?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
    };
    Views: {
      [_ in never]: never;
    };
    /**
     * Les fonctions appelées par l'application, et leurs signatures.
     *
     * POURQUOI ELLES SONT DÉCLARÉES ICI
     * ---------------------------------
     * `requireSupabase()` rend un client typé par ce fichier. Sans cette section,
     * `client.rpc('lire_conversation', …)` ne compilerait pas — et c'est
     * exactement ce qu'on veut : un nom de fonction mal orthographié, ou un
     * paramètre dans le mauvais ordre, échoue à la compilation plutôt qu'à
     * l'exécution, sur un écran vide que personne ne saurait expliquer.
     *
     * Les types de retour sont ceux que `supabase gen types` produirait : une
     * fonction `returns table (…)` rend une ligne par message, et `Args` porte
     * les paramètres nommés — l'ordre n'y compte pas, ce qui est la raison même
     * pour laquelle on les nomme.
     */
    Functions: {
      cle_appareil: {
        Args: Record<string, never>;
        Returns: string;
      };
      /**
       * Accepte, refuse ou suspend une adhésion. Réservée au bureau.
       *
       * `Returns: undefined` et non `void` : `void` est le type d'une fonction
       * qui ne rend rien **à l'appelant**, et une signature de retour doit être
       * un type. Les autres fonctions du fichier qui ne rendent pas de ligne
       * sont écrites de la même façon.
       */
      decider_adhesion: {
        Args: {
          p_id: string;
          p_statut: Database['public']['Enums']['member_status'];
        };
        Returns: undefined;
      };
      creer_conversation: {
        Args: {
          p_subject: string;
          p_category: Database['public']['Enums']['message_category'];
          p_body: string;
          p_reply_to: string;
        };
        Returns: { conversation_id: string; conversation_secret: string }[];
      };
      lire_conversation: {
        Args: { p_id: string; p_secret: string };
        Returns: {
          message_id: string;
          from_bureau: boolean;
          body: string;
          created_at: string;
        }[];
      };
      repondre_conversation: {
        Args: { p_id: string; p_secret: string; p_body: string };
        Returns: boolean;
      };
      lister_conversations: {
        Args: Record<string, never>;
        Returns: {
          id: string;
          subject: string;
          category: Database['public']['Enums']['message_category'];
          status: Database['public']['Enums']['conversation_status'];
          reply_to: string | null;
          created_at: string;
          updated_at: string;
          message_count: number;
          last_body: string | null;
        }[];
      };
      lire_conversation_bureau: {
        Args: { p_id: string };
        Returns: {
          message_id: string;
          from_bureau: boolean;
          body: string;
          created_at: string;
        }[];
      };
      repondre_conversation_bureau: {
        Args: { p_id: string; p_body: string };
        Returns: undefined;
      };
      resultats_sondage: {
        Args: { p_sondage_id: string };
        Returns: { choice_id: string; label: string; rang: number; voix: number }[];
      };
      /**
       * Les deux fonctions du tableau de bord, ajoutées par
       * `20260921090000_administration.sql`.
       *
       * L'application mobile ne les appelle pas, et elles figurent pourtant ici :
       * ce fichier décrit le **schéma**, pas l'usage qu'en fait l'application.
       * C'est précisément ce qui le rend vérifiable — un miroir qui ne
       * contiendrait que ce que le code emploie ne dirait plus rien de la base.
       */
      changer_role: {
        Args: {
          p_id: string;
          p_role: Database['public']['Enums']['member_role'];
        };
        Returns: undefined;
      };
      marquer_conversation: {
        Args: {
          p_id: string;
          p_statut: Database['public']['Enums']['conversation_status'];
        };
        Returns: undefined;
      };
    };
    Enums: {
      member_role: 'membre' | 'admin';
      member_status: 'en_attente' | 'accepte' | 'refuse' | 'suspendu';
      signalement_category: 'cantine' | 'transport' | 'vie_scolaire' | 'autre';
      signalement_status: 'nouveau' | 'en_cours' | 'traite';
      annonce_category: 'information' | 'important' | 'cantine' | 'evenement' | 'reunion';
      document_category: 'administratif' | 'scolarite' | 'cantine' | 'activites' | 'autre';
      document_visibility: 'familles' | 'bureau';
      message_category: 'cantine' | 'transport' | 'vie_scolaire' | 'activites' | 'autre';
      conversation_status: 'nouveau' | 'en_cours' | 'clos';
      commentaire_statut: 'en_attente' | 'publie' | 'refuse';
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

export type Tables<T extends keyof Database['public']['Tables']> =
  Database['public']['Tables'][T]['Row'];
