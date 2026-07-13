// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Huỳnh Ngọc Thuận — Community extension
/**
 * care-session-cron.ts — Worker gửi bước Luồng kịch bản (Community, khép kín Phase 3-4).
 *
 * Trước đây bản Community chỉ TẠO được CareSession (gắn luồng bám đuổi) nhưng không
 * có worker gửi — engine đầy đủ nằm ở extension bundle. Worker này là fallback
 * Community: tick mỗi 30s, quét CareSession active có nextRunAt đến hạn, gửi bước
 * kế tiếp từ stepsSnapshot (chụp lúc enroll — sửa luồng KHÔNG đổi phiên đang chạy).
 *
 * Luật an toàn (đồng bộ chuẩn với broadcast-cron/target-cron):
 *   - Khung giờ gửi: global 8h-21h VN + allowedHourRange trong rulesSnapshot từng phiên.
 *   - Giãn đều giữa nick: tối đa 1 tin automation/nick/tick + sendGap phút giữa 2 tin
 *     cùng nick (đọc từ rulesSnapshot, mặc định 5 phút).
 *   - Rate limit: pre-check zaloRateLimiter 'message' fail-CLOSED trước khi gửi.
 *   - Chống gửi trùng: CLAIM bằng optimistic updateMany (id + currentStepIdx +
 *     nextRunAt phải khớp giá trị đã đọc) → dời nextRunAt thành lease 10 phút.
 *     Tick khác/instance khác claim trượt (count=0) thì bỏ qua.
 *   - Tôn trọng pausedUntil (KH vừa trả lời → listener pause phiên).
 *   - Sequence bị TẮT (enabled=false) → phiên đang chạy tạm ngưng gửi (giữ nguyên
 *     nextRunAt, tự chạy tiếp khi bật lại). Định nghĩa chốt: toggle ảnh hưởng CẢ
 *     enroll mới lẫn phiên đang chạy.
 *   - Lỗi transient (RATE_LIMITED/NOT_CONNECTED): dời lịch +10 phút, KHÔNG đốt attempt.
 *     Lỗi khác: attemptCount++ + retry sau 30 phút, quá 5 lần → đóng phiên 'step_failed'.
 */
import cron from 'node-cron';
import { prisma } from '../../shared/database/prisma-client.js';
import { logger } from '../../shared/utils/logger.js';
import { config } from '../../config/index.js';
import { runSystemQuery, withTenant } from '../../shared/tenant/tenant-context.js';
import { zaloOps, ZaloOpError } from '../../shared/zalo-operations.js';
import { zaloRateLimiter } from '../zalo/zalo-rate-limiter.js';
import { renderMessage, isWithinSendWindow } from '../broadcast/broadcast-service.js';
import { parseSequenceSteps, parseSnapshotRules, type SequenceDraftStep } from './sequence-snapshot.js';

const MAX_ATTEMPTS = 5;
const LEASE_MS = 10 * 60 * 1000; // lease claim: crash giữa chừng → phiên tự thử lại sau 10'
const RETRY_MS = 30 * 60 * 1000; // lỗi thường: thử lại sau 30'
const BATCH_SIZE = 10; // tối đa 10 phiên/tick — mỗi nick vẫn chỉ 1 tin/tick

const VN_OFFSET_MS = 7 * 60 * 60 * 1000;

let running = false;

export function startCareSessionCron(): void {
  cron.schedule('*/30 * * * * *', async () => {
    if (running) return; // chống chồng tick khi gửi chậm
    running = true;
    try {
      await runCareSessionTick();
    } catch (err) {
      logger.error('[care-session-cron] tick error', err);
    } finally {
      running = false;
    }
  });
  logger.info('[care-session-cron] scheduled every 30s (community sequence worker)');
}

type SessionRow = {
  id: string; orgId: string; contactId: string; nickId: string;
  externalThreadId: string | null; sourceSequenceId: string | null;
  stepsSnapshot: unknown; rulesSnapshot: unknown;
  currentStepIdx: number; nextRunAt: Date | null; attemptCount: number;
  enrollEpoch: number | null;
};

