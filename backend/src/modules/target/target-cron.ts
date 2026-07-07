// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Huỳnh Ngọc Thuận — Community extension
/**
 * target-cron.ts — Worker Mục tiêu (auto kết bạn).
 *
 * Tick mỗi 30s, mỗi job active thử gửi TỐI ĐA 1 lời mời/tick, tôn trọng giãn cách
 * delaySecMin..Max + khung giờ 8h-21h (dùng chung broadcast-service). Nguồn target:
 * CustomerListEntry của tệp với hasZalo=true, chưa xử lý trong job này.
 *
 * QUAN TRỌNG: attemptFriendRequest() (campaign-service, có sẵn từ trước) tạo
 * FriendshipAttempt NGAY (unique theo nick+contact) trước khi gọi Zalo API — nếu
 * cứ gọi đều khi nick đã chạm trần friend_action, sẽ "đốt" vĩnh viễn từng contact
 * thành lỗi (không thể thử lại contact đó với nick này nữa). Nên PRE-CHECK qua
 * zaloRateLimiter.checkLimits() (không tốn gì, không ghi nhận) trước khi thử —
 * nick chạm trần thì bỏ qua tick, không đụng tới contact nào cả.
 */
import cron from 'node-cron';
import { prisma } from '../../shared/database/prisma-client.js';
import { logger } from '../../shared/utils/logger.js';
import { runSystemQuery, withTenant } from '../../shared/tenant/tenant-context.js';
import { zaloRateLimiter } from '../zalo/zalo-rate-limiter.js';
import { resolveOrCreateContact } from '../contacts/resolve-contact.js';
import { attemptFriendRequest } from '../campaign/campaign-service.js';
import { renderMessage, randomDelayMs, isWithinSendWindow } from '../broadcast/broadcast-service.js';

let running = false;

export function startTargetCron(): void {
  cron.schedule('*/30 * * * * *', async () => {
    if (running) return; // chống chồng tick khi findUser/sendFriendRequest chậm
    running = true;
    try {
      await runTargetTick();
    } catch (err) {
      logger.error('[target-cron] tick error', err);
    } finally {
      running = false;
    }
  });
  logger.info('[target-cron] scheduled every 30s');
}

type JobRow = {
  id: string; orgId: string; customerListId: string; zaloAccountId: string;
  requestMsg: string; maxTotal: number; delaySecMin: number; delaySecMax: number;
  lastSentAt: Date | null; sentCount: number; noZaloCount: number; failedCount: number;
};

export async function runTargetTick(): Promise<void> {
  const now = new Date();
  if (!isWithinSendWindow(now)) return; // ngoài khung giờ 8h-21h — chờ tick sau

  const jobs = await runSystemQuery(() =>
    prisma.targetJob.findMany({
      where: { status: 'active' },
      select: {
        id: true, orgId: true, customerListId: true, zaloAccountId: true,
        requestMsg: true, maxTotal: true, delaySecMin: true, delaySecMax: true,
        lastSentAt: true, sentCount: true, noZaloCount: true, failedCount: true,
      },
    }),
  );

  for (const job of jobs) {
    await withTenant(job.orgId, () => processJob(job, now))
      .catch((err) => logger.error(`[target-cron] job=${job.id} error`, err));
  }
}

