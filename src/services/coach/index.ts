/**
 * gBOMBS AI Coach — public entry point (pure logic).
 * ------------------------------------------------------------------
 * Builds the coach persona + the user-context block and turns a conversation
 * into a reply. Pure: it takes a CoachContext and message history in, and gives
 * a string back. All DB reads, AsyncStorage history, and rate limiting live in
 * lib/coach.ts so this service stays testable and provider-isolated.
 */

import { coachChat, type ChatMessage } from './client';
import type { GBombsCategory } from '@/services/gemini';

export { isCoachConfigured, CoachNotConfiguredError } from './client';
export type { ChatMessage } from './client';

/** A turn in the visible conversation (system messages are added at send time). */
export interface CoachTurn {
  role: 'user' | 'assistant';
  content: string;
}

/** Everything the coach knows about the user, assembled by lib/coach.ts. */
export interface CoachContext {
  dietMode: string;
  healthGoal: string;
  cookingStyle: string;
  preferredFoods: string[];
  excludedFoods: string[];
  /** Today's check-in, if logged. */
  todayScore: { score: number; hit: GBombsCategory[] } | null;
  /** True once a weekly plan has been generated. */
  hasPlan: boolean;
  /** Weekly gBOMBS coverage (0–6), when a plan exists. */
  weeklyScore: number | null;
}

const ALL_CATEGORIES: GBombsCategory[] = [
  'greens',
  'beans',
  'onion',
  'mushroom',
  'berries',
  'seeds',
];

const COACH_PERSONA = `You are the gBOMBS Coach — a warm, encouraging Nutritarian nutrition guide
inside the gBOMBS app. You follow Dr. Joel Fuhrman's whole-food, plant-based
philosophy, built around the six gBOMBS superfoods: Greens, Beans, Onions,
Mushrooms, Berries, and Seeds & nuts.

HOW YOU HELP:
- Answer questions about food, the six gBOMBS, meals, recipes, and healthy eating.
- Help the user understand their gBOMBS score and how to hit more categories.
- Suggest simple swaps and additions that fit their diet, goal, and tastes.
- Encourage warmly — celebrate wins, never shame a slip-up.

NUTRITARIAN PRINCIPLES (hold these firmly):
- Whole, unprocessed plant foods. No refined sugar, no refined flour, no added oil.
- The only animal foods ever acceptable are eggs and cheese, and ONLY when the
  user's diet mode is vegetarian. Never suggest meat or fish.
- If asked about a food outside Nutritarian principles, gently steer them back to
  a whole-food choice.

STYLE:
- This is a chat. Keep replies short and friendly — usually 2-4 sentences.
- Plain conversational text. No markdown headers; no long bullet lists unless the
  user explicitly asks for a list.
- Talk like a supportive coach, not a textbook.

BOUNDARIES:
- You are not a doctor. For medical conditions, medications, pregnancy, or symptoms,
  warmly recommend a qualified healthcare professional.
- Stay on nutrition, the gBOMBS, and the app. If asked something unrelated, kindly
  redirect to how you can help with their eating.`;

/** Renders the live user context the coach personalizes around. */
function renderContext(ctx: CoachContext): string {
  const lines: string[] = [
    'ABOUT THIS USER (use to personalize; never read it back verbatim):',
    `- Diet mode: ${ctx.dietMode}`,
    `- Health goal: ${ctx.healthGoal}`,
    `- Cooking style: ${ctx.cookingStyle}`,
  ];
  if (ctx.preferredFoods.length) {
    lines.push(`- Favorite foods: ${ctx.preferredFoods.join(', ')}`);
  }
  if (ctx.excludedFoods.length) {
    lines.push(`- Avoids / allergic to (NEVER suggest): ${ctx.excludedFoods.join(', ')}`);
  }

  if (ctx.todayScore) {
    const hit = ctx.todayScore.hit;
    const missed = ALL_CATEGORIES.filter((c) => !hit.includes(c));
    lines.push(
      `- Today's gBOMBS so far: ${ctx.todayScore.score}/6` +
        (hit.length ? ` — hit ${hit.join(', ')}` : '') +
        (missed.length ? `; still missing ${missed.join(', ')}` : '')
    );
  } else {
    lines.push("- They haven't logged today's check-in yet.");
  }

  if (ctx.hasPlan) {
    lines.push(
      `- They have a weekly meal plan${
        ctx.weeklyScore != null ? ` (covers ${ctx.weeklyScore}/6 gBOMBS)` : ''
      }.`
    );
  } else {
    lines.push("- They haven't generated a weekly meal plan yet.");
  }

  return lines.join('\n');
}

/** Build the full system instruction (persona + live context). */
export function buildCoachSystemPrompt(ctx: CoachContext): string {
  return `${COACH_PERSONA}\n\n${renderContext(ctx)}`;
}

// Cap how much history we replay to keep token cost (and latency) bounded —
// the last 12 turns is plenty of memory for a coaching chat.
const MAX_HISTORY_TURNS = 12;

/**
 * Send the next user message and return the coach's reply.
 * `history` is the prior visible conversation (oldest first); `userMessage` is
 * the new turn. Throws on provider failure so the screen can offer a retry.
 */
export async function sendCoachMessage(
  history: CoachTurn[],
  userMessage: string,
  ctx: CoachContext
): Promise<string> {
  const trimmed = history.slice(-MAX_HISTORY_TURNS);
  const messages: ChatMessage[] = [
    { role: 'system', content: buildCoachSystemPrompt(ctx) },
    ...trimmed.map((t) => ({ role: t.role, content: t.content }) as ChatMessage),
    { role: 'user', content: userMessage },
  ];

  const reply = await coachChat(messages, { temperature: 0.6, maxTokens: 600 });
  const text = reply.trim();
  if (!text) {
    throw new Error('The coach had nothing to say — please try again.');
  }
  return text;
}
