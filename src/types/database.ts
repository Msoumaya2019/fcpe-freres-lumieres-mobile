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
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          display_name?: string;
          role?: Database['public']['Enums']['member_role'];
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          display_name?: string;
          role?: Database['public']['Enums']['member_role'];
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
          author_id: string | null;
          published_at: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          title: string;
          body: string;
          author_id?: string | null;
          published_at?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          title?: string;
          body?: string;
          author_id?: string | null;
          published_at?: string;
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
          voter_id: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          sondage_id: string;
          choice_id: string;
          voter_id: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          sondage_id?: string;
          choice_id?: string;
          voter_id?: string;
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
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      [_ in never]: never;
    };
    Enums: {
      member_role: 'membre' | 'admin';
      signalement_category: 'cantine' | 'transport' | 'vie_scolaire' | 'autre';
      signalement_status: 'nouveau' | 'en_cours' | 'traite';
      document_category: 'administratif' | 'scolarite' | 'cantine' | 'activites' | 'autre';
      message_category: 'cantine' | 'transport' | 'vie_scolaire' | 'activites' | 'autre';
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

export type Tables<T extends keyof Database['public']['Tables']> =
  Database['public']['Tables'][T]['Row'];
