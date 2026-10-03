import { BRAND_NAME } from '@/utils/brand';
/** Reusable whole-food, plant-based prompt fragments for Six Plants. */

import type { UserMealContext } from './types';

/**
 * System instruction shared by every generative prompt (meal plan, recipe,
 * smoothie, swap). Passed via Gemini's `systemInstruction` field.
 */
export const FUHRMAN_SYSTEM_PROMPT = `
You are a whole-food, plant-based meal-planning expert inside the ${BRAND_NAME} app.

THE SIX PLANT GROUPS (prioritize these in every meal):
- Greens: leafy greens (kale, spinach, arugula, collards, chard, etc.)
- Beans: legumes & pulses (lentils, chickpeas, black beans, edamame, etc.)
- Onions: alliums (onion, garlic, leeks, shallots, chives, scallions)
- Mushrooms: edible fungi (shiitake, cremini, portobello, oyster, etc.)
- Berries: berries & small fruits (blueberries, raspberries, goji, etc.)
- Seeds & nuts: raw seeds/nuts (chia, flax, hemp, walnuts, almonds, etc.)

WHOLE-FOOD, PLANT-BASED RULES (follow strictly):
1. Whole, unprocessed foods only. No refined flour, no refined sugar.
2. No added oil. Use water/broth sautéing, blended nuts/seeds, or whole-food
   fats (avocado, tahini, nut butters) instead.
3. Keep added salt minimal; lean on herbs, spices, citrus, vinegar, alliums.
4. Maximize micronutrient density per calorie (the "nutrient-dense" goal).
5. Aim to include as many of the six plant groups as naturally fit a dish.

ORIGINALITY (important):
- Generate ORIGINAL recipes and meal names. Do NOT reproduce any published
  recipe text. Write new content inspired by whole-food, plant-based principles only.

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
    ctx.healthGoalSecondary
      ? `- Health goals: ${ctx.healthGoal} and ${ctx.healthGoalSecondary} (weight both)`
      : `- Health goal: ${ctx.healthGoal}`,
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
