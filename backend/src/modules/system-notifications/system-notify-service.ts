import { randomUUID } from 'node:crypto';
import { prisma } from '../../shared/database/prisma-client.js';
import { logger } from '../../shared/utils/logger.js';
import { zaloPool } from '../zalo/zalo-pool.js';
import { zaloRateLimiter } from '../zalo/zalo-rate-limiter.js';

export type RecipientStatus = 'ready' | 'missing_system_sender' | 'missing_internal_contact' | 'missing_internal_phone' | 'sender_disconnected' | 'uid_not_found' | 'lookup_failed' | 'invalid';

interface ResolveResult {
  recipient: any;
  status: RecipientStatus;
  senderZaloAccountId: string | null;
  internalContactZaloAccountId: string | null;
  conversationId: string | null;
  threadIdInSenderView: string | null;
  error: string | null;
}

interface SendToUserInput {
  orgId: string;
  targetUserId: string;
  type: string;
  title: string;
  content: string;
  priority?: 'low' | 'normal' | 'high';
}

function extractZaloMsgId(sendResult: unknown): string | null {
  const sr = sendResult as { message?: { msgId?: number | string } | null; attachment?: Array<{ msgId?: number | string }> };
  const rawId = sr?.message?.msgId ?? sr?.attachment?.[0]?.msgId ?? null;
  return rawId == null || rawId === '' ? null : String(rawId);
}

function buildMessage(title: string, content: string, priority: string) {
  const prefix = priority === 'high' ? '[KHẨN] ' : '';
  return `${prefix}${title}\n${content}`.trim();
}

export async function resolveSystemNotifyRecipient(orgId: string, targetUserId: string): Promise<ResolveResult> {
  const [org, targetUser] = await Promise.all([
    prisma.organization.findUnique({
      where: { id: orgId },
      select: { systemNotifyZaloAccountId: true },
    }),
    prisma.user.findFirst({
      where: { id: targetUserId, orgId },
      select: { id: true, internalContactZaloAccountId: true },
    }),
  ]);

  const senderId = org?.systemNotifyZaloAccountId ?? null;
  const internalId = targetUser?.internalContactZaloAccountId ?? null;
  let status: RecipientStatus = 'invalid';
  let error: string | null = null;
  let conversationId: string | null = null;
  let threadIdInSenderView: string | null = null;
  let existingRecipient: { threadIdInSenderView: string | null; conversationId: string | null } | null = null;

  if (senderId) {
    existingRecipient = await prisma.systemNotifyRecipient.findUnique({
      where: { targetUserId_senderZaloAccountId: { targetUserId, senderZaloAccountId: senderId } },
      select: { threadIdInSenderView: true, conversationId: true },
    });
    threadIdInSenderView = existingRecipient?.threadIdInSenderView ?? null;
    conversationId = existingRecipient?.conversationId ?? null;
  }

  if (!targetUser) {
    error = 'User không tồn tại trong org';
  } else if (!senderId) {
    status = 'missing_system_sender';
    error = 'Org chưa chọn nick gửi thông báo hệ thống';
  } else if (!internalId) {
    status = 'missing_internal_contact';
    error = 'User chưa chọn nick liên lạc nội bộ';
  } else {
    const [sender, internalNick] = await Promise.all([
      prisma.zaloAccount.findFirst({
        where: { id: senderId, orgId },
        select: { id: true, status: true },
      }),
      prisma.zaloAccount.findFirst({
        where: { id: internalId, orgId },
        select: { id: true, phone: true },
      }),
    ]);

    if (!sender) {
      status = 'missing_system_sender';
      error = 'Nick gửi hệ thống không tồn tại trong org';
    } else if (!internalNick) {
      status = 'missing_internal_contact';
      error = 'Nick liên lạc nội bộ không tồn tại trong org';
    } else if (!threadIdInSenderView) {
      status = internalNick.phone ? 'uid_not_found' : 'missing_internal_phone';
      error = internalNick.phone
        ? 'Chưa tìm UID của nick nội bộ theo góc nhìn nick gửi hệ thống'
        : 'Nick liên lạc nội bộ chưa có SĐT để tìm UID';
    } else if (sender.status !== 'connected') {
      status = 'sender_disconnected';
      error = 'Nick gửi hệ thống đang offline';
    } else {
      status = 'ready';
    }
  }

  const recipient = await prisma.systemNotifyRecipient.upsert({
    where: {
      targetUserId_senderZaloAccountId: {
        targetUserId,
        senderZaloAccountId: senderId ?? '',
      },
    },
    create: {
      id: randomUUID(),
      orgId,
      targetUserId,
      senderZaloAccountId: senderId,
      internalContactZaloAccountId: internalId,
      conversationId,
      threadIdInSenderView,
      status,
      error,
      lastVerifiedAt: new Date(),
    },
    update: {
      internalContactZaloAccountId: internalId,
      conversationId,
      threadIdInSenderView,
      status,
      error,
      lastVerifiedAt: new Date(),
    },
  });

  return { recipient, status, senderZaloAccountId: senderId, internalContactZaloAccountId: internalId, conversationId, threadIdInSenderView, error };
}

