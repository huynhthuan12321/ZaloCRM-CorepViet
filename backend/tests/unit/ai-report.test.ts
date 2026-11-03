import Fastify, { type FastifyInstance } from 'fastify';
import { PGlite } from '@electric-sql/pglite';
import { Prisma } from '@prisma/client';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({ queryRaw: vi.fn(), user: vi.fn() }));
vi.mock('../../src/shared/database/prisma-client.js', () => ({ prisma: {
  $queryRaw: h.queryRaw,
  user: { findFirst: h.user },
  department: { findMany: async () => [{ id: 'dept-a' }] },
  departmentMember: { findMany: async () => [{ userId: 'leader' }, { userId: 'sale-a' }] },
  zaloAccount: { findMany: async () => [{ id: 'nick-a' }] },
  zaloAccountAccess: { findMany: async () => [{ zaloAccountId: 'nick-a' }, { zaloAccountId: 'nick-shared' }] },
} }));
// Route/SQL test, not evidence of JWT verification; real JWT is tested separately.
vi.mock('../../src/modules/auth/auth-middleware.js', () => ({ authMiddleware: (request: any, _reply: any, done: () => void) => {
  request.user = { id: request.headers['x-viewer'] ?? 'admin', orgId: 'a' }; done();
} }));
import { getAiReport } from '../../src/modules/dashboard/ai-report-service.js';
import { aiReportRoutes } from '../../src/modules/dashboard/ai-report-routes.js';
import { orgReportScope, type ReportScope } from '../../src/modules/dashboard/report-scope.js';
import { resolveReportPeriod } from '../../src/modules/dashboard/report-period.js';

let db: PGlite;
let app: FastifyInstance;
const period = resolveReportPeriod({ from: '2026-10-01', to: '2026-10-01' });
const asOf = new Date('2026-11-01T12:00:00Z');
const leader: ReportScope = { orgId: 'a', viewerId: 'leader', kind: 'department', userIds: ['leader', 'sale-a'], accountIds: ['nick-a'], readableAccountIds: ['nick-a', 'nick-shared'] };

