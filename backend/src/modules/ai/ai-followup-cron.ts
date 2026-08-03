// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Huỳnh Ngọc Thuận — Community extension
/** A2: send one gentle AI follow-up after a customer stays silent. */
import { randomUUID } from 'node:crypto';
import cron from 'node-cron';
import type { Server } from 'socket.io';
import { prisma } from '../../shared/database/prisma-client.js';
import { logger } from '../../shared/utils/logger.js';
import { config as appConfig } from '../../config/index.js';
import { runSystemQuery, withTenant } from '../../shared/tenant/tenant-context.js';
import { zaloOps } from '../../shared/zalo-operations.js';
import { emitChatMessage } from '../../shared/realtime/emit-chat.js';
import { assertAiCapability, auditAiAction } from './ai-capabilities.js';
import { isWithinAutoReplyWindow } from './ai-auto-reply-service.js';
import { generateFollowupMessage } from './ai-followup-service.js';

const MAX_CONVERSATIONS_PER_ORG = 20;
const CANDIDATE_SCAN_LIMIT = 100;
const DELAY_MIN_MS = 10_000;
const DELAY_MAX_MS = 40_000;

type FollowupConfig = {
  aiFollowupSilenceHours: number;
  aiFollowupMax: number;
  aiFollowupCooldownHours: number;
  aiAutoReplyStartHour: number;
  aiAutoReplyEndHour: number;
};

type CandidateConversation = {
  id: string;
  orgId: string;
  contactId: string | null;
  zaloAccountId: string;
  externalThreadId: string | null;
  zaloAccount: {
    zaloUid: string | null;
    privacyMode: string;
    ownerUserId: string | null;
  };
};

type FollowupAnchor = { id: string; sentAt: Date };

let running = false;

export function startAiFollowupCron(io: Server | null): void {
  cron.schedule('*/15 * * * *', async () => {
    if (running) return;
    running = true;
    try {
      await runAiFollowupTick(io);
    } catch (err) {
      logger.error('[ai-followup-cron] tick error', err);
    } finally {
      running = false;
    }
  });
  logger.info('[ai-followup-cron] scheduled every 15m');
}

export async function runAiFollowupTick(io: Server | null): Promise<void> {
  const orgConfigs = await runSystemQuery(() => prisma.aiConfig.findMany({
    where: {
      enabled: true,
      aiAutoReplyGlobalEnabled: true,
      aiFollowupEnabled: true,
    },
    select: {
      orgId: true,
      aiFollowupSilenceHours: true,
      aiFollowupMax: true,
      aiFollowupCooldownHours: true,
      aiAutoReplyStartHour: true,
      aiAutoReplyEndHour: true,
    },
  }));

  for (const orgConfig of orgConfigs) {
    await withTenant(orgConfig.orgId, () => processOrg(orgConfig.orgId, orgConfig, io)).catch((err) => {
      logger.error(`[ai-followup-cron] org=${orgConfig.orgId} error`, err);
    });
  }
}

async function processOrg(orgId: string, followupConfig: FollowupConfig, io: Server | null): Promise<void> {
  const now = new Date();
  if (!isWithinAutoReplyWindow(now, followupConfig.aiAutoReplyStartHour, followupConfig.aiAutoReplyEndHour)) return;

  const silenceCutoff = new Date(now.getTime() - followupConfig.aiFollowupSilenceHours * 60 * 60 * 1000);
  const conversations = await prisma.conversation.findMany({
    where: {
      orgId,
      threadType: 'user',
      isVirtual: false,
      deletedAt: null,
      contactId: { not: null },
      externalThreadId: { not: null },
      lastMessageAt: { lte: silenceCutoff },
      zaloAccount: { archivedAt: null },
      // Coarse DB prefilter; findEligibleAnchor below still proves this is the LAST message.
      messages: {
        some: {
          senderType: 'self',
          sentAt: { lte: silenceCutoff },
          OR: [
            { sentVia: 'ai_auto' },
            { metadata: { path: ['aiAuto'], equals: true } },
          ],
        },
      },
    },
    // Prefer customers who have just crossed the silence threshold; very old
    // conversations must not starve timely re-engagements in the bounded scan.
    orderBy: { lastMessageAt: 'desc' },
    take: CANDIDATE_SCAN_LIMIT,
    select: {
      id: true,
      orgId: true,
      contactId: true,
      zaloAccountId: true,
      externalThreadId: true,
      zaloAccount: { select: { zaloUid: true, privacyMode: true, ownerUserId: true } },
    },
  });

  let attempted = 0;
  let sent = 0;
  for (const conversation of conversations) {
    if (attempted >= MAX_CONVERSATIONS_PER_ORG) break;
    const anchor = await findEligibleAnchor(conversation, followupConfig, now);
    if (!anchor) continue;
    attempted += 1;

    const didSend = await processCandidate(conversation, anchor, io).catch((err) => {
      logger.error(`[ai-followup-cron] conv=${conversation.id} error`, err);
      return false;
    });
    if (didSend) sent += 1;
  }

  if (attempted > 0) logger.info(`[ai-followup-cron] org=${orgId} attempted=${attempted} sent=${sent}`);
}

