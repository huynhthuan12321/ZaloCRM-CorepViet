// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Huỳnh Ngọc Thuận — Community extension
/**
 * broadcast-cron.ts — Worker Broadcast tự động.
 *
 * Tick mỗi 30s:
 *   1. Job đến hạn (status=active, nextRunAt <= now, chưa có run đang chạy)
 *      → tạo BroadcastRun + tính nextRunAt kế tiếp (daily/weekly) hoặc chờ done (once).
 *   2. Run đang chạy → gửi TỐI ĐA 1 tin/tick/run, tôn trọng giãn cách
 *      delaySecMin..Max (chống block). zaloOps tự gate thêm SdkLimit
 *      (trần tin/ngày/nick) — chạm trần thì run tự tạm dừng tới tick sau.
 *
 * Người nhận: CustomerListEntry của tệp với hasZalo=true. UID per-nick:
 *   - entry.resolvedByNickId === nick gửi → dùng entry.zaloUid có sẵn
 *   - khác nick → findUser(phone) resolve UID theo nick gửi (category friend_lookup)
 */
import cron from 'node-cron';
import type { Server } from 'socket.io';
import { prisma } from '../../shared/database/prisma-client.js';
import { logger } from '../../shared/utils/logger.js';
import { runSystemQuery, withTenant } from '../../shared/tenant/tenant-context.js';
import { zaloOps, ZaloOpError } from '../../shared/zalo-operations.js';
import { downloadMediaToTemp } from '../chat/chat-media-helpers.js';
import { renderMessage, computeNextRunAt, randomDelayMs, isWithinSendWindow, type ScheduleType } from './broadcast-service.js';

let running = false;

export function startBroadcastCron(io: Server | null): void {
  cron.schedule('*/30 * * * * *', async () => {
    if (running) return; // chống chồng tick khi gửi ảnh chậm
    running = true;
    try {
      await runBroadcastTick(io);
    } catch (err) {
      logger.error('[broadcast-cron] tick error', err);
    } finally {
      running = false;
    }
  });
  logger.info('[broadcast-cron] scheduled every 30s');
}

export async function runBroadcastTick(io: Server | null): Promise<void> {
  const now = new Date();

  // ── 1. Kích hoạt job đến hạn (SYSTEM scope để quét cross-org) ────────────
  const dueJobs = await runSystemQuery(() =>
    prisma.broadcastJob.findMany({
      where: { status: 'active', nextRunAt: { lte: now } },
      select: { id: true, orgId: true, scheduleType: true, scheduledAt: true, timeOfDay: true, daysOfWeek: true },
    }),
  );

  for (const job of dueJobs) {
    await withTenant(job.orgId, async () => {
      const hasRunning = await prisma.broadcastRun.findFirst({
        where: { jobId: job.id, status: 'running' }, select: { id: true },
      });
      if (hasRunning) return; // run cũ chưa xong — không chồng run

      await prisma.broadcastRun.create({ data: { jobId: job.id, orgId: job.orgId } });
      // once → nextRunAt=null (job sẽ done khi run kết thúc);
      // daily/weekly → tính lần kế tiếp ngay để không kích lặp lại trong lúc run chạy.
      const next = computeNextRunAt({
        scheduleType: job.scheduleType as ScheduleType,
        scheduledAt: job.scheduledAt, timeOfDay: job.timeOfDay,
        daysOfWeek: job.daysOfWeek, after: now,
      });
      await prisma.broadcastJob.update({
        where: { id: job.id },
        data: { lastRunAt: now, nextRunAt: next },
      });
      logger.info(`[broadcast-cron] job=${job.id} run started, next=${next?.toISOString() ?? 'none'}`);
    }).catch((err) => logger.error(`[broadcast-cron] activate job=${job.id} error`, err));
  }

  // ── 2. Xử lý run đang chạy ───────────────────────────────────────────────
  const runs = await runSystemQuery(() =>
    prisma.broadcastRun.findMany({
      where: { status: 'running' },
      select: { id: true, orgId: true, jobId: true, lastSentAt: true, sentCount: true, failedCount: true, skippedCount: true },
    }),
  );

  for (const run of runs) {
    await withTenant(run.orgId, () => processRun(run, io))
      .catch((err) => logger.error(`[broadcast-cron] run=${run.id} error`, err));
  }
}

type RunRow = { id: string; orgId: string; jobId: string; lastSentAt: Date | null; sentCount: number; failedCount: number; skippedCount: number };