beforeAll(async () => {
  // Explicit isolated in-memory PostgreSQL engine; never uses DATABASE_URL.
  db = new PGlite();
  await db.exec(`
    CREATE TABLE zalo_accounts(id text PRIMARY KEY, org_id text);
    CREATE TABLE conversations(id text PRIMARY KEY, org_id text, zalo_account_id text, is_virtual boolean DEFAULT false, "threadType" text DEFAULT 'user', deleted_at timestamp);
    CREATE TABLE messages(id text PRIMARY KEY, org_id text, conversation_id text, sender_type text DEFAULT 'self', sent_via text DEFAULT 'ai_auto', is_local boolean DEFAULT false, is_deleted boolean DEFAULT false, deleted_at timestamp, metadata jsonb, sent_at timestamp DEFAULT '2026-10-01 02:00:00');
    CREATE TABLE activity_logs(id text PRIMARY KEY, org_id text, actor_type text DEFAULT 'bot', action text, entity_type text DEFAULT 'conversation', entity_id text, details jsonb, created_at timestamp DEFAULT '2026-10-01 02:00:01');
    CREATE TABLE ai_suggestions(id text PRIMARY KEY, org_id text, conversation_id text, type text DEFAULT 'auto_reply_needs_review', accepted boolean DEFAULT false, created_at timestamp DEFAULT '2026-10-01 03:00:00');
    CREATE TABLE ai_suggestions_applied(id text PRIMARY KEY, message_id text, accepted_fields jsonb);
  `);
}, 60000);
afterAll(async () => { await db?.close(); });
beforeEach(async () => {
  vi.clearAllMocks();
  h.queryRaw.mockImplementation(async (strings: TemplateStringsArray, ...values: unknown[]) => {
    const query = Prisma.sql(strings, ...values);
    return (await db.query(query.text, query.values)).rows;
  });
  h.user.mockImplementation(async ({ where }: any) => where.id === 'admin' ? { role: 'admin' } : {
    role: 'member', permissionGroup: { archivedAt: null, grants: { engagement_score: { access: true }, ai: { access: true } } },
    departmentMember: { deptRole: where.id === 'leader' ? 'leader' : 'member', department: { path: '/a/' } },
  });
  await db.exec(`
    TRUNCATE messages, conversations, zalo_accounts, activity_logs, ai_suggestions, ai_suggestions_applied;
    INSERT INTO zalo_accounts VALUES ('nick-a','a'), ('nick-shared','a'), ('nick-b','a'), ('nick-x','b');
    INSERT INTO conversations(id,org_id,zalo_account_id) VALUES ('main','a','nick-a'), ('shared','a','nick-shared'), ('outside','a','nick-b'), ('foreign','b','nick-x'), ('virtual','a','nick-a'), ('group','a','nick-a'), ('deleted','a','nick-a');
    UPDATE conversations SET is_virtual=true WHERE id='virtual';
    UPDATE conversations SET "threadType"='group' WHERE id='group';
    UPDATE conversations SET deleted_at='2026-10-01' WHERE id='deleted';
    INSERT INTO messages(id,org_id,conversation_id,metadata) VALUES
      ('reply','a','main','{"aiAuto":true}'), ('follow','a','main','{"aiAuto":true,"aiFollowup":true}'),
      ('legacy','a','main',null), ('metadata-only','a','main','{"aiAuto":true}'), ('audit-follow','a','main',null),
      ('shared-ai','a','shared','{"aiFollowup":true}'), ('outside-ai','a','outside',null), ('foreign-ai','b','foreign',null),
      ('dry','a','main','{"dryRun":true}'), ('test','a','main','{"test":true}'), ('test-string','a','main','{"test":"true"}'),
      ('is-test','a','main','{"isTest":true}'), ('local','a','main',null), ('deleted-msg','a','main',null),
      ('virtual-ai','a','virtual',null), ('group-ai','a','group',null), ('deleted-conv','a','deleted',null),
      ('human','a','main',null), ('inbound','a','main',null), ('future','a','main',null);
    UPDATE messages SET sent_via='user' WHERE id IN ('metadata-only','human');
    UPDATE messages SET sender_type='contact' WHERE id='inbound';
    UPDATE messages SET is_local=true WHERE id='local';
    UPDATE messages SET is_deleted=true WHERE id='deleted-msg';
    UPDATE messages SET sent_at='2026-12-01' WHERE id='future';
    INSERT INTO activity_logs(id,org_id,action,entity_id,details) VALUES
      ('reply-log-1','a','ai_auto_reply_sent','main','{"messageId":"reply"}'),
      ('reply-log-2','a','ai_auto_reply_sent','main','{"messageId":"reply"}'),
      ('follow-log','a','ai_followup_sent','main','{"messageId":"audit-follow"}'),
      ('orphan-log','a','ai_auto_reply_sent','main','{"messageId":"not-a-message"}'),
      ('foreign-log','b','ai_auto_reply_sent','main','{"messageId":"legacy"}');
    INSERT INTO ai_suggestions(id,org_id,conversation_id,accepted) VALUES ('draft-1','a','main',false), ('draft-2','a','main',true), ('draft-shared','a','shared',false), ('draft-foreign','b','foreign',false), ('draft-orphan','a',null,false), ('draft-virtual','a','virtual',false);
    INSERT INTO ai_suggestions(id,org_id,conversation_id,type) VALUES ('plain-suggestion','a','main','reply_draft');
    INSERT INTO ai_suggestions_applied VALUES ('crm-apply','reply','[{"field":"phone"}]');
  `);
  app = Fastify(); await app.register(aiReportRoutes); await app.ready();
});
afterEach(async () => { await app.close(); });

