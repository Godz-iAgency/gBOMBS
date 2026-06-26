/**
 * Hand-written subset of the gBOMBS database types covering the tables used so
 * far (auth + onboarding). Once the full schema is live you can regenerate the
 * complete file with:
 *
 *   npx supabase gen types typescript --project-id oknnbvtjcjpfzzgfhxza > src/types/database.types.ts
 *
 * Until then, this keeps the Supabase client type-safe for the tables we touch.
 */

export type DietMode = 'vegan' | 'vegetarian';
export type HealthGoal =
  | 'weight_loss'
  | 'gut_health'
  | 'energy'
  | 'anti_inflammatory'
  | 'general_wellness';
export type CookingStyle =
  | 'quick_simple'
  | 'balanced_everyday'
  | 'gourmet_weekend'
  | 'batch_cooking';
export type SubscriptionTier = 'trial' | 'standard' | 'wellness_pro' | 'canceled';
export type SubscriptionStatus =
  | 'active'
  | 'trialing'
  | 'past_due'
  | 'canceled'
  | 'incomplete';

export type FoodCategory =
  | 'greens'
  | 'beans'
  | 'onion'
  | 'mushroom'
  | 'berries'
  | 'seeds'
  | 'grains'
  | 'herbs_spices'
  | 'other_vegetables'
  | 'eggs_dairy';

// ---- Professional dashboards (Step 11) -----------------------------------
export type ProfessionalRole = 'chef' | 'trainer_nutritionist';
export type ConnectionStatus = 'pending' | 'active' | 'revoked';
export type ProfessionalEditType =
  | 'note'
  | 'goal_edit'
  | 'suggested_meal_adjustment';
export type ProfessionalEditStatus =
  | 'applied'
  | 'pending_next_cycle'
  | 'reverted';

/** Arbitrary JSON returned by jsonb-returning RPCs. */
export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

/** One row of list_my_clients() — a professional's active client. */
export interface ClientSummaryRow {
  connection_id: string;
  client_id: string;
  client_name: string | null;
  role: ProfessionalRole;
  accepted_at: string | null;
  plan_updated_at: string | null;
  grocery_updated_at: string | null;
}

