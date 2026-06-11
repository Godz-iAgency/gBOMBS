/**
 * Prompt 5 — Single Meal Swap.
 * ------------------------------------------------------------------
 * Replaces ONE meal in an existing weekly plan with a fresh, original meal in
 * the SAME slot. The model is told every other meal name already in the week so
 * its suggestion never duplicates one. Runs on Pro for Wellness Pro subscribers
 * and Flash for Starter (swap is a generative task — see getModel). Returns a
 * single MealSummary the screen drops back into the day in place.
 */

import { callGeminiJson, getModel } from './client';
import { FUHRMAN_SYSTEM_PROMPT, renderUserContext } from './prompts';
import type {
  GBombsCategory,
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

/** Shape we ask Gemini to return (we add id + keep the slot ourselves). */
interface RawMeal {
  name?: string;
  description?: string;
  prepMinutes?: number;
  gbombs?: unknown;
}

/**
 * Generate one replacement meal for the given day + slot. Throws on no
 * provider / parse failure so the caller can surface a retry.
 */
export async function swapMeal(
  plan: WeeklyMealPlan,
  dayIndex: number,
  meal: MealSummary,
  ctx: UserMealContext,
  tier: string
): Promise<MealSummary> {
  const model = getModel('swap', tier);
  const userBlock = renderUserContext(ctx);
  const day = plan.days[dayIndex];
  const dayLabel = day?.label ?? `Day ${dayIndex + 1}`;

  // Every other meal name in the week — the replacement must not match any.
  const otherNames = plan.days
    .flatMap((d) => d.meals)
    .map((m) => m.name)
    .filter((name) => name !== meal.name);

  const slotNote =
    meal.slot === 'smoothie'
      ? '\n- This is a morning SMOOTHIE (blended drink). Lead with berries, greens, and seeds; keep it quick (~5 min).'
      : '';

  const prompt = `Suggest ONE replacement meal for a single slot in this Nutritarian weekly plan.

${userBlock}

THE MEAL TO REPLACE (${dayLabel}, ${meal.slot}):
"${meal.name}"${meal.description ? ` — ${meal.description}` : ''}

ALL OTHER MEAL NAMES ALREADY IN THIS WEEK (your replacement must NOT duplicate any of these):
${otherNames.map((n) => `- ${n}`).join('\n')}

YOUR TASK:
- Create ONE original ${meal.slot} to take this slot's place.
- It must be clearly DIFFERENT from "${meal.name}" and from every name listed above.
- Maximize gBOMBS coverage (greens, beans, onion, mushroom, berries, seeds).
- Strictly respect the diet mode, exclusions, and favored foods above.
- Keep prepMinutes realistic and matched to the user's cooking style.
- The name must be original (never copy a published recipe title).${slotNote}

Return ONLY valid JSON in EXACTLY this shape — no markdown, no extra keys:
{
  "name": "original dish name",
  "description": "one short appetizing sentence",
  "prepMinutes": 15,
  "gbombs": ["greens","beans"]
}

Rules for "gbombs": only include categories the meal actually contains, using
ONLY these exact values: greens, beans, onion, mushroom, berries, seeds.`;

  const raw = await callGeminiJson<RawMeal>(model, prompt, {
    systemPrompt: FUHRMAN_SYSTEM_PROMPT,
    temperature: 0.9, // high variety so repeated swaps feel fresh
    // gemini-2.5-flash thinks before answering, and thinking tokens draw from
    // this budget — a tight cap truncates the JSON mid-string. 4096 leaves
    // ample room to reason AND emit one small meal object.
    maxOutputTokens: 4096,
  });

  const name = (raw.name ?? '').trim();
  if (!name) {
    throw new Error('Swap came back empty — please try again.');
  }

  // Keep the original slot — the swap never changes where the meal sits.
  return {
    id: `${dayIndex + 1}-${meal.slot}-${slugify(name)}`,
    slot: meal.slot,
    name,
    description: (raw.description ?? '').trim(),
    prepMinutes:
      typeof raw.prepMinutes === 'number' && raw.prepMinutes > 0
        ? Math.round(raw.prepMinutes)
        : meal.prepMinutes,
    gbombs: normalizeCategories(raw.gbombs),
  };
}
