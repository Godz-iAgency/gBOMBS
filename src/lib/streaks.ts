/**
 * Streaks & badges data layer.
 * ------------------------------------------------------------------
 * Called after every daily check-in. Rather than incrementing counters (fragile
 * — breaks on edits, backfills, multi-device, missed days), it RECOMPUTES every
 * streak stat from the durable `daily_scores` history. This is idempotent and
 * self-healing: running it twice, or after editing an old day, always yields the
 * correct numbers.
 *
 * Flow per check-in:
 *   1. Pull daily_scores (+ merge today's just-scored result in case the upsert
 *      lagged offline).
 *   2. Recompute daily / perfect-day / weekly streaks + totals.
 *   3. Persist to the `streaks` table (the ledger the trophy case + future
 *      reports read).
 *   4. Evaluate badge criteria, insert any newly earned `user_badges`, and
 *      return them so the UI can celebrate.
 *
 * Everything is best-effort: any DB failure degrades to safe defaults and never
 * throws into the check-in flow.
 */

import { supabase } from './supabase';
import { computeDailyStreak } from './dashboard';
import { todayLocalDate } from './dailyCheckIn';
import { BADGE_BY_KEY, type BadgeDef } from './badgeCatalog';

export interface StreakStats {
  currentDailyStreak: number;
  longestDailyStreak: number;
  currentPerfectDayStreak: number;
  longestPerfectDayStreak: number;
  currentWeeklyStreak: number;
  longestWeeklyStreak: number;
  totalPerfectDays: number;
  totalDaysLogged: number;
  lastLoggedDate: string | null;
}

export interface CheckInOutcome {
  stats: StreakStats;
  /** Badges earned by THIS check-in (empty if none) — drives the unlock modal. */
  newBadges: BadgeDef[];
}

interface ScoreRow {
  score_date: string;
  gbombs_score: number;
}

const EMPTY_STATS: StreakStats = {
  currentDailyStreak: 0,
  longestDailyStreak: 0,
  currentPerfectDayStreak: 0,
  longestPerfectDayStreak: 0,
  currentWeeklyStreak: 0,
  longestWeeklyStreak: 0,
  totalPerfectDays: 0,
  totalDaysLogged: 0,
  lastLoggedDate: null,
};

// ---- Local date math (YYYY-MM-DD, calendar-correct) ----------------------

function shiftDay(iso: string, delta: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + delta);
  const mm = String(dt.getMonth() + 1).padStart(2, '0');
  const dd = String(dt.getDate()).padStart(2, '0');
  return `${dt.getFullYear()}-${mm}-${dd}`;
}

/** Monday of the week containing `iso`. */
function weekStartMonday(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  const dow = dt.getDay(); // 0 = Sun … 6 = Sat
  return shiftDay(iso, -(dow === 0 ? 6 : dow - 1));
}

/** Longest run of consecutive calendar days present in the set. */
function longestConsecutiveRun(dates: Set<string>): number {
  const sorted = [...dates].sort();
  let best = 0;
  let run = 0;
  let prev: string | null = null;
  for (const d of sorted) {
    run = prev && shiftDay(prev, 1) === d ? run + 1 : 1;
    if (run > best) best = run;
    prev = d;
  }
  return best;
}

/** Week-starts (Mondays) where all 7 days were logged. */
function fullWeekStarts(loggedDates: Set<string>): Set<string> {
  const byWeek = new Map<string, Set<string>>();
  for (const d of loggedDates) {
    const ws = weekStartMonday(d);
    if (!byWeek.has(ws)) byWeek.set(ws, new Set());
    byWeek.get(ws)!.add(d);
  }
  const full = new Set<string>();
  for (const [ws, days] of byWeek) if (days.size >= 7) full.add(ws);
  return full;
}

/** Current + longest consecutive run of fully-logged weeks. */
function weeklyStreaks(
  fullWeeks: Set<string>,
  today: string
): { current: number; longest: number } {
  const sorted = [...fullWeeks].sort();
  let longest = 0;
  let run = 0;
  let prev: string | null = null;
  for (const w of sorted) {
    run = prev && shiftDay(prev, 7) === w ? run + 1 : 1;
    if (run > longest) longest = run;
    prev = w;
  }

  // Current: walk back from this week (or last week if this one isn't full yet).
  const thisWeek = weekStartMonday(today);
  let cursor = fullWeeks.has(thisWeek) ? thisWeek : shiftDay(thisWeek, -7);
  let current = 0;
  while (fullWeeks.has(cursor)) {
    current += 1;
    cursor = shiftDay(cursor, -7);
  }
  return { current, longest };
}

/** Recompute every streak stat from the raw daily_scores rows. */
export function computeStreakStats(rows: ScoreRow[], today: string): StreakStats {
  if (!rows.length) return { ...EMPTY_STATS };

  const logged = new Set(rows.map((r) => r.score_date));
  const perfect = new Set(
    rows.filter((r) => r.gbombs_score >= 6).map((r) => r.score_date)
  );
  const wk = weeklyStreaks(fullWeekStarts(logged), today);

  return {
    currentDailyStreak: computeDailyStreak(logged, today),
    longestDailyStreak: longestConsecutiveRun(logged),
    currentPerfectDayStreak: computeDailyStreak(perfect, today),
    longestPerfectDayStreak: longestConsecutiveRun(perfect),
    currentWeeklyStreak: wk.current,
    longestWeeklyStreak: wk.longest,
    totalPerfectDays: perfect.size,
    totalDaysLogged: logged.size,
    lastLoggedDate: [...logged].sort().at(-1) ?? null,
  };
}

