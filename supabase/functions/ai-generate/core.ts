// No credentials or provider responses are logged. Dependencies are injectable
// so the security checks can be exercised without contacting production.
export interface Usage { used: number; limit: number; remaining: number; resetsAt: string }
export type Bucket = 'coach' | 'generation' | 'validation';
export interface Reservation { allowed: boolean; requestId?: string; code?: string; usage: Usage }
export interface GatewayDependencies {
  authenticate(token: string): Promise<string | null>;
  entitlement(userId: string): Promise<'standard' | 'wellness_pro' | null>;
  usage(userId: string, bucket: Bucket, limit: number): Promise<Usage>;
  reserve(userId: string, bucket: Bucket, limit: number): Promise<Reservation>;
  finish(requestId: string, success: boolean): Promise<void>;
  env(name: string): string | undefined;
  fetch: typeof fetch;
  sleep(ms: number): Promise<void>;
}
type Message = { role: 'system' | 'user' | 'assistant'; content: string };
type Options = { temperature?: number; maxOutputTokens?: number; systemPrompt?: string; json?: boolean; maxTokens?: number };
type Input = { operation: 'coach' | 'generate' | 'usage'; task?: string; prompt?: string; messages?: Message[]; options: Options };
const TASKS = ['meal-plan', 'recipe', 'scoring', 'grocery', 'validation', 'smoothie', 'swap', 'checkin'];
const TRANSIENT = [403, 429, 500, 502, 503, 504];
class HttpError extends Error {
  constructor(public status: number) { super('Provider unavailable'); }
}
class InvalidRequest extends Error {}
function object(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
function boundedText(value: unknown, max: number): value is string {
  return typeof value === 'string' && value.trim().length > 0 && value.length <= max;
}
async function parseInput(req: Request): Promise<Input> {
  if (!req.headers.get('content-type')?.toLowerCase().startsWith('application/json')) throw new InvalidRequest();
  // Bound bytes while reading, including requests without Content-Length.
  const reader = req.body?.getReader();
  if (!reader) throw new InvalidRequest();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const chunk = await reader.read();
      if (chunk.done) break;
      size += chunk.value.byteLength;
      if (size > 65536) { await reader.cancel(); throw new InvalidRequest(); }
      chunks.push(chunk.value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  let body: unknown;
  try { body = JSON.parse(new TextDecoder().decode(bytes)); } catch { throw new InvalidRequest(); }
  if (!object(body) || !['coach', 'generate', 'usage'].includes(String(body.operation))) throw new InvalidRequest();
  const allowed = body.operation === 'coach' ? ['operation', 'messages', 'options']
    : body.operation === 'generate' ? ['operation', 'task', 'prompt', 'options'] : ['operation'];
  if (Object.keys(body).some((key) => !allowed.includes(key))) throw new InvalidRequest();
  const options = body.options ?? {};
  if (!object(options)) throw new InvalidRequest();
  const optionKeys = body.operation === 'coach' ? ['temperature', 'maxTokens'] : ['temperature', 'maxOutputTokens', 'systemPrompt', 'json'];
  if (Object.keys(options).some((key) => !optionKeys.includes(key))) throw new InvalidRequest();
  if (options.temperature !== undefined && (typeof options.temperature !== 'number' || !Number.isFinite(options.temperature) || options.temperature < 0 || options.temperature > 1)) throw new InvalidRequest();
  const tokenCap = body.operation === 'coach' ? 600 : body.task === 'validation' ? 150 : 8192;
  const tokens = body.operation === 'coach' ? options.maxTokens : options.maxOutputTokens;
  if (tokens !== undefined && (typeof tokens !== 'number' || !Number.isInteger(tokens) || tokens < 1 || tokens > tokenCap)) throw new InvalidRequest();
  if (options.json !== undefined && typeof options.json !== 'boolean') throw new InvalidRequest();
  if (options.systemPrompt !== undefined && !boundedText(options.systemPrompt, 16000)) throw new InvalidRequest();
  if (body.operation === 'generate' && (!TASKS.includes(String(body.task)) || !boundedText(body.prompt, body.task === 'validation' ? 4500 : 48000))) throw new InvalidRequest();
  if (body.operation === 'coach') {
    if (!Array.isArray(body.messages) || body.messages.length < 1 || body.messages.length > 14) throw new InvalidRequest();
    if (body.messages.some((m) => !object(m) || Object.keys(m).some((k) => !['role', 'content'].includes(k)) || !['system', 'user', 'assistant'].includes(String(m.role)) || !boundedText(m.content, 16000))) throw new InvalidRequest();
    if (body.messages.filter((m) => m.role === 'system').length > 1 || body.messages.at(-1)?.role !== 'user') throw new InvalidRequest();
  }
  return { ...body, options } as Input;
}

function configuredModel(deps: GatewayDependencies, name: string, fallback: string): string {
  const value = deps.env(name) || fallback;
  if (!/^[a-zA-Z0-9.-]+$/.test(value)) throw new Error('Invalid server configuration');
  return value;
}

async function generate(input: Input, tier: string | null, deps: GatewayDependencies): Promise<{ text: string; modelUsed: string }> {
  const deadline = Date.now() + 125000;
  const opts = input.options;
  const temperature = opts.temperature ?? (input.operation === 'coach' ? 0.6 : 0.7);
  const maxTokens = input.operation === 'coach' ? opts.maxTokens ?? 600
    : opts.maxOutputTokens ?? (input.task === 'validation' ? 150 : 2048);
  const flash = configuredModel(deps, 'GEMINI_FLASH_MODEL', 'gemini-3.5-flash-lite');
  const primary = input.operation === 'coach' || tier !== 'wellness_pro' || ['scoring', 'grocery', 'validation'].includes(input.task ?? '')
    ? flash : configuredModel(deps, 'GEMINI_PRO_MODEL', 'gemini-3.5-flash-lite');
  let completedModel = primary;
  const result = (text: string) => ({ text, modelUsed: completedModel });
  const messages: Message[] = input.operation === 'coach' ? input.messages! : [
    ...(opts.systemPrompt ? [{ role: 'system' as const, content: opts.systemPrompt }] : []),
    { role: 'user', content: input.prompt! },
  ];
  const system = messages.filter((m) => m.role === 'system').map((m) => m.content).join('\n\n');
  const contents = messages.filter((m) => m.role !== 'system').map((m) => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] }));
  while (contents[0]?.role === 'model') contents.shift();
  async function request(url: string, key: string, groq = false, model = ''): Promise<string> {
    const remaining = deadline - Date.now();
    if (remaining <= 0) throw new HttpError(408);
    const generationConfig: Record<string, unknown> = { temperature, maxOutputTokens: maxTokens };
    if (opts.json) generationConfig.responseMimeType = 'application/json';
    const body = groq ? {
      model, messages, temperature, max_tokens: maxTokens,
      ...(opts.json ? { response_format: { type: 'json_object' } } : {}),
    } : { contents, generationConfig, ...(system ? { systemInstruction: { parts: [{ text: system }] } } : {}) };
    const res = await deps.fetch(url, {
      method: 'POST', headers: { 'Content-Type': 'application/json', ...(groq ? { Authorization: `Bearer ${key}` } : { 'x-goog-api-key': key }) },
      body: JSON.stringify(body), signal: AbortSignal.timeout(Math.min(45000, remaining)),
    });
    if (!res.ok) { await res.body?.cancel(); throw new HttpError(res.status); }
    const data = await res.json();
    const text = groq ? data?.choices?.[0]?.message?.content
      : (data?.candidates?.[0]?.content?.parts ?? []).map((p: { text?: string }) => p.text ?? '').join('');
    if (typeof text !== 'string' || !text.trim()) throw new HttpError(502);
    completedModel = model;
    return text;
  }
  async function retry(fn: () => Promise<string>): Promise<string> {
    for (let i = 1; ; i++) {
      try { return await fn(); } catch (e) {
        const status = e instanceof HttpError ? e.status : 0;
        if ((status !== 0 && !TRANSIENT.includes(status)) || i === 3) throw e;
        await deps.sleep(i * (input.operation === 'coach' ? 1200 : 1500));
      }
    }
  }
  const geminiKey = deps.env('GEMINI_API_KEY');
  const groqKey = deps.env('GROQ_API_KEY');
  const gemini = (model: string) => retry(() => request(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, geminiKey!, false, model));
  let primaryError: unknown;
  if (geminiKey) {
    try { return result(await gemini(primary)); } catch (e) { primaryError = e; }
  }
  if (input.operation === 'coach') {
    const backup = configuredModel(deps, 'GEMINI_COACH_FALLBACK_MODEL', 'gemini-3.1-flash-lite');
    if (geminiKey && backup !== primary) {
      try { return result(await gemini(backup)); } catch { /* retain primary failure */ }
    }
  } else if (groqKey) {
    return result(await retry(() => request('https://api.groq.com/openai/v1/chat/completions', groqKey, true, configuredModel(deps, 'GROQ_MODEL', 'llama-3.3-70b-versatile'))));
  }
  throw primaryError ?? new Error('Provider unavailable');
}

