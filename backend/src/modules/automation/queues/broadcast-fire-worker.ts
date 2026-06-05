// ════════════════════════════════════════════════════════════════════════
// Broadcasts Đợt 1 (2026-06-05) — BullMQ broadcast-fire-worker
// ════════════════════════════════════════════════════════════════════════
//
// Replace stub no-op tại fire-broadcast.ts:119. Worker REAL gửi tin Zalo.
//
// Job design — "tick-job" pattern (KHÔNG enqueue 1 job/KH):
//   - 1 job duy nhất per broadcast = "tick" → worker pull list KH chưa gửi,
//     gửi tuần tự với delay random 3-10s/KH (configurable trong pacing)
//   - Hết slot mỗi tick: enqueue tick tiếp theo (lazy chain) — tránh BullMQ
//     phình queue với 10k+ job nhỏ
//   - Trên error/window/cap → moveToDelayed cho lần tick tiếp
//
// Per-tick budget:
//   - Mỗi tick gửi tối đa 50 KH (tránh job dài quá → BullMQ stale)
//   - Hết 50 → enqueue tick tiếp theo ngay với delay nhỏ (10s)
//
// Resume cursor:
//   - AutomationBroadcast.resumeCursor = lastSentContactId
//   - Worker WHERE contactId > cursor để pickup
//
// Window 6-22 + nick rotation cap 300/day (Anh chốt 2026-06-05):
//   - Trước mỗi tin: check VN hour ∈ [6, 22). Out-of-window → defer tới 6h sáng VN
//   - Per-nick cap: lookup quota_redis hoặc count Messages 24h, rotate nếu hết
//
// State transitions:
//   draft → scheduled → running → completed
//                    ↘ paused (resume)
//                    ↘ cancelled

import { Worker, type Job } from 'bullmq';
import { randomUUID } from 'node:crypto';
import { prisma } from '../../../shared/database/prisma-client.js';
import { logger } from '../../../shared/utils/logger.js';
import { zaloOps } from '../../../shared/zalo-operations.js';
import { applyContactAggregateFromMessage } from '../../contacts/contact-aggregate.js';
import { getBullMQRedis } from './redis-connection.js';
import {
  QUEUE_NAMES,
  buildBroadcastTickJobId,
  getBroadcastFireQueue,
} from './queue-registry.js';
import { classifyError } from './error-classify.js';

// ── Config ──────────────────────────────────────────────────────────────
const CONTACTS_PER_TICK = 50;     // Tối đa KH gửi trong 1 tick
const TICK_CHAIN_DELAY_MS = 10_000; // 10s giữa các tick (cộng thêm với delay /KH)
const DEFAULT_DELAY_MIN_MS = 3_000;
const DEFAULT_DELAY_MAX_MS = 10_000;
const DEFAULT_HOUR_START = 6;
const DEFAULT_HOUR_END = 22;
const DEFAULT_NICK_DAY_CAP = 300;
const STUB_MODE = process.env.AUTOMATION_STUB_MODE === 'true';

// ── Job payload ─────────────────────────────────────────────────────────
export interface BroadcastFireJobData {
  broadcastId: string;
  orgId: string;
  tickIdx: number;
}

export interface BroadcastFireResult {
  status: 'tick_done' | 'completed' | 'paused' | 'cancelled' | 'deferred';
  sent: number;
  failed: number;
  skipped: number;
  reason?: string;
}

// ── Helpers ─────────────────────────────────────────────────────────────
function vnHour(d: Date = new Date()): number {
  // UTC+7
  const vnTime = new Date(d.getTime() + 7 * 60 * 60 * 1000);
  return vnTime.getUTCHours();
}

