/**
 * USDA nutrition lookup (client side).
 * ------------------------------------------------------------------
 * Thin wrapper over the `usda-nutrition` Edge Function, which holds the USDA
 * key server-side and does the FoodData Central search + gram scaling. We pass
 * the recipe's ingredients and servings; it returns per-serving macros.
 *
 * Best-effort: nutrition is a nice-to-have that streams in after the recipe
 * renders, so this returns null on any failure rather than throwing — the UI
 * shows a soft "couldn't estimate" state instead of an error.
 */

import { supabase } from '@/lib/supabase';
import type { RecipeIngredient, RecipeNutrition } from '@/services/gemini';

/** Bump whenever supabase/functions/usda-nutrition's matching/scaling logic
 *  changes meaningfully, so cached recipes (recipeCache.ts never expires them)
 *  don't keep showing numbers computed by an older, buggy version forever. */
export const NUTRITION_VERSION = 2;

export async function fetchRecipeNutrition(
  ingredients: RecipeIngredient[],
  servings: number
): Promise<RecipeNutrition | null> {
  if (!ingredients.length) return null;

  try {
    const { data, error } = await supabase.functions.invoke('usda-nutrition', {
      body: {
        ingredients: ingredients.map((i) => ({
          item: i.item,
          quantity: i.quantity,
          // Feeds the server's category-aware gram conversion (a "cup" of
          // greens weighs nowhere near a "cup" of oil or seeds).
          category: i.category,
        })),
        servings,
      },
    });
    if (error || !data || (data as { error?: string }).error) return null;

    const d = data as {
      perServing?: {
        calories?: number;
        protein?: number;
        carbs?: number;
        fat?: number;
        fiber?: number;
      };
      matched?: number;
      total?: number;
      estimated?: boolean;
    };
    if (!d.perServing) return null;

    return {
      calories: d.perServing.calories ?? 0,
      protein: d.perServing.protein ?? 0,
      carbs: d.perServing.carbs ?? 0,
      fat: d.perServing.fat ?? 0,
      fiber: d.perServing.fiber ?? 0,
      matched: d.matched ?? 0,
      total: d.total ?? ingredients.length,
      estimated: d.estimated ?? true,
      nutritionVersion: NUTRITION_VERSION,
    };
  } catch {
    return null;
  }
}
