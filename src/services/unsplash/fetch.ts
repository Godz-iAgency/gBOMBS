/**
 * Unsplash recipe-photo lookup.
 * ------------------------------------------------------------------
 * Best-effort hero image for a generated recipe. We search Unsplash by the dish
 * name and, if that's too niche to match, fall back to progressively broader
 * queries so we still return a "close enough" food photo rather than nothing:
 *
 *   1. the cleaned dish name            ("Lentil Shepherd's Pie")
 *   2. a simplified 3-word version      ("Lentil Shepherd's Pie" → "Lentil Shepherd Pie")
 *   3. a slot-based generic             ("healthy vegan dinner plate")
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

/** Broad, reliable food queries per meal slot — used only if the dish name whiffs. */
const SLOT_FALLBACK: Record<MealSlot, string> = {
  breakfast: 'healthy vegan breakfast',
  lunch: 'healthy vegan lunch bowl',
  dinner: 'healthy vegan dinner plate',
  smoothie: 'green smoothie',
  dessert: 'healthy fruit dessert',
};

const GENERIC_FALLBACK = 'healthy plant based food';

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

/** One Unsplash search. Returns the top landscape result, or null. */
async function search(query: string): Promise<RecipePhoto | null> {
  if (!query) return null;
  const url =
    `${SEARCH_ENDPOINT}?query=${encodeURIComponent(query)}` +
    `&per_page=1&orientation=landscape&content_filter=high`;

  const res = await fetch(url, {
    headers: { Authorization: `Client-ID ${ACCESS_KEY}` },
  });
  if (!res.ok) return null;

  const data = await res.json();
  const first = data?.results?.[0];
  const photoUrl = first?.urls?.regular ?? first?.urls?.small;
  if (!photoUrl) return null;

  return {
    url: photoUrl,
    credit: first.user?.name
      ? { name: first.user.name, link: first.user.links?.html ?? '' }
      : undefined,
  };
}

/**
 * Find a food photo for a dish. Tries the dish name, then a simplified name,
 * then a slot generic, then a universal generic. Returns null only if every
 * tier misses or no key is set. Never throws.
 */
export async function fetchRecipePhoto(
  dishName: string,
  slot?: MealSlot
): Promise<RecipePhoto | null> {
  if (!ACCESS_KEY) return null;

  const primary = cleanQuery(dishName);
  const simplified = simplify(dishName);
  // De-dupe the tiers so we don't spend two identical calls on short names.
  const tiers = [
    primary,
    simplified !== primary ? simplified : '',
    slot ? SLOT_FALLBACK[slot] : '',
    GENERIC_FALLBACK,
  ].filter(Boolean);

  try {
    for (const q of tiers) {
      const hit = await search(q);
      if (hit) return hit;
    }
  } catch {
    /* fall through — best-effort */
  }
  return null;
}
