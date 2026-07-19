// usda-nutrition
// ---------------------------------------------------------------------------
// Estimates per-serving nutrition for a recipe from its ingredient list using
// the USDA FoodData Central API. For each ingredient we search FDC for the best
// whole-food match, convert its quantity to grams, scale the food's per-100g
// nutrients, then sum across ingredients and divide by servings.
//
// Nutrition from automated ingredient parsing is inherently an ESTIMATE — the
// volume→weight conversion ("1 cup" → grams) varies by food — so the result is
// always flagged estimated and the UI labels it as such. The nutrient values
// themselves are real USDA data; only the gram conversion is approximate.
//
// The USDA_API_KEY is a secret held only here (no EXPO_PUBLIC_ prefix), never
// shipped to the app — same pattern as create-instacart-list. Auth: verify_jwt
// is off in config.toml; we validate the caller's Supabase JWT here so only
// signed-in users can spend our key.
// ---------------------------------------------------------------------------

import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const USDA_API_KEY = Deno.env.get('USDA_API_KEY') ?? '';
const FDC_SEARCH = 'https://api.nal.usda.gov/fdc/v1/foods/search';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

// ---- Quantity → grams -----------------------------------------------------
// Mass units convert exactly. Volume units — "cup" above all — do NOT: a cup
// of liquid oat milk (~240g) and a cup of loosely-packed raw greens (~30-55g)
// differ by nearly an order of magnitude, and a single flat number for every
// "cup" systematically overweights light, fluffy foods (greens especially,
// since fiber-per-gram is high there). We resolve "cup" using the ingredient's
// own gBOMBS category — already tagged by the recipe generator — plus simple
// name-based liquid detection, falling back to a mid-range default only when
// neither signal applies. tbsp/tsp scale off the same resolved cup weight
// (16 tbsp / 48 tsp per cup) so they inherit the same density awareness.

const DEFAULT_GRAMS = 100; // when no unit/category signal applies at all

const MASS_GRAMS_PER_UNIT: Record<string, number> = {
  g: 1, gram: 1, grams: 1, kg: 1000, mg: 0.001,
  oz: 28.35, ounce: 28.35, ounces: 28.35,
  lb: 453.6, lbs: 453.6, pound: 453.6, pounds: 453.6,
  ml: 1, milliliter: 1, l: 1000, liter: 1000, liters: 1000,
};

/** Household/count units whose weight doesn't vary enough by food category to
 *  be worth splitting further (a clove of garlic is a clove of garlic). */
const COUNT_GRAMS_PER_UNIT: Record<string, number> = {
  clove: 5, cloves: 5,
  slice: 25, slices: 25,
  handful: 30, handfuls: 30,
  pinch: 0.5, pinches: 0.5,
  can: 400, cans: 400,
  bunch: 150, bunches: 150,
  head: 500, heads: 500,
  stalk: 40, stalks: 40,
  sprig: 3, sprigs: 3,
  piece: 100, pieces: 100,
};

/** Bare size adjectives ("1 large", "2 medium") — used ONLY as a last-resort
 *  fallback when no other unit word is present, since they describe an
 *  unnamed whole item ("1 large [onion]"), not a measure like "cup"/"handful". */
const SIZE_FALLBACK_GRAMS: Record<string, number> = {
  small: 60, medium: 120, large: 180,
};

/** Grams per CUP by gBOMBS category — the unit most sensitive to density. */
const CUP_GRAMS_BY_CATEGORY: Record<string, number> = {
  greens: 35, // raw leafy greens are mostly air, loosely packed
  beans: 170, // cooked legumes pack densely
  onion: 115, // chopped allium
  mushroom: 70, // sliced
  berries: 150, // near water-density with small gaps
  seeds: 130, // nuts/seeds pack fairly densely
};
const CUP_GRAMS_DEFAULT = 150; // unclassified solid food
const CUP_GRAMS_LIQUID = 240; // near water density

const LIQUID_WORDS = ['milk', 'water', 'juice', 'broth', 'stock', 'kombucha', 'tea', 'coffee'];

/** "Packed" roughly doubles the effective density of a loose cup measure —
 *  matters most for greens ("2 cups packed spinach" is not "2 cups loose"). */
const PACKED_MULTIPLIER = 1.8;

function isLiquid(item: string): boolean {
  const s = item.toLowerCase();
  return LIQUID_WORDS.some((w) => s.includes(w));
}

/** Resolve grams-per-cup for this specific ingredient: liquid name match first,
 *  then its gBOMBS category, then a generic solid-food default. */
