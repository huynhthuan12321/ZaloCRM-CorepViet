/**
 * PR-01 — Zalo characterization: ASSIGNMENT.
 *
 *   - friend-event-handler.applyFriendTransition: kết bạn thành công trên nick →
 *     "first-accepted-wins" gán Contact.assignedUserId = owner nick (chỉ khi đang null)
 *     + ContactAccess collaborator (auto_from_friend) + re-point hội thoại (nick, uid).
 *   - user-routes POST /users/:id/handoff: bàn giao KH/nick/lịch hẹn org-scoped trong 1 tx.
 */
import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest';
import Fastify from 'fastify';

const h = vi.hoisted(() => {
  const tx = {
    friend: { findUnique: vi.fn(), upsert: vi.fn() },
    contact: { update: vi.fn(), updateMany: vi.fn() },
    zaloAccount: { findUnique: vi.fn(), updateMany: vi.fn() },
    contactAccess: { upsert: vi.fn(), findMany: vi.fn(), updateMany: vi.fn() },
    friendshipAttempt: { updateMany: vi.fn() },
    appointment: { updateMany: vi.fn() },
  };
  return {
    tx,
    prisma: {
      conversation: { updateMany: vi.fn() },
      user: { findFirst: vi.fn() },
      activityLog: { create: vi.fn() },
      $transaction: vi.fn(async (fn: any) => fn(tx)),
    },
    user: { id: 'u-admin', orgId: 'org-1', role: 'admin', email: 'a@x' } as any,
  };
});

