// Exercise the real Deno entrypoint's auth/subscription adapter offline.
const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const ts = require('typescript');
const source = ts.transpileModule(fs.readFileSync('supabase/functions/ai-generate/index.ts', 'utf8'), {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
}).outputText;
function adapter({ subscriptions = [], connections = [], user = { id: 'owner', is_anonymous: false }, authError = false, dbError = false } = {}) {
  let captured;
  const queried = [], tokens = [];
  const admin = {
    auth: { getUser: async (token) => { tokens.push(token); return { data: { user }, error: authError }; } },
    from(table) {
      queried.push(table);
      assert(['subscriptions', 'professional_connections'].includes(table), 'Unexpected trust in profile claims');
      let rows = table === 'subscriptions' ? [...subscriptions] : [...connections];
      const result = () => ({ data: rows, error: dbError });
      const query = {
        select() { return query; },
        eq(key, value) { rows = rows.filter((row) => row[key] === value); return query; },
        in(key, values) { rows = rows.filter((row) => values.includes(row[key])); return query; },
        async maybeSingle() { return { ...result(), data: rows[0] ?? null }; },
        then(resolve, reject) { return Promise.resolve(result()).then(resolve, reject); },
      };
      return query;
    },
    rpc: async () => ({ data: null, error: true }),
  };
  vm.runInNewContext(source, {
    exports: {},
    require(name) {
      if (name.startsWith('jsr:')) return {};
      if (name.startsWith('https:')) return { createClient: () => admin };
      if (name === './core.ts') return { createGateway: (deps) => { captured = deps; return () => {}; } };
      throw new Error('Unexpected import');
    },
    Deno: { env: { get: () => 'offline-fixture' }, serve: () => {} },
    fetch: () => { throw new Error('Network prohibited in auth tests'); },
    setTimeout,
  });
  return { deps: captured, queried, tokens };
}
async function main() {
  let checks = 0;
  const sub = (user_id = 'owner', tier = 'standard', status = 'active', stripe_subscription_id = 'offline-subscription') => ({ user_id, tier, status, stripe_subscription_id });
  const connection = (status = 'active') => ({ professional_id: 'owner', client_id: 'client', status });
  let f = adapter();
  assert.equal(await f.deps.authenticate('offline-user-token'), 'owner');
  assert.deepEqual(f.tokens, ['offline-user-token']); checks++;
  for (const options of [{ authError: true }, { user: null }, { user: { id: 'anonymous', is_anonymous: true } }]) {
    assert.equal(await adapter(options).deps.authenticate('offline-token'), null); checks++;
  }
  for (const tier of ['standard', 'wellness_pro']) {
    for (const status of ['active', 'trialing']) {
      f = adapter({ subscriptions: [sub('owner', tier, status)] });
      assert.equal(await f.deps.entitlement('owner'), tier); checks++;
      assert.deepEqual(f.queried, ['subscriptions']);
    }
  }
  for (const subscription of [sub('owner', 'standard', 'canceled'), sub('owner', 'standard', 'past_due'), sub('owner', 'standard', 'trialing', null), sub('owner', 'trial'), sub('somebody-else')]) {
    assert.equal(await adapter({ subscriptions: [subscription] }).deps.entitlement('owner'), null); checks++;
  }
  assert.equal(await adapter().deps.entitlement('owner'), null); checks++;
  f = adapter({ connections: [connection()], subscriptions: [sub('client', 'wellness_pro')] });
  assert.equal(await f.deps.entitlement('owner'), 'wellness_pro'); checks++;
  for (const options of [
    { connections: [connection('revoked')], subscriptions: [sub('client', 'wellness_pro')] },
    { connections: [connection('pending')], subscriptions: [sub('client', 'wellness_pro')] },
    { connections: [connection()], subscriptions: [sub('client', 'wellness_pro', 'canceled')] },
    { connections: [connection()], subscriptions: [sub('client', 'standard')] },
    { connections: [connection()], subscriptions: [sub('unrelated', 'wellness_pro')] },
  ]) {
    assert.equal(await adapter(options).deps.entitlement('owner'), null); checks++;
  }
  await assert.rejects(adapter({ dbError: true }).deps.entitlement('owner')); checks++;
  for (const method of ['usage', 'reserve']) {
    await assert.rejects(adapter().deps[method]('owner', 'coach', 20)); checks++;
  }
  await assert.rejects(adapter().deps.finish('offline-request', true)); checks++;
  console.log(`Passed ${checks} offline authentication, subscription and database failure checks.`);
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