function cupGramsFor(item: string, category: string | null): number {
  if (isLiquid(item)) return CUP_GRAMS_LIQUID;
  if (category && CUP_GRAMS_BY_CATEGORY[category] != null) {
    return CUP_GRAMS_BY_CATEGORY[category];
  }
  return CUP_GRAMS_DEFAULT;
}

/** Parse the leading amount from a quantity string: "1 1/2", "1/2", "2-3", "1.5". */
function parseAmount(raw: string): number {
  const s = raw.trim();
  // mixed number "1 1/2"
  const mixed = s.match(/^(\d+)\s+(\d+)\/(\d+)/);
  if (mixed) return Number(mixed[1]) + Number(mixed[2]) / Number(mixed[3]);
  // simple fraction "1/2"
  const frac = s.match(/^(\d+)\/(\d+)/);
  if (frac) return Number(frac[1]) / Number(frac[2]);
  // range "2-3" → take the lower bound
  const range = s.match(/^(\d*\.?\d+)\s*[-–]\s*\d*\.?\d+/);
  if (range) return Number(range[1]);
  // plain number "1.5" / "2"
  const num = s.match(/^(\d*\.?\d+)/);
  if (num) return Number(num[1]);
  return 1;
}

/**
 * Convert an ingredient quantity string to an approximate gram weight, using
 * the ingredient's name (liquid detection) and gBOMBS category (density) to
 * resolve volume units accurately. Specific unit words (cup, tbsp, handful,
 * clove, mass units, ...) are searched for FIRST across the whole string;
 * bare size adjectives (small/medium/large) are only used as a fallback when
 * no other unit is found — otherwise "2 large handfuls" would match "large"
 * before reaching "handfuls" and silently treat it as 2 whole items instead.
 */
function quantityToGrams(quantity: string, item: string, category: string | null): number {
  const amount = parseAmount(quantity);
  const lower = quantity.toLowerCase();
  const words = lower.match(/[a-z]+/g) ?? [];

  const cupGrams = cupGramsFor(item, category);
  const density = /packed/.test(lower) ? cupGrams * PACKED_MULTIPLIER : cupGrams;

  let per: number | null = null;
  for (const w of words) {
    if (w === 'cup' || w === 'cups') { per = density; break; }
    if (w === 'tbsp' || w === 'tablespoon' || w === 'tablespoons') { per = density / 16; break; }
    if (w === 'tsp' || w === 'teaspoon' || w === 'teaspoons') { per = density / 48; break; }
    if (MASS_GRAMS_PER_UNIT[w] != null) { per = MASS_GRAMS_PER_UNIT[w]; break; }
    if (COUNT_GRAMS_PER_UNIT[w] != null) { per = COUNT_GRAMS_PER_UNIT[w]; break; }
  }
  if (per == null) {
    for (const w of words) {
      if (SIZE_FALLBACK_GRAMS[w] != null) { per = SIZE_FALLBACK_GRAMS[w]; break; }
    }
  }
  if (per == null) per = DEFAULT_GRAMS;

  const grams = amount * per;
  // Guard against absurd values from odd strings.
  return grams > 0 && grams < 10000 ? grams : DEFAULT_GRAMS;
}

// ---- USDA nutrient extraction ---------------------------------------------
// FDC nutrient numbers (stable across data types).
const N_ENERGY = '208'; // kcal (nutrientNumber); nutrientId 1008
const N_PROTEIN = '203';
const N_FAT = '204';
const N_CARBS = '205';
const N_FIBER = '291';

interface FdcNutrient {
  nutrientId?: number;
  nutrientNumber?: string;
  nutrientName?: string;
  unitName?: string;
  value?: number;
}

interface Macros {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  fiber: number;
}

const ID_BY_NUMBER: Record<string, number> = {
  [N_ENERGY]: 1008,
  [N_PROTEIN]: 1003,
  [N_FAT]: 1004,
  [N_CARBS]: 1005,
  [N_FIBER]: 1079,
};

/** Pull a nutrient's per-100g value by its FDC number (matches id or number).
 *  A per-100g value can never legitimately exceed 100 (that would mean more
 *  than 100g of the nutrient in 100g of food) — clamping a corrupt/misread
 *  value to 0 here is cheap insurance against silently multiplying garbage
 *  through the rest of the calculation. */