async function findEligibleAnchor(
  conversation: CandidateConversation,
  followupConfig: FollowupConfig,
  now: Date,
): Promise<FollowupAnchor | null> {
  if (!conversation.contactId) return null;

  const activeCareSession = await prisma.careSession.findFirst({
    where: { orgId: conversation.orgId, contactId: conversation.contactId, state: 'active' },
    select: { id: true },
  });
  if (activeCareSession) return null;

  const lastMessage = await prisma.message.findFirst({
    where: { conversationId: conversation.id, isDeleted: false },
    orderBy: { sentAt: 'desc' },
    select: { id: true, senderType: true, sentVia: true, metadata: true, sentAt: true },
  });
  if (!lastMessage || lastMessage.senderType !== 'self' || !isAiAuto(lastMessage)) return null;

  const silenceCutoff = new Date(now.getTime() - followupConfig.aiFollowupSilenceHours * 60 * 60 * 1000);
  if (lastMessage.sentAt > silenceCutoff) return null;

  const lastCustomerMessage = await prisma.message.findFirst({
    where: { conversationId: conversation.id, senderType: 'contact', isDeleted: false },
    orderBy: { sentAt: 'desc' },
    select: { sentAt: true },
  });
  if (!lastCustomerMessage || lastCustomerMessage.sentAt >= lastMessage.sentAt) return null;

  const followupWhere = {
    conversationId: conversation.id,
    senderType: 'self',
    sentAt: { gt: lastCustomerMessage.sentAt },
    metadata: { path: ['aiFollowup'], equals: true },
  };
  const followupCount = await prisma.message.count({ where: followupWhere });
  if (followupCount >= followupConfig.aiFollowupMax) return null;

  const lastFollowup = await prisma.message.findFirst({
    where: followupWhere,
    orderBy: { sentAt: 'desc' },
    select: { sentAt: true },
  });
  if (lastFollowup) {
    const cooldownCutoff = new Date(now.getTime() - followupConfig.aiFollowupCooldownHours * 60 * 60 * 1000);
    if (lastFollowup.sentAt > cooldownCutoff) return null;
  }

  return { id: lastMessage.id, sentAt: lastMessage.sentAt };
}

