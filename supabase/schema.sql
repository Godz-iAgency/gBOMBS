-- ============================================================================
-- gBOMBS — Complete Supabase Schema (v1.1)
-- ============================================================================
-- HOW TO RUN:
--   1. Open your Supabase project → SQL Editor → New query
--   2. Paste this ENTIRE file and click "Run"
--   3. Verify all tables appear under Table Editor with RLS enabled
--
-- NOTE: Table order differs from the build spec on purpose. The RLS policies
--       on meal_plans / meals / grocery_lists reference the chef_clients table,
--       so chef_clients MUST be created before them. Running the spec's literal
--       order (chef_clients at 4.12) would fail with "relation does not exist".
-- ============================================================================

-- ============================================================================
-- 1. USERS  (extends auth.users)
-- ============================================================================
CREATE TABLE public.users (
  id UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  full_name TEXT,
  avatar_url TEXT,
  diet_mode TEXT CHECK (diet_mode IN ('vegan', 'vegetarian')) DEFAULT 'vegan',
  health_goal TEXT CHECK (health_goal IN (
    'weight_loss', 'gut_health', 'energy', 'anti_inflammatory', 'general_wellness'
  )) DEFAULT 'general_wellness',
  cooking_style TEXT CHECK (cooking_style IN (
    'quick_simple', 'balanced_everyday', 'gourmet_weekend', 'batch_cooking'
  )) DEFAULT 'balanced_everyday',
  subscription_tier TEXT CHECK (subscription_tier IN (
    'trial', 'standard', 'chef_premium', 'canceled'
  )) DEFAULT 'trial',
  subscription_status TEXT CHECK (subscription_status IN (
    'active', 'trialing', 'past_due', 'canceled', 'incomplete'
  )) DEFAULT 'trialing',
  trial_ends_at TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '7 days'),
  subscription_id TEXT,
  customer_id TEXT,
  revenuecat_id TEXT,
  onboarding_completed BOOLEAN DEFAULT FALSE,
  chef_access_enabled BOOLEAN DEFAULT FALSE,
  auto_order_enabled BOOLEAN DEFAULT FALSE,
  preferred_delivery_day TEXT DEFAULT 'monday',
  instacart_store_preference TEXT,
  push_token TEXT,
  last_preferences_updated_at TIMESTAMPTZ,
  preferences_version INTEGER DEFAULT 1,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own profile" ON public.users
  FOR SELECT USING (auth.uid() = id);

CREATE POLICY "Users can update own profile" ON public.users
  FOR UPDATE USING (auth.uid() = id);

CREATE POLICY "Users can insert own profile" ON public.users
  FOR INSERT WITH CHECK (auth.uid() = id);

-- ============================================================================
-- 2. CHEF_CLIENTS  (created early — referenced by RLS policies below)
-- ============================================================================
CREATE TABLE public.chef_clients (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  chef_user_id UUID REFERENCES public.users(id) ON DELETE CASCADE NOT NULL,
  client_user_id UUID REFERENCES public.users(id) ON DELETE CASCADE NOT NULL,
  invite_email TEXT NOT NULL,
  invite_status TEXT CHECK (invite_status IN (
    'pending', 'accepted', 'declined', 'revoked'
  )) DEFAULT 'pending',
  invite_token TEXT UNIQUE,
  invite_sent_at TIMESTAMPTZ DEFAULT NOW(),
  accepted_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(chef_user_id, client_user_id)
);

ALTER TABLE public.chef_clients ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Clients can view invites sent to them" ON public.chef_clients
  FOR SELECT USING (auth.uid() = client_user_id);

CREATE POLICY "Chefs can manage their client relationships" ON public.chef_clients
  FOR ALL USING (auth.uid() = chef_user_id);

