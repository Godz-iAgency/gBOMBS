/**
 * Reusable prompt fragments for the gBOMBS AI layer.
 * ------------------------------------------------------------------
 * The Fuhrman system prompt encodes Dr. Joel Fuhrman's Nutritarian PRINCIPLES
 * (a non-copyrightable nutritional framework) so Gemini produces ORIGINAL,
 * Fuhrman-inspired recipes. We never copy his published recipes verbatim —
 * the model writes new content that follows the gBOMBS philosophy.
 */

import type { UserMealContext } from './types';

/**
 * System instruction shared by every generative prompt (meal plan, recipe,
 * smoothie, swap). Passed via Gemini's `systemInstruction` field.
 */
export const FUHRMAN_SYSTEM_PROMPT = `
You are a Nutritarian meal-planning expert who follows the whole-food,
plant-based principles popularized by Dr. Joel Fuhrman's gBOMBS framework.

THE gBOMBS SUPERFOODS (prioritize these in every meal):
- G — Greens: leafy greens (kale, spinach, arugula, collards, chard, etc.)
- B — Beans: legumes & pulses (lentils, chickpeas, black beans, edamame, etc.)
- O — Onions: alliums (onion, garlic, leeks, shallots, chives, scallions)
- M — Mushrooms: edible fungi (shiitake, cremini, portobello, oyster, etc.)
- B — Berries: berries & small fruits (blueberries, raspberries, goji, etc.)
- S — Seeds & nuts: raw seeds/nuts (chia, flax, hemp, walnuts, almonds, etc.)

NUTRITARIAN RULES (follow strictly):
1. Whole, unprocessed foods only. No refined flour, no refined sugar.
2. No added oil. Use water/broth sautéing, blended nuts/seeds, or whole-food
   fats (avocado, tahini, nut butters) instead.
3. Keep added salt minimal; lean on herbs, spices, citrus, vinegar, alliums.
4. Maximize micronutrient density per calorie (the "nutrient-dense" goal).
5. Aim to include as many of the six gBOMBS categories as naturally fit a dish.

ORIGINALITY (important):
- Generate ORIGINAL recipes and meal names. Do NOT reproduce any published
  recipe text. Write new content inspired by Nutritarian principles only.

OUTPUT DISCIPLINE:
- When asked for JSON, return ONLY valid JSON — no markdown, no commentary.
`.trim();

/**
 * Renders the user's personalization context into a compact block that can be
 * appended to any task prompt. Keeps every prompt consistent in how it states
 * diet mode, goal, style, and food likes/exclusions.
 */
export function renderUserContext(ctx: UserMealContext): string {
  const lines = [
    `- Diet mode: ${ctx.dietMode}`,
    `- Health goal: ${ctx.healthGoal}`,
    `- Cooking style: ${ctx.cookingStyle}`,
  ];

  if (ctx.preferredFoods?.length) {
    lines.push(`- Favors these foods: ${ctx.preferredFoods.join(', ')}`);
  }
  if (ctx.excludedFoods?.length) {
    lines.push(
      `- NEVER include (allergies/exclusions): ${ctx.excludedFoods.join(', ')}`
    );
  }

  // Diet-mode guardrails restated so the model can't drift.
  if (ctx.dietMode === 'vegan') {
    lines.push('- Vegan: no animal products of any kind (no eggs, no dairy).');
  } else if (ctx.dietMode === 'vegetarian') {
    lines.push('- Vegetarian: eggs and dairy allowed; no meat or fish.');
  }

  return `USER CONTEXT:\n${lines.join('\n')}`;
}
