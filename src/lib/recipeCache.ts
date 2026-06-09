/**
 * Local cache for generated recipes.
 * ------------------------------------------------------------------
 * Generating a recipe costs an API call, so once a meal's recipe is created we
 * keep it in AsyncStorage keyed by user + meal id. Re-opening the same meal is
 * then instant and free. Cleared implicitly when a new plan overwrites meals
 * (their ids change), so stale recipes don't pile up meaningfully.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Recipe } from '@/services/gemini';

const KEY_PREFIX = 'gbombs_recipe_v1_';
const keyFor = (userId: string, mealId: string) =>
  `${KEY_PREFIX}${userId}_${mealId}`;

export async function loadCachedRecipe(
  userId: string,
  mealId: string
): Promise<Recipe | null> {
  try {
    const raw = await AsyncStorage.getItem(keyFor(userId, mealId));
    return raw ? (JSON.parse(raw) as Recipe) : null;
  } catch {
    return null;
  }
}

export async function saveCachedRecipe(
  userId: string,
  mealId: string,
  recipe: Recipe
): Promise<void> {
  try {
    await AsyncStorage.setItem(keyFor(userId, mealId), JSON.stringify(recipe));
  } catch {
    // non-fatal
  }
}
