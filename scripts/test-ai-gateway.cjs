// Offline security suite: no environment files, real keys, DB or network calls.
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const Module = require('node:module');
const ts = require('typescript');

async function main() {
  const filename = path.resolve('supabase/functions/ai-generate/core.ts');
  const compiled = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
  }).outputText;
  const gatewayModule = new Module(filename, module);
  gatewayModule._compile(compiled, filename);
  const { createGateway } = gatewayModule.exports;
  const userId = '00000000-0000-4000-8000-000000000001';
  function fixture(overrides = {}) {
    const calls = [], delays = [], rows = [];
    const env = { GEMINI_API_KEY: 'offline-gemini-fixture', GROQ_API_KEY: 'offline-groq-fixture' };
    let tier = 'standard', failure = null;
    const usage = async (_id, bucket, limit) => {
      const used = rows.filter((row) => row.bucket === bucket && row.state !== 'failed').length;
      return { used, limit, remaining: Math.max(0, limit - used), resetsAt: '2026-10-04T00:00:00Z' };
    };
    const deps = {
      authenticate: async (token) => token === 'offline-user-jwt' ? userId : null,
      entitlement: async () => tier,
      usage,
      reserve: async (id, bucket, limit) => {
        assert.equal(id, userId);
        const current = await usage(id, bucket, limit);
        if (!current.remaining) return { allowed: false, code: 'daily_limit', usage: current };
        const row = { id: String(rows.length + 1), bucket, state: 'pending' };
        rows.push(row);
        return { allowed: true, requestId: row.id, usage: await usage(id, bucket, limit) };
      },
      finish: async (id, success) => { rows.find((row) => row.id === id).state = success ? 'succeeded' : 'failed'; },
      env: (name) => env[name],
      sleep: async (ms) => { delays.push(ms); },
      fetch: async (url, options) => {
        calls.push({ url, options, body: JSON.parse(options.body) });
        if (failure) return failure(url, options);
        return Response.json({ candidates: [{ content: { parts: [{ text: 'offline response' }] } }] });
      },
      ...overrides,
    };
    return { calls, delays, rows, env, setTier: (value) => { tier = value; }, setFailure: (fn) => { failure = fn; }, handler: createGateway(deps) };
  }
  const coach = { operation: 'coach', messages: [{ role: 'system', content: 'Six Plants Coach' }, { role: 'user', content: 'Hello' }], options: { temperature: 0.6, maxTokens: 600 } };
  const generation = { operation: 'generate', task: 'meal-plan', prompt: 'Create a plan', options: { json: true, maxOutputTokens: 8192 } };
  const request = (body, extra = {}) => new Request('https://offline.invalid/ai-generate', {
    method: 'POST', headers: { authorization: 'Bearer offline-user-jwt', 'content-type': 'application/json', origin: 'https://gbombs.app', ...extra }, body: JSON.stringify(body),
  });
  let checks = 0;
  async function rejected(f, body, status, headers = {}) {
    const result = await f.handler(request(body, headers));
    assert.equal(result.status, status);
    assert.equal(f.calls.length, 0);
    assert.equal(f.rows.length, 0);
    checks++;
    return result.json();
  }
  await rejected(fixture(), coach, 401, { authorization: '' });
  await rejected(fixture(), coach, 401, { authorization: 'Bearer forged-jwt' });
  await rejected(fixture(), coach, 403, { origin: 'https://attacker.invalid' });
  await rejected(fixture(), { ...coach, userId: 'another-user' }, 400);
  await rejected(fixture(), { ...coach, tier: 'wellness_pro' }, 400);
  await rejected(fixture(), { ...generation, model: 'arbitrary-model' }, 400);
  await rejected(fixture(), { ...generation, endpoint: 'https://attacker.invalid' }, 400);
  await rejected(fixture(), { ...generation, task: 'arbitrary' }, 400);
  await rejected(fixture(), { ...coach, options: { maxTokens: 1000000 } }, 400);
  await rejected(fixture(), { ...generation, options: { maxOutputTokens: 8193 } }, 400);
  await rejected(fixture(), { ...generation, options: { temperature: 5 } }, 400);
  await rejected(fixture(), { ...generation, options: { json: 'yes' } }, 400);
  await rejected(fixture(), { ...coach, messages: [{ role: 'assistant', content: 'No user' }] }, 400);
  await rejected(fixture(), { ...coach, messages: Array(15).fill({ role: 'user', content: 'Hello' }) }, 400);
  await rejected(fixture(), { ...generation, prompt: 'x'.repeat(65537) }, 400);
  // Byte cap is independent of character cap and Content-Length.
  await rejected(fixture(), { ...generation, prompt: '\uD83C\uDF31'.repeat(20000) }, 400);
  await rejected(fixture(), coach, 400, { 'content-type': 'text/plain' });
  const unpaid = fixture(); unpaid.setTier(null);
  await rejected(unpaid, coach, 403);
  await rejected(unpaid, generation, 403);
  const validation = { operation: 'generate', task: 'validation', prompt: 'Validate spinach', options: { maxOutputTokens: 150, json: true } };
  assert.equal((await unpaid.handler(request(validation))).status, 200); checks++;
  const unconfigured = fixture(); delete unconfigured.env.GEMINI_API_KEY; delete unconfigured.env.GROQ_API_KEY;
  await rejected(unconfigured, coach, 503);
  const preflight = await fixture().handler(new Request('https://offline.invalid', { method: 'OPTIONS', headers: { origin: 'https://www.gbombs.app' } }));
  assert.equal(preflight.status, 204); assert.equal(preflight.headers.get('access-control-allow-origin'), 'https://www.gbombs.app'); checks++;
  const f = fixture();
  let result = await f.handler(request(coach));
  assert.equal(result.status, 200);
  assert.equal(result.headers.get('cache-control'), 'no-store');
  const initialReply = await result.json();
  assert.equal(initialReply.usage.remaining, 19);
  assert.equal(initialReply.modelUsed, 'gemini-3.5-flash-lite');
  assert.match(f.calls[0].url, /gemini-3\.5-flash-lite:generateContent$/);
  assert(!f.calls[0].url.includes('key='));
  assert.equal(f.calls[0].body.generationConfig.maxOutputTokens, 600);
  assert.equal(f.rows[0].state, 'succeeded'); checks++;
  // Independent requests and usage reads see the same server allowance.
  result = await f.handler(request({ operation: 'usage' }));
  assert.equal((await result.json()).usage.remaining, 19); assert.equal(f.calls.length, 1); checks++;
  const premium = fixture(); premium.setTier('wellness_pro');
  result = await premium.handler(request(coach)); assert.equal((await result.json()).usage.limit, 50); checks++;
  for (const task of ['meal-plan', 'recipe', 'smoothie', 'grocery', 'swap', 'checkin', 'scoring', 'validation']) {
    const pf = fixture(); pf.setTier('wellness_pro');
    assert.equal((await pf.handler(request({ ...generation, task, options: { json: true, maxOutputTokens: task === 'validation' ? 150 : 4096 } }))).status, 200);
    assert.match(pf.calls[0].url, /gemini-3\.5-flash-lite:generateContent$/); checks++;
  }
  const exhausted = fixture();
  exhausted.rows.push(...Array.from({ length: 20 }, (_, i) => ({ id: String(i), bucket: 'coach', state: 'succeeded' })));
  result = await exhausted.handler(request(coach));
  assert.equal(result.status, 429); assert.equal((await result.json()).usage.remaining, 0); assert.equal(exhausted.calls.length, 0); checks++;
  for (const code of ['rate_limit', 'busy']) {
    const limited = fixture({ reserve: async () => ({ allowed: false, code, usage: { used: 0, limit: 20, remaining: 20, resetsAt: '2026-10-04T00:00:00Z' } }) });
    assert.equal((await limited.handler(request(coach))).status, 429); assert.equal(limited.calls.length, 0); checks++;
  }
  const coachFallback = fixture();
  coachFallback.setFailure((url) => url.includes('3.5') ? new Response('PRIVATE UPSTREAM DETAIL', { status: 503 }) : Response.json({ candidates: [{ content: { parts: [{ text: 'backup' }] } }] }));
  const backupReply = await (await coachFallback.handler(request(coach))).json();
  assert.equal(backupReply.text, 'backup');
  assert.equal(backupReply.modelUsed, 'gemini-3.1-flash-lite');
  assert.equal(coachFallback.calls.length, 4); assert.deepEqual(coachFallback.delays, [1200, 2400]);
  assert.match(coachFallback.calls[3].url, /gemini-3\.1-flash-lite/); checks++;
  const groqFallback = fixture();
  groqFallback.setFailure((url) => url.includes('googleapis') ? new Response('PRIVATE UPSTREAM DETAIL', { status: 429 }) : Response.json({ choices: [{ message: { content: '{"days":[]}' } }] }));
  const groqResponse = await groqFallback.handler(request(generation));
  assert.equal(groqResponse.status, 200);
  assert.equal((await groqResponse.json()).modelUsed, 'llama-3.3-70b-versatile');
  assert.equal(groqFallback.calls.length, 4); assert.deepEqual(groqFallback.delays, [1500, 3000]);
  assert.equal(groqFallback.calls[3].body.model, 'llama-3.3-70b-versatile'); checks++;
  const failed = fixture();
  failed.setFailure(() => new Response('PRIVATE UPSTREAM DETAIL offline-gemini-fixture', { status: 401 }));
  result = await failed.handler(request(coach));
  assert.equal(result.status, 503); assert.deepEqual(await result.json(), { code: 'provider_unavailable' });
  assert.equal(failed.calls.length, 2); assert.equal(failed.rows[0].state, 'failed');
  assert.equal((await (await failed.handler(request({ operation: 'usage' }))).json()).usage.remaining, 20); checks++;
  const dbFailure = fixture({ reserve: async () => { throw new Error('private database detail'); } });
  result = await dbFailure.handler(request(coach)); assert.equal(result.status, 503); assert.equal(dbFailure.calls.length, 0); checks++;
  const authFailure = fixture({ authenticate: async () => { throw new Error('private auth detail'); } });
  assert.equal((await authFailure.handler(request(coach))).status, 503); assert.equal(authFailure.calls.length, 0); checks++;
  const noGemini = fixture(); delete noGemini.env.GEMINI_API_KEY;
  noGemini.setFailure(() => Response.json({ choices: [{ message: { content: '{}' } }] }));
  assert.equal((await noGemini.handler(request(generation))).status, 200); assert.equal(noGemini.calls.length, 1); checks++;
  // Review guardrails for the SQL implementation; runtime DB checks are separate.
  const sql = fs.readFileSync('supabase/migrations/20261003010000_private_ai_gateway.sql', 'utf8');
  assert(sql.includes('pg_advisory_xact_lock')); assert(sql.includes('enable row level security'));
  assert(sql.includes("interval '180 seconds'")); assert(sql.includes("interval '1 minute'"));
  for (const name of ['get_ai_usage', 'reserve_ai_request', 'finish_ai_request']) {
    assert.match(sql, new RegExp(`revoke all on function public.${name}\\([^;]+from public, anon, authenticated`));
  }
  checks++;
  console.log(`Passed ${checks} offline AI security and routing checks. No real network requests.`);
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
