/// <reference types="vite/client" />
import { createClient } from '@supabase/supabase-js';

// ── JSON scalar (mirrors Supabase's generated Json type) ──────────────────────

export type Json =
  | string
  | number
  | boolean
  | null
  | Json[]
  | { [key: string]: Json };

// ── Database schema types ─────────────────────────────────────────────────────
// Hand-written to match supabase/schema.sql exactly.
// Re-generate with `supabase gen types typescript` once the CLI is configured.

export interface Database {
  public: {
    Tables: {
      canvases: {
        Row: {
          id:         string;
          name:       string;
          slug:       string;
          width:      number;
          height:     number;
          is_active:  boolean;
          created_at: string;
        };
        Insert: {
          id?:         string;
          name:        string;
          slug:        string;
          width?:      number;
          height?:     number;
          is_active?:  boolean;
          created_at?: string;
        };
        Update: {
          name?:      string;
          slug?:      string;
          width?:     number;
          height?:    number;
          is_active?: boolean;
        };
        Relationships: [];
      };
      users: {
        Row: {
          id:             string;
          username:       string;
          canvas_id:      string | null;
          created_at:     string;
          last_active_at: string;
        };
        Insert: {
          id:              string;
          username:        string;
          canvas_id?:      string | null;
          created_at?:     string;
          last_active_at?: string;
        };
        Update: {
          username?:       string;
          canvas_id?:      string | null;
          last_active_at?: string;
        };
        Relationships: [];
      };
      drawings: {
        Row: {
          id:              string;
          canvas_id:       string;
          user_id:         string;
          path_data:       string;
          canvas_position: Json;
          bounding_box:    Json;
          color:           string;
          instrument:      string;
          note:            string;
          chord:           Json;
          frequencies:     Json;
          beat_position:   number;
          volume:          number;
          stroke_width:    number | null; // null for rows saved before this column was added
          is_deleted:      boolean;
          created_at:      string;
        };
        Insert: {
          id?:             string;
          canvas_id:       string;
          user_id:         string;
          path_data:       string;
          canvas_position: Json;
          bounding_box:    Json;
          color:           string;
          instrument:      string;
          note:            string;
          chord:           Json;
          frequencies:     Json;
          beat_position:   number;
          volume?:         number;
          stroke_width?:   number | null;
          is_deleted?:     boolean;
          created_at?:     string;
        };
        Update: {
          path_data?:       string;
          canvas_position?: Json;
          bounding_box?:    Json;
          color?:           string;
          instrument?:      string;
          note?:            string;
          chord?:           Json;
          frequencies?:     Json;
          beat_position?:   number;
          volume?:          number;
          stroke_width?:    number | null;
          is_deleted?:      boolean;
        };
        Relationships: [];
      };
      shared_snapshots: {
        Row: {
          id:                 string;
          canvas_id:          string;
          user_id:            string;
          active_drawing_ids: Json;
          chord_sheet_data:   Json;
          created_at:         string;
          view_count:         number;
        };
        Insert: {
          id?:                string;
          canvas_id:          string;
          user_id:            string;
          active_drawing_ids: Json;
          chord_sheet_data:   Json;
          created_at?:        string;
          view_count?:        number;
        };
        Update: {
          active_drawing_ids?: Json;
          chord_sheet_data?:   Json;
          view_count?:         number;
        };
        Relationships: [];
      };
    };
    Views:     { [_ in never]: never };
    Functions: { [_ in never]: never };
    Enums:     { [_ in never]: never };
  };
}

// Convenience accessor — Tables<'canvases'> gives the full Row type.
export type Tables<T extends keyof Database['public']['Tables']> =
  Database['public']['Tables'][T]['Row'];

// ── Client ────────────────────────────────────────────────────────────────────

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL  as string | undefined;
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

if (!supabaseUrl || !supabaseKey) {
  console.error(
    '[supabase] VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY is not set. ' +
    'Create .env.local with both values.',
  );
}

export const supabase = createClient<Database>(
  supabaseUrl  ?? '',
  supabaseKey  ?? '',
);