function next6amVN(now: Date = new Date()): Date {
  // Tính 6:00 VN sáng tới
  const vnOffsetMs = 7 * 60 * 60 * 1000;
  const vnNow = new Date(now.getTime() + vnOffsetMs);
  const y = vnNow.getUTCFullYear();
  const m = vnNow.getUTCMonth();
  const d = vnNow.getUTCDate();
  const h = vnNow.getUTCHours();
  // Nếu giờ VN < 6 → 6h sáng cùng ngày VN; nếu ≥ 6 (out-of-window 22+) → 6h sáng hôm sau VN
  const dayOffset = h < 6 ? 0 : 1;
  return new Date(Date.UTC(y, m, d + dayOffset, 6, 0, 0) - vnOffsetMs);
}

function randomDelay(min: number, max: number): number {
  return Math.floor(min + Math.random() * Math.max(0, max - min));
}

interface BroadcastConfig {
  delayMinMs: number;
  delayMaxMs: number;
  hourStart: number;
  hourEnd: number;
  nickDayCap: number;
  excludeBlocked: boolean;
}

function readBroadcastConfig(pacing: unknown): BroadcastConfig {
  const p = (pacing ?? {}) as Record<string, any>;
  const delay = p.randomDelayBetweenSends ?? { min: DEFAULT_DELAY_MIN_MS, max: DEFAULT_DELAY_MAX_MS };
  return {
    delayMinMs: typeof delay.min === 'number' ? delay.min : DEFAULT_DELAY_MIN_MS,
    delayMaxMs: typeof delay.max === 'number' ? delay.max : DEFAULT_DELAY_MAX_MS,
    hourStart: typeof p.hourStart === 'number' ? p.hourStart : DEFAULT_HOUR_START,
    hourEnd: typeof p.hourEnd === 'number' ? p.hourEnd : DEFAULT_HOUR_END,
    nickDayCap: typeof p.nickDayCap === 'number' ? p.nickDayCap : DEFAULT_NICK_DAY_CAP,
    excludeBlocked: p.excludeBlocked !== false,
  };
}

// ── Nick rotation: list nicks online, pick lowest-load ──────────────────
async function pickAvailableNicks(orgId: string): Promise<Array<{ id: string; sentToday: number }>> {
  const nicks = await prisma.zaloAccount.findMany({
    where: { orgId, status: 'connected' },
    select: { id: true },
  });
  if (nicks.length === 0) return [];
  // Count messages sent by each nick in last 24h
  const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const results = await Promise.all(
    nicks.map(async (n) => {
      const sentToday = await prisma.message.count({
        where: {
          conversation: { zaloAccountId: n.id },
          senderType: 'self',
          sentAt: { gte: dayAgo },
          sentVia: 'automation',
        },
      });
      return { id: n.id, sentToday };
    }),
  );
  return results.sort((a, b) => a.sentToday - b.sentToday);
}

// ── Render template với 3 biến {gender} {name} {sale} ───────────────────
function renderTemplate(
  template: string,
  vars: { gender?: string; name?: string; sale?: string },
): string {
  return template
    .replace(/\{gender\}/g, vars.gender ?? 'Anh Chị')
    .replace(/\{name\}/g, vars.name ?? '')
    .replace(/\{sale\}/g, vars.sale ?? '');
}

function genderFromZaloProfile(g: string | null | undefined): string {
  if (g === 'male' || g === 'm' || g === '1') return 'Anh';
  if (g === 'female' || g === 'f' || g === '2') return 'Chị';
  return 'Anh Chị';
}

function lastWordOfName(fullName: string): string {
  const parts = fullName.trim().split(/\s+/);
  return parts[parts.length - 1] ?? fullName;
}

// ── Resolve thread to send (per-account UID trap M5) ────────────────────
interface SendTarget {
  contactId: string;
  nickId: string;
  threadId: string;
  threadType: 0 | 1;
  conversationId: string;
  contactName: string;
  gender: string;
}

