// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Nguyễn Tiến Lộc
import type { Server, Socket } from 'socket.io';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { channelAccountPredicate, hasChannelAccess, channelScope } from '../../src/modules/channels/channel-scope.js';
import { channelRoom, emitAuthorizedChannelEvent, registerChannelSocketHandlers, recheckChannelSubscriptions } from '../../src/modules/channels/channel-socket.js';
import { assertZaloConversation, isZaloConversation } from '../../src/modules/channels/zalo-conversation-guard.js';

const h = vi.hoisted(() => ({ user: vi.fn(), account: vi.fn(), grant: vi.fn() }));
vi.mock('../../src/shared/database/prisma-client.js', () => ({ prisma: {
  user: { findFirst: h.user }, channelAccount: { findFirst: h.account },
} }));
vi.mock('../../src/modules/rbac/permission-group-service.js', () => ({ userHasGrant: h.grant }));
const accountId = '00000000-0000-4000-8000-000000000001';
const actor = { userId: 'user-a', orgId: 'org-a' };
const socket = (orgId = 'org-a', userId = 'user-a') => ({ data: { authCtx: { orgId, userId, role: 'owner' } }, emit: vi.fn(), leave: vi.fn(), join: vi.fn(), on: vi.fn() });
beforeEach(() => {
  vi.unstubAllEnvs(); vi.resetAllMocks();
  vi.stubEnv('NODE_ENV', 'test'); vi.stubEnv('CHANNELS_ENABLED', 'true'); vi.stubEnv('MOCK_CHANNEL_ENABLED', 'true');
  h.user.mockResolvedValue({ role: 'member' }); h.grant.mockResolvedValue(true); h.account.mockResolvedValue({ id: accountId });
});

describe('channel ACL', () => {
  it('owner/admin still need an existing account in the same organization', () => {
    const where = channelAccountPredicate(actor, 'owner', 'admin', ['MOCK_BROWSER']);
    expect(where.orgId).toBe('org-a'); expect(where.enabled).toBe(true);
    expect(where.provider).toEqual({ in: ['MOCK_BROWSER'] });
  });
  it.each([
    ['read', ['read', 'chat', 'admin']], ['chat', ['chat', 'admin']], ['admin', ['admin']],
  ] as const)('requires the appropriate grant for %s', (permission, values) => {
    const where = channelAccountPredicate(actor, 'member', permission, ['MOCK_BROWSER']);
    expect(where.OR).toEqual([
      { ownerUserId: 'user-a' },
      { grants: { some: { orgId: 'org-a', userId: 'user-a', permission: { in: [...values] } } } },
    ]);
  });
  it('uses current DB role and excludes live provider even if all live env flags are requested', async () => {
    vi.stubEnv('TIKTOK_PERSONAL_ENABLED', 'true'); vi.stubEnv('TIKTOK_PERSONAL_OUTBOUND_ENABLED', 'true');
    const where = await channelScope(actor, 'admin');
    expect(where.OR).toBeDefined(); // stale JWT owner is never supplied/trusted here
    expect(where.provider).toEqual({ in: ['MOCK_BROWSER'] });
    await hasChannelAccess(actor, accountId);
    expect(h.account.mock.calls[0][0].where.AND[1]).toEqual({ id: accountId });
  });
  it('disables all new database queries when the feature is off', async () => {
    vi.stubEnv('CHANNELS_ENABLED', 'false');
    expect(await hasChannelAccess(actor, accountId)).toBe(false);
    expect(h.user).not.toHaveBeenCalled(); expect(h.account).not.toHaveBeenCalled();
  });
  it('inactive user or revoked global conversation grant cannot match any provider', async () => {
    h.user.mockResolvedValueOnce(null);
    expect((await channelScope(actor)).provider).toEqual({ in: [] });
    h.grant.mockResolvedValueOnce(false);
    expect((await channelScope(actor)).provider).toEqual({ in: [] });
  });
  it('allows virtual Zalo rows and rejects channel/null or a broken Zalo relation', () => {
    const virtual = { zaloAccountId: 'zalo-a', zaloAccount: { id: 'zalo-a' }, isVirtual: true };
    expect(isZaloConversation(virtual)).toBe(true); expect(() => assertZaloConversation(virtual)).not.toThrow();
    expect(() => assertZaloConversation({ zaloAccountId: null })).toThrow(/only supported for Zalo/);
    expect(isZaloConversation({ zaloAccountId: 'zalo-a', zaloAccount: null })).toBe(false);
  });
});