// ---- Badge criteria (only the badges this build can award) ---------------

const EARNABLE_CRITERIA: Record<string, (s: StreakStats) => boolean> = {
  first_gbombs_day: (s) => s.totalPerfectDays >= 1,
  streak_7: (s) => s.longestDailyStreak >= 7,
  streak_30: (s) => s.longestDailyStreak >= 30,
  perfect_week: (s) => s.longestPerfectDayStreak >= 7,
};

/**
 * Award any newly-qualified badges. Resolves badge_key → badge_id from the DB
 * master table, skips ones already owned, inserts the rest, and returns the
 * freshly-earned badge definitions. Best-effort: returns [] on any failure.
 */
async function syncBadges(
  userId: string,
  stats: StreakStats
): Promise<BadgeDef[]> {
  try {
    const { data: master } = await supabase
      .from('badges')
      .select('id, badge_key');
    if (!master?.length) return [];

    const idByKey = new Map(master.map((b) => [b.badge_key, b.id]));
    const keyById = new Map(master.map((b) => [b.id, b.badge_key]));

    const { data: owned } = await supabase
      .from('user_badges')
      .select('badge_id')
      .eq('user_id', userId);
    const ownedKeys = new Set(
      (owned ?? []).map((r) => keyById.get(r.badge_id)).filter(Boolean)
    );

    const newKeys = Object.keys(EARNABLE_CRITERIA).filter(
      (k) =>
        EARNABLE_CRITERIA[k](stats) && !ownedKeys.has(k) && idByKey.has(k)
    );
    if (!newKeys.length) return [];

    const rows = newKeys.map((k) => ({
      user_id: userId,
      badge_id: idByKey.get(k)!,
    }));
    const { error } = await supabase
      .from('user_badges')
      .upsert(rows, { onConflict: 'user_id,badge_id' });
    if (error) {
      console.warn('user_badges insert failed:', error.message);
      return [];
    }

    return newKeys
      .map((k) => BADGE_BY_KEY[k])
      .filter((b): b is BadgeDef => Boolean(b));
  } catch (e) {
    console.warn('syncBadges failed:', e);
    return [];
  }
}

/**
 * Recompute + persist streaks and award badges after a check-in.
 * `justScored` lets the caller fold in today's result even if the daily_scores
 * upsert hasn't landed yet (offline), so the streak never under-counts.
 */
export async function updateStreaksAndBadges(
  userId: string,
  justScored?: { date: string; score: number }
): Promise<CheckInOutcome> {
  const today = todayLocalDate();

  let rows: ScoreRow[] = [];
  try {
    const { data } = await supabase
      .from('daily_scores')
      .select('score_date, gbombs_score')
      .eq('user_id', userId)
      .order('score_date', { ascending: false })
      .limit(400); // ~13 months — ample for current + longest streaks
    rows = data ?? [];
  } catch {
    rows = [];
  }

  // Fold in today's just-scored result (replace any same-date row).
  if (justScored) {
    rows = rows.filter((r) => r.score_date !== justScored.date);
    rows.push({ score_date: justScored.date, gbombs_score: justScored.score });
  }

  const stats = computeStreakStats(rows, today);

  try {
    await supabase.from('streaks').upsert(
      {
        user_id: userId,
        current_daily_streak: stats.currentDailyStreak,
        longest_daily_streak: stats.longestDailyStreak,
        current_perfect_day_streak: stats.currentPerfectDayStreak,
        longest_perfect_day_streak: stats.longestPerfectDayStreak,
        current_weekly_streak: stats.currentWeeklyStreak,
        longest_weekly_streak: stats.longestWeeklyStreak,
        total_perfect_days: stats.totalPerfectDays,
        total_days_logged: stats.totalDaysLogged,
        last_logged_date: stats.lastLoggedDate,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id' }
    );
  } catch (e) {
    console.warn('streaks upsert failed:', e);
  }

  const newBadges = await syncBadges(userId, stats);
  return { stats, newBadges };
}

/** Read the persisted streak stats (trophy case / future reports). */
export async function loadStreakStats(
  userId: string
): Promise<StreakStats | null> {
  try {
    const { data } = await supabase
      .from('streaks')
      .select('*')
      .eq('user_id', userId)
      .single();
    if (!data) return null;
    return {
      currentDailyStreak: data.current_daily_streak,
      longestDailyStreak: data.longest_daily_streak,
      currentPerfectDayStreak: data.current_perfect_day_streak,
      longestPerfectDayStreak: data.longest_perfect_day_streak,
      currentWeeklyStreak: data.current_weekly_streak,
      longestWeeklyStreak: data.longest_weekly_streak,
      totalPerfectDays: data.total_perfect_days,
      totalDaysLogged: data.total_days_logged,
      lastLoggedDate: data.last_logged_date,
    };
  } catch {
    return null;
  }
}

/** Map of earned badge_key → unlocked_at ISO timestamp (for the trophy case). */
export async function loadUserBadges(
  userId: string
): Promise<Record<string, string>> {
  try {
    const { data: master } = await supabase
      .from('badges')
      .select('id, badge_key');
    const keyById = new Map((master ?? []).map((b) => [b.id, b.badge_key]));

    const { data } = await supabase
      .from('user_badges')
      .select('badge_id, unlocked_at')
      .eq('user_id', userId);

    const out: Record<string, string> = {};
    for (const r of data ?? []) {
      const key = keyById.get(r.badge_id);
      if (key) out[key] = r.unlocked_at;
    }
    return out;
  } catch {
    return {};
  }
}
