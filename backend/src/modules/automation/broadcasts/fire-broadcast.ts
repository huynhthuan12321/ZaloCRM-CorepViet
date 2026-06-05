// ════════════════════════════════════════════════════════════════════════
// Broadcasts Đợt 1 (2026-06-05) — Fire broadcast = resolve + enqueue worker
// ════════════════════════════════════════════════════════════════════════
//
// Refactored 2026-06-05: STUB no-op cũ → BullMQ broadcast-fire worker thật.
//
// Flow:
//   1. Atomic claim state draft|scheduled|paused → running
//   2. Resolve segmentSpec qua shared resolver (5 kind: manual/filter/customer-list/tag/preset-segment)
//   3. Filter friendable (KH có ít nhất 1 nick là bạn)
//   4. Update totalRecipients + reset counters
//   5. Snapshot Block content + Campaign + segmentSnapshot.contactIds[]
//   6. Enqueue tick-0 BullMQ broadcast-fire worker → worker tự lazy-chain ticks
//
// Worker đọc Campaign.segmentSnapshot.contactIds, gửi tuần tự với delay 3-10s,
// respect window 6-22 + nick cap 300/day. Notify Zalo Anh khi complete.

import { randomUUID } from 'node:crypto';
import { prisma } from '../../../shared/database/prisma-client.js';
import { logger } from '../../../shared/utils/logger.js';
import { resolveSegmentToContactIds } from '../engine/segment-resolver.js';
import {
  getBroadcastFireQueue,
  buildBroadcastTickJobId,
} from '../queues/queue-registry.js';

export interface BroadcastRow {
  id: string;
  orgId: string;
  blockId: string;
  segmentSpec: unknown;
  pacing: unknown;
}

export interface FireBroadcastResult {
  recipients: number;
  claimed: boolean;
  skipReasons?: {
    noZalo: number;
    blocked: number;
    notFriend: number;
  };
}

export async function resolveAndEnqueue(bc: BroadcastRow): Promise<FireBroadcastResult> {
  // 1. Atomic claim
  const claim = await prisma.automationBroadcast.updateMany({
    where: {
      id: bc.id,
      orgId: bc.orgId,
      state: { in: ['draft', 'scheduled', 'paused'] },
    },
    data: {
      state: 'running',
      startedAt: new Date(),
      resumeCursor: null, // Reset cursor on fresh start
    },
  });
  if (claim.count === 0) {
    logger.warn(`[broadcast] ${bc.id} claim failed — already running or terminal state`);
    return { recipients: 0, claimed: false };
  }

  // 2. Resolve segment qua shared resolver
  const resolved = await resolveSegmentToContactIds(prisma, bc.orgId, bc.segmentSpec);
  if (resolved.rejected?.length) {
    logger.warn(`[broadcast] ${bc.id} criteria rejected fields: ${resolved.rejected.join(', ')}`);
  }
  logger.info(`[broadcast] ${bc.id} resolved kind=${resolved.kind} total=${resolved.totalResolved} → ${resolved.contactIds.length} after skip (noZalo=${resolved.skipped.noZalo}, blocked=${resolved.skipped.blocked})`);

  // 3. Filter friendable — KH phải có ít nhất 1 nick là bạn (acceptedNicksCount > 0)
  let friendableIds: string[] = [];
  let notFriendCount = 0;
  if (resolved.contactIds.length > 0) {
    const friendable = await prisma.contact.findMany({
      where: {
        id: { in: resolved.contactIds },
        orgId: bc.orgId,
        acceptedNicksCount: { gt: 0 },
      },
      select: { id: true },
    });
    friendableIds = friendable.map((c) => c.id);
    notFriendCount = resolved.contactIds.length - friendableIds.length;
  }

  // 4. Update broadcast totals
  await prisma.automationBroadcast.update({
    where: { id: bc.id },
    data: {
      totalRecipients: friendableIds.length,
      sentCount: 0,
      deliveredCount: 0,
      failedCount: 0,
    },
  });

  if (friendableIds.length === 0) {
    await prisma.automationBroadcast.update({
      where: { id: bc.id },
      data: { state: 'completed', completedAt: new Date() },
    });
    logger.info(`[broadcast] ${bc.id} no friendable recipients → completed immediately`);
    return {
      recipients: 0,
      claimed: true,
      skipReasons: { noZalo: resolved.skipped.noZalo, blocked: resolved.skipped.blocked, notFriend: notFriendCount },
    };
  }

  // 5. Snapshot Block content for immutability
  const block = await prisma.block.findUnique({
    where: { id: bc.blockId },
    select: { content: true },
  });
  if (!block) throw new Error('block not found at enqueue time');

  // 6. Create Campaign + segmentSnapshot (worker đọc từ đây)
  await prisma.automationCampaign.create({
    data: {
      id: randomUUID(),
      orgId: bc.orgId,
      broadcastId: bc.id,
      executionKind: 'broadcast',
      blockId: bc.blockId,
      segmentSnapshot: { contactIds: friendableIds, blockContent: block.content } as object,
      rulesSnapshot: (bc.pacing ?? {}) as object,
      state: 'active',
    },
  });

  // 7. Enqueue tick-0 worker job → worker lazy-chain
  await getBroadcastFireQueue().add(
    'tick',
    { broadcastId: bc.id, orgId: bc.orgId, tickIdx: 0 },
    { jobId: buildBroadcastTickJobId(bc.id, 0) },
  );

  logger.info(`[broadcast] ${bc.id} fired — ${friendableIds.length} recipients, tick-0 enqueued`);
  return {
    recipients: friendableIds.length,
    claimed: true,
    skipReasons: { noZalo: resolved.skipped.noZalo, blocked: resolved.skipped.blocked, notFriend: notFriendCount },
  };
}
