/**
 * AI Coach chat client — Gemini only.
 * ------------------------------------------------------------------
 * Uses the same Gemini key and Flash-Lite model as the meal-plan layer
 * (services/gemini/client.ts), but is kept as its own small client because chat
 * is multi-turn and has its own retry/fallback handling.
 *
 * Model:    EXPO_PUBLIC_GEMINI_FLASH_MODEL (gemini-3.5-flash-lite).
 * Fallback: a second Flash-Lite model on the same key, used only if the primary
 *           is unavailable after its retries.
 */

const GEMINI_API_KEY = process.env.EXPO_PUBLIC_GEMINI_API_KEY;
const GEMINI_ENDPOINT =
  'https://generativelanguage.googleapis.com/v1beta/models';

const COACH_MODEL =
  process.env.EXPO_PUBLIC_GEMINI_FLASH_MODEL ?? 'gemini-3.5-flash-lite';

const COACH_FALLBACK_MODEL =
  process.env.EXPO_PUBLIC_GEMINI_COACH_FALLBACK_MODEL ?? 'gemini-3.1-flash-lite';

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

/** True when the coach has an API key configured. */
export function isCoachConfigured(): boolean {
  return Boolean(GEMINI_API_KEY);
}

/** Thrown when no Gemini key is set, so the screen can degrade gracefully. */
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

/** 429/5xx clear in seconds and are worth a retry; other 4xx are fatal. The
 *  Gemini free tier also answers intermittently with 403 under load, which
 *  succeeds on retry, so 403 counts as transient too. */
function isTransientStatus(status: number): boolean {
  return (
    status === 403 ||
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

/** Map our chat messages onto Gemini's systemInstruction + user/model turns. */
function toGeminiPayload(messages: ChatMessage[]) {
  const system = messages
    .filter((m) => m.role === 'system')
    .map((m) => m.content)
    .join('\n\n');

  const contents = messages
    .filter((m) => m.role !== 'system')
    .map((m) => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }],
    }));
  // Gemini expects the conversation to open with a user turn.
  while (contents.length > 0 && contents[0].role === 'model') contents.shift();

  return { system, contents };
}

/** One Gemini attempt against a given model. Throws CoachHttpError on HTTP failure. */
async function chatOnce(
  model: string,
  messages: ChatMessage[],
  opts: ChatOptions
): Promise<string> {
  const { temperature = 0.6, maxTokens = 600 } = opts;
  const { system, contents } = toGeminiPayload(messages);

  const body: Record<string, unknown> = {
    contents,
    generationConfig: { temperature, maxOutputTokens: maxTokens },
  };
  if (system) body.systemInstruction = { parts: [{ text: system }] };

  const res = await fetch(`${GEMINI_ENDPOINT}/${model}:generateContent`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-goog-api-key': GEMINI_API_KEY as string,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new CoachHttpError(
      res.status,
      `Gemini ${model} HTTP ${res.status}: ${detail.slice(0, 200)}`
    );
  }

  const data = await res.json();
  const parts: { text?: string }[] = data?.candidates?.[0]?.content?.parts ?? [];
  return parts.map((p) => p.text ?? '').join('');
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
 * to the second model (with its own retries). Throws only if BOTH fail,
 * surfacing the primary error so the screen can show a retry affordance.
 */
export async function coachChat(
  messages: ChatMessage[],
  opts: ChatOptions = {}
): Promise<string> {
  if (!isCoachConfigured()) throw new CoachNotConfiguredError();

  try {
    return await chatWithRetries(COACH_MODEL, messages, opts);
  } catch (primaryErr) {
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
