/**
 * Supabase 스키마 TypeScript 타입.
 * 스키마 변경 시 함께 업데이트할 것. (or `supabase gen types typescript`)
 */

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type UserRole = "admin" | "super_admin";
export type TournamentStatusOverride = "upcoming" | "ongoing" | "finished";
export type TournamentStatus = "upcoming" | "ongoing" | "finished";
export type CategoryAge =
  | "ELEM_U10"
  | "ELEM_U12"
  | "MIDDLE"
  | "HIGH"
  | "COLLEGE"
  | "ADULT";
export type Gender = "M" | "F";
export type EventType = "single" | "double" | "triple" | "team5";
export type LaneMoveDirection = "L" | "R";
export type GameStatus = "open" | "locked";
export type LineupRole = "starter" | "bench";

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          email: string;
          role: UserRole;
          display_name: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          email: string;
          role?: UserRole;
          display_name?: string | null;
        };
        Update: Partial<{
          email: string;
          role: UserRole;
          display_name: string | null;
        }>;
      };
      regions: {
        Row: { id: number; name: string; sort_order: number };
        Insert: { id?: number; name: string; sort_order?: number };
        Update: Partial<{ name: string; sort_order: number }>;
      };
      affiliations: {
        Row: {
          id: number;
          region_id: number;
          name: string;
          use_count: number;
          created_at: string;
        };
        Insert: { region_id: number; name: string; use_count?: number };
        Update: Partial<{
          region_id: number;
          name: string;
          use_count: number;
        }>;
      };
      players: {
        Row: {
          id: number;
          name: string;
          region_id: number;
          affiliation_id: number | null;
          affiliation_name: string;
          birth_year: number | null;
          gender: Gender | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          name: string;
          region_id: number;
          affiliation_id?: number | null;
          affiliation_name: string;
          birth_year?: number | null;
          gender?: Gender | null;
        };
        Update: Partial<{
          name: string;
          region_id: number;
          affiliation_id: number | null;
          affiliation_name: string;
          birth_year: number | null;
          gender: Gender | null;
        }>;
      };
      tournaments: {
        Row: {
          id: number;
          name: string;
          venue: string;
          start_date: string;
          end_date: string;
          status_override: TournamentStatusOverride | null;
          settings: Json;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          name: string;
          venue: string;
          start_date: string;
          end_date: string;
          status_override?: TournamentStatusOverride | null;
          settings?: Json;
        };
        Update: Partial<{
          name: string;
          venue: string;
          start_date: string;
          end_date: string;
          status_override: TournamentStatusOverride | null;
          settings: Json;
        }>;
      };
      tournament_categories: {
        Row: {
          id: number;
          tournament_id: number;
          age: CategoryAge;
          gender: Gender;
          created_at: string;
        };
        Insert: {
          tournament_id: number;
          age: CategoryAge;
          gender: Gender;
        };
        Update: Partial<{
          age: CategoryAge;
          gender: Gender;
        }>;
      };
      tournament_events: {
        Row: {
          id: number;
          tournament_category_id: number;
          event_type: EventType;
          games_count: number;
          halftime_split_at: number | null;
          lane_move_direction: LaneMoveDirection;
          lane_move_offset: number;
          lane_start: number | null;
          lane_end: number | null;
          squad_count: number;
          created_at: string;
        };
        Insert: {
          tournament_category_id: number;
          event_type: EventType;
          games_count?: number;
          halftime_split_at?: number | null;
          lane_move_direction?: LaneMoveDirection;
          lane_move_offset?: number;
          lane_start?: number | null;
          lane_end?: number | null;
          squad_count?: number;
        };
        Update: Partial<{
          event_type: EventType;
          games_count: number;
          halftime_split_at: number | null;
          lane_move_direction: LaneMoveDirection;
          lane_move_offset: number;
          lane_start: number | null;
          lane_end: number | null;
          squad_count: number;
        }>;
      };
      tournament_players: {
        Row: {
          id: number;
          tournament_id: number;
          tournament_category_id: number;
          player_id: number;
          region_id: number;
          affiliation_name: string;
          player_number: number;
          team_label: string;
          registered_order: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          tournament_id: number;
          tournament_category_id: number;
          player_id: number;
          region_id: number;
          affiliation_name: string;
          player_number: number;
          team_label: string;
          registered_order: number;
        };
        Update: Partial<{
          tournament_category_id: number;
          player_id: number;
          region_id: number;
          affiliation_name: string;
          team_label: string;
          registered_order: number;
        }>;
      };
      tournament_teams: {
        Row: {
          id: number;
          tournament_event_id: number;
          region_id: number;
          affiliation_name: string;
          team_label: string;
          team_seq: number;
          created_at: string;
        };
        Insert: {
          tournament_event_id: number;
          region_id: number;
          affiliation_name: string;
          team_label: string;
          team_seq?: number;
        };
        Update: Partial<{
          team_seq: number;
        }>;
      };
      tournament_team_members: {
        Row: {
          id: number;
          tournament_team_id: number;
          tournament_event_id: number;
          tournament_player_id: number;
          member_order: number;
          created_at: string;
        };
        Insert: {
          tournament_team_id: number;
          // 트리거(set_ttm_event_id)가 팀에서 자동 채움 — 생략 가능
          tournament_event_id?: number;
          tournament_player_id: number;
          member_order: number;
        };
        Update: Partial<{ member_order: number }>;
      };
      event_squad_members: {
        Row: {
          id: number;
          tournament_event_id: number;
          tournament_player_id: number;
          squad_number: number;
          created_at: string;
        };
        Insert: {
          tournament_event_id: number;
          tournament_player_id: number;
          squad_number?: number;
        };
        Update: Partial<{
          squad_number: number;
        }>;
      };
      event_lineups: {
        Row: {
          id: number;
          tournament_team_id: number;
          game_number: number;
          tournament_player_id: number;
          role: LineupRole;
          created_at: string;
        };
        Insert: {
          tournament_team_id: number;
          game_number: number;
          tournament_player_id: number;
          role: LineupRole;
        };
        Update: Partial<{ role: LineupRole }>;
      };
      lane_assignments: {
        Row: {
          id: number;
          tournament_event_id: number;
          base_lane: number;
          tournament_team_id: number | null;
          squad_number: number;
          is_makeup: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          tournament_event_id: number;
          base_lane: number;
          tournament_team_id?: number | null;
          squad_number?: number;
          is_makeup?: boolean;
        };
        Update: Partial<{
          base_lane: number;
          tournament_team_id: number | null;
          squad_number: number;
          is_makeup: boolean;
        }>;
      };
      lane_assignment_players: {
        Row: {
          id: number;
          lane_assignment_id: number;
          tournament_player_id: number;
          half: number;
          created_at: string;
        };
        Insert: {
          lane_assignment_id: number;
          tournament_player_id: number;
          half?: number;
        };
        Update: Partial<{
          lane_assignment_id: number;
          half: number;
        }>;
      };
      game_states: {
        Row: {
          id: number;
          tournament_event_id: number;
          game_number: number;
          squad_number: number;
          status: GameStatus;
          locked_at: string | null;
          locked_by: string | null;
        };
        Insert: {
          tournament_event_id: number;
          game_number: number;
          squad_number?: number;
          status?: GameStatus;
          locked_at?: string | null;
          locked_by?: string | null;
        };
        Update: Partial<{
          squad_number: number;
          status: GameStatus;
          locked_at: string | null;
          locked_by: string | null;
        }>;
      };
      scores: {
        Row: {
          id: number;
          tournament_event_id: number;
          tournament_player_id: number;
          game_number: number;
          score: number;
          updated_by: string | null;
          updated_at: string;
        };
        Insert: {
          tournament_event_id: number;
          tournament_player_id: number;
          game_number: number;
          score: number;
          updated_by?: string | null;
        };
        Update: Partial<{
          score: number;
          updated_by: string | null;
        }>;
      };
      rankings: {
        Row: {
          id: number;
          tournament_event_id: number;
          tournament_player_id: number;
          games_played: number;
          total: number;
          avg: number | null;
          high_game: number | null;
          rank: number | null;
          pin_diff_from_first: number | null;
          updated_at: string;
        };
        Insert: never;
        Update: never;
      };
      team_rankings: {
        Row: {
          id: number;
          tournament_event_id: number;
          tournament_team_id: number;
          games_played: number;
          total: number;
          avg: number | null;
          high_game: number | null;
          rank: number | null;
          pin_diff_from_first: number | null;
          updated_at: string;
        };
        Insert: never;
        Update: never;
      };
      audit_logs: {
        Row: {
          id: number;
          user_id: string | null;
          action: string;
          entity_type: string;
          entity_id: string | null;
          payload: Json | null;
          created_at: string;
        };
        Insert: {
          user_id?: string | null;
          action: string;
          entity_type: string;
          entity_id?: string | null;
          payload?: Json | null;
        };
        Update: never;
      };
    };
    Views: {
      tournaments_with_status: {
        Row: Database["public"]["Tables"]["tournaments"]["Row"] & {
          status: TournamentStatus;
        };
      };
      participant_names: {
        Row: { tournament_player_id: number; name: string };
      };
    };
    Functions: {
      next_player_number: {
        Args: { p_tournament_id: number };
        Returns: number;
      };
      recalc_team_labels: {
        Args: {
          p_tournament_id: number;
          p_region_id: number;
          p_affiliation_name: string;
        };
        Returns: void;
      };
      lane_at_game: {
        Args: {
          p_base_lane: number;
          p_lane_start: number;
          p_lane_end: number;
          p_direction: LaneMoveDirection;
          p_offset: number;
          p_game_number: number;
        };
        Returns: number;
      };
      refresh_rankings: {
        Args: { p_event_id: number };
        Returns: void;
      };
      lock_game: {
        Args: {
          p_event_id: number;
          p_game_number: number;
          p_squad_number?: number;
        };
        Returns: void;
      };
      unlock_game: {
        Args: {
          p_event_id: number;
          p_game_number: number;
          p_squad_number?: number;
        };
        Returns: void;
      };
    };
    Enums: {
      user_role: UserRole;
      tournament_status_override: TournamentStatusOverride;
      category_age: CategoryAge;
      gender: Gender;
      event_type: EventType;
      lane_move_direction: LaneMoveDirection;
      game_status: GameStatus;
      lineup_role: LineupRole;
    };
    CompositeTypes: Record<string, never>;
  };
}