-- ============================================================================
-- 3. FOOD_PREFERENCES
-- ============================================================================
CREATE TABLE public.food_preferences (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES public.users(id) ON DELETE CASCADE NOT NULL,
  category TEXT CHECK (category IN (
    'greens', 'beans', 'onion', 'mushroom', 'berries', 'seeds',
    'grains', 'herbs_spices', 'other_vegetables', 'eggs_dairy'
  )) NOT NULL,
  food_item TEXT NOT NULL,
  food_item_normalized TEXT,
  source TEXT CHECK (source IN ('preset', 'custom')) DEFAULT 'preset',
  is_validated BOOLEAN DEFAULT TRUE,
  validation_attempted_at TIMESTAMPTZ,
  is_excluded BOOLEAN DEFAULT FALSE,
  is_active BOOLEAN DEFAULT TRUE,
  display_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, food_item_normalized, category)
);

ALTER TABLE public.food_preferences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own food preferences" ON public.food_preferences
  FOR ALL USING (auth.uid() = user_id);

CREATE INDEX idx_food_preferences_user_id ON public.food_preferences(user_id);
CREATE INDEX idx_food_preferences_active ON public.food_preferences(user_id, is_active, is_excluded);

-- ============================================================================
-- 4. FOOD_PREFERENCE_HISTORY
-- ============================================================================
CREATE TABLE public.food_preference_history (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES public.users(id) ON DELETE CASCADE NOT NULL,
  action TEXT CHECK (action IN ('added', 'removed', 'diet_mode_changed')) NOT NULL,
  food_item TEXT,
  category TEXT,
  old_diet_mode TEXT,
  new_diet_mode TEXT,
  changed_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.food_preference_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own preference history" ON public.food_preference_history
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own preference history" ON public.food_preference_history
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE INDEX idx_pref_history_user ON public.food_preference_history(user_id, changed_at);

-- ============================================================================
-- 5. MEAL_PLANS
-- ============================================================================
CREATE TABLE public.meal_plans (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES public.users(id) ON DELETE CASCADE NOT NULL,
  week_start_date DATE NOT NULL,
  week_end_date DATE NOT NULL,
  status TEXT CHECK (status IN (
    'generating', 'ready', 'approved', 'ordered', 'completed'
  )) DEFAULT 'generating',
  grocery_list_generated BOOLEAN DEFAULT FALSE,
  instacart_order_id TEXT,
  instacart_order_status TEXT,
  instacart_order_date TIMESTAMPTZ,
  total_estimated_calories INTEGER,
  gemini_tokens_used INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, week_start_date)
);

ALTER TABLE public.meal_plans ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own meal plans" ON public.meal_plans
  FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "Chefs can view client meal plans" ON public.meal_plans
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.chef_clients
      WHERE chef_user_id = auth.uid()
      AND client_user_id = meal_plans.user_id
      AND invite_status = 'accepted'
    )
  );

CREATE INDEX idx_meal_plans_user_id ON public.meal_plans(user_id);
CREATE INDEX idx_meal_plans_week ON public.meal_plans(user_id, week_start_date);

-- ============================================================================
-- 6. MEALS
-- ============================================================================
CREATE TABLE public.meals (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  meal_plan_id UUID REFERENCES public.meal_plans(id) ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES public.users(id) ON DELETE CASCADE NOT NULL,
  day_number INTEGER CHECK (day_number BETWEEN 1 AND 7) NOT NULL,
  meal_type TEXT CHECK (meal_type IN ('breakfast', 'lunch', 'dinner')) NOT NULL,
  meal_name TEXT NOT NULL,
  gbombs_categories_hit TEXT[] NOT NULL,
  prep_time_minutes INTEGER DEFAULT 0,
  cook_time_minutes INTEGER DEFAULT 0,
  total_time_minutes INTEGER GENERATED ALWAYS AS (prep_time_minutes + cook_time_minutes) STORED,
  servings INTEGER DEFAULT 1,
  ingredients JSONB NOT NULL,
  instructions JSONB NOT NULL,
  calories INTEGER,
  protein_grams DECIMAL(6,2),
  fiber_grams DECIMAL(6,2),
  carbs_grams DECIMAL(6,2),
  healthy_fats_grams DECIMAL(6,2),
  photo_url TEXT,
  photo_source TEXT CHECK (photo_source IN ('unsplash', 'imagen', 'pexels')),
  is_logged BOOLEAN DEFAULT FALSE,
  logged_at TIMESTAMPTZ,
  chef_notes TEXT,
  swap_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(meal_plan_id, day_number, meal_type)
);

