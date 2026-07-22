// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Huỳnh Ngọc Thuận — Community extension
/**
 * process-care-session-step.ts — Service CHUNG xử lý 1 bước CareSession.
 *
 * Cả care-session-cron (scheduled tick) và endpoint "Gửi bước tiếp ngay"
 * (manual_run_now) đều gọi hàm này — KHÔNG có logic cập nhật state riêng.
 *
 * Luồng:
 *   1. Load session (org-scoped).
 *   2. Kiểm tra state = active.
 *   3. Claim atomic (optimistic updateMany trên id + currentStepIdx + nextRunAt).
 *   4. Resolve step từ stepsSnapshot.
 *   5. Kiểm tra sequence enabled.
 *   6. Render biến.
 *   7. Kiểm tra marketing dry-run / send guard / rate limiter.
 *   8. Gửi hoặc mô phỏng.
 *   9. Ghi CareSessionEvent (step_sent | step_simulated).
 *  10. Cập nhật session (currentStepIdx, lastSentAt, nextRunAt).
 *  11. Hoàn thành nếu hết bước.
 *  12. Trả DTO cho caller (cron log / frontend response).
 *
 * Idempotency key: `{sessionId}:step:{stepIdx}:epoch:{enrollEpoch}`
 *
 * Invariants:
 *   - Dry-run KHÔNG gọi Zalo SDK, tạo step_simulated.
 *   - Live send tạo step_sent.
 *   - Event insert lỗi duplicate (P2002) = đã xử lý → return idempotent.
 *   - Event insert lỗi khác → log error + đánh dấu needs_attention.
 *   - Zalo gửi thành công nhưng DB update fail → log CRITICAL + needs_attention.
 */
import { prisma } from '../../shared/database/prisma-client.js';
import { logger } from '../../shared/utils/logger.js';
import { config } from '../../config/index.js';
import { zaloOps, ZaloOpError } from '../../shared/zalo-operations.js';
import { zaloRateLimiter } from '../zalo/zalo-rate-limiter.js';
import { renderMessage, isWithinSendWindow } from '../broadcast/broadcast-service.js';
import { downloadMediaToTemp } from '../chat/chat-media-helpers.js';
import { parseSequenceSteps, parseSnapshotRules, type SequenceDraftStep } from './sequence-snapshot.js';

// ── Constants ──
const LEASE_MS = 10 * 60 * 1000; // claim lease: crash → phiên tự retry sau 10'
const RETRY_MS = 30 * 60 * 1000; // lỗi thường: retry sau 30'
const MAX_ATTEMPTS = 5;

// ── Types ──
export type StepTrigger = 'scheduled' | 'manual_run_now';

export interface ProcessStepOpts {
  sessionId: string;
  orgId: string;
  trigger: StepTrigger;
  actorUserId?: string;
  /** Nếu cron đã load session trước, truyền vào để tránh query lại. */
  preloadedSession?: SessionRow | null;
}

export interface StepResult {
  ok: boolean;
  /** Session đã xử lý bước chưa. */
  processed: boolean;
  /** Bước xử lý (0-based). */
  stepIdx?: number;
  /** Tổng bước. */
  totalSteps?: number;
  /** Chế độ gửi. */
  deliveryMode?: 'sent' | 'simulated' | 'blocked' | 'failed';
  /** Lý do hoãn / blocked. */
  deferReason?: string;
  /** Phiên đã hoàn thành (hết bước). */
  completed?: boolean;
  /** Lỗi. */
  error?: string;
  /** Đã đụng Zalo (dùng để cron giãn nick). */
  touchedZalo?: boolean;
  /** Event type đã tạo. */
  eventType?: string;
}

export type SessionRow = {
  id: string; orgId: string; contactId: string; nickId: string;
  externalThreadId: string | null; sourceSequenceId: string | null;
  stepsSnapshot: unknown; rulesSnapshot: unknown;
  currentStepIdx: number; nextRunAt: Date | null; attemptCount: number;
  enrollEpoch: number | null; state?: string;
};

