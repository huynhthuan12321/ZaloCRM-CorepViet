// Remediation A only: real disposable PostgreSQL/app-role and JWT/HTTP evidence.
// No application bootstrap, provider, queue, cron, socket, send or paid AI path.
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { randomBytes, randomUUID } from 'node:crypto';
import pg from 'pg';
import { Prisma, PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import Fastify from 'fastify';
import jwt from '@fastify/jwt';

const out = process.env.E1O1_ARTIFACT_DIR!;
const phase = process.argv[2];
const appUrl = 'postgresql://reports_be1o1_app@127.0.0.1:55571/reports_be1o1_security';
const ownerUrl = 'postgresql://postgres@127.0.0.1:55571/reports_be1o1_security';
if (!out || !['red', 'green', 'green2', 'green3', 'green4'].includes(phase) || process.env.DATABASE_URL !== appUrl
  || process.env.E1O1_OWNER_DATABASE_URL !== ownerUrl || process.env.RLS_SET_CONFIG !== 'true'
  || process.env.TENANT_GUARD_MODE !== 'enforce' || !process.env.DOTENV_CONFIG_PATH?.includes('no-env-file')) {
  throw new Error('Explicit dedicated disposable configuration required');
}
const owner = new PrismaClient({ adapter: new PrismaPg({ connectionString: ownerUrl }) });
const pool = new pg.Pool({ connectionString: appUrl, max: 2 });
const { prisma } = await import('../../src/shared/database/prisma-client.js');
const { withTenant, runSystemQuery } = await import('../../src/shared/tenant/tenant-context.js');
const { automationReportRoutes } = await import('../../src/modules/automation/automation-report-routes.js');
const { broadcastReportRoutes } = await import('../../src/modules/broadcast/broadcast-report-routes.js');
const app = Fastify({ logger: false });
await app.register(jwt, { secret: randomBytes(48).toString('hex') });
await app.register(automationReportRoutes);
await app.register(broadcastReportRoutes);

const oldCatalog = JSON.parse(await readFile(resolve(out, 'helpers', 'old-rls-matrix.json'), 'utf8'));
const targets: string[] = oldCatalog.catalog.orgIdWithoutPolicy;
const models = Prisma.dmmf.datamodel.models;
// Prisma 7 runtime DMMF is compact; recover required/default/FK metadata from
// the saved schema rather than weakening FK constraints for synthetic fixtures.
const schema = await readFile(resolve(process.cwd(), 'prisma/schema.prisma'), 'utf8');
for (const model of models) {
  const block = [...schema.matchAll(/^model (\w+) \{([\s\S]*?)^\}/gm)].find(m => m[1] === model.name)![2];
  for (const f of model.fields) {
    const line = block.split('\n').find(l => new RegExp(`^\\s+${f.name}\\s`).test(l))!;
    const type = line.trim().split(/\s+/)[1];
    Object.assign(f, { isRequired: !type.endsWith('?'), isList: type.endsWith('[]'), hasDefaultValue: line.includes('@default('), isId: /@id\b/.test(line) });
    const relation = line.match(/@relation\([^\n]*fields:\s*\[([^\]]+)\],\s*references:\s*\[([^\]]+)\]/);
    if (relation) Object.assign(f, { relationFromFields: relation[1].split(',').map(s => s.trim()), relationToFields: relation[2].split(',').map(s => s.trim()) });
  }
}
const meta = new Map(models.map(m => [m.name, m]));
const tableModel = new Map(models.map(m => [m.dbName ?? m.name, m.name]));
const delegate = (name: string, client: any = owner) => client[name[0].toLowerCase() + name.slice(1)];
const seeded = new Map<string, any>();
const inflight = new Set<string>();
// Required relations are created first; real FK and unique constraints remain enabled.
async function seed(name: string, org: string, namespace = 'base'): Promise<any> {
  const key = `${namespace}/${org}/${name}`;
  if (seeded.has(key)) return seeded.get(key);
  if (inflight.has(key)) throw new Error(`Required relation cycle: ${name}`);
  inflight.add(key);
  const m = meta.get(name)!;
  const data: Record<string, any> = {};
  if (name === 'Organization') data.id = `e1-${namespace}-${org}`;
  else if (m.fields.some(f => f.name === 'orgId')) data.orgId = (await seed('Organization', org, namespace)).id;
  if (name === 'Conversation') data.channelAccountId = (await seed('ChannelAccount', org, namespace)).id;
  for (const f of m.fields.filter(f => f.kind === 'object' && f.isRequired && !f.isList && f.relationFromFields?.length)) {
    const parent = await seed(f.type, org, namespace);
    f.relationFromFields!.forEach((field, i) => { data[field] = parent[f.relationToFields![i]]; });
  }
  for (const f of m.fields.filter(f => f.kind !== 'object' && !f.isList && f.isRequired && !f.hasDefaultValue)) {
    if (f.name in data) continue;
    if (f.kind === 'enum') data[f.name] = Prisma.dmmf.datamodel.enums.find(e => e.name === f.type)!.values[0].name;
    else if (f.type === 'DateTime') data[f.name] = new Date('2026-11-02T03:00:00Z');
    else if (f.type === 'Int' || f.type === 'Float' || f.type === 'Decimal') data[f.name] = 1;
    else if (f.type === 'BigInt') data[f.name] = 1n;
    else if (f.type === 'Boolean') data[f.name] = false;
    else if (f.type === 'Json') data[f.name] = {};
    else if (f.type === 'Bytes') data[f.name] = Buffer.from('synthetic');
    else data[f.name] = `e1-${namespace}-${org}-${name}-${f.name}`;
  }
  const row = await delegate(name).create({ data });
  seeded.set(key, row);
  inflight.delete(key);
  return row;
}

