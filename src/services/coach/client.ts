/**
 * OpenRouter chat client — the AI Coach's ONLY provider.
 * ------------------------------------------------------------------
 * Deliberately isolated from the Gemini/Groq meal-planning layer (services/
 * gemini/client.ts). The coach is a conversational feature with its own model,
 * its own key, and its own failure handling, so a change to meal-plan routing
 * can never affect chat and vice-versa.
 *
 * Provider: OpenRouter (https://openrouter.ai) — OpenAI-compatible chat API.
 * Model:    openai/gpt-4o-mini — fast + inexpensive, strong for chat.
 * Fallback: meta-llama/llama-3.3-70b-instruct — used only when the primary model
 *           is unavailable. Same endpoint + key, different model string. Strong
 *           instruction-follower so it honors the Nutritarian system prompt, and
 *           cheap (~$0.10/1M tokens) — it only fires when gpt-4o-mini is down.
 *           (The :free tier is avoided: it shares a global pool and 429s often.)
 */

const OPENROUTER_API_KEY = process.env.EXPO_PUBLIC_OPENROUTER_API_KEY;
const OPENROUTER_ENDPOINT = 'https://openrouter.ai/api/v1/chat/completions';

// Chat model. Overridable via env without touching code.
const COACH_MODEL =
  process.env.EXPO_PUBLIC_OPENROUTER_MODEL ?? 'openai/gpt-4o-mini';

// Fallback model, used only if the primary errors out after its retries.
const COACH_FALLBACK_MODEL =
  process.env.EXPO_PUBLIC_OPENROUTER_FALLBACK_MODEL ??
  'meta-llama/llama-3.3-70b-instruct';

// OpenRouter asks every request to identify the calling app. These are plain
// labels — no registration needed — and show up in the OpenRouter dashboard.
const APP_REFERER = 'https://gbombs.app';
const APP_TITLE = 'gBOMBS Coach';

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

/** True when the coach has an API key configured. */
export function isCoachConfigured(): boolean {
  return Boolean(OPENROUTER_API_KEY);
}

/** Thrown when no OpenRouter key is set, so the screen can degrade gracefully. */
export class CoachNotConfiguredError extends Error {
  constructor() {
    super('The Coach is not available right now.');
    this.name = 'CoachNotConfiguredError';
  }
}

class CoachHttpError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = 'CoachHttpError';
    this.status = status;
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** 429/5xx clear in seconds and are worth a retry; other 4xx are fatal. */
function isTransientStatus(status: number): boolean {
  return (
    status === 429 ||
    status === 500 ||
    status === 502 ||
    status === 503 ||
    status === 504
  );
}

interface ChatOptions {
  temperature?: number;
  maxTokens?: number;
}

/** One OpenRouter attempt against a given model. Throws CoachHttpError on HTTP failure. */
async function chatOnce(
  model: string,
  messages: ChatMessage[],
  opts: ChatOptions
): Promise<string> {
  const { temperature = 0.6, maxTokens = 600 } = opts;

  const res = await fetch(OPENROUTER_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${OPENROUTER_API_KEY}`,
      'HTTP-Referer': APP_REFERER,
      'X-Title': APP_TITLE,
    },
    body: JSON.stringify({
      model,
      messages,
      temperature,
      max_tokens: maxTokens,
    }),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new CoachHttpError(
      res.status,
      `OpenRouter HTTP ${res.status}: ${detail.slice(0, 200)}`
    );
  }

  const data = await res.json();
  return data?.choices?.[0]?.message?.content ?? '';
}

/** Run one model with transient-failure retries (3x, short backoff). */
async function chatWithRetries(
  model: string,
  messages: ChatMessage[],
  opts: ChatOptions
): Promise<string> {
  const ATTEMPTS = 3;
  let lastErr: unknown;
  for (let i = 1; i <= ATTEMPTS; i++) {
    try {
      return await chatOnce(model, messages, opts);
    } catch (e) {
      lastErr = e;
      const status = e instanceof CoachHttpError ? e.status : 0;
      const retriable = status === 0 || isTransientStatus(status); // 0 = network
      if (!retriable || i === ATTEMPTS) throw e;
      await sleep(i * 1200);
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error('Coach request failed');
}

/**
 * Send a full message list to the coach and return the reply text.
 * Tries the primary model (with retries); if it's unavailable, falls back once
 * to the free model (with its own retries). Throws only if BOTH fail, surfacing
 * the primary error so the screen can show a retry affordance.
 */
export async function coachChat(
  messages: ChatMessage[],
  opts: ChatOptions = {}
): Promise<string> {
  if (!isCoachConfigured()) throw new CoachNotConfiguredError();

  try {
    return await chatWithRetries(COACH_MODEL, messages, opts);
  } catch (primaryErr) {
    // Primary unavailable — try the free fallback model once on the same key.
    if (COACH_FALLBACK_MODEL && COACH_FALLBACK_MODEL !== COACH_MODEL) {
      try {
        return await chatWithRetries(COACH_FALLBACK_MODEL, messages, opts);
      } catch {
        // Both failed — surface the primary error (more informative).
      }
    }
    throw primaryErr;
  }
}