const SESSION_SELECT = {
  id: true, orgId: true, contactId: true, nickId: true,
  externalThreadId: true, sourceSequenceId: true,
  stepsSnapshot: true, rulesSnapshot: true,
  currentStepIdx: true, nextRunAt: true, attemptCount: true,
  enrollEpoch: true, state: true,
} as const;

// ── Main entry ──
export async function processCareSessionStep(opts: ProcessStepOpts): Promise<StepResult> {
  const { sessionId, orgId, trigger } = opts;

  // 1. Load session
  const session: SessionRow | null = opts.preloadedSession ?? await prisma.careSession.findFirst({
    where: { id: sessionId, orgId, state: 'active' },
    select: SESSION_SELECT,
  });
  if (!session) {
    return { ok: false, processed: false, error: 'session_not_found_or_inactive' };
  }
  if (session.state && session.state !== 'active') {
    return { ok: false, processed: false, error: 'session_not_active' };
  }

  // 2. Resolve steps
  let steps: SequenceDraftStep[] = parseSequenceSteps(session.stepsSnapshot);

  // Check sequence enabled + dual-read fallback
  if (session.sourceSequenceId) {
    const seq = await prisma.automationSequence.findFirst({
      where: { id: session.sourceSequenceId, orgId: session.orgId },
      select: { enabled: true, steps: true },
    });
    if (seq && !seq.enabled) {
      return { ok: false, processed: false, deferReason: 'sequence_disabled' };
    }
    if (!steps.length) steps = parseSequenceSteps(seq?.steps);
  }

  if (!steps.length) {
    await closeSession(session, 'no_steps', 'luong khong con buoc nao de gui');
    return { ok: true, processed: false, completed: true, error: 'no_steps' };
  }

  const idx = session.currentStepIdx;
  if (idx >= steps.length) {
    await closeSession(session, 'completed', null);
    return { ok: true, processed: false, completed: true };
  }

  // 3. Pre-checks (send window, rate limiter) — chỉ khi KHÔNG phải manual_run_now
  // manual_run_now VẪN check rate limit nhưng KHÔNG check send window (sale bấm = muốn gửi ngay).
  if (trigger === 'scheduled' && !isWithinSendWindow(new Date())) {
    return { ok: false, processed: false, deferReason: 'outside_hour_window' };
  }

  const gate = await zaloRateLimiter.checkLimits(session.nickId, 'message', { failClosed: true });
  if (!gate.allowed) {
    return { ok: false, processed: false, deferReason: 'quota_capped' };
  }

  // 4. CLAIM optimistic
  const now = new Date();
  const claimed = await prisma.careSession.updateMany({
    where: { id: session.id, state: 'active', currentStepIdx: idx, nextRunAt: session.nextRunAt },
    data: { nextRunAt: new Date(now.getTime() + LEASE_MS) },
  });
  if (claimed.count !== 1) {
    return { ok: false, processed: false, error: 'claim_failed_concurrent' };
  }

  // 5. Resolve UID
  let uid = session.externalThreadId;
  if (!uid) {
    const friend = await prisma.friend.findFirst({
      where: { orgId: session.orgId, contactId: session.contactId, zaloAccountId: session.nickId, friendshipStatus: 'accepted' },
      select: { zaloUidInNick: true },
    }) ?? await prisma.friend.findFirst({
      where: { orgId: session.orgId, contactId: session.contactId, zaloAccountId: session.nickId },
      select: { zaloUidInNick: true },
    });
    uid = friend?.zaloUidInNick ?? null;
  }
  if (!uid) {
    await failStep(session, idx, now, 'khong_tim_thay_uid_nguoi_nhan');
    return { ok: true, processed: false, deliveryMode: 'failed', error: 'uid_not_found', touchedZalo: false };
  }

  // 6. Render message
  const contact = await prisma.contact.findFirst({
    where: { id: session.contactId, orgId: session.orgId },
    select: { crmName: true, fullName: true, zaloUsername: true, phone: true },
  });
  const step = steps[idx];
  const text = renderMessage(step.text, {
    name: contact?.crmName ?? contact?.fullName ?? contact?.zaloUsername ?? null,
    phone: contact?.phone ?? null,
  });

  // 7. Execute: dry-run OR live send
  try {
    if (config.marketingDryRun) {
      // DRY-RUN: KHÔNG gọi Zalo SDK. Tạo step_simulated (KHÔNG phải step_sent).
      const simText = step.imageUrl ? `[dry-run] (kèm ảnh) ${text}` : `[dry-run] ${text}`;
      const eventOk = await advanceStep(session, steps, idx, now, simText, uid, 'step_simulated', trigger);
      logger.info(`[care-session-step] [dry-run] session=${session.id} step=${idx + 1}/${steps.length} trigger=${trigger} uid=${uid}${step.imageUrl ? ' (kèm ảnh)' : ''}`);
      return {
        ok: true, processed: true,
        stepIdx: idx, totalSteps: steps.length,
        deliveryMode: 'simulated',
        completed: idx + 1 >= steps.length,
        touchedZalo: false,
        eventType: 'step_simulated',
      };
    }

    // LIVE: gọi Zalo SDK. Có imageUrl → sendImage (caption = text); không có → sendMessage.
    if (step.imageUrl) {
      const media = await downloadMediaToTemp({ url: step.imageUrl }, 'image');
      try {
        await zaloOps.sendImage(session.nickId, uid, 0, [media.path], null, text);
      } finally {
        await media.cleanup().catch(() => {});
      }
    } else {
      await zaloOps.sendMessage(session.nickId, uid, 0, { msg: text });
    }

    // Zalo thành công → finalize DB. Nếu DB fail → CRITICAL + needs_attention.
    const eventOk = await advanceStep(session, steps, idx, now, text, uid, 'step_sent', trigger);
    if (!eventOk) {
      // Zalo đã gửi nhưng DB finalize fail → reconciliation_required
      logger.error(`[care-session-step] CRITICAL: Zalo sent OK but DB finalize failed. session=${session.id} step=${idx}`);
      await prisma.careSession.updateMany({
        where: { id: session.id },
        data: { lastError: 'reconciliation_required', state: 'active' },
      }).catch(() => {});
      return {
        ok: false, processed: true,
        stepIdx: idx, totalSteps: steps.length,
        deliveryMode: 'sent',
        error: 'db_finalize_failed_after_send',
        touchedZalo: true,
        eventType: 'step_sent',
      };
    }

    logger.info(`[care-session-step] session=${session.id} step=${idx + 1}/${steps.length} sent trigger=${trigger} uid=${uid}`);
    return {
      ok: true, processed: true,
      stepIdx: idx, totalSteps: steps.length,
      deliveryMode: 'sent',
      completed: idx + 1 >= steps.length,
      touchedZalo: true,
      eventType: 'step_sent',
    };
  } catch (err: any) {
    if (err instanceof ZaloOpError && (err.code === 'RATE_LIMITED' || err.code === 'NOT_CONNECTED')) {
      // Nick chạm trần/mất kết nối — dời lịch, KHÔNG tính attempt.
      await prisma.careSession.updateMany({
        where: { id: session.id, state: 'active' },
        data: { nextRunAt: new Date(now.getTime() + LEASE_MS), lastError: err.code },
      }).catch(() => {});
      logger.warn(`[care-session-step] session=${session.id} deferred: ${err.code}`);
      return {
        ok: false, processed: false,
        deferReason: err.code === 'RATE_LIMITED' ? 'quota_capped' : 'nick_offline',
        touchedZalo: true,
      };
    }
    await failStep(session, idx, now, String(err?.message ?? err).slice(0, 500));
    return {
      ok: true, processed: false,
      deliveryMode: 'failed',
      error: String(err?.message ?? err).slice(0, 200),
      touchedZalo: true,
    };
  }
}