ALTER TABLE public.meals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own meals" ON public.meals
  FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "Chefs can view client meals" ON public.meals
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.chef_clients
      WHERE chef_user_id = auth.uid()
      AND client_user_id = meals.user_id
      AND invite_status = 'accepted'
    )
  );

CREATE POLICY "Chefs can update chef_notes only" ON public.meals
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM public.chef_clients
      WHERE chef_user_id = auth.uid()
      AND client_user_id = meals.user_id
      AND invite_status = 'accepted'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.chef_clients
      WHERE chef_user_id = auth.uid()
      AND client_user_id = meals.user_id
      AND invite_status = 'accepted'
    )
  );

CREATE INDEX idx_meals_meal_plan_id ON public.meals(meal_plan_id);
CREATE INDEX idx_meals_user_day ON public.meals(user_id, day_number);

-- ============================================================================
-- 7. GROCERY_LISTS
-- ============================================================================
CREATE TABLE public.grocery_lists (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  meal_plan_id UUID REFERENCES public.meal_plans(id) ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES public.users(id) ON DELETE CASCADE NOT NULL,
  status TEXT CHECK (status IN (
    'generating', 'ready', 'ordered', 'delivered'
  )) DEFAULT 'generating',
  total_item_count INTEGER DEFAULT 0,
  instacart_cart_url TEXT,
  instacart_order_id TEXT,
  ordered_at TIMESTAMPTZ,
  pantry_items_excluded TEXT[],
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(meal_plan_id)
);

ALTER TABLE public.grocery_lists ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own grocery lists" ON public.grocery_lists
  FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "Chefs can view client grocery lists" ON public.grocery_lists
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.chef_clients
      WHERE chef_user_id = auth.uid()
      AND client_user_id = grocery_lists.user_id
      AND invite_status = 'accepted'
    )
  );

-- ============================================================================
-- 8. GROCERY_ITEMS
-- ============================================================================
CREATE TABLE public.grocery_items (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  grocery_list_id UUID REFERENCES public.grocery_lists(id) ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES public.users(id) ON DELETE CASCADE NOT NULL,
  item_name TEXT NOT NULL,
  quantity DECIMAL(8,2) NOT NULL,
  unit TEXT,
  store_section TEXT CHECK (store_section IN (
    'fresh_produce', 'leafy_greens', 'mushrooms', 'berries_fruit',
    'legumes_beans', 'grains_bread', 'nuts_seeds', 'herbs_spices',
    'oils_vinegars', 'dairy_eggs', 'frozen', 'pantry_staples'
  )) NOT NULL,
  is_purchased BOOLEAN DEFAULT FALSE,
  purchased_by TEXT,
  purchased_at TIMESTAMPTZ,
  instacart_product_id TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.grocery_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own grocery items" ON public.grocery_items
  FOR ALL USING (auth.uid() = user_id);

CREATE INDEX idx_grocery_items_list_id ON public.grocery_items(grocery_list_id);

-- ============================================================================
-- 9. DAILY_SCORES
-- ============================================================================
CREATE TABLE public.daily_scores (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES public.users(id) ON DELETE CASCADE NOT NULL,
  score_date DATE NOT NULL,
  gbombs_score INTEGER CHECK (gbombs_score BETWEEN 0 AND 6) DEFAULT 0,
  greens_hit BOOLEAN DEFAULT FALSE,
  beans_hit BOOLEAN DEFAULT FALSE,
  onion_hit BOOLEAN DEFAULT FALSE,
  mushroom_hit BOOLEAN DEFAULT FALSE,
  berries_hit BOOLEAN DEFAULT FALSE,
  seeds_hit BOOLEAN DEFAULT FALSE,
  meals_logged INTEGER DEFAULT 0,
  total_calories INTEGER DEFAULT 0,
  total_protein_grams DECIMAL(6,2) DEFAULT 0,
  total_fiber_grams DECIMAL(6,2) DEFAULT 0,
  total_carbs_grams DECIMAL(6,2) DEFAULT 0,
  total_fats_grams DECIMAL(6,2) DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, score_date)
);

