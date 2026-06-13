/**
 * Profile settings data layer.
 * ------------------------------------------------------------------
 * Reads/writes the editable profile fields the meal-plan + coach AI personalize
 * around: diet mode, health goal, cooking style (on `users`), and the food
 * favorites / exclusions (on `food_preferences`).
 *
 * Saving food preferences is a SYNC, not an append: the editors hand back the
 * full desired selection and we reconcile the DB to match — upserting what's
 * now selected and deleting rows the user turned off. (Onboarding only ever
 * inserted; editing has to handle removal too.)
 */

import { supabase } from './supabase';
import { normalizeFood } from '@/utils/foodValidation';
import { GBOMBS_PRESETS } from '@/utils/gbombsPresets';
import type { GBombsCategoryKey } from '@/utils/gbombsPresets';
import type {
  Database,
  DietMode,
  HealthGoal,
  CookingStyle,
} from '@/types/database.types';

type PrefRow = Database['public']['Tables']['food_preferences']['Insert'];

/** Exclusions aren't tied to a gBOMBS category — same bucket onboarding uses. */
const EXCLUSION_CATEGORY = 'other_vegetables';

/** Common allergens shown as quick-select chips (mirrors onboarding). */
export const COMMON_ALLERGENS = [
  'Peanuts', 'Tree nuts', 'Walnuts', 'Almonds', 'Cashews', 'Soy',
  'Gluten', 'Wheat', 'Sesame', 'Eggs', 'Dairy', 'Coconut',
  'Nightshades', 'Corn',
];

// ---- Profile basics + summary counts -------------------------------------

export interface ProfileSettings {
  dietMode: DietMode;
  healthGoal: HealthGoal;
  cookingStyle: CookingStyle;
  favoriteCount: number;
  avoidCount: number;
}

export async function loadProfileSettings(
  userId: string
): Promise<ProfileSettings> {
  const [{ data: u }, { data: prefs }] = await Promise.all([
    supabase
      .from('users')
      .select('diet_mode, health_goal, cooking_style')
      .eq('id', userId)
      .single(),
    supabase
      .from('food_preferences')
      .select('is_excluded, is_active')
      .eq('user_id', userId),
  ]);

  let favoriteCount = 0;
  let avoidCount = 0;
  for (const p of prefs ?? []) {
    if (p.is_excluded) avoidCount += 1;
    else if (p.is_active) favoriteCount += 1;
  }

  return {
    dietMode: (u?.diet_mode as DietMode) ?? 'vegan',
    healthGoal: (u?.health_goal as HealthGoal) ?? 'general_wellness',
    cookingStyle: (u?.cooking_style as CookingStyle) ?? 'balanced_everyday',
    favoriteCount,
    avoidCount,
  };
}

/** Update one profile field on `users`. Throws on failure. */
export async function updateUserField(
  userId: string,
  patch: Partial<{
    diet_mode: DietMode;
    health_goal: HealthGoal;
    cooking_style: CookingStyle;
  }>
): Promise<void> {
  const { error } = await supabase.from('users').update(patch).eq('id', userId);
  if (error) throw new Error(error.message);
}

// ---- Favorites (categorized) ---------------------------------------------

export interface CategoryState {
  chips: string[]; // presets first, then customs (render order)
  customs: Set<string>; // which chips are user-added
  selected: Set<string>; // currently-selected chip labels
}

export type FavoritesState = Record<GBombsCategoryKey, CategoryState>;

function emptyFavorites(): FavoritesState {
  const out = {} as FavoritesState;
  (Object.keys(GBOMBS_PRESETS) as GBombsCategoryKey[]).forEach((key) => {
    out[key] = {
      chips: [...GBOMBS_PRESETS[key]],
      customs: new Set(),
      selected: new Set(),
    };
  });
  return out;
}

/** Load the user's favorites into per-category chip state (presets + customs). */
export async function loadFavorites(userId: string): Promise<FavoritesState> {
  const state = emptyFavorites();

  const { data } = await supabase
    .from('food_preferences')
    .select('category, food_item, food_item_normalized, source, is_active')
    .eq('user_id', userId)
    .eq('is_excluded', false);

  for (const row of data ?? []) {
    const key = row.category as GBombsCategoryKey;
    const cat = state[key];
    if (!cat) continue; // skip rows in non-gBOMBS buckets

    const norm = row.food_item_normalized ?? normalizeFood(row.food_item);

    // Custom foods aren't in the presets — add them as chips.
    if (row.source === 'custom') {
      const exists = cat.chips.some((c) => normalizeFood(c) === norm);
      if (!exists) {
        cat.chips.push(row.food_item);
        cat.customs.add(row.food_item);
      }
    }

    // Select the matching chip (match by normalized so casing can't desync).
    if (row.is_active) {
      const chip = cat.chips.find((c) => normalizeFood(c) === norm);
      if (chip) cat.selected.add(chip);
    }
  }

  return state;
}

