// autopilot-generate
// ---------------------------------------------------------------------------
// Autopilot Mode 2: weekly hands-off plan generation. Called HOURLY by pg_cron
// (see supabase/schedule_autopilot_generation.sql). For each opted-in user
// (users.autopilot_enabled) it computes their LOCAL day + hour from the stored
// IANA timezone and, when it's their chosen day (users.autopilot_day) between
// 6pm and 11pm local — and no plan was generated in the last 20 hours — it:
//
//   1. builds their personalization context (diet/goal/style + food prefs),
//   2. folds in any trainer adjustments queued 'pending_next_cycle',
//   3. generates a fresh 7-day plan with Gemini and upserts meal_plans,
//   4. generates the consolidated grocery list and upserts grocery_lists,
//   5. marks the consumed adjustments 'applied',
//   6. pushes "your fresh week is ready" if the user has a push token.
//
// The 6pm–11pm window (rather than == 6pm) makes the job self-healing: a user
// skipped at 6pm (cap overflow / transient failure) is retried each hour until
// midnight. The 20-hour idempotency guard stops double-generation — including
// when the user already generated manually earlier that day.
//
// The prompts here are ports of src/services/gemini/{mealPlan,grocery}.ts —
// the client generates with the same instructions, so autopilot output is
// indistinguishable from a manual generation. (Client AI calls move server-side
// wholesale in Step 13; this function is the first piece of that migration.)
//
// TESTING: POST {"force_user_id": "<uuid>"} (with the service-role key) to
// bypass the day/hour/recency gates for that one user.
//
// Auth: verify_jwt off (pg_cron is not a user); requires the service-role key
// in the Authorization header instead. Requires the GEMINI_API_KEY secret.
// ---------------------------------------------------------------------------

import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { jsonrepair } from 'https://esm.sh/jsonrepair@3';

const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const admin = createClient(Deno.env.get('SUPABASE_URL')!, SERVICE_ROLE_KEY);

const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY') ?? '';
const GEMINI_ENDPOINT =
  'https://generativelanguage.googleapis.com/v1beta/models';
const FLASH_MODEL = Deno.env.get('GEMINI_FLASH_MODEL') ?? 'gemini-2.5-flash';
const PRO_MODEL = Deno.env.get('GEMINI_PRO_MODEL') ?? 'gemini-2.5-flash';

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

/** Local-evening window: generate from 6pm through 11pm on the chosen day. */
const WINDOW_START_HOUR = 18;
/** Skip anyone whose plan is younger than this (idempotency + manual-gen respect). */
const RECENT_HOURS = 20;
/** Wall-clock guard: each user costs ~30–40s of AI calls. */
const MAX_GENERATIONS_PER_RUN = 3;

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

/** Local hour (0–23) and day-of-week (0=Sun…6=Sat) for an IANA timezone. */
function localParts(tz: string): { hour: number; dow: number } {
  const now = new Date();
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      hour: '2-digit',
      hourCycle: 'h23',
      weekday: 'short',
    }).formatToParts(now);
    const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
    const hour = parseInt(get('hour'), 10);
    const dowMap: Record<string, number> = {
      Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6,
    };
    const dow = dowMap[get('weekday')] ?? -1;
    return { hour: Number.isNaN(hour) ? -1 : hour, dow };
  } catch {
    return { hour: -1, dow: -1 }; // bad timezone string → never matches
  }
}

