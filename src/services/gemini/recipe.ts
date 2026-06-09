/**
 * Prompt 2 — Recipe Card Generator (+ gBOMBS scoring, Prompt 3).
 * ------------------------------------------------------------------
 * Turns a meal from the weekly plan into a full, original Fuhrman-inspired
 * recipe: ingredients (tagged by gBOMBS category), steps, times, and a
 * Nutritarian tip. The gBOMBS score is derived from the ingredient tags so the
 * score always reflects what's actually in the dish.
 */

import { callGeminiJson, getModel } from './client';
import { FUHRMAN_SYSTEM_PROMPT, renderUserContext } from './prompts';
import type {
  GBombsCategory,
  GBombsScore,
  MealSlot,
  Recipe,
  RecipeIngredient,
  UserMealContext,
} from './types';

const VALID_CATEGORIES: GBombsCategory[] = [
  'greens',
  'beans',
  'onion',
  'mushroom',
  'berries',
  'seeds',
];

function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

function normalizeCategory(input: unknown): GBombsCategory | null {
  const v = String(input ?? '').toLowerCase() as GBombsCategory;
  return VALID_CATEGORIES.includes(v) ? v : null;
}

/** Derive a gBOMBS score from the categories present in the ingredients. */
export function computeRecipeScore(ingredients: RecipeIngredient[]): GBombsScore {
  const set = new Set<GBombsCategory>();
  for (const ing of ingredients) {
    if (ing.category) set.add(ing.category);
  }
  return { categoriesHit: [...set], score: set.size, total: 6 };
}

interface RawIngredient {
  item?: string;
  quantity?: string;
  category?: unknown;
}
interface RawRecipe {
  name?: string;
  description?: string;
  servings?: number;
  prepMinutes?: number;
  cookMinutes?: number;
  ingredients?: RawIngredient[];
  steps?: unknown;
  tips?: string;
}

/** Minimal info about the meal we're expanding into a full recipe. */
export interface RecipeRequest {
  id: string;
  name: string;
  description?: string;
  /** Drives prompt selection — smoothies get a blend-only recipe. */
  slot?: MealSlot;
}

/**
 * Generate a full recipe for a meal. Throws on no provider / parse failure so
 * the recipe screen can show a retry state.
 */
export async function generateRecipe(
  meal: RecipeRequest,
  ctx: UserMealContext,
  tier: string
): Promise<Recipe> {
  const isSmoothie = meal.slot === 'smoothie';
  const model = getModel(isSmoothie ? 'smoothie' : 'recipe', tier);
  const userBlock = renderUserContext(ctx);

  const dishPrompt = `Write a complete, original Nutritarian recipe for this dish.

DISH: "${meal.name}"${meal.description ? `\nDESCRIPTION: ${meal.description}` : ''}

${userBlock}

REQUIREMENTS:
- Stay true to the dish name above.
- No oil, no refined flour/sugar; use whole-food techniques (water/broth sauté,
  blended nuts/seeds, etc.).
- Tag each ingredient with its gBOMBS category if it is one of the six, else null.
- Steps should be clear and numbered in order.
- "tips" = one short Nutritarian insight about why this dish is healthful.

Return ONLY valid JSON in EXACTLY this shape — no markdown, no extra keys:
{
  "name": "${meal.name}",
  "description": "one appetizing sentence",
  "servings": 2,
  "prepMinutes": 10,
  "cookMinutes": 20,
  "ingredients": [
    { "item": "green lentils", "quantity": "1 cup", "category": "beans" },
    { "item": "olive oil", "quantity": "1 tbsp", "category": null }
  ],
  "steps": ["First step...", "Second step..."],
  "tips": "short nutrition note"
}

Use ONLY these category values (or null): greens, beans, onion, mushroom, berries, seeds.`;

  const smoothiePrompt = `Write a complete, original Nutritarian smoothie recipe.

SMOOTHIE: "${meal.name}"${meal.description ? `\nDESCRIPTION: ${meal.description}` : ''}

${userBlock}

REQUIREMENTS:
- Stay true to the smoothie name above. This is a blended drink — there is NO cooking.
- Whole foods only: no added oil, no refined sugar, no protein powders, no syrups.
  Sweeten only with whole fruit or dates.
- Build it like a real smoothie: a liquid base (plant milk, water, or coconut water),
  fruit (fresh or frozen), leafy greens, and seeds/nuts for healthy fat and creaminess.
- Tag each ingredient with its gBOMBS category if it is one of the six, else null.
- Steps describe BLENDING ONLY (add to blender, blend until smooth, pour, serve).
  Never sauté, roast, simmer, bake, or cook in any way.
- "cookMinutes" MUST be 0.
- "tips" = one short Nutritarian insight about why this smoothie is healthful.

Return ONLY valid JSON in EXACTLY this shape — no markdown, no extra keys:
{
  "name": "${meal.name}",
  "description": "one appetizing sentence",
  "servings": 2,
  "prepMinutes": 5,
  "cookMinutes": 0,
  "ingredients": [
    { "item": "frozen blueberries", "quantity": "1 cup", "category": "berries" },
    { "item": "baby spinach", "quantity": "1 large handful", "category": "greens" },
    { "item": "ground flaxseed", "quantity": "1 tbsp", "category": "seeds" },
    { "item": "unsweetened almond milk", "quantity": "1.5 cups", "category": null }
  ],
  "steps": [
    "Add all ingredients to a high-speed blender.",
    "Blend until completely smooth and creamy.",
    "Pour into glasses and serve immediately."
  ],
  "tips": "short nutrition note"
}

Use ONLY these category values (or null): greens, beans, onion, mushroom, berries, seeds.`;

  const raw = await callGeminiJson<RawRecipe>(
    model,
    isSmoothie ? smoothiePrompt : dishPrompt,
    {
      systemPrompt: FUHRMAN_SYSTEM_PROMPT,
      temperature: 0.6,
      maxOutputTokens: 4096,
    }
  );

  const ingredients: RecipeIngredient[] = (raw.ingredients ?? []).map((ri) => ({
    item: (ri.item ?? '').trim(),
    quantity: (ri.quantity ?? '').trim(),
    category: normalizeCategory(ri.category),
  }));

  const steps: string[] = Array.isArray(raw.steps)
    ? raw.steps.map((s) => String(s).trim()).filter(Boolean)
    : [];

  const name = (raw.name ?? meal.name).trim();

  return {
    id: meal.id || slugify(name),
    name,
    description: (raw.description ?? meal.description ?? '').trim(),
    servings:
      typeof raw.servings === 'number' && raw.servings > 0 ? raw.servings : 2,
    prepMinutes:
      typeof raw.prepMinutes === 'number' && raw.prepMinutes >= 0
        ? Math.round(raw.prepMinutes)
        : isSmoothie
          ? 5
          : 10,
    // Smoothies never cook — force 0 regardless of what the model returns.
    cookMinutes: isSmoothie
      ? 0
      : typeof raw.cookMinutes === 'number' && raw.cookMinutes >= 0
        ? Math.round(raw.cookMinutes)
        : 20,
    ingredients,
    steps,
    gbombs: computeRecipeScore(ingredients),
    tips: (raw.tips ?? '').trim() || undefined,
  };
}