async function processCandidate(
  conversation: CandidateConversation,
  anchor: FollowupAnchor,
  io: Server | null,
): Promise<boolean> {
  const content = await generateFollowupMessage(conversation.orgId, conversation.id);
  if (!content) return false;

  const delayMs = DELAY_MIN_MS + Math.floor(Math.random() * (DELAY_MAX_MS - DELAY_MIN_MS));
  await new Promise((resolve) => setTimeout(resolve, delayMs));

  const latestConfig = await prisma.aiConfig.findUnique({
    where: { orgId: conversation.orgId },
    select: {
      enabled: true,
      aiAutoReplyGlobalEnabled: true,
      aiFollowupEnabled: true,
      aiFollowupSilenceHours: true,
      aiFollowupMax: true,
      aiFollowupCooldownHours: true,
      aiAutoReplyStartHour: true,
      aiAutoReplyEndHour: true,
    },
  });
  if (!latestConfig?.enabled || !latestConfig.aiAutoReplyGlobalEnabled || !latestConfig.aiFollowupEnabled) return false;
  if (!isWithinAutoReplyWindow(new Date(), latestConfig.aiAutoReplyStartHour, latestConfig.aiAutoReplyEndHour)) return false;

  const stillExists = await prisma.conversation.findFirst({
    where: {
      id: conversation.id,
      orgId: conversation.orgId,
      threadType: 'user',
      isVirtual: false,
      deletedAt: null,
      externalThreadId: { not: null },
      zaloAccount: { archivedAt: null },
    },
    select: { id: true },
  });
  if (!stillExists) return false;

  const latestAnchor = await findEligibleAnchor(conversation, latestConfig, new Date());
  if (!latestAnchor || latestAnchor.id !== anchor.id || latestAnchor.sentAt.getTime() !== anchor.sentAt.getTime()) return false;

  assertAiCapability('send_auto_reply');
  let zaloMsgId = '';
  if (appConfig.marketingDryRun) {
    logger.info(`[ai-followup-cron] [dry-run] conv=${conversation.id} text="${content.slice(0, 60)}"`);
  } else {
    try {
      const result = await zaloOps.sendMessage(
        conversation.zaloAccountId,
        conversation.externalThreadId!,
        0,
        { msg: content },
      );
      const parsed = result as unknown as {
        message?: { msgId?: number | string } | null;
        attachment?: Array<{ msgId?: number | string }>;
      };
      zaloMsgId = String(parsed?.message?.msgId ?? parsed?.attachment?.[0]?.msgId ?? '');
    } catch (err) {
      logger.warn(`[ai-followup-cron] send rejected conv=${conversation.id}: ${err instanceof Error ? err.message : String(err)}`);
      return false;
    }
  }

  assertAiCapability('save_ai_message');
  const sentAt = new Date();
  const message = await prisma.message.create({
    data: {
      id: randomUUID(),
      conversationId: conversation.id,
      zaloMsgId: zaloMsgId || `local:${randomUUID()}`,
      zaloMsgIdNum: zaloMsgId && /^\d+$/.test(zaloMsgId) ? BigInt(zaloMsgId) : null,
      senderType: 'self',
      senderUid: conversation.zaloAccount.zaloUid || '',
      senderName: 'AI tự nhắc lại',
      content,
      contentType: 'text',
      sentAt,
      isLocal: appConfig.marketingDryRun,
      sentVia: 'ai_auto',
      metadata: {
        aiAuto: true,
        aiFollowup: true,
        dryRun: appConfig.marketingDryRun || undefined,
      } as object,
    },
  });

  await prisma.conversation.update({
    where: { id: conversation.id },
    data: { lastMessageAt: sentAt, isReplied: true },
  });

  await emitChatMessage({
    io,
    orgId: conversation.orgId,
    accountId: conversation.zaloAccountId,
    conversationId: conversation.id,
    message: { ...message, zaloMsgIdNum: message.zaloMsgIdNum?.toString() ?? null },
    privacyMode: conversation.zaloAccount.privacyMode,
    ownerUserId: conversation.zaloAccount.ownerUserId,
    extra: { _aiAuto: true, _aiFollowup: true },
  });

  auditAiAction(conversation.orgId, 'followup_sent', {
    conversationId: conversation.id,
    messageId: message.id,
    dryRun: appConfig.marketingDryRun,
  });
  void runSystemQuery(() => prisma.activityLog.create({
    data: {
      orgId: conversation.orgId,
      actorType: 'bot',
      botName: 'AI tự nhắc lại',
      category: 'automation',
      action: 'ai_followup_sent',
      entityType: 'conversation',
      entityId: conversation.id,
      details: { messageId: message.id, dryRun: appConfig.marketingDryRun } as object,
    },
  })).catch(() => {});

  logger.info(`[ai-followup-cron] sent conv=${conversation.id} msg=${message.id} delay=${Math.round(delayMs / 1000)}s`);
  return true;
}

function isAiAuto(message: { sentVia?: string | null; metadata?: unknown }): boolean {
  if (message.sentVia === 'ai_auto') return true;
  const metadata = message.metadata as { aiAuto?: unknown } | null | undefined;
  return metadata?.aiAuto === true;
}
