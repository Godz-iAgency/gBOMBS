/**
 * Meal-plan persistence: local cache + DB write-through.
 * ------------------------------------------------------------------
 * Meal-plan generation costs an API call, so we persist the latest plan per
 * user and load it instantly on revisit. Regenerating overwrites it.
 *
 * TWO layers, by design:
 *   • AsyncStorage  — the fast layer. Hot path; instant load on revisit, keyed
 *     per user so accounts don't collide on a shared device.
 *   • Supabase `meal_plans` — the SHARED source of truth (Step 11). A connected
 *     professional (on their own device) and the autopilot cron job can't read
 *     a phone's AsyncStorage, so every save write-throughs to the DB, and a
 *     cache miss falls back to the DB (e.g. fresh install / new device).
 *
 * The DB side is best-effort: a network failure never blocks the local UX.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import type { WeeklyMealPlan } from '@/services/gemini';
import { supabase } from './supabase';

const KEY_PREFIX = 'gbombs_meal_plan_v1_';
const keyFor = (userId: string) => `${KEY_PREFIX}${userId}`;

export async function loadCachedPlan(
  userId: string
): Promise<WeeklyMealPlan | null> {
  // 1. Fast path: local cache.
  try {
    const raw = await AsyncStorage.getItem(keyFor(userId));
    if (raw) return JSON.parse(raw) as WeeklyMealPlan;
  } catch {
    // corrupt cache → fall through to the DB
  }

  // 2. Fallback: the shared DB copy (fresh device / cleared cache). Re-seed the
  //    local cache so subsequent loads hit the fast path again.
  try {
    const { data } = await supabase
      .from('meal_plans')
      .select('plan')
      .eq('user_id', userId)
      .maybeSingle();
    if (data?.plan) {
      const plan = data.plan as WeeklyMealPlan;
      AsyncStorage.setItem(keyFor(userId), JSON.stringify(plan)).catch(() => {});
      return plan;
    }
  } catch {
    // offline / no row → treat as no plan
  }
  return null;
}

export async function saveCachedPlan(
  userId: string,
  plan: WeeklyMealPlan
): Promise<void> {
  // Local first (instant + offline-safe).
  try {
    await AsyncStorage.setItem(keyFor(userId), JSON.stringify(plan));
  } catch {
    // Non-fatal: the plan still shows this session even if caching fails.
  }
  // Write-through to the shared DB copy (best-effort).
  await savePlanToDb(userId, plan);
}

/** Upsert the current plan to Supabase (one row per user). Never throws. */
export async function savePlanToDb(
  userId: string,
  plan: WeeklyMealPlan
): Promise<void> {
  try {
    await supabase.from('meal_plans').upsert(
      {
        user_id: userId,
        plan,
        generated_at: plan.generatedAt,
        tier_used: plan.tierUsed,
        model_used: plan.modelUsed,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id' }
    );
  } catch {
    // Offline / RLS / transient — the local cache still has the plan.
  }
}

export async function clearCachedPlan(userId: string): Promise<void> {
  try {
    await AsyncStorage.removeItem(keyFor(userId));
  } catch {
    // ignore
  }
}