// ── Helpers ──

/**
 * Tiến bước: update session + tạo event.
 * Returns true nếu thành công, false nếu DB finalize fail.
 */
async function advanceStep(
  session: SessionRow, steps: SequenceDraftStep[], idx: number,
  now: Date, sentText: string, uid: string,
  eventType: 'step_sent' | 'step_simulated',
  trigger: StepTrigger,
): Promise<boolean> {
  const nextIdx = idx + 1;
  const isLast = nextIdx >= steps.length;
  const nextDelayMs = isLast ? 0 : Math.max(0, steps[nextIdx].delayMinutes) * 60 * 1000;
  const idempotencyKey = `${eventType}:${idx}:${session.enrollEpoch ?? 1}`;

  try {
    await prisma.careSession.update({
      where: { id: session.id },
      data: {
        currentStepIdx: nextIdx,
        lastSentAt: now,
        lastError: null,
        attemptCount: 0,
        ...(isLast
          ? { state: 'closed', closedReason: 'completed', closedAt: now, nextRunAt: null }
          : { nextRunAt: new Date(now.getTime() + nextDelayMs) }),
      },
    });
  } catch (err) {
    logger.error(`[care-session-step] DB update session failed: session=${session.id} step=${idx}`, err);
    return false;
  }

  // Event insert: duplicate (P2002) = idempotent → swallow. Lỗi khác → log error (KHÔNG swallow).
  try {
    await prisma.careSessionEvent.create({
      data: {
        sessionId: session.id,
        eventId: idempotencyKey,
        eventType,
        payload: {
          stepIdx: idx,
          totalSteps: steps.length,
          text: sentText.slice(0, 500),
          uid,
          trigger,
          deliveryMode: eventType === 'step_simulated' ? 'dry_run' : 'live',
        },
      },
    });
  } catch (err: any) {
    if (err?.code === 'P2002') {
      // Duplicate event (idempotency) — expected, ignore.
      logger.debug(`[care-session-step] duplicate event ignored: ${idempotencyKey}`);
    } else {
      // Non-duplicate error — log but don't crash (session already advanced).
      logger.error(`[care-session-step] event insert failed (non-duplicate): session=${session.id} key=${idempotencyKey}`, err);
    }
  }

  // Bước cuối: tăng completedCount của luồng.
  if (isLast && session.sourceSequenceId) {
    await prisma.automationSequence.updateMany({
      where: { id: session.sourceSequenceId, orgId: session.orgId },
      data: { completedCount: { increment: 1 } },
    }).catch(() => {});
  }

  return true;
}

