// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Nguyễn Tiến Lộc
import type { Prisma } from '@prisma/client';
import { DISPLAYABLE_NICK_WHERE } from '../zalo/zalo-scope.js';

export interface InboxFilters {
  channel?: 'all' | 'zalo' | 'tiktok' | 'mock';
  channelAccountId?: string;
  search?: string;
  unread?: boolean;
  tab?: 'main' | 'other';
}

/** One AND predicate shared by list, count and search; never overwrite authorization OR. */
export function unifiedInboxWhere(args: {
  orgId: string; zaloIds: string[]; channelScope: Prisma.ChannelAccountWhereInput; filters: InboxFilters;
}): Prisma.ConversationWhereInput {
  const { orgId, zaloIds, channelScope, filters } = args;
  const branches: Prisma.ConversationWhereInput[] = [];
  if (!filters.channelAccountId && (!filters.channel || ['all', 'zalo'].includes(filters.channel))) {
    branches.push({ zaloAccountId: { in: zaloIds }, channelAccountId: null, zaloAccount: DISPLAYABLE_NICK_WHERE });
  }
  if (filters.channel !== 'zalo') {
    const provider = filters.channel === 'tiktok' ? 'TIKTOK_WEB_SESSION'
      : filters.channel === 'mock' ? 'MOCK_BROWSER' : undefined;
    branches.push({
      zaloAccountId: null, channelAccountId: filters.channelAccountId ?? { not: null },
      channelAccount: { AND: [channelScope, ...(provider ? [{ provider }] : [])] },
    });
  }
  return {
    orgId, deletedAt: null,
    AND: [
      { OR: branches },
      ...(filters.tab ? [{ tab: filters.tab }] : []),
      ...(filters.unread ? [{ unreadCount: { gt: 0 } }] : []),
      ...(filters.search ? [{ OR: [
        { contact: { fullName: { contains: filters.search, mode: 'insensitive' as const } } },
        { contact: { crmName: { contains: filters.search, mode: 'insensitive' as const } } },
        { messages: { some: { isDeleted: false, content: { contains: filters.search, mode: 'insensitive' as const } } } },
      ] }] : []),
    ],
  };
}
