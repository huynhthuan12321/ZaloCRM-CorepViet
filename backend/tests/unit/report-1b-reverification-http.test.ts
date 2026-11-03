// Review-only tests: actual routes, gate and report services. Auth/Prisma are
// fixtures; SQL executes on an isolated in-memory PostgreSQL engine, not RLS.
import Fastify from 'fastify';
import { PGlite } from '@electric-sql/pglite';
import { Prisma } from '@prisma/client';
import { beforeAll, afterAll, beforeEach, afterEach, describe, it, expect, vi } from 'vitest';
const h = vi.hoisted(() => ({
  current: null as any, shared: true, configVisible: true,
  db: {
    user: { findFirst: vi.fn(), findMany: vi.fn() },
    department: { findMany: vi.fn() }, departmentMember: { findMany: vi.fn() },
    zaloAccount: { findMany: vi.fn() }, zaloAccountAccess: { findMany: vi.fn() },
    savedReport: { findFirst: vi.fn() }, message: { findMany: vi.fn() }, $queryRaw: vi.fn(),
  },
}));
vi.mock('../../src/shared/database/prisma-client.js', () => ({ prisma: h.db }));
vi.mock('../../src/modules/auth/auth-middleware.js', () => ({ authMiddleware: async (req: any) => {
  req.user = { id: 'leader-a', orgId: 'org-a', role: 'owner' }; // stale JWT must not grant org scope
} }));
vi.mock('../../src/modules/rbac/owner-scope.js', () => ({ getOwnerScope: vi.fn(), applyOwnerScope: vi.fn() }));
import { analyticsRoutes } from '../../src/modules/analytics/analytics-routes.js';
import { savedReportRoutes } from '../../src/modules/analytics/saved-report-routes.js';

let db: PGlite;
let app: ReturnType<typeof Fastify>;
const dateRange = { from: '2026-11-01', to: '2026-11-01' };
const config = { metrics: ['messages_sent', 'messages_received'], groupBy: 'user', dateRange };
beforeAll(async () => {
  db = new PGlite(); await db.waitReady;
  await db.exec(`CREATE TABLE users(id text, full_name text);
    CREATE TABLE conversations(id text, org_id text, zalo_account_id text, is_virtual boolean NOT NULL DEFAULT false);
    CREATE TABLE messages(id text, conversation_id text, sender_type text, replied_by_user_id text, sent_at timestamptz, is_local boolean NOT NULL DEFAULT false, is_deleted boolean NOT NULL DEFAULT false, metadata jsonb);
    INSERT INTO users VALUES ('sale-a','Sale A'),('sale-b','Sale B');
    INSERT INTO conversations VALUES ('main','org-a','nick-a'),('shared','org-a','nick-b'),('foreign','org-b','nick-a');
    INSERT INTO messages VALUES
      ('in-main','main','contact',NULL,'2026-11-01T09:00:00+07:00'),
      ('in-shared','shared','contact',NULL,'2026-11-01T09:00:00+07:00'),
      ('in-foreign','foreign','contact',NULL,'2026-11-01T09:00:00+07:00'),
      ('out-main','main','self','sale-a','2026-11-01T09:01:00+07:00'),
      ('out-shared','shared','self','sale-a','2026-11-01T09:01:00+07:00'),
      ('out-other','shared','self','sale-b','2026-11-01T09:02:00+07:00');`);
}, 20000);
afterAll(async () => { await db?.close(); });
beforeEach(async () => {
  vi.resetAllMocks(); h.shared = true; h.configVisible = true;
  h.current = { role: 'member', permissionGroup: { archivedAt: null, grants: { engagement_score: { access: true, view_all: true } } }, departmentMember: { deptRole: 'leader', department: { path: '/a/' } } };
  h.db.user.findFirst.mockImplementation(async () => h.current);
  h.db.user.findMany.mockResolvedValue([{ id: 'sale-a', fullName: 'Sale A' }]);
  h.db.department.findMany.mockResolvedValue([{ id: 'dept-a' }]);
  h.db.departmentMember.findMany.mockResolvedValue([{ userId: 'sale-a' }]);
  h.db.zaloAccount.findMany.mockResolvedValue([{ id: 'nick-a' }]);
  h.db.zaloAccountAccess.findMany.mockImplementation(async () => h.shared ? [{ zaloAccountId: 'nick-b' }] : []);
  h.db.savedReport.findFirst.mockImplementation(async ({ where }) => h.configVisible && where.orgId === 'org-a' && where.createdBy.in.includes('sale-a') ? { type: 'custom', config } : null);
  h.db.$queryRaw.mockImplementation(async (strings: TemplateStringsArray, ...values: unknown[]) => {
    const query = Prisma.sql(strings, ...values); return (await db.query(query.text, query.values)).rows;
  });
  h.db.message.findMany.mockImplementation(async ({ where }) => {
    // Fixture adapter applies the real ORM query's organization/account predicates.
    // This does not exercise Prisma's adapter, SQL generation or RLS.
    const rows = [
      { id: 'wait-main', conversationId: 'main-wait', account: 'nick-a', type: 'contact', minute: '00' },
      { id: 'wait-shared', conversationId: 'shared-wait', account: 'nick-b', type: 'contact', minute: '00' },
      { id: 'in-unknown', conversationId: 'shared-unknown', account: 'nick-b', type: 'contact', minute: '00' },
      { id: 'out-unknown', conversationId: 'shared-unknown', account: 'nick-b', type: 'self', minute: '01' },
    ];
    expect(where.conversation.orgId).toBe('org-a');
    return rows.filter(row => where.conversation.zaloAccountId.in.includes(row.account)).map(row => ({
      id: row.id, conversationId: row.conversationId, conversation: { zaloAccountId: row.account },
      senderType: row.type, sentVia: 'user_native', repliedByUserId: null,
      sentAt: new Date(`2026-11-01T09:${row.minute}:00+07:00`), metadata: null, isLocal: false, isDeleted: false,
    }));
  });
  app = Fastify(); await app.register(analyticsRoutes); await app.register(savedReportRoutes); await app.ready();
  vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date('2026-11-02T12:00:00+07:00'));
});
afterEach(async () => { vi.useRealTimers(); await app.close(); });