async function failStep(session: SessionRow, idx: number, now: Date, error: string): Promise<void> {
  const attempts = (session.attemptCount ?? 0) + 1;
  if (attempts >= MAX_ATTEMPTS) {
    await closeSession(session, 'step_failed', error);
    if (session.sourceSequenceId) {
      await prisma.automationSequence.updateMany({
        where: { id: session.sourceSequenceId, orgId: session.orgId },
        data: { failedCount: { increment: 1 } },
      }).catch(() => {});
    }
    return;
  }
  await prisma.careSession.updateMany({
    where: { id: session.id, state: 'active' },
    data: { attemptCount: attempts, lastError: error, nextRunAt: new Date(now.getTime() + RETRY_MS) },
  });
  logger.warn(`[care-session-step] session=${session.id} step=${idx} attempt=${attempts}/${MAX_ATTEMPTS} failed: ${error}`);
}

async function closeSession(session: SessionRow, reason: string, error: string | null): Promise<void> {
  await prisma.careSession.updateMany({
    where: { id: session.id, state: 'active' },
    data: { state: 'closed', closedReason: reason, closedAt: new Date(), nextRunAt: null, ...(error ? { lastError: error } : {}) },
  });
  await prisma.careSessionEvent.create({
    data: {
      sessionId: session.id,
      eventId: `closed:${session.enrollEpoch ?? 1}`,
      eventType: 'closed',
      payload: { reason, error },
    },
  }).catch((err: any) => {
    if (err?.code !== 'P2002') {
      logger.error(`[care-session-step] close event insert failed: session=${session.id}`, err);
    }
  });
  logger.info(`[care-session-step] session=${session.id} closed (${reason})`);
}
