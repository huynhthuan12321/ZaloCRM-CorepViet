// Copy of 6a-remediation-rls-check.ts for the 6A rerun (DB/port/role/artifact changed) plus
// control tables and a full tenant catalog. Verification-only RLS check for the five tables added after 6A. Disposable DB only:
// owner seeds synthetic rows; every assertion runs as the NOSUPERUSER/NOBYPASSRLS app role.
//   seed            owner: two orgs + one row per table per org
//   matrix <label>  app role: SQL visibility/write matrix  -> <artifact>/rls-matrix-<label>.json
//   runtime         app role through the real Prisma client + withTenant/runSystemQuery
import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import pg from 'pg';

const PORT = '55498';
const DB = 'reports_6a3_verify';
const ownerUrl = `postgresql://postgres@127.0.0.1:${PORT}/${DB}`;
const appUrl = `postgresql://reports_6a3_app@127.0.0.1:${PORT}/${DB}`;
const artifacts = resolve('../artifacts/reports-6a-rerun-20261102-1500');
const A = 'rem-org-a', B = 'rem-org-b';
const tables = ['care_sessions', 'care_session_events', 'lead_pool_distributions', 'broadcast_jobs', 'broadcast_runs'] as const;
const mode = process.argv[2];

async function client(url: string) {
  const c = new pg.Client({ connectionString: url });
  await c.connect();
  const id = (await c.query('SELECT current_database() db, current_user u')).rows[0];
  assert.equal(id.db, DB);
  return c;
}

