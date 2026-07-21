/**
 * Client-side fast pre-check for custom food entry on the FoodPreferenceScreen.
 * Runs BEFORE any Gemini call (Prompt 8). If a typed food matches BLOCKED_FOODS,
 * reject instantly with a category-specific message and never hit the API.
 */
export const BLOCKED_FOODS = [
  'chicken', 'beef', 'pork', 'lamb', 'turkey', 'meat', 'steak', 'hamburger',
  'burger', 'bacon', 'ham', 'sausage', 'salami', 'pepperoni', 'hot dog',
  'brisket', 'veal', 'venison', 'fish', 'salmon', 'tuna', 'shrimp', 'lobster',
  'crab', 'sardine', 'tilapia', 'cod', 'halibut', 'milk', 'butter', 'cream',
  'ice cream', 'whipped cream', 'cream cheese', 'sour cream', 'pizza', 'pasta',
  'bread', 'chips', 'candy', 'chocolate', 'soda', 'juice', 'sugar', 'flour',
  'cake', 'cookie', 'donut', 'fries', 'fast food', 'ramen', 'noodles',
  'mayonnaise', 'ketchup', 'ranch', 'white rice', 'white bread', 'crackers',
  'cereal', 'wine', 'beer', 'whiskey', 'vodka', 'alcohol',
];

export const REJECTION_MESSAGES: Record<string, string> = {
  greens: 'Try a leafy green like kale, spinach, or arugula.',
  beans: 'Try a legume like lentils, chickpeas, or black beans.',
  onion: 'Try an allium like garlic, leeks, or shallots.',
  mushroom: 'Try a mushroom variety like shiitake or portobello.',
  berries: 'Try a berry like blueberries, raspberries, or acai.',
  seeds: 'Try a nut or seed like walnuts, chia, or pumpkin seeds.',
};

// Whole-food compounds that would otherwise false-positive on the blocklist
// below (e.g. "almond butter" contains "butter", "oat milk" contains "milk")
// — these are legitimate whole-food fats/plant milks, not dairy/processed
// foods, so they should skip the fast block and go to the full Gemini check.
const SAFE_COMPOUND_PATTERNS = [
  /\b(almond|cashew|walnut|peanut|sunflower|tahini|pistachio|hazelnut|seed)\s+butter\b/i,
  /\b(almond|soy|oat|cashew|rice|hemp|coconut)\s+milk\b/i,
];

export const isBlockedFood = (input: string): boolean => {
  const normalized = input.toLowerCase().trim();
  if (SAFE_COMPOUND_PATTERNS.some((p) => p.test(normalized))) return false;
  return BLOCKED_FOODS.some((blocked) => normalized.includes(blocked));
};

/** Normalize a food string for dedup + storage (lowercase, single-spaced, trimmed). */
export const normalizeFood = (input: string): string =>
  input.toLowerCase().trim().replace(/\s+/g, ' ');