// ---------------------------------------------------------------------------
// Gemini (lean port of src/services/gemini/client.ts — Gemini only, 3 retries,
// escalating JSON repair)
// ---------------------------------------------------------------------------

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function geminiOnce(
  model: string,
  userPrompt: string,
  opts: { temperature: number; maxOutputTokens: number; systemPrompt: string }
): Promise<string> {
  const res = await fetch(
    `${GEMINI_ENDPOINT}/${model}:generateContent?key=${GEMINI_API_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: userPrompt }] }],
        systemInstruction: { parts: [{ text: opts.systemPrompt }] },
        generationConfig: {
          temperature: opts.temperature,
          maxOutputTokens: opts.maxOutputTokens,
          responseMimeType: 'application/json',
        },
      }),
    }
  );
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    const err = new Error(
      `Gemini ${model} HTTP ${res.status}: ${detail.slice(0, 180)}`
    ) as Error & { status: number };
    err.status = res.status;
    throw err;
  }
  const data = await res.json();
  return data?.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
}

/** First balanced JSON value in a string (string-aware brace counting). */
function extractJsonBlock(input: string): string {
  const start = input.search(/[[{]/);
  if (start === -1) return input.trim();
  const open = input[start];
  const close = open === '{' ? '}' : ']';
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < input.length; i++) {
    const ch = input[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === open) depth++;
    else if (ch === close) {
      depth--;
      if (depth === 0) return input.slice(start, i + 1);
    }
  }
  return input.slice(start);
}

async function callGeminiJson<T>(
  model: string,
  userPrompt: string,
  opts: { temperature: number; maxOutputTokens: number; systemPrompt: string }
): Promise<T> {
  let text = '';
  let lastErr: unknown;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      text = await geminiOnce(model, userPrompt, opts);
      break;
    } catch (e) {
      lastErr = e;
      const status = (e as { status?: number }).status ?? 0;
      const transient =
        status === 0 || status === 429 || (status >= 500 && status <= 504);
      if (!transient || attempt === 3) throw e;
      await sleep(attempt * 1500);
    }
  }
  if (!text) {
    throw lastErr instanceof Error ? lastErr : new Error('Empty AI response');
  }

  const defenced = text.replace(/```json|```/g, '').trim();
  try {
    return JSON.parse(defenced) as T;
  } catch {
    /* repair */
  }
  const block = extractJsonBlock(defenced);
  try {
    return JSON.parse(block) as T;
  } catch {
    return JSON.parse(jsonrepair(block)) as T;
  }
}

// ---------------------------------------------------------------------------
// Prompts + normalization (ports of src/services/gemini — keep in sync)
// ---------------------------------------------------------------------------

const FUHRMAN_SYSTEM_PROMPT = `
You are a Nutritarian meal-planning expert who follows the whole-food,
plant-based principles popularized by Dr. Joel Fuhrman's gBOMBS framework.

THE gBOMBS SUPERFOODS (prioritize these in every meal):
- G — Greens: leafy greens (kale, spinach, arugula, collards, chard, etc.)
- B — Beans: legumes & pulses (lentils, chickpeas, black beans, edamame, etc.)
- O — Onions: alliums (onion, garlic, leeks, shallots, chives, scallions)
- M — Mushrooms: edible fungi (shiitake, cremini, portobello, oyster, etc.)
- B — Berries: berries & small fruits (blueberries, raspberries, goji, etc.)
- S — Seeds & nuts: raw seeds/nuts (chia, flax, hemp, walnuts, almonds, etc.)

NUTRITARIAN RULES (follow strictly):
1. Whole, unprocessed foods only. No refined flour, no refined sugar.
2. No added oil. Use water/broth sautéing, blended nuts/seeds, or whole-food
   fats (avocado, tahini, nut butters) instead.
3. Keep added salt minimal; lean on herbs, spices, citrus, vinegar, alliums.
4. Maximize micronutrient density per calorie (the "nutrient-dense" goal).
5. Aim to include as many of the six gBOMBS categories as naturally fit a dish.

ORIGINALITY (important):
- Generate ORIGINAL recipes and meal names. Do NOT reproduce any published
  recipe text. Write new content inspired by Nutritarian principles only.

OUTPUT DISCIPLINE:
- When asked for JSON, return ONLY valid JSON — no markdown, no commentary.
`.trim();

interface UserMealContext {
  dietMode: string;
  healthGoal: string;
  cookingStyle: string;
  preferredFoods: string[];
  excludedFoods: string[];
}

function renderUserContext(ctx: UserMealContext): string {
  const lines = [
    `- Diet mode: ${ctx.dietMode}`,
    `- Health goal: ${ctx.healthGoal}`,
    `- Cooking style: ${ctx.cookingStyle}`,
  ];
  if (ctx.preferredFoods.length) {
    lines.push(`- Favors these foods: ${ctx.preferredFoods.join(', ')}`);
  }
  if (ctx.excludedFoods.length) {
    lines.push(
      `- NEVER include (allergies/exclusions): ${ctx.excludedFoods.join(', ')}`
    );
  }
  if (ctx.dietMode === 'vegan') {
    lines.push('- Vegan: no animal products of any kind (no eggs, no dairy).');
  } else if (ctx.dietMode === 'vegetarian') {
    lines.push('- Vegetarian: eggs and dairy allowed; no meat or fish.');
  }
  return `USER CONTEXT:\n${lines.join('\n')}`;
}

type MealSlot = 'smoothie' | 'breakfast' | 'lunch' | 'dinner' | 'dessert';
type GBombsCategory =
  | 'greens' | 'beans' | 'onion' | 'mushroom' | 'berries' | 'seeds';

const VALID_CATEGORIES: GBombsCategory[] = [
  'greens', 'beans', 'onion', 'mushroom', 'berries', 'seeds',
];
const DAY_LABELS = [
  'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday',
];
const SLOT_ORDER: Record<MealSlot, number> = {
  smoothie: 0, breakfast: 1, lunch: 2, dinner: 3, dessert: 4,
};

interface MealSummary {
  id: string;
  slot: MealSlot;
  name: string;
  description: string;
  prepMinutes: number;
  gbombs: GBombsCategory[];
}
interface DayPlan {
  day: number;
  label: string;
  meals: MealSummary[];
}
interface WeeklyMealPlan {
  generatedAt: string;
  tierUsed: string;
  modelUsed: string;
  days: DayPlan[];
  weeklyScore: { categoriesHit: GBombsCategory[]; score: number; total: number };
}

function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}
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
  return v === 'breakfast' || v === 'lunch' || v === 'dinner' ||
      v === 'smoothie' || v === 'dessert'
    ? (v as MealSlot)
    : 'breakfast';
}
function computeWeeklyScore(days: DayPlan[]) {
  const set = new Set<GBombsCategory>();
  for (const d of days) for (const m of d.meals) for (const c of m.gbombs) set.add(c);
  return { categoriesHit: [...set], score: set.size, total: 6 };
}

interface RawMeal {
  slot?: string; name?: string; description?: string;
  prepMinutes?: number; gbombs?: unknown;
}
interface RawPlan { days?: { meals?: RawMeal[] }[] }

async function generatePlan(
  ctx: UserMealContext,
  tier: string,
  adjustments: string[]
): Promise<WeeklyMealPlan> {
  const model = tier === 'wellness_pro' ? PRO_MODEL : FLASH_MODEL;
  const userBlock = renderUserContext(ctx);
  const adjustmentBlock = adjustments.length
    ? `\nTRAINER / NUTRITIONIST ADJUSTMENTS — the client's professional requested these; honor them as much as possible WITHOUT breaking any Nutritarian rule above:\n${adjustments
        .map((a) => `- ${a}`)
        .join('\n')}\n`
    : '';

  const prompt = `Create an original 7-day Nutritarian meal plan (Monday through Sunday).

${userBlock}
${adjustmentBlock}
REQUIREMENTS:
- Each day has EXACTLY five items in this order:
  smoothie, breakfast, lunch, dinner, dessert.
- The smoothie is a morning drink (blended) and should lead with berries, greens,
  and seeds where possible — a nutrient-dense start to the day.
- The dessert is a Nutritarian sweet — naturally sweetened with whole fruits
  (dates, bananas, berries, ripe mango) ONLY. NO refined sugar, NO white flour,
  NO maple syrup/honey/agave, NO added oil. Every dessert MUST hit at least one
  gBOMBS category (favor berries and seeds; beans are the creative wildcard).
  Desserts should feel genuinely satisfying — rewards, not penalties. Keep
  prepMinutes 5–20 (no-bake preferred; chilling/freezing time is NOT counted).
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
        }
      ]
    }
  ]
}