async function processRun(run: RunRow, io: Server | null): Promise<void> {
  const job = await prisma.broadcastJob.findUnique({ where: { id: run.jobId } });
  if (!job || job.status === 'paused') return; // paused: giữ run, chờ resume
  const now = new Date();

  // Ngoài khung giờ gửi (8h-21h VN) — chờ tick sau, không tính lỗi cho khách
  if (!isWithinSendWindow(now)) return;

  // Giãn cách chống block giữa 2 tin
  if (run.lastSentAt && now.getTime() - run.lastSentAt.getTime() < randomDelayMs(job.delaySecMin, job.delaySecMax)) {
    return;
  }

  // Trần mỗi lần chạy
  const processed = run.sentCount + run.failedCount + run.skippedCount;
  if (processed >= job.maxPerRun) {
    await finishRun(run.id, job, 'done');
    return;
  }

  // Người nhận kế tiếp: entry có Zalo, chưa xử lý trong run này
  const done = await prisma.broadcastRunItem.findMany({
    where: { runId: run.id }, select: { entryId: true },
  });
  const entry = await prisma.customerListEntry.findFirst({
    where: {
      customerListId: job.customerListId,
      hasZalo: true,
      ...(done.length ? { id: { notIn: done.map((d) => d.entryId) } } : {}),
    },
    orderBy: { rowIndex: 'asc' },
    select: { id: true, phoneLocal: true, phoneE164: true, nameRaw: true, zaloName: true, zaloUid: true, resolvedByNickId: true },
  });
  if (!entry) {
    await finishRun(run.id, job, 'done');
    return;
  }

  const phone = entry.phoneLocal ?? entry.phoneE164 ?? '';
  const name = entry.zaloName ?? entry.nameRaw ?? null;

  try {
    // 1. Resolve UID theo nick gửi (UID Zalo là per-nick)
    let uid: string | null = null;
    if (entry.resolvedByNickId === job.zaloAccountId && entry.zaloUid) {
      uid = entry.zaloUid;
    } else {
      const user = await zaloOps.findUser(job.zaloAccountId, phone);
      uid = (user as any)?.uid ?? null;
    }
    if (!uid) {
      await recordItem(run, entry.id, phone, name, null, 'skipped', 'khong_tim_thay_uid');
      return;
    }

    // 2. Nội dung: xoay vòng Khối nội dung (spin content) nếu job có contentBlockIds,
    //    ngược lại dùng messageText/imageUrl gõ tay như cũ.
    const content = await resolveJobContent(job, processed);

    // 3. Gửi tin (text hoặc ảnh + caption)
    const text = renderMessage(content.messageText, { name, phone });
    if (content.imageUrl) {
      const media = await downloadMediaToTemp({ url: content.imageUrl }, 'image/jpeg');
      try {
        await zaloOps.sendImage(job.zaloAccountId, uid, 0, [media.path], io, text);
      } finally {
        await media.cleanup().catch(() => {});
      }
    } else {
      await zaloOps.sendMessage(job.zaloAccountId, uid, 0, { msg: text }, io);
    }
    await recordItem(run, entry.id, phone, name, uid, 'sent', null);
    if (content.blockId) {
      await prisma.contentBlock.update({ where: { id: content.blockId }, data: { usageCount: { increment: 1 } } }).catch(() => {});
    }
    logger.info(`[broadcast-cron] run=${run.id} sent → ${phone}`);
  } catch (err: any) {
    if (err instanceof ZaloOpError && (err.code === 'RATE_LIMITED' || err.code === 'NOT_CONNECTED')) {
      // Nick chạm trần hoặc mất kết nối — KHÔNG tính fail cho khách, chờ tick sau
      logger.warn(`[broadcast-cron] run=${run.id} paused by nick: ${err.code}`);
      return;
    }
    await recordItem(run, entry.id, phone, name, null, 'failed', String(err?.message ?? err).slice(0, 500));
  }
}

/**
 * Xoay vòng nội dung theo Khối nội dung (spin content chống spam): mỗi tin thứ N
 * trong run lấy block thứ (N % số block) theo đúng thứ tự job.contentBlockIds.
 * contentBlockIds rỗng → dùng messageText/imageUrl gõ tay của job (như cũ).
 */
async function resolveJobContent(
  job: { messageText: string; imageUrl: string | null; contentBlockIds: string[] },
  processedCount: number,
): Promise<{ messageText: string; imageUrl: string | null; blockId: string | null }> {
  if (job.contentBlockIds.length === 0) {
    return { messageText: job.messageText, imageUrl: job.imageUrl, blockId: null };
  }
  const blocks = await prisma.contentBlock.findMany({
    where: { id: { in: job.contentBlockIds } },
    select: { id: true, messageText: true, imageUrl: true },
  });
  const blockMap = new Map(blocks.map((b) => [b.id, b]));
  // Giữ đúng thứ tự đã chọn trong job.contentBlockIds (Map lookup bỏ qua block đã xoá).
  const ordered = job.contentBlockIds.map((id) => blockMap.get(id)).filter((b): b is NonNullable<typeof b> => !!b);
  if (ordered.length === 0) {
    return { messageText: job.messageText, imageUrl: job.imageUrl, blockId: null };
  }
  const pick = ordered[processedCount % ordered.length];
  return { messageText: pick.messageText, imageUrl: pick.imageUrl, blockId: pick.id };
}

async function recordItem(
  run: RunRow, entryId: string, phone: string, name: string | null,
  zaloUid: string | null, status: 'sent' | 'failed' | 'skipped', error: string | null,
): Promise<void> {
  const counter = status === 'sent' ? 'sentCount' : status === 'failed' ? 'failedCount' : 'skippedCount';
  await prisma.$transaction([
    prisma.broadcastRunItem.create({
      data: { runId: run.id, orgId: run.orgId, entryId, phone, name, zaloUid, status, error },
    }),
    prisma.broadcastRun.update({
      where: { id: run.id },
      data: { [counter]: { increment: 1 }, ...(status === 'sent' ? { lastSentAt: new Date() } : {}) },
    }),
  ]);
}

async function finishRun(runId: string, job: { id: string; scheduleType: string }, status: 'done' | 'error'): Promise<void> {
  await prisma.broadcastRun.update({
    where: { id: runId },
    data: { status, endedAt: new Date() },
  });
  if (job.scheduleType === 'once') {
    await prisma.broadcastJob.update({ where: { id: job.id }, data: { status: 'done' } });
  }
  logger.info(`[broadcast-cron] run=${runId} finished (${status})`);
}
