/**
 * Builds the personalization context the AI prompts need, from Supabase.
 * ------------------------------------------------------------------
 * Keeps the gemini/ service pure (it just takes a UserMealContext) — all the
 * database reading lives here. Pulls the user's diet/goal/style from `users`
 * and their food likes/exclusions from `food_preferences`.
 */

import { supabase } from './supabase';
import type { UserMealContext } from '@/services/gemini';

export async function buildUserMealContext(
  userId: string
): Promise<UserMealContext> {
  // Profile basics (diet mode, goal, cooking style).
  const { data: profile, error: profileErr } = await supabase
    .from('users')
    .select('diet_mode, health_goal, cooking_style')
    .eq('id', userId)
    .single();

  if (profileErr || !profile) {
    throw new Error(
      profileErr?.message ?? 'Could not load your profile for meal planning.'
    );
  }

  // Food preferences: active likes vs. exclusions.
  const { data: prefs } = await supabase
    .from('food_preferences')
    .select('food_item, is_excluded, is_active')
    .eq('user_id', userId);

  const preferredFoods: string[] = [];
  const excludedFoods: string[] = [];
  for (const p of prefs ?? []) {
    if (p.is_excluded) {
      excludedFoods.push(p.food_item);
    } else if (p.is_active) {
      preferredFoods.push(p.food_item);
    }
  }

  return {
    dietMode: profile.diet_mode,
    healthGoal: profile.health_goal,
    cookingStyle: profile.cooking_style,
    preferredFoods,
    excludedFoods,
  };
}

/**
 * Same context, but for a PROFESSIONAL viewing a connected client (Step 11).
 * ------------------------------------------------------------------
 * A chef/trainer can't read the client's `users` row directly (RLS only exposes
 * the safe subset via the get_client_profile RPC), so buildUserMealContext()
 * would throw for them. This variant pulls diet/goal/style through that RPC and
 * reads food_preferences directly (RLS grants an active professional SELECT on a
 * connected client's prefs). The resulting recipe respects the CLIENT's plan.
 */
export async function buildClientMealContext(
  clientId: string
): Promise<UserMealContext> {
  // Profile basics through the security-definer RPC.
  const { data: profile, error: profileErr } = await supabase.rpc(
    'get_client_profile',
    { p_client_id: clientId }
  );
  if (profileErr || !profile) {
    throw new Error(
      profileErr?.message ?? 'Could not load the client profile for this recipe.'
    );
  }
  const p = profile as unknown as {
    diet_mode: string;
    health_goal: string;
    cooking_style: string;
  };

  // Food preferences (RLS allows an active professional to read these).
  const { data: prefs } = await supabase
    .from('food_preferences')
    .select('food_item, is_excluded, is_active')
    .eq('user_id', clientId);

  const preferredFoods: string[] = [];
  const excludedFoods: string[] = [];
  for (const fp of prefs ?? []) {
    if (fp.is_excluded) {
      excludedFoods.push(fp.food_item);
    } else if (fp.is_active) {
      preferredFoods.push(fp.food_item);
    }
  }

  return {
    dietMode: p.diet_mode,
    healthGoal: p.health_goal,
    cookingStyle: p.cooking_style,
    preferredFoods,
    excludedFoods,
  };
}