async function resolveSendTargets(
  orgId: string,
  contactIds: string[],
  pickedNickId: string,
): Promise<SendTarget[]> {
  if (contactIds.length === 0) return [];
  // Lấy Friend rows cho từng contact theo nick được chọn
  const friends = await prisma.friend.findMany({
    where: {
      contactId: { in: contactIds },
      orgId,
      zaloAccountId: pickedNickId,
      friendshipStatus: 'accepted',
    },
    select: {
      contactId: true,
      zaloUidInNick: true,
      zaloAccountId: true,
      contact: { select: { fullName: true, gender: true } },
    },
  });
  const targets: SendTarget[] = [];
  for (const f of friends) {
    if (!f.contactId || !f.zaloUidInNick) continue;
    // Get-or-create conversation
    const externalThreadId = f.zaloUidInNick;
    let conv = await prisma.conversation.findFirst({
      where: { zaloAccountId: f.zaloAccountId, externalThreadId, threadType: 'user' },
      select: { id: true },
    });
    if (!conv) {
      conv = await prisma.conversation.create({
        data: {
          orgId,
          zaloAccountId: f.zaloAccountId,
          externalThreadId,
          threadType: 'user',
          contactId: f.contactId,
        },
        select: { id: true },
      });
    }
    targets.push({
      contactId: f.contactId,
      nickId: f.zaloAccountId,
      threadId: externalThreadId,
      threadType: 0,
      conversationId: conv.id,
      contactName: f.contact?.fullName ?? '',
      gender: genderFromZaloProfile(f.contact?.gender),
    });
  }
  return targets;
}

// ── Pull list contactId chưa gửi (theo Campaign tasks) ──────────────────
async function pullPendingContactIds(
  broadcastId: string,
  limit: number,
  resumeCursor: string | null,
): Promise<string[]> {
  // Broadcasts dùng AutomationCampaign.segmentSnapshot.contactIds[] làm source.
  // Khi fire-broadcast (refactored) chạy: snapshot contactIds vào campaign + state='active'.
  // Worker đọc list từ snapshot, dedup với resumeCursor.
  const campaign = await prisma.automationCampaign.findFirst({
    where: { broadcastId, state: 'active' },
    select: { id: true, segmentSnapshot: true },
    orderBy: { createdAt: 'desc' },
  });
  if (!campaign) return [];
  const snapshot = campaign.segmentSnapshot as { contactIds?: string[] } | null;
  const allIds = Array.isArray(snapshot?.contactIds) ? snapshot!.contactIds! : [];
  if (allIds.length === 0) return [];

  // resumeCursor: lấy IDs sau cursor
  let pending = allIds;
  if (resumeCursor) {
    const idx = allIds.indexOf(resumeCursor);
    if (idx >= 0) pending = allIds.slice(idx + 1);
  }
  return pending.slice(0, limit);
}

// ── Send 1 tin với handler shared ───────────────────────────────────────
async function sendOneBroadcastMessage(
  target: SendTarget,
  template: string,
  saleName: string,
): Promise<{ ok: boolean; messageId?: string; error?: string; permanent?: boolean }> {
  const rendered = renderTemplate(template, {
    gender: target.gender,
    name: target.contactName,
    sale: saleName,
  });

  if (STUB_MODE) {
    logger.info(`[broadcast STUB] would send "${rendered.slice(0, 60)}..." via nick ${target.nickId} to ${target.contactId}`);
    return { ok: true, messageId: `stub-${randomUUID()}` };
  }

  try {
    const resp = await zaloOps.sendMessage(
      target.nickId,
      target.threadId,
      target.threadType,
      { msg: rendered },
    );
    const messageId = (resp as any)?.message?.msgId ?? `bc-${randomUUID()}`;

    // Persist Message row
    await prisma.message.create({
      data: {
        conversationId: target.conversationId,
        zaloMsgId: messageId,
        senderType: 'self',
        senderName: 'Broadcast',
        content: rendered,
        contentType: 'text',
        sentAt: new Date(),
        sentVia: 'automation',
      },
    });
    await prisma.conversation.update({
      where: { id: target.conversationId },
      data: { lastMessageAt: new Date(), isReplied: false },
    });

    // Fire-and-forget aggregate update (không await để worker không block)
    applyContactAggregateFromMessage({
      conversationId: target.conversationId,
      message: {
        id: messageId,
        content: rendered,
        contentType: 'text',
        sentAt: new Date(),
        senderType: 'self',
      },
    }).catch((err: any) => logger.warn(`[broadcast] aggregate failed: ${err.message}`));

    return { ok: true, messageId };
  } catch (err: any) {
    const classified = classifyError(err);
    return {
      ok: false,
      error: classified.message ?? err.message ?? 'unknown',
      permanent: classified.classification === 'permanent',
    };
  }
}

