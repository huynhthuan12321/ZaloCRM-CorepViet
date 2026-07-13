/**
 * care-session-cron.test.ts — Worker gửi bước Luồng kịch bản (Community, Phase 3-4).
 * Kiểm chứng: gửi đúng bước từ stepsSnapshot, claim trước gửi, đóng phiên khi hết bước,
 * pre-check rate limit fail-closed, RATE_LIMITED dời lịch không đốt attempt,
 * luồng tắt thì phiên tạm ngưng.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const checkLimits = vi.fn();
const sendMessage = vi.fn();

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

const { runCareSessionTick } = await import('../src/modules/automation/care-session-cron.js');
const { ZaloOpError } = await import('../src/shared/zalo-operations.js');

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
    enrollEpoch: 1,
    ...over,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  checkLimits.mockResolvedValue({ allowed: true });
  sendMessage.mockResolvedValue({});
  prismaMock.careSession.findFirst.mockResolvedValue(null); // không có tin gần đây trên nick (sendGap ok)
  prismaMock.careSession.updateMany.mockResolvedValue({ count: 1 }); // claim thắng
  prismaMock.careSession.update.mockResolvedValue({});
  prismaMock.careSessionEvent.create.mockResolvedValue({});
  prismaMock.automationSequence.findFirst.mockResolvedValue({ enabled: true, steps: [] });
  prismaMock.automationSequence.updateMany.mockResolvedValue({ count: 1 });
  prismaMock.contact.findFirst.mockResolvedValue({ crmName: 'Anh A', fullName: null, zaloUsername: null, phone: '0900000001' });
});

describe('care-session-cron: gửi bước từ stepsSnapshot', () => {
  it('phiên đến hạn → claim rồi gửi đúng nội dung bước 1, tiến con trỏ + hẹn bước 2 theo delay', async () => {
    prismaMock.careSession.findMany.mockResolvedValue([makeSession()]);

    await runCareSessionTick();

    // Pre-check rate limit category message, fail-closed
    expect(checkLimits).toHaveBeenCalledWith('nick-1', 'message', { failClosed: true });
    // Claim optimistic khớp con trỏ bước + nextRunAt đã đọc
    expect(prismaMock.careSession.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ id: 'cs-1', state: 'active', currentStepIdx: 0 }),
    }));
    // Gửi đúng UID đã neo + nội dung bước 1 (snapshot, không đọc live)
    expect(sendMessage).toHaveBeenCalledWith('nick-1', 'uid-1', 0, { msg: 'buoc 1 xin chao' });
    // Advance: idx 0 → 1, nextRunAt = +120 phút của bước 2
    const update = prismaMock.careSession.update.mock.calls[0][0];
    expect(update.data.currentStepIdx).toBe(1);
    expect(update.data.state).toBeUndefined(); // chưa đóng
    const gapMs = (update.data.nextRunAt as Date).getTime() - Date.now();
    expect(gapMs).toBeGreaterThan(119 * 60 * 1000);
    expect(gapMs).toBeLessThan(121 * 60 * 1000);
    // Event step_sent ghi log
    expect(prismaMock.careSessionEvent.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ eventType: 'step_sent' }),
    }));
  });

  it('bước cuối gửi xong → đóng phiên completed + tăng completedCount của luồng', async () => {
    prismaMock.careSession.findMany.mockResolvedValue([makeSession({ currentStepIdx: 1 })]);

    await runCareSessionTick();

    expect(sendMessage).toHaveBeenCalledWith('nick-1', 'uid-1', 0, { msg: 'buoc 2 nhac lai' });
    const update = prismaMock.careSession.update.mock.calls[0][0];
    expect(update.data.state).toBe('closed');
    expect(update.data.closedReason).toBe('completed');
    expect(update.data.nextRunAt).toBeNull();
    expect(prismaMock.automationSequence.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      data: { completedCount: { increment: 1 } },
    }));
  });

  it('nick chạm trần (pre-check không cho) → KHÔNG claim, KHÔNG gửi, giữ nguyên phiên', async () => {
    checkLimits.mockResolvedValue({ allowed: false, reason: 'daily cap' });
    prismaMock.careSession.findMany.mockResolvedValue([makeSession()]);

    await runCareSessionTick();

    expect(sendMessage).not.toHaveBeenCalled();
    expect(prismaMock.careSession.updateMany).not.toHaveBeenCalled();
    expect(prismaMock.careSession.update).not.toHaveBeenCalled();
  });

  it('claim trượt (tick khác đã lấy) → KHÔNG gửi', async () => {
    prismaMock.careSession.updateMany.mockResolvedValue({ count: 0 });
    prismaMock.careSession.findMany.mockResolvedValue([makeSession()]);

    await runCareSessionTick();

    expect(sendMessage).not.toHaveBeenCalled();
  });

  it('SDK RATE_LIMITED → dời lịch với lastError, KHÔNG tăng attemptCount, KHÔNG đóng phiên', async () => {
    sendMessage.mockRejectedValue(new (ZaloOpError as any)('rate', 'RATE_LIMITED'));
    prismaMock.careSession.findMany.mockResolvedValue([makeSession()]);

    await runCareSessionTick();

    // updateMany lần 1 = claim; lần 2 = defer với lastError
    const deferCall = prismaMock.careSession.updateMany.mock.calls.at(-1)![0];
    expect(deferCall.data.lastError).toBe('RATE_LIMITED');
    expect(deferCall.data.attemptCount).toBeUndefined();
    expect(deferCall.data.state).toBeUndefined();
    expect(prismaMock.careSession.update).not.toHaveBeenCalled();
  });

  it('luồng bị TẮT (enabled=false) → phiên tạm ngưng, không claim/không gửi', async () => {
    prismaMock.automationSequence.findFirst.mockResolvedValue({ enabled: false, steps: [] });
    prismaMock.careSession.findMany.mockResolvedValue([makeSession()]);

    await runCareSessionTick();

    expect(sendMessage).not.toHaveBeenCalled();
    expect(prismaMock.careSession.updateMany).not.toHaveBeenCalled();
  });

  it('phiên cũ không có stepsSnapshot → dual-read fallback steps live của sequence', async () => {
    prismaMock.automationSequence.findFirst.mockResolvedValue({
      enabled: true,
      steps: [{ text: 'live step', delayMinutes: 0 }],
    });
    prismaMock.careSession.findMany.mockResolvedValue([makeSession({ stepsSnapshot: null })]);

    await runCareSessionTick();

    expect(sendMessage).toHaveBeenCalledWith('nick-1', 'uid-1', 0, { msg: 'live step' });
  });

  it('không có externalThreadId → resolve UID qua Friend đã kết bạn', async () => {
    prismaMock.friend.findFirst.mockResolvedValue({ zaloUidInNick: 'uid-friend' });
    prismaMock.careSession.findMany.mockResolvedValue([makeSession({ externalThreadId: null })]);

    await runCareSessionTick();

    expect(sendMessage).toHaveBeenCalledWith('nick-1', 'uid-friend', 0, { msg: 'buoc 1 xin chao' });
  });
});
