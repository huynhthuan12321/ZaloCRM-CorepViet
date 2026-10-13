// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Nguyễn Tiến Lộc
import type { Prisma } from '@prisma/client';
import { prisma } from '../../shared/database/prisma-client.js';
import { resolveTikTokPersonalConfig } from '../../config/tiktok-personal-config.js';
import { userHasGrant } from '../rbac/permission-group-service.js';

export type ChannelPermission = 'read' | 'chat' | 'admin';
export interface ChannelActor { userId: string; orgId: string }
const permitted: Record<ChannelPermission, string[]> = {
  read: ['read', 'chat', 'admin'], chat: ['chat', 'admin'], admin: ['admin'],
};

export function allowedChannelProviders(): string[] {
  const cfg = resolveTikTokPersonalConfig();
  return [
    ...(cfg.effective.mock ? ['MOCK_BROWSER'] : []),
    ...(cfg.effective.enabled ? ['TIKTOK_WEB_SESSION'] : []),
  ];
}

export function channelAccountPredicate(
  actor: ChannelActor, role: string, permission: ChannelPermission, providers: string[],
): Prisma.ChannelAccountWhereInput {
  return {
    orgId: actor.orgId, enabled: true, provider: { in: providers },
    ...(['owner', 'admin'].includes(role) ? {} : {
      OR: [
        { ownerUserId: actor.userId },
        { grants: { some: { orgId: actor.orgId, userId: actor.userId, permission: { in: permitted[permission] } } } },
      ],
    }),
  };
}

/** Reload user role/active state instead of trusting stale HTTP/socket JWT role. */
export async function channelScope(actor: ChannelActor, permission: ChannelPermission = 'read') {
  const user = await prisma.user.findFirst({
    where: { id: actor.userId, orgId: actor.orgId, isActive: true }, select: { role: true },
  });
  const providers = allowedChannelProviders();
  if (!user || !(await userHasGrant(actor.userId, 'conversation', 'access'))) {
    return channelAccountPredicate(actor, 'member', permission, []);
  }
  return channelAccountPredicate(actor, user.role, permission, providers);
}

export async function hasChannelAccess(actor: ChannelActor, accountId: string, permission: ChannelPermission = 'read') {
  if (!allowedChannelProviders().length) return false;
  return !!(await prisma.channelAccount.findFirst({
    where: { AND: [await channelScope(actor, permission), { id: accountId }] }, select: { id: true },
  }));
}
