// Offline checks for shared chart data. No environment, database or AI access.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');

const moduleStub = { exports: {} };
const source = ts.transpileModule(fs.readFileSync('src/lib/reports.ts', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
vm.runInNewContext(source, {
  exports: moduleStub.exports, module: moduleStub,
  require: (name) => {
    if (name === './supabase') return { supabase: { from: () => { throw Error('Network disabled in offline test'); } } };
    if (name === './dailyCheckIn') return { todayLocalDate: () => '2026-01-03', loadTodayCheckIn: async () => null };
    throw Error(`Unexpected test dependency: ${name}`);
  },
});
const { computeReport, mergeLocalCheckIn, loadReport } = moduleStub.exports;
const row = (date, score) => ({ score_date: date, gbombs_score: score, greens_hit: score > 0,
  beans_hit: score > 1, onion_hit: score > 2, mushroom_hit: score > 3, berries_hit: score > 4, seeds_hit: score > 5 });

async function main() {
  const rows = [row('2025-12-28', 0), row('2026-01-01', 4), row('2026-01-02', 6)];
  const report = computeReport(rows, '2026-01-03', 7);
  assert.equal(report.trend.length, 7);
  assert.equal(report.trend[0].date, '2025-12-28');
  assert.equal(report.trend[0].score, 0); // A logged zero is different from a missing day.
  assert.equal(report.trend[1].score, null);
  assert.equal(report.daysLogged, 3);
  assert.equal(report.avgScore, 3.3); // Unlogged days don't lower the average.
  assert.equal(report.perfectDays, 1);
  assert.equal(report.coverage.find(group => group.key === 'seeds').pct, 33);

  const local = { scoreDate: '2026-01-02', score: 2, categoriesHit: ['beans', 'berries'] };
  const merged = mergeLocalCheckIn(rows, local);
  assert.equal(merged.length, rows.length); // Edit replaces a day instead of double counting it.
  assert.equal(rows[2].gbombs_score, 6); // The source rows remain untouched.
  const updated = computeReport(merged, '2026-01-03', 7);
  assert.equal(updated.perfectDays, 0);
  assert.equal(updated.trend.find(point => point.date === local.scoreDate).score, 2);
  assert.equal(updated.coverage.find(group => group.key === 'berries').hits, 1);
  assert.equal(updated.coverage.find(group => group.key === 'seeds').hits, 0);
  assert.equal(mergeLocalCheckIn(rows, null), rows);
  const today = mergeLocalCheckIn(rows, { ...local, scoreDate: '2026-01-03' });
  assert.equal(computeReport(today, '2026-01-03', 7).daysLogged, 4);
  assert.equal(computeReport([], '2026-01-03', 7).trend.every(point => point.score === null), true);
  assert.equal((await loadReport('offline-fixture', 30)).daysLogged, 0);
  let cached = null;
  const dashboardModule = { exports: {} };
  const dashboardSource = ts.transpileModule(fs.readFileSync('src/lib/dashboard.ts', 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const remoteRows = [row('2026-01-03', 4)];
  vm.runInNewContext(dashboardSource, {
    exports: dashboardModule.exports, module: dashboardModule,
    require: name => {
      if (name === './reports') return moduleStub.exports;
      if (name === './dailyCheckIn') return { todayLocalDate: () => '2026-01-03', loadTodayCheckIn: async () => cached };
      if (name === './mealPlanCache') return { loadCachedPlan: async () => null };
      if (name === './supabase') return { supabase: { from: () => {
        const query = { select: () => query, eq: () => query, order: () => query,
          limit: async () => ({ data: remoteRows }), single: async () => ({ data: { trial_ends_at: null } }) };
        return query;
      } } };
      throw Error('Unexpected offline dashboard dependency');
    },
  });
  const remoteDashboard = await dashboardModule.exports.loadDashboard('offline-fixture');
  assert.equal(remoteDashboard.checkIn, null);
  assert.equal(remoteDashboard.todayScore.score, 4);
  assert.equal(remoteDashboard.todayScore.categoriesHit.join(','), 'greens,beans,onion,mushroom');
  assert.equal(remoteDashboard.trend.at(-1).score, 4);
  cached = { ...local, scoreDate: '2026-01-03' };
  const cachedDashboard = await dashboardModule.exports.loadDashboard('offline-fixture');
  assert.equal(cachedDashboard.todayScore.score, 2);
  assert.equal(cachedDashboard.trend.at(-1).score, 2);
  assert.equal(cachedDashboard.todayScore.categoriesHit.join(','), 'beans,berries');
  console.log('25 progress data checks passed. No network access.');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