export interface Database {
  public: {
    Tables: {
      users: {
        Row: {
          id: string;
          email: string;
          full_name: string | null;
          avatar_url: string | null;
          diet_mode: DietMode;
          health_goal: HealthGoal;
          cooking_style: CookingStyle;
          subscription_tier: SubscriptionTier;
          subscription_status: SubscriptionStatus;
          trial_ends_at: string | null;
          subscription_id: string | null;
          customer_id: string | null;
          revenuecat_id: string | null;
          phone_number: string | null;
          onboarding_completed: boolean;
          chef_access_enabled: boolean;
          auto_order_enabled: boolean;
          preferred_delivery_day: string | null;
          instacart_store_preference: string | null;
          push_token: string | null;
          timezone: string | null;
          notifications_enabled: boolean;
          last_preferences_updated_at: string | null;
          preferences_version: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          email: string;
          full_name?: string | null;
          avatar_url?: string | null;
          diet_mode?: DietMode;
          health_goal?: HealthGoal;
          cooking_style?: CookingStyle;
          phone_number?: string | null;
          onboarding_completed?: boolean;
        };
        Update: Partial<Database['public']['Tables']['users']['Row']>;
        Relationships: [];
      };
      streaks: {
        Row: {
          id: string;
          user_id: string;
          current_daily_streak: number;
          longest_daily_streak: number;
          current_perfect_day_streak: number;
          longest_perfect_day_streak: number;
          current_weekly_streak: number;
          longest_weekly_streak: number;
          last_logged_date: string | null;
          total_perfect_days: number;
          total_days_logged: number;
          updated_at: string;
        };
        Insert: {
          user_id: string;
          current_daily_streak?: number;
          longest_daily_streak?: number;
          current_perfect_day_streak?: number;
          longest_perfect_day_streak?: number;
          current_weekly_streak?: number;
          longest_weekly_streak?: number;
          last_logged_date?: string | null;
          total_perfect_days?: number;
          total_days_logged?: number;
          updated_at?: string;
        };
        Update: Partial<Database['public']['Tables']['streaks']['Row']>;
        Relationships: [];
      };
      food_preferences: {
        Row: {
          id: string;
          user_id: string;
          category: FoodCategory;
          food_item: string;
          food_item_normalized: string | null;
          source: 'preset' | 'custom';
          is_validated: boolean;
          validation_attempted_at: string | null;
          is_excluded: boolean;
          is_active: boolean;
          display_order: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          user_id: string;
          category: FoodCategory;
          food_item: string;
          food_item_normalized?: string | null;
          source?: 'preset' | 'custom';
          is_validated?: boolean;
          is_excluded?: boolean;
          is_active?: boolean;
          display_order?: number;
        };
        Update: Partial<Database['public']['Tables']['food_preferences']['Row']>;
        Relationships: [];
      };
      food_preference_history: {
        Row: {
          id: string;
          user_id: string;
          action: 'added' | 'removed' | 'diet_mode_changed';
          food_item: string | null;
          category: string | null;
          old_diet_mode: string | null;
          new_diet_mode: string | null;
          changed_at: string;
        };
        Insert: {
          user_id: string;
          action: 'added' | 'removed' | 'diet_mode_changed';
          food_item?: string | null;
          category?: string | null;
          old_diet_mode?: string | null;
          new_diet_mode?: string | null;
        };
        Update: Partial<
          Database['public']['Tables']['food_preference_history']['Row']
        >;
        Relationships: [];
      };
      daily_scores: {
        Row: {
          id: string;
          user_id: string;
          score_date: string;
          gbombs_score: number;
          greens_hit: boolean;
          beans_hit: boolean;
          onion_hit: boolean;
          mushroom_hit: boolean;
          berries_hit: boolean;
          seeds_hit: boolean;
          meals_logged: number;
          total_calories: number;
          total_protein_grams: number;
          total_fiber_grams: number;
          total_carbs_grams: number;
          total_fats_grams: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          user_id: string;
          score_date: string;
          gbombs_score?: number;
          greens_hit?: boolean;
          beans_hit?: boolean;
          onion_hit?: boolean;
          mushroom_hit?: boolean;
          berries_hit?: boolean;
          seeds_hit?: boolean;
          meals_logged?: number;
          updated_at?: string;
        };
        Update: Partial<Database['public']['Tables']['daily_scores']['Row']>;
        Relationships: [];
      };
      trial_fingerprints: {
        Row: {
          id: string;
          email_normalized: string | null;
          phone_normalized: string | null;
          last_user_id: string | null;
          first_trial_at: string;
          created_at: string;
        };
        Insert: {
          email_normalized?: string | null;
          phone_normalized?: string | null;
          last_user_id?: string | null;
        };
        Update: Partial<
          Database['public']['Tables']['trial_fingerprints']['Row']
        >;
        Relationships: [];
      };
      badges: {
        Row: {
          id: string;
          badge_key: string;
          badge_name: string;
          badge_description: string;
          badge_icon: string;
          badge_category: 'streak' | 'nutrition' | 'social' | 'shopping' | 'engagement';
          unlock_criteria: Record<string, unknown>;
          created_at: string;
        };
        Insert: {
          badge_key: string;
          badge_name: string;
          badge_description: string;
          badge_icon: string;
          badge_category: 'streak' | 'nutrition' | 'social' | 'shopping' | 'engagement';
          unlock_criteria: Record<string, unknown>;
        };
        Update: Partial<Database['public']['Tables']['badges']['Row']>;
        Relationships: [];
      };
      user_badges: {
        Row: {
          id: string;
          user_id: string;
          badge_id: string;
          unlocked_at: string;
        };
        Insert: {
          user_id: string;
          badge_id: string;
        };
        Update: Partial<Database['public']['Tables']['user_badges']['Row']>;
        Relationships: [];
      };
      meal_plans: {
        Row: {
          id: string;
          user_id: string;
          plan: unknown; // WeeklyMealPlan JSON (see services/gemini types)
          generated_at: string;
          tier_used: string | null;
          model_used: string | null;
          updated_at: string;
          created_at: string;
        };
        Insert: {
          user_id: string;
          plan: unknown;
          generated_at: string;
          tier_used?: string | null;
          model_used?: string | null;
          updated_at?: string;
        };
        Update: Partial<Database['public']['Tables']['meal_plans']['Row']>;
        Relationships: [];
      };
      grocery_lists: {
        Row: {
          id: string;
          user_id: string;
          list: unknown; // GroceryList JSON (see services/gemini types)
          plan_generated_at: string | null;
          updated_at: string;
          created_at: string;
        };
        Insert: {
          user_id: string;
          list: unknown;
          plan_generated_at?: string | null;
          updated_at?: string;
        };
        Update: Partial<Database['public']['Tables']['grocery_lists']['Row']>;
        Relationships: [];
      };
      professional_connections: {
        Row: {
          id: string;
          client_id: string;
          professional_id: string | null;
          role: ProfessionalRole;
          status: ConnectionStatus;
          invite_code: string | null;
          professional_name: string | null;
          invite_created_at: string;
          invite_expires_at: string | null;
          accepted_at: string | null;
          revoked_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          client_id: string;
          role: ProfessionalRole;
          status?: ConnectionStatus;
          invite_code?: string | null;
          professional_id?: string | null;
          professional_name?: string | null;
          invite_expires_at?: string | null;
        };
        Update: Partial<
          Database['public']['Tables']['professional_connections']['Row']
        >;
        Relationships: [];
      };
      professional_edits: {
        Row: {
          id: string;
          connection_id: string | null;
          client_id: string;
          professional_id: string;
          professional_role: ProfessionalRole;
          professional_name: string | null;
          edit_type: ProfessionalEditType;
          target_reference: string | null;
          previous_value: string | null;
          new_value: string | null;
          status: ProfessionalEditStatus;
          created_at: string;
          applied_at: string | null;
          reverted_at: string | null;
        };
        Insert: {
          client_id: string;
          professional_id: string;
          professional_role: ProfessionalRole;
          edit_type: ProfessionalEditType;
          connection_id?: string | null;
          professional_name?: string | null;
          target_reference?: string | null;
          previous_value?: string | null;
          new_value?: string | null;
          status?: ProfessionalEditStatus;
        };
        Update: Partial<
          Database['public']['Tables']['professional_edits']['Row']
        >;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: {
      create_professional_invite: {
        Args: { p_role: string };
        Returns: string;
      };
      accept_professional_invite: {
        Args: { p_code: string };
        Returns: Json;
      };
      revoke_professional_connection: {
        Args: { p_connection_id: string };
        Returns: undefined;
      };
      get_client_profile: {
        Args: { p_client_id: string };
        Returns: Json;
      };
      list_my_clients: {
        Args: Record<PropertyKey, never>;
        Returns: ClientSummaryRow[];
      };
      is_active_professional_for: {
        Args: { target_client: string };
        Returns: boolean;
      };
      is_active_professional_for_role: {
        Args: { target_client: string; target_role: string };
        Returns: boolean;
      };
      add_chef_note: {
        Args: { p_client_id: string; p_meal_id: string; p_note: string };
        Returns: undefined;
      };
      edit_client_goal: {
        Args: { p_client_id: string; p_field: string; p_value: string };
        Returns: undefined;
      };
      queue_meal_adjustment: {
        Args: { p_client_id: string; p_note: string };
        Returns: undefined;
      };
      revert_professional_edit: {
        Args: { p_edit_id: string };
        Returns: undefined;
      };
    };
    Enums: Record<string, never>;
  };
}
