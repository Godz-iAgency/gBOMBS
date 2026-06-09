/**
 * Shared types for the gBOMBS Gemini AI layer.
 * ------------------------------------------------------------------
 * Every prompt (meal plan, recipe, scoring, grocery, smoothie, swap,
 * check-in, validation) reads/writes these shapes so the whole AI system
 * speaks one consistent language. Individual prompt modules import from here.
 */

/** The six gBOMBS food categories (matches gbombsPresets + DB FoodCategory subset). */
export type GBombsCategory =
  | 'greens'
  | 'beans'
  | 'onion'
  | 'mushroom'
  | 'berries'
  | 'seeds';

/** Which AI tasks exist. Drives Flash vs Pro model selection (see client.ts). */
export type GeminiTask =
  | 'meal-plan'
  | 'recipe'
  | 'scoring'
  | 'grocery'
  | 'validation'
  | 'smoothie'
  | 'swap'
  | 'checkin';

/** A gBOMBS score for a single meal, recipe, or a whole day/week. */
export interface GBombsScore {
  /** Distinct categories present (deduped). */
  categoriesHit: GBombsCategory[];
  /** Number of the six categories hit (0–6). */
  score: number;
  /** Always 6 — the max possible. Kept explicit for UI ("4/6"). */
  total: number;
}

/** Where a meal sits in the day. */
export type MealSlot = 'breakfast' | 'lunch' | 'dinner' | 'smoothie';

/** Lightweight meal used in the weekly plan grid (no full recipe yet). */
export interface MealSummary {
  /** Stable slug id so the UI can request the full recipe on tap. */
  id: string;
  slot: MealSlot;
  name: string;
  /** One-line teaser shown on the meal card. */
  description: string;
  prepMinutes: number;
  /** gBOMBS categories this meal hits (for the colored icons on the card). */
  gbombs: GBombsCategory[];
}

/** One day of the weekly plan. */
export interface DayPlan {
  /** 1–7. */
  day: number;
  /** "Monday", "Tuesday", … */
  label: string;
  meals: MealSummary[];
}

/** The full AI-generated weekly meal plan (Prompt 1 output). */
export interface WeeklyMealPlan {
  /** ISO timestamp the plan was generated. */
  generatedAt: string;
  /** Which tier requested it (affects model + depth). */
  tierUsed: string;
  /** Which Gemini model produced it (for debugging/telemetry). */
  modelUsed: string;
  days: DayPlan[];
  /** Aggregate gBOMBS coverage across the week. */
  weeklyScore: GBombsScore;
}

/** One ingredient line in a recipe (Prompt 2) — also feeds the grocery list. */
export interface RecipeIngredient {
  item: string;
  /** Human-readable amount, e.g. "1 cup", "2 tbsp". */
  quantity: string;
  /** gBOMBS category if this ingredient is one of the six, else null. */
  category: GBombsCategory | null;
}

/** A full recipe card (Prompt 2 output). */
export interface Recipe {
  id: string;
  name: string;
  description: string;
  servings: number;
  prepMinutes: number;
  cookMinutes: number;
  ingredients: RecipeIngredient[];
  steps: string[];
  gbombs: GBombsScore;
  /** Optional Fuhrman-style nutrition note (richer on the Pro tier). */
  tips?: string;
}

/** Inputs that personalize generation, taken from the user's profile. */
export interface UserMealContext {
  dietMode: string; // 'vegan' | 'vegetarian'
  healthGoal: string; // weight_loss | gut_health | energy | ...
  cookingStyle: string; // quick_simple | balanced_everyday | ...
  /** Foods the user actively likes (from food_preferences). */
  preferredFoods?: string[];
  /** Foods to never include (allergies / exclusions). */
  excludedFoods?: string[];
}