export async function sendSystemNotificationToUser(input: SendToUserInput) {
  const priority = input.priority ?? 'normal';
  const resolved = await resolveSystemNotifyRecipient(input.orgId, input.targetUserId);
  const notification = await prisma.systemNotification.create({
    data: {
      id: randomUUID(),
      orgId: input.orgId,
      type: input.type,
      title: input.title,
      content: input.content,
      priority,
      senderZaloAccountId: resolved.senderZaloAccountId,
      targetUserId: input.targetUserId,
      internalContactZaloAccountId: resolved.internalContactZaloAccountId,
      recipientId: resolved.recipient.id,
      conversationId: resolved.conversationId,
      channel: resolved.status === 'ready' ? 'zalo' : 'crm_panel',
      status: 'pending',
      error: resolved.error,
    },
  });

  if (resolved.status !== 'ready' || !resolved.senderZaloAccountId || !resolved.threadIdInSenderView) {
    return prisma.systemNotification.update({
      where: { id: notification.id },
      data: { status: 'failed', channel: 'crm_panel', error: resolved.error ?? 'Recipient chưa sẵn sàng' },
    });
  }

  const limits = await zaloRateLimiter.checkLimits(resolved.senderZaloAccountId, 'message');
  if (!limits.allowed) {
    return prisma.systemNotification.update({
      where: { id: notification.id },
      data: { status: 'failed', channel: 'crm_panel', error: limits.reason ?? 'Rate limit' },
    });
  }

  try {
    const api = zaloPool.getApi(resolved.senderZaloAccountId);
    if (!api) throw new Error('Nick gửi hệ thống chưa connected trong Zalo pool');

    await zaloRateLimiter.recordSend(resolved.senderZaloAccountId, 'message');
    const msg = buildMessage(input.title, input.content, priority);
    const sendResult = await api.sendMessage({ msg }, resolved.threadIdInSenderView, 0);
    const zaloMsgId = extractZaloMsgId(sendResult);
    const now = new Date();

    let conversationId = resolved.conversationId;
    if (!conversationId) {
      const conversation = await prisma.conversation.findFirst({
        where: { orgId: input.orgId, zaloAccountId: resolved.senderZaloAccountId, externalThreadId: resolved.threadIdInSenderView, threadType: 'user' },
        select: { id: true },
      });
      conversationId = conversation?.id ?? null;
    }

    if (conversationId) {
      await prisma.message.create({
        data: {
          id: randomUUID(),
          conversationId,
          zaloMsgId,
          zaloMsgIdNum: zaloMsgId && /^\d+$/.test(zaloMsgId) ? BigInt(zaloMsgId) : null,
          senderType: 'self',
          senderUid: resolved.senderZaloAccountId,
          senderName: 'System',
          content: msg,
          contentType: 'text',
          sentAt: now,
          sentVia: 'system',
        },
      });
      await prisma.conversation.update({ where: { id: conversationId }, data: { lastMessageAt: now, isReplied: true } });
    }

    return prisma.systemNotification.update({
      where: { id: notification.id },
      data: { status: 'sent', channel: 'zalo', zaloMsgId, conversationId, sentAt: now, error: null },
    });
  } catch (err: any) {
    logger.warn(`[system-notify] send failed target=${input.targetUserId}: ${err?.message || err}`);
    return prisma.systemNotification.update({
      where: { id: notification.id },
      data: { status: 'failed', channel: 'crm_panel', error: err?.message || String(err) },
    });
  }
}