/** Reconcile the DB to match the favorites the user selected in the editor. */
export async function syncFavorites(
  userId: string,
  state: FavoritesState
): Promise<void> {
  const upserts: PrefRow[] = [];

  for (const key of Object.keys(state) as GBombsCategoryKey[]) {
    const cat = state[key];
    cat.selected.forEach((food) => {
      upserts.push({
        user_id: userId,
        category: key,
        food_item: food,
        food_item_normalized: normalizeFood(food),
        source: cat.customs.has(food) ? 'custom' : 'preset',
        is_validated: true,
        is_excluded: false,
        is_active: true,
      });
    });
  }

  if (upserts.length) {
    const { error } = await supabase
      .from('food_preferences')
      .upsert(upserts, { onConflict: 'user_id,food_item_normalized,category' });
    if (error) throw new Error(error.message);
  }

  // Delete favorites the user turned off. Keyed by category|normalized so a food
  // shared across categories is only removed where it was actually deselected.
  const keep = new Set<string>();
  for (const key of Object.keys(state) as GBombsCategoryKey[]) {
    state[key].selected.forEach((f) => keep.add(`${key}|${normalizeFood(f)}`));
  }

  const { data: existing } = await supabase
    .from('food_preferences')
    .select('id, category, food_item, food_item_normalized')
    .eq('user_id', userId)
    .eq('is_excluded', false);

  const idsToDelete = (existing ?? [])
    .filter((r) => {
      const norm = r.food_item_normalized ?? normalizeFood(r.food_item);
      return !keep.has(`${r.category}|${norm}`);
    })
    .map((r) => r.id);

  if (idsToDelete.length) {
    const { error } = await supabase
      .from('food_preferences')
      .delete()
      .in('id', idsToDelete);
    if (error) throw new Error(error.message);
  }
}

// ---- Exclusions (flat allergen list) -------------------------------------

export interface ExclusionsState {
  chips: string[];
  selected: Set<string>;
}

/** Load the user's exclusions, merged onto the common-allergen quick picks. */
export async function loadExclusions(userId: string): Promise<ExclusionsState> {
  const chips = [...COMMON_ALLERGENS];
  const selected = new Set<string>();

  const { data } = await supabase
    .from('food_preferences')
    .select('food_item, food_item_normalized')
    .eq('user_id', userId)
    .eq('is_excluded', true);

  for (const row of data ?? []) {
    const norm = row.food_item_normalized ?? normalizeFood(row.food_item);
    const chip = chips.find((c) => normalizeFood(c) === norm);
    if (chip) {
      selected.add(chip);
    } else {
      chips.push(row.food_item);
      selected.add(row.food_item);
    }
  }

  return { chips, selected };
}

/** Reconcile the DB to match the exclusions the user selected in the editor. */
export async function syncExclusions(
  userId: string,
  selected: Set<string>
): Promise<void> {
  const foods = Array.from(selected);

  if (foods.length) {
    const rows: PrefRow[] = foods.map((food) => ({
      user_id: userId,
      category: EXCLUSION_CATEGORY,
      food_item: food,
      food_item_normalized: normalizeFood(food),
      source: 'custom',
      is_validated: true,
      is_excluded: true,
      is_active: true,
    }));
    const { error } = await supabase
      .from('food_preferences')
      .upsert(rows, { onConflict: 'user_id,food_item_normalized,category' });
    if (error) throw new Error(error.message);
  }

  // Remove exclusions the user turned off. Exclusions must be deleted (not
  // deactivated): mealContext treats any is_excluded row as excluded.
  const keep = new Set(foods.map(normalizeFood));

  const { data: existing } = await supabase
    .from('food_preferences')
    .select('id, food_item, food_item_normalized')
    .eq('user_id', userId)
    .eq('is_excluded', true);

  const idsToDelete = (existing ?? [])
    .filter((r) => !keep.has(r.food_item_normalized ?? normalizeFood(r.food_item)))
    .map((r) => r.id);

  if (idsToDelete.length) {
    const { error } = await supabase
      .from('food_preferences')
      .delete()
      .in('id', idsToDelete);
    if (error) throw new Error(error.message);
  }
}
