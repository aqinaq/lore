import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';
import { Platform } from 'react-native';

// ─── Database type definitions ────────────────────────────────────────────────

export type UserRole = 'admin' | 'member';
export type DropType = 'photo' | 'voice' | 'drawing' | 'text' | 'video';
export type PlayType = 'listen' | 'draw' | 'poll' | 'question';
export type SessionState = 'active' | 'ended';

export interface Database {
  public: {
    Tables: {
      users: {
        Row: {
          id: string;
          display_name: string;
          email_hash: string;
          avatar_url: string | null;
          created_at: string;
          current_vibe: string | null;
          vibe_set_at: string | null;
        };
        Insert: {
          id?: string;
          display_name: string;
          email_hash: string;
          avatar_url?: string | null;
          created_at?: string;
          current_vibe?: string | null;
          vibe_set_at?: string | null;
        };
        Update: {
          id?: string;
          display_name?: string;
          email_hash?: string;
          avatar_url?: string | null;
          created_at?: string;
          current_vibe?: string | null;
          vibe_set_at?: string | null;
        };
        Relationships: [];
      };
      circles: {
        Row: {
          id: string;
          name: string;
          avatar_url: string | null;
          description: string | null;
          invite_code: string;
          invite_expires: string;
          created_by: string;
          created_at: string;
          member_count: number;
        };
        Insert: {
          id?: string;
          name: string;
          avatar_url?: string | null;
          description?: string | null;
          invite_code: string;
          invite_expires: string;
          created_by: string;
          created_at?: string;
          member_count?: number;
        };
        Update: {
          id?: string;
          name?: string;
          avatar_url?: string | null;
          description?: string | null;
          invite_code?: string;
          invite_expires?: string;
          created_by?: string;
          created_at?: string;
          member_count?: number;
        };
        Relationships: [];
      };
      circle_members: {
        Row: {
          circle_id: string;
          user_id: string;
          role: UserRole;
          joined_at: string;
          nickname: string | null;
        };
        Insert: {
          circle_id: string;
          user_id: string;
          role: UserRole;
          joined_at?: string;
          nickname?: string | null;
        };
        Update: {
          circle_id?: string;
          user_id?: string;
          role?: UserRole;
          joined_at?: string;
          nickname?: string | null;
        };
        Relationships: [];
      };
      drops: {
        Row: {
          id: string;
          circle_id: string;
          author_id: string;
          type: DropType;
          content_url: string | null;
          caption: string | null;
          created_at: string;
          expires_at: string;
          is_pinned: boolean;
          reply_count: number;
        };
        Insert: {
          id?: string;
          circle_id: string;
          author_id: string;
          type: DropType;
          content_url?: string | null;
          caption?: string | null;
          created_at?: string;
          expires_at?: string;
          is_pinned?: boolean;
          reply_count?: number;
        };
        Update: {
          id?: string;
          circle_id?: string;
          author_id?: string;
          type?: DropType;
          content_url?: string | null;
          caption?: string | null;
          created_at?: string;
          expires_at?: string;
          is_pinned?: boolean;
          reply_count?: number;
        };
        Relationships: [];
      };
      drop_replies: {
        Row: {
          id: string;
          drop_id: string;
          circle_id: string;
          author_id: string;
          content: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          drop_id: string;
          circle_id: string;
          author_id: string;
          content: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          drop_id?: string;
          circle_id?: string;
          author_id?: string;
          content?: string;
          created_at?: string;
        };
        Relationships: [];
      };
      drop_reactions: {
        Row: {
          drop_id: string;
          user_id: string;
          emoji: string;
          created_at: string;
        };
        Insert: {
          drop_id: string;
          user_id: string;
          emoji: string;
          created_at?: string;
        };
        Update: {
          drop_id?: string;
          user_id?: string;
          emoji?: string;
          created_at?: string;
        };
        Relationships: [];
      };
      vault_pins: {
        Row: {
          id: string;
          drop_id: string;
          circle_id: string;
          pinned_by: string;
          memory_title: string | null;
          pinned_at: string;
        };
        Insert: {
          id?: string;
          drop_id: string;
          circle_id: string;
          pinned_by: string;
          memory_title?: string | null;
          pinned_at?: string;
        };
        Update: {
          id?: string;
          drop_id?: string;
          circle_id?: string;
          pinned_by?: string;
          memory_title?: string | null;
          pinned_at?: string;
        };
        Relationships: [];
      };
      play_sessions: {
        Row: {
          id: string;
          circle_id: string;
          type: PlayType;
          started_by: string;
          started_at: string;
          state: SessionState;
          metadata: Record<string, unknown>;
        };
        Insert: {
          id?: string;
          circle_id: string;
          type: PlayType;
          started_by: string;
          started_at?: string;
          state?: SessionState;
          metadata?: Record<string, unknown>;
        };
        Update: {
          id?: string;
          circle_id?: string;
          type?: PlayType;
          started_by?: string;
          started_at?: string;
          state?: SessionState;
          metadata?: Record<string, unknown>;
        };
        Relationships: [];
      };
    };
    Views: { [_ in never]: never };
    Functions: {
      is_circle_member: {
        Args: { p_circle_id: string };
        Returns: boolean;
      };
      is_circle_admin: {
        Args: { p_circle_id: string };
        Returns: boolean;
      };
    };
    Enums: { [_ in never]: never };
    CompositeTypes: { [_ in never]: never };
  };
}

// ─── Typed Supabase client ────────────────────────────────────────────────────

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!;

export const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: Platform.OS === 'web',
  },
});
