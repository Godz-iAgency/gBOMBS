/**
 * Prompt 4 — Weekly Grocery List Generator.
 * ------------------------------------------------------------------
 * Turns the 7-day meal plan into ONE consolidated shopping list. The plan only
 * carries meal names + descriptions (full recipes are generated lazily), so
 * this prompt asks the model to infer realistic Nutritarian ingredients per
 * meal, merge them across the whole week, and convert to real shopping units.
 * Always runs on Flash (grocery is a flash-only task — see client.ts), so the
 * prompt carries the intelligence: explicit consolidation rules + a worked
 * example the model can pattern-match against.
 */

import { callGeminiJson, getModel } from './client';
import { FUHRMAN_SYSTEM_PROMPT, renderUserContext } from './prompts';
import {
  GROCERY_SECTION_TITLES,
  type GBombsCategory,
  type GroceryItem,
  type GroceryList,
  type GrocerySection,
  type GrocerySectionTitle,
  type UserMealContext,
  type WeeklyMealPlan,
} from './types';

const VALID_CATEGORIES: GBombsCategory[] = [
  'greens',
  'beans',
  'onion',
  'mushroom',
  'berries',
  'seeds',
];

function normalizeCategory(input: unknown): GBombsCategory | null {
  const v = String(input ?? '').toLowerCase() as GBombsCategory;
  return VALID_CATEGORIES.includes(v) ? v : null;
}

/** Case-insensitive match against the canonical section titles. */
function normalizeSectionTitle(input: unknown): GrocerySectionTitle | null {
  const v = String(input ?? '').trim().toLowerCase();
  return (
    GROCERY_SECTION_TITLES.find((t) => t.toLowerCase() === v) ?? null
  );
}

/**
 * Safety net behind the prompt's QUANTITY FORMAT rule. The model should always
 * emit a unit, but if a bare integer ("6") slips through we append a sensible
 * count unit inferred from the item name so the row never reads "6  white onion".
 * Anything already carrying a unit (any non-digit char) is left untouched.
 */
function normalizeQuantity(quantity: string, item: string): string {
  const q = quantity.trim();
  if (!/^\d+$/.test(q)) return q; // already has a unit, or empty — leave alone
  const name = item.toLowerCase();
  let unit = 'whole';
  if (/\bgarlic\b/.test(name)) unit = 'heads';
  else if (/onion|shallot|leek|scallion|avocado|pepper|lemon|lime|apple|tomato|cucumber|banana/.test(name)) {
    unit = 'medium';
  }
  return `${q} ${unit}`;
}

/** Shape we ask the model to return (we add `checked` ourselves). */
interface RawItem {
  item?: string;
  quantity?: string;
  category?: unknown;
}
interface RawSection {
  title?: string;
  items?: RawItem[];
}
interface RawGroceryList {
  sections?: RawSection[];
}

/** Flatten the week's meals into compact prompt lines the model can scan. */
function renderMealLines(plan: WeeklyMealPlan): string {
  const lines: string[] = [];
  for (const day of plan.days) {
    for (const meal of day.meals) {
      const desc = meal.description ? ` — ${meal.description}` : '';
      lines.push(`- ${day.label} ${meal.slot}: ${meal.name}${desc}`);
    }
  }
  return lines.join('\n');
}

/**
 * Generate a consolidated grocery list for a weekly plan. Throws on no
 * provider / parse failure / empty result so the screen can show a retry state.
 */
