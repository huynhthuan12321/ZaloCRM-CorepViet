// Copy of 6a2-api-acceptance.ts for the 6A rerun after remediation; DB/port/role names changed.
import { readFile, writeFile } from 'node:fs/promises';

const baseUrl = process.env.REPORTS_6A_BASE_URL;
const artifactDir = process.env.REPORTS_6A_ARTIFACT_DIR;
if (!baseUrl || !artifactDir) throw new Error('Explicit 6A API URL and artifact directory are required.');
const parsedUrl = new URL(baseUrl);
if (parsedUrl.origin !== 'http://127.0.0.1:55574') throw new Error('Refusing to call a non-6A local API.');

const fakePassword = process.env.REPORTS_FIXTURE_PASSWORD!;
const id = (name: string) => `6a-${name}`;
type Result = { name: string; expected: unknown; actual: unknown; passed: boolean };
type HttpResult = { status: number; elapsedMs: number; body: any };
const results: Result[] = [];
const endpointTimings: Array<{ path: string; status: number; elapsedMs: number }> = [];
const tokens = new Map<string, string>();

function check(name: string, expected: unknown, actual: unknown) {
  const passed = JSON.stringify(expected) === JSON.stringify(actual);
  results.push({ name, expected, actual, passed });
  return passed;
}

