/**
 * gBOMBS Gemini AI service — public entry point.
 * ------------------------------------------------------------------
 * Re-exports the client, types, and prompt helpers, and hosts the food
 * validation prompt (Prompt 8). Future prompts (meal plan, recipe, grocery,
 * smoothie, swap, check-in) live in sibling files and are re-exported here so
 * everything is reachable from `@/services/gemini`.
 */

export * from './types';
export * from './client';
export { FUHRMAN_SYSTEM_PROMPT, renderUserContext } from './prompts';
export {
  generateWeeklyMealPlan,
  computeWeeklyScore,
  computeDayScore,
} from './mealPlan';
export {
  generateRecipe,
  computeRecipeScore,
  type RecipeRequest,
} from './recipe';
export { generateGroceryList } from './grocery';

import { callGeminiJson, getModel, isAiConfigured } from './client';

export type FoodValidationResult = {
  valid: boolean;
  reason: string;
  suggested_alternative: string;
  /** True when we skipped the API (no key / failure) and accepted by default. */
  skipped?: boolean;
};

/**
 * Validate a custom food against a gBOMBS category using Gemini (Prompt 8).
 *
 * Always runs on Flash (validation is a flash-only task — cheap + deterministic),
 * so tier is irrelevant here. Runs AFTER the local isBlockedFood() check. If no
 * key is configured or the call fails, we DO NOT block the user — we accept the
 * food and flag `skipped: true` so the caller can mark it unvalidated.
 */
export async function validateCustomFood(
  foodItem: string,
  category: string,
  dietMode: string
): Promise<FoodValidationResult> {
  if (!isAiConfigured()) {
    return { valid: true, reason: '', suggested_alternative: '', skipped: true };
  }

  const prompt = `
You are a whole food nutrition validator for the gBOMBS system.

gBOMBS CATEGORIES AND WHAT QUALIFIES:
- greens: leafy green vegetables only (kale, spinach, arugula, collards, bok choy, swiss chard, romaine, watercress, microgreens, etc.)
- beans: all legumes, pulses, and soy products (lentils, chickpeas, black beans, kidney beans, edamame, split peas, mung beans, etc.)
- onion: allium family only (onion, garlic, leeks, shallots, chives, scallions, escallion, ramps, etc.)
- mushroom: all edible fungi (portobello, shiitake, cremini, oyster, button, maitake, lion's mane, reishi, etc.)
- berries: all berries and small fruits (blueberries, raspberries, strawberries, blackberries, goji, acai, cranberries, elderberries, etc.)
- seeds: all raw nuts and seeds (chia, flax, hemp, pumpkin seeds, sunflower seeds, walnuts, almonds, cashews, brazil nuts, pecans, pine nuts, sesame, quinoa, etc.)

VALIDATION RULES:
1. The food must be a whole, unprocessed food. No refined products, no sauces, no packaged foods.
2. The food must belong specifically to the category being checked.
3. If diet_mode is 'vegan': reject eggs, dairy, meat, fish, and all animal products.
4. If diet_mode is 'vegetarian': eggs and cheese are allowed in the eggs_dairy category ONLY. Reject meat and fish.
5. Reject anything that is processed, refined, artificial, or a prepared dish.
6. When in doubt, reject.

FOOD TO VALIDATE:
- Food Item: "${foodItem}"
- Category Being Added To: "${category}"
- Diet Mode: "${dietMode}"

Return ONLY valid JSON. No explanation. No markdown.

{
  "valid": true or false,
  "reason": "one sentence explanation if invalid, empty string if valid",
  "suggested_alternative": "suggest a similar valid food if invalid, empty string if valid"
}`;

  try {
    const parsed = await callGeminiJson<{
      valid: boolean;
      reason?: string;
      suggested_alternative?: string;
    }>(getModel('validation', 'standard'), prompt, {
      temperature: 0.1,
      maxOutputTokens: 150,
    });

    return {
      valid: Boolean(parsed.valid),
      reason: parsed.reason ?? '',
      suggested_alternative: parsed.suggested_alternative ?? '',
    };
  } catch {
    // Network/parse/no-key failure → don't hard-block the user.
    return { valid: true, reason: '', suggested_alternative: '', skipped: true };
  }
}