export async function generateGroceryList(
  plan: WeeklyMealPlan,
  ctx: UserMealContext,
  tier: string
): Promise<GroceryList> {
  const model = getModel('grocery', tier);
  const userBlock = renderUserContext(ctx);
  const mealLines = renderMealLines(plan);
  const mealCount = plan.days.reduce((n, d) => n + d.meals.length, 0);

  const prompt = `Build ONE consolidated grocery shopping list for the 7-day Nutritarian meal plan below.

${userBlock}

THE WEEK'S MEALS (${mealCount} meals, assume 2 servings each):
${mealLines}

YOUR TASK — think like a professional meal-prep chef writing a shopping list:
1. INFER the realistic Nutritarian ingredients each meal needs from its name and
   description (whole foods only — no oil, no refined flour, no refined sugar).
2. CONSOLIDATE across the entire week: every ingredient appears EXACTLY ONCE in
   the final list, with one combined quantity that covers every meal using it.
3. CONVERT to real shopping units people buy at a store (bunches, bags, cans,
   lbs, containers, cartons) — never recipe units like "3.5 cups chopped".
4. ORGANIZE into store sections so the list follows a natural path through the store.

CONSOLIDATION EXAMPLES (follow this pattern exactly):
- Spinach appears in a Monday smoothie, a Wednesday salad, and a Friday stir-fry.
  WRONG: three separate spinach entries.
  RIGHT: one entry → { "item": "baby spinach", "quantity": "2 large bags (10 oz)", "category": "greens" }
- Two meals use dry lentils.
  RIGHT: { "item": "dry green lentils", "quantity": "1 lb bag", "category": "beans" }
- Three meals use chickpeas.
  RIGHT: { "item": "chickpeas", "quantity": "3 cans (15 oz)", "category": "beans" }
- Several meals use onions and garlic (items sold by count, not weight).
  WRONG: { "item": "white onion", "quantity": "6" }  ← bare number, no unit.
  RIGHT: { "item": "white onions", "quantity": "6 medium", "category": "onion" }
  RIGHT: { "item": "garlic", "quantity": "2 heads", "category": "onion" }
- Several smoothies use frozen berries.
  RIGHT (in Frozen): { "item": "frozen mixed berries", "quantity": "2 bags (12 oz)", "category": "berries" }
- Several desserts are sweetened with dates (sold in pantry bags, never by count).
  RIGHT (in Pantry): { "item": "Medjool dates", "quantity": "1 lb bag", "category": null }
- Bananas appear in a smoothie AND a banana-date dessert — merge into ONE entry.
  WRONG: { "item": "bananas", "quantity": "8" }  ← bare number, no unit.
  RIGHT (in Produce): { "item": "bananas", "quantity": "8 medium", "category": null }
- Chia seeds appear in a smoothie AND a chia-pudding dessert — ONE combined entry.
  RIGHT (in Nuts & Seeds): { "item": "chia seeds", "quantity": "1 bag (12 oz)", "category": "seeds" }
- A dessert uses black beans (e.g. black bean brownies) and a dinner also uses them.
  RIGHT (in Beans & Proteins): { "item": "black beans", "quantity": "4 cans (15 oz)", "category": "beans" }
- A chocolate dessert uses raw cacao powder.
  RIGHT (in Pantry): { "item": "raw cacao powder", "quantity": "1 bag (8 oz)", "category": null }

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
  honey, agave, coconut sugar, or any packaged sweetener — they must not appear anywhere.
- DESSERT INGREDIENT ROUTING: dates, raw cacao powder, unsweetened coconut flakes,
  nut/seed butters, vanilla, and rolled oats → "Pantry" (oats may go in "Whole Grains").
  Fresh bananas → "Produce". Pre-frozen fruit used for "nice cream" → "Frozen".
- CROSS-MEAL CONSOLIDATION: ingredients shared between desserts and other meals
  (chia seeds, black beans, oats, nut butters, berries, bananas) appear EXACTLY ONCE
  with a combined quantity — never as separate dessert vs. meal lines.

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

  const raw = await callGeminiJson<RawGroceryList>(model, prompt, {
    systemPrompt: FUHRMAN_SYSTEM_PROMPT,
    temperature: 0.3, // consistency over creativity — this is bookkeeping
    maxOutputTokens: 8192,
  });

  // Normalize: valid section titles only, canonical order, global dedupe.
  const bySection = new Map<GrocerySectionTitle, GroceryItem[]>();
  const seenItems = new Set<string>();

  for (const rs of raw.sections ?? []) {
    const title = normalizeSectionTitle(rs.title);
    if (!title) continue;
    const bucket = bySection.get(title) ?? [];
    for (const ri of rs.items ?? []) {
      const item = (ri.item ?? '').trim();
      if (!item) continue;
      const dedupeKey = item.toLowerCase();
      if (seenItems.has(dedupeKey)) continue; // first occurrence wins
      seenItems.add(dedupeKey);
      bucket.push({
        item,
        quantity: normalizeQuantity((ri.quantity ?? '').trim(), item),
        category: normalizeCategory(ri.category),
        checked: false,
      });
    }
    if (bucket.length > 0) bySection.set(title, bucket);
  }

  const sections: GrocerySection[] = GROCERY_SECTION_TITLES.filter((t) =>
    bySection.has(t)
  ).map((t) => ({ title: t, items: bySection.get(t)! }));

  if (sections.length === 0) {
    throw new Error('Grocery list came back empty — please try again.');
  }

  return {
    generatedAt: new Date().toISOString(),
    planGeneratedAt: plan.generatedAt,
    modelUsed: model,
    sections,
  };
}
