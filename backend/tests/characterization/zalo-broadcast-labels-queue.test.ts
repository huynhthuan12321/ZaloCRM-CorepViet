/**
 * PR-01 — Zalo characterization: BROADCAST + LABELS + WORKER/QUEUE.
 *
 *   - broadcast-service (pure): biến {{ten}}/{{sdt}}, lịch once/daily/weekly giờ VN,
 *     giãn cách ≥5s, khung giờ gửi 8h–21h VN.
 *   - broadcast-audience: lọc Friend theo nhãn Zalo per-nick (AND), chỉ friend accepted.
 *   - zalo-label-queue (BullMQ, deferred): no-Redis fallback, jobId dedup, retry opts.
 *   - group-scan-queue (BullMQ): jobId gs-<scanId>, default job opts, worker concurrency 1.
 * Không mở kết nối Redis thật: bullmq + ioredis được mock.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const h = vi.hoisted(() => {
  const queues: any[] = [];
  const workers: any[] = [];
  class Queue {
    name: string; opts: any; add = vi.fn(async () => ({})); on = vi.fn(); close = vi.fn();
    constructor(name: string, opts: any) { this.name = name; this.opts = opts; queues.push(this); }
  }
  class Worker {
    name: string; processor: any; opts: any; on = vi.fn(); close = vi.fn();
    constructor(name: string, processor: any, opts: any) { this.name = name; this.processor = processor; this.opts = opts; workers.push(this); }
  }
  class Redis {
    url: string; opts: any; on = vi.fn(); disconnect = vi.fn(); quit = vi.fn();
    duplicate = vi.fn(() => new Redis(this.url, this.opts));
    constructor(url: string, opts: any) { this.url = url; this.opts = opts; }
  }
  return {
    queues, workers, Queue, Worker, Redis,
    prisma: { friend: { findMany: vi.fn() }, $queryRaw: vi.fn() },
    processGroupScan: vi.fn(),
    warn: vi.fn(),
  };
});

vi.mock('bullmq', () => ({ Queue: h.Queue, Worker: h.Worker }));
vi.mock('ioredis', () => ({ Redis: h.Redis, default: h.Redis }));
vi.mock('../../src/shared/database/prisma-client.js', () => ({ prisma: h.prisma }));
vi.mock('../../src/shared/utils/logger.js', () => ({
  logger: { info: vi.fn(), warn: h.warn, error: vi.fn(), debug: vi.fn() },
}));
vi.mock('../../src/modules/zalo/group-scan-worker.js', () => ({ processGroupScan: h.processGroupScan }));

const svc = await import('../../src/modules/broadcast/broadcast-service.js');
const audience = await import('../../src/modules/broadcast/broadcast-audience.js');

// Giờ VN = UTC+7
const vn = (y: number, mo: number, d: number, hh: number, mm = 0) => new Date(Date.UTC(y, mo - 1, d, hh - 7, mm));

describe('broadcast — renderMessage', () => {
  it('thay {{ten}}/{{ten_khach}}/{{sdt}}/{{phone}} (không phân biệt hoa thường, cho phép space)', () => {
    expect(svc.renderMessage('Chào {{ ten }} / {{TEN_KHACH}} - {{sdt}} {{phone}}', { name: ' Lan ', phone: '0909' }))
      .toBe('Chào Lan / Lan - 0909 0909');
  });
  it('thiếu tên → "bạn", thiếu SĐT → rỗng', () => {
    expect(svc.renderMessage('Chào {{ten}}{{sdt}}', { name: null, phone: undefined })).toBe('Chào bạn');
  });
});

describe('broadcast — lịch chạy (giờ VN)', () => {
  const after = vn(2026, 9, 16, 10, 0); // Thứ Tư 16/09/2026 10:00 VN

  it('parseTimeOfDay', () => {
    expect(svc.parseTimeOfDay('09:05')).toEqual({ h: 9, m: 5 });
    expect(svc.parseTimeOfDay('24:00')).toBeNull();
    expect(svc.parseTimeOfDay(null)).toBeNull();
  });

  it('once: tương lai → giữ nguyên; quá khứ → null (hết lịch)', () => {
    const future = vn(2026, 9, 17, 8);
    expect(svc.computeNextRunAt({ scheduleType: 'once', scheduledAt: future, after })).toBe(future);
    expect(svc.computeNextRunAt({ scheduleType: 'once', scheduledAt: vn(2026, 9, 1, 8), after })).toBeNull();
  });

  it('daily: giờ đã qua hôm nay → ngày mai; chưa qua → hôm nay', () => {
    expect(svc.computeNextRunAt({ scheduleType: 'daily', timeOfDay: '09:00', after })).toEqual(vn(2026, 9, 17, 9));
    expect(svc.computeNextRunAt({ scheduleType: 'daily', timeOfDay: '15:30', after })).toEqual(vn(2026, 9, 16, 15, 30));
    expect(svc.computeNextRunAt({ scheduleType: 'daily', timeOfDay: 'bad', after })).toBeNull();
  });

  it('weekly: ngày gần nhất trong daysOfWeek (0=CN); rỗng → null', () => {
    // 16/09/2026 là Thứ Tư (3) → Thứ Hai (1) kế tiếp là 21/09
    expect(svc.computeNextRunAt({ scheduleType: 'weekly', timeOfDay: '08:00', daysOfWeek: [1], after })).toEqual(vn(2026, 9, 21, 8));
    expect(svc.computeNextRunAt({ scheduleType: 'weekly', timeOfDay: '08:00', daysOfWeek: [], after })).toBeNull();
  });

  it('randomDelayMs clamp ≥5s và nằm trong [min,max]', () => {
    for (let i = 0; i < 20; i++) {
      expect(svc.randomDelayMs(0, 1)).toBe(5000);
      const d = svc.randomDelayMs(30, 10);
      expect(d).toBeGreaterThanOrEqual(10_000);
      expect(d).toBeLessThanOrEqual(30_000);
    }
  });

  it('isWithinSendWindow: [8h, 21h) giờ VN', () => {
    expect(svc.isWithinSendWindow(vn(2026, 9, 16, 7, 59))).toBe(false);
    expect(svc.isWithinSendWindow(vn(2026, 9, 16, 8, 0))).toBe(true);
    expect(svc.isWithinSendWindow(vn(2026, 9, 16, 20, 59))).toBe(true);
    expect(svc.isWithinSendWindow(vn(2026, 9, 16, 21, 0))).toBe(false);
  });
});

describe('broadcast — audience theo nhãn Zalo (labels)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('normalizeFriendLabels: trim, bỏ rỗng, khử trùng; không phải mảng → []', () => {
    expect(audience.normalizeFriendLabels([' VIP ', 'VIP', '', 'Mới'])).toEqual(['VIP', 'Mới']);
    expect(audience.normalizeFriendLabels('VIP')).toEqual([]);
  });

  it('không nhãn → friend.findMany accepted của nick, cũ trước', async () => {
    h.prisma.friend.findMany.mockResolvedValue([]);
    await audience.findFriendsByLabels('za-1', [], 50);
    expect(h.prisma.friend.findMany).toHaveBeenCalledWith({
      where: { zaloAccountId: 'za-1', friendshipStatus: 'accepted' },
      orderBy: { becameFriendAt: 'asc' },
      take: 50,
      select: { id: true, zaloUidInNick: true, zaloDisplayName: true },
    });
    expect(h.prisma.$queryRaw).not.toHaveBeenCalled();
  });

  it('có nhãn → $queryRaw tham số hoá (nick, nhãn, số nhãn AND, limit), không nối chuỗi', async () => {
    h.prisma.$queryRaw.mockResolvedValue([{ id: 'f-1' }]);
    const r = await audience.findFriendsByLabels('za-1', ['VIP', 'Mới'], 20);
    expect(r).toEqual([{ id: 'f-1' }]);
    const sql = h.prisma.$queryRaw.mock.calls[0][0];
    expect(sql.values).toEqual(['za-1', 'VIP', 'Mới', 2, 20]);
    expect(sql.sql).toContain("friendship_status = 'accepted'");
    expect(sql.sql).not.toContain('VIP');
  });
});

describe('queue — zalo-label-queue (deferred, chưa wire)', () => {
  const saved = process.env.REDIS_URL;
  afterEach(async () => {
    const q = await import('../../src/modules/tags/zalo-label-queue.js');
    await q.stopZaloLabelQueue();
    if (saved === undefined) delete process.env.REDIS_URL; else process.env.REDIS_URL = saved;
    h.queues.length = 0;
    h.workers.length = 0;
  });

  it('không có REDIS_URL → queue null, enqueue bỏ qua kèm warning, worker không start', async () => {
    delete process.env.REDIS_URL;
    const q = await import('../../src/modules/tags/zalo-label-queue.js');
    expect(q.getZaloLabelQueue()).toBeNull();
    await expect(q.enqueueZaloLabelMutate({ zaloAccountId: 'za-1', op: 'assign', labelId: 3, threadId: 'uid' })).resolves.toBeUndefined();
    expect(q.startZaloLabelWorker(vi.fn())).toBeNull();
    expect(h.queues).toHaveLength(0);
    expect(h.warn).toHaveBeenCalled();
  });

  it('có Redis → jobId dedup `${nick}:${label}:${thread}`, attempts 3, backoff exp 1s; worker concurrency 4', async () => {
    process.env.REDIS_URL = 'redis://fake:6379';
    const q = await import('../../src/modules/tags/zalo-label-queue.js');
    const payload = { zaloAccountId: 'za-1', op: 'assign' as const, labelId: 3, threadId: 'uid-kh' };
    await q.enqueueZaloLabelMutate(payload);
    expect(h.queues[0].name).toBe('zalo-label-mutate');
    expect(h.queues[0].add).toHaveBeenCalledWith('mutate', payload, {
      jobId: 'za-1:3:uid-kh',
      removeOnComplete: { count: 100 },
      removeOnFail: { count: 50 },
      attempts: 3,
      backoff: { type: 'exponential', delay: 1000 },
    });
    q.startZaloLabelWorker(vi.fn());
    expect(h.workers[0].opts.concurrency).toBe(4);
  });
});

describe('queue — group-scan-queue', () => {
  it('enqueue jobId gs-<scanId> + default opts; worker connection riêng, concurrency 1, gọi processGroupScan', async () => {
    const g = await import('../../src/modules/zalo/group-scan-queue.js');
    await g.enqueueGroupScan('scan-9');
    const queue = h.queues.find((q) => q.name === 'group-scan');
    expect(queue.opts.defaultJobOptions).toEqual({
      removeOnComplete: { age: 86400, count: 1000 },
      removeOnFail: { age: 604800 },
      attempts: 3,
      backoff: { type: 'exponential', delay: 10_000 },
    });
    expect(queue.opts.connection.opts).toMatchObject({ maxRetriesPerRequest: null, enableReadyCheck: false });
    expect(queue.add).toHaveBeenCalledWith('scan-groups', { scanId: 'scan-9' }, { jobId: 'gs-scan-9' });

    const w = g.startGroupScanWorker();
    expect(w).toBe(h.workers.find((x) => x.name === 'group-scan'));
    expect((w as any).opts.concurrency).toBe(1);
    expect((w as any).opts.connection).not.toBe(queue.opts.connection);
    await (w as any).processor({ data: { scanId: 'scan-9' } });
    expect(h.processGroupScan).toHaveBeenCalledWith('scan-9');
    await g.stopGroupScanWorker();
  });
});
