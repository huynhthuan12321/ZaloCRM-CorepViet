/**
 * broadcast-wizard.test.ts — Broadcast Wizard backend (Phase 6 Marketing, 2026-07-13).
 * Kiểm chứng: audience-count breakdown; tạo NHÁP (status=paused, dry-run an toàn);
 * tạo mặc định 'active'; retry chỉ lấy item 'failed'; org-isolation (GET :id org khác → 404).
 * Route test qua Fastify inject + prisma mock (pattern chuẩn repo).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';

const prismaMock: any = {
  broadcastJob: { findMany: vi.fn(), findFirst: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn() },
  broadcastRun: { findFirst: vi.fn(), create: vi.fn() },
  broadcastRunItem: { findMany: vi.fn(), createMany: vi.fn() },
  customerList: { findFirst: vi.fn(), findMany: vi.fn() },
  customerListEntry: { count: vi.fn() },
  zaloAccount: { findFirst: vi.fn(), findMany: vi.fn() },
  contentBlock: { count: vi.fn(), findMany: vi.fn() },
  friend: { count: vi.fn() },
};

let role = 'admin';
vi.mock('../src/shared/database/prisma-client.js', () => ({ prisma: prismaMock }));
vi.mock('../src/shared/utils/logger.js', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
vi.mock('../src/modules/auth/auth-middleware.js', () => ({
  authMiddleware: async (req: any) => { req.user = { id: 'u1', orgId: 'orgA', role }; },
}));
vi.mock('../src/modules/broadcast/broadcast-service.js', () => ({
  computeNextRunAt: () => new Date(Date.now() + 86_400_000),
  parseTimeOfDay: () => ({ h: 8, m: 0 }),
}));
vi.mock('../src/modules/zalo/zalo-rate-limiter.js', () => ({
  zaloRateLimiter: { getDailyCount: vi.fn().mockResolvedValue(10) },
}));
vi.mock('../src/modules/zalo/sdk-limit-service.js', () => ({
  getEffectiveLimit: vi.fn().mockResolvedValue({ daily: 100 }),
}));

const { broadcastRoutes } = await import('../src/modules/broadcast/broadcast-routes.js');

function buildApp(): FastifyInstance {
  const app = Fastify({ logger: false });
  app.register(broadcastRoutes);
  return app;
}

beforeEach(() => {
  vi.clearAllMocks();
  role = 'admin';
});

describe('POST /broadcast-jobs/audience-count — breakdown', () => {
  it('customer_list: willSend=min(hasZalo,maxPerRun) + skip breakdown + quota', async () => {
    prismaMock.zaloAccount.findFirst.mockResolvedValue({ id: 'N1', status: 'connected' });
    prismaMock.customerList.findFirst.mockResolvedValue({ id: 'L1' });
    // total, hasZalo, noZalo, uidReady (Promise.all theo thứ tự)
    prismaMock.customerListEntry.count
      .mockResolvedValueOnce(200).mockResolvedValueOnce(120).mockResolvedValueOnce(50).mockResolvedValueOnce(80);

    const res = await buildApp().inject({
      method: 'POST', url: '/api/v1/broadcast-jobs/audience-count',
      payload: { sourceType: 'customer_list', customerListId: 'L1', zaloAccountId: 'N1', maxPerRun: 50 },
    });
    expect(res.statusCode).toBe(200);
    const b = JSON.parse(res.body);
    expect(b.total).toBe(200);
    expect(b.willSend).toBe(50); // min(120, 50)
    expect(b.breakdown).toMatchObject({ hasZalo: 120, skipNoZalo: 50, skipUnknown: 30, uidReady: 80, needLookup: 40 });
    expect(b.quota).toMatchObject({ usedToday: 10, dailyLimit: 100, remaining: 90, enough: true });
    expect(b.nickOnline).toBe(true);
  });

  it('nick không tồn tại → 400', async () => {
    prismaMock.zaloAccount.findFirst.mockResolvedValue(null);
    const res = await buildApp().inject({
      method: 'POST', url: '/api/v1/broadcast-jobs/audience-count',
      payload: { sourceType: 'customer_list', customerListId: 'L1', zaloAccountId: 'X', maxPerRun: 50 },
    });
    expect(res.statusCode).toBe(400);
  });
});

describe('POST /broadcast-jobs — draft/dry-run (status)', () => {
  const base = {
    name: 'BC', sourceType: 'customer_list', customerListId: 'L1', zaloAccountId: 'N1',
    messageText: 'hi {{ten}}', scheduleType: 'once', scheduledAt: new Date(Date.now() + 3600_000).toISOString(),
  };
  function mockCreateOk() {
    prismaMock.zaloAccount.findFirst.mockResolvedValue({ id: 'N1' });
    prismaMock.contentBlock.count.mockResolvedValue(0);
    prismaMock.customerList.findFirst.mockResolvedValue({ id: 'L1' });
    prismaMock.broadcastJob.create.mockImplementation(({ data }: any) => ({ id: 'J1', status: data.status ?? 'active' }));
  }

  it('status=paused → tạo NHÁP (dry-run an toàn, cron bỏ qua)', async () => {
    mockCreateOk();
    const res = await buildApp().inject({ method: 'POST', url: '/api/v1/broadcast-jobs', payload: { ...base, status: 'paused' } });
    expect(res.statusCode).toBe(201);
    expect(prismaMock.broadcastJob.create.mock.calls[0][0].data.status).toBe('paused');
    expect(JSON.parse(res.body).job.status).toBe('paused');
  });

  it('không truyền status → mặc định active (không set status trong data)', async () => {
    mockCreateOk();
    const res = await buildApp().inject({ method: 'POST', url: '/api/v1/broadcast-jobs', payload: base });
    expect(res.statusCode).toBe(201);
    expect(prismaMock.broadcastJob.create.mock.calls[0][0].data.status).toBeUndefined();
  });

  it('non-admin → 403 (chỉ owner/admin tạo broadcast)', async () => {
    role = 'sale';
    const res = await buildApp().inject({ method: 'POST', url: '/api/v1/broadcast-jobs', payload: base });
    expect(res.statusCode).toBe(403);
  });
});

describe('POST retry-failed — chỉ item failed', () => {
  it('không có item failed → 400 no_failed_items', async () => {
    prismaMock.broadcastJob.findFirst.mockResolvedValue({ id: 'J1', status: 'active' });
    prismaMock.broadcastRun.findFirst.mockResolvedValueOnce({ id: 'R1', status: 'done' }).mockResolvedValueOnce(null);
    prismaMock.broadcastRunItem.findMany.mockResolvedValue([]);
    const res = await buildApp().inject({ method: 'POST', url: '/api/v1/broadcast-jobs/J1/runs/R1/retry-failed' });
    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).error).toBe('no_failed_items');
    // findMany phải lọc status='failed'
    expect(prismaMock.broadcastRunItem.findMany.mock.calls[0][0].where.status).toBe('failed');
  });
});

describe('org-isolation', () => {
  it('GET :id của org khác → 404 (findFirst lọc orgId)', async () => {
    prismaMock.broadcastJob.findFirst.mockResolvedValue(null);
    const res = await buildApp().inject({ method: 'GET', url: '/api/v1/broadcast-jobs/OTHER' });
    expect(res.statusCode).toBe(404);
    expect(prismaMock.broadcastJob.findFirst.mock.calls[0][0].where.orgId).toBe('orgA');
  });
});
