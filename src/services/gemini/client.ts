/** Authenticated AI transport. Provider routing and credentials are server-only. */
import { jsonrepair } from 'jsonrepair';
import type { GeminiTask } from './types';
import { invokeAi, isAiGatewayConfigured } from '@/services/ai/client';

export function tierUsesPro(tier: string): boolean { return tier === 'wellness_pro'; }
/** Legacy helper name retained for callers; sends a task, never a model or tier. */
export function getModel(task: GeminiTask, _tier: string): GeminiTask { return task; }
export class GeminiNotConfiguredError extends Error {
  constructor() {
    super('The AI service is not available right now.');
    this.name = 'GeminiNotConfiguredError';
  }
}
export const isGeminiConfigured = isAiGatewayConfigured;
export const isAiConfigured = isAiGatewayConfigured;
export interface GeminiCallOptions {
  temperature?: number;
  maxOutputTokens?: number;
  systemPrompt?: string;
  json?: boolean;
}
async function callGeminiResponse(task: GeminiTask, userPrompt: string, options: GeminiCallOptions) {
  if (!isAiConfigured()) throw new GeminiNotConfiguredError();
  return invokeAi({ operation: 'generate', task, prompt: userPrompt, options });
}
export async function callGemini(task: GeminiTask, userPrompt: string, options: GeminiCallOptions = {}): Promise<string> {
  return (await callGeminiResponse(task, userPrompt, options)).text ?? '';
}

/**
 * Slice out the first balanced JSON value (object or array) from a string,
 * ignoring any prose the model wrote before or after it. Brace/bracket counting
 * is string-aware so braces inside string literals don't throw off the balance.
 * Returns the trimmed input unchanged if no JSON opener is found.
 */
function extractJsonBlock(input: string): string {
  const start = input.search(/[[{]/);
  if (start === -1) return input.trim();
  const open = input[start];
  const close = open === '{' ? '}' : ']';

  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < input.length; i++) {
    const ch = input[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === open) depth++;
    else if (ch === close) {
      depth--;
      if (depth === 0) return input.slice(start, i + 1);
    }
  }
  // Unbalanced (truncated output) — return from the opener so the caller's
  // trailing-comma repair + parse gets the best shot at the partial block.
  return input.slice(start);
}

/**
 * Calls the AI and parses the response as JSON. Model output is frequently
 * almost-valid — wrapped in ```json fences, surrounded by prose, carrying
 * trailing commas, unescaped quotes/newlines inside strings, or truncated
 * mid-structure. We escalate through cheap repairs so clean responses stay on
 * the fast path, then fall back to a full tokenizing repair (jsonrepair) that
 * handles the deep-in-the-list breakages JSON.parse can't recover from.
 */
export async function callGeminiJson<T>(
  model: GeminiTask,
  userPrompt: string,
  options: GeminiCallOptions = {}
): Promise<T & { modelUsed: string }> {
  const response = await callGeminiResponse(model, userPrompt, {
    temperature: 0.4,
    maxOutputTokens: 4096,
    json: true,
    ...options,
  });
  const text = response.text ?? '';
  // Preserve existing plan/list telemetry using the actual server-selected
  // model, including fallback. Metadata is never chosen by model-generated JSON.
  const withMetadata = (value: T) => Object.assign(value as object, {
    modelUsed: response.modelUsed ?? 'server-selected',
  }) as T & { modelUsed: string };
  const defenced = text.replace(/```json|```/g, '').trim();

  // 1. Fast path: already-clean JSON.
  try {
    return withMetadata(JSON.parse(defenced) as T);
  } catch {
    /* fall through to repair */
  }

  // 2. Isolate the JSON value from any surrounding prose, then parse.
  const block = extractJsonBlock(defenced);
  try {
    return withMetadata(JSON.parse(block) as T);
  } catch {
    /* fall through to full repair */
  }

  // 3. Tokenizing repair: fixes trailing commas, unescaped quotes/newlines in
  //    strings, missing commas, and closes structures truncated by token limits.
  try {
    return withMetadata(JSON.parse(jsonrepair(block)) as T);
  } catch (e) {
    const snippet = block.slice(0, 200);
    throw new Error(
      `AI returned malformed JSON (${(e as Error).message}). Near: ${snippet}`
    );
  }
}