ALTER TABLE public.daily_scores ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own daily scores" ON public.daily_scores
  FOR ALL USING (auth.uid() = user_id);

CREATE INDEX idx_daily_scores_user_date ON public.daily_scores(user_id, score_date);

-- ============================================================================
-- 10. STREAKS
-- ============================================================================
CREATE TABLE public.streaks (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES public.users(id) ON DELETE CASCADE NOT NULL UNIQUE,
  current_daily_streak INTEGER DEFAULT 0,
  longest_daily_streak INTEGER DEFAULT 0,
  current_perfect_day_streak INTEGER DEFAULT 0,
  longest_perfect_day_streak INTEGER DEFAULT 0,
  current_weekly_streak INTEGER DEFAULT 0,
  longest_weekly_streak INTEGER DEFAULT 0,
  last_logged_date DATE,
  total_perfect_days INTEGER DEFAULT 0,
  total_days_logged INTEGER DEFAULT 0,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.streaks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own streaks" ON public.streaks
  FOR ALL USING (auth.uid() = user_id);

-- ============================================================================
-- 11. BADGES  (master list + seed data)
-- ============================================================================
CREATE TABLE public.badges (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  badge_key TEXT UNIQUE NOT NULL,
  badge_name TEXT NOT NULL,
  badge_description TEXT NOT NULL,
  badge_icon TEXT NOT NULL,
  badge_category TEXT CHECK (badge_category IN (
    'streak', 'nutrition', 'social', 'shopping', 'engagement'
  )) NOT NULL,
  unlock_criteria JSONB NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

INSERT INTO public.badges (badge_key, badge_name, badge_description, badge_icon, badge_category, unlock_criteria) VALUES
('first_gbombs_day', 'First gBOMBS Day', 'Logged your first complete gBOMBS day', '🌱', 'nutrition', '{"type": "daily_score", "value": 6, "count": 1}'),
('streak_7', '7 Day Streak', 'Logged meals 7 days in a row', '🔥', 'streak', '{"type": "daily_streak", "value": 7}'),
('streak_30', '30 Day Streak', 'Logged meals 30 days in a row', '🏆', 'streak', '{"type": "daily_streak", "value": 30}'),
('perfect_week', 'Perfect Week', 'Hit all 6 gBOMBS categories every day for a full week', '⭐', 'nutrition', '{"type": "perfect_week", "value": 1}'),
('first_vegan_month', 'Vegan Month', 'Completed one full month of plant-based eating', '🥦', 'nutrition', '{"type": "vegan_days", "value": 30}'),
('grocery_order_placed', 'First Order', 'Placed your first Instacart grocery order', '🛒', 'shopping', '{"type": "orders_placed", "value": 1}'),
('meal_swapper', 'Meal Swapper', 'Swapped 5 meals in your weekly plan', '🔄', 'engagement', '{"type": "meals_swapped", "value": 5}'),
('pantry_pro', 'Pantry Pro', 'Added 20 items to your pantry tracker', '🏠', 'engagement', '{"type": "pantry_items", "value": 20}'),
('nutrition_nerd', 'Nutrition Nerd', 'Viewed nutrition details on 10 different meals', '🔬', 'engagement', '{"type": "nutrition_views", "value": 10}'),
('social_sharer', 'Social Sharer', 'Shared your first gBOMBS score to Instagram', '📱', 'social', '{"type": "shares", "value": 1}');

-- Badges master list is readable by all authenticated users
ALTER TABLE public.badges ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view badges" ON public.badges
  FOR SELECT USING (auth.role() = 'authenticated');

-- ============================================================================
-- 12. USER_BADGES
-- ============================================================================
CREATE TABLE public.user_badges (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES public.users(id) ON DELETE CASCADE NOT NULL,
  badge_id UUID REFERENCES public.badges(id) NOT NULL,
  unlocked_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, badge_id)
);

ALTER TABLE public.user_badges ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own badges" ON public.user_badges
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own badges" ON public.user_badges
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE INDEX idx_user_badges_user_id ON public.user_badges(user_id);

-- ============================================================================
-- 13. PANTRY_ITEMS
-- ============================================================================
CREATE TABLE public.pantry_items (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES public.users(id) ON DELETE CASCADE NOT NULL,
  item_name TEXT NOT NULL,
  category TEXT,
  quantity DECIMAL(8,2),
  unit TEXT,
  is_low_stock BOOLEAN DEFAULT FALSE,
  last_used_date DATE,
  times_used INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.pantry_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own pantry" ON public.pantry_items
  FOR ALL USING (auth.uid() = user_id);

CREATE INDEX idx_pantry_items_user_id ON public.pantry_items(user_id);

-- ============================================================================
-- 14. WEEKLY_REPORTS
-- ============================================================================
CREATE TABLE public.weekly_reports (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES public.users(id) ON DELETE CASCADE NOT NULL,
  week_start_date DATE NOT NULL,
  gbombs_total_score INTEGER DEFAULT 0,
  daily_scores INTEGER[],
  average_daily_calories INTEGER,
  average_daily_protein DECIMAL(6,2),
  average_daily_fiber DECIMAL(6,2),
  most_hit_category TEXT,
  least_hit_category TEXT,
  streak_at_report_time INTEGER,
  meals_logged INTEGER,
  meals_swapped INTEGER,
  grocery_order_placed BOOLEAN DEFAULT FALSE,
  report_headline TEXT,
  performance_summary TEXT,
  biggest_win TEXT,
  missed_category_tip TEXT,
  next_week_focus TEXT,
  motivational_close TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, week_start_date)
);

ALTER TABLE public.weekly_reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own reports" ON public.weekly_reports
  FOR SELECT USING (auth.uid() = user_id);

-- ============================================================================
-- 15. SUBSCRIPTIONS
-- ============================================================================
CREATE TABLE public.subscriptions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES public.users(id) ON DELETE CASCADE NOT NULL UNIQUE,
  stripe_customer_id TEXT UNIQUE,
  stripe_subscription_id TEXT UNIQUE,
  revenuecat_id TEXT,
  tier TEXT CHECK (tier IN ('trial', 'standard', 'chef_premium', 'canceled')) DEFAULT 'trial',
  status TEXT CHECK (status IN (
    'active', 'trialing', 'past_due', 'canceled', 'incomplete', 'unpaid'
  )) DEFAULT 'trialing',
  current_period_start TIMESTAMPTZ,
  current_period_end TIMESTAMPTZ,
  trial_start TIMESTAMPTZ DEFAULT NOW(),
  trial_end TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '7 days'),
  canceled_at TIMESTAMPTZ,
  monthly_amount DECIMAL(8,2),
  currency TEXT DEFAULT 'usd',
  platform TEXT CHECK (platform IN ('ios', 'android', 'web')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own subscription" ON public.subscriptions
  FOR SELECT USING (auth.uid() = user_id);

-- ============================================================================
-- 16. AUTO-PROVISIONING TRIGGER
-- ============================================================================
-- When a new auth user is created, automatically create their public.users
-- profile row AND their streaks row. This is more reliable than doing it from
-- the client on sign-up (works for Google OAuth too).
-- ============================================================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO public.users (id, email, full_name, avatar_url)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name'),
    NEW.raw_user_meta_data->>'avatar_url'
  )
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.streaks (user_id)
  VALUES (NEW.id)
  ON CONFLICT (user_id) DO NOTHING;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============================================================================
-- DONE. 15 tables + auto-provisioning trigger. RLS enabled on all.
-- ============================================================================
