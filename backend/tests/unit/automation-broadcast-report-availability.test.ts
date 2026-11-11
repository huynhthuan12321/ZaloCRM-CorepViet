import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const modelNames = [
    'zaloAccount', 'friendshipAttempt', 'careSessionEvent', 'careSession',
    'zaloAccountStatusLog', 'user', 'broadcastJob', 'broadcastRun', 'customerList',
  ];
  return {
    prisma: Object.fromEntries(modelNames.map((name) => [name, {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      groupBy: vi.fn(),
    }])),
  };
});

vi.mock('../../src/shared/database/prisma-client.js', () => ({ prisma: mocks.prisma }));
vi.mock('../../src/modules/auth/auth-middleware.js', () => ({ authMiddleware: vi.fn() }));
vi.mock('../../src/shared/utils/logger.js', () => ({ logger: { error: vi.fn() } }));

import { automationReportRoutes } from '../../src/modules/automation/automation-report-routes.js';
import { broadcastReportRoutes } from '../../src/modules/broadcast/broadcast-report-routes.js';

describe('Automation and Broadcast report availability', () => {
  let handlers: Record<string, (request: any, reply: any) => Promise<any>>;
  let reply: any;
  const query = { from: '2026-10-01', to: '2026-10-29' };
  const request = { user: { id: 'admin-a', orgId: 'org-a', role: 'admin' }, query };

  beforeEach(async () => {
    vi.resetAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-29T03:00:00Z'));
    for (const model of Object.values(mocks.prisma) as any[]) {
      model.findMany.mockResolvedValue([]);
      model.findFirst.mockResolvedValue(null);
      model.groupBy.mockResolvedValue([]);
    }
    mocks.prisma.user.findFirst.mockResolvedValue({ role: 'admin' });
    handlers = {};
    reply = { status: vi.fn().mockReturnThis(), send: vi.fn() };
    const app = {
      addHook: vi.fn(),
      get: (path: string, handler: (request: any, reply: any) => Promise<any>) => {
        handlers[path] = handler;
      },
    };
    await automationReportRoutes(app as any);
    await broadcastReportRoutes(app as any);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it.each([
    ['/api/v1/reports/automation-summary', 'automation_report_admin_only'],
    ['/api/v1/reports/broadcast', 'broadcast_admin_only'],
  ])('rechecks current admin membership for %s and preserves its denial code', async (path, code) => {
    // Same JWT claims throughout: downgrade must take effect on the next request.
    await handlers[path](request, reply);
    expect(reply.status).not.toHaveBeenCalled();
    mocks.prisma.user.findFirst.mockResolvedValue({ role: 'member' });
    await handlers[path](request, reply);
    expect(reply.status).toHaveBeenCalledWith(403);
    expect(reply.send).toHaveBeenLastCalledWith({ error: 'forbidden', code });
    expect(mocks.prisma.user.findFirst).toHaveBeenLastCalledWith(expect.objectContaining({
      where: { id: 'admin-a', orgId: 'org-a', isActive: true },
    }));
  });

  it.each(['/api/v1/reports/automation-summary', '/api/v1/reports/broadcast'])(
    'denies removed/cross-org users and permits current owners regardless of stale claim at %s', async (path) => {
      mocks.prisma.user.findFirst.mockResolvedValue(null);
      await handlers[path](request, reply);
      expect(reply.status).toHaveBeenCalledWith(403);
      reply.status.mockClear();
      mocks.prisma.user.findFirst.mockResolvedValue({ role: 'owner' });
      await handlers[path]({ ...request, user: { ...request.user, role: 'member' } }, reply);
      expect(reply.status).not.toHaveBeenCalled();
    },
  );

  it('marks Automation rates unavailable when there are no measured events', async () => {
    mocks.prisma.zaloAccount.findMany.mockResolvedValue([
      { id: 'nick-a', displayName: 'Nick A', phone: null, ownerUserId: 'sale-a', status: 'connected' },
    ]);
    mocks.prisma.careSessionEvent.groupBy.mockResolvedValue([
      { sessionId: 'session-a', eventType: 'step_sent', _count: { _all: 1 } },
    ]);
    mocks.prisma.careSession.findMany.mockResolvedValue([{ id: 'session-a', nickId: 'nick-a' }]);

    const result = await handlers['/api/v1/reports/automation-summary'](request, reply);

    expect(result.kpis).toMatchObject({ kbGui: 0, bdGui: 1, tiLeDongYPct: null, tiLePhanHoiPct: 0 });
    expect(result.availability).toEqual({
      tiLeDongYPct: { status: 'unavailable', reason: 'no_friendship_attempts_in_period' },
      tiLePhanHoiPct: { status: 'available' },
    });
    expect(result.byNick[0].tiLeDongYPct).toBeNull();
    expect(result.byNick[0].availability.tiLeDongYPct).toEqual({
      status: 'unavailable', reason: 'no_friendship_attempts_in_period',
    });
  });

  it('preserves a measured zero Automation rate when its denominator exists', async () => {
    mocks.prisma.zaloAccount.findMany.mockResolvedValue([
      { id: 'nick-a', displayName: 'Nick A', phone: null, ownerUserId: 'sale-a', status: 'connected' },
    ]);
    mocks.prisma.friendshipAttempt.groupBy.mockResolvedValue([
      { zaloAccountId: 'nick-a', state: 'sent', _count: { _all: 4 } },
    ]);

    const result = await handlers['/api/v1/reports/automation-summary'](request, reply);

    expect(result.kpis.tiLeDongYPct).toBe(0);
    expect(result.availability.tiLeDongYPct).toEqual({ status: 'available' });
  });

  it('marks Broadcast success rate unavailable when no deliveries were attempted', async () => {
    mocks.prisma.broadcastJob.findMany.mockResolvedValue([
      { id: 'job-a', name: 'Job A', status: 'active', customerListId: 'list-a', zaloAccountId: 'nick-a' },
    ]);
    mocks.prisma.broadcastRun.findMany.mockResolvedValue([
      { id: 'run-a', jobId: 'job-a', status: 'done', startedAt: new Date(), endedAt: new Date(), sentCount: 0, failedCount: 0, skippedCount: 0 },
    ]);
    mocks.prisma.customerList.findMany.mockResolvedValue([{ id: 'list-a', name: 'List A' }]);
    mocks.prisma.zaloAccount.findMany.mockResolvedValue([{ id: 'nick-a', displayName: 'Nick A', phone: null }]);

    const result = await handlers['/api/v1/reports/broadcast'](request, reply);

    expect(result.kpis.successRatePct).toBeNull();
    expect(result.availability.successRatePct).toEqual({
      status: 'unavailable', reason: 'no_broadcast_delivery_attempts_in_period',
    });
    expect(result.byNick[0].successRatePct).toBeNull();
    expect(result.byList[0].availability.successRatePct.status).toBe('unavailable');
  });

  it('preserves a measured zero Broadcast success rate when attempts failed', async () => {
    mocks.prisma.broadcastJob.findMany.mockResolvedValue([
      { id: 'job-a', name: 'Job A', status: 'active', customerListId: null, zaloAccountId: 'nick-a' },
    ]);
    mocks.prisma.broadcastRun.findMany.mockResolvedValue([
      { id: 'run-a', jobId: 'job-a', status: 'done', startedAt: new Date(), endedAt: new Date(), sentCount: 0, failedCount: 4, skippedCount: 0 },
    ]);

    const result = await handlers['/api/v1/reports/broadcast'](request, reply);

    expect(result.kpis.successRatePct).toBe(0);
    expect(result.availability.successRatePct).toEqual({ status: 'available' });
  });
});