describe('independent 1B re-verification through HTTP', () => {
  it('direct custom and saved custom run both use the current viewer scope and preserve inbound', async () => {
    const direct = await app.inject({ method: 'POST', url: '/api/v1/analytics/custom', payload: config });
    const saved = await app.inject({ method: 'POST', url: '/api/v1/saved-reports/report-a/run' });
    expect(direct.statusCode).toBe(200); expect(saved.statusCode).toBe(200);
    expect(direct.json()).toEqual({ labels: ['Sale A', 'Chưa xác định nhân viên'], datasets: [
      { metric: 'messages_sent', data: [2, 0] }, { metric: 'messages_received', data: [0, 1] },
    ] });
    expect(saved.json()).toEqual(direct.json());
    expect(h.db.savedReport.findFirst.mock.calls[0][0].where).toEqual({ id: 'report-a', orgId: 'org-a', createdBy: { in: ['leader-a', 'sale-a'] } });
  });

  it('splits HTTP counters and rereads shared grants on the next request', async () => {
    const url = '/api/v1/analytics/response-time?from=2026-11-01&to=2026-11-01';
    const first = await app.inject(url); expect(first.statusCode).toBe(200);
    expect(first.json()).toMatchObject({ pending: 1, unattributed: 0, mainPending: 1, sharedPending: 1, mainUnattributed: 0, sharedUnattributed: 1 });
    h.shared = false;
    const second = await app.inject(url); expect(second.statusCode).toBe(200);
    expect(second.json()).toMatchObject({ mainPending: 1, sharedPending: 0, sharedUnattributed: 0 });
    expect(h.db.message.findMany.mock.calls[1][0].where.conversation.zaloAccountId).toEqual({ in: ['nick-a'] });
  });

  it('revoking report access stops direct and saved execution before data queries', async () => {
    h.current.permissionGroup.grants.engagement_score.access = false;
    expect((await app.inject({ method: 'POST', url: '/api/v1/analytics/custom', payload: config })).statusCode).toBe(403);
    expect((await app.inject({ method: 'POST', url: '/api/v1/saved-reports/report-a/run' })).statusCode).toBe(403);
    expect(h.db.$queryRaw).not.toHaveBeenCalled(); expect(h.db.savedReport.findFirst).not.toHaveBeenCalled();
  });

  it('rejects invalid custom-report dates before executing the aggregate', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/analytics/custom',
      payload: { ...config, dateRange: { from: '2026-02-30', to: '2026-03-01' } },
    });
    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ code: 'invalid_report_date_range' });
    expect(h.db.$queryRaw).not.toHaveBeenCalled();
  });

  it('saved response-time uses the same split counters as the direct endpoint', async () => {
    h.db.savedReport.findFirst.mockResolvedValue({ type: 'response_time', config: { dateRange } });
    const direct = await app.inject('/api/v1/analytics/response-time?from=2026-11-01&to=2026-11-01');
    const saved = await app.inject({ method: 'POST', url: '/api/v1/saved-reports/report-a/run' });
    expect(direct.statusCode).toBe(200); expect(saved.statusCode).toBe(200);
    expect(saved.json()).toEqual(direct.json());
    expect(saved.json()).toMatchObject({ mainPending: 1, sharedPending: 1, mainUnattributed: 0, sharedUnattributed: 1 });
  });

  it('an unreadable saved config returns 404 before executing its aggregate', async () => {
    h.configVisible = false;
    expect((await app.inject({ method: 'POST', url: '/api/v1/saved-reports/report-a/run' })).statusCode).toBe(404);
    expect(h.db.$queryRaw).not.toHaveBeenCalled();
  });
});