Rules for "gbombs": only include categories the meal actually contains, and use
ONLY these exact values: greens, beans, onion, mushroom, berries, seeds.`;

  const raw = await callGeminiJson<RawPlan>(model, prompt, {
    systemPrompt: FUHRMAN_SYSTEM_PROMPT,
    temperature: 0.8,
    maxOutputTokens: 8192,
  });

  const rawDays = Array.isArray(raw.days) ? raw.days : [];
  if (rawDays.length === 0) throw new Error('Meal plan came back empty');

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

// ---- Grocery list (port of src/services/gemini/grocery.ts) ----------------

const GROCERY_SECTION_TITLES = [
  'Produce', 'Beans & Proteins', 'Whole Grains', 'Nuts & Seeds',
  'Frozen', 'Pantry', 'Spices & Herbs', 'Dairy Alternatives',
] as const;
type GrocerySectionTitle = (typeof GROCERY_SECTION_TITLES)[number];

interface GroceryItem {
  item: string;
  quantity: string;
  category: GBombsCategory | null;
  checked: boolean;
}
interface GroceryList {
  generatedAt: string;
  planGeneratedAt: string;
  modelUsed: string;
  sections: { title: GrocerySectionTitle; items: GroceryItem[] }[];
}

function normalizeSectionTitle(input: unknown): GrocerySectionTitle | null {
  const v = String(input ?? '').trim().toLowerCase();
  return GROCERY_SECTION_TITLES.find((t) => t.toLowerCase() === v) ?? null;
}
function normalizeCategory(input: unknown): GBombsCategory | null {
  const v = String(input ?? '').toLowerCase() as GBombsCategory;
  return VALID_CATEGORIES.includes(v) ? v : null;
}
function normalizeQuantity(quantity: string, item: string): string {
  const q = quantity.trim();
  if (!/^\d+$/.test(q)) return q;
  const name = item.toLowerCase();
  let unit = 'whole';
  if (/\bgarlic\b/.test(name)) unit = 'heads';
  else if (/onion|shallot|leek|scallion|avocado|pepper|lemon|lime|apple|tomato|cucumber|banana/.test(name)) {
    unit = 'medium';
  }
  return `${q} ${unit}`;
}

interface RawGroceryList {
  sections?: { title?: string; items?: { item?: string; quantity?: string; category?: unknown }[] }[];
}

async function generateGrocery(
  plan: WeeklyMealPlan,
  ctx: UserMealContext
): Promise<GroceryList> {
  const userBlock = renderUserContext(ctx);
  const mealLines: string[] = [];
  for (const day of plan.days) {
    for (const meal of day.meals) {
      const desc = meal.description ? ` — ${meal.description}` : '';
      mealLines.push(`- ${day.label} ${meal.slot}: ${meal.name}${desc}`);
    }
  }
  const mealCount = plan.days.reduce((n, d) => n + d.meals.length, 0);

  const prompt = `Build ONE consolidated grocery shopping list for the 7-day Nutritarian meal plan below.

