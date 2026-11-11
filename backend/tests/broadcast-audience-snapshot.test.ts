/**
 * broadcast-audience-snapshot.test.ts — Phase 2 Marketing (2026-07-12).
 * Snapshot audience: run mới phải MATERIALIZE người nhận thành item 'queued' lúc
 * kích hoạt; run có snapshot tiêu thụ hàng đợi (claim queued→sending), KHÔNG live-pick;
 * RATE_LIMITED trả item về 'queued' (không xoá); hết hàng đợi → run done.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const sendMessage = vi.fn().mockResolvedValue({ msgId: 'm1' });
const findUser = vi.fn();

const prismaMock: any = {
  broadcastJob: { findMany: vi.fn(), findUnique: vi.fn(), update: vi.fn() },
  broadcastRun: { findMany: vi.fn(), findFirst: vi.fn(), create: vi.fn(), update: vi.fn() },
  broadcastRunItem: {
    findMany: vi.fn().mockResolvedValue([]), findFirst: vi.fn(),
    create: vi.fn(), createMany: vi.fn(), update: vi.fn(), updateMany: vi.fn(), delete: vi.fn(),
  },
  customerListEntry: { findMany: vi.fn() },
  friend: { findMany: vi.fn(), findFirst: vi.fn() },
  contentBlock: { findMany: vi.fn().mockResolvedValue([]), update: vi.fn() },
  $transaction: vi.fn().mockResolvedValue([]),
};

vi.mock('node-cron', () => ({ default: { schedule: vi.fn() } }));
vi.mock('../src/shared/database/prisma-client.js', () => ({ prisma: prismaMock }));
vi.mock('../src/shared/tenant/tenant-context.js', () => ({
  runSystemQuery: (fn: any) => fn(),
  withTenant: (_org: string, fn: any) => fn(),
}));
vi.mock('../src/shared/zalo-operations.js', () => ({
  zaloOps: { sendMessage, sendImage: vi.fn(), findUser },
  ZaloOpError: class ZaloOpError extends Error { code: string; constructor(m: string, c: string) { super(m); this.code = c; } },
}));
vi.mock('../src/modules/chat/chat-media-helpers.js', () => ({ downloadMediaToTemp: vi.fn() }));
vi.mock('../src/modules/broadcast/broadcast-service.js', () => ({
  isWithinSendWindow: () => true,
  randomDelayMs: () => 0,
  renderMessage: (t: string) => t,
  computeNextRunAt: () => new Date(Date.now() + 86400000),
}));

const { runBroadcastTick } = await import('../src/modules/broadcast/broadcast-cron.js');
const { ZaloOpError } = await import('../src/shared/zalo-operations.js');

const JOB = {
  id: 'job-1', orgId: 'org-1', status: 'active', sourceType: 'customer_list',
  zaloAccountId: 'nick-1', customerListId: 'list-1', messageText: 'hello {{ten}}', imageUrl: null,
  contentBlockIds: [], delaySecMin: 30, delaySecMax: 90, maxPerRun: 50,
  scheduleType: 'daily', scheduledAt: null, timeOfDay: '09:00', daysOfWeek: [],
};
const SNAP_RUN = {
  id: 'run-1', orgId: 'org-1', jobId: 'job-1', lastSentAt: null,
  sentCount: 0, failedCount: 0, skippedCount: 0, audienceSnapshotAt: new Date(),
};

beforeEach(() => {
  vi.clearAllMocks();
  sendMessage.mockResolvedValue({ msgId: 'm1' });
  prismaMock.broadcastJob.findMany.mockResolvedValue([]);
  prismaMock.broadcastRun.findMany.mockResolvedValue([]);
  prismaMock.broadcastJob.findUnique.mockResolvedValue({ ...JOB });
  prismaMock.broadcastRunItem.updateMany.mockResolvedValue({ count: 1 });
  prismaMock.broadcastRunItem.createMany.mockResolvedValue({ count: 0 });
});

describe('kích hoạt job → materialize snapshot audience', () => {
  it('tạo run + chốt item queued từ tệp (hasZalo=true, tối đa maxPerRun) + ghi queuedCount', async () => {
    prismaMock.broadcastJob.findMany.mockResolvedValue([{
      id: JOB.id, orgId: JOB.orgId, scheduleType: 'daily', scheduledAt: null, timeOfDay: '09:00', daysOfWeek: [],
      sourceType: 'customer_list', customerListId: 'list-1', zaloAccountId: 'nick-1', maxPerRun: 50,
    }]);
    prismaMock.broadcastRun.findFirst.mockResolvedValue(null); // chưa có run đang chạy
    prismaMock.broadcastRun.create.mockResolvedValue({ id: 'run-new' });
    prismaMock.customerListEntry.findMany.mockResolvedValue([
      { id: 'e-1', phoneLocal: '0900000001', phoneE164: null, nameRaw: 'A', zaloName: null, zaloUid: 'uid-1', resolvedByNickId: 'nick-1' },
      { id: 'e-2', phoneLocal: '0900000002', phoneE164: null, nameRaw: 'B', zaloName: null, zaloUid: 'uid-x', resolvedByNickId: 'nick-KHAC' },
    ]);
    prismaMock.broadcastRunItem.createMany.mockResolvedValue({ count: 2 });

    await runBroadcastTick(null);

    // Query audience đúng điều kiện: tệp + hasZalo=true + cap maxPerRun
    expect(prismaMock.customerListEntry.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ customerListId: 'list-1', hasZalo: true }),
      take: 50,
    }));
    // Materialize 'queued'; UID chỉ giữ khi resolve bởi ĐÚNG nick gửi
    const created = prismaMock.broadcastRunItem.createMany.mock.calls[0][0];
    expect(created.data).toHaveLength(2);
    expect(created.data[0]).toMatchObject({ runId: 'run-new', entryId: 'e-1', status: 'queued', zaloUid: 'uid-1' });
    expect(created.data[1]).toMatchObject({ entryId: 'e-2', status: 'queued', zaloUid: null });
    // Run được đánh dấu snapshot + đếm hàng đợi
    expect(prismaMock.broadcastRun.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'run-new' },
      data: expect.objectContaining({ queuedCount: 2, audienceSnapshotAt: expect.any(Date) }),
    }));
  });
});

describe('run có snapshot → tiêu thụ hàng đợi queued', () => {
  it('claim queued→sending rồi mới gửi; KHÔNG live-pick, KHÔNG findUser khi UID sẵn', async () => {
    prismaMock.broadcastRun.findMany.mockResolvedValue([{ ...SNAP_RUN }]);
    prismaMock.broadcastRunItem.findFirst.mockResolvedValue({
      id: 'item-1', entryId: 'e-1', phone: '0900000001', name: 'A', zaloUid: 'uid-9',
    });

    await runBroadcastTick(null);

    expect(prismaMock.broadcastRunItem.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'item-1', status: 'queued' },
      data: { status: 'sending' },
    }));
    expect(sendMessage).toHaveBeenCalledWith('nick-1', 'uid-9', 0, { msg: 'hello {{ten}}' }, null);
    expect(findUser).not.toHaveBeenCalled();
    expect(prismaMock.broadcastRunItem.create).not.toHaveBeenCalled(); // không claim kiểu live-pick
    expect(prismaMock.customerListEntry.findMany).not.toHaveBeenCalled(); // KHÔNG đọc lại tệp — snapshot cố định
  });

  it('claim trượt (tick khác lấy rồi) → KHÔNG gửi', async () => {
    prismaMock.broadcastRun.findMany.mockResolvedValue([{ ...SNAP_RUN }]);
    prismaMock.broadcastRunItem.findFirst.mockResolvedValue({ id: 'item-1', entryId: 'e-1', phone: '0900', name: 'A', zaloUid: 'u' });
    prismaMock.broadcastRunItem.updateMany.mockResolvedValue({ count: 0 });

    await runBroadcastTick(null);

    expect(sendMessage).not.toHaveBeenCalled();
  });

  it('RATE_LIMITED → item trả về queued (KHÔNG xoá — giữ nguyên snapshot)', async () => {
    prismaMock.broadcastRun.findMany.mockResolvedValue([{ ...SNAP_RUN }]);
    prismaMock.broadcastRunItem.findFirst.mockResolvedValue({ id: 'item-1', entryId: 'e-1', phone: '0900', name: 'A', zaloUid: 'u' });
    sendMessage.mockRejectedValue(new (ZaloOpError as any)('rate', 'RATE_LIMITED'));

    await runBroadcastTick(null);

    const lastUpdate = prismaMock.broadcastRunItem.updateMany.mock.calls.at(-1)![0];
    expect(lastUpdate.where).toMatchObject({ id: 'item-1', status: 'sending' });
    expect(lastUpdate.data).toMatchObject({ status: 'queued' });
    expect(prismaMock.broadcastRunItem.delete).not.toHaveBeenCalled();
  });

  it('hết hàng đợi → run kết thúc done, không gửi gì', async () => {
    prismaMock.broadcastRun.findMany.mockResolvedValue([{ ...SNAP_RUN }]);
    prismaMock.broadcastRunItem.findFirst.mockResolvedValue(null);

    await runBroadcastTick(null);

    expect(sendMessage).not.toHaveBeenCalled();
    expect(prismaMock.broadcastRun.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'run-1' },
      data: expect.objectContaining({ status: 'done' }),
    }));
  });
});
