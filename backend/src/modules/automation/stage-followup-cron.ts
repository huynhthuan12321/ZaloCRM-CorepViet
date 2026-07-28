// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Huỳnh Ngọc Thuận — Community extension
/**
 * stage-followup-cron.ts — Đòn bẩy ③: tự bám đuổi khách ấm/nóng đang im lặng.
 *
 * Giai đoạn 3 (2026-07-28): nối Trí nhớ khách (Contact.metadata.customerSummary.stage,
 * Giai đoạn 2) với engine care-session sẵn có. Tick mỗi 15 phút:
 *   - Org nào bật cấu hình (AppSetting 'stage_followup_config') mới quét.
 *   - Khách có stage nằm trong cấu hình (map stage → sequenceId) + IM LẶNG đủ lâu
 *     (mặc định 24h, tính theo tin NHẮN CUỐI CỦA KHÁCH) → enroll CareSession
 *     sourceType='stage_followup'. Worker care-session-cron gửi bước như luồng thường
 *     (đủ luật: khung giờ 8-21h VN, giãn nick, rate-limit, pause khi khách trả lời).
 *
 * Luật an toàn (chống spam khách):
 *   - Cooldown: mỗi (KH × stage) chỉ auto-enroll 1 lần / cooldownDays (mặc định 14 ngày),
 *     đếm theo openedAt bất kể phiên đã đóng hay chưa (đọc closeConditions.stage).
 *   - Đang có phiên bám đuổi active bất kỳ (manual/target/stage) → không chồng thêm.
 *   - Khách im quá 30 ngày → coi như nguội hẳn, KHÔNG tự đào lại (stage có thể đã cũ).
 *   - Khách chưa từng nhắn tin → không bám đuổi.
 *   - Tối đa MAX_ENROLL_PER_TICK enroll mỗi org mỗi tick — không burst.
 *   - Sequence bị tắt/không còn bước → bỏ qua stage đó (log warn 1 lần mỗi tick).
 */
import cron from 'node-cron';
import { prisma } from '../../shared/database/prisma-client.js';
import { logger } from '../../shared/utils/logger.js';
import { runSystemQuery, withTenant } from '../../shared/tenant/tenant-context.js';
import { parseSequenceSteps } from './sequence-snapshot.js';

export const STAGE_FOLLOWUP_SETTING_KEY = 'stage_followup_config';

/** Stage hợp lệ để cấu hình auto bám đuổi (đồng bộ whitelist customer-summary-service). */
export const STAGE_FOLLOWUP_ALLOWED_STAGES = ['sap_chot', 'phan_van', 'dang_tim_hieu'] as const;
type FollowupStage = (typeof STAGE_FOLLOWUP_ALLOWED_STAGES)[number];

export type StageFollowupConfig = {
  enabled: boolean;
  /** Khách im lặng bao nhiêu giờ thì kích (1-168, mặc định 24). */
  silenceHours: number;
  /** Mỗi (KH × stage) tối đa 1 lần auto-enroll trong bấy nhiêu ngày (1-365, mặc định 14). */
  cooldownDays: number;
  /** Map stage → sequenceId. Stage không có trong map thì không kích. */
  sequenceByStage: Partial<Record<FollowupStage, string>>;
};

const MAX_ENROLL_PER_TICK = 20; // mỗi org mỗi tick
const CANDIDATES_PER_STAGE = 200;
const MAX_SILENCE_DAYS = 30; // im quá 30 ngày → không tự đào lại
const MIN_FIRST_DELAY_MINUTES = 3;
/** Các nguồn phiên bám đuổi — đang active bất kỳ nguồn nào thì không chồng thêm. */
const ACTIVE_FOLLOWUP_SOURCES = ['sequence_manual', 'target_followup', 'stage_followup'];

let running = false;

export function startStageFollowupCron(): void {
  cron.schedule('*/15 * * * *', async () => {
    if (running) return;
    running = true;
    try {
      await runStageFollowupTick();
    } catch (err) {
      logger.error('[stage-followup-cron] tick error', err);
    } finally {
      running = false;
    }
  });
  logger.info('[stage-followup-cron] scheduled every 15m (auto follow-up theo giai đoạn KH)');
}

