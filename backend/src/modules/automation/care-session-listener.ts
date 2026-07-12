// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Huỳnh Ngọc Thuận — Community extension
/**
 * care-session-listener.ts — Subscriber event bus cho CareSession (Community).
 *
 * Core (chat/zalo) đã emit event lên automationEventBus từ trước; bản Community
 * chưa có ai subscribe nên "dừng khi khách phản hồi" và "kết bạn xong tự bám đuổi"
 * chưa chạy. Listener này khép 2 mạch đó (Phase 4):
 *
 *   1. customer_reply  → phiên active của cặp (nick × KH): ghi lastReplyAt, reset
 *      interest window, rồi PAUSE theo rulesSnapshot.pauseOnReplyHours (mặc định 24h)
 *      hoặc ĐÓNG hẳn nếu stopOnReply=true. Idempotent qua CareSessionEvent
 *      unique(sessionId, eventId) — cùng 1 tin nhắn không pause/notify 2 lần.
 *
 *   2. friendship_accepted → nếu KH thuộc TargetJob có followupSequenceId: tạo
 *      CareSession(sourceType='target_followup') với stepsSnapshot chụp lúc enroll.
 *      Worker care-session-cron sẽ gửi các bước. Dedupe: 1 KH chỉ enroll 1 lần
 *      cho mỗi (nick × luồng) từ target.
 */
import { prisma } from '../../shared/database/prisma-client.js';
import { logger } from '../../shared/utils/logger.js';
import { withTenant } from '../../shared/tenant/tenant-context.js';
import { automationEventBus, type AutomationEvent } from '../../shared/ee-registry/event-bus.js';
import { parseSequenceSteps, parseSnapshotRules } from './sequence-snapshot.js';

const FOLLOWUP_SOURCES = ['sequence_manual', 'target_followup'];
/** Bước đầu delay 0 vẫn chờ tối thiểu 3 phút — nhường tin chào (target-cron) đi trước. */
const FOLLOWUP_MIN_FIRST_DELAY_MINUTES = 3;

export function startCareSessionListener(): () => void {
  const offReply = automationEventBus.onType(['customer_reply'], (event) => handleCustomerReply(event));
  const offAccept = automationEventBus.onType(['friendship_accepted'], (event) => handleFriendshipAccepted(event));
  logger.info('[care-session-listener] subscribed (customer_reply, friendship_accepted)');
  return () => {
    offReply();
    offAccept();
  };
}

type ReplyPayload = {
  nickId?: string;
  externalThreadId?: string | null;
  conversationId?: string;
  messageId?: string;
};

async function handleCustomerReply(event: AutomationEvent): Promise<void> {
  const contactId = event.contactId;
  if (!contactId) return;
  const p = (event.payload ?? {}) as ReplyPayload;
  if (!p.nickId) return;

  await withTenant(event.orgId, async () => {
    // Phiên neo theo (nick, thread); externalThreadId null = khớp mọi thread (phiên cũ).
    const sessions = await prisma.careSession.findMany({
      where: {
        orgId: event.orgId,
        contactId,
        nickId: p.nickId!,
        state: 'active',
        sourceType: { in: FOLLOWUP_SOURCES },
        ...(p.externalThreadId
          ? { OR: [{ externalThreadId: null }, { externalThreadId: p.externalThreadId }] }
          : {}),
      },
      select: {
        id: true, currentStepIdx: true, rulesSnapshot: true,
        pauseEpoch: true, enrollEpoch: true,
      },
    });
    if (!sessions.length) return;

    const now = new Date();
    // eventId chuẩn hóa theo convention CareSessionEvent (idempotency gate).
    const bucket = p.messageId ?? String(Math.floor(now.getTime() / 60_000));
    const eventId = `${p.nickId}:${contactId}:reply:${bucket}`;

    for (const session of sessions) {
      // Idempotency: INSERT trùng (P2002) = event này đã xử lý cho phiên này → bỏ.
      try {
        await prisma.careSessionEvent.create({
          data: {
            sessionId: session.id,
            eventId,
            eventType: 'reply',
            payload: { messageId: p.messageId ?? null, conversationId: p.conversationId ?? null },
          },
        });
      } catch (err: any) {
        if (err?.code === 'P2002') continue;
        throw err;
      }

      const rules = parseSnapshotRules(session.rulesSnapshot);
      const base = {
        lastReplyAt: now,
        lastCustomerActivityAt: now,
        interestWindowUntil: new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000), // reset mỗi event khách (D13)
      };

      if (rules.stopOnReply) {
        await prisma.careSession.updateMany({
          where: { id: session.id, state: 'active' },
          data: { ...base, state: 'closed', closedReason: 'customer_replied', closedAt: now, nextRunAt: null },
        });
        logger.info(`[care-session-listener] session=${session.id} closed (customer replied, stopOnReply)`);
        continue;
      }

      if (rules.pauseOnReplyHours > 0) {
        await prisma.careSession.updateMany({
          where: { id: session.id, state: 'active' },
          data: {
            ...base,
            pausedUntil: new Date(now.getTime() + rules.pauseOnReplyHours * 60 * 60 * 1000),
            pausedAtStepIdx: session.currentStepIdx,
            pauseEpoch: (session.pauseEpoch ?? 0) + 1,
          },
        });
        logger.info(`[care-session-listener] session=${session.id} paused ${rules.pauseOnReplyHours}h (customer replied)`);
      } else {
        await prisma.careSession.updateMany({ where: { id: session.id, state: 'active' }, data: base });
      }
    }
  }).catch((err) => logger.error('[care-session-listener] customer_reply error', err));
}

