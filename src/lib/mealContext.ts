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