describe('channel realtime isolation and revocation', () => {
  it('denies invalid, unauthenticated and insufficient-control subscriptions', async () => {
    let connection: (value: Socket) => void = () => {};
    const io = { on: (_name: string, fn: typeof connection) => { connection = fn; } } as unknown as Server;
    registerChannelSocketHandlers(io);
    const s = socket(); connection(s as unknown as Socket);
    const handler = s.on.mock.calls.find(call => call[0] === 'channel:subscribe')![1];
    const ack = vi.fn();
    await handler({ accountId: 'invalid' }, ack); expect(s.join).not.toHaveBeenCalled(); expect(ack).toHaveBeenLastCalledWith({ ok: false });
    h.account.mockResolvedValueOnce(null);
    await handler({ accountId, purpose: 'control' }, ack);
    expect(s.join).not.toHaveBeenCalled(); expect(ack).toHaveBeenLastCalledWith({ ok: false });
    await handler({ accountId, purpose: 'read' }, ack);
    expect(s.join).toHaveBeenCalledWith(channelRoom('org-a', accountId, 'read'));
  });
  it('never sends message/QR to org rooms or cross-org sockets and rechecks stale room members', async () => {
    const allowed = socket(), crossOrg = socket('org-b'), revoked = socket('org-a', 'revoked-user');
    h.account.mockResolvedValueOnce({ id: accountId }).mockResolvedValueOnce(null);
    const room = { fetchSockets: vi.fn().mockResolvedValue([allowed, crossOrg, revoked]) };
    const io = { in: vi.fn().mockReturnValue(room) } as unknown as Server;
    await emitAuthorizedChannelEvent({ io, ...actor, accountId, purpose: 'read', event: 'channel:message', payload: { conversationId: 'conversation-a' } });
    expect(allowed.emit).toHaveBeenCalledOnce(); expect(crossOrg.emit).not.toHaveBeenCalled(); expect(revoked.emit).not.toHaveBeenCalled();
    expect(crossOrg.leave).toHaveBeenCalledOnce(); expect(revoked.leave).toHaveBeenCalledOnce();
    expect(io.in).toHaveBeenCalledWith(channelRoom('org-a', accountId, 'read'));
  });
  it('refuses a QR/connection payload in the read room', async () => {
    const io = { in: vi.fn() } as unknown as Server;
    await expect(emitAuthorizedChannelEvent({ io, orgId: 'org-a', accountId, purpose: 'read', event: 'channel:connection', payload: { qr: 'fake' } }))
      .rejects.toThrow(/mismatch/);
    expect(io.in).not.toHaveBeenCalled();
  });
  it('database errors fail closed without sending payload', async () => {
    const s = socket(); h.user.mockRejectedValueOnce(new Error('DB unavailable'));
    const io = { in: vi.fn().mockReturnValue({ fetchSockets: vi.fn().mockResolvedValue([s]) }) } as unknown as Server;
    await emitAuthorizedChannelEvent({ io, orgId: 'org-a', accountId, purpose: 'control', event: 'channel:connection', payload: { qr: 'fake' } });
    expect(s.emit).not.toHaveBeenCalled(); expect(s.leave).toHaveBeenCalledOnce();
  });
  it('grant removal/downgrade evicts both read and control memberships', async () => {
    const s = socket(); h.account.mockResolvedValue(null);
    const io = { in: vi.fn().mockReturnValue({ fetchSockets: vi.fn().mockResolvedValue([s]) }) } as unknown as Server;
    await recheckChannelSubscriptions(io, 'org-a', accountId);
    expect(s.leave).toHaveBeenCalledWith(channelRoom('org-a', accountId, 'read'));
    expect(s.leave).toHaveBeenCalledWith(channelRoom('org-a', accountId, 'control'));
    expect(s.emit.mock.calls.every(call => call[0] === 'channel:access-revoked')).toBe(true);
  });
});