const SESSION_SELECT = {
  id: true, orgId: true, contactId: true, nickId: true,
  externalThreadId: true, sourceSequenceId: true,
  stepsSnapshot: true, rulesSnapshot: true,
  currentStepIdx: true, nextRunAt: true, attemptCount: true,
  enrollEpoch: true,
} as const;

export async function runCareSessionTick(): Promise<void> {
  const now = new Date();
  if (!isWithinSendWindow(now)) return; // ngoài khung giờ chung 8h-21h VN

  const due = await runSystemQuery(() =>
    prisma.careSession.findMany({
      where: {
        state: 'active',
        sourceType: { in: ['sequence_manual', 'target_followup'] },
        nextRunAt: { lte: now },
        OR: [{ pausedUntil: null }, { pausedUntil: { lte: now } }],
      },
      orderBy: { nextRunAt: 'asc' },
      take: BATCH_SIZE,
      select: SESSION_SELECT,
    }),
  );
  if (!due.length) return;

  // Giãn đều giữa nick: mỗi nick chỉ đụng Zalo 1 lần/tick.
  const touchedNicks = new Set<string>();
  for (const session of due) {
    if (touchedNicks.has(session.nickId)) continue;
    const touched = await withTenant(session.orgId, () => processSession(session, now))
      .catch((err) => {
        logger.error(`[care-session-cron] session=${session.id} error`, err);
        return true; // lỗi bất ngờ — coi như nick đã đụng, không dồn thêm trong tick này
      });
    if (touched) touchedNicks.add(session.nickId);
  }
}

/** Trả về true nếu đã đụng Zalo với nick này (gửi thành công/lỗi) — dùng để giãn nick trong tick. */
async function processSession(session: SessionRow, now: Date): Promise<boolean> {
  const rules = parseSnapshotRules(session.rulesSnapshot);

  // Khung giờ riêng của phiên (rulesSnapshot.allowedHourRange, giờ VN).
  const vnHour = new Date(now.getTime() + VN_OFFSET_MS).getUTCHours();
  if (vnHour < rules.allowedHourRange[0] || vnHour >= rules.allowedHourRange[1]) return false;

  // Giãn đều giữa nick: nick này vừa gửi tin automation trong sendGap phút → chờ.
  const gapSince = new Date(now.getTime() - rules.sendGapMinutes * 60 * 1000);
  const recentOnNick = await prisma.careSession.findFirst({
    where: { orgId: session.orgId, nickId: session.nickId, lastSentAt: { gt: gapSince } },
    select: { id: true },
  });
  if (recentOnNick) return false;

  // Steps: ưu tiên snapshot lúc enroll; phiên cũ (trước cột stepsSnapshot) fallback
  // đọc steps live của sequence — dual-read, không bỏ rơi dữ liệu cũ.
  // Luồng bị TẮT (enabled=false) → phiên đang chạy tạm ngưng gửi, tự chạy tiếp khi bật lại.
  let steps: SequenceDraftStep[] = parseSequenceSteps(session.stepsSnapshot);
  if (session.sourceSequenceId) {
    const seq = await prisma.automationSequence.findFirst({
      where: { id: session.sourceSequenceId, orgId: session.orgId },
      select: { enabled: true, steps: true },
    });
    if (seq && !seq.enabled) return false;
    if (!steps.length) steps = parseSequenceSteps(seq?.steps);
  }

  if (!steps.length) {
    await closeSession(session, 'no_steps', 'luong khong con buoc nao de gui');
    return false;
  }
  const idx = session.currentStepIdx;
  if (idx >= steps.length) {
    // An toàn: con trỏ đã qua bước cuối (dữ liệu cũ/sửa tay) → chốt hoàn thành.
    await closeSession(session, 'completed', null);
    return false;
  }

  // Pre-check trần tin/nick fail-CLOSED — limiter sự cố thì HOÃN, không xả tin vượt trần.
  const gate = await zaloRateLimiter.checkLimits(session.nickId, 'message', { failClosed: true });
  if (!gate.allowed) return false; // giữ nguyên nextRunAt, tick sau thử lại

  // CLAIM optimistic: chỉ tick thắng mới gửi (chống 2 tick/2 instance gửi trùng 1 bước).
  const claimed = await prisma.careSession.updateMany({
    where: { id: session.id, state: 'active', currentStepIdx: idx, nextRunAt: session.nextRunAt },
    data: { nextRunAt: new Date(now.getTime() + LEASE_MS) },
  });
  if (claimed.count !== 1) return false; // tick khác đã claim

  // Resolve UID người nhận theo nick: ưu tiên externalThreadId đã neo lúc enroll,
  // fallback Friend (đã kết bạn trước, rồi bất kỳ identity nào của cặp nick×KH).
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
    return false;
  }

  const contact = await prisma.contact.findFirst({
    where: { id: session.contactId, orgId: session.orgId },
    select: { crmName: true, fullName: true, zaloUsername: true, phone: true },
  });
  const step = steps[idx];
  const text = renderMessage(step.text, {
    name: contact?.crmName ?? contact?.fullName ?? contact?.zaloUsername ?? null,
    phone: contact?.phone ?? null,
  });

  try {
    if (config.marketingDryRun) {
      // DRY-RUN backend: KHÔNG gọi Zalo thật; vẫn tiến bước để phiên không kẹt hàng đợi.
      await advanceStep(session, steps, idx, now, `[dry-run] ${text}`, uid);
      logger.info(`[care-session-cron] [dry-run] session=${session.id} step=${idx + 1}/${steps.length} bỏ qua gửi thật → uid=${uid}`);
      return true;
    }
    await zaloOps.sendMessage(session.nickId, uid, 0, { msg: text });
    await advanceStep(session, steps, idx, now, text, uid);
    logger.info(`[care-session-cron] session=${session.id} step=${idx + 1}/${steps.length} sent → uid=${uid}`);
    return true;
  } catch (err: any) {
    if (err instanceof ZaloOpError && (err.code === 'RATE_LIMITED' || err.code === 'NOT_CONNECTED')) {
      // Nick chạm trần/mất kết nối — dời lịch, KHÔNG tính attempt cho khách.
      await prisma.careSession.updateMany({
        where: { id: session.id, state: 'active' },
        data: { nextRunAt: new Date(now.getTime() + LEASE_MS), lastError: err.code },
      }).catch(() => {});
      logger.warn(`[care-session-cron] session=${session.id} deferred by nick: ${err.code}`);
      return true;
    }
    await failStep(session, idx, now, String(err?.message ?? err).slice(0, 500));
    return true;
  }
}

