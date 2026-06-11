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

/** Canonical store sections, in shopping-path order (Prompt 4). */
export const GROCERY_SECTION_TITLES = [
  'Produce',
  'Beans & Proteins',
  'Whole Grains',
  'Nuts & Seeds',
  'Frozen',
  'Pantry',
  'Spices & Herbs',
  'Dairy Alternatives',
] as const;

export type GrocerySectionTitle = (typeof GROCERY_SECTION_TITLES)[number];

/** One line on the shopping list. `checked` is local UI state we persist. */
export interface GroceryItem {
  item: string;
  /** Real shopping units ("2 large bags", "3 cans (15 oz)"), not recipe units. */
  quantity: string;
  /** gBOMBS category if this item is one of the six, else null. */
  category: GBombsCategory | null;
  checked: boolean;
}

/** A store section of the list (empty sections are omitted). */
export interface GrocerySection {
  title: GrocerySectionTitle;
  items: GroceryItem[];
}

/** The consolidated weekly shopping list (Prompt 4 output). */
export interface GroceryList {
  /** ISO timestamp the list was generated. */
  generatedAt: string;
  /** `generatedAt` of the plan this list was built from (staleness check). */
  planGeneratedAt: string;
  /** Which model produced it (for debugging/telemetry). */
  modelUsed: string;
  sections: GrocerySection[];
}

/** Result of scoring a daily check-in (Prompt 6). */
export interface CheckInResult {
  /** ISO timestamp the check-in was scored. */
  scoredAt: string;
  /** Local calendar day (YYYY-MM-DD) this check-in counts for. */
  scoreDate: string;
  /** 0–6 — how many of the six gBOMBS categories were hit. */
  score: number;
  /** The categories detected in what the user ate. */
  categoriesHit: GBombsCategory[];
  /** How many distinct meals/items the user described. */
  mealsLogged: number;
  /** Warm, specific coaching summary of the day. */
  feedback: string;
  /** One concrete tip to hit a missed category tomorrow. */
  missedTip: string;
  /** The raw text the user logged (kept so we can show/edit it). */
  mealsText: string;
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
