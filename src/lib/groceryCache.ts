/**
 * Grocery-list persistence: local cache + DB write-through.
 * ------------------------------------------------------------------
 * One list per user. Saved after generation AND after every checkbox toggle, so
 * check-off progress survives app restarts. The list stores the plan's
 * generatedAt; callers compare it to the current plan to detect a stale list
 * after a plan regeneration.
 *
 * TWO layers (see mealPlanCache.ts for the rationale):
 *   • AsyncStorage      — fast, per-user, offline-safe hot path.
 *   • Supabase `grocery_lists` — shared source of truth so a connected
 *     professional / autopilot can read the current list. Every save
 *     write-throughs; a cache miss falls back to the DB. DB side is best-effort.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import type { GroceryList } from '@/services/gemini';
import { supabase } from './supabase';

const KEY_PREFIX = 'gbombs_grocery_v1_';
const keyFor = (userId: string) => `${KEY_PREFIX}${userId}`;

export async function loadCachedGrocery(
  userId: string
): Promise<GroceryList | null> {
  // 1. Local cache (fast, offline-safe, carries check-off state).
  let local: GroceryList | null = null;
  try {
    const raw = await AsyncStorage.getItem(keyFor(userId));
    if (raw) local = JSON.parse(raw) as GroceryList;
  } catch {
    // corrupt cache → treat as no local copy
  }

  // 2. Freshness check: if the DB list is anchored to a NEWER plan than the
  //    local one (autopilot generated server-side, or another device
  //    regenerated), take the DB copy. Same-plan lists keep the local copy —
  //    it has the user's latest check-offs (write-through keeps DB in sync).
  try {
    const { data: head } = await supabase
      .from('grocery_lists')
      .select('plan_generated_at')
      .eq('user_id', userId)
      .maybeSingle();

    const dbMs = head?.plan_generated_at
      ? new Date(head.plan_generated_at).getTime()
      : 0;
    const localMs = local?.planGeneratedAt
      ? new Date(local.planGeneratedAt).getTime()
      : 0;

    if ((dbMs > localMs + 1000 || !local) && head) {
      const { data } = await supabase
        .from('grocery_lists')
        .select('list')
        .eq('user_id', userId)
        .maybeSingle();
      if (data?.list) {
        const list = data.list as GroceryList;
        AsyncStorage.setItem(keyFor(userId), JSON.stringify(list)).catch(() => {});
        return list;
      }
    }
  } catch {
    // offline / transient — fall back to whatever we have locally
  }

  return local;
}

export async function saveCachedGrocery(
  userId: string,
  list: GroceryList
): Promise<void> {
  try {
    await AsyncStorage.setItem(keyFor(userId), JSON.stringify(list));
  } catch {
    // Non-fatal: the list still shows this session even if caching fails.
  }
  await saveGroceryToDb(userId, list);
}

/** Upsert the current grocery list to Supabase (one row per user). Never throws. */
export async function saveGroceryToDb(
  userId: string,
  list: GroceryList
): Promise<void> {
  try {
    await supabase.from('grocery_lists').upsert(
      {
        user_id: userId,
        list,
        plan_generated_at: list.planGeneratedAt,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id' }
    );
  } catch {
    // Offline / RLS / transient — the local cache still has the list.
  }
}

export async function clearCachedGrocery(userId: string): Promise<void> {
  try {
    await AsyncStorage.removeItem(keyFor(userId));
  } catch {
    // ignore
  }
}
