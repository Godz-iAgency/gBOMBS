/**
 * Prompt 1 — Weekly Meal Plan Generator.
 * ------------------------------------------------------------------
 * Produces an original, Fuhrman-inspired 7-day plan (35 meals: a morning
 * smoothie, breakfast, lunch, dinner, and a Nutritarian dessert each day). Runs
 * on Pro for Wellness Pro subscribers and Flash for Starter (see getModel). The
 * smoothie always sorts to the top of each day (morning slot) and the dessert
 * always closes it.
 */

import { callGeminiJson, getModel } from './client';
import { FUHRMAN_SYSTEM_PROMPT, renderUserContext } from './prompts';
import type {
  DayPlan,
  GBombsCategory,
  GBombsScore,
  MealSlot,
  MealSummary,
  UserMealContext,
  WeeklyMealPlan,
} from './types';

const VALID_CATEGORIES: GBombsCategory[] = [
  'greens',
  'beans',
  'onion',
  'mushroom',
  'berries',
  'seeds',
];

const DAY_LABELS = [
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
  'Sunday',
];

/** Display order within a day — smoothie leads, dessert closes the day. */
const SLOT_ORDER: Record<MealSlot, number> = {
  smoothie: 0,
  breakfast: 1,
  lunch: 2,
  dinner: 3,
  dessert: 4,
};

/** Shape we ask Gemini to return (we add ids + scores ourselves). */
interface RawMeal {
  slot?: string;
  name?: string;
  description?: string;
  prepMinutes?: number;
  gbombs?: unknown;
}
interface RawDay {
  day?: number;
  label?: string;
  meals?: RawMeal[];
}
interface RawPlan {
  days?: RawDay[];
}

function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

/** Keep only the six valid gBOMBS categories, deduped. */
function normalizeCategories(input: unknown): GBombsCategory[] {
  if (!Array.isArray(input)) return [];
  const seen = new Set<GBombsCategory>();
  for (const raw of input) {
    const v = String(raw).toLowerCase() as GBombsCategory;
    if (VALID_CATEGORIES.includes(v)) seen.add(v);
  }
  return [...seen];
}

function normalizeSlot(input: unknown): MealSlot {
  const v = String(input ?? '').toLowerCase();
  if (
    v === 'breakfast' ||
    v === 'lunch' ||
    v === 'dinner' ||
    v === 'smoothie' ||
    v === 'dessert'
  ) {
    return v;
  }
  return 'breakfast';
}

/** Aggregate the distinct gBOMBS categories hit across the whole week. */
export function computeWeeklyScore(days: DayPlan[]): GBombsScore {
  const set = new Set<GBombsCategory>();
  for (const d of days) {
    for (const m of d.meals) {
      for (const c of m.gbombs) set.add(c);
    }
  }
  return { categoriesHit: [...set], score: set.size, total: 6 };
}

/** Per-day gBOMBS score (handy for the day tabs / future widgets). */
export function computeDayScore(day: DayPlan): GBombsScore {
  const set = new Set<GBombsCategory>();
  for (const m of day.meals) for (const c of m.gbombs) set.add(c);
  return { categoriesHit: [...set], score: set.size, total: 6 };
}

/**
 * Generate a 7-day meal plan for the given user context + subscription tier.
 * Throws on no API key / network / parse failure so the screen can show a
 * retry state (meal plans are too important to silently degrade).
 */
