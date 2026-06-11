/**
 * Local cache for the generated grocery list.
 * ------------------------------------------------------------------
 * One list per user in AsyncStorage. Saved after generation AND after every
 * checkbox toggle, so check-off progress survives app restarts. The list
 * stores the plan's generatedAt; callers compare it to the current plan to
 * detect a stale list after a plan regeneration.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import type { GroceryList } from '@/services/gemini';

const KEY_PREFIX = 'gbombs_grocery_v1_';
const keyFor = (userId: string) => `${KEY_PREFIX}${userId}`;

export async function loadCachedGrocery(
  userId: string
): Promise<GroceryList | null> {
  try {
    const raw = await AsyncStorage.getItem(keyFor(userId));
    if (!raw) return null;
    return JSON.parse(raw) as GroceryList;
  } catch {
    return null; // corrupt cache → treat as no list
  }
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
}

export async function clearCachedGrocery(userId: string): Promise<void> {
  try {
    await AsyncStorage.removeItem(keyFor(userId));
  } catch {
    // ignore
  }
}