${userBlock}

THE WEEK'S MEALS (${mealCount} meals, assume 2 servings each):
${mealLines.join('\n')}

YOUR TASK — think like a professional meal-prep chef writing a shopping list:
1. INFER the realistic Nutritarian ingredients each meal needs from its name and
   description (whole foods only — no oil, no refined flour, no refined sugar).
2. CONSOLIDATE across the entire week: every ingredient appears EXACTLY ONCE in
   the final list, with one combined quantity that covers every meal using it.
3. CONVERT to real shopping units people buy at a store (bunches, bags, cans,
   lbs, containers, cartons) — never recipe units like "3.5 cups chopped".
4. ORGANIZE into store sections so the list follows a natural path through the store.

SECTIONS — use ONLY these titles, in this order, omitting any empty section:
"Produce", "Beans & Proteins", "Whole Grains", "Nuts & Seeds", "Frozen", "Pantry", "Spices & Herbs", "Dairy Alternatives"

HARD RULES:
- QUANTITY FORMAT: every "quantity" MUST be a number followed by a real unit —
  never a bare number. Items sold by count (onions, garlic, avocados, peppers,
  lemons) use "6 medium", "2 heads", "4 large". Items sold by weight/volume use
  "1 lb bag", "2 cans (15 oz)", "10 oz bag". "6" alone is always WRONG.