vi.mock('../../src/shared/database/prisma-client.js', () => ({
  prisma: h.prisma,
  tenantTransaction: async (fn: any) => fn(h.tx),
}));
vi.mock('../../src/shared/utils/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock('../../src/modules/zalo/zalo-pool.js', () => ({ zaloPool: { getInstance: vi.fn() } }));
vi.mock('../../src/modules/contacts/resolve-contact.js', () => ({ resolveOrCreateContact: vi.fn() }));
vi.mock('../../src/shared/ee-registry/automation.js', () => ({ logEvent: vi.fn(), isListeningState: vi.fn() }));
vi.mock('../../src/shared/ee-registry/event-bus.js', () => ({ automationEventBus: { emit: vi.fn() } }));
vi.mock('../../src/modules/system-notifications/internal-contact-handshake-hook.js', () => ({
  onFriendAcceptedForInternalContact: vi.fn(),
}));
vi.mock('../../src/modules/auth/auth-middleware.js', () => ({
  authMiddleware: async (req: any) => { req.user = h.user; },
  requireActiveUser: async () => {},
}));
vi.mock('../../src/modules/rbac/rbac-middleware.js', () => ({ requireGrant: () => async () => {} }));
vi.mock('../../src/modules/system-notifications/system-notify-service.js', () => ({ sendSystemNotificationToUser: vi.fn() }));

const { applyFriendTransition } = await import('../../src/modules/zalo/friend-event-handler.js');
const { userRoutes } = await import('../../src/modules/auth/user-routes.js');

beforeEach(() => {
  vi.clearAllMocks();
  h.user = { id: 'u-admin', orgId: 'org-1', role: 'admin', email: 'a@x' };
  h.tx.friend.findUnique.mockResolvedValue(null);
  h.tx.friend.upsert.mockResolvedValue({});
  h.tx.contact.update.mockResolvedValue({});
  h.tx.contact.updateMany.mockResolvedValue({ count: 1 });
  h.tx.zaloAccount.findUnique.mockResolvedValue({ ownerUserId: 'u-sale' });
  h.tx.contactAccess.upsert.mockResolvedValue({});
  h.prisma.conversation.updateMany.mockResolvedValue({ count: 0 });
});

const args = { orgId: 'org-1', zaloAccountId: 'za-1', contactId: 'c-1', zaloUidInNick: 'uid-kh' };

describe('assignment — kết bạn (first-accepted-wins)', () => {
  it('accepted → gán owner nick chỉ khi Contact.assignedUserId đang null + ContactAccess collaborator', async () => {
    await applyFriendTransition({ ...args, newFriendshipStatus: 'accepted' });
    expect(h.tx.zaloAccount.findUnique).toHaveBeenCalledWith({ where: { id: 'za-1' }, select: { ownerUserId: true } });
    expect(h.tx.contact.updateMany).toHaveBeenCalledWith({
      where: { id: 'c-1', assignedUserId: null },
      data: { assignedUserId: 'u-sale' },
    });
    expect(h.tx.contactAccess.upsert).toHaveBeenCalledWith({
      where: { contactId_userId: { contactId: 'c-1', userId: 'u-sale' } },
      update: {},
      create: { orgId: 'org-1', contactId: 'c-1', userId: 'u-sale', role: 'collaborator', source: 'auto_from_friend' },
    });
    expect(h.tx.contact.update.mock.calls[0][0].data).toEqual({
      acceptedNicksCount: { increment: 1 }, pendingNicksCount: { increment: 0 }, chattingNicksCount: { increment: 0 },
    });
    expect(h.tx.friend.upsert.mock.calls[0][0].create).toMatchObject({
      orgId: 'org-1', contactId: 'c-1', zaloAccountId: 'za-1', zaloUidInNick: 'uid-kh',
      friendshipStatus: 'accepted', relationshipKind: 'friend', becameFriendAt: expect.any(Date),
    });
  });

  it('re-point hội thoại (nick, uid) đang trỏ contact khác về contactId — org-scoped', async () => {
    await applyFriendTransition({ ...args, newFriendshipStatus: 'accepted' });
    expect(h.prisma.conversation.updateMany).toHaveBeenCalledWith({
      where: { orgId: 'org-1', zaloAccountId: 'za-1', externalThreadId: 'uid-kh', threadType: 'user', contactId: { not: 'c-1' } },
      data: { contactId: 'c-1' },
    });
  });

  it('sync (không phải event) → không set becameFriendAt nhưng vẫn gán owner', async () => {
    await applyFriendTransition({ ...args, newFriendshipStatus: 'accepted', source: 'sync' });
    expect(h.tx.friend.upsert.mock.calls[0][0].update.becameFriendAt).toBeUndefined();
    expect(h.tx.contact.updateMany).toHaveBeenCalled();
  });

  it('trạng thái khác accepted (pending_received / removed) → không đụng assignedUserId', async () => {
    await applyFriendTransition({ ...args, newFriendshipStatus: 'pending_received' });
    await applyFriendTransition({ ...args, newFriendshipStatus: 'removed' });
    expect(h.tx.contact.updateMany).not.toHaveBeenCalled();
    expect(h.tx.contactAccess.upsert).not.toHaveBeenCalled();
  });

  it('nick không tìm thấy → không gán', async () => {
    h.tx.zaloAccount.findUnique.mockResolvedValue(null);
    await applyFriendTransition({ ...args, newFriendshipStatus: 'accepted' });
    expect(h.tx.contact.updateMany).not.toHaveBeenCalled();
  });
});

describe('assignment — bàn giao sale (POST /api/v1/users/:id/handoff)', () => {
  function app() {
    const a = Fastify({ logger: false });
    a.register(userRoutes);
    return a;
  }

  // Khởi động plugin/route một lần trước (tránh timeout 5s ở test đầu khi suite chạy song song, cold import)
  beforeAll(async () => {
    const a = app();
    await a.ready();
    await a.close();
  }, 30_000);

  beforeEach(() => {
    h.prisma.user.findFirst.mockImplementation(async ({ where }: any) =>
      where.id === 'u-from' ? { id: 'u-from', fullName: 'Sale A' } : { id: where.id, fullName: 'Sale B', isActive: true });
    h.tx.contact.updateMany.mockResolvedValue({ count: 3 });
    h.tx.zaloAccount.updateMany.mockResolvedValue({ count: 1 });
    h.tx.appointment.updateMany.mockResolvedValue({ count: 2 });
    h.tx.contactAccess.findMany
      .mockResolvedValueOnce([{ contactId: 'c-2' }])                         // người nhận đã có
      .mockResolvedValueOnce([{ id: 'ca-1', contactId: 'c-1' }, { id: 'ca-2', contactId: 'c-2' }]);
    h.tx.contactAccess.updateMany.mockResolvedValue({ count: 1 });
    h.prisma.activityLog.create.mockResolvedValue({});
  });

  it('sale thường → 403', async () => {
    h.user = { id: 'u-sale', orgId: 'org-1', role: 'member' };
    const res = await app().inject({ method: 'POST', url: '/api/v1/users/u-from/handoff', payload: { toUserId: 'u-to' } });
    expect(res.statusCode).toBe(403);
    expect(h.prisma.$transaction).not.toHaveBeenCalled();
  });

  it('thiếu / trùng người nhận → 400', async () => {
    expect((await app().inject({ method: 'POST', url: '/api/v1/users/u-from/handoff', payload: {} })).statusCode).toBe(400);
    expect((await app().inject({ method: 'POST', url: '/api/v1/users/u-from/handoff', payload: { toUserId: 'u-from' } })).statusCode).toBe(400);
  });

  it('người nhận khác org / không tồn tại → 404 (lookup có orgId)', async () => {
    h.prisma.user.findFirst.mockImplementation(async ({ where }: any) => (where.id === 'u-from' ? { id: 'u-from' } : null));
    const res = await app().inject({ method: 'POST', url: '/api/v1/users/u-from/handoff', payload: { toUserId: 'u-other' } });
    expect(res.statusCode).toBe(404);
    for (const c of h.prisma.user.findFirst.mock.calls) expect(c[0].where.orgId).toBe('org-1');
  });

  it('chuyển KH + nick + lịch hẹn org-scoped, bỏ qua ContactAccess người nhận đã có, ghi audit', async () => {
    const res = await app().inject({ method: 'POST', url: '/api/v1/users/u-from/handoff', payload: { toUserId: 'u-to' } });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body)).toEqual({
      success: true, from: 'Sale A', to: 'Sale B', contacts: 3, nicks: 1, appointments: 2, accesses: 1,
    });
    expect(h.tx.contact.updateMany).toHaveBeenCalledWith({
      where: { orgId: 'org-1', assignedUserId: 'u-from' }, data: { assignedUserId: 'u-to' },
    });
    expect(h.tx.zaloAccount.updateMany).toHaveBeenCalledWith({
      where: { orgId: 'org-1', ownerUserId: 'u-from' }, data: { ownerUserId: 'u-to' },
    });
    expect(h.tx.appointment.updateMany).toHaveBeenCalledWith({
      where: { orgId: 'org-1', assignedUserId: 'u-from' }, data: { assignedUserId: 'u-to' },
    });
    expect(h.tx.contactAccess.updateMany).toHaveBeenCalledWith({ where: { id: { in: ['ca-1'] } }, data: { userId: 'u-to' } });
    expect(h.prisma.activityLog.create.mock.calls[0][0].data).toMatchObject({
      orgId: 'org-1', userId: 'u-admin', category: 'admin', action: 'user.handoff', entityId: 'u-from',
    });
  });
});
