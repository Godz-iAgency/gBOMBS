/**
 * Reports & progress data layer.
 * ------------------------------------------------------------------
 * Read-only aggregation over `daily_scores` for the Reports screen. Pulls the
 * recent rows once and derives the three views the UI charts:
 *   1. a day-by-day score TREND (with gaps for days not logged),
 *   2. per-category COVERAGE over the window (share of logged days each
 *      gBOMBS group was hit), and
 *   3. headline SUMMARY stats (avg score, perfect days, best day, etc).
 *
 * The compute step is a pure function so it stays trivially testable; the fetch
 * wrapper is best-effort — any failure yields an empty report for the range so
 * the screen degrades gracefully offline.
 */

import { supabase } from './supabase';
import { todayLocalDate } from './dailyCheckIn';
import type { GBombsCategoryKey } from '@/utils/gbombsPresets';

export type ReportRange = 7 | 30;

/** One day on the trend chart. `score === null` means nothing logged that day. */
export interface TrendPoint {
  date: string; // YYYY-MM-DD
  score: number | null;
}

/** Coverage for a single gBOMBS category over the window. */
export interface CategoryCoverage {
  key: GBombsCategoryKey;
  hits: number; // days the category was hit
  pct: number; // 0–100, share of LOGGED days
}

export interface ReportData {
  range: ReportRange;
  trend: TrendPoint[];
  coverage: CategoryCoverage[];
  daysLogged: number; // logged days within the window
  avgScore: number; // mean gbombs_score over logged days (0–6, 1dp)
  perfectDays: number; // days with score === 6
  bestScore: number; // highest score in the window (0–6)
}

/** Raw shape we read from daily_scores (only the columns reports need). */
interface ScoreRow {
  score_date: string;
  gbombs_score: number;
  greens_hit: boolean;
  beans_hit: boolean;
  onion_hit: boolean;
  mushroom_hit: boolean;
  berries_hit: boolean;
  seeds_hit: boolean;
}

/** Category → its boolean "hit" column, in canonical gBOMBS order. */
const CATEGORY_COLUMNS: { key: GBombsCategoryKey; col: keyof ScoreRow }[] = [
  { key: 'greens', col: 'greens_hit' },
  { key: 'beans', col: 'beans_hit' },
  { key: 'onion', col: 'onion_hit' },
  { key: 'mushroom', col: 'mushroom_hit' },
  { key: 'berries', col: 'berries_hit' },
  { key: 'seeds', col: 'seeds_hit' },
];

// ---- Local date math (YYYY-MM-DD, calendar-correct) ----------------------

function shiftDay(iso: string, delta: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + delta);
  const mm = String(dt.getMonth() + 1).padStart(2, '0');
  const dd = String(dt.getDate()).padStart(2, '0');
  return `${dt.getFullYear()}-${mm}-${dd}`;
}

/** The last `n` calendar dates ending today, oldest → newest. */
function lastNDates(today: string, n: number): string[] {
  const out: string[] = [];
  for (let i = n - 1; i >= 0; i--) out.push(shiftDay(today, -i));
  return out;
}

/** Derive every report view from the raw rows. Pure + idempotent. */
export function computeReport(
  rows: ScoreRow[],
  today: string,
  range: ReportRange
): ReportData {
  const dates = lastNDates(today, range);
  const windowStart = dates[0];
  const byDate = new Map(rows.map((r) => [r.score_date, r]));

  // Trend: one point per calendar day in the window; null where unlogged.
  const trend: TrendPoint[] = dates.map((date) => {
    const row = byDate.get(date);
    return { date, score: row ? row.gbombs_score : null };
  });

  // Only the logged rows that fall inside the window count toward the stats.
  const logged = rows.filter(
    (r) => r.score_date >= windowStart && r.score_date <= today
  );
  const daysLogged = logged.length;

  // Coverage: share of LOGGED days each category was hit (0 when nothing yet).
  const coverage: CategoryCoverage[] = CATEGORY_COLUMNS.map(({ key, col }) => {
    const hits = logged.reduce((n, r) => n + (r[col] ? 1 : 0), 0);
    const pct = daysLogged ? Math.round((hits / daysLogged) * 100) : 0;
    return { key, hits, pct };
  });

  const totalScore = logged.reduce((n, r) => n + r.gbombs_score, 0);
  const avgScore = daysLogged
    ? Math.round((totalScore / daysLogged) * 10) / 10
    : 0;
  const perfectDays = logged.filter((r) => r.gbombs_score >= 6).length;
  const bestScore = logged.reduce((m, r) => Math.max(m, r.gbombs_score), 0);

  return {
    range,
    trend,
    coverage,
    daysLogged,
    avgScore,
    perfectDays,
    bestScore,
  };
}

/** Fetch + compute the report for a range. Empty (safe) report on any failure. */
export async function loadReport(
  userId: string,
  range: ReportRange
): Promise<ReportData> {
  const today = todayLocalDate();
  let rows: ScoreRow[] = [];
  try {
    const { data } = await supabase
      .from('daily_scores')
      .select(
        'score_date, gbombs_score, greens_hit, beans_hit, onion_hit, mushroom_hit, berries_hit, seeds_hit'
      )
      .eq('user_id', userId)
      .gte('score_date', shiftDay(today, -(range - 1)))
      .order('score_date', { ascending: true });
    rows = (data as ScoreRow[] | null) ?? [];
  } catch {
    rows = [];
  }
  return computeReport(rows, today, range);
}
