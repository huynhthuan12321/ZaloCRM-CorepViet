/**
 * care-session-cron.test.ts — Worker gửi bước Luồng kịch bản (Community, Phase 3-4).
 * Kiểm chứng: cron tick gọi processCareSessionStep đúng, nick throttle, send window,
 * hour range, sendGap. Logic step xử lý nằm ở process-care-session-step.test.ts.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const checkLimits = vi.fn();
const sendMessage = vi.fn();
const processStepMock = vi.fn();

const prismaMock = {
  careSession: { findMany: vi.fn(), findFirst: vi.fn(), updateMany: vi.fn(), update: vi.fn() },
  careSessionEvent: { create: vi.fn().mockResolvedValue({}) },
  automationSequence: { findFirst: vi.fn(), updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
  friend: { findFirst: vi.fn() },
  contact: { findFirst: vi.fn() },
};

vi.mock('node-cron', () => ({ default: { schedule: vi.fn() } }));
vi.mock('../src/shared/database/prisma-client.js', () => ({ prisma: prismaMock }));
vi.mock('../src/shared/tenant/tenant-context.js', () => ({
  runSystemQuery: (fn: any) => fn(),
  withTenant: (_org: string, fn: any) => fn(),
}));
vi.mock('../src/modules/zalo/zalo-rate-limiter.js', () => ({ zaloRateLimiter: { checkLimits } }));
vi.mock('../src/modules/broadcast/broadcast-service.js', () => ({
  isWithinSendWindow: () => true,
  renderMessage: (t: string) => t,
}));
vi.mock('../src/shared/zalo-operations.js', () => ({
  zaloOps: { sendMessage },
  ZaloOpError: class ZaloOpError extends Error { code: string; constructor(m: string, c: string) { super(m); this.code = c; } },
}));
vi.mock('../src/modules/automation/process-care-session-step.js', () => ({
  processCareSessionStep: processStepMock,
}));

const { runCareSessionTick } = await import('../src/modules/automation/care-session-cron.js');

// allowedHourRange [0,24] để test không phụ thuộc giờ chạy CI.
const RULES = { allowedHourRange: [0, 24], sendGap: { value: 5, unit: 'minute' } };

function makeSession(over: Record<string, unknown> = {}) {
  return {
    id: 'cs-1', orgId: 'org-1', contactId: 'contact-1', nickId: 'nick-1',
    externalThreadId: 'uid-1', sourceSequenceId: 'seq-1',
    stepsSnapshot: [
      { text: 'buoc 1 xin chao', delayMinutes: 0, styles: [] },
      { text: 'buoc 2 nhac lai', delayMinutes: 120, styles: [] },
    ],
    rulesSnapshot: RULES,
    currentStepIdx: 0, nextRunAt: new Date(Date.now() - 1000), attemptCount: 0,
    enrollEpoch: 1, state: 'active',
    ...over,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  processStepMock.mockResolvedValue({ ok: true, processed: true, touchedZalo: true });
  prismaMock.careSession.findFirst.mockResolvedValue(null); // không có tin gần đây trên nick (sendGap ok)
  prismaMock.automationSequence.findFirst.mockResolvedValue({ enabled: true, steps: [] });
});

describe('care-session-cron: tick gọi service chung', () => {
  it('phiên đến hạn → gọi processCareSessionStep với trigger=scheduled', async () => {
    prismaMock.careSession.findMany.mockResolvedValue([makeSession()]);

    await runCareSessionTick();

    expect(processStepMock).toHaveBeenCalledWith(expect.objectContaining({
      sessionId: 'cs-1',
      orgId: 'org-1',
      trigger: 'scheduled',
    }));
  });

  it('2 phiên cùng nick → chỉ xử lý phiên đầu (giãn nick 1/tick)', async () => {
    const s1 = makeSession({ id: 'cs-1' });
    const s2 = makeSession({ id: 'cs-2' });
    prismaMock.careSession.findMany.mockResolvedValue([s1, s2]);

    await runCareSessionTick();

    expect(processStepMock).toHaveBeenCalledTimes(1);
    expect(processStepMock).toHaveBeenCalledWith(expect.objectContaining({ sessionId: 'cs-1' }));
  });

  it('2 phiên khác nick → xử lý cả 2', async () => {
    const s1 = makeSession({ id: 'cs-1', nickId: 'nick-1' });
    const s2 = makeSession({ id: 'cs-2', nickId: 'nick-2' });
    prismaMock.careSession.findMany.mockResolvedValue([s1, s2]);

    await runCareSessionTick();

    expect(processStepMock).toHaveBeenCalledTimes(2);
  });

  it('sendGap — nick vừa gửi gần đây → bỏ qua', async () => {
    // Mock: có phiên vừa gửi trên nick này
    prismaMock.careSession.findFirst.mockResolvedValue({ id: 'cs-other' });
    prismaMock.careSession.findMany.mockResolvedValue([makeSession()]);

    await runCareSessionTick();

    expect(processStepMock).not.toHaveBeenCalled();
  });

  it('không có phiên đến hạn → không gọi service', async () => {
    prismaMock.careSession.findMany.mockResolvedValue([]);

    await runCareSessionTick();

    expect(processStepMock).not.toHaveBeenCalled();
  });
});