export function createGateway(deps: GatewayDependencies): (req: Request) => Promise<Response> {
  return async (req) => {
    const origin = req.headers.get('origin');
    const origins = (deps.env('AI_ALLOWED_ORIGINS') ?? 'https://gbombs.app,https://www.gbombs.app').split(',').map((s) => s.trim());
    const allowedOrigin = !origin || origins.includes(origin);
    const headers: Record<string, string> = {
      'Content-Type': 'application/json', 'Cache-Control': 'no-store', Vary: 'Origin',
      'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      ...(origin && allowedOrigin ? { 'Access-Control-Allow-Origin': origin } : {}),
    };
    const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers });
    if (!allowedOrigin) return json({ code: 'unauthorized' }, 403);
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers });
    if (req.method !== 'POST') return json({ code: 'invalid_request' }, 405);
    let reservation: Reservation | undefined;
    try {
      const match = /^Bearer\s+(\S+)$/i.exec(req.headers.get('authorization') ?? '');
      if (!match) return json({ code: 'unauthorized' }, 401);
      const userId = await deps.authenticate(match[1]);
      if (!userId) return json({ code: 'unauthorized' }, 401);
      const input = await parseInput(req);
      const tier = await deps.entitlement(userId);
      const bucket: Bucket = input.operation === 'coach' || input.operation === 'usage' ? 'coach'
        : input.task === 'validation' ? 'validation' : 'generation';
      if (!tier && bucket !== 'validation') return json({ code: 'subscription_required' }, 403);
      const limit = bucket === 'coach' ? tier === 'wellness_pro' ? 50 : 20
        : bucket === 'validation' ? 20 : tier === 'wellness_pro' ? 200 : 100;
      if (input.operation === 'usage') return json({ usage: await deps.usage(userId, bucket, limit) });
      if (!deps.env('GEMINI_API_KEY') && (bucket === 'coach' || !deps.env('GROQ_API_KEY'))) return json({ code: 'not_configured' }, 503);
      reservation = await deps.reserve(userId, bucket, limit);
      if (!reservation.allowed) return json({ code: reservation.code, ...(bucket === 'coach' ? { usage: reservation.usage } : {}) }, 429);
      if (!reservation.requestId) throw new Error('Missing reservation');
      const generated = await generate(input, tier, deps);
      await deps.finish(reservation.requestId, true);
      reservation = undefined;
      return json({ ...generated, ...(bucket === 'coach' ? { usage: await deps.usage(userId, bucket, limit) } : {}) });
    } catch (e) {
      if (reservation?.requestId) {
        try { await deps.finish(reservation.requestId, false); } catch { /* stale leases expire; fail closed */ }
      }
      return json({ code: e instanceof InvalidRequest ? 'invalid_request' : 'provider_unavailable' }, e instanceof InvalidRequest ? 400 : 503);
    }
  };
}