type AcceptedPayload = { zaloAccountId?: string; zaloUidInNick?: string };

async function handleFriendshipAccepted(event: AutomationEvent): Promise<void> {
  const contactId = event.contactId;
  if (!contactId) return;
  const p = (event.payload ?? {}) as AcceptedPayload;
  if (!p.zaloAccountId) return;

  await withTenant(event.orgId, async () => {
    // KH này có nằm trong Mục tiêu nào bật bám đuổi không? (job 'done' vẫn enroll —
    // khách chấp nhận muộn nhiều ngày sau khi hết lời mời, đồng bộ hành vi tin chào.)
    const items = await prisma.targetRunItem.findMany({
      where: { orgId: event.orgId, contactId, status: 'sent' },
      select: { jobId: true },
    });
    if (!items.length) return;

    const jobs = await prisma.targetJob.findMany({
      where: {
        id: { in: [...new Set(items.map((i) => i.jobId))] },
        zaloAccountId: p.zaloAccountId,
        followupSequenceId: { not: null },
        status: { in: ['active', 'done'] },
      },
      select: { id: true, followupSequenceId: true, zaloAccountId: true, createdById: true },
    });

    for (const job of jobs) {
      await enrollTargetFollowup(job, event.orgId, contactId, p.zaloUidInNick ?? null)
        .catch((err) => logger.error(`[care-session-listener] enroll followup job=${job.id} error`, err));
    }
  }).catch((err) => logger.error('[care-session-listener] friendship_accepted error', err));
}

async function enrollTargetFollowup(
  job: { id: string; followupSequenceId: string | null; zaloAccountId: string; createdById: string },
  orgId: string,
  contactId: string,
  zaloUidInNick: string | null,
): Promise<void> {
  if (!job.followupSequenceId) return;

  const sequence = await prisma.automationSequence.findFirst({
    where: { id: job.followupSequenceId, orgId, enabled: true },
    select: { id: true, steps: true, runtimeRules: true },
  });
  if (!sequence) {
    logger.warn(`[care-session-listener] job=${job.id} followup sequence missing/disabled — skip enroll`);
    return;
  }
  const steps = parseSequenceSteps(sequence.steps);
  if (!steps.length) {
    logger.warn(`[care-session-listener] job=${job.id} followup sequence has no steps — skip enroll`);
    return;
  }

  // Dedupe: mỗi (nick × KH × luồng) chỉ enroll 1 lần từ target — kể cả phiên đã đóng
  // (không tự bám đuổi lại khi remove/re-accept, tránh spam khách cũ).
  const existing = await prisma.careSession.findFirst({
    where: {
      orgId, contactId, nickId: job.zaloAccountId,
      sourceType: 'target_followup', sourceSequenceId: sequence.id,
    },
    select: { id: true },
  });
  if (existing) return;

  const nick = await prisma.zaloAccount.findUnique({
    where: { id: job.zaloAccountId },
    select: { ownerUserId: true },
  });

  const now = new Date();
  const firstDelayMinutes = Math.max(steps[0].delayMinutes, FOLLOWUP_MIN_FIRST_DELAY_MINUTES);
  const created = await prisma.careSession.create({
    data: {
      orgId,
      contactId,
      nickId: job.zaloAccountId,
      externalThreadId: zaloUidInNick,
      ownerUserId: nick?.ownerUserId ?? job.createdById,
      enrolledByUserId: null, // auto enroll từ Mục tiêu
      sourceType: 'target_followup',
      sourceSequenceId: sequence.id,
      state: 'active',
      interestWindowUntil: new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000),
      enrollEpoch: 1,
      rulesSnapshot: sequence.runtimeRules ?? {},
      stepsSnapshot: steps,
      currentStepIdx: 0,
      nextRunAt: new Date(now.getTime() + firstDelayMinutes * 60 * 1000),
      closeConditions: { targetJobId: job.id },
    },
    select: { id: true },
  });

  await prisma.careSessionEvent.create({
    data: {
      sessionId: created.id,
      eventId: `target-followup:${job.id}`,
      eventType: 'opened',
      payload: { targetJobId: job.id, sequenceId: sequence.id },
    },
  }).catch(() => {});

  await prisma.$transaction([
    prisma.targetJob.update({ where: { id: job.id }, data: { followupEnrolledCount: { increment: 1 } } }),
    prisma.automationSequence.update({ where: { id: sequence.id }, data: { enrolledCount: { increment: 1 } } }),
  ]).catch(() => {});

  logger.info(`[care-session-listener] job=${job.id} enrolled followup session=${created.id} contact=${contactId}`);
}