function nutrientValue(nutrients: FdcNutrient[], number: string): number {
  const id = ID_BY_NUMBER[number];
  for (const n of nutrients) {
    if (n.nutrientNumber === number || (id && n.nutrientId === id)) {
      const v = typeof n.value === 'number' ? n.value : 0;
      return v >= 0 && v <= 100 ? v : 0;
    }
  }
  // Energy fallback ONLY for the two specific, known Atwater nutrient numbers
  // (957 = General Factors, 958 = Specific Factors) — some Foundation-type
  // records omit 208 and report kcal under these instead. Explicitly checking
  // these two numbers, in this preference order, rather than accepting ANY
  // nutrient tagged unit=KCAL anywhere in the array, avoids ever picking up an
  // unrelated KCAL-labeled value that isn't actually this food's energy.
  if (number === N_ENERGY) {
    for (const fallbackNumber of ['957', '958']) {
      const n = nutrients.find((x) => x.nutrientNumber === fallbackNumber);
      if (n && typeof n.value === 'number') return n.value;
    }
  }
  return 0;
}

// ---- Ingredient → best USDA record --------------------------------------
// USDA full-text search ranks on relevance, and the top hit is frequently the
// WRONG record: a different form of the food ("Amaranth grain" for "amaranth
// greens"), a sweetened version ("Strawberries, frozen, sweetened"), a prepared
// composite that merely shares a word ("Gravy, mushroom, dry, powder" for
// "reishi mushroom powder"), or an unrelated namesake ("Water convolvulus" —
// water spinach — for "water"). Rather than blocklist forms one at a time, we
// score every candidate against the ingredient's actual food identity and keep
// the best, refusing to return anything that doesn't genuinely correspond.

// Definitionally ~zero-macro ingredients that also have no clean whole-food USDA
// record (and mis-match a namesake vegetable). Handled before any search.
const ZERO_NUTRITION = new Set([
  'water', 'ice', 'cold water', 'warm water', 'hot water', 'filtered water',
  'tap water', 'spring water', 'sparkling water', 'ice cubes', 'crushed ice',
]);

// State/prep words — not part of the food's identity. Stripped when extracting
// the ingredient's food tokens so they don't skew or dominate matching.
const DESCRIPTOR_WORDS = new Set([
  'fresh', 'frozen', 'raw', 'organic', 'chopped', 'sliced', 'diced', 'minced',
  'filtered', 'cold', 'warm', 'hot', 'tap', 'spring', 'sparkling', 'bottled',
  'packed', 'ripe', 'large', 'small', 'medium', 'whole', 'peeled', 'pitted',
  'shelled', 'cooked', 'uncooked', 'plain', 'freshly', 'of', 'a', 'the',
]);

// Form words: the food's identity is the token BEFORE these ("reishi mushroom
// powder" → the food is the mushroom, not "powder"), so they don't count as the
// core noun — but they still participate as secondary tokens.
const FORM_WORDS = new Set([
  'powder', 'flour', 'oil', 'juice', 'extract', 'meal', 'butter', 'milk',
  'cream', 'paste', 'sauce', 'flakes', 'chips', 'syrup', 'ground',
]);

// USDA primary-food categories (the text before the first comma) that mean a
// PREPARED/COMPOSITE product, never the whole ingredient a Nutritarian recipe
// intends. Rejecting these is what structurally prevents "reishi mushroom
// powder" from matching "Gravy, mushroom, dry, powder". Deliberately excludes
// "beverages" — plant milks legitimately live there in SR Legacy data.
const COMPOSITE_PRIMARY = new Set([
  'gravy', 'gravies', 'soup', 'soups', 'sauce', 'sauces', 'snacks', 'candies',
  'dressing', 'salad dressing', 'seasoning', 'seasonings', 'baby food',
  'baby foods', 'fast foods', 'restaurant foods', 'formulated bar',
]);

// Never the right match for a no-oil, no-added-sugar Nutritarian recipe, even
// when the ingredient shares the word — a sweetened/candied record inflates
// carbs and calories. Word-boundary matched so "unsweetened" is NOT caught.
const EXCLUDED_FORM_WORDS = ['sweetened', 'candied', 'sugared'];

function hasWord(text: string, word: string): boolean {
  return new RegExp(`\\b${word}\\b`, 'i').test(text);
}

/** Loosen a word for singular/plural-tolerant comparison: greens→green,
 *  berries→berri, tomatoes→tomato, seeds→seed. Crude but symmetric — applied to
 *  BOTH sides so mismatched inflections still line up. */
function loosen(word: string): string {
  return word.toLowerCase().replace(/(ies|es|s)$/, '');
}

/** True if any word in `text` matches `token` allowing singular/plural drift. */
function tokenInText(text: string, token: string): boolean {
  const t = loosen(token);
  if (t.length < 3) return false;
  return text
    .toLowerCase()
    .split(/[^a-z]+/)
    .some((w) => {
      const lw = loosen(w);
      return lw === t || lw.startsWith(t) || t.startsWith(lw);
    });
}

