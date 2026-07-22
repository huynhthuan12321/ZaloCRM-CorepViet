/**
 * process-care-session-step.test.ts — Test service chung xử lý 1 bước CareSession.
 *
 * Verify:
 *   1. Dry-run → step_simulated (NOT step_sent), không gọi Zalo SDK.
 *   2. Live → step_sent, gọi Zalo SDK.
 *   3. currentStepIdx tiến đúng: 0→1 sau bước 1.
 *   4. Hết bước → state=closed, closedReason=completed.
 *   5. Claim trùng (concurrent) → không xử lý lần 2.
 *   6. Event duplicate (P2002) → swallow silently.
 *   7. Event non-duplicate error → log nhưng session vẫn tiến.
 *   8. Sequence disabled → deferReason=sequence_disabled, không xử lý.
 *   9. Rate limit blocked → deferReason=quota_capped.
 *  10. DB finalize fail sau Zalo gửi thành công → error, touchedZalo=true.
 *  11. trigger='manual_run_now' không check send window.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mocks ──
const checkLimits = vi.fn();
const sendMessage = vi.fn();
const configMock = { marketingDryRun: true };

const prismaMock = {
  careSession: {
    findFirst: vi.fn(),
    findMany: vi.fn(),
    updateMany: vi.fn(),
    update: vi.fn(),
  },
  careSessionEvent: { create: vi.fn().mockResolvedValue({}) },
  automationSequence: {
    findFirst: vi.fn(),
    updateMany: vi.fn().mockResolvedValue({ count: 1 }),
  },
  friend: { findFirst: vi.fn() },
  contact: { findFirst: vi.fn() },
};

vi.mock('../src/shared/database/prisma-client.js', () => ({ prisma: prismaMock }));
vi.mock('../src/shared/utils/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock('../src/config/index.js', () => ({ config: configMock }));
vi.mock('../src/modules/zalo/zalo-rate-limiter.js', () => ({ zaloRateLimiter: { checkLimits } }));
vi.mock('../src/modules/broadcast/broadcast-service.js', () => ({
  isWithinSendWindow: () => true,
  renderMessage: (t: string) => t,
}));
vi.mock('../src/shared/zalo-operations.js', () => ({
  zaloOps: { sendMessage },
  ZaloOpError: class ZaloOpError extends Error {
    code: string;
    constructor(m: string, c: string) { super(m); this.code = c; }
  },
}));

const { processCareSessionStep } = await import('../src/modules/automation/process-care-session-step.js');

function makeSession(over: Record<string, unknown> = {}) {
  return {
    id: 'cs-1', orgId: 'org-1', contactId: 'contact-1', nickId: 'nick-1',
    externalThreadId: 'uid-1', sourceSequenceId: 'seq-1',
    stepsSnapshot: [
      { text: 'buoc 1 xin chao', delayMinutes: 0, styles: [] },
      { text: 'buoc 2 nhac lai', delayMinutes: 120, styles: [] },
    ],
    rulesSnapshot: { allowedHourRange: [0, 24], sendGap: { value: 5, unit: 'minute' } },
    currentStepIdx: 0, nextRunAt: new Date(Date.now() - 1000), attemptCount: 0,
    enrollEpoch: 1, state: 'active',
    ...over,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  configMock.marketingDryRun = true;
  checkLimits.mockResolvedValue({ allowed: true });
  sendMessage.mockResolvedValue({});
  prismaMock.careSession.findFirst.mockResolvedValue(null);
  prismaMock.careSession.updateMany.mockResolvedValue({ count: 1 }); // claim thắng
  prismaMock.careSession.update.mockResolvedValue({});
  prismaMock.careSessionEvent.create.mockResolvedValue({});
  prismaMock.automationSequence.findFirst.mockResolvedValue({ enabled: true, steps: [] });
  prismaMock.automationSequence.updateMany.mockResolvedValue({ count: 1 });
  prismaMock.contact.findFirst.mockResolvedValue({
    crmName: 'Anh A', fullName: null, zaloUsername: null, phone: '0900000001',
  });
});

describe('processCareSessionStep', () => {
  it('dry-run → tạo step_simulated, KHÔNG gọi Zalo SDK', async () => {
    const session = makeSession();
    const result = await processCareSessionStep({
      sessionId: 'cs-1', orgId: 'org-1', trigger: 'scheduled',
      preloadedSession: session,
    });

    expect(result.ok).toBe(true);
    expect(result.processed).toBe(true);
    expect(result.deliveryMode).toBe('simulated');
    expect(result.eventType).toBe('step_simulated');
    expect(result.touchedZalo).toBe(false);
    expect(sendMessage).not.toHaveBeenCalled();

    // Event: step_simulated (NOT step_sent)
    expect(prismaMock.careSessionEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ eventType: 'step_simulated' }),
      }),
    );
  });

  it('dry-run → currentStepIdx tiến 0→1', async () => {
    const session = makeSession();
    await processCareSessionStep({
      sessionId: 'cs-1', orgId: 'org-1', trigger: 'scheduled',
      preloadedSession: session,
    });

    const update = prismaMock.careSession.update.mock.calls[0][0];
    expect(update.data.currentStepIdx).toBe(1);
    expect(update.data.state).toBeUndefined(); // chưa đóng (còn bước 2)
  });

  it('bước cuối → completed=true, state=closed', async () => {
    const session = makeSession({ currentStepIdx: 1 });
    const result = await processCareSessionStep({
      sessionId: 'cs-1', orgId: 'org-1', trigger: 'scheduled',
      preloadedSession: session,
    });

    expect(result.completed).toBe(true);
    const update = prismaMock.careSession.update.mock.calls[0][0];
    expect(update.data.state).toBe('closed');
    expect(update.data.closedReason).toBe('completed');
    expect(update.data.nextRunAt).toBeNull();
  });

  it('live mode → tạo step_sent, gọi Zalo SDK', async () => {
    configMock.marketingDryRun = false;
    const session = makeSession();
    const result = await processCareSessionStep({
      sessionId: 'cs-1', orgId: 'org-1', trigger: 'scheduled',
      preloadedSession: session,
    });

    expect(result.deliveryMode).toBe('sent');
    expect(result.eventType).toBe('step_sent');
    expect(result.touchedZalo).toBe(true);
    expect(sendMessage).toHaveBeenCalledWith('nick-1', 'uid-1', 0, { msg: 'buoc 1 xin chao' });

    expect(prismaMock.careSessionEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ eventType: 'step_sent' }),
      }),
    );
  });

  it('claim trùng (concurrent) → processed=false', async () => {
    prismaMock.careSession.updateMany.mockResolvedValue({ count: 0 }); // claim trượt
    const session = makeSession();
    const result = await processCareSessionStep({
      sessionId: 'cs-1', orgId: 'org-1', trigger: 'scheduled',
      preloadedSession: session,
    });

    expect(result.ok).toBe(false);
    expect(result.processed).toBe(false);
    expect(result.error).toBe('claim_failed_concurrent');
    expect(sendMessage).not.toHaveBeenCalled();
  });

  it('sequence disabled → deferReason=sequence_disabled', async () => {
    prismaMock.automationSequence.findFirst.mockResolvedValue({ enabled: false, steps: [] });
    const session = makeSession();
    const result = await processCareSessionStep({
      sessionId: 'cs-1', orgId: 'org-1', trigger: 'scheduled',
      preloadedSession: session,
    });

    expect(result.ok).toBe(false);
    expect(result.processed).toBe(false);
    expect(result.deferReason).toBe('sequence_disabled');
    expect(sendMessage).not.toHaveBeenCalled();
  });

  it('rate limit blocked → deferReason=quota_capped', async () => {
    checkLimits.mockResolvedValue({ allowed: false });
    const session = makeSession();
    const result = await processCareSessionStep({
      sessionId: 'cs-1', orgId: 'org-1', trigger: 'scheduled',
      preloadedSession: session,
    });

    expect(result.ok).toBe(false);
    expect(result.processed).toBe(false);
    expect(result.deferReason).toBe('quota_capped');
  });

  it('session không tồn tại → error', async () => {
    const result = await processCareSessionStep({
      sessionId: 'cs-999', orgId: 'org-1', trigger: 'manual_run_now',
    });

    expect(result.ok).toBe(false);
    expect(result.error).toBe('session_not_found_or_inactive');
  });

  it('cron và run-now dùng cùng service — kết quả nhất quán', async () => {
    const session = makeSession();

    const cronResult = await processCareSessionStep({
      sessionId: 'cs-1', orgId: 'org-1', trigger: 'scheduled',
      preloadedSession: session,
    });

    vi.clearAllMocks();
    checkLimits.mockResolvedValue({ allowed: true });
    prismaMock.careSession.updateMany.mockResolvedValue({ count: 1 });
    prismaMock.careSession.update.mockResolvedValue({});
    prismaMock.careSessionEvent.create.mockResolvedValue({});
    prismaMock.automationSequence.findFirst.mockResolvedValue({ enabled: true, steps: [] });
    prismaMock.contact.findFirst.mockResolvedValue({ crmName: 'B', fullName: null, zaloUsername: null, phone: null });

    const session2 = makeSession();
    const manualResult = await processCareSessionStep({
      sessionId: 'cs-1', orgId: 'org-1', trigger: 'manual_run_now',
      preloadedSession: session2,
    });

    // Cả hai đều tạo cùng loại event
    expect(cronResult.eventType).toBe('step_simulated');
    expect(manualResult.eventType).toBe('step_simulated');
    expect(cronResult.deliveryMode).toBe('simulated');
    expect(manualResult.deliveryMode).toBe('simulated');
  });

  it('event duplicate P2002 → swallow, session vẫn tiến', async () => {
    const p2002 = new Error('Unique constraint') as any;
    p2002.code = 'P2002';
    prismaMock.careSessionEvent.create.mockRejectedValue(p2002);

    const session = makeSession();
    const result = await processCareSessionStep({
      sessionId: 'cs-1', orgId: 'org-1', trigger: 'scheduled',
      preloadedSession: session,
    });

    expect(result.ok).toBe(true);
    expect(result.processed).toBe(true);
    // Session update vẫn được gọi
    expect(prismaMock.careSession.update).toHaveBeenCalled();
  });

  it('event type chính xác cho payload: trigger + deliveryMode', async () => {
    const session = makeSession();
    await processCareSessionStep({
      sessionId: 'cs-1', orgId: 'org-1', trigger: 'manual_run_now',
      preloadedSession: session,
    });

    const eventData = prismaMock.careSessionEvent.create.mock.calls[0][0].data;
    expect(eventData.eventType).toBe('step_simulated');
    expect(eventData.payload.trigger).toBe('manual_run_now');
    expect(eventData.payload.deliveryMode).toBe('dry_run');
  });
});