export async function generateWeeklyMealPlan(
  ctx: UserMealContext,
  tier: string
): Promise<WeeklyMealPlan> {
  const model = getModel('meal-plan', tier);
  const userBlock = renderUserContext(ctx);

  const prompt = `Create an original 7-day Nutritarian meal plan (Monday through Sunday).

${userBlock}

REQUIREMENTS:
- Each day has EXACTLY five items in this order:
  smoothie, breakfast, lunch, dinner, dessert.
- The smoothie is a morning drink (blended) and should lead with berries, greens,
  and seeds where possible — a nutrient-dense start to the day.
- The dessert is a Nutritarian sweet — naturally sweetened with whole fruits
  (dates, bananas, berries, ripe mango) ONLY. NO refined sugar, NO white flour,
  NO maple syrup/honey/agave, NO added oil. Build it from whole foods such as:
    • Date-based: date-nut energy balls, raw cacao-date-walnut bites, date-oat bars
    • Berry-based: frozen-berry "nice cream", warm berry compote, berry-chia parfait
    • Banana-based: banana soft-serve, banana-date pudding, banana-oat bites
    • Chia-based: chia pudding in oat/almond milk, topped with berries or a nut drizzle
    • Bean-based (encouraged ~2–3×/week — a strong gBOMBS opportunity):
      black bean brownies sweetened with dates, chickpea cookie-dough bites, lentil-date fudge
    • Cacao-based: avocado-cacao mousse sweetened with dates, raw cacao-almond truffles
  Every dessert MUST hit at least one gBOMBS category (favor berries and seeds;
  beans are the creative wildcard). Desserts should feel genuinely satisfying —
  rewards, not penalties. Keep prepMinutes 5–20 (no-bake preferred; chilling or
  freezing time is NOT counted in prepMinutes).
- Maximize gBOMBS coverage across the week (greens, beans, onion, mushroom, berries, seeds).
- Vary the meals — do NOT repeat any meal name across the week (smoothies and desserts included).
- Strictly respect the diet mode, exclusions, and favored foods above.
- Keep prepMinutes realistic and matched to the user's cooking style (smoothies are quick, ~5 min).
- Names must be original (never copy a published recipe title).

Return ONLY valid JSON in EXACTLY this shape — no markdown, no extra keys:
{
  "days": [
    {
      "day": 1,
      "label": "Monday",
      "meals": [
        {
          "slot": "smoothie",
          "name": "original smoothie name",
          "description": "one short appetizing sentence",
          "prepMinutes": 5,
          "gbombs": ["berries","greens","seeds"]
        },
        {
          "slot": "breakfast",
          "name": "original dish name",
          "description": "one short appetizing sentence",
          "prepMinutes": 10,
          "gbombs": ["greens","beans"]
        },
        {
          "slot": "dessert",
          "name": "original dessert name",
          "description": "one short appetizing sentence",
          "prepMinutes": 10,
          "gbombs": ["berries","seeds"]
        }
      ]
    }
  ]
}

Rules for "gbombs": only include categories the meal actually contains, and use
ONLY these exact values: greens, beans, onion, mushroom, berries, seeds.`;

  const raw = await callGeminiJson<RawPlan>(model, prompt, {
    systemPrompt: FUHRMAN_SYSTEM_PROMPT,
    temperature: 0.8, // a little creativity for variety
    maxOutputTokens: 8192,
  });

  const rawDays = Array.isArray(raw.days) ? raw.days : [];
  if (rawDays.length === 0) {
    throw new Error('Meal plan came back empty — please try again.');
  }

  const days: DayPlan[] = rawDays.slice(0, 7).map((rd, i) => {
    const dayNum = i + 1;
    const meals: MealSummary[] = (rd.meals ?? [])
      .map((rm) => {
        const slot = normalizeSlot(rm.slot);
        const name = (rm.name ?? 'Untitled meal').trim();
        return {
          id: `${dayNum}-${slot}-${slugify(name)}`,
          slot,
          name,
          description: (rm.description ?? '').trim(),
          prepMinutes:
            typeof rm.prepMinutes === 'number' && rm.prepMinutes > 0
              ? Math.round(rm.prepMinutes)
              : 15,
          gbombs: normalizeCategories(rm.gbombs),
        };
      })
      // Smoothie → breakfast → lunch → dinner, regardless of model output order.
      .sort((a, b) => SLOT_ORDER[a.slot] - SLOT_ORDER[b.slot]);
    return { day: dayNum, label: DAY_LABELS[i] ?? `Day ${dayNum}`, meals };
  });

  return {
    generatedAt: new Date().toISOString(),
    tierUsed: tier,
    modelUsed: model,
    days,
    weeklyScore: computeWeeklyScore(days),
  };
}
