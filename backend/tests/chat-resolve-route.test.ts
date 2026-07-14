/**
 * chat-resolve-route.test.ts — POST /api/v1/conversations/resolve
 * Deep-link "mở chat" theo contactId (fix/chat-contact-deeplink 2026-07-14).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import Fastify, { FastifyInstance } from 'fastify';
import { mockUser, mockIO } from './test-helpers.js';

// Local prisma mock (test-helpers.mockPrisma thiếu model friend).
const prismaMock = {
  contact: { findFirst: vi.fn() },
  conversation: { findMany: vi.fn(), findFirst: vi.fn(), create: vi.fn() },
  friend: { findMany: vi.fn(), findFirst: vi.fn() },
};

const getZaloScopeMock = vi.fn();

vi.mock('../src/shared/database/prisma-client.js', () => ({ prisma: prismaMock }));
vi.mock('../src/modules/auth/auth-middleware.js', () => ({
  authMiddleware: async (req: any) => { req.user = mockUser(); },
}));
vi.mock('../src/modules/rbac/rbac-middleware.js', () => ({
  requireGrant: () => async () => {},
  requireAnyGrant: () => async () => {},
}));
vi.mock('../src/modules/zalo/zalo-scope.js', () => ({
  getZaloScope: (...args: unknown[]) => getZaloScopeMock(...args),
  DISPLAYABLE_NICK_WHERE: {},
}));
vi.mock('../src/modules/zalo/zalo-access-middleware.js', () => ({
  requireZaloAccess: () => async () => {},
}));

const { chatRoutes } = await import('../src/modules/chat/chat-routes.js');

function buildApp(): FastifyInstance {
  const app = Fastify({ logger: false });
  app.decorate('io', mockIO());
  app.register(chatRoutes);
  return app;
}

const ORG_ADMIN_SCOPE = { displayableIds: [], accessibleIds: [], isOrgAdmin: true, ownedIds: new Set() };

beforeEach(() => {
  vi.clearAllMocks();
  getZaloScopeMock.mockResolvedValue(ORG_ADMIN_SCOPE);
  prismaMock.contact.findFirst.mockResolvedValue({ id: 'contact-1' });
  prismaMock.conversation.findMany.mockResolvedValue([]);
  prismaMock.friend.findMany.mockResolvedValue([]);
});

async function resolve(app: FastifyInstance, body: unknown) {
  return app.inject({ method: 'POST', url: '/api/v1/conversations/resolve', payload: body as any });
}

describe('POST /api/v1/conversations/resolve', () => {
  it('org khác (contact không thuộc org) → 404', async () => {
    prismaMock.contact.findFirst.mockResolvedValue(null);
    const app = buildApp();
    const res = await resolve(app, { contactId: 'other-org-contact' });
    expect(res.statusCode).toBe(404);
    // KHÔNG chạm conversation/friend khi contact ngoài org.
    expect(prismaMock.conversation.findMany).not.toHaveBeenCalled();
  });

  it('thiếu contactId → 400', async () => {
    const app = buildApp();
    const res = await resolve(app, {});
    expect(res.statusCode).toBe(400);
  });

  it('đã có Conversation → trả convId mới nhất, KHÔNG tạo conv', async () => {
    prismaMock.conversation.findMany.mockResolvedValue([
      { id: 'conv-new', lastMessageAt: '2026-07-10T00:00:00Z' },
      { id: 'conv-old', lastMessageAt: '2026-07-01T00:00:00Z' },
    ]);
    const app = buildApp();
    const res = await resolve(app, { contactId: 'contact-1' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ convId: 'conv-new', created: false });
    expect(prismaMock.conversation.create).not.toHaveBeenCalled();
  });

  it('ca Hà Phạm: đã KB, chưa có conv → tạo conv rỗng (lastMessageAt null), KHÔNG gửi tin', async () => {
    prismaMock.conversation.findMany.mockResolvedValue([]);
    prismaMock.friend.findMany.mockResolvedValue([
      { id: 'f-1', zaloAccountId: 'nick-1', zaloUidInNick: 'uid-1', contactId: 'contact-1', zaloGlobalId: null, lastInteractionAt: null },
    ]);
    // ensureUserConversation: findExistingUserConversation → không thấy → create.
    prismaMock.conversation.findFirst.mockResolvedValue(null);
    prismaMock.friend.findFirst.mockResolvedValue(null);
    prismaMock.conversation.create.mockResolvedValue({ id: 'conv-created' });

    const app = buildApp();
    const res = await resolve(app, { contactId: 'contact-1' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ convId: 'conv-created', created: true });
    // Tạo conv rỗng dry-run-safe.
    expect(prismaMock.conversation.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          zaloAccountId: 'nick-1', externalThreadId: 'uid-1', contactId: 'contact-1',
          threadType: 'user', lastMessageAt: null, unreadCount: 0, isReplied: false,
        }),
      }),
    );
  });

  it('idempotent: đã KB + đã có conv (globalId-aware tìm thấy) → trả conv cũ, KHÔNG tạo mới', async () => {
    // Không có conv "trực tiếp" của contact trong list scope (findMany rỗng) nhưng
    // ensureUserConversation → findExistingUserConversation khớp UID/nick (conversation.findFirst
    // trả row) → dùng lại, created:false. Gọi 2 lần vẫn 1 conv (không tạo 2).
    prismaMock.conversation.findMany.mockResolvedValue([]);
    prismaMock.friend.findMany.mockResolvedValue([
      { id: 'f-1', zaloAccountId: 'nick-1', zaloUidInNick: 'uid-1', contactId: 'contact-1', zaloGlobalId: null, lastInteractionAt: null },
    ]);
    prismaMock.conversation.findFirst.mockResolvedValue({ id: 'conv-existing' });

    const app = buildApp();
    const res1 = await resolve(app, { contactId: 'contact-1' });
    const res2 = await resolve(app, { contactId: 'contact-1' });
    expect(res1.json()).toMatchObject({ convId: 'conv-existing', created: false });
    expect(res2.json()).toMatchObject({ convId: 'conv-existing', created: false });
    expect(prismaMock.conversation.create).not.toHaveBeenCalled();
  });

  it('KH không Zalo / không KB → { none: true }, không tạo conv', async () => {
    prismaMock.conversation.findMany.mockResolvedValue([]);
    prismaMock.friend.findMany.mockResolvedValue([]);
    const app = buildApp();
    const res = await resolve(app, { contactId: 'contact-1' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ none: true });
    expect(prismaMock.conversation.create).not.toHaveBeenCalled();
  });

  it('nick-scope: user thường → friend query giới hạn theo accessibleIds', async () => {
    getZaloScopeMock.mockResolvedValue({
      displayableIds: ['nick-vis'], accessibleIds: ['nick-send'], isOrgAdmin: false, ownedIds: new Set(),
    });
    prismaMock.conversation.findMany.mockResolvedValue([]);
    prismaMock.friend.findMany.mockResolvedValue([]);
    const app = buildApp();
    await resolve(app, { contactId: 'contact-1' });
    expect(prismaMock.friend.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ zaloAccountId: { in: ['nick-send'] } }),
      }),
    );
    expect(prismaMock.conversation.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ zaloAccountId: { in: ['nick-vis'] } }),
      }),
    );
  });
});