/** The ingredient's identity tokens (descriptors stripped). */
function foodTokens(item: string): string[] {
  return item
    .toLowerCase()
    .replace(/[^a-z\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 0 && !DESCRIPTOR_WORDS.has(w));
}

/** The head noun: the last identity token that isn't a form word. */
function coreNoun(tokens: string[]): string {
  for (let i = tokens.length - 1; i >= 0; i--) {
    if (!FORM_WORDS.has(tokens[i])) return tokens[i];
  }
  return tokens[tokens.length - 1] ?? '';
}

/** USDA descriptions lead with the primary food before the first comma. */
function primaryFood(desc: string): string {
  return (desc.split(',')[0] ?? '').trim().toLowerCase();
}

interface FdcFood {
  description?: string;
  foodNutrients?: FdcNutrient[];
  dataType?: string;
}

/**
 * Score how well a candidate corresponds to the ingredient. The core food noun
 * appearing in the candidate's PRIMARY food is the strongest signal (+10); in
 * the rest of the description it's weaker (+4). Other identity tokens add a
 * little each; a "raw" record breaks ties toward the whole-food form. Sweetened
 * forms are pushed firmly negative rather than hard-excluded so they can still
 * be a last resort if truly nothing else matches.
 */
function scoreCandidate(desc: string, tokens: string[], core: string): number {
  const d = desc.toLowerCase();
  const primary = primaryFood(desc);
  let score = 0;
  if (core && tokenInText(primary, core)) score += 10;
  else if (core && tokenInText(d, core)) score += 4;
  for (const t of tokens) {
    if (t !== core && tokenInText(d, t)) score += 2;
  }
  if (hasWord(d, 'raw')) score += 1;
  for (const bad of EXCLUDED_FORM_WORDS) {
    if (hasWord(d, bad) && !hasWord(tokens.join(' '), bad)) score -= 100;
  }
  return score;
}

/**
 * Pick the best USDA candidate for an ingredient, or undefined if none genuinely
 * corresponds (better to drop an ingredient — flagged in matched/total — than to
 * fold in a wrong food's macros). Rejects prepared/composite primary categories
 * outright, scores the rest, and gates on the result actually sharing the
 * ingredient's food identity.
 */
function pickBestFood(foods: FdcFood[], item: string): FdcFood | undefined {
  if (foods.length === 0) return undefined;
  const tokens = foodTokens(item);
  const core = coreNoun(tokens);

  const eligible = foods.filter(
    (f) => !COMPOSITE_PRIMARY.has(primaryFood(f.description ?? ''))
  );
  const pool = eligible.length > 0 ? eligible : foods;

  let best: FdcFood | undefined;
  let bestScore = -Infinity;
  pool.forEach((f, idx) => {
    // idx tiebreaker keeps USDA's relevance order among equal scores.
    const s = scoreCandidate(f.description ?? '', tokens, core) - idx * 0.01;
    if (s > bestScore) {
      bestScore = s;
      best = f;
    }
  });

  // Confidence gate: the winner must actually share the ingredient's food
  // identity (core noun, or at least one identity token). Otherwise return
  // nothing — a dropped ingredient is honest; a wrong food is not.
  if (best) {
    const d = (best.description ?? '').toLowerCase();
    const shares =
      (core && tokenInText(d, core)) || tokens.some((t) => tokenInText(d, t));
    if (!shares) return undefined;
  }
  return best;
}

async function macrosForIngredient(
  item: string,
  quantity: string,
  category: string | null
): Promise<Macros | null> {
  // Zero-macro ingredients (water, ice): correct by definition, and searching
  // would only mis-match a namesake food — return zeros without spending a call.
  const normalized = item.toLowerCase().replace(/[^a-z\s]/g, '').replace(/\s+/g, ' ').trim();
  if (ZERO_NUTRITION.has(normalized)) {
    console.log(`[usda-nutrition] "${item}" (${quantity}) -> zero-nutrition (water/ice)`);
    return { calories: 0, protein: 0, carbs: 0, fat: 0, fiber: 0 };
  }

  const url = `${FDC_SEARCH}?api_key=${USDA_API_KEY}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      query: item,
      // Whole-food data types first; skip Branded (packaged) products.
      dataType: ['Foundation', 'SR Legacy'],
      pageSize: 10,
    }),
  });
  if (!res.ok) return null;

  const data = await res.json();
  const food = pickBestFood(data?.foods ?? [], item);
  const nutrients: FdcNutrient[] = food?.foodNutrients ?? [];
  if (nutrients.length === 0) {
    console.log(`[usda-nutrition] "${item}" (${quantity}) -> NO CONFIDENT MATCH (dropped)`);
    return null;
  }

  const grams = quantityToGrams(quantity, item, category);
  const scale = grams / 100; // FDC search values are per 100g

  // Ground truth for verification: check Supabase's Function Logs to see
  // exactly which USDA record and gram estimate fed each ingredient, instead
  // of reverse-engineering it from the final total.
  console.log(
    `[usda-nutrition] "${item}" (${quantity}) -> "${food?.description}" ` +
      `[${food?.dataType}] @ ${grams.toFixed(1)}g`
  );

  return {
    calories: nutrientValue(nutrients, N_ENERGY) * scale,
    protein: nutrientValue(nutrients, N_PROTEIN) * scale,
    carbs: nutrientValue(nutrients, N_CARBS) * scale,
    fat: nutrientValue(nutrients, N_FAT) * scale,
    fiber: nutrientValue(nutrients, N_FIBER) * scale,
  };
}

interface IncomingIngredient {
  item?: string;
  quantity?: string;
  /** gBOMBS category if tagged (feeds the cup-density resolution above). */
  category?: string | null;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    if (!USDA_API_KEY) {
      return json(
        { error: 'Nutrition lookup is not set up yet. (Missing USDA_API_KEY.)' },
        503
      );
    }

    // ---- Require a signed-in user (don't let anonymous calls spend our key) ----
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return json({ error: 'Missing authorization header' }, 401);

    const admin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );
    const token = authHeader.replace('Bearer ', '');
    const {
      data: { user },
      error: userError,
    } = await admin.auth.getUser(token);
    if (userError || !user) {
      return json({ error: 'Invalid or expired session' }, 401);
    }

    // ---- Parse the recipe payload ----
    const body = await req.json().catch(() => ({}));
    const rawIngredients: IncomingIngredient[] = Array.isArray(body.ingredients)
      ? body.ingredients
      : [];
    const servings =
      typeof body.servings === 'number' && body.servings > 0
        ? body.servings
        : 1;

    const ingredients = rawIngredients
      .map((i) => ({
        item: (i.item ?? '').toString().trim(),
        quantity: (i.quantity ?? '').toString().trim(),
        category: i.category ? String(i.category) : null,
      }))
      .filter((i) => i.item);

    if (ingredients.length === 0) {
      return json({ error: 'No ingredients to analyze.' }, 400);
    }

    // ---- Look up all ingredients in parallel, sum, divide by servings ----
    const results = await Promise.all(
      ingredients.map((i) =>
        macrosForIngredient(i.item, i.quantity, i.category).catch(() => null)
      )
    );

    const total: Macros = { calories: 0, protein: 0, carbs: 0, fat: 0, fiber: 0 };
    let matched = 0;
    for (const m of results) {
      if (!m) continue;
      matched++;
      total.calories += m.calories;
      total.protein += m.protein;
      total.carbs += m.carbs;
      total.fat += m.fat;
      total.fiber += m.fiber;
    }

    if (matched === 0) {
      return json(
        { error: 'Could not match any ingredients to USDA data.' },
        422
      );
    }

    const perServing = {
      calories: Math.round(total.calories / servings),
      protein: Math.round((total.protein / servings) * 10) / 10,
      carbs: Math.round((total.carbs / servings) * 10) / 10,
      fat: Math.round((total.fat / servings) * 10) / 10,
      fiber: Math.round((total.fiber / servings) * 10) / 10,
    };

    // Final plausibility gate. The per-100g clamp in nutrientValue() should
    // already prevent this, but this is the last line of defense before a
    // number reaches the user — reject rather than display an obviously wrong
    // estimate for a single-recipe serving (a whole stick of butter's worth of
    // fat, or a full day's calories, is never a legitimate SINGLE SERVING of
    // one of these recipes).
    const PLAUSIBLE_MAX = { calories: 1200, protein: 100, carbs: 200, fat: 100, fiber: 60 };
    const implausible =
      perServing.calories > PLAUSIBLE_MAX.calories ||
      perServing.protein > PLAUSIBLE_MAX.protein ||
      perServing.carbs > PLAUSIBLE_MAX.carbs ||
      perServing.fat > PLAUSIBLE_MAX.fat ||
      perServing.fiber > PLAUSIBLE_MAX.fiber;

    if (implausible) {
      console.log(
        `[usda-nutrition] REJECTED implausible result: ${JSON.stringify(perServing)}`
      );
      return json(
        { error: 'Nutrition estimate looked implausible; not showing it.' },
        422
      );
    }

    return json({
      perServing,
      matched,
      total: ingredients.length,
      estimated: true,
    });
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
});
