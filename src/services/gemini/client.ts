/**
 * Low-level AI client: model routing, resilient calls, and provider fallback.
 * ------------------------------------------------------------------
 * Every AI feature calls through here so we have ONE place that decides which
 * model to use and ONE place that talks to the providers.
 *
 * RESILIENCE (why this file is more than a fetch):
 *   1. Retries transient failures (429 quota spike, 503 overloaded, 5xx,
 *      network blips) up to 3x with backoff — these clear in seconds.
 *   2. If Gemini still fails, falls back to Groq (a separate provider on
 *      separate infrastructure) so a Google outage doesn't break the app.
 *
 * MODEL ROUTING (Flash vs Pro):
 *   - scoring / grocery / validation always use Flash (cheap, deterministic).
 *   - everything else uses Pro for Wellness Pro subscribers, Flash for Starter.
 */

import type { GeminiTask } from './types';

// ---- Providers ----
const GEMINI_API_KEY = process.env.EXPO_PUBLIC_GEMINI_API_KEY;
const GEMINI_ENDPOINT =
  'https://generativelanguage.googleapis.com/v1beta/models';

const GROQ_API_KEY = process.env.EXPO_PUBLIC_GROQ_API_KEY;
const GROQ_ENDPOINT = 'https://api.groq.com/openai/v1/chat/completions';
// Groq's strongest general model; override via env without touching code.
const GROQ_MODEL =
  process.env.EXPO_PUBLIC_GROQ_MODEL ?? 'llama-3.3-70b-versatile';

// ---- Gemini model routing ----
const FLASH_MODEL =
  process.env.EXPO_PUBLIC_GEMINI_FLASH_MODEL ??
  process.env.GEMINI_MODEL ??
  'gemini-2.5-flash';

const PRO_MODEL =
  process.env.EXPO_PUBLIC_GEMINI_PRO_MODEL ?? 'gemini-2.5-flash';

/** Tasks that always run on Flash no matter the subscription tier. */
const FLASH_ONLY_TASKS: GeminiTask[] = ['scoring', 'grocery', 'validation'];

/** True only for the top tier (the one that unlocks Pro-quality generation). */
export function tierUsesPro(tier: string): boolean {
  return tier === 'wellness_pro';
}

/**
 * Chooses the Gemini model for a task + subscription tier.
 * Flash-only tasks ignore the tier; everything else upgrades to Pro for
 * Wellness Pro subscribers.
 */
export function getModel(task: GeminiTask, tier: string): string {
  if (FLASH_ONLY_TASKS.includes(task)) return FLASH_MODEL;
  return tierUsesPro(tier) ? PRO_MODEL : FLASH_MODEL;
}

/** Thrown when no provider is configured, so callers can degrade gracefully. */
export class GeminiNotConfiguredError extends Error {
  constructor() {
    super('No AI provider configured (set EXPO_PUBLIC_GEMINI_API_KEY).');
    this.name = 'GeminiNotConfiguredError';
  }
}

/** Carries the HTTP status so the retry logic can tell transient from fatal. */
class ProviderHttpError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = 'ProviderHttpError';
    this.status = status;
  }
}

/** Gemini-only check. */
export function isGeminiConfigured(): boolean {
  return Boolean(GEMINI_API_KEY);
}

/** True if ANY provider (Gemini or Groq) is available. */
export function isAiConfigured(): boolean {
  return Boolean(GEMINI_API_KEY || GROQ_API_KEY);
}