if (mode === 'seed') {
  const c = await client(ownerUrl);
  await c.query('BEGIN');
  for (const org of [A, B]) {
    await c.query(`INSERT INTO organizations (id, name, updated_at) VALUES ($1, $1, now())`, [org]);
    await c.query(`INSERT INTO users (id, org_id, password_hash, full_name, updated_at) VALUES ($1, $2, 'x', $1, now())`, [`${org}-user`, org]);
    await c.query(`INSERT INTO care_sessions (id, org_id, contact_id, nick_id, owner_user_id, source_type, interest_window_until) VALUES ($1, $2, 'c', 'n', $3, 'manual', now())`, [`${org}-cs`, org, `${org}-user`]);
    await c.query(`INSERT INTO care_session_events (id, session_id, event_id, event_type) VALUES ($1, $2, $1, 'reply')`, [`${org}-cse`, `${org}-cs`]);
    await c.query(`INSERT INTO lead_pool_distributions (id, org_id, assigned_to_user_id, source, round) VALUES ($1, $2, $3, 'forgotten', 1)`, [`${org}-lpd`, org, `${org}-user`]);
    await c.query(`INSERT INTO broadcast_jobs (id, org_id, created_by_id, name, zalo_account_id, message_text, schedule_type, updated_at) VALUES ($1, $2, $3, $1, 'z', 'm', 'once', now())`, [`${org}-bj`, org, `${org}-user`]);
    await c.query(`INSERT INTO broadcast_runs (id, job_id, org_id) VALUES ($1, $2, $3)`, [`${org}-br`, `${org}-bj`, org]);
    await c.query(`INSERT INTO broadcast_run_items (id, run_id, org_id, entry_id, status) VALUES ($1, $2, $3, 'e', 'queued')`, [`${org}-bri`, `${org}-br`, org]);
  }
  await c.query('COMMIT');
  console.log('SEEDED');
  await c.end();
} else if (mode === 'matrix') {
  const label = process.argv[3] ?? 'run';
  const c = await client(appUrl);
  const role = (await c.query(`SELECT rolsuper, rolbypassrls FROM pg_roles WHERE rolname = current_user`)).rows[0];
  const owned = (await c.query(`SELECT count(*)::int n FROM pg_class WHERE relowner = (SELECT oid FROM pg_roles WHERE rolname = current_user) AND relkind = 'r'`)).rows[0].n;
  const catalog = (await c.query(`SELECT relname, relrowsecurity, relforcerowsecurity, (SELECT count(*)::int FROM pg_policy p WHERE p.polrelid = c.oid) policies FROM pg_class c WHERE relname = ANY($1) ORDER BY relname`, [tables])).rows;
  const checks: { table: string; check: string; expected: string; actual: string; pass: boolean }[] = [];
  const add = (table: string, check: string, expected: unknown, actual: unknown) => checks.push({ table, check, expected: String(expected), actual: String(actual), pass: String(expected) === String(actual) });
  async function inTx<T>(setup: string[], fn: () => Promise<T>): Promise<T | string> {
    await c.query('BEGIN');
    try { for (const s of setup) await c.query(s); return await fn(); }
    catch (e: any) { return `ERROR ${e.code ?? ''} ${String(e.message).slice(0, 80)}`; }
    finally { await c.query('ROLLBACK'); }
  }
  const asOrg = (org: string) => [`SELECT set_config('app.current_org', '${org}', true)`];
  const bypass = [`SELECT set_config('app.bypass_rls', 'on', true)`];
  for (const t of tables) {
    const own = t === 'care_session_events' ? `session_id = '${A}-cs'` : `org_id = '${A}'`;
    const other = t === 'care_session_events' ? `session_id = '${B}-cs'` : `org_id = '${B}'`;
    const count = (where: string) => async () => (await c.query(`SELECT count(*)::int n FROM "${t}" WHERE ${where}`)).rows[0].n;
    add(t, 'org A sees own rows', 1, await inTx(asOrg(A), count(own)));
    add(t, 'org A sees org B rows', 0, await inTx(asOrg(A), count(other)));
    add(t, 'no tenant sees any row', 0, await inTx([], count('true')));
    add(t, 'bypass sees both synthetic orgs', 2, await inTx(bypass, count(`(${own}) OR (${other})`)));
    // Cross-org write attempts as org A.
    const updOther = async () => (await c.query(`UPDATE "${t}" SET id = id WHERE ${other}`)).rowCount;
    add(t, 'org A UPDATE org B rows affects', 0, await inTx(asOrg(A), updOther));
  }
  // Cross-org INSERTs as org A must be rejected by WITH CHECK.
  const ins: Record<string, string> = {
    care_sessions: `INSERT INTO care_sessions (id, org_id, contact_id, nick_id, owner_user_id, source_type, interest_window_until) VALUES ('x-cs', '${B}', 'c', 'n', '${B}-user', 'manual', now())`,
    care_session_events: `INSERT INTO care_session_events (id, session_id, event_id, event_type) VALUES ('x-cse', '${B}-cs', 'x', 'reply')`,
    lead_pool_distributions: `INSERT INTO lead_pool_distributions (id, org_id, assigned_to_user_id, source, round) VALUES ('x-lpd', '${B}', '${B}-user', 'forgotten', 1)`,
    broadcast_jobs: `INSERT INTO broadcast_jobs (id, org_id, created_by_id, name, zalo_account_id, message_text, schedule_type, updated_at) VALUES ('x-bj', '${B}', '${B}-user', 'x', 'z', 'm', 'once', now())`,
    broadcast_runs: `INSERT INTO broadcast_runs (id, job_id, org_id) VALUES ('x-br', '${B}-bj', '${B}')`,
  };
  const insOwn: Record<string, string> = Object.fromEntries(Object.entries(ins).map(([k, v]) => [k, v.replaceAll(B, A).replace(`'${A}-bj'`, `'${A}-bj'`)]));
  for (const t of tables) {
    const r = await inTx(asOrg(A), async () => { await c.query(ins[t]); return 'inserted'; });
    add(t, 'org A INSERT org B row', 'rejected', String(r).startsWith('ERROR 42501') ? 'rejected' : r);
    const own = await inTx(asOrg(A), async () => { await c.query(insOwn[t]); return 'inserted'; });
    add(t, 'org A INSERT own row', 'inserted', own);
  }
  // Control tables seeded by the 6A fixture: messages and contacts (6a-org-a vs 6a-org-b).
  const ownerC = await client(ownerUrl);
  const fx = { a: '6a-org-a', b: '6a-org-b' };
  const convB = (await ownerC.query(`SELECT id FROM conversations WHERE org_id = $1 LIMIT 1`, [fx.b])).rows[0]?.id;
  for (const t of ['messages', 'contacts'] as const) {
    const ownTotal = (await ownerC.query(`SELECT count(*)::int n FROM "${t}" WHERE org_id = $1`, [fx.a])).rows[0].n;
    const cnt = (where: string) => async () => (await c.query(`SELECT count(*)::int n FROM "${t}" WHERE ${where}`)).rows[0].n;
    add(t, 'control: fixture org A sees own rows', ownTotal, await inTx(asOrg(fx.a), cnt(`org_id = '${fx.a}'`)));
    add(t, 'control: fixture org A sees org B rows', 0, await inTx(asOrg(fx.a), cnt(`org_id = '${fx.b}'`)));
    add(t, 'control: no tenant sees any row', 0, await inTx([], cnt('true')));
    add(t, 'control: org A UPDATE org B rows affects', 0, await inTx(asOrg(fx.a), async () => (await c.query(`UPDATE "${t}" SET id = id WHERE org_id = '${fx.b}'`)).rowCount));
  }
  const ctlIns: Record<string, string> = {
    contacts: `INSERT INTO contacts (id, org_id, updated_at) VALUES ('x-ct', '${fx.b}', now())`,
    messages: `INSERT INTO messages (id, conversation_id, org_id, sender_type, sent_at) VALUES ('x-msg', '${convB}', '${fx.b}', 'contact', now())`,
  };
  for (const t of ['messages', 'contacts']) {
    const r = await inTx(asOrg(fx.a), async () => { await c.query(ctlIns[t]); return 'inserted'; });
    add(t, 'control: org A INSERT org B row', 'rejected', String(r).startsWith('ERROR 42501') ? 'rejected' : r);
  }
  const tenantCatalog = (await ownerC.query(`SELECT c.relname, c.relrowsecurity rls, c.relforcerowsecurity force, (SELECT count(*)::int FROM pg_policy p WHERE p.polrelid = c.oid) policies, EXISTS (SELECT 1 FROM information_schema.columns k WHERE k.table_schema = 'public' AND k.table_name = c.relname AND k.column_name = 'org_id') has_org_id FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'public' AND c.relkind = 'r' ORDER BY c.relname`)).rows;
  await writeFile(resolve(artifacts, 'rls-tenant-catalog.json'), JSON.stringify({ time: new Date().toISOString(), tables: tenantCatalog.length, forced: tenantCatalog.filter((r: any) => r.rls && r.force).length, orgIdWithoutPolicy: tenantCatalog.filter((r: any) => r.has_org_id && !r.policies).map((r: any) => r.relname), noOrgIdNoPolicy: tenantCatalog.filter((r: any) => !r.has_org_id && !r.policies).map((r: any) => r.relname), catalog: tenantCatalog }, null, 1));
  await ownerC.end();
  const passed = checks.filter(x => x.pass).length;
  const out = { time: new Date().toISOString(), label, role, ownedTables: owned, catalog, passed, failed: checks.length - passed, checks };
  await writeFile(resolve(artifacts, `rls-matrix-${label}.json`), JSON.stringify(out, null, 1));
  console.log(`MATRIX ${label} ${passed}/${checks.length}`);
  for (const x of checks.filter(x => !x.pass)) console.log(' FAIL', x.table, x.check, 'expected', x.expected, 'actual', x.actual);
  await c.end();
} else if (mode === 'runtime') {
  // Real application client: RLS_SET_CONFIG on, guard enforce, app role connection.
  process.env.NODE_ENV = 'test';
  process.env.DATABASE_URL = appUrl;
  process.env.RLS_SET_CONFIG = 'true';
  process.env.TENANT_GUARD_MODE = 'enforce';
  process.env.JWT_SECRET ??= 'verification-only-' + 'x'.repeat(40);
  process.env.ENCRYPTION_KEY ??= 'a'.repeat(64);
  const { prisma } = await import('../../src/shared/database/prisma-client.js');
  const { withTenant, runSystemQuery } = await import('../../src/shared/tenant/tenant-context.js');
  const results: { check: string; expected: unknown; actual: unknown; pass: boolean }[] = [];
  const add = (check: string, expected: unknown, actual: unknown) => results.push({ check, expected, actual, pass: JSON.stringify(expected) === JSON.stringify(actual) });
  const safe = async <T>(fn: () => Promise<T>) => { try { return await fn(); } catch (e: any) { return `ERROR ${String(e.message).split('\n').at(-1)?.slice(0, 120)}`; } };
  add('withTenant(A) careSession.count', 1, await safe(() => withTenant(A, () => prisma.careSession.count())));
  add('withTenant(A) careSessionEvent.count', 1, await safe(() => withTenant(A, () => prisma.careSessionEvent.count())));
  add('withTenant(A) leadPoolDistribution.count', 1, await safe(() => withTenant(A, () => prisma.leadPoolDistribution.count())));
  add('withTenant(A) broadcastJob.count', 1, await safe(() => withTenant(A, () => prisma.broadcastJob.count())));
  add('withTenant(A) broadcastRun.count', 1, await safe(() => withTenant(A, () => prisma.broadcastRun.count())));
  add('withTenant(A) careSession.findUnique(org B id)', null, await safe(() => withTenant(A, () => prisma.careSession.findUnique({ where: { id: `${B}-cs` } }))));
  add('runSystemQuery broadcastJob.findMany (cron due-jobs shape)', 2, await safe(() => runSystemQuery(() => prisma.broadcastJob.findMany({ select: { id: true } }))).then(r => Array.isArray(r) ? r.length : r));
  add('runSystemQuery careSession.findMany (cron due shape)', 2, await safe(() => runSystemQuery(() => prisma.careSession.findMany({ select: { id: true } }))).then(r => Array.isArray(r) ? r.length : r));
  add('outside any context careSession.count (fail-safe)', 0, await safe(() => prisma.careSession.count()));
  add('withTenant(A) careSessionEvent.create on own session', 'created', await safe(() => withTenant(A, async () => { await prisma.careSessionEvent.create({ data: { sessionId: `${A}-cs`, eventId: 'rt-1', eventType: 'reply' } }); return 'created'; })));
  add('withTenant(A) careSessionEvent.create on org B session', 'rejected', await safe(() => withTenant(A, async () => { await prisma.careSessionEvent.create({ data: { sessionId: `${B}-cs`, eventId: 'rt-2', eventType: 'reply' } }); return 'created'; })).then(r => String(r).includes('row-level security') ? 'rejected' : r));
  // broadcast-cron.ts:415 shape: array transaction updating run item + run counter inside withTenant.
  add('withTenant(A) array $transaction runItem+run update (broadcast-cron shape)', 1, await safe(() => withTenant(A, async () => {
    await prisma.$transaction([
      prisma.broadcastRunItem.update({ where: { id: `${A}-bri` }, data: { status: 'sent' } }),
      prisma.broadcastRun.update({ where: { id: `${A}-br` }, data: { sentCount: { increment: 1 } } }),
    ]);
    return (await prisma.broadcastRun.findUnique({ where: { id: `${A}-br` }, select: { sentCount: true } }))?.sentCount;
  })));
  add('withTenant(A) broadcastRun.updateMany org B affects', 0, await safe(() => withTenant(A, async () => (await prisma.broadcastRun.updateMany({ where: { orgId: B }, data: { error: 'x' } })).count)));
  const passed = results.filter(r => r.pass).length;
  await writeFile(resolve(artifacts, 'rls-runtime-prisma.json'), JSON.stringify({ time: new Date().toISOString(), connection: 'reports_6a3_app (NOSUPERUSER/NOBYPASSRLS)', env: { RLS_SET_CONFIG: 'true', TENANT_GUARD_MODE: 'enforce' }, passed, failed: results.length - passed, results }, null, 1));
  console.log(`RUNTIME ${passed}/${results.length}`);
  for (const r of results.filter(r => !r.pass)) console.log(' FAIL', r.check, 'expected', JSON.stringify(r.expected), 'actual', JSON.stringify(r.actual));
  await prisma.$disconnect();
} else {
  throw new Error('mode: seed | matrix <label> | runtime');
}