export function parseStageFollowupConfig(raw: unknown): StageFollowupConfig {
  const obj = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw as Record<string, unknown> : {};
  const silence = Number(obj.silenceHours);
  const cooldown = Number(obj.cooldownDays);
  const mapRaw = obj.sequenceByStage && typeof obj.sequenceByStage === 'object' && !Array.isArray(obj.sequenceByStage)
    ? obj.sequenceByStage as Record<string, unknown>
    : {};
  const sequenceByStage: Partial<Record<FollowupStage, string>> = {};
  for (const stage of STAGE_FOLLOWUP_ALLOWED_STAGES) {
    const id = mapRaw[stage];
    if (typeof id === 'string' && id.trim()) sequenceByStage[stage] = id.trim();
  }
  return {
    enabled: obj.enabled === true,
    silenceHours: Number.isFinite(silence) ? Math.min(168, Math.max(1, Math.round(silence))) : 24,
    cooldownDays: Number.isFinite(cooldown) ? Math.min(365, Math.max(1, Math.round(cooldown))) : 14,
    sequenceByStage,
  };
}

export async function runStageFollowupTick(): Promise<void> {
  // Org nào có row cấu hình mới xét — org chưa cấu hình: 0 truy vấn thêm.
  const rows = await runSystemQuery(() =>
    prisma.appSetting.findMany({
      where: { settingKey: STAGE_FOLLOWUP_SETTING_KEY },
      select: { orgId: true, valuePlain: true },
    }),
  );

  for (const row of rows) {
    let config: StageFollowupConfig;
    try {
      config = parseStageFollowupConfig(JSON.parse(row.valuePlain ?? '{}'));
    } catch {
      continue;
    }
    if (!config.enabled || !Object.keys(config.sequenceByStage).length) continue;

    await withTenant(row.orgId, () => processOrg(row.orgId, config)).catch((err) => {
      logger.error(`[stage-followup-cron] org=${row.orgId} error`, err);
    });
  }
}

async function processOrg(orgId: string, config: StageFollowupConfig): Promise<void> {
  const now = new Date();
  const silenceCutoff = new Date(now.getTime() - config.silenceHours * 60 * 60 * 1000);
  const staleCutoff = new Date(now.getTime() - MAX_SILENCE_DAYS * 24 * 60 * 60 * 1000);
  const cooldownCutoff = new Date(now.getTime() - config.cooldownDays * 24 * 60 * 60 * 1000);
  let enrolled = 0;

  for (const [stage, sequenceId] of Object.entries(config.sequenceByStage) as Array<[FollowupStage, string]>) {
    if (enrolled >= MAX_ENROLL_PER_TICK) break;

    // Sequence phải còn tồn tại + đang bật + có bước — snapshot 1 lần cho cả stage.
    const sequence = await prisma.automationSequence.findFirst({
      where: { id: sequenceId, orgId, enabled: true },
      select: { id: true, steps: true, runtimeRules: true },
    });
    if (!sequence) {
      logger.warn(`[stage-followup-cron] org=${orgId} stage=${stage} sequence=${sequenceId} missing/disabled — skip`);
      continue;
    }
    const steps = parseSequenceSteps(sequence.steps);
    if (!steps.length) {
      logger.warn(`[stage-followup-cron] org=${orgId} stage=${stage} sequence=${sequenceId} has no steps — skip`);
      continue;
    }

    // KH đang ở stage này (đọc từ Trí nhớ khách — Giai đoạn 1).
    const contacts = await prisma.contact.findMany({
      where: {
        orgId,
        metadata: { path: ['customerSummary', 'stage'], equals: stage },
      },
      select: { id: true },
      take: CANDIDATES_PER_STAGE,
    });

    for (const contact of contacts) {
      if (enrolled >= MAX_ENROLL_PER_TICK) break;
      const did = await tryEnrollContact({
        orgId, contactId: contact.id, stage, sequence: { ...sequence, parsedSteps: steps },
        now, silenceCutoff, staleCutoff, cooldownCutoff,
      }).catch((err) => {
        logger.error(`[stage-followup-cron] org=${orgId} contact=${contact.id} error`, err);
        return false;
      });
      if (did) enrolled += 1;
    }
  }

  if (enrolled > 0) logger.info(`[stage-followup-cron] org=${orgId} enrolled=${enrolled}`);
}

