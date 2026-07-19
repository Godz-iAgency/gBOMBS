/**
 * Unsplash recipe-photo lookup.
 * ------------------------------------------------------------------
 * Best-effort hero image for a generated recipe.
 *
 * The recipe's NAME is an AI-invented, often whimsical title ("Mulberry Grape
 * Seed Crisp", "Strawberry Amaranth Seed Elixir") — no food photographer has
 * ever shot a photo literally titled that, so searching Unsplash on the dish
 * name devolves into a bare keyword match against its WHOLE library (nature,
 * agriculture, anything sharing a word), which is how a smoothie recipe ends up
 * with a photo of berries growing on a branch instead of a plated drink.
 *
 * Ingredients, by contrast, are real, ordinary food nouns — "mustard greens",
 * "chanterelle mushrooms" — that Unsplash's food photography actually has shots
 * of. So the primary search is grounded in the recipe's own leading ingredients
 * plus a slot-appropriate "prepared dish" word (e.g. "mustard greens breakfast
 * bowl"), which reliably points at plated/styled food rather than raw-ingredient
 * or nature shots. The dish name and generic fallbacks still exist as later
 * tiers for the rare case a title genuinely matches something real.
 *
 * NEVER throws — a missing/failed image must not break recipe generation. The
 * caller treats a null result as "no photo" and the UI simply omits the hero.
 *
 * Auth is the public Access Key (read-only search), passed as a Client-ID header
 * per Unsplash's API. Only EXPO_PUBLIC_ vars are inlined into the client bundle.
 */

import type { MealSlot } from '@/services/gemini';

const ACCESS_KEY = process.env.EXPO_PUBLIC_UNSPLASH_ACCESS_KEY;
const SEARCH_ENDPOINT = 'https://api.unsplash.com/search/photos';

export interface RecipePhoto {
  url: string;
  /** Photographer attribution (shown as a small credit line per Unsplash rules). */
  credit?: { name: string; link: string };
}

/** True when an Unsplash key is configured. */
export function isUnsplashConfigured(): boolean {
  return Boolean(ACCESS_KEY);
}

/** A "prepared, plated" context word per slot — biases the search toward food
 *  photography of a finished dish rather than a raw ingredient in the wild. */
const SLOT_DISH_WORD: Record<MealSlot, string> = {
  breakfast: 'breakfast bowl',
  lunch: 'lunch bowl',
  dinner: 'dinner plate',
  smoothie: 'smoothie',
  dessert: 'dessert',
};

/** Broad, reliable food queries per meal slot — the last resort before the
 *  universal fallback. */
const SLOT_FALLBACK: Record<MealSlot, string> = {
  breakfast: 'healthy vegan breakfast',
  lunch: 'healthy vegan lunch bowl',
  dinner: 'healthy vegan dinner plate',
  smoothie: 'green smoothie',
  dessert: 'healthy fruit dessert',
};

const GENERIC_FALLBACK = 'healthy plant based food';
// Broadest possible query — Unsplash has thousands of results for this, so it's
// essentially guaranteed to return something if GENERIC_FALLBACK somehow misses.
const BROADEST_FALLBACK = 'food';

// The absolute last resort: a real, stable Unsplash photo hardcoded here so a
// recipe ALWAYS gets a food image, even if the Unsplash API is fully down, the
// key is revoked, or every network call above fails. No fetch required.
const STATIC_FALLBACK: RecipePhoto = {
  url: 'https://images.unsplash.com/photo-1512621776951-a57141f2eefd?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&q=80&w=1080',
  credit: { name: 'Anna Pelzer', link: 'https://unsplash.com/@annapelzer' },
};

/** Ingredients too generic/unphotographable to anchor a search on their own —
 *  skipped when picking which ingredients ground the primary query. */
const SKIP_AS_HERO = new Set([
  'water', 'ice', 'salt', 'pepper', 'black pepper', 'sea salt',
  'filtered water', 'cold water', 'warm water',
]);

/** Descriptor words stripped so the query reads as a plain food noun, not a
 *  recipe instruction ("fresh mustard greens" → "mustard greens"). */
const DESCRIPTORS = /\b(fresh|frozen|raw|organic|chopped|sliced|diced|minced|packed|ripe|cooked|uncooked|plain|small|medium|large)\b/gi;

function cleanIngredient(item: string): string {
  return item.replace(DESCRIPTORS, '').replace(/\s+/g, ' ').trim();
}

