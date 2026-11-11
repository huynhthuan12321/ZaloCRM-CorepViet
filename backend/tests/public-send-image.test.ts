/**
 * public-send-image.test.ts — POST /api/public/messages/send-image.
 * Cover: gửi bằng threadId; gửi bằng phone (resolve Friend); nick chưa kết nối → 422;
 * phone không có Friend → 404; nhiều ảnh (caption chỉ ảnh đầu); ảnh lỗi tải → không nuốt lỗi.
 * Mock ở biên zaloOps.sendImage + downloadMediaToTemp (giống các route test khác).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';

const sendImage = vi.fn();
const downloadMediaToTemp = vi.fn();
const cleanup = vi.fn().mockResolvedValue(undefined);

const prismaMock: any = {
  appSetting: { findFirst: vi.fn() },
  zaloAccount: { findFirst: vi.fn() },
  friend: { findFirst: vi.fn(), findMany: vi.fn() },
  contact: { findFirst: vi.fn() },
};

class ZaloOpError extends Error {
  code: string;
  constructor(message: string, code: string) { super(message); this.code = code; }
}

vi.mock('../src/shared/database/prisma-client.js', () => ({ prisma: prismaMock }));
vi.mock('../src/shared/zalo-operations.js', () => ({ zaloOps: { sendImage }, ZaloOpError }));
vi.mock('../src/modules/chat/chat-media-helpers.js', () => ({ downloadMediaToTemp }));

const { publicApiRoutes } = await import('../src/modules/api/public-api-routes.js');

const HEADERS = { 'x-api-key': 'zcrm_testkey', 'content-type': 'application/json' };

async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify();
  await app.register(publicApiRoutes);
  return app;
}

function post(app: FastifyInstance, payload: Record<string, unknown>) {
  return app.inject({ method: 'POST', url: '/api/public/messages/send-image', headers: HEADERS, payload });
}

beforeEach(() => {
  vi.clearAllMocks();
  // Auth pass → orgId = org-1
  prismaMock.appSetting.findFirst.mockResolvedValue({ id: 's1', orgId: 'org-1' });
  // Nick mặc định: thuộc org, đã kết nối
  prismaMock.zaloAccount.findFirst.mockResolvedValue({ id: 'za-1', status: 'connected', archivedAt: null });
  downloadMediaToTemp.mockResolvedValue({ path: '/tmp/zalocrm/x.jpg', cleanup });
  sendImage.mockResolvedValue({ msgId: 'm1' });
});

describe('POST /messages/send-image', () => {
  it('gửi bằng threadId → 200, sendImage nhận đúng threadId + caption ở ảnh đầu', async () => {
    const app = await buildApp();
    const res = await post(app, { zaloAccountId: 'za-1', threadId: 'uid-thread', imageUrl: 'http://x/y.jpg', caption: 'Cảm ơn anh/chị' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ success: true, sent: 1, threadId: 'uid-thread' });
    expect(sendImage).toHaveBeenCalledTimes(1);
    expect(sendImage).toHaveBeenCalledWith('za-1', 'uid-thread', 0, ['/tmp/zalocrm/x.jpg'], null, 'Cảm ơn anh/chị');
    expect(cleanup).toHaveBeenCalledTimes(1);
    await app.close();
  });

  it('gửi bằng phone → resolve Friend accepted của nick → dùng zaloUidInNick', async () => {
    prismaMock.friend.findFirst.mockResolvedValue({ zaloUidInNick: 'uid-friend' });
    const app = await buildApp();
    const res = await post(app, { zaloAccountId: 'za-1', phone: '0901234567', imageUrl: 'http://x/y.jpg' });
    expect(res.statusCode).toBe(200);
    expect(res.json().threadId).toBe('uid-friend');
    expect(sendImage).toHaveBeenCalledWith('za-1', 'uid-friend', 0, ['/tmp/zalocrm/x.jpg'], null, '');
    // Friend tra theo đúng nick + accepted + phone chuẩn hoá
    expect(prismaMock.friend.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        orgId: 'org-1', zaloAccountId: 'za-1', friendshipStatus: 'accepted',
        contact: { phoneNormalized: '84901234567' },
      }),
    }));
    await app.close();
  });

  it('nick chưa kết nối → 422, không gọi sendImage', async () => {
    prismaMock.zaloAccount.findFirst.mockResolvedValue({ id: 'za-1', status: 'disconnected', archivedAt: null });
    const app = await buildApp();
    const res = await post(app, { zaloAccountId: 'za-1', threadId: 'uid-thread', imageUrl: 'http://x/y.jpg' });
    expect(res.statusCode).toBe(422);
    expect(sendImage).not.toHaveBeenCalled();
    await app.close();
  });

  it('phone không có Friend → 404 friend_not_found', async () => {
    prismaMock.friend.findFirst.mockResolvedValue(null);
    const app = await buildApp();
    const res = await post(app, { zaloAccountId: 'za-1', phone: '0901234567', imageUrl: 'http://x/y.jpg' });
    expect(res.statusCode).toBe(404);
    expect(res.json().error).toBe('friend_not_found');
    expect(sendImage).not.toHaveBeenCalled();
    await app.close();
  });

  it('nhiều ảnh → sent=2, sendImage gọi 2 lần, caption chỉ ở ảnh đầu, cleanup mỗi ảnh', async () => {
    const app = await buildApp();
    const res = await post(app, { zaloAccountId: 'za-1', threadId: 'uid-thread', imageUrls: ['http://x/1.jpg', 'http://x/2.jpg'], caption: 'Đơn 2 trang' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ success: true, sent: 2, threadId: 'uid-thread' });
    expect(sendImage).toHaveBeenCalledTimes(2);
    expect(sendImage).toHaveBeenNthCalledWith(1, 'za-1', 'uid-thread', 0, ['/tmp/zalocrm/x.jpg'], null, 'Đơn 2 trang');
    expect(sendImage).toHaveBeenNthCalledWith(2, 'za-1', 'uid-thread', 0, ['/tmp/zalocrm/x.jpg'], null, '');
    expect(cleanup).toHaveBeenCalledTimes(2);
    await app.close();
  });

  it('ảnh lỗi tải (1 ảnh duy nhất) → KHÔNG nuốt lỗi: 500 + chi tiết ảnh lỗi, sent=0', async () => {
    downloadMediaToTemp.mockRejectedValueOnce(new Error('HTTP 404'));
    const app = await buildApp();
    const res = await post(app, { zaloAccountId: 'za-1', threadId: 'uid-thread', imageUrl: 'http://x/broken.jpg' });
    expect(res.statusCode).toBe(500);
    const b = res.json();
    expect(b.error).toBe('send_image_failed');
    expect(b.sent).toBe(0);
    expect(b.failed).toEqual([{ index: 0, error: 'HTTP 404' }]);
    expect(sendImage).not.toHaveBeenCalled();
    await app.close();
  });

  it('nhiều ảnh, 1 ảnh lỗi tải → 207 partial, sent=1, failed liệt kê ảnh lỗi', async () => {
    downloadMediaToTemp
      .mockResolvedValueOnce({ path: '/tmp/zalocrm/1.jpg', cleanup })
      .mockRejectedValueOnce(new Error('empty response'));
    const app = await buildApp();
    const res = await post(app, { zaloAccountId: 'za-1', threadId: 'uid-thread', imageUrls: ['http://x/1.jpg', 'http://x/2.jpg'] });
    expect(res.statusCode).toBe(207);
    const b = res.json();
    expect(b.sent).toBe(1);
    expect(b.failed).toEqual([{ index: 1, error: 'empty response' }]);
    expect(sendImage).toHaveBeenCalledTimes(1);
    await app.close();
  });

  it('RATE_LIMITED từ zaloOps → 429', async () => {
    sendImage.mockRejectedValueOnce(new ZaloOpError('rate', 'RATE_LIMITED'));
    const app = await buildApp();
    const res = await post(app, { zaloAccountId: 'za-1', threadId: 'uid-thread', imageUrl: 'http://x/y.jpg' });
    expect(res.statusCode).toBe(429);
    expect(res.json().error).toBe('rate_limited');
    await app.close();
  });

  it('thiếu ảnh → 400', async () => {
    const app = await buildApp();
    const res = await post(app, { zaloAccountId: 'za-1', threadId: 'uid-thread' });
    expect(res.statusCode).toBe(400);
    await app.close();
  });
});
