/**
 * Persistence for the daily gBOMBS check-in.
 * ------------------------------------------------------------------
 * Two layers, mirroring how the rest of the app treats AI output:
 *   1. AsyncStorage caches today's FULL result (including coaching text) so
 *      reopening the check-in shows everything instantly and offline.
 *   2. Supabase `daily_scores` gets a best-effort upsert of the SCORE — the
 *      durable, cross-device record the streaks + dashboard read later. If the
 *      write fails (offline, table not provisioned) the cached result still
 *      stands; we never block the user on the network.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from './supabase';
import type { CheckInResult, GBombsCategory } from '@/services/gemini';

const KEY_PREFIX = 'gbombs_checkin_v1_';
const keyFor = (userId: string) => `${KEY_PREFIX}${userId}`;

/** Local calendar day as YYYY-MM-DD. */
export function todayLocalDate(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/**
 * Load today's cached check-in, if one exists. A cached result from an earlier
 * day is stale (a new day starts fresh) → returns null.
 */
export async function loadTodayCheckIn(
  userId: string
): Promise<CheckInResult | null> {
  try {
    const raw = await AsyncStorage.getItem(keyFor(userId));
    if (!raw) return null;
    const result = JSON.parse(raw) as CheckInResult;
    return result.scoreDate === todayLocalDate() ? result : null;
  } catch {
    return null; // corrupt cache → treat as no check-in
  }
}

/** Map the result's category array to the daily_scores boolean columns. */
function hitColumns(categoriesHit: GBombsCategory[]) {
  const hit = new Set(categoriesHit);
  return {
    greens_hit: hit.has('greens'),
    beans_hit: hit.has('beans'),
    onion_hit: hit.has('onion'),
    mushroom_hit: hit.has('mushroom'),
    berries_hit: hit.has('berries'),
    seeds_hit: hit.has('seeds'),
  };
}

/**
 * Persist a check-in: cache the full result locally, then best-effort upsert the
 * score to daily_scores (one row per user per day). DB errors are swallowed —
 * the local cache is the source of truth for the UI this session.
 */
export async function saveCheckIn(
  userId: string,
  result: CheckInResult
): Promise<void> {
  // 1. Local cache — full result including feedback.
  try {
    await AsyncStorage.setItem(keyFor(userId), JSON.stringify(result));
  } catch {
    // Non-fatal: result still shows this session even if caching fails.
  }

  // 2. Durable score — best-effort upsert for streaks/dashboard.
  try {
    await supabase.from('daily_scores').upsert(
      {
        user_id: userId,
        score_date: result.scoreDate,
        gbombs_score: result.score,
        ...hitColumns(result.categoriesHit),
        meals_logged: result.mealsLogged,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id,score_date' }
    );
  } catch (e) {
    console.warn('daily_scores upsert failed (cached locally):', e);
  }
}

export async function clearTodayCheckIn(userId: string): Promise<void> {
  try {
    await AsyncStorage.removeItem(keyFor(userId));
  } catch {
    // ignore
  }
}
