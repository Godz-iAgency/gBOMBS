/**
 * Coach app-side glue: context assembly, history persistence, daily limits.
 * ------------------------------------------------------------------
 * Keeps services/coach/ pure. This file does the AsyncStorage + Supabase work:
 *   - buildCoachContext: gather the user's profile, today's score, and plan.
 *   - history: persist the visible conversation per user (AsyncStorage).
 *   - daily limit: count messages/day per subscription tier to cap API cost.
 *
 * NOTE: the limit is enforced client-side (AsyncStorage), consistent with the
 * app's existing client-side AI keys. It controls honest usage and cost; a
 * server-side proxy would be the hardening step before a public launch.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { buildUserMealContext } from './mealContext';
import { loadTodayCheckIn, todayLocalDate } from './dailyCheckIn';
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
const USAGE_PREFIX = 'gbombs_coach_usage_v1_';
const historyKey = (userId: string) => `${HISTORY_PREFIX}${userId}`;
const usageKey = (userId: string) => `${USAGE_PREFIX}${userId}`;

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
    cookingStyle: mealCtx?.cookingStyle ?? 'balanced_everyday',
    preferredFoods: mealCtx?.preferredFoods ?? [],
    excludedFoods: mealCtx?.excludedFoods ?? [],
    todayScore: checkIn
      ? { score: checkIn.score, hit: checkIn.categoriesHit }
      : null,
    hasPlan: Boolean(plan),
    weeklyScore: plan?.weeklyScore.score ?? null,
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

export interface CoachUsage {
  used: number;
  limit: number;
  remaining: number;
}

interface StoredUsage {
  date: string; // YYYY-MM-DD (local) the count belongs to
  count: number;
}

async function readUsage(userId: string): Promise<StoredUsage> {
  const today = todayLocalDate();
  try {
    const raw = await AsyncStorage.getItem(usageKey(userId));
    if (raw) {
      const parsed = JSON.parse(raw) as StoredUsage;
      // A count from an earlier day is stale — a new day starts fresh.
      if (parsed.date === today) return parsed;
    }
  } catch {
    // fall through to a fresh count
  }
  return { date: today, count: 0 };
}

/** How many messages the user has used today and how many remain for their tier. */
export async function getCoachUsage(
  userId: string,
  tier: string
): Promise<CoachUsage> {
  const limit = dailyLimitForTier(tier);
  const { count } = await readUsage(userId);
  return { used: count, limit, remaining: Math.max(0, limit - count) };
}

/**
 * Record one sent message (call AFTER a successful reply) and return the
 * updated usage. Resets automatically across a local-day boundary.
 */
export async function recordCoachMessage(
  userId: string,
  tier: string
): Promise<CoachUsage> {
  const limit = dailyLimitForTier(tier);
  const current = await readUsage(userId);
  const next: StoredUsage = { date: current.date, count: current.count + 1 };
  try {
    await AsyncStorage.setItem(usageKey(userId), JSON.stringify(next));
  } catch {
    // Non-fatal: a failed write just means this message wasn't counted.
  }
  return {
    used: next.count,
    limit,
    remaining: Math.max(0, limit - next.count),
  };
}
