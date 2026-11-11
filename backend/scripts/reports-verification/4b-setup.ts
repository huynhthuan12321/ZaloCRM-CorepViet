import { Client } from 'pg';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import bcrypt from 'bcryptjs';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';

const adminUrl = 'postgresql://postgres@127.0.0.1:55471/reports_1b_verify';
const admin = new Client({ connectionString: adminUrl });
await admin.connect();
const identity = (await admin.query('SELECT current_database() AS db, current_user AS role')).rows[0];
assert.equal(identity.db, 'reports_1b_verify'); assert.equal(identity.role, 'postgres');
const artifacts = resolve('../artifacts/reports-ai-4b-2026-11-02');
await mkdir(artifacts, { recursive: true });
const rls = await readFile('prisma/rls/tenant-rls.sql', 'utf8');
let rlsApplied = false;
try {
  await admin.query('BEGIN'); await admin.query(rls); await admin.query('COMMIT'); rlsApplied = true;
} catch (error: any) {
  await admin.query('ROLLBACK');
  await writeFile(resolve(artifacts, 'rls-apply-error.json'), JSON.stringify({ code: error.code, message: error.message }, null, 2));
  console.log('RLS_APPLY_FAILED', error.code, error.message);
}
await admin.query(`CREATE ROLE reports_verify_app LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS;
  GRANT CONNECT ON DATABASE reports_1b_verify TO reports_verify_app;
  GRANT USAGE ON SCHEMA public TO reports_verify_app;
  GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA public TO reports_verify_app;
  GRANT USAGE,SELECT ON ALL SEQUENCES IN SCHEMA public TO reports_verify_app;`);
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: adminUrl }) });
const orgA = 'verify-org-a', orgB = 'verify-org-b';
await prisma.organization.createMany({ data: [{ id: orgA, name: 'VERIFY Org A' }, { id: orgB, name: 'VERIFY Org B' }] });
const pg = await prisma.permissionGroup.create({ data: { id: 'verify-grant', orgId: orgA, name: 'VERIFY reports', grants: { engagement_score: { access: true }, conversation: { access: true } } } });
const passwordHash = await bcrypt.hash('VerifyLocalOnly-2026!', 10); // disposable fixture, never a real credential
for (const [id, orgId, role, name] of [
  ['verify-leader',orgA,'member','VERIFY Leader'], ['verify-sale-a',orgA,'member','VERIFY Sale A'],
  ['verify-sale-b',orgA,'member','VERIFY Sale B'], ['verify-member',orgA,'member','VERIFY Member'],
  ['verify-admin',orgA,'admin','VERIFY Admin'], ['verify-admin-b',orgB,'admin','VERIFY Admin B'],
] as const) await prisma.user.create({ data: { id, orgId, role, fullName: name, email: `${id}@example.test`, passwordHash, passwordChangedAt: new Date(), permissionGroupId: orgId === orgA ? pg.id : undefined } });
for (const [id,path] of [['verify-dept-a','/verify-dept-a/'],['verify-dept-b','/verify-dept-b/']] as const)
  await prisma.department.create({ data: { id, orgId: orgA, name: id, path } });
for (const [userId, departmentId, deptRole] of [['verify-leader','verify-dept-a','leader'],['verify-sale-a','verify-dept-a','member'],['verify-member','verify-dept-a','member'],['verify-sale-b','verify-dept-b','leader']] as const)
  await prisma.departmentMember.create({ data: { userId, departmentId, deptRole } });
for (const [id,orgId,ownerUserId] of [['verify-nick-a',orgA,'verify-sale-a'],['verify-nick-b',orgA,'verify-sale-b'],['verify-nick-x',orgB,'verify-admin-b']] as const)
  await prisma.zaloAccount.create({ data: { id, orgId, ownerUserId, displayName: id, zaloUid: id, privacyMode: 'sub' } });
await prisma.zaloAccountAccess.create({ data: { zaloAccountId: 'verify-nick-b', userId: 'verify-leader' } });
const day = new Date().toISOString().slice(0,10);
for (const [id,orgId,nick,type] of [
  ['verify-main',orgA,'verify-nick-a','pair'],['verify-main-wait',orgA,'verify-nick-a','wait'],
  ['verify-shared',orgA,'verify-nick-b','pair'],['verify-shared-wait',orgA,'verify-nick-b','wait'],
  ['verify-shared-unknown',orgA,'verify-nick-b','unknown'],['verify-foreign',orgB,'verify-nick-x','pair'],
] as const) {
  await prisma.conversation.create({ data: { id, orgId, zaloAccountId: nick, externalThreadId: id } });
  await prisma.message.create({ data: { id: `${id}-in`, orgId, conversationId: id, senderType: 'contact', content: 'VERIFY fake inbound', sentAt: new Date(`${day}T09:00:00+07:00`), sentVia: 'user' } });
  if (type !== 'wait') await prisma.message.create({ data: { id: `${id}-out`, orgId, conversationId: id, senderType: 'self', content: 'VERIFY fake response', sentAt: new Date(`${day}T09:01:00+07:00`), sentVia: 'user_native', repliedByUserId: type === 'unknown' ? null : orgId === orgA ? 'verify-sale-a' : 'verify-admin-b' } });
}
await prisma.savedReport.create({ data: { id: 'verify-saved', orgId: orgA, name: 'VERIFY received by user', type: 'custom', createdBy: 'verify-sale-a', config: { metrics: ['messages_received'], groupBy: 'user', dateRange: { from: day, to: day } } } });
const tables = (await admin.query(`SELECT c.relname,c.relrowsecurity,c.relforcerowsecurity FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname IN ('users','conversations','messages','saved_reports','zalo_accounts','contacts') ORDER BY c.relname`)).rows;
const role = (await admin.query(`SELECT rolname,rolsuper,rolbypassrls FROM pg_roles WHERE rolname='reports_verify_app'`)).rows[0];
await writeFile(resolve(artifacts, 'db-setup.json'), JSON.stringify({ identity, rlsApplied, role, tables, day, schema: 'Prisma db push to fresh disposable DB; not migration replay' }, null, 2));
console.log(JSON.stringify({ rlsApplied, role, tables, day }));
await prisma.$disconnect(); await admin.end();