describe('AI report PostgreSQL aggregates (PGlite, no RLS/JWT claim)', () => {
  it('counts canonical messages once, splits main/shared, and never treats CRM applies as send approvals', async () => {
    const result = await getAiReport(leader, period, asOf);
    expect(result.main.kpis).toEqual({ sentMessages: 5, conversations: 1, autoReplies: 1, followups: 2, unclassified: 2, reviewDraftsCreated: 2 });
    expect(result.shared?.kpis).toEqual({ sentMessages: 1, conversations: 1, autoReplies: 0, followups: 1, unclassified: 0, reviewDraftsCreated: 1 });
    expect(result.scope.sharedAccounts).toBe(1);
    expect(result.unavailable.pendingReviews).toBeNull();
  });
  it('admin sees only its organization and member cannot inherit report access from AI grants', async () => {
    expect((await getAiReport(orgReportScope('a'), period, asOf)).main.kpis.sentMessages).toBe(7);
    expect((await getAiReport(orgReportScope('b'), period, asOf)).main.kpis.sentMessages).toBe(1);
    expect((await app.inject({ url: '/api/v1/reports/ai', headers: { 'x-viewer': 'member' } })).statusCode).toBe(403);
  });
  it('keeps valid messages when audits are missing; metadata followup remains classified', async () => {
    await db.exec('DELETE FROM activity_logs');
    const { kpis } = (await getAiReport(leader, period, asOf)).main;
    expect(kpis).toMatchObject({ sentMessages: 5, autoReplies: 0, followups: 1, unclassified: 4 });
  });
  it('keeps conflicting legacy audits unknown and ignores audit from another conversation or future', async () => {
    await db.exec(`INSERT INTO activity_logs(id,org_id,action,entity_id,details) VALUES
      ('conflict-1','a','ai_auto_reply_sent','main','{"messageId":"legacy"}'), ('conflict-2','a','ai_followup_sent','main','{"messageId":"legacy"}'),
      ('wrong-conv','a','ai_auto_reply_sent','outside','{"messageId":"metadata-only"}');
      INSERT INTO activity_logs(id,org_id,action,entity_id,details,created_at) VALUES ('future-log','a','ai_auto_reply_sent','main','{"messageId":"metadata-only"}','2026-12-01');`);
    expect((await getAiReport(leader, period, asOf)).main.kpis).toMatchObject({ sentMessages: 5, unclassified: 2 });
  });
  it('uses inclusive Vietnam midnight start and exclusive end, with daily sum matching total', async () => {
    await db.exec(`INSERT INTO messages(id,org_id,conversation_id,sent_at) VALUES
      ('before','a','main','2026-09-30 16:59:59.999'), ('start','a','main','2026-09-30 17:00:00'),
      ('last','a','main','2026-10-01 16:59:59.999'), ('end','a','main','2026-10-01 17:00:00');`);
    const result = await getAiReport(leader, period, asOf);
    expect(result.main.kpis.sentMessages).toBe(7);
    expect(result.main.series).toHaveLength(1);
    expect(result.main.series[0]).toMatchObject({ date: '2026-10-01', sentMessages: 7 });
    expect(result.main.kpis.autoReplies + result.main.kpis.followups + result.main.kpis.unclassified).toBe(7);
  });
  it('counts distinct conversations across days, rather than summing daily distinct values', async () => {
    await db.exec(`INSERT INTO messages(id,org_id,conversation_id,sent_at) VALUES ('next-day','a','main','2026-10-02 02:00:00');`);
    const result = await getAiReport(leader, resolveReportPeriod({ from: '2026-10-01', to: '2026-10-02' }), asOf);
    expect(result.main.kpis).toMatchObject({ sentMessages: 6, conversations: 1 });
    expect(result.main.series.reduce((sum, row) => sum + row.sentMessages, 0)).toBe(6);
  });
  it('empty scope fails closed, while missing sources are null and real empty counts are zero', async () => {
    const result = await getAiReport({ ...leader, accountIds: [], readableAccountIds: [] }, period, asOf);
    expect(result.main.kpis.sentMessages).toBe(0); expect(result.shared).toBeNull();
    expect(Object.values(result.unavailable)).toEqual([null, null, null, null, null]);
    expect(result.availability.cost.reason).toBe('recorded_cost_unavailable');
  });
  it('returns aggregates without message content, names, contact IDs or audit details', async () => {
    const body = JSON.stringify(await getAiReport(leader, period, asOf));
    for (const key of ['content', 'messageId', 'contactId', 'saleName', 'acceptedFields']) expect(body).not.toContain(`"${key}"`);
  });
  it('route resolves real report scope and uses the supplied Vietnam period', async () => {
    const response = await app.inject({ url: '/api/v1/reports/ai?from=2026-10-01&to=2026-10-01', headers: { 'x-viewer': 'leader' } });
    expect(response.statusCode).toBe(200); expect(response.json().main.kpis.sentMessages).toBe(5);
    expect(response.json().shared.kpis.sentMessages).toBe(1);
  });
  it.each(['userId=outside', 'orgId=b', 'accountId=nick-b', 'from=2026-02-30', 'from=2026-10-02&to=2026-10-01', 'from=2024-01-01&to=2026-10-01'])(
    'rejects unsupported or invalid query %s without executing aggregates', async query => {
      const response = await app.inject(`/api/v1/reports/ai?${query}`);
      expect(response.statusCode).toBe(400); expect(h.queryRaw).not.toHaveBeenCalled();
    });
});