async function tryEnrollContact(args: {
  orgId: string;
  contactId: string;
  stage: FollowupStage;
  sequence: { id: string; runtimeRules: unknown; parsedSteps: ReturnType<typeof parseSequenceSteps> };
  now: Date;
  silenceCutoff: Date;
  staleCutoff: Date;
  cooldownCutoff: Date;
}): Promise<boolean> {
  const { orgId, contactId, stage, sequence, now, silenceCutoff, staleCutoff, cooldownCutoff } = args;

  // 1. Đang có phiên bám đuổi active (bất kỳ nguồn) → không chồng.
  const activeSession = await prisma.careSession.findFirst({
    where: { orgId, contactId, state: 'active', sourceType: { in: ACTIVE_FOLLOWUP_SOURCES } },
    select: { id: true },
  });
  if (activeSession) return false;

  // 2. Cooldown: đã auto-enroll cho stage này trong cửa sổ cooldown (kể cả phiên đã đóng).
  const recent = await prisma.careSession.findFirst({
    where: {
      orgId, contactId, sourceType: 'stage_followup',
      openedAt: { gt: cooldownCutoff },
      closeConditions: { path: ['stage'], equals: stage },
    },
    select: { id: true },
  });
  if (recent) return false;

  // 3. Hội thoại Zalo thật gần nhất của KH (bỏ virtual/đã xóa) — lấy nick + thread để gửi.
  const conversation = await prisma.conversation.findFirst({
    where: {
      orgId, contactId, threadType: 'user', isVirtual: false, deletedAt: null,
      lastMessageAt: { not: null },
    },
    orderBy: { lastMessageAt: 'desc' },
    select: { id: true, zaloAccountId: true, externalThreadId: true },
  });
  if (!conversation) return false;

  // 4. Im lặng đủ lâu: tin cuối CỦA KHÁCH trong khoảng [30 ngày trước, silenceHours trước].
  const lastInbound = await prisma.message.findFirst({
    where: { conversationId: conversation.id, senderType: 'contact', isDeleted: false },
    orderBy: { sentAt: 'desc' },
    select: { sentAt: true },
  });
  if (!lastInbound) return false; // khách chưa từng nhắn — không bám đuổi
  if (lastInbound.sentAt > silenceCutoff) return false; // khách còn đang tương tác
  if (lastInbound.sentAt < staleCutoff) return false; // im quá lâu — không tự đào lại

  // 5. Enroll — snapshot steps lúc enroll (đồng bộ chuẩn manual-enroll/target_followup).
  const nick = await prisma.zaloAccount.findUnique({
    where: { id: conversation.zaloAccountId },
    select: { id: true, ownerUserId: true },
  });
  if (!nick) return false;

  const previous = await prisma.careSession.count({
    where: { orgId, contactId, sourceSequenceId: sequence.id },
  });
  const firstDelayMinutes = Math.max(sequence.parsedSteps[0].delayMinutes, MIN_FIRST_DELAY_MINUTES);
  const created = await prisma.careSession.create({
    data: {
      orgId,
      contactId,
      nickId: nick.id,
      externalThreadId: conversation.externalThreadId,
      ownerUserId: nick.ownerUserId,
      enrolledByUserId: null, // auto enroll theo giai đoạn KH
      sourceType: 'stage_followup',
      sourceSequenceId: sequence.id,
      state: 'active',
      interestWindowUntil: new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000),
      enrollEpoch: previous + 1,
      rulesSnapshot: (sequence.runtimeRules ?? {}) as object,
      stepsSnapshot: sequence.parsedSteps,
      currentStepIdx: 0,
      nextRunAt: new Date(now.getTime() + firstDelayMinutes * 60 * 1000),
      closeConditions: { stageFollowup: true, stage },
    },
    select: { id: true },
  });

  await prisma.careSessionEvent.create({
    data: {
      sessionId: created.id,
      eventId: `stage-followup:${contactId}:${stage}:${created.id}`,
      eventType: 'opened',
      payload: { stage, sequenceId: sequence.id, lastInboundAt: lastInbound.sentAt.toISOString() },
    },
  }).catch(() => {});

  await prisma.automationSequence.update({
    where: { id: sequence.id },
    data: { enrolledCount: { increment: 1 } },
  }).catch(() => {});

  logger.info(`[stage-followup-cron] enrolled session=${created.id} contact=${contactId} stage=${stage} seq=${sequence.id}`);
  return true;
}
