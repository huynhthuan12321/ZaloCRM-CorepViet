// Phase 7 Engine — nick pool selector.
//
// When AutomationTask has no pre-assigned nick, the worker calls pickNickForTask
// to choose one from the org's connected ZaloAccounts based on actionType:
//
//   send_message    → MUST pick a nick that's already a friend with this contact
//                     (Friend.friendshipStatus='accepted'). Falls back to any nick
//                     in 'pending_sent' if no accepted exists (Zalo allows sending
//                     to pending pairs in many cases).
//
//   request_friend  → Pick any connected nick under daily cap. Avoid nicks that
//                     already sent a friend req to this contact (FriendshipAttempt
//                     dedup). Round-robin by lastFriendReqSentAt to spread load.
//
//   update_status   → No nick needed (DB-only action). Worker skips this selector.

import { prisma } from '../../../shared/database/prisma-client.js';
import type { BlockActionType } from '../blocks/types.js';

export interface NickSelection {
  nickId: string;
  reason: 'existing_friend' | 'round_robin' | 'cap_aware';
}

export async function pickNickForTask(args: {
  orgId: string;
  contactId: string;
  actionType: BlockActionType;
  /**
   * SECONDARY FIX 2026-05-29 — whitelist of nick ids allowed for this trigger.
   * Sourced from trigger.segmentSpec.nickIds (friend_invite_to_list only).
   * When provided + non-empty, selector filters pool by these ids; if no
   * candidate survives, returns null (worker marks task skipped with
   * 'nick_not_in_whitelist'). When undefined/empty array, no filter applied.
   */
  allowedNickIds?: string[] | null;
}): Promise<NickSelection | null> {
  const { orgId, contactId, actionType } = args;
  const allowedNickIds =
    args.allowedNickIds && args.allowedNickIds.length > 0
      ? new Set(args.allowedNickIds)
      : null;

  // ── send_message: prefer accepted friend; fallback to pending_sent ONLY if conversation exists ─
  // FIX A5: previously returned pending_sent/pending_received nicks blindly,
  // which Zalo policy may reject. Now strict: accepted only, or pending_sent
  // WITH hasConversation=true (KH replied first, Zalo allows continued chat).
  if (actionType === 'send_message') {
    const friends = await prisma.friend.findMany({
      where: {
        orgId,
        contactId,
        OR: [
          { friendshipStatus: 'accepted' },
          { friendshipStatus: 'pending_sent', hasConversation: true },
        ],
        zaloAccount: { status: 'connected' },
      },
      select: { zaloAccountId: true, friendshipStatus: true, lastInboundAt: true },
      orderBy: [{ lastInboundAt: 'desc' }],
    });
    const filteredFriends = allowedNickIds
      ? friends.filter((f) => allowedNickIds.has(f.zaloAccountId))
      : friends;
    if (filteredFriends.length === 0) return null;
    const accepted = filteredFriends.find((f) => f.friendshipStatus === 'accepted');
    if (accepted) return { nickId: accepted.zaloAccountId, reason: 'existing_friend' };
    return { nickId: filteredFriends[0].zaloAccountId, reason: 'existing_friend' };
  }

  // ── request_friend: pick any connected nick not already attempted ──────
  if (actionType === 'request_friend') {
    // Find nicks that have NOT already attempted this contact
    const priorAttempts = await prisma.friendshipAttempt.findMany({
      where: { orgId, contactId },
      select: { zaloAccountId: true },
    });
    const excludedNickIds = new Set(priorAttempts.map((a) => a.zaloAccountId));

    // Get connected nicks ordered by last activity (round-robin: oldest first
    // so load spreads across nicks instead of hammering one).
    // SECONDARY FIX 2026-05-29 — enforce trigger.segmentSpec.nickIds whitelist
    // here so trigger-config "chỉ dùng nick X,Y" is honored at selection time.
    const nickWhere: Record<string, unknown> = {
      orgId,
      status: 'connected',
      id: { notIn: Array.from(excludedNickIds) },
    };
    if (allowedNickIds) {
      nickWhere.id = {
        notIn: Array.from(excludedNickIds),
        in: Array.from(allowedNickIds),
      };
    }
    const nicks = await prisma.zaloAccount.findMany({
      where: nickWhere as {
        orgId: string;
        status: string;
        id: { notIn: string[]; in?: string[] };
      },
      select: {
        id: true,
        lastFriendReqSentAt: true,
        dailyFriendAddCap: true,
      },
      orderBy: [{ lastFriendReqSentAt: 'asc' }],
    });
    if (nicks.length === 0) return null;

    // Filter out nicks that hit their daily cap
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);

    for (const nick of nicks) {
      if (nick.dailyFriendAddCap <= 0) {
        return { nickId: nick.id, reason: 'cap_aware' };
      }
      const todayCount = await prisma.automationTask.count({
        where: {
          assignedNickId: nick.id,
          state: 'done',
          executedAt: { gte: startOfDay },
          block: { actionType: 'request_friend' },
        },
      });
      if (todayCount < nick.dailyFriendAddCap) {
        return { nickId: nick.id, reason: 'round_robin' };
      }
    }
    return null; // all nicks capped out
  }

  // ── update_status + other: no nick needed ───────────────────────────────
  return null;
}