async function request(path: string, token?: string, method = 'GET', body?: unknown): Promise<HttpResult> {
  const started = performance.now();
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...(body === undefined ? {} : { 'content-type': 'application/json' }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const elapsedMs = Math.round((performance.now() - started) * 100) / 100;
  const text = await response.text();
  let parsed: any;
  try { parsed = text ? JSON.parse(text) : null; }
  catch { parsed = { nonJsonBytes: text.length }; }
  endpointTimings.push({ path, status: response.status, elapsedMs });
  return { status: response.status, elapsedMs, body: parsed };
}

async function login(key: string, email: string) {
  const result = await request('/api/v1/auth/login', undefined, 'POST', { email, password: fakePassword });
  check(`login ${key}`, 200, result.status);
  if (result.status !== 200 || typeof result.body?.token !== 'string') {
    throw new Error(`Synthetic fixture login failed for ${key} (HTTP ${result.status}).`);
  }
  tokens.set(key, result.body.token);
  check(`login profile role ${key}`, expectedRole(key), result.body.user?.role);
  if (key === 'leaderA' || key === 'deputyA') {
    check(`login profile department role ${key}`, key === 'leaderA' ? 'leader' : 'deputy', result.body.user?.deptRole);
    check(`login profile report grant ${key}`, true, result.body.user?.grants?.engagement_score?.access === true);
  }
  if (key === 'memberA') {
    check('member report grant absent', false, result.body.user?.grants?.engagement_score?.access === true);
  }
}

function expectedRole(key: string) {
  return key === 'adminA' || key === 'adminB' ? 'admin' : 'member';
}

function query(from: string, to: string) {
  return `?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`;
}

async function main() {
  const manifest = JSON.parse(await readFile(`${artifactDir}\\fixture-manifest.json`, 'utf8'));
  const oracle = JSON.parse(await readFile(`${artifactDir}\\sql-oracle.json`, 'utf8'));
  const periodQuery = query(manifest.dates.yesterday, manifest.dates.yesterday);
  const emails = {
    adminA: '6a-admin-a@example.invalid',
    leaderA: '6a-leader-a@example.invalid',
    deputyA: '6a-deputy-a@example.invalid',
    memberA: '6a-member-a@example.invalid',
    memberB: '6a-member-b@example.invalid',
    adminB: '6a-admin-b@example.invalid',
  };
  for (const [key, email] of Object.entries(emails)) await login(key, email);
  await new Promise((resolve) => setTimeout(resolve, 750));

  const health = await request('/__6a/health');
  check('local isolated harness health', 200, health.status);
  const unauthenticated = await request(`/api/v1/reports/overview${periodQuery}`);
  check('report API requires JWT', 401, unauthenticated.status);

  const reportPaths = [
    '/api/v1/reports/overview',
    '/api/v1/reports/nick-fleet',
    '/api/v1/reports/sales-performance',
    '/api/v1/reports/pipeline',
    '/api/v1/reports/lead-pool',
    '/api/v1/reports/automation',
    '/api/v1/reports/automation-summary',
    '/api/v1/reports/broadcast',
    '/api/v1/reports/engagement',
    '/api/v1/reports/audit',
    '/api/v1/reports/ai',
    '/api/v1/reports/crm-usage',
  ];
  const adminResponses = new Map<string, HttpResult>();
  for (const path of reportPaths) {
    const result = await request(`${path}${periodQuery}`, tokens.get('adminA'));
    adminResponses.set(path, result);
    check(`admin A can call ${path}`, 200, result.status);
  }

  const overview = adminResponses.get('/api/v1/reports/overview')?.body;
  check('overview org total contacts', oracle.contacts.org_total, overview?.kpis?.totalContacts);
  check('overview new contacts in VN day', oracle.contacts.org_new_period, overview?.kpis?.newContacts);
  check('overview current-day appointment', oracle.appointments.today, overview?.kpis?.apptToday);
  check('overview completed appointment in period', oracle.appointments.completed_period, overview?.kpis?.apptDone);
  check('overview lead pool waiting', oracle.leadPool.waiting, overview?.kpis?.leadPoolWaiting);

  const pipeline = adminResponses.get('/api/v1/reports/pipeline')?.body;
  const adminFunnel = Object.fromEntries((pipeline?.funnel ?? []).map((row: any) => [row.status, row.count]));
  check('pipeline new stage', oracle.statuses.org[manifest.ids.statusNewA], adminFunnel['6A New']);
  check('pipeline won stage', oracle.statuses.org[manifest.ids.statusWonA], adminFunnel['6A Won']);
  check('pipeline measured unavailable remains null', null, pipeline?.kpis?.returnRate);

  const engagement = adminResponses.get('/api/v1/reports/engagement')?.body;
  check('engagement customer-initiated percent', oracle.engagement.orgCustomerInitiatedPct, engagement?.kpis?.customerInitiatedPct);
  check('engagement event coverage stays unavailable', 'engagement_daily_coverage_unverified', engagement?.availability?.avgInteractionsPerDay?.reason);
  check('engagement inbound total', oracle.engagement.org.inbound, engagement?.interactionTypes?.inbound);
  check('engagement outbound total', oracle.engagement.org.outbound, engagement?.interactionTypes?.outbound);

  const automation = await request(`/api/v1/reports/automation-summary${periodQuery}`, tokens.get('adminA'));
  check('admin automation summary', 200, automation.status);
  check('automation accepted plus rejected invites', 2, automation.body?.kpis?.kbGui);
  check('automation accepted', oracle.automation.attempts.accepted, automation.body?.kpis?.dongY);
  check('automation rejected', oracle.automation.attempts.rejected, automation.body?.kpis?.tuChoi);
  check('automation no-zalo', oracle.automation.attempts.no_zalo, automation.body?.kpis?.noZalo);
  check('automation follow-up sends', oracle.automation.careEvents.step_sent, automation.body?.kpis?.bdGui);
  check('automation customer replies', oracle.automation.careEvents.reply, automation.body?.kpis?.phanHoi);
  check(
    'automation reconnects by nick',
    oracle.automation.reconnects,
    automation.body?.byNick?.find((row: any) => row.zaloAccountId === manifest.ids.nickMain)?.reconnect,
  );
  check('automation org nick total', 4, automation.body?.kpis?.tongNick);

  const broadcast = adminResponses.get('/api/v1/reports/broadcast')?.body;
  check('broadcast job count', oracle.broadcast.jobs, broadcast?.kpis?.totalJobs);
  check('broadcast paused job excluded from active', oracle.broadcast.active_jobs, broadcast?.kpis?.activeJobs);
  check('broadcast run count', oracle.broadcast.runs, broadcast?.kpis?.totalRuns);
  check('broadcast sent total', oracle.broadcast.sent, broadcast?.kpis?.totalSent);
  check('broadcast failed total', oracle.broadcast.failed, broadcast?.kpis?.totalFailed);
  check('broadcast skipped total', oracle.broadcast.skipped, broadcast?.kpis?.totalSkipped);
  check('broadcast success rate percent', 75, broadcast?.kpis?.successRatePct);

  const aiAdmin = adminResponses.get('/api/v1/reports/ai')?.body;
  check('AI admin org sent messages', oracle.ai.adminOrg.sentMessages, aiAdmin?.main?.kpis?.sentMessages);
  check('AI admin auto replies', oracle.ai.adminOrg.autoReplies, aiAdmin?.main?.kpis?.autoReplies);
  check('AI admin followups', oracle.ai.adminOrg.followups, aiAdmin?.main?.kpis?.followups);
  check('AI admin unclassified', oracle.ai.adminOrg.unclassified, aiAdmin?.main?.kpis?.unclassified);
  check('AI duplicate audit is not double-counted', oracle.ai.adminOrg.followups, aiAdmin?.main?.kpis?.followups);
  check('AI dry-run/local/deleted/out-of-period excluded', oracle.ai.adminOrg.sentMessages, aiAdmin?.main?.kpis?.sentMessages);
  check('AI admin unavailable metrics are null values', null, aiAdmin?.unavailable?.cost);

  const leader = tokens.get('leaderA')!;
  const deputy = tokens.get('deputyA')!;
  const leaderOverview = await request(`/api/v1/reports/overview${periodQuery}`, leader);
  check('leader overview authorized', 200, leaderOverview.status);
  check('leader overview new contacts limited to A subtree', oracle.contacts.team_new_period, leaderOverview.body?.kpis?.newContacts);
  check('leader overview main total excludes other department', oracle.contacts.team_total, leaderOverview.body?.kpis?.totalContacts);

  const leaderAi = await request(`/api/v1/reports/ai${periodQuery}`, leader);
  check('leader AI report authorized', 200, leaderAi.status);
  check('leader AI main totals', oracle.ai.leader.main, leaderAi.body?.main?.kpis);
  check('leader AI shared section totals', oracle.ai.leader.shared, leaderAi.body?.shared?.kpis);
  check('leader shared account count', 1, leaderAi.body?.scope?.sharedAccounts);
  check('leader cannot see private nick marker', false, JSON.stringify(leaderAi.body).includes('6A Private'));

  const leaderPipeline = await request(`/api/v1/reports/pipeline${periodQuery}`, leader);
  const leaderFunnel = Object.fromEntries((leaderPipeline.body?.funnel ?? []).map((row: any) => [row.status, row.count]));
  check('leader pipeline excludes other department contacts', Object.values(oracle.statuses.team).reduce((a: number, b: number) => a + b, 0), Object.values(leaderFunnel).reduce((a: any, b: any) => a + b, 0));
  check('leader pipeline new stage', oracle.statuses.team[manifest.ids.statusNewA], leaderFunnel['6A New']);
  check('leader pipeline won stage', oracle.statuses.team[manifest.ids.statusWonA], leaderFunnel['6A Won']);

  const leaderEngagement = await request(`/api/v1/reports/engagement${periodQuery}`, leader);
  check('leader engagement customer initiated', oracle.engagement.teamCustomerInitiatedPct, leaderEngagement.body?.kpis?.customerInitiatedPct);
  check('leader engagement interaction sum', oracle.engagement.team.inbound, leaderEngagement.body?.interactionTypes?.inbound);

  for (const path of reportPaths) {
    const result = await request(`${path}${periodQuery}`, leader);
    const shouldBeAllowed = [
      '/api/v1/reports/overview',
      '/api/v1/reports/nick-fleet',
      '/api/v1/reports/sales-performance',
      '/api/v1/reports/pipeline',
      '/api/v1/reports/lead-pool',
      '/api/v1/reports/engagement',
      '/api/v1/reports/ai',
      '/api/v1/reports/crm-usage',
    ].includes(path);
    check(`leader direct API ${path}`, shouldBeAllowed ? 200 : 403, result.status);
  }
  const deputyAi = await request(`/api/v1/reports/ai${periodQuery}`, deputy);
  check('deputy API access granted independently', 200, deputyAi.status);
  check('deputy main AI data follows same subtree', oracle.ai.leader.main, deputyAi.body?.main?.kpis);
  check('deputy shared AI data follows explicit nick grant', oracle.ai.leader.shared, deputyAi.body?.shared?.kpis);

  const member = tokens.get('memberA')!;
  for (const path of reportPaths) {
    const result = await request(`${path}${periodQuery}`, member);
    check(`member direct API denied ${path}`, 403, result.status);
  }
  const memberCustom = await request('/api/v1/analytics/custom', member, 'POST', {
    metrics: ['contacts_new'],
    groupBy: 'user',
    dateRange: { from: manifest.dates.yesterday, to: manifest.dates.yesterday },
  });
  check('member direct custom report denied', 403, memberCustom.status);
  const memberSavedRun = await request(`/api/v1/saved-reports/${id('saved-report-leader')}/run`, member, 'POST', {});
  check('member direct saved-report execution denied', 403, memberSavedRun.status);

  const crossOrgOverride = await request(
    `/api/v1/reports/overview${periodQuery}&orgId=${encodeURIComponent(manifest.ids.orgB)}`,
    tokens.get('adminA'),
  );
  check('tenant override parameter ignored', 200, crossOrgOverride.status);
  check('tenant override cannot expose org B contacts', oracle.contacts.org_total, crossOrgOverride.body?.kpis?.totalContacts);
  check('tenant override response omits org B fixture identifiers', false, JSON.stringify(crossOrgOverride.body).includes(manifest.ids.orgB));
  const adminBOverview = await request(`/api/v1/reports/overview${periodQuery}&orgId=${encodeURIComponent(manifest.ids.orgA)}`, tokens.get('adminB'));
  check('org B admin remains confined to org B', 1, adminBOverview.body?.kpis?.totalContacts);
  check('org B admin response omits org A identifiers', false, JSON.stringify(adminBOverview.body).includes(manifest.ids.orgA));

  const custom = await request('/api/v1/analytics/custom', leader, 'POST', {
    metrics: ['contacts_new'],
    groupBy: 'user',
    dateRange: { from: manifest.dates.yesterday, to: manifest.dates.yesterday },
  });
  check('leader custom report returns only scoped sales', 200, custom.status);
  check('leader custom report expected labels', ['Fixture Leader A', 'Fixture Member A'], [...(custom.body?.labels ?? [])].sort());
  check('leader custom report counts match SQL oracle', [1, 1], [...(custom.body?.datasets?.[0]?.data ?? [])].sort());

  const adminSavedReport = await request(`/api/v1/saved-reports/${id('saved-report-leader')}`, tokens.get('adminA'));
  check('admin can read same-org saved report', 200, adminSavedReport.status);
  const crossOrgSavedReport = await request(`/api/v1/saved-reports/${id('saved-report-org-b')}`, tokens.get('adminA'));
  check('cross-org saved report is not found', 404, crossOrgSavedReport.status);

  // 6A rerun additions: saved-report execution with permission controls and tomorrow appointments.
  const sumData = (body: any) => (body?.datasets?.[0]?.data ?? []).reduce((a: number, b: number) => a + Number(b || 0), 0);
  const adminSavedRun = await request(`/api/v1/saved-reports/${id('saved-report-leader')}/run`, tokens.get('adminA'), 'POST', {});
  check('admin runs same-org saved report', 200, adminSavedRun.status);
  check('admin saved report total equals org new contacts (SQL oracle)', oracle.contacts.org_new_period, sumData(adminSavedRun.body));
  const leaderSavedRun = await request(`/api/v1/saved-reports/${id('saved-report-leader')}/run`, leader, 'POST', {});
  check('leader runs saved report created inside subtree', 200, leaderSavedRun.status);
  check('leader saved report total limited to subtree (SQL oracle)', oracle.contacts.team_new_period, sumData(leaderSavedRun.body));
  const leaderCrossOrgRun = await request(`/api/v1/saved-reports/${id('saved-report-org-b')}/run`, leader, 'POST', {});
  check('leader cannot run org B saved report', 404, leaderCrossOrgRun.status);
  const adminCrossOrgRun = await request(`/api/v1/saved-reports/${id('saved-report-org-b')}/run`, tokens.get('adminA'), 'POST', {});
  check('admin A cannot run org B saved report', 404, adminCrossOrgRun.status);
  check('oracle has one appointment tomorrow in org A', 1, oracle.appointments.tomorrow);
  const todayOverview = await request(`/api/v1/reports/overview?from=${manifest.dates.today}&to=${manifest.dates.today}`, tokens.get('adminA'));
  check('overview today counts only today appointment (tomorrow not leaked)', oracle.appointments.today, todayOverview.body?.kpis?.apptToday);

  const invalidPeriod = await request('/api/v1/reports/overview?from=2026-11-02&to=2026-11-01', tokens.get('adminA'));
  check('reversed report period rejected', 400, invalidPeriod.status);
  check('reversed period has contract error code', 'invalid_report_date_range', invalidPeriod.body?.code);

  const audit = adminResponses.get('/api/v1/reports/audit')?.body;
  check('future audit row excluded by as-of', false, (audit?.activity ?? []).some((row: any) => row.id === id('activity-future-audit')));
  const requestCounts = endpointTimings.length;
  const failures = results.filter((result) => !result.passed);
  const output = {
    createdAt: new Date().toISOString(),
    harness: { baseUrl, browserOrigin: parsedUrl.origin, auth: 'actual /api/v1/auth/login with bcrypt fixture verification and signed Fastify JWT' },
    fixture: { name: manifest.fixture, period: oracle.period, rows: oracle.rowCounts },
    checks: { total: results.length, passed: results.length - failures.length, failed: failures.length, results },
    endpointTimings: {
      requests: requestCounts,
      meanMs: Math.round(endpointTimings.reduce((sum, item) => sum + item.elapsedMs, 0) / Math.max(1, endpointTimings.length) * 100) / 100,
      maxMs: Math.max(...endpointTimings.map((item) => item.elapsedMs)),
      measurements: endpointTimings,
    },
    summary: {
      adminCategoryEndpoints: reportPaths.length,
      adminReports: Object.fromEntries([...adminResponses].map(([path, result]) => [path, { status: result.status, elapsedMs: result.elapsedMs }])),
      ai: { adminOrg: aiAdmin?.main?.kpis, leaderMain: leaderAi.body?.main?.kpis, leaderShared: leaderAi.body?.shared?.kpis },
      routeKpis: {
        overview: overview?.kpis,
        pipeline: pipeline?.funnel,
        engagement: engagement?.kpis,
        automation: automation.body?.kpis,
        broadcast: broadcast?.kpis,
      },
    },
  };
  await writeFile(`${artifactDir}\\api-acceptance.json`, `${JSON.stringify(output, null, 2)}\n`, { flag: 'wx' });
  process.stdout.write(`${JSON.stringify({ checks: output.checks, summary: output.summary, endpointTimings: output.endpointTimings }, null, 2)}\n`);
  if (failures.length) process.exitCode = 1;
}

main().catch((error) => {
  process.stderr.write(`6A API acceptance failed: ${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
