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
export type SubscriptionTier = 'trial' | 'standard' | 'chef_premium' | 'canceled';
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
          onboarding_completed: boolean;
          chef_access_enabled: boolean;
          auto_order_enabled: boolean;
          preferred_delivery_day: string | null;
          instacart_store_preference: string | null;
          push_token: string | null;
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
        Insert: { user_id: string };
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
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
  };
}