// ── Worker job processor ────────────────────────────────────────────────
async function processBroadcastTick(
  job: Job<BroadcastFireJobData, BroadcastFireResult>,
): Promise<BroadcastFireResult> {
  const { broadcastId, orgId, tickIdx } = job.data;
  const startedAt = Date.now();
  logger.info(`[broadcast-fire] tick ${tickIdx} start broadcast=${broadcastId}`);

  // Load broadcast
  const bc = await prisma.automationBroadcast.findUnique({
    where: { id: broadcastId },
    select: {
      id: true,
      orgId: true,
      state: true,
      blockId: true,
      pacing: true,
      resumeCursor: true,
      sentCount: true,
      failedCount: true,
      totalRecipients: true,
      createdById: true,
    },
  });
  if (!bc) {
    logger.warn(`[broadcast-fire] broadcast ${broadcastId} not found, skipping`);
    return { status: 'cancelled', sent: 0, failed: 0, skipped: 0, reason: 'not_found' };
  }
  if (bc.state === 'paused') {
    return { status: 'paused', sent: 0, failed: 0, skipped: 0, reason: 'state_paused' };
  }
  if (bc.state === 'cancelled' || bc.state === 'completed') {
    return { status: bc.state as any, sent: 0, failed: 0, skipped: 0, reason: `state_${bc.state}` };
  }

  const cfg = readBroadcastConfig(bc.pacing);

  // Window check
  const hour = vnHour();
  if (hour < cfg.hourStart || hour >= cfg.hourEnd) {
    const next6 = next6amVN();
    logger.info(`[broadcast-fire] out-of-window (vnHour=${hour}), defer to ${next6.toISOString()}`);
    await getBroadcastFireQueue().add(
      'tick',
      { broadcastId, orgId, tickIdx: tickIdx + 1 } satisfies BroadcastFireJobData,
      { delay: next6.getTime() - Date.now(), jobId: buildBroadcastTickJobId(broadcastId, tickIdx + 1) },
    );
    return { status: 'deferred', sent: 0, failed: 0, skipped: 0, reason: 'out_of_window' };
  }

  // Load template from Block
  const block = await prisma.block.findUnique({
    where: { id: bc.blockId },
    select: { content: true },
  });
  const content = block?.content as { textVariants?: string[] } | null;
  const templates = Array.isArray(content?.textVariants) ? content!.textVariants! : [];
  if (templates.length === 0) {
    logger.error(`[broadcast-fire] block ${bc.blockId} has no textVariants — aborting`);
    await prisma.automationBroadcast.update({
      where: { id: broadcastId },
      data: { state: 'cancelled', completedAt: new Date() },
    });
    return { status: 'cancelled', sent: 0, failed: 0, skipped: 0, reason: 'empty_template' };
  }
  const template = templates[0];

  // Load creator (sale name)
  const creator = await prisma.user.findUnique({
    where: { id: bc.createdById },
    select: { fullName: true },
  });
  const saleName = creator?.fullName ? lastWordOfName(creator.fullName) : 'CRM';

  // Pull pending contactIds
  const pendingIds = await pullPendingContactIds(broadcastId, CONTACTS_PER_TICK, bc.resumeCursor);
  if (pendingIds.length === 0) {
    // No more → mark completed
    await prisma.automationBroadcast.update({
      where: { id: broadcastId },
      data: { state: 'completed', completedAt: new Date() },
    });
    logger.info(`[broadcast-fire] broadcast ${broadcastId} COMPLETED (sent=${bc.sentCount}, failed=${bc.failedCount})`);
    // Fire event hook to notify creator
    void notifyBroadcastCompleted(broadcastId).catch((err) =>
      logger.warn(`[broadcast-fire] notify failed: ${err.message}`),
    );
    return { status: 'completed', sent: 0, failed: 0, skipped: 0 };
  }

  // Pick nick (rotation: lowest sentToday)
  const nicks = await pickAvailableNicks(orgId);
  if (nicks.length === 0) {
    logger.warn(`[broadcast-fire] no available nick for broadcast ${broadcastId} — pausing`);
    await prisma.automationBroadcast.update({
      where: { id: broadcastId },
      data: { state: 'paused' },
    });
    return { status: 'paused', sent: 0, failed: 0, skipped: 0, reason: 'no_nick_available' };
  }

  // Loop send
  let sent = 0;
  let failed = 0;
  let skipped = 0;
  let lastSentContactId: string | null = bc.resumeCursor;

  for (const contactId of pendingIds) {
    // Re-check state (Anh có thể pause giữa chừng)
    const fresh = await prisma.automationBroadcast.findUnique({
      where: { id: broadcastId },
      select: { state: true },
    });
    if (!fresh || fresh.state === 'paused' || fresh.state === 'cancelled') {
      logger.info(`[broadcast-fire] state changed to ${fresh?.state}, stopping mid-tick`);
      break;
    }

    // Pick a nick with quota remaining
    const availableNick = nicks.find((n) => n.sentToday < cfg.nickDayCap);
    if (!availableNick) {
      logger.warn(`[broadcast-fire] all nicks hit day-cap ${cfg.nickDayCap}, defer to next 6am VN`);
      const next6 = next6amVN();
      await getBroadcastFireQueue().add(
        'tick',
        { broadcastId, orgId, tickIdx: tickIdx + 1 } satisfies BroadcastFireJobData,
        { delay: next6.getTime() - Date.now(), jobId: buildBroadcastTickJobId(broadcastId, tickIdx + 1) },
      );
      break;
    }

    // Resolve target
    const targets = await resolveSendTargets(orgId, [contactId], availableNick.id);
    if (targets.length === 0) {
      // KH chưa kết bạn với nick này → skip
      skipped++;
      lastSentContactId = contactId;
      continue;
    }

    const result = await sendOneBroadcastMessage(targets[0], template, saleName);
    if (result.ok) {
      sent++;
      availableNick.sentToday++;
    } else {
      failed++;
      logger.warn(`[broadcast-fire] send failed for contact ${contactId}: ${result.error}`);
    }
    lastSentContactId = contactId;

    // Update cursor + counters thường xuyên (mỗi 5 KH để giảm DB round-trip)
    if ((sent + failed + skipped) % 5 === 0) {
      await prisma.automationBroadcast.update({
        where: { id: broadcastId },
        data: {
          resumeCursor: lastSentContactId,
          sentCount: { increment: sent },
          failedCount: { increment: failed },
        },
      });
      // Reset local counters
      sent = 0;
      failed = 0;
    }

    // Delay random 3-10s
    if (pendingIds.indexOf(contactId) < pendingIds.length - 1) {
      const delayMs = randomDelay(cfg.delayMinMs, cfg.delayMaxMs);
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }

  // Flush remaining counters
  await prisma.automationBroadcast.update({
    where: { id: broadcastId },
    data: {
      resumeCursor: lastSentContactId,
      sentCount: { increment: sent },
      failedCount: { increment: failed },
    },
  });

  // Schedule next tick (if not stopped)
  const after = await prisma.automationBroadcast.findUnique({
    where: { id: broadcastId },
    select: { state: true },
  });
  if (after && after.state === 'running') {
    await getBroadcastFireQueue().add(
      'tick',
      { broadcastId, orgId, tickIdx: tickIdx + 1 } satisfies BroadcastFireJobData,
      { delay: TICK_CHAIN_DELAY_MS, jobId: buildBroadcastTickJobId(broadcastId, tickIdx + 1) },
    );
  }

  const elapsedMs = Date.now() - startedAt;
  logger.info(`[broadcast-fire] tick ${tickIdx} done broadcast=${broadcastId} sent=${sent} failed=${failed} skipped=${skipped} elapsed=${elapsedMs}ms`);
  return { status: 'tick_done', sent, failed, skipped };
}

// ── Notify creator via system-notifications ─────────────────────────────
async function notifyBroadcastCompleted(broadcastId: string): Promise<void> {
  const bc = await prisma.automationBroadcast.findUnique({
    where: { id: broadcastId },
    select: {
      id: true, name: true, orgId: true, createdById: true,
      totalRecipients: true, sentCount: true, deliveredCount: true, failedCount: true,
      startedAt: true, completedAt: true,
    },
  });
  if (!bc) return;
  try {
    const { sendSystemNotificationToUser } = await import('../../system-notifications/system-notify-service.js');
    const elapsedMs = bc.startedAt && bc.completedAt
      ? bc.completedAt.getTime() - bc.startedAt.getTime()
      : 0;
    const elapsedMin = Math.round(elapsedMs / 60000);
    const successPct = bc.sentCount > 0 ? Math.round((bc.sentCount - bc.failedCount) / bc.sentCount * 100) : 0;
    const content = `✅ Broadcast "${bc.name}" hoàn thành\n` +
      `Đã gửi: ${bc.sentCount}/${bc.totalRecipients}\n` +
      `Lỗi: ${bc.failedCount} (${100 - successPct}%)\n` +
      `Thời gian: ${elapsedMin}m\n` +
      `📊 Xem chi tiết: /marketing/broadcasts/${bc.id}`;
    await sendSystemNotificationToUser({
      orgId: bc.orgId,
      targetUserId: bc.createdById,
      type: 'broadcast_completed',
      title: `Broadcast "${bc.name}" hoàn thành`,
      content,
      urgency: 0,
      priority: 'normal',
    });
  } catch (err: any) {
    logger.warn(`[broadcast-fire] notify creator failed: ${err.message}`);
  }
}

// ── Worker lifecycle ────────────────────────────────────────────────────
let workerInstance: Worker<BroadcastFireJobData, BroadcastFireResult> | null = null;

export function startBroadcastFireWorker(): void {
  if (workerInstance) {
    logger.warn('[broadcast-fire] worker already started');
    return;
  }
  workerInstance = new Worker<BroadcastFireJobData, BroadcastFireResult>(
    QUEUE_NAMES.BROADCAST_FIRE,
    processBroadcastTick,
    {
      connection: getBullMQRedis(),
      concurrency: 2, // Mỗi tick gửi 50 KH ~5-8 phút, 2 broadcast song song là đủ
    },
  );
  workerInstance.on('completed', (job) => {
    logger.debug(`[broadcast-fire] job ${job.id} completed`);
  });
  workerInstance.on('failed', (job, err) => {
    logger.error(`[broadcast-fire] job ${job?.id} failed: ${err.message}`);
  });
  workerInstance.on('error', (err) => {
    logger.error(`[broadcast-fire] worker error: ${err.message}`);
  });
  logger.info('[broadcast-fire] worker started');
}

export async function stopBroadcastFireWorker(): Promise<void> {
  if (workerInstance) {
    await workerInstance.close();
    workerInstance = null;
    logger.info('[broadcast-fire] worker stopped');
  }
}

// Export internals for test
export const __test = { processBroadcastTick, renderTemplate, vnHour, next6amVN };