async function processJob(job: JobRow, now: Date): Promise<void> {
  // Giãn cách chống block giữa 2 lời mời
  if (job.lastSentAt && now.getTime() - job.lastSentAt.getTime() < randomDelayMs(job.delaySecMin, job.delaySecMax)) {
    return;
  }

  const processed = job.sentCount + job.noZaloCount + job.failedCount;
  if (processed >= job.maxTotal) {
    await prisma.targetJob.update({ where: { id: job.id }, data: { status: 'done' } });
    logger.info(`[target-cron] job=${job.id} done (maxTotal reached)`);
    return;
  }

  // Pre-check trần friend_action — KHÔNG ghi nhận gì, chỉ để tránh đốt contact khi nick chạm trần.
  const check = await zaloRateLimiter.checkLimits(job.zaloAccountId, 'friend_action');
  if (!check.allowed) return; // chờ tick sau, giữ nguyên target chưa xử lý

  // Người kế tiếp: entry có Zalo, chưa xử lý trong job này
  const done = await prisma.targetRunItem.findMany({ where: { jobId: job.id }, select: { entryId: true } });
  const entry = await prisma.customerListEntry.findFirst({
    where: {
      customerListId: job.customerListId,
      hasZalo: true,
      ...(done.length ? { id: { notIn: done.map((d) => d.entryId) } } : {}),
    },
    orderBy: { rowIndex: 'asc' },
    select: { id: true, phoneLocal: true, phoneE164: true, nameRaw: true, zaloName: true, zaloUid: true, contactId: true },
  });
  if (!entry) {
    await prisma.targetJob.update({ where: { id: job.id }, data: { status: 'done' } });
    logger.info(`[target-cron] job=${job.id} done (hết đối tượng trong tệp)`);
    return;
  }

  const phone = entry.phoneLocal ?? entry.phoneE164 ?? '';
  const name = entry.zaloName ?? entry.nameRaw ?? null;

  try {
    // 1. Đảm bảo entry có Contact (attemptFriendRequest cần contactId) — tạo nếu chưa có.
    let contactId = entry.contactId;
    if (!contactId) {
      const c = await resolveOrCreateContact({
        orgId: job.orgId,
        zaloAccountId: job.zaloAccountId,
        zaloUidInNick: entry.zaloUid,
        phone: entry.phoneE164,
        fallbackFullName: name,
      });
      contactId = c.id;
      await prisma.customerListEntry.update({ where: { id: entry.id }, data: { contactId } });
    }

    // 2. Gửi lời mời kết bạn — tái dùng nguyên vẹn attemptFriendRequest (đã có
    //    audit trail FriendshipAttempt + mirror Friend "Đã gửi lời mời").
    const message = renderMessage(job.requestMsg, { name, phone });
    const outcome = await attemptFriendRequest({
      orgId: job.orgId, zaloAccountId: job.zaloAccountId, contactId, phone, message,
    });

    if (outcome.ok) {
      await recordItem(job.id, job.orgId, entry.id, phone, name, outcome.zaloUid, 'sent', null);
      logger.info(`[target-cron] job=${job.id} sent → ${phone}`);
    } else if (outcome.state === 'no_zalo') {
      await recordItem(job.id, job.orgId, entry.id, phone, name, null, 'no_zalo', null);
    } else {
      await recordItem(job.id, job.orgId, entry.id, phone, name, null, 'failed', `${outcome.errorCode}: ${outcome.errorDetail}`.slice(0, 500));
    }
  } catch (err: any) {
    // Unique constraint (P2002) — nick này đã từng thử contact này rồi (vd trùng nguồn
    // giữa nhiều tệp). Ghi skipped, không tính lỗi, tiếp tục tick sau với entry kế tiếp.
    if (err?.code === 'P2002') {
      await recordItem(job.id, job.orgId, entry.id, phone, name, null, 'skipped', 'da_tung_thu_contact_nay');
      return;
    }
    await recordItem(job.id, job.orgId, entry.id, phone, name, null, 'failed', String(err?.message ?? err).slice(0, 500));
  }
}

async function recordItem(
  jobId: string, orgId: string, entryId: string, phone: string, name: string | null,
  zaloUid: string | null, status: 'sent' | 'no_zalo' | 'failed' | 'skipped', error: string | null,
): Promise<void> {
  const counter = status === 'sent' ? 'sentCount' : status === 'no_zalo' ? 'noZaloCount' : status === 'failed' ? 'failedCount' : null;
  await prisma.$transaction([
    prisma.targetRunItem.create({ data: { jobId, orgId, entryId, phone, name, zaloUid, status, error } }),
    prisma.targetJob.update({
      where: { id: jobId },
      data: { ...(counter ? { [counter]: { increment: 1 } } : {}), ...(status === 'sent' ? { lastSentAt: new Date() } : {}) },
    }),
  ]);
}
