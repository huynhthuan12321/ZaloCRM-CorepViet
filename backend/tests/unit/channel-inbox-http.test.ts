// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Nguyễn Tiến Lộc
import Fastify, { type FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { channelInboxRoutes } from '../../src/modules/channels/channel-inbox-routes.js';
import { unifiedInboxWhere } from '../../src/modules/channels/unified-inbox-query.js';

const h = vi.hoisted(() => ({ user: vi.fn(), accounts: vi.fn(), account: vi.fn(), conversations: vi.fn(), conversation: vi.fn(), count: vi.fn(), messages: vi.fn(), messageCount: vi.fn(), grant: vi.fn() }));
vi.mock('../../src/shared/database/prisma-client.js', () => ({ prisma: {
  user: { findFirst: h.user }, channelAccount: { findMany: h.accounts, findFirst: h.account },
  conversation: { findMany: h.conversations, findFirst: h.conversation, count: h.count },
  message: { findMany: h.messages, count: h.messageCount },
} }));
// Route contract tests: JWT verification is covered by the existing auth/socket suites.
vi.mock('../../src/modules/auth/auth-middleware.js', () => ({ authMiddleware: async (request: any) => {
  request.user = { id: 'user-a', orgId: 'org-a', role: 'owner' };
} }));
vi.mock('../../src/modules/rbac/rbac-middleware.js', () => ({ requireGrant: () => async () => {} }));
vi.mock('../../src/modules/rbac/permission-group-service.js', () => ({ userHasGrant: h.grant }));
vi.mock('../../src/modules/zalo/zalo-scope.js', async importOriginal => ({
  ...await importOriginal<object>(), getZaloScope: async () => ({ displayableIds: ['zalo-a'], isOrgAdmin: false }),
}));
vi.mock('../../src/modules/privacy/redact.js', () => ({
  buildPrivacyContext: async () => ({}), redactConversationRow: (row: any) => ({ ...row, redacted: true }),
  redactMessage: (row: any) => ({ ...row, content: '', redacted: true }),
}));
let app: FastifyInstance;
beforeEach(async () => {
  vi.resetAllMocks(); vi.unstubAllEnvs();
  vi.stubEnv('NODE_ENV', 'test'); vi.stubEnv('CHANNELS_ENABLED', 'true'); vi.stubEnv('MOCK_CHANNEL_ENABLED', 'true');
  h.user.mockResolvedValue({ role: 'member' }); h.grant.mockResolvedValue(true);
  h.accounts.mockResolvedValue([]); h.account.mockResolvedValue(null);
  h.conversations.mockResolvedValue([]); h.count.mockResolvedValue(0); h.conversation.mockResolvedValue(null);
  h.messages.mockResolvedValue([]); h.messageCount.mockResolvedValue(0);
  app = Fastify(); await app.register(channelInboxRoutes);
});
afterEach(async () => { await app.close(); vi.unstubAllEnvs(); });

describe('channel inbox HTTP contract', () => {
  it('OFF metadata does not touch channel tables; inbox is disabled', async () => {
    vi.stubEnv('CHANNELS_ENABLED', 'false');
    const metadata = await app.inject('/api/v1/channel-accounts');
    expect(metadata.json()).toEqual({ available: false, accounts: [] });
    expect((await app.inject('/api/v1/channel-inbox')).statusCode).toBe(503);
    expect(h.accounts).not.toHaveBeenCalled(); expect(h.conversations).not.toHaveBeenCalled();
  });
  it.each(['limit=0', 'page=-1', 'limit=1000', 'channel=unknown', 'channelAccountId=invalid', 'accountId=zalo-a'])('rejects invalid or ambiguous namespace filter %s', async query => {
    expect((await app.inject(`/api/v1/channel-inbox?${query}`)).statusCode).toBe(400);
    expect(h.conversations).not.toHaveBeenCalled();
  });
  it('uses the same scoped search predicate for list/count; unread count only narrows it', async () => {
    const response = await app.inject('/api/v1/channel-inbox?search=hello&unread=true');
    expect(response.statusCode).toBe(200);
    const where = h.conversations.mock.calls[0][0].where;
    expect(where.orgId).toBe('org-a');
    expect(h.count.mock.calls[0][0].where).toEqual(where);
    expect(h.count.mock.calls[1][0].where.AND[0]).toEqual(where);
    const text = JSON.stringify(where);
    expect(text).toContain('zalo-a'); expect(text).toContain('user-a'); expect(text).toContain('MOCK_BROWSER');
    expect(text).toContain('"privacyMode":{"not":"main"}');
  });
  it('404 detail/messages do not query message bodies for unreadable conversations', async () => {
    expect((await app.inject('/api/v1/channel-inbox/not-readable')).statusCode).toBe(404);
    expect((await app.inject('/api/v1/channel-inbox/not-readable/messages')).statusCode).toBe(404);
    expect(h.messages).not.toHaveBeenCalled();
    const where = h.conversation.mock.calls[0][0].where;
    expect(where.orgId).toBe('org-a'); expect(where.zaloAccountId).toBeNull();
    expect(where.channelAccount.orgId).toBe('org-a');
  });
  it('returns channel history in stable time/id order with send disabled and no session fields', async () => {
    h.conversation.mockResolvedValue({ id: 'conv-a', channelAccount: { id: 'account-a', provider: 'MOCK_BROWSER' }, contact: null });
    h.messages.mockResolvedValue([{ id: 'new', content: 'new' }, { id: 'old', content: 'old' }]);
    h.messageCount.mockResolvedValue(2);
    const detail = (await app.inject('/api/v1/channel-inbox/conv-a')).json();
    expect(detail.capabilities).toMatchObject({
      textSend: false,
      imageRead: false,
      imageSend: false,
      canInitiate: false,
      aiAutoSend: false,
      automation: false,
      broadcast: false,
    });
    const history = (await app.inject('/api/v1/channel-inbox/conv-a/messages')).json();
    expect(history.messages.map((row: any) => row.id)).toEqual(['old', 'new']);
    expect(h.messages.mock.calls[0][0].where).toEqual({ orgId: 'org-a', conversationId: 'conv-a' });
    expect(h.messages.mock.calls[0][0].orderBy).toEqual([{ sentAt: 'desc' }, { id: 'desc' }]);
    const select = h.conversation.mock.calls[0][0].include.channelAccount.select;
    expect(select).not.toHaveProperty('session'); expect(select).not.toHaveProperty('grants');
    expect((await app.inject({ method: 'POST', url: '/api/v1/channel-inbox/conv-a/messages', payload: { content: 'test' } })).statusCode).toBe(404);
  });
  it('preserves the Zalo redaction path in the combined inbox', async () => {
    h.conversations.mockResolvedValue([{ id: 'zalo-conv', zaloAccount: { id: 'zalo-a' }, channelAccount: null, messages: [{ content: 'private' }] }]);
    const body = (await app.inject('/api/v1/channel-inbox')).json();
    expect(body.conversations[0].messages[0].content).toBe('');
    expect(body.conversations[0].redacted).toBe(true);
  });
  it('does not reveal grants or mutate when account admin scope is absent', async () => {
    const result = await app.inject({ method: 'PATCH', url: '/api/v1/channel-accounts/unknown/access',
      payload: { userId: '00000000-0000-4000-8000-000000000002', permission: 'admin' } });
    expect(result.statusCode).toBe(404);
  });
});

describe('query authorization composition', () => {
  it('a channel account filter cannot broaden into Zalo or overwrite the grant scope', () => {
    const scope = { orgId: 'org-a', id: { in: ['allowed'] } };
    const where = unifiedInboxWhere({ orgId: 'org-a', zaloIds: ['zalo-a'], channelScope: scope,
      filters: { channelAccountId: 'ungranted', search: 'x' } });
    const authBranches = (where.AND as any[])[0].OR;
    expect(authBranches).toHaveLength(1);
    expect(authBranches[0].channelAccountId).toBe('ungranted');
    expect(authBranches[0].channelAccount.AND[0]).toEqual(scope);
  });
});
