// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Nguyễn Tiến Lộc
import type { Server, Socket } from 'socket.io';
import { z } from 'zod';
import { getSocketAuth } from '../../shared/realtime/socket-auth.js';
import { withTenant } from '../../shared/tenant/tenant-context.js';
import { hasChannelAccess, type ChannelPermission } from './channel-scope.js';

const subscription = z.object({ accountId: z.string().uuid(), purpose: z.enum(['read', 'control']).default('read') }).strict();
export const channelRoom = (orgId: string, accountId: string, purpose: 'read' | 'control') =>
  `channel:${orgId}:${accountId}:${purpose}`;

export function registerChannelSocketHandlers(io: Server) {
  io.on('connection', (socket: Socket) => {
    socket.on('channel:subscribe', async (input: unknown, ack?: (value: { ok: boolean }) => void) => {
      const parsed = subscription.safeParse(input);
      const ctx = getSocketAuth(socket);
      if (!parsed.success || !ctx) { if (typeof ack === 'function') ack({ ok: false }); return; }
      const { accountId, purpose } = parsed.data;
      try {
        const allowed = await withTenant(ctx.orgId, () => hasChannelAccess(ctx, accountId, purpose === 'control' ? 'admin' : 'read'));
        const room = channelRoom(ctx.orgId, accountId, purpose);
        if (allowed) await socket.join(room); else await socket.leave(room);
        if (typeof ack === 'function') ack({ ok: allowed });
      } catch {
        await socket.leave(channelRoom(ctx.orgId, accountId, purpose));
        if (typeof ack === 'function') ack({ ok: false });
      }
    });
    socket.on('channel:unsubscribe', async (input: unknown) => {
      const parsed = subscription.safeParse(input);
      const ctx = getSocketAuth(socket);
      if (parsed.success && ctx) await socket.leave(channelRoom(ctx.orgId, parsed.data.accountId, parsed.data.purpose));
    });
  });
}

/** Never broadcast sensitive data directly to a room: recheck each recipient in DB.
 * Works with Socket.IO adapters' fetchSockets; no cached ACL and no org fallback. */
export async function emitAuthorizedChannelEvent(args: {
  io: Server; orgId: string; accountId: string; purpose: 'read' | 'control';
  event: 'channel:message' | 'channel:connection'; payload: Record<string, unknown>;
}) {
  if ((args.event === 'channel:message') !== (args.purpose === 'read')) throw new Error('Channel event/room mismatch');
  const permission: ChannelPermission = args.purpose === 'control' ? 'admin' : 'read';
  const room = channelRoom(args.orgId, args.accountId, args.purpose);
  const sockets = await args.io.in(room).fetchSockets();
  for (const socket of sockets) {
    const ctx = socket.data?.authCtx as { userId: string; orgId: string } | undefined;
    let allowed = false;
    try {
      allowed = !!ctx && ctx.orgId === args.orgId && await withTenant(args.orgId, () => hasChannelAccess(ctx!, args.accountId, permission));
    } catch { /* database failure -> no payload */ }
    if (allowed) socket.emit(args.event, { ...args.payload, accountId: args.accountId });
    else await socket.leave(room);
  }
}

/** Call after grant changes; publishers also recheck if an external admin changes DB. */
export async function recheckChannelSubscriptions(io: Server, orgId: string, accountId: string) {
  for (const purpose of ['read', 'control'] as const) {
    const room = channelRoom(orgId, accountId, purpose);
    for (const socket of await io.in(room).fetchSockets()) {
      const ctx = socket.data?.authCtx as { userId: string; orgId: string } | undefined;
      let allowed = false;
      try {
        allowed = !!ctx && ctx.orgId === orgId && await withTenant(orgId, () => hasChannelAccess(ctx!, accountId, purpose === 'control' ? 'admin' : 'read'));
      } catch { /* fail closed */ }
      if (!allowed) { await socket.leave(room); socket.emit('channel:access-revoked', { accountId }); }
    }
  }
}
