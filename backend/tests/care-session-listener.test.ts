/**
 * care-session-listener.test.ts — Listener event bus (Community, Phase 4).
 * Kiểm chứng: customer_reply → pause/close phiên (idempotent qua CareSessionEvent);
 * friendship_accepted → enroll bám đuổi từ TargetJob.followupSequenceId (có dedupe).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const prismaMock = {
  careSession: { findMany: vi.fn(), findFirst: vi.fn(), updateMany: vi.fn(), create: vi.fn() },
  careSessionEvent: { create: vi.fn() },
  targetRunItem: { findMany: vi.fn() },
  targetJob: { findMany: vi.fn(), update: vi.fn() },
  automationSequence: { findFirst: vi.fn(), update: vi.fn() },
  zaloAccount: { findUnique: vi.fn() },
  $transaction: vi.fn().mockResolvedValue([]),
};

vi.mock('../src/shared/database/prisma-client.js', () => ({ prisma: prismaMock }));
vi.mock('../src/shared/tenant/tenant-context.js', () => ({
  withTenant: (_org: string, fn: any) => fn(),
}));

const { startCareSessionListener } = await import('../src/modules/automation/care-session-listener.js');
const { automationEventBus } = await import('../src/shared/ee-registry/event-bus.js');

let unsubscribe: () => void;

beforeEach(() => {
  vi.clearAllMocks();
  prismaMock.careSession.updateMany.mockResolvedValue({ count: 1 });
  prismaMock.careSessionEvent.create.mockResolvedValue({});
  prismaMock.$transaction.mockResolvedValue([]);
  unsubscribe = startCareSessionListener();
});

afterEach(() => {
  unsubscribe();
});

/** Handler chạy async fire-and-forget sau emit — chờ hết microtask queue. */
async function flush(): Promise<void> {
  for (let i = 0; i < 10; i++) await new Promise((r) => setImmediate(r));
}

describe('customer_reply → pause/stop phiên', () => {
  const replyEvent = {
    type: 'customer_reply', orgId: 'org-1', occurredAt: new Date(), contactId: 'contact-1',
    payload: { nickId: 'nick-1', externalThreadId: 'uid-1', conversationId: 'conv-1', messageId: 'msg-1' },
  };

  it('rule mặc định → pause 24h + ghi lastReplyAt + pausedAtStepIdx', async () => {
    prismaMock.careSession.findMany.mockResolvedValue([
      { id: 'cs-1', currentStepIdx: 1, rulesSnapshot: {}, pauseEpoch: null, enrollEpoch: 1 },
    ]);

    automationEventBus.emit(replyEvent as any);
    await flush();

    expect(prismaMock.careSessionEvent.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ eventType: 'reply', eventId: 'nick-1:contact-1:reply:msg-1' }),
    }));
    const call = prismaMock.careSession.updateMany.mock.calls[0][0];
    expect(call.data.lastReplyAt).toBeInstanceOf(Date);
    expect(call.data.pausedAtStepIdx).toBe(1);
    const pauseMs = (call.data.pausedUntil as Date).getTime() - Date.now();
    expect(pauseMs).toBeGreaterThan(23 * 60 * 60 * 1000);
    expect(pauseMs).toBeLessThan(25 * 60 * 60 * 1000);
    expect(call.data.state).toBeUndefined(); // pause, không đóng
  });

  it('rulesSnapshot.stopOnReply=true → đóng phiên customer_replied', async () => {
    prismaMock.careSession.findMany.mockResolvedValue([
      { id: 'cs-1', currentStepIdx: 0, rulesSnapshot: { stopOnReply: true }, pauseEpoch: null, enrollEpoch: 1 },
    ]);

    automationEventBus.emit(replyEvent as any);
    await flush();

    const call = prismaMock.careSession.updateMany.mock.calls[0][0];
    expect(call.data.state).toBe('closed');
    expect(call.data.closedReason).toBe('customer_replied');
    expect(call.data.nextRunAt).toBeNull();
  });

  it('event trùng (P2002) → idempotent, KHÔNG pause lần 2', async () => {
    prismaMock.careSession.findMany.mockResolvedValue([
      { id: 'cs-1', currentStepIdx: 0, rulesSnapshot: {}, pauseEpoch: null, enrollEpoch: 1 },
    ]);
    prismaMock.careSessionEvent.create.mockRejectedValue(Object.assign(new Error('dup'), { code: 'P2002' }));

    automationEventBus.emit(replyEvent as any);
    await flush();

    expect(prismaMock.careSession.updateMany).not.toHaveBeenCalled();
  });
});

