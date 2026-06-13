/**
 * Home dashboard data aggregation.
 * ------------------------------------------------------------------
 * Read-only: pulls together everything the Home tab shows from sources that
 * already exist — today's check-in (AsyncStorage), the cached weekly plan
 * (AsyncStorage), recent daily_scores rows (Supabase) for the streak and
 * week-progress numbers, and the trial end date (users row). No AI calls.
 *
 * The daily streak is DERIVED here from daily_scores: consecutive logged days
 * ending today (or yesterday, so the streak doesn't read 0 before they've had
 * a chance to log today). Step 7 formalizes streak persistence in the streaks
 * table; this read-only version keeps Step 6 self-contained.
 *
 * Every Supabase read is best-effort: offline or failed queries fall back to
 * safe defaults, and today's local check-in still counts toward the streak so
 * the dashboard stays truthful without a network.
 */

import { supabase } from './supabase';
import { loadTodayCheckIn, todayLocalDate } from './dailyCheckIn';
import { loadCachedPlan } from './mealPlanCache';
import type { CheckInResult, WeeklyMealPlan } from '@/services/gemini';

export interface DashboardData {
  /** Today's check-in (null = not logged yet today). */
  checkIn: CheckInResult | null;
  /** The cached weekly meal plan (null = none generated yet). */
  plan: WeeklyMealPlan | null;
  /** Consecutive days logged, ending today or yesterday. */
  streak: number;
  /** Distinct days logged since Monday (0–7). */
  daysLoggedThisWeek: number;
  /** users.trial_ends_at — drives the trial countdown pill. */
  trialEndsAt: string | null;
}

/** YYYY-MM-DD for the day before `iso`, using local calendar math. */
function prevDay(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() - 1);
  return fmt(dt);
}

/** Monday of the week containing `iso` (local). */
function weekStart(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  const dow = dt.getDay(); // 0 = Sunday … 6 = Saturday
  dt.setDate(dt.getDate() - (dow === 0 ? 6 : dow - 1));
  return fmt(dt);
}

function fmt(d: Date): string {
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

/**
 * Consecutive logged days ending today — or ending yesterday when today isn't
 * logged yet (an unbroken run shouldn't show 0 at breakfast time).
 */
export function computeDailyStreak(dates: Set<string>, today: string): number {
  let cursor = dates.has(today) ? today : prevDay(today);
  let streak = 0;
  while (dates.has(cursor)) {
    streak += 1;
    cursor = prevDay(cursor);
  }
  return streak;
}

/** Distinct logged days from Monday through today (ISO strings compare safely). */
export function countDaysThisWeek(dates: Set<string>, today: string): number {
  const start = weekStart(today);
  let count = 0;
  for (const d of dates) {
    if (d >= start && d <= today) count += 1;
  }
  return count;
}

/** Recent logged dates from daily_scores (newest first). [] on any failure. */
async function fetchScoreDates(userId: string): Promise<string[]> {
  try {
    const { data, error } = await supabase
      .from('daily_scores')
      .select('score_date')
      .eq('user_id', userId)
      .order('score_date', { ascending: false })
      .limit(60);
    if (error || !data) return [];
    return data.map((r) => r.score_date);
  } catch {
    return [];
  }
}

export async function fetchTrialEnd(userId: string): Promise<string | null> {
  try {
    const { data, error } = await supabase
      .from('users')
      .select('trial_ends_at')
      .eq('id', userId)
      .single();
    if (error || !data) return null;
    return data.trial_ends_at;
  } catch {
    return null;
  }
}

/** Load everything the Home dashboard renders, in parallel. */
export async function loadDashboard(userId: string): Promise<DashboardData> {
  const [checkIn, plan, scoreDates, trialEndsAt] = await Promise.all([
    loadTodayCheckIn(userId),
    loadCachedPlan(userId),
    fetchScoreDates(userId),
    fetchTrialEnd(userId),
  ]);

  // Today's local check-in counts even if the daily_scores write hasn't
  // landed (offline) — keeps streak/week numbers honest without a network.
  const dates = new Set(scoreDates);
  if (checkIn) dates.add(checkIn.scoreDate);

  const today = todayLocalDate();
  return {
    checkIn,
    plan,
    streak: computeDailyStreak(dates, today),
    daysLoggedThisWeek: countDaysThisWeek(dates, today),
    trialEndsAt,
  };
}
