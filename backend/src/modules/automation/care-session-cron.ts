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
 *
 * Refactor 2026-07-22: logic xử lý 1 bước tách sang process-care-session-step.ts
 * (dùng chung giữa cron tick và endpoint "Gửi bước tiếp ngay").
 */
import cron from 'node-cron';
import { prisma } from '../../shared/database/prisma-client.js';
import { logger } from '../../shared/utils/logger.js';
import { runSystemQuery, withTenant } from '../../shared/tenant/tenant-context.js';
import { isWithinSendWindow } from '../broadcast/broadcast-service.js';
import { parseSnapshotRules } from './sequence-snapshot.js';
import { processCareSessionStep, type SessionRow } from './process-care-session-step.js';

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

const SESSION_SELECT = {
  id: true, orgId: true, contactId: true, nickId: true,
  externalThreadId: true, sourceSequenceId: true,
  stepsSnapshot: true, rulesSnapshot: true,
  currentStepIdx: true, nextRunAt: true, attemptCount: true,
  enrollEpoch: true, state: true,
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
    const touched = await withTenant(session.orgId, () => processSessionViaTick(session as SessionRow, now))
      .catch((err) => {
        logger.error(`[care-session-cron] session=${session.id} error`, err);
        return true; // lỗi bất ngờ — coi như nick đã đụng, không dồn thêm trong tick này
      });
    if (touched) touchedNicks.add(session.nickId);
  }
}

/** Wrapper cron: kiểm tra send window/gap riêng phiên trước khi gọi service chung. */
async function processSessionViaTick(session: SessionRow, now: Date): Promise<boolean> {
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

  // Delegate sang service chung.
  const result = await processCareSessionStep({
    sessionId: session.id,
    orgId: session.orgId,
    trigger: 'scheduled',
    preloadedSession: session,
  });

  // Log lý do khi worker KHÔNG gửi (deferReason/error) — để quan sát vì sao bước chưa đi.
  // Gửi thành công đã có log riêng ở zaloOps nên không log lại ở đây (tránh nhiễu).
  if (result.deliveryMode !== 'sent' && (result.deferReason || result.error)) {
    logger.info(`[care-session-cron] session=${session.id} → deferReason=${result.deferReason ?? '-'} error=${result.error ?? '-'}`);
  }

  return result.touchedZalo === true || result.processed === true;
}
