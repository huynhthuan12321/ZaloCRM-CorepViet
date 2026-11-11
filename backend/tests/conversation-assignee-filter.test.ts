import Fastify, { type FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  actor: { id: 'sale-a', orgId: 'org-a', role: 'member' },
  list: vi.fn(), count: vi.fn(), scope: vi.fn(),
}));
vi.mock('../src/shared/database/prisma-client.js', () => ({ prisma: {
  conversation: { findMany: h.list, count: h.count },
} }));
vi.mock('../src/modules/auth/auth-middleware.js', () => ({
  authMiddleware: async (req: any) => { req.user = { ...h.actor }; },
}));
vi.mock('../src/modules/rbac/rbac-middleware.js', () => ({ requireGrant: () => async () => {} }));
vi.mock('../src/modules/zalo/zalo-scope.js', () => ({
  getZaloScope: h.scope, DISPLAYABLE_NICK_WHERE: { archivedAt: null },
}));
vi.mock('../src/modules/privacy/redact.js', () => ({
  buildPrivacyContext: async () => ({}), redactConversationRow: (row: any) => row,
  redactMessage: (row: any) => row,
}));
const { chatRoutes } = await import('../src/modules/chat/chat-routes.js');
const fixture = [
  { id: 'free-a', orgId: 'org-a', zaloAccountId: 'nick-a', contact: { assignedUserId: null } },
  { id: 'assigned-a', orgId: 'org-a', zaloAccountId: 'nick-a', contact: { assignedUserId: 'sale-a' } },
  { id: 'free-b', orgId: 'org-a', zaloAccountId: 'nick-b', contact: { assignedUserId: null } },
  { id: 'assigned-b', orgId: 'org-a', zaloAccountId: 'nick-b', contact: { assignedUserId: 'sale-b' } },
  { id: 'foreign', orgId: 'org-b', zaloAccountId: 'nick-c', contact: { assignedUserId: null } },
].map(row => ({ ...row, pins: [], messages: [], deletedAt: null, zaloAccount: { archivedAt: null } }));
function matches(where: any) {
  return fixture.filter(row => row.orgId === where.orgId
    && (!where.zaloAccountId || (typeof where.zaloAccountId === 'string'
      ? row.zaloAccountId === where.zaloAccountId : where.zaloAccountId.in.includes(row.zaloAccountId)))
    && (!where.contact || !Object.hasOwn(where.contact, 'assignedUserId')
      || row.contact.assignedUserId === where.contact.assignedUserId));
}
let app: FastifyInstance;
beforeEach(async () => {
  vi.clearAllMocks(); h.actor.role = 'member';
  h.scope.mockImplementation(async () => ({ displayableIds: ['nick-a'], isOrgAdmin: h.actor.role === 'admin' }));
  h.list.mockImplementation(async ({ where }) => matches(where));
  h.count.mockImplementation(async ({ where }) => matches(where).length);
  app = Fastify(); await app.register(chatRoutes);
});
afterEach(async () => { await app.close(); });

describe('GET /conversations employee filter preserves nick and organization scope', () => {
  it.each([
    ['unassigned', 'unassigned', ['free-a']],
    ['accessible user ID', 'sale-a', ['assigned-a']],
    ['user ID outside nick scope', 'sale-b', []],
    ['omitted', undefined, ['free-a', 'assigned-a']],
  ] as const)('%s', async (_label, assignedUserId, ids) => {
    const query = new URLSearchParams({ accountIds: 'nick-a,nick-b' });
    if (assignedUserId) query.set('assignedUserId', assignedUserId);
    const response = await app.inject('/api/v1/conversations?' + query);
    expect(response.statusCode).toBe(200);
    expect(response.json().conversations.map((c: any) => c.id)).toEqual(ids);
    expect(response.json().total).toBe(ids.length);
    const where = h.list.mock.calls[0][0].where;
    expect(where.orgId).toBe('org-a'); expect(where.deletedAt).toBeNull();
    expect(where.zaloAccount).toEqual({ archivedAt: null });
    expect(where.zaloAccountId).toBe('nick-a');
    expect(h.count.mock.calls[0][0].where).toEqual(where);
    if (assignedUserId === 'unassigned') expect(where.contact.assignedUserId).toBeNull();
    else if (assignedUserId) expect(where.contact.assignedUserId).toBe(assignedUserId);
    else expect(where.contact).toBeUndefined();
    expect(h.scope).toHaveBeenCalledWith('sale-a', 'org-a', 'member');
  });
  it('admin sees unassigned contacts throughout own org, never another org', async () => {
    h.actor.role = 'admin';
    const response = await app.inject('/api/v1/conversations?assignedUserId=unassigned');
    expect(response.statusCode).toBe(200);
    expect(response.json().conversations.map((c: any) => c.id)).toEqual(['free-a', 'free-b']);
    expect(response.json().total).toBe(2);
  });
});