- Every ingredient appears exactly once across the ENTIRE list — never in two sections.
- Strictly respect the user context: excluded foods must NOT appear anywhere.
- No oil of any kind, no refined sugar/flour, no processed or packaged prepared foods.
- Fresh produce goes in "Produce"; frozen fruit/vegetables go in "Frozen".
- Plant milks and non-dairy yogurt go in "Dairy Alternatives".
- Quantities must be generous enough to actually cook all ${mealCount} meals (2 servings each).
- Tag each item's "category" with its gBOMBS group (greens, beans, onion, mushroom,
  berries, seeds) or null if it is none of the six.
- DESSERT SWEETENERS: desserts are sweetened ONLY with whole foods (Medjool dates,
  bananas, berries, ripe fruit). NEVER list refined sugar, brown sugar, maple syrup,
  honey, agave, coconut sugar, or any packaged sweetener.

Return ONLY valid JSON in EXACTLY this shape — no markdown, no extra keys:
{
  "sections": [
    {
      "title": "Produce",
      "items": [
        { "item": "baby spinach", "quantity": "2 large bags (10 oz)", "category": "greens" }
      ]
    }
  ]
}`;

  const raw = await callGeminiJson<RawGroceryList>(FLASH_MODEL, prompt, {
    systemPrompt: FUHRMAN_SYSTEM_PROMPT,
    temperature: 0.3,
    maxOutputTokens: 8192,
  });

  const bySection = new Map<GrocerySectionTitle, GroceryItem[]>();
  const seenItems = new Set<string>();
  for (const rs of raw.sections ?? []) {
    const title = normalizeSectionTitle(rs.title);
    if (!title) continue;
    const bucket = bySection.get(title) ?? [];
    for (const ri of rs.items ?? []) {
      const item = (ri.item ?? '').trim();
      if (!item) continue;
      const key = item.toLowerCase();
      if (seenItems.has(key)) continue;
      seenItems.add(key);
      bucket.push({
        item,
        quantity: normalizeQuantity((ri.quantity ?? '').trim(), item),
        category: normalizeCategory(ri.category),
        checked: false,
      });
    }
    if (bucket.length > 0) bySection.set(title, bucket);
  }

  const sections = GROCERY_SECTION_TITLES.filter((t) => bySection.has(t)).map(
    (t) => ({ title: t, items: bySection.get(t)! })
  );
  if (sections.length === 0) throw new Error('Grocery list came back empty');

  return {
    generatedAt: new Date().toISOString(),
    planGeneratedAt: plan.generatedAt,
    modelUsed: FLASH_MODEL,
    sections,
  };
}

// ---------------------------------------------------------------------------
// Per-user pipeline
// ---------------------------------------------------------------------------

interface CandidateUser {
  id: string;
  timezone: string | null;
  autopilot_day: number | null;
  subscription_tier: string;
  subscription_status: string;
  diet_mode: string;
  health_goal: string;
  cooking_style: string;
  push_token: string | null;
}

async function generateForUser(u: CandidateUser): Promise<void> {
  // Personalization context (likes + exclusions).
  const { data: prefs } = await admin
    .from('food_preferences')
    .select('food_item, is_excluded, is_active')
    .eq('user_id', u.id);
  const preferredFoods: string[] = [];
  const excludedFoods: string[] = [];
  for (const p of prefs ?? []) {
    if (p.is_excluded) excludedFoods.push(p.food_item);
    else if (p.is_active) preferredFoods.push(p.food_item);
  }
  const ctx: UserMealContext = {
    dietMode: u.diet_mode,
    healthGoal: u.health_goal,
    cookingStyle: u.cooking_style,
    preferredFoods,
    excludedFoods,
  };

  // Queued trainer adjustments for this cycle.
  const { data: adj } = await admin
    .from('professional_edits')
    .select('id, new_value')
    .eq('client_id', u.id)
    .eq('edit_type', 'suggested_meal_adjustment')
    .eq('status', 'pending_next_cycle')
    .order('created_at', { ascending: true });
  const adjustments = (adj ?? [])
    .map((a) => (a.new_value as string) ?? '')
    .filter((s) => s.trim().length > 0);

  // 1. Plan.
  const plan = await generatePlan(ctx, u.subscription_tier, adjustments);
  const { error: planErr } = await admin.from('meal_plans').upsert(
    {
      user_id: u.id,
      plan,
      generated_at: plan.generatedAt,
      tier_used: plan.tierUsed,
      model_used: plan.modelUsed,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'user_id' }
  );
  if (planErr) throw new Error(`meal_plans upsert: ${planErr.message}`);

  // 2. Grocery list (best-effort: the plan alone is already a success).
  try {
    const grocery = await generateGrocery(plan, ctx);
    await admin.from('grocery_lists').upsert(
      {
        user_id: u.id,
        list: grocery,
        plan_generated_at: grocery.planGeneratedAt,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id' }
    );
  } catch (e) {
    console.error(`grocery failed for ${u.id}:`, (e as Error).message);
  }

  // 3. Consume the adjustments that made it into this plan.
  if (adj && adj.length > 0) {
    await admin
      .from('professional_edits')
      .update({ status: 'applied', applied_at: new Date().toISOString() })
      .in('id', adj.map((a) => a.id));
  }

  // 4. Tell the user their week is ready.
  if (u.push_token) {
    try {
      await fetch(EXPO_PUSH_URL, {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify([
          {
            to: u.push_token,
            sound: 'default',
            title: '🥗 Your fresh week is ready',
            body: 'Autopilot just planned your next 7 days — meals and grocery list included.',
            data: { type: 'autopilot_plan' },
            channelId: 'default',
          },
        ]),
      });
    } catch {
      /* push is a nice-to-have */
    }
  }
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

Deno.serve(async (req) => {
  const auth = req.headers.get('Authorization') ?? '';
  if (auth !== `Bearer ${SERVICE_ROLE_KEY}`) {
    return json({ error: 'Unauthorized' }, 401);
  }
  if (!GEMINI_API_KEY) {
    return json({ error: 'GEMINI_API_KEY secret is not set' }, 500);
  }

  // Optional test hook: {"force_user_id": "<uuid>"} skips the time/recency
  // gates for that one user (still requires opt-in + active subscription).
  let forceUserId: string | null = null;
  try {
    const body = await req.json();
    if (body && typeof body.force_user_id === 'string') {
      forceUserId = body.force_user_id;
    }
  } catch {
    /* empty body is the normal cron case */
  }

  const { data: users, error } = await admin
    .from('users')
    .select(
      'id, timezone, autopilot_day, subscription_tier, subscription_status, diet_mode, health_goal, cooking_style, push_token'
    )
    .eq('autopilot_enabled', true);
  if (error) return json({ error: error.message }, 500);

  const results: Record<string, string> = {};
  let generated = 0;

  for (const u of (users ?? []) as CandidateUser[]) {
    if (forceUserId && u.id !== forceUserId) continue;

    // Paying (or trialing) members only — don't burn AI tokens on lapsed accounts.
    if (!['active', 'trialing'].includes(u.subscription_status)) {
      if (forceUserId) results[u.id] = 'skipped: subscription not active';
      continue;
    }

    if (!forceUserId) {
      // Local-evening window on the chosen day.
      const tz = u.timezone || 'America/New_York';
      const { hour, dow } = localParts(tz);
      if (u.autopilot_day === null || dow !== u.autopilot_day) continue;
      if (hour < WINDOW_START_HOUR) continue;

      // Recency guard: manual generation earlier today (or a previous cron
      // pass this evening) means there's nothing to do.
      const { data: mp } = await admin
        .from('meal_plans')
        .select('generated_at')
        .eq('user_id', u.id)
        .maybeSingle();
      if (mp?.generated_at) {
        const ageMs = Date.now() - new Date(mp.generated_at).getTime();
        if (ageMs < RECENT_HOURS * 3600_000) continue;
      }

      if (generated >= MAX_GENERATIONS_PER_RUN) {
        results[u.id] = 'deferred: per-run cap (next hour retries)';
        continue;
      }
    }

    try {
      await generateForUser(u);
      generated += 1;
      results[u.id] = 'generated';
    } catch (e) {
      results[u.id] = `failed: ${(e as Error).message}`;
      console.error(`autopilot failed for ${u.id}:`, e);
    }

    if (forceUserId) break;
  }

  return json({ optedIn: users?.length ?? 0, generated, results });
});
