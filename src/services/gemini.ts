/**
 * Gemini AI service. For now this only implements Prompt 8 (custom food
 * validation) used by the FoodPreferenceScreen. Other prompts (meal plan,
 * grocery list, scoring, etc.) get added in later build steps.
 */

const GEMINI_API_KEY = process.env.EXPO_PUBLIC_GEMINI_API_KEY;
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-1.5-flash';

export type FoodValidationResult = {
  valid: boolean;
  reason: string;
  suggested_alternative: string;
  /** True when we skipped the API (no key configured) and accepted by default. */
  skipped?: boolean;
};

/**
 * Validate a custom food against a gBOMBS category using Gemini (Prompt 8).
 *
 * IMPORTANT: This runs AFTER the local isBlockedFood() check. If no Gemini API
 * key is configured, we DO NOT block the user — we accept the food and flag
 * `skipped: true` so the caller can mark it unvalidated. Wire the key in .env
 * (EXPO_PUBLIC_GEMINI_API_KEY) to turn on real validation; no code change needed.
 */
export async function validateCustomFood(
  foodItem: string,
  category: string,
  dietMode: string
): Promise<FoodValidationResult> {
  // No key yet → accept gracefully so onboarding still works.
  if (!GEMINI_API_KEY) {
    return { valid: true, reason: '', suggested_alternative: '', skipped: true };
  }

  const prompt = `
You are a whole food nutrition validator for the gBOMBS system.

gBOMBS CATEGORIES AND WHAT QUALIFIES:
- greens: leafy green vegetables only (kale, spinach, arugula, collards, bok choy, swiss chard, romaine, watercress, microgreens, etc.)
- beans: all legumes, pulses, and soy products (lentils, chickpeas, black beans, kidney beans, edamame, split peas, mung beans, etc.)
- onion: allium family only (onion, garlic, leeks, shallots, chives, scallions, escallion, ramps, etc.)
- mushroom: all edible fungi (portobello, shiitake, cremini, oyster, button, maitake, lion's mane, reishi, etc.)
- berries: all berries and small fruits (blueberries, raspberries, strawberries, blackberries, goji, acai, cranberries, elderberries, etc.)
- seeds: all raw nuts and seeds (chia, flax, hemp, pumpkin seeds, sunflower seeds, walnuts, almonds, cashews, brazil nuts, pecans, pine nuts, sesame, quinoa, etc.)

VALIDATION RULES:
1. The food must be a whole, unprocessed food. No refined products, no sauces, no packaged foods.
2. The food must belong specifically to the category being checked.
3. If diet_mode is 'vegan': reject eggs, dairy, meat, fish, and all animal products.
4. If diet_mode is 'vegetarian': eggs and cheese are allowed in the eggs_dairy category ONLY. Reject meat and fish.
5. Reject anything that is processed, refined, artificial, or a prepared dish.
6. When in doubt, reject.

FOOD TO VALIDATE:
- Food Item: "${foodItem}"
- Category Being Added To: "${category}"
- Diet Mode: "${dietMode}"

Return ONLY valid JSON. No explanation. No markdown.

{
  "valid": true or false,
  "reason": "one sentence explanation if invalid, empty string if valid",
  "suggested_alternative": "suggest a similar valid food if invalid, empty string if valid"
}`;

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.1, maxOutputTokens: 150 },
        }),
      }
    );

    const data = await response.json();
    const text: string = data?.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
    const cleaned = text.replace(/```json|```/g, '').trim();
    const parsed = JSON.parse(cleaned);
    return {
      valid: Boolean(parsed.valid),
      reason: parsed.reason ?? '',
      suggested_alternative: parsed.suggested_alternative ?? '',
    };
  } catch {
    // Network/parse failure → don't hard-block the user; accept but mark skipped.
    return { valid: true, reason: '', suggested_alternative: '', skipped: true };
  }
}
