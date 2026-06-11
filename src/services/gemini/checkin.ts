/**
 * Prompt 6 — Daily Check-in Scorer.
 * ------------------------------------------------------------------
 * Takes a free-text description of what the user ate today and scores their
 * gBOMBS coverage: which of the six categories they hit, a 0–6 score, warm
 * coaching feedback, and one concrete tip for a missed category. Runs on Pro
 * for Wellness Pro subscribers and Flash for Starter (checkin is tier-routed —
 * the gBOMBS detection is deterministic but the coaching benefits from Pro).
 * The prompt carries the intelligence: the six categories are spelled out with
 * examples and a strict "only mark a category hit if a real food is mentioned"
 * rule so Flash scores accurately instead of guessing.
 */

import { callGeminiJson, getModel } from './client';
import { FUHRMAN_SYSTEM_PROMPT, renderUserContext } from './prompts';
import type {
  CheckInResult,
  GBombsCategory,
  UserMealContext,
} from './types';

const CATEGORIES: GBombsCategory[] = [
  'greens',
  'beans',
  'onion',
  'mushroom',
  'berries',
  'seeds',
];

/** Shape we ask Gemini to return — six booleans plus coaching text. */
interface RawCheckIn {
  greens?: boolean;
  beans?: boolean;
  onion?: boolean;
  mushroom?: boolean;
  berries?: boolean;
  seeds?: boolean;
  mealsLogged?: number;
  feedback?: string;
  missedTip?: string;
}

/** Local calendar day as YYYY-MM-DD (the day this check-in counts for). */
function todayLocalDate(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/**
 * Score a day's eating against the six gBOMBS categories. Throws on no provider
 * / parse failure so the caller can surface a retry.
 */
export async function scoreCheckIn(
  mealsText: string,
  ctx: UserMealContext,
  tier: string
): Promise<CheckInResult> {
  const model = getModel('checkin', tier);
  const userBlock = renderUserContext(ctx);

  const prompt = `Analyze what this person ate today and score their gBOMBS coverage.

${userBlock}

WHAT THEY ATE TODAY:
"${mealsText}"

THE SIX gBOMBS CATEGORIES (a category is HIT if any qualifying food appears, even as an ingredient):
- greens: leafy greens (kale, spinach, arugula, collards, chard, romaine, bok choy, etc.)
- beans: legumes & pulses (lentils, chickpeas, black beans, edamame, tofu, tempeh, peas, etc.)
- onion: alliums (onion, garlic, leeks, shallots, scallions, chives)
- mushroom: any edible mushroom (button, cremini, shiitake, portobello, oyster, etc.)
- berries: berries & small fruits (blueberries, strawberries, raspberries, blackberries, goji, acai, etc.)
- seeds: raw nuts & seeds (chia, flax, hemp, walnuts, almonds, cashews, pumpkin/sunflower seeds, tahini, etc.)

YOUR TASK:
1. Mark each category true ONLY if a real qualifying food is actually mentioned.
   Never invent foods the person did not say. When unsure, mark false.
2. Count how many distinct meals/items they described (mealsLogged).
3. Write warm, specific, encouraging "feedback" (2-3 sentences) as a supportive
   Nutritarian coach — name what they did well by category.
4. Give ONE concrete "missedTip": name a specific food for a category they MISSED
   and an easy way to add it tomorrow. If they hit all six, celebrate the perfect day.

Return ONLY valid JSON in EXACTLY this shape — no markdown, no extra keys:
{
  "greens": true,
  "beans": true,
  "onion": false,
  "mushroom": false,
  "berries": true,
  "seeds": true,
  "mealsLogged": 3,
  "feedback": "warm 2-3 sentence summary of the day",
  "missedTip": "one concrete tip for a missed category (or celebration if perfect)"
}`;

  const raw = await callGeminiJson<RawCheckIn>(model, prompt, {
    systemPrompt: FUHRMAN_SYSTEM_PROMPT,
    temperature: 0.4, // accurate detection first; a little warmth in the wording
    maxOutputTokens: 4096, // headroom for flash thinking + the JSON
  });

  const categoriesHit = CATEGORIES.filter((c) => raw[c] === true);

  const mealsLogged =
    typeof raw.mealsLogged === 'number' && raw.mealsLogged > 0
      ? Math.round(raw.mealsLogged)
      : 0;

  return {
    scoredAt: new Date().toISOString(),
    scoreDate: todayLocalDate(),
    score: categoriesHit.length,
    categoriesHit,
    mealsLogged,
    feedback: (raw.feedback ?? '').trim(),
    missedTip: (raw.missedTip ?? '').trim(),
    mealsText: mealsText.trim(),
  };
}
