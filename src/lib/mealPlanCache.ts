/**
 * Local cache for the generated weekly meal plan.
 * ------------------------------------------------------------------
 * Meal-plan generation costs an API call, so we persist the latest plan per
 * user in AsyncStorage and load it instantly on revisit. Regenerating
 * overwrites it. Keyed per user so accounts don't collide on a shared device.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import type { WeeklyMealPlan } from '@/services/gemini';

const KEY_PREFIX = 'gbombs_meal_plan_v1_';
const keyFor = (userId: string) => `${KEY_PREFIX}${userId}`;

export async function loadCachedPlan(
  userId: string
): Promise<WeeklyMealPlan | null> {
  try {
    const raw = await AsyncStorage.getItem(keyFor(userId));
    if (!raw) return null;
    return JSON.parse(raw) as WeeklyMealPlan;
  } catch {
    return null; // corrupt cache → treat as no plan
  }
}

export async function saveCachedPlan(
  userId: string,
  plan: WeeklyMealPlan
): Promise<void> {
  try {
    await AsyncStorage.setItem(keyFor(userId), JSON.stringify(plan));
  } catch {
    // Non-fatal: the plan still shows this session even if caching fails.
  }
}

export async function clearCachedPlan(userId: string): Promise<void> {
  try {
    await AsyncStorage.removeItem(keyFor(userId));
  } catch {
    // ignore
  }
}