/** Strip parentheticals/quotes so the search matches the core dish. */
function cleanQuery(name: string): string {
  return name
    .replace(/\([^)]*\)/g, '') // drop "(gluten-free)" etc.
    .replace(/["']/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** First N words — a looser query when the full dish name is too specific. */
function simplify(name: string, words = 3): string {
  return cleanQuery(name).split(' ').slice(0, words).join(' ');
}

/** How many candidates to pull per query so distinct recipes can vary instead
 *  of every one grabbing result[0]. (Unsplash allows up to 30 per page.) */
const RESULTS_PER_QUERY = 12;

/**
 * Small deterministic string hash → non-negative int. Used to pick WHICH of a
 * query's results a recipe gets: the same recipe name always hashes to the same
 * index (so its photo is stable across reloads and matches what got cached),
 * while two different recipes that happen to share a query — e.g. two mulberry
 * smoothies both searching "mulberries smoothie" — land on different indices
 * and therefore different photos, instead of colliding on the top result.
 */
function hashString(s: string): number {
  let h = 5381;
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) + h + s.charCodeAt(i)) | 0; // djb2
  }
  return Math.abs(h);
}

/**
 * One Unsplash search for one tier. Errors are caught HERE, per-tier, and
 * return null rather than throwing — a network blip on tier 1 (say, the
 * hero-ingredient query) must not abort tiers 2-6 along with it. Without this,
 * a single transient failure early in the chain would skip straight past even
 * the "always has results" generic fallback and leave the recipe with no photo
 * at all, which is the opposite of what the tier chain is for.
 *
 * `seed` selects which result to return (seed % count) so distinct recipes
 * sharing a query don't all get the same photo — see hashString.
 */
async function search(query: string, seed: number): Promise<RecipePhoto | null> {
  if (!query) return null;
  try {
    const url =
      `${SEARCH_ENDPOINT}?query=${encodeURIComponent(query)}` +
      `&per_page=${RESULTS_PER_QUERY}&orientation=landscape&content_filter=high`;

    const res = await fetch(url, {
      headers: { Authorization: `Client-ID ${ACCESS_KEY}` },
    });
    if (!res.ok) return null;

    const data = await res.json();
    const results = data?.results;
    if (!Array.isArray(results) || results.length === 0) return null;

    const pick = results[seed % results.length];
    const photoUrl = pick?.urls?.regular ?? pick?.urls?.small;
    if (!photoUrl) return null;

    return {
      url: photoUrl,
      credit: pick.user?.name
        ? { name: pick.user.name, link: pick.user.links?.html ?? '' }
        : undefined,
    };
  } catch {
    return null;
  }
}

/**
 * Find a food photo for a recipe — GUARANTEED to return one, no matter what.
 * Tries, in order, each tier isolated so one failure can't skip the rest:
 *   1. leading ingredient + slot dish-word   ("mustard greens breakfast bowl")
 *   2. second ingredient + slot dish-word    (in case the first is unphotogenic)
 *   3. the cleaned dish name                 ("Lentil Shepherd's Pie")
 *   4. a simplified 3-word version of it
 *   5. a slot-based generic                  ("healthy vegan breakfast")
 *   6. a universal generic                   ("healthy plant based food")
 *   7. the broadest possible query           ("food")
 *   8. a hardcoded static photo — no network call, so even a total Unsplash
 *      outage or a revoked key still returns a real food image.
 * Returns null ONLY if no Unsplash key is configured at all — every other
 * failure mode is absorbed by tier 8.
 */
export async function fetchRecipePhoto(opts: {
  dishName: string;
  slot?: MealSlot;
  /** Ingredient names in recipe order (real food nouns) — grounds the search
   *  in what the dish actually contains rather than its invented title. */
  ingredientItems?: string[];
}): Promise<RecipePhoto | null> {
  if (!ACCESS_KEY) return null;
  const { dishName, slot, ingredientItems = [] } = opts;

  const dishWord = slot ? SLOT_DISH_WORD[slot] : '';
  const heroCandidates = ingredientItems
    .map(cleanIngredient)
    .filter((ing) => ing && !SKIP_AS_HERO.has(ing.toLowerCase()));

  const primary = cleanQuery(dishName);
  const simplified = simplify(dishName);

  // Derived from the dish name so this recipe always picks the same result
  // index (stable/cache-consistent), while different recipes sharing a query
  // spread across the result set instead of colliding on the top photo.
  const seed = hashString(dishName);

  const tiers = [
    heroCandidates[0] && dishWord ? `${heroCandidates[0]} ${dishWord}` : '',
    heroCandidates[1] && dishWord ? `${heroCandidates[1]} ${dishWord}` : '',
    primary,
    simplified !== primary ? simplified : '',
    slot ? SLOT_FALLBACK[slot] : '',
    GENERIC_FALLBACK,
    BROADEST_FALLBACK,
  ].filter(Boolean);

  for (const q of tiers) {
    const hit = await search(q, seed); // search() absorbs its own errors — never throws
    if (hit) return hit;
  }
  return STATIC_FALLBACK;
}