/** Gửi thành công → tiến con trỏ bước; hết bước → đóng phiên 'completed'. */
async function advanceStep(
  session: SessionRow, steps: SequenceDraftStep[], idx: number, now: Date, sentText: string, uid: string,
): Promise<void> {
  const nextIdx = idx + 1;
  const isLast = nextIdx >= steps.length;
  const nextDelayMs = isLast ? 0 : Math.max(0, steps[nextIdx].delayMinutes) * 60 * 1000;

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

  await prisma.careSessionEvent.create({
    data: {
      sessionId: session.id,
      eventId: `step_sent:${idx}:${session.enrollEpoch ?? 1}`,
      eventType: 'step_sent',
      payload: { stepIdx: idx, totalSteps: steps.length, text: sentText.slice(0, 500), uid },
    },
  }).catch(() => {}); // event log best-effort (unique = idempotency, trùng thì bỏ)

  if (isLast && session.sourceSequenceId) {
    await prisma.automationSequence.updateMany({
      where: { id: session.sourceSequenceId, orgId: session.orgId },
      data: { completedCount: { increment: 1 } },
    }).catch(() => {});
  }
}

/** Lỗi bước: retry có giới hạn; quá MAX_ATTEMPTS → đóng phiên 'step_failed'. */
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
  logger.warn(`[care-session-cron] session=${session.id} step=${idx} attempt=${attempts}/${MAX_ATTEMPTS} failed: ${error}`);
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
  }).catch(() => {});
  logger.info(`[care-session-cron] session=${session.id} closed (${reason})`);
}
