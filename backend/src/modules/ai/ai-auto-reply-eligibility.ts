// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Huỳnh Ngọc Thuận — Community extension
import { prisma } from '../../shared/database/prisma-client.js';

export type AiAutoReplyScope = 'manual' | 'new_customers' | 'all';

export function normalizeAutoReplyScope(scope: string): AiAutoReplyScope {
  return scope === 'new_customers' || scope === 'all' ? scope : 'manual';
}

/**
 * Manual/all giữ nguyên quyền ưu tiên. `new_customers` nhận hội thoại chưa có
 * tin self của người thật. Công tắc khách lạ là quyền bổ sung: nếu bật, một
 * inbound 1-1 từ UID chưa có Friend accepted vẫn được nhận dù đã có lịch sử sale.
 */
export async function isConversationEligibleForAutoReply(
  conversationId: string,
  manuallyEnabled: boolean,
  scope: AiAutoReplyScope,
  inboundStrangerEnabled: boolean,
  zaloAccountId: string,
  externalThreadId: string,
): Promise<boolean> {
  if (manuallyEnabled) return true;
  if (scope === 'all') return true;

  if (scope === 'new_customers') {
    const rows = await prisma.$queryRaw<Array<{ hasHumanReply: boolean }>>`
      SELECT EXISTS (
        SELECT 1
        FROM "messages"
        WHERE "conversation_id" = ${conversationId}
          AND "sender_type" = 'self'
          AND "sent_via" IS DISTINCT FROM 'ai_auto'
          AND ("metadata"->>'aiAuto') IS DISTINCT FROM 'true'
      ) AS "hasHumanReply"
    `;
    if (rows[0]?.hasHumanReply !== true) return true;
  }

  if (!inboundStrangerEnabled) return false;

  // triggerAutoReply chỉ gọi sau inbound thật. Dùng đúng cặp nick × UID của
  // conversation; không suy theo Contact vì một Contact có thể có nhiều nick.
  const acceptedFriend = await prisma.friend.findFirst({
    where: {
      zaloAccountId,
      zaloUidInNick: externalThreadId,
      friendshipStatus: 'accepted',
    },
    select: { id: true },
  });
  return acceptedFriend === null;
}
