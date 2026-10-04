/**
 * Coach app-side glue: context assembly, history persistence, daily limits.
 * ------------------------------------------------------------------
 * Keeps services/coach/ pure. This file does the AsyncStorage + Supabase work:
 *   - buildCoachContext: gather the user's profile, today's score, and plan.
 *   - history: persist the visible conversation per user (AsyncStorage).
 *   - daily limit: count messages/day per subscription tier to cap API cost.
 *
 * Daily limits are enforced atomically by the authenticated AI gateway.
 * AsyncStorage keeps conversation history only, never the authoritative count.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { buildUserMealContext } from './mealContext';
import { loadTodayCheckIn } from './dailyCheckIn';
import { cachedCoachUsage, fetchCoachUsage, type AiUsage } from '@/services/ai/client';
import { loadCachedPlan } from './mealPlanCache';
import type { CoachContext, CoachTurn } from '@/services/coach';

// ---- Daily message limits, by subscription tier ----
const DAILY_LIMITS: Record<string, number> = {
  wellness_pro: 50, // Premium
  standard: 20, // Starter
};
const DEFAULT_LIMIT = 3; // free / unknown — defensive (paywall gates the tabs)

export function dailyLimitForTier(tier: string): number {
  return DAILY_LIMITS[tier] ?? DEFAULT_LIMIT;
}

// ---- Storage keys (per user so accounts don't collide on a shared device) ----
const HISTORY_PREFIX = 'gbombs_coach_history_v1_';
const historyKey = (userId: string) => `${HISTORY_PREFIX}${userId}`;

// Keep stored history bounded; the model only replays the last several turns
// anyway, and this keeps the AsyncStorage entry small.
const MAX_STORED_TURNS = 50;

/**
 * Assemble everything the coach personalizes around. Every read is best-effort:
 * a failed profile/plan/check-in lookup falls back to safe defaults so the chat
 * still works (just less personalized).
 */
export async function buildCoachContext(userId: string): Promise<CoachContext> {
  const [mealCtx, checkIn, plan] = await Promise.all([
    buildUserMealContext(userId).catch(() => null),
    loadTodayCheckIn(userId).catch(() => null),
    loadCachedPlan(userId).catch(() => null),
  ]);

  return {
    dietMode: mealCtx?.dietMode ?? 'vegan',
    healthGoal: mealCtx?.healthGoal ?? 'general_health',
    healthGoalSecondary: mealCtx?.healthGoalSecondary ?? null,
    cookingStyle: mealCtx?.cookingStyle ?? 'balanced_everyday',
    preferredFoods: mealCtx?.preferredFoods ?? [],
    excludedFoods: mealCtx?.excludedFoods ?? [],
    todayScore: checkIn
      ? { score: checkIn.score, hit: checkIn.categoriesHit }
      : null,
    hasPlan: Boolean(plan),
    weeklyScore: plan?.weeklyScore.score ?? null,
    weekMealNames:
      plan?.days.map((d) => ({
        day: d.label,
        meals: d.meals.map((m) => `${m.name} (${m.slot})`),
      })) ?? null,
  };
}

// ---- Conversation history ----

export async function loadCoachHistory(userId: string): Promise<CoachTurn[]> {
  try {
    const raw = await AsyncStorage.getItem(historyKey(userId));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as CoachTurn[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export async function saveCoachHistory(
  userId: string,
  turns: CoachTurn[]
): Promise<void> {
  try {
    const bounded = turns.slice(-MAX_STORED_TURNS);
    await AsyncStorage.setItem(historyKey(userId), JSON.stringify(bounded));
  } catch {
    // Non-fatal: the conversation still shows this session.
  }
}

export async function clearCoachHistory(userId: string): Promise<void> {
  try {
    await AsyncStorage.removeItem(historyKey(userId));
  } catch {
    // ignore
  }
}

// ---- Daily usage / rate limit ----

export type CoachUsage = AiUsage;

/** The server derives identity and tier from the session and subscription. */
export async function getCoachUsage(_userId: string, _tier: string): Promise<CoachUsage> {
  return fetchCoachUsage();
}

/** The successful reply has already been counted by the server. */
export async function recordCoachMessage(userId: string, _tier: string): Promise<CoachUsage> {
  return cachedCoachUsage(userId) ?? fetchCoachUsage();
}