export interface GeminiCallOptions {
  /** 0–1; lower = more deterministic. Defaults per call site. */
  temperature?: number;
  maxOutputTokens?: number;
  /** Optional system instruction (e.g. the Fuhrman prompt). */
  systemPrompt?: string;
  /** Ask the provider to return strict JSON (improves parse reliability). */
  json?: boolean;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** 429/5xx are worth retrying / failing over; 4xx (except 429) are fatal. */
function isTransientStatus(status: number): boolean {
  return status === 429 || status === 500 || status === 502 || status === 503 || status === 504;
}

// ---- Single-attempt provider calls ----

/** One Gemini attempt. Throws ProviderHttpError on HTTP failure. */
async function geminiOnce(
  model: string,
  userPrompt: string,
  opts: GeminiCallOptions
): Promise<string> {
  const { temperature = 0.7, maxOutputTokens = 2048, systemPrompt, json } = opts;

  const generationConfig: Record<string, unknown> = {
    temperature,
    maxOutputTokens,
  };
  if (json) generationConfig.responseMimeType = 'application/json';

  const body: Record<string, unknown> = {
    contents: [{ parts: [{ text: userPrompt }] }],
    generationConfig,
  };
  if (systemPrompt) body.systemInstruction = { parts: [{ text: systemPrompt }] };

  const res = await fetch(
    `${GEMINI_ENDPOINT}/${model}:generateContent?key=${GEMINI_API_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }
  );

  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new ProviderHttpError(
      res.status,
      `Gemini ${model} HTTP ${res.status}: ${detail.slice(0, 200)}`
    );
  }

  const data = await res.json();
  return data?.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
}

/** One Groq attempt (OpenAI-compatible). Throws ProviderHttpError on failure. */
async function groqOnce(
  model: string,
  userPrompt: string,
  opts: GeminiCallOptions
): Promise<string> {
  const { temperature = 0.7, maxOutputTokens = 2048, systemPrompt, json } = opts;

  const messages: { role: string; content: string }[] = [];
  if (systemPrompt) messages.push({ role: 'system', content: systemPrompt });
  messages.push({ role: 'user', content: userPrompt });

  const body: Record<string, unknown> = {
    model,
    messages,
    temperature,
    max_tokens: maxOutputTokens,
  };
  if (json) body.response_format = { type: 'json_object' };

  const res = await fetch(GROQ_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${GROQ_API_KEY}`,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new ProviderHttpError(
      res.status,
      `Groq ${model} HTTP ${res.status}: ${detail.slice(0, 200)}`
    );
  }

  const data = await res.json();
  return data?.choices?.[0]?.message?.content ?? '';
}

/** Retry one provider up to `attempts` times, only retrying transient errors. */
async function withRetries(
  attempts: number,
  fn: () => Promise<string>
): Promise<string> {
  let lastErr: unknown;
  for (let i = 1; i <= attempts; i++) {
    try {
      return await fn();
    } catch (e) {
      lastErr = e;
      const status = e instanceof ProviderHttpError ? e.status : 0;
      const retriable = status === 0 || isTransientStatus(status); // 0 = network
      if (!retriable || i === attempts) throw e;
      await sleep(i * 1500); // 1.5s, then 3s — overload spikes clear fast
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error('Request failed');
}

/**
 * Calls the AI and returns the raw text of the first candidate.
 *   Gemini (with retries) → Groq fallback (with retries) → throw.
 * The `model` arg is the Gemini model; Groq uses its own configured model.
 */
export async function callGemini(
  model: string,
  userPrompt: string,
  options: GeminiCallOptions = {}
): Promise<string> {
  if (!isAiConfigured()) throw new GeminiNotConfiguredError();

  const ATTEMPTS = 3;
  let lastErr: unknown;

  // 1. Primary: Gemini with retries.
  if (GEMINI_API_KEY) {
    try {
      return await withRetries(ATTEMPTS, () => geminiOnce(model, userPrompt, options));
    } catch (e) {
      lastErr = e;
      console.warn('Gemini failed, falling back to Groq:', (e as Error).message);
    }
  }

  // 2. Fallback: Groq with retries.
  if (GROQ_API_KEY) {
    try {
      return await withRetries(ATTEMPTS, () => groqOnce(GROQ_MODEL, userPrompt, options));
    } catch (e) {
      lastErr = e;
    }
  }

  throw lastErr instanceof Error
    ? lastErr
    : new Error('All AI providers are unavailable. Please try again.');
}

/**
 * Calls the AI and parses the response as JSON, stripping ```json fences the
 * model sometimes adds. Use for every structured prompt (meal plan, recipe…).
 */
export async function callGeminiJson<T>(
  model: string,
  userPrompt: string,
  options: GeminiCallOptions = {}
): Promise<T> {
  const text = await callGemini(model, userPrompt, {
    temperature: 0.4,
    maxOutputTokens: 4096,
    json: true,
    ...options,
  });
  const cleaned = text.replace(/```json|```/g, '').trim();
  return JSON.parse(cleaned) as T;
}
