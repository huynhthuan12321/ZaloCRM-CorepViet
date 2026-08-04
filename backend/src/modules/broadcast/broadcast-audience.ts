// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Huỳnh Ngọc Thuận — Community extension
import { Prisma } from '@prisma/client';
import { prisma } from '../../shared/database/prisma-client.js';

export type BroadcastFriend = {
  id: string;
  zaloUidInNick: string;
  zaloDisplayName: string | null;
};

/** Chuẩn hoá tên nhãn từ request/job: trim, bỏ rỗng và khử trùng. */
export function normalizeFriendLabels(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return Array.from(new Set(value.map((label) => String(label).trim()).filter(Boolean)));
}

/**
 * Trả bạn bè đã kết bạn của nick. Khi có labels, một Friend chỉ được chọn nếu
 * zaloLabels chứa ĐỦ TẤT CẢ tên nhãn (AND). Nhãn Zalo là dữ liệu per-nick.
 */
export async function findFriendsByLabels(
  zaloAccountId: string,
  labels: string[],
  take: number,
): Promise<BroadcastFriend[]> {
  if (!labels.length) {
    return prisma.friend.findMany({
      where: { zaloAccountId, friendshipStatus: 'accepted' },
      orderBy: { becameFriendAt: 'asc' },
      take,
      select: { id: true, zaloUidInNick: true, zaloDisplayName: true },
    });
  }

  return prisma.$queryRaw<BroadcastFriend[]>(Prisma.sql`
    SELECT id, zalo_uid_in_nick AS "zaloUidInNick", zalo_display_name AS "zaloDisplayName"
    FROM friends
    WHERE zalo_account_id = ${zaloAccountId}
      AND friendship_status = 'accepted'
      AND (
        SELECT COUNT(DISTINCT e->>'name')
        FROM jsonb_array_elements(zalo_labels) e
        WHERE e->>'name' = ANY(ARRAY[${Prisma.join(labels)}]::text[])
      ) = ${labels.length}
    ORDER BY became_friend_at ASC NULLS LAST
    LIMIT ${take}
  `);
}