type Check = { group: string; name: string; pass: boolean; expected: unknown; actual: unknown };
const checks: Check[] = [];
const record = (group: string, name: string, actual: unknown, expected: unknown) => {
  checks.push({ group, name, actual, expected, pass: JSON.stringify(actual) === JSON.stringify(expected) });
};
const qi = (s: string) => '"' + s.replaceAll('"', '""') + '"';
async function tx(org: string | null, sql: string, params: any[] = [], bypass = false) {
  const c = await pool.connect();
  try {
    await c.query('BEGIN');
    if (org) await c.query("SELECT set_config('app.current_org',$1,true)", [org]);
    if (bypass) await c.query("SELECT set_config('app.bypass_rls','on',true)");
    const result = await c.query(sql, params);
    return { count: result.rowCount, rows: result.rows, error: null };
  } catch (e: any) { return { count: null, rows: [], error: e.code }; }
  finally { await c.query('ROLLBACK'); c.release(); }
}

try {
  const role = await pool.query("SELECT current_user AS name, rolsuper, rolbypassrls, (SELECT count(*)::int FROM pg_tables WHERE schemaname='public' AND tableowner=current_user) AS owned FROM pg_roles WHERE rolname=current_user");
  record('safety', 'non-owner NOSUPERUSER NOBYPASSRLS app role', role.rows[0], { name: 'reports_be1o1_app', rolsuper: false, rolbypassrls: false, owned: 0 });
  for (const table of targets) for (const org of ['x', 'y']) await seed(tableModel.get(table)!, org);
  const orgX = (await seed('Organization', 'x')).id, orgY = (await seed('Organization', 'y')).id;
  for (const table of targets) {
    const model = tableModel.get(table)!;
    const x = await seed(model, 'x'), y = await seed(model, 'y');
    const pk = meta.get(model)!.fields.find(f => f.isId)!;
    const column = qi(pk.dbName ?? pk.name);
    const q = qi(table);
    record('rls', `${table}: X own read`, (await tx(orgX, `SELECT * FROM ${q} WHERE ${column}=$1`, [x[pk.name]])).count, 1);
    record('rls', `${table}: X cannot read Y`, (await tx(orgX, `SELECT * FROM ${q} WHERE ${column}=$1`, [y[pk.name]])).count, 0);
    record('rls', `${table}: Y own read`, (await tx(orgY, `SELECT * FROM ${q} WHERE ${column}=$1`, [y[pk.name]])).count, 1);
    record('rls', `${table}: absent context reads nothing`, (await tx(null, `SELECT * FROM ${q}`)).count, 0);
    record('rls', `${table}: unknown org reads nothing`, (await tx('missing-org', `SELECT * FROM ${q}`)).count, 0);
    record('rls', `${table}: foreign update`, (await tx(orgX, `UPDATE ${q} SET org_id=org_id WHERE ${column}=$1`, [y[pk.name]])).count, 0);
    record('rls', `${table}: foreign delete`, (await tx(orgX, `DELETE FROM ${q} WHERE ${column}=$1`, [y[pk.name]])).count, 0);
    record('rls', `${table}: own update`, (await tx(orgX, `UPDATE ${q} SET org_id=org_id WHERE ${column}=$1`, [x[pk.name]])).count, 1);
    record('rls', `${table}: cannot transfer own row to Y`, (await tx(orgX, `UPDATE ${q} SET org_id=$2 WHERE ${column}=$1`, [x[pk.name], orgY])).error, '42501');
    const raw: any = (await owner.$queryRawUnsafe<any[]>(`SELECT row_to_json(t) AS row FROM ${q} t WHERE ${column}=$1`, x[pk.name]))[0].row;
    raw[pk.dbName ?? pk.name] = randomUUID();
    raw.org_id = orgY;
    const insert = `INSERT INTO ${q} SELECT * FROM json_populate_record(NULL::${q}, $1::json) RETURNING ${column}`;
    record('rls', `${table}: foreign insert`, (await tx(orgX, insert, [JSON.stringify(raw)])).error, '42501');
    record('rls', `${table}: no-context insert`, (await tx(null, insert, [JSON.stringify(raw)])).error, '42501');
    // A fresh FK-valid template proves own-tenant INSERT, not just rejection/error behavior.
    const fresh = await seed(model, 'x', `${phase}-${table}`);
    const freshOrg = (await seed('Organization', 'x', `${phase}-${table}`)).id;
    const freshRaw = (await owner.$queryRawUnsafe<any[]>(`SELECT row_to_json(t) AS row FROM ${q} t WHERE ${column}=$1`, fresh[pk.name]))[0].row;
    record('rls', `${table}: own delete of unreferenced fixture`, (await tx(freshOrg, `DELETE FROM ${q} WHERE ${column}=$1`, [fresh[pk.name]])).count, 1);
    await delegate(model).delete({ where: { [pk.name]: fresh[pk.name] } });
    record('rls', `${table}: own insert with real FK/unique constraints`, (await tx(freshOrg, insert, [JSON.stringify(freshRaw)])).count, 1);
    record('rls', `${table}: explicit system lookup sees X and Y`, (await tx(null, `SELECT * FROM ${q} WHERE ${column}=ANY($1::text[])`, [[x[pk.name], y[pk.name]]], true)).count, 2);
    let threw = false;
    try { await delegate(model, prisma).findMany(); } catch (e) { threw = /tenant context/i.test(String(e)); }
    record('prisma', `${model}: missing context throws`, threw, true);
    const own = await withTenant(orgX, () => delegate(model, prisma).findMany({ where: { [pk.name]: { in: [x[pk.name], y[pk.name]] } } }));
    record('prisma', `${model}: context and RLS restrict ORM`, own.map((r: any) => r[pk.name]), [x[pk.name]]);
    const system = await runSystemQuery(() => delegate(model, prisma).count({ where: { [pk.name]: { in: [x[pk.name], y[pk.name]] } } }));
    record('prisma', `${model}: explicit system context`, system, 2);
  }
  const catalog = await owner.$queryRawUnsafe<any[]>(`SELECT c.relname AS table, c.relrowsecurity AS enabled, c.relforcerowsecurity AS forced, (SELECT count(*)::int FROM pg_policy p WHERE p.polrelid=c.oid) AS policies FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind='r' AND EXISTS (SELECT 1 FROM pg_attribute a WHERE a.attrelid=c.oid AND a.attname='org_id' AND NOT a.attisdropped) ORDER BY 1`);
  record('catalog', 'every org_id table enabled + forced + policy', catalog.filter(t => !t.enabled || !t.forced || !t.policies).map(t => t.table), []);

  // Six newly guarded models already had RLS before E-1. Exercise their real
  // Prisma paths as well; table coverage alone cannot prove extension behavior.
  for (const model of ['Message', 'CareSession', 'LeadPoolDistribution', 'MediaAsset', 'MediaBlob', 'MediaAlbum']) {
    const x = await seed(model, 'x'), y = await seed(model, 'y');
    let blocked = false;
    try { await delegate(model, prisma).count(); } catch (e) { blocked = /tenant context/i.test(String(e)); }
    record('prisma-extra', `${model}: no tenant context`, blocked, true);
    record('prisma-extra', `${model}: own context restricts both IDs`, await withTenant(orgX, () => delegate(model, prisma).count({ where: { id: { in: [x.id, y.id] } } })), 1);
    record('prisma-extra', `${model}: system identity context`, await runSystemQuery(() => delegate(model, prisma).count({ where: { id: { in: [x.id, y.id] } } })), 2);
  }

  const actor = await seed('User', 'x');
  const group = await seed('PermissionGroup', 'x');
  const department = await seed('Department', 'x');
  await owner.permissionGroup.update({ where: { id: group.id }, data: { grants: { engagement_score: { access: true, view_all: true } } } });
  await owner.user.update({ where: { id: actor.id }, data: { permissionGroupId: group.id } });
  await owner.departmentMember.create({ data: { userId: actor.id, departmentId: department.id, deptRole: 'leader' } });
  const base = await app.listen({ host: '127.0.0.1', port: 55576 });
  const paths = ['/api/v1/reports/automation-summary', '/api/v1/reports/broadcast'];
  const token = (role: string, orgId = orgX, id = actor.id) => app.jwt.sign({ id, orgId, role, tv: actor.jwtTokenVersion, typ: 'access' }, { expiresIn: '5m' });
  const staleAdmin = token('admin');
  const legacyAdmin = app.jwt.sign({ id: actor.id, orgId: orgX, role: 'admin', tv: actor.jwtTokenVersion }, { expiresIn: '5m' });
  const get = async (path: string, t?: string) => {
    const res = await fetch(`${base}${path}?from=2026-11-01&to=2026-11-02`, { headers: t ? { authorization: `Bearer ${t}` } : {} });
    return { status: res.status, body: await res.json() as any };
  };
  for (const path of paths) {
    await owner.user.update({ where: { id: actor.id }, data: { role: 'admin', isActive: true } });
    record('jwt-http', `${path}: no token`, (await get(path)).status, 401);
    record('jwt-http', `${path}: malformed token`, (await get(path, 'invalid')).status, 401);
    record('jwt-http', `${path}: current admin`, (await get(path, staleAdmin)).status, 200);
    await owner.user.update({ where: { id: actor.id }, data: { role: 'member' } });
    const denied = await get(path, staleAdmin);
    record('jwt-http', `${path}: same JWT after downgrade`, denied.status, 403);
    record('jwt-http', `${path}: same legacy JWT after downgrade`, (await get(path, legacyAdmin)).status, 403);
    record('jwt-http', `${path}: downgrade did not change token version`, (await owner.user.findUniqueOrThrow({ where: { id: actor.id } })).jwtTokenVersion, actor.jwtTokenVersion);
    record('jwt-http', `${path}: denial code compatibility`, denied.body.code, path.includes('automation') ? 'automation_report_admin_only' : 'broadcast_admin_only');
    for (const deptRole of ['leader', 'deputy']) {
      await owner.departmentMember.update({ where: { userId: actor.id }, data: { deptRole } });
      record('jwt-http', `${path}: ${deptRole} with report/view_all grant denied`, (await get(path, staleAdmin)).status, 403);
    }
    await owner.user.update({ where: { id: actor.id }, data: { role: 'owner' } });
    record('jwt-http', `${path}: current owner with stale member claim`, (await get(path, token('member'))).status, 200);
    record('jwt-http', `${path}: cross-org claim`, (await get(path, token('admin', orgY))).status, 403);
    await owner.user.update({ where: { id: actor.id }, data: { isActive: false } });
    record('jwt-http', `${path}: inactive owner access JWT`, (await get(path, staleAdmin)).status, 403);
    record('jwt-http', `${path}: inactive owner legacy JWT`, (await get(path, legacyAdmin)).status, 401);
    record('jwt-http', `${path}: nonexistent identity`, (await get(path, token('admin', orgX, randomUUID()))).status, 403);
  }
  const result = { phase, time: new Date().toISOString(), tables: targets, catalog, passed: checks.filter(c => c.pass).length, failed: checks.filter(c => !c.pass).length, checks };
  await mkdir(resolve(out, 'evidence'), { recursive: true });
  await writeFile(resolve(out, 'evidence', `${phase}-boundaries.json`), JSON.stringify(result, null, 2), { flag: 'wx' });
  console.log(JSON.stringify({ phase, passed: result.passed, failed: result.failed, failedNames: checks.filter(c => !c.pass).map(c => c.name) }));
  if (result.failed) process.exitCode = 1;
} finally { await app.close(); await prisma.$disconnect(); await owner.$disconnect(); await pool.end(); }