describe('friendship_accepted → enroll bám đuổi từ Mục tiêu', () => {
  const acceptedEvent = {
    type: 'friendship_accepted', orgId: 'org-1', occurredAt: new Date(), contactId: 'contact-1',
    payload: { zaloAccountId: 'nick-1', zaloUidInNick: 'uid-1' },
  };

  beforeEach(() => {
    prismaMock.targetRunItem.findMany.mockResolvedValue([{ jobId: 'job-1' }]);
    prismaMock.targetJob.findMany.mockResolvedValue([
      { id: 'job-1', followupSequenceId: 'seq-1', zaloAccountId: 'nick-1', createdById: 'user-1' },
    ]);
    prismaMock.automationSequence.findFirst.mockResolvedValue({
      id: 'seq-1', runtimeRules: {},
      steps: [{ text: 'buoc 1', delayMinutes: 0 }, { text: 'buoc 2', delayMinutes: 60 }],
    });
    prismaMock.careSession.findFirst.mockResolvedValue(null); // chưa từng enroll
    prismaMock.zaloAccount.findUnique.mockResolvedValue({ ownerUserId: 'owner-1' });
    prismaMock.careSession.create.mockResolvedValue({ id: 'cs-new' });
  });

  it('tạo CareSession target_followup với stepsSnapshot, bước đầu chờ tối thiểu 3 phút', async () => {
    automationEventBus.emit(acceptedEvent as any);
    await flush();

    expect(prismaMock.careSession.create).toHaveBeenCalledTimes(1);
    const data = prismaMock.careSession.create.mock.calls[0][0].data;
    expect(data.sourceType).toBe('target_followup');
    expect(data.sourceSequenceId).toBe('seq-1');
    expect(data.nickId).toBe('nick-1');
    expect(data.externalThreadId).toBe('uid-1');
    expect(data.ownerUserId).toBe('owner-1');
    expect(data.stepsSnapshot).toHaveLength(2);
    const delayMs = (data.nextRunAt as Date).getTime() - Date.now();
    expect(delayMs).toBeGreaterThan(2.5 * 60 * 1000); // nhường tin chào đi trước
    // Đếm followupEnrolledCount + enrolledCount (transaction)
    expect(prismaMock.$transaction).toHaveBeenCalled();
  });

  it('đã enroll trước đó (dedupe) → KHÔNG tạo phiên trùng', async () => {
    prismaMock.careSession.findFirst.mockResolvedValue({ id: 'cs-old' });

    automationEventBus.emit(acceptedEvent as any);
    await flush();

    expect(prismaMock.careSession.create).not.toHaveBeenCalled();
  });

  it('luồng bám đuổi bị tắt/xoá → bỏ qua, không lỗi', async () => {
    prismaMock.automationSequence.findFirst.mockResolvedValue(null);

    automationEventBus.emit(acceptedEvent as any);
    await flush();

    expect(prismaMock.careSession.create).not.toHaveBeenCalled();
  });

  it('job không có followupSequenceId → không enroll', async () => {
    prismaMock.targetJob.findMany.mockResolvedValue([]);

    automationEventBus.emit(acceptedEvent as any);
    await flush();

    expect(prismaMock.careSession.create).not.toHaveBeenCalled();
  });
});
