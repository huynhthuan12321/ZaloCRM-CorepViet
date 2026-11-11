// 6B lần 3 — group E: RLS catalog + cross-org matrix as the NOSUPERUSER/NOBYPASSRLS app role on the
// 6B fixture (orgs 6b-org-x / 6b-org-y), plus Prisma runtime cases with expectations from owner totals.
// All SQL writes run inside transactions that are rolled back.
import pg from 'pg';
import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const OUT = process.env.REPORTS_6B_ARTIFACT_DIR!;
const ownerUrl = 'postgresql://postgres@127.0.0.1:55541/reports_5b6b_verify';
const appUrl = 'postgresql://reports_5b6b_app@127.0.0.1:55541/reports_5b6b_verify';
const X = '6b-org-x', Y = '6b-org-y';
const mode = process.argv[2];
const connect = async (url: string) => { const c = new pg.Client({ connectionString: url }); await c.connect(); return c; };

if (mode === 'matrix') {
  const own = await connect(ownerUrl), app = await connect(appUrl);
  const role = (await app.query(`SELECT current_user u, rolsuper, rolbypassrls, (SELECT count(*)::int FROM pg_class WHERE relowner=r.oid AND relkind IN ('r','p')) owned FROM pg_roles r WHERE rolname=current_user`)).rows[0];
  const catalog = (await own.query(`SELECT c.relname t, c.relrowsecurity rls, c.relforcerowsecurity force, (SELECT count(*)::int FROM pg_policy p WHERE p.polrelid=c.oid) policies,
      EXISTS (SELECT 1 FROM information_schema.columns k WHERE k.table_schema='public' AND k.table_name=c.relname AND k.column_name='org_id') has_org
      FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind IN ('r','p') ORDER BY 1`)).rows;
  const checks: { table: string; check: string; expected: unknown; actual: unknown; pass: boolean }[] = [];
  const add = (table: string, check: string, expected: unknown, actual: unknown) => checks.push({ table, check, expected, actual, pass: String(expected) === String(actual) });
  const tx = async (setup: string[], fn: () => Promise<unknown>) => {
    await app.query('BEGIN');
    try { for (const s of setup) await app.query(s); return await fn(); } catch (e: any) { return `ERROR ${e.code}`; } finally { await app.query('ROLLBACK'); }
  };
  const asX = [`SELECT set_config('app.current_org','${X}',true)`], bypass = [`SELECT set_config('app.bypass_rls','on',true)`];
  // where-clauses for "own org" and "other org"; care_session_events has no org_id (scoped via session).
  const tables: Record<string, { own: string; other: string; insertOther: string; insertOwn: string }> = {
    care_sessions: { own: `org_id='${X}'`, other: `org_id='${Y}'`,
      insertOther: `INSERT INTO care_sessions (id,org_id,contact_id,nick_id,owner_user_id,source_type,interest_window_until) VALUES ('6b-x','${Y}','6b-c-y1','6b-n-y','6b-u-sale-y','manual',now())`,
      insertOwn: `INSERT INTO care_sessions (id,org_id,contact_id,nick_id,owner_user_id,source_type,interest_window_until) VALUES ('6b-x','${X}','6b-c-m-mid','6b-n-m','6b-u-sale-m','manual',now())` },
    care_session_events: { own: `session_id IN ('6b-cs-x')`, other: `session_id IN ('6b-cs-y')`,
      insertOther: `INSERT INTO care_session_events (id,session_id,event_id,event_type) VALUES ('6b-x','6b-cs-y','6b-x','reply')`,
      insertOwn: `INSERT INTO care_session_events (id,session_id,event_id,event_type) VALUES ('6b-x','6b-cs-x','6b-x','reply')` },
    lead_pool_distributions: { own: `org_id='${X}'`, other: `org_id='${Y}'`,
      insertOther: `INSERT INTO lead_pool_distributions (id,org_id,assigned_to_user_id,source,round) VALUES ('6b-x','${Y}','6b-u-sale-y','forgotten',1)`,
      insertOwn: `INSERT INTO lead_pool_distributions (id,org_id,assigned_to_user_id,source,round) VALUES ('6b-x','${X}','6b-u-sale-m','forgotten',1)` },
    broadcast_jobs: { own: `org_id='${X}'`, other: `org_id='${Y}'`,
      insertOther: `INSERT INTO broadcast_jobs (id,org_id,created_by_id,name,zalo_account_id,message_text,schedule_type,updated_at) VALUES ('6b-x','${Y}','6b-u-adm-y','x','6b-n-y','m','once',now())`,
      insertOwn: `INSERT INTO broadcast_jobs (id,org_id,created_by_id,name,zalo_account_id,message_text,schedule_type,updated_at) VALUES ('6b-x','${X}','6b-u-adm-x','x','6b-n-m','m','once',now())` },
    broadcast_runs: { own: `org_id='${X}'`, other: `org_id='${Y}'`,
      insertOther: `INSERT INTO broadcast_runs (id,job_id,org_id) VALUES ('6b-x','6b-bj-y','${Y}')`,
      insertOwn: `INSERT INTO broadcast_runs (id,job_id,org_id) VALUES ('6b-x','6b-bj-1','${X}')` },
    // Control tables (already policy-protected before remediation).
    contacts: { own: `org_id='${X}'`, other: `org_id='${Y}'`,
      insertOther: `INSERT INTO contacts (id,org_id,updated_at) VALUES ('6b-x','${Y}',now())`, insertOwn: `INSERT INTO contacts (id,org_id,updated_at) VALUES ('6b-x','${X}',now())` },
    messages: { own: `org_id='${X}'`, other: `org_id='${Y}'`,
      insertOther: `INSERT INTO messages (id,conversation_id,org_id,sender_type,sent_at) VALUES ('6b-x','6b-v-y','${Y}','contact',now())`,
      insertOwn: `INSERT INTO messages (id,conversation_id,org_id,sender_type,sent_at) VALUES ('6b-x','6b-v-m','${X}','contact',now())` },
    appointments: { own: `org_id='${X}'`, other: `org_id='${Y}'`,
      insertOther: `INSERT INTO appointments (id,org_id,contact_id,appointment_date) VALUES ('6b-x','${Y}','6b-c-y1',now())`,
      insertOwn: `INSERT INTO appointments (id,org_id,contact_id,appointment_date) VALUES ('6b-x','${X}','6b-c-m-mid',now())` },
    ai_suggestions: { own: `org_id='${X}'`, other: `org_id='${Y}'`,
      insertOther: `INSERT INTO ai_suggestions (id,org_id,conversation_id,type,content,confidence) VALUES ('6b-x','${Y}','6b-v-y','auto_reply_needs_review','x',0.5)`,
      insertOwn: `INSERT INTO ai_suggestions (id,org_id,conversation_id,type,content,confidence) VALUES ('6b-x','${X}','6b-v-m','auto_reply_needs_review','x',0.5)` },
  };
  for (const [t, w] of Object.entries(tables)) {
    const ownTotal = (await own.query(`SELECT count(*)::int n FROM "${t}" WHERE ${w.own}`)).rows[0].n;
    const otherTotal = (await own.query(`SELECT count(*)::int n FROM "${t}" WHERE ${w.other}`)).rows[0].n;
    const cnt = (where: string) => async () => (await app.query(`SELECT count(*)::int n FROM "${t}" WHERE ${where}`)).rows[0].n;
    add(t, `owner fixture rows X/Y > 0`, true, ownTotal > 0 && otherTotal > 0);
    add(t, 'X sees own rows (= owner count)', ownTotal, await tx(asX, cnt(w.own)));
    add(t, 'X sees Y rows', 0, await tx(asX, cnt(w.other)));
    add(t, 'no tenant sees rows', 0, await tx([], cnt('true')));
    add(t, 'bypass sees X+Y (= owner count)', ownTotal + otherTotal, await tx(bypass, cnt(`(${w.own}) OR (${w.other})`)));
    add(t, 'X UPDATE Y rows affects', 0, await tx(asX, async () => (await app.query(`UPDATE "${t}" SET id=id WHERE ${w.other}`)).rowCount));
    add(t, 'X DELETE Y rows affects', 0, await tx(asX, async () => (await app.query(`DELETE FROM "${t}" WHERE ${w.other}`)).rowCount));
    add(t, 'X INSERT Y row', 'ERROR 42501', await tx(asX, async () => { await app.query(w.insertOther); return 'inserted'; }));
    add(t, 'X INSERT own row', 'inserted', await tx(asX, async () => { await app.query(w.insertOwn); return 'inserted'; }));
    add(t, 'no tenant INSERT own row', 'ERROR 42501', await tx([], async () => { await app.query(w.insertOwn); return 'inserted'; }));
  }
  const orgNoPolicy = catalog.filter(r => r.has_org && r.policies === 0).map(r => r.t);
  const noOrgNoPolicy = catalog.filter(r => !r.has_org && r.policies === 0).map(r => r.t);
  // Do the uncovered org_id tables hold report data? Count fixture rows the report routes depend on.
  const passed = checks.filter(c => c.pass).length;
  const out = { time: new Date().toISOString(), role, catalog: { tables: catalog.length, forced: catalog.filter(r => r.rls && r.force).length, withPolicy: catalog.filter(r => r.policies > 0).length, orgIdWithoutPolicy: orgNoPolicy, noOrgIdWithoutPolicy: noOrgNoPolicy, newTables: catalog.filter(r => ['care_sessions', 'care_session_events', 'lead_pool_distributions', 'broadcast_jobs', 'broadcast_runs'].includes(r.t)) }, passed, failed: checks.length - passed, checks };
  await writeFile(resolve(OUT, 'rls-matrix.json'), JSON.stringify(out, null, 1));
  console.log(`MATRIX ${passed}/${checks.length}; tables ${catalog.length}, forced ${out.catalog.forced}, org_id without policy ${orgNoPolicy.length}, no org_id without policy ${noOrgNoPolicy.length}`);
  console.log('org_id without policy:', orgNoPolicy.join(', '));
  for (const c of checks.filter(c => !c.pass)) console.log('FAIL', c.table, c.check, 'expected', c.expected, 'actual', c.actual);
  await own.end(); await app.end();
} else if (mode === 'runtime') {
  process.env.NODE_ENV = 'test';
  process.env.DATABASE_URL = appUrl;
  process.env.RLS_SET_CONFIG = 'true';
  process.env.TENANT_GUARD_MODE = 'enforce';
  process.env.JWT_SECRET ??= 'runtime-check-only-'.padEnd(48, 'z');
  process.env.ENCRYPTION_KEY ??= 'c'.repeat(64);
  const own = await connect(ownerUrl);
  const total = async (t: string, where = 'true') => (await own.query(`SELECT count(*)::int n FROM "${t}" WHERE ${where}`)).rows[0].n;
  const { prisma } = await import('../../src/shared/database/prisma-client.js');
  const { withTenant, runSystemQuery } = await import('../../src/shared/tenant/tenant-context.js');
  const res: { check: string; expected: unknown; actual: unknown; pass: boolean }[] = [];
  const add = (check: string, expected: unknown, actual: unknown) => res.push({ check, expected, actual, pass: JSON.stringify(expected) === JSON.stringify(actual) });
  const safe = async <T>(fn: () => Promise<T>) => { try { return await fn(); } catch (e: any) { return `ERROR ${String(e.message).split('\n').filter(Boolean).at(-1)?.slice(0, 100)}`; } };
  add('withTenant(X) careSession.count = owner X', await total('care_sessions', `org_id='${X}'`), await safe(() => withTenant(X, () => prisma.careSession.count())));
  add('withTenant(X) careSessionEvent.count = owner X', await total('care_session_events', `session_id='6b-cs-x'`), await safe(() => withTenant(X, () => prisma.careSessionEvent.count())));
  add('withTenant(X) leadPoolDistribution.count = owner X', await total('lead_pool_distributions', `org_id='${X}'`), await safe(() => withTenant(X, () => prisma.leadPoolDistribution.count())));
  add('withTenant(X) broadcastJob.count = owner X', await total('broadcast_jobs', `org_id='${X}'`), await safe(() => withTenant(X, () => prisma.broadcastJob.count())));
  add('withTenant(X) broadcastRun.count = owner X', await total('broadcast_runs', `org_id='${X}'`), await safe(() => withTenant(X, () => prisma.broadcastRun.count())));
  add('withTenant(X) broadcastJob.findUnique(Y id) = null', null, await safe(() => withTenant(X, () => prisma.broadcastJob.findUnique({ where: { id: '6b-bj-y' } }))));
  // The two 6A runtime cases (A's 11/13 mismatches) with expectations from owner totals instead of a fixed 2.
  add('[6A case] runSystemQuery broadcastJob.findMany = owner total', await total('broadcast_jobs'), await safe(() => runSystemQuery(() => prisma.broadcastJob.findMany({ select: { id: true } }))).then(r => Array.isArray(r) ? r.length : r));
  add('[6A case] runSystemQuery careSession.findMany = owner total', await total('care_sessions'), await safe(() => runSystemQuery(() => prisma.careSession.findMany({ select: { id: true } }))).then(r => Array.isArray(r) ? r.length : r));
  add('outside context careSession.count → RLS 0 (model not in ORG_SCOPED_MODELS, guard silent)', 0, await safe(() => prisma.careSession.count()));
  add('outside context contact.count → tenant-guard enforce throws (control)', true, await safe(() => prisma.contact.count()).then(r => typeof r === 'string' && r.includes('tenant-guard')));
  add('withTenant(X) careSessionEvent.create on Y session rejected', true, await safe(() => withTenant(X, async () => { await prisma.careSessionEvent.create({ data: { id: '6b-rt-x', sessionId: '6b-cs-y', eventId: '6b-rt', eventType: 'reply' } }); return 'created'; })).then(r => typeof r === 'string' && r.startsWith('ERROR')));
  add('withTenant(X) broadcastRun.updateMany(orgId Y) affects 0', 0, await safe(() => withTenant(X, async () => (await prisma.broadcastRun.updateMany({ where: { orgId: Y }, data: { error: 'x' } })).count)));
  add('withTenant(X) leadPoolDistribution.deleteMany(orgId Y) affects 0', 0, await safe(() => withTenant(X, async () => (await prisma.leadPoolDistribution.deleteMany({ where: { orgId: Y } })).count)));
  add('Y rows unchanged after attempts', [await total('broadcast_runs', `org_id='${Y}' AND error IS NULL`), await total('lead_pool_distributions', `org_id='${Y}'`), await total('care_session_events', `id='6b-rt-x'`)], [1, 1, 0]);
  const passed = res.filter(r => r.pass).length;
  await writeFile(resolve(OUT, 'rls-runtime-prisma.json'), JSON.stringify({ time: new Date().toISOString(), connection: 'reports_5b6b_app NOSUPERUSER/NOBYPASSRLS', env: { RLS_SET_CONFIG: 'true', TENANT_GUARD_MODE: 'enforce' }, passed, failed: res.length - passed, res }, null, 1));
  console.log(`RUNTIME ${passed}/${res.length}`);
  for (const r of res) console.log(r.pass ? 'PASS' : 'FAIL', r.check, 'expected', JSON.stringify(r.expected), 'actual', JSON.stringify(r.actual));
  await prisma.$disconnect(); await own.end();
}
