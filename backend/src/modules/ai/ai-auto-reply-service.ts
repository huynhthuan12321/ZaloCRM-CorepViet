// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Huỳnh Ngọc Thuận — Community extension
/**
 * ai-auto-reply-service.ts — Auto-tư vấn theo phạm vi (2026-08-03).
 *
 * Hội thoại được nhận theo bật tay hoặc scope tổ chức (manual/new_customers/all). Khi khách nhắn:
 *   - Câu hỏi THÔNG TIN / FAQ, có nguồn Knowledge Base, đủ tự tin → AI tự gửi.
 *   - Khi full-auto tắt, câu nhạy cảm/thiếu nguồn/confidence thấp → lưu nháp chờ duyệt.
 *   - Khi full-auto bật, nháp hợp lệ được gửi luôn; prompt chống bịa số vẫn luôn áp dụng.
 *
 * Bất biến (KHÔNG được phá):
 *   - Fire-and-forget: hàm này KHÔNG BAO GIỜ throw ra ngoài (mọi lỗi → log + return).
 *   - Mặc định TẮT (Conversation.aiAutoReplyEnabled=false + AiConfig.aiAutoReplyGlobalEnabled=false)
 *     → khi chưa ai bật, hành vi hệ thống y hệt trước.
 *   - MARKETING_DRY_RUN=true → KHÔNG gọi Zalo SDK.
 *   - Kill switch tổ chức, giờ hoạt động, chống lặp, rate-limit và chống gửi lỗi thời luôn áp dụng.
 *   - Chỉ hội thoại THẬT (isVirtual=false) — virtual chat vẫn dùng ai-virtual-chat-service.
 *
 * Đường gửi: zaloOps.sendMessage (đi qua rate-limiter + reconnect + retry giống
 * automation care-session). Message row do service này lưu, KHÔNG trùng với echo
 * Zalo vì message-handler dedupe self-echo theo content trong 30s.
 */
import { randomUUID } from 'node:crypto';
import type { Server } from 'socket.io';
import { prisma } from '../../shared/database/prisma-client.js';
import { logger } from '../../shared/utils/logger.js';
import { config } from '../../config/index.js';
import { withTenant, runSystemQuery } from '../../shared/tenant/tenant-context.js';
import { zaloOps } from '../../shared/zalo-operations.js';
import { emitChatMessage } from '../../shared/realtime/emit-chat.js';
import { assertAiCapability, auditAiAction } from './ai-capabilities.js';
import { getAiConfig, generateAiOutput } from './ai-service.js';
import { shouldTriggerAi } from './ai-virtual-chat-service.js';
import { isConversationEligibleForAutoReply, normalizeAutoReplyScope } from './ai-auto-reply-eligibility.js';
import { authorizeAiData, type AiDataGrant } from './ai-privacy-guard.js';
import { decideAutoReplySendPolicy, type NeedsReviewReason } from './ai-send-policy.js';
import { addSpan, endAiTrace, endSpan, startAiTrace } from './observability/ai-tracer.js';
import type { AiTraceStatus, SafeAiErrorType } from './observability/ai-trace-contract.js';

// ── Hằng số ────────────────────────────────────────────────────────────────
const THROTTLE_MS = 5_000;
const throttleMap = new Map<string, number>();

/** Độ trễ ngẫu nhiên trước khi gửi — mô phỏng người thật đang gõ. */
const DELAY_MIN_MS = 10_000;
const DELAY_MAX_MS = 40_000;

const VN_OFFSET_MS = 7 * 60 * 60 * 1000;

/**
 * Từ khóa NHẠY CẢM mặc định (dùng khi AiConfig.aiAutoReplySensitivePattern = null).
 * Mức A: hỏi GIÁ cũng là nhạy cảm → AI soạn nháp cho sale duyệt, không tự báo giá.
 * Viết cả biến thể không dấu để bắt được khách gõ không dấu.
 */
export const DEFAULT_SENSITIVE_PATTERN =
  'chốt đơn|chot don|chốt|chot|đặt hàng|dat hang|lấy gói|lay goi|mua gói|mua goi' +
  '|đặt cọc|dat coc|cọc|coc|chuyển khoản|chuyen khoan|\\bck\\b|số tài khoản|so tai khoan|\\bstk\\b' +
  '|thanh toán|thanh toan|giá|gia bao nhieu|\\bgiá\\b|bao nhiêu tiền|bao nhieu tien|bao nhiêu|bao nhieu' +
  '|giảm|giam gia|khuyến mãi|khuyen mai|ship|giao hàng|giao hang|khi nào giao|khi nao giao|\\bcod\\b' +
  '|hoá đơn|hóa đơn|hoa don|xuất hoá đơn|xuat hoa don';

export interface TriggerAutoReplyInput {
  accountId: string;
  conversationId: string;
  incomingMessageId: string;
  orgId: string;
}

/**
 * Entry point fire-and-forget. Gọi từ zalo-listener-factory sau emitChatMessage.
 * KHÔNG await trong listener; hàm này tự nuốt mọi lỗi.
 */
export async function triggerAutoReply(
  input: TriggerAutoReplyInput,
  io: Server | null,
): Promise<void> {
  try {
    await withTenant(input.orgId, () => runAutoReply(input, io));
  } catch (err) {
    logger.error('[ai-auto-reply] Trigger error:', err);
  }
}

async function runAutoReply(input: TriggerAutoReplyInput, io: Server | null): Promise<void> {
  const { accountId, conversationId, incomingMessageId, orgId } = input;
  const trace = startAiTrace({ operation: 'auto_reply', orgId, conversationId, channel: 'zalo' });
  let traceStatus: AiTraceStatus = 'disabled';
  let traceProvider: string | undefined;
  let traceModel: string | undefined;
  let traceSourceCount: number | undefined;
  let traceAutoSent = false;
  let traceErrorType: SafeAiErrorType | undefined;
  try {
    // ── 1. Throttle 5s/hội thoại ──
    const lastFire = throttleMap.get(conversationId) ?? 0;
    if (Date.now() - lastFire < THROTTLE_MS) return;
    throttleMap.set(conversationId, Date.now());

    // ── 2. Công tắc: hội thoại + org ──
    const conv = await prisma.conversation.findFirst({
      where: { id: conversationId, orgId },
      select: {
        id: true, contactId: true, zaloAccountId: true, externalThreadId: true, threadType: true,
        isVirtual: true, deletedAt: true, aiAutoReplyEnabled: true,
        zaloAccount: { select: { privacyMode: true, ownerUserId: true, zaloUid: true, archivedAt: true } },
      },
    });
    if (!conv || conv.deletedAt) return;
    if (conv.isVirtual) return;                     // virtual chat có luồng riêng
    if (conv.threadType === 'group') return;        // chỉ tự trả lời hội thoại 1-1, KHÔNG trả lời nhóm
    if (conv.zaloAccount?.archivedAt) return;
    if (!conv.externalThreadId) return;

    const aiCfg = await getAiConfig(orgId);
    traceProvider = aiCfg.provider;
    traceModel = aiCfg.model;
    if (!aiCfg.enabled || !aiCfg.aiAutoReplyGlobalEnabled) return;
    if (!(await isConversationEligibleForAutoReply(
      conversationId,
      conv.aiAutoReplyEnabled,
      normalizeAutoReplyScope(aiCfg.aiAutoReplyScope),
      aiCfg.aiAutoReplyInboundStrangerEnabled,
      conv.zaloAccountId,
      conv.externalThreadId,
    ))) return;

    // ── 3. Tin đến: phải là tin KHÁCH, text, đủ dài, không phải noise ──
    const incoming = await prisma.message.findFirst({
      where: { id: incomingMessageId, conversationId },
      select: { id: true, content: true, contentType: true, senderType: true, sentAt: true },
    });
    if (!incoming) return;
    if (incoming.senderType === 'self') return;
    if (incoming.contentType !== 'text') return;
    const customerText = (incoming.content ?? '').trim();
    if (customerText.length < 5) return;
    if (!shouldTriggerAi(customerText, aiCfg.aiAssistantSkipNoisePattern)) return;

    // ── 4. Khung giờ VN [start, end) — ngoài khung KHÔNG gửi đêm ──
    if (!isWithinAutoReplyWindow(new Date(), aiCfg.aiAutoReplyStartHour, aiCfg.aiAutoReplyEndHour)) {
      logger.debug(`[ai-auto-reply] Ngoài khung giờ conv=${conversationId}`);
      return;
    }

    // ── 5. Chống loop: đếm tin AI-auto kể từ tin NGƯỜI THẬT cuối ──
    const consecutive = await countConsecutiveAutoReplies(conversationId);
    if (consecutive >= aiCfg.aiAutoReplyMaxConsecutive) {
      logger.info(`[ai-auto-reply] Đã gửi ${consecutive} tin AI liên tiếp conv=${conversationId} → nhường sale`);
      return;
    }

    // ── 6. Soạn nháp (quota + KB + hồ sơ KH nằm trong generateAiOutput) ──
    let grant: AiDataGrant;
    const privacySpan = addSpan(trace, 'authorize_privacy');
    try {
      grant = await authorizeAiData({
        orgId,
        scope: 'conversation',
        purpose: 'auto_reply',
        actor: { mode: 'background' },
        conversationId,
      });
    } catch (err) {
      traceStatus = 'privacy_denied';
      traceErrorType = 'privacy_denied';
      logger.info(`[ai-auto-reply] Privacy denied conv=${conversationId}: ${err instanceof Error ? err.message : String(err)}`);
      return;
    } finally {
      endSpan(privacySpan);
    }

    let draft: { content: string; confidence: number; sources?: string[] };
    try {
      assertAiCapability('generate_reply');
      const out = await generateAiOutput({ orgId, conversationId, type: 'reply_draft', messageId: incomingMessageId, grant, trace });
      draft = out as { content: string; confidence: number; sources?: string[] };
    } catch (err) {
      traceStatus = 'provider_failed';
      traceErrorType = 'provider_unknown';
      logger.warn(`[ai-auto-reply] Soạn nháp thất bại conv=${conversationId}: ${err instanceof Error ? err.message : String(err)}`);
      return;
    }
    const draftText = (draft?.content ?? '').trim();
    if (!draftText) return;
    const sources = Array.isArray(draft.sources) ? draft.sources : [];
    traceStatus = 'generated';
    traceSourceCount = sources.length;

    // ── 7. CỬA NHẠY CẢM — trái tim Mức A ──
    const policySpan = addSpan(trace, 'policy_evaluation');
    const policy = decideAutoReplySendPolicy({
      customerText,
      draftText,
      sources,
      sensitiveRe: buildSensitiveRegex(aiCfg.aiAutoReplySensitivePattern),
    });
    endSpan(policySpan);
    if (policy.action === 'needs_review') {
      traceStatus = 'needs_review';
      await saveNeedsReview({ orgId, conversationId, incomingMessageId, draftText, reason: policy.reason, sources, io });
      scheduleCustomerSummaryUpdate(orgId, conv.contactId, conversationId, grant);
      return;
    }
    if (policy.action === 'block') {
      traceStatus = 'policy_blocked';
      logger.warn(`[ai-auto-reply] policy blocked conv=${conversationId}: ${policy.reason}`);
      return;
    }

    // ── 8. Nhánh an toàn → tự gửi ──
    const delayMs = DELAY_MIN_MS + Math.floor(Math.random() * (DELAY_MAX_MS - DELAY_MIN_MS));
    await new Promise((r) => setTimeout(r, delayMs));

    // 8b. Chống gửi lỗi thời: sale đã trả lời tay HOẶC khách nhắn tiếp → HỦY.
    const newer = await prisma.message.findFirst({
      where: {
        conversationId,
        id: { not: incomingMessageId },
        sentAt: { gt: incoming.sentAt ?? new Date(0) },
      },
      orderBy: { sentAt: 'desc' },
      select: { id: true, senderType: true, sentVia: true, metadata: true },
    });
    if (newer) {
      const isAiAuto = isAiAutoMessage(newer);
      // Người thật trả lời, hoặc khách nhắn thêm → bỏ nháp này.
      if (!isAiAuto) {
        logger.info(`[ai-auto-reply] Hủy gửi (có tin mới hơn) conv=${conversationId}`);
        return;
      }
    }
    // Công tắc có thể bị tắt trong lúc chờ.
    const [stillOn, latestAiCfg] = await Promise.all([
      prisma.conversation.findFirst({
        where: { id: conversationId, orgId },
        select: { aiAutoReplyEnabled: true },
      }),
      getAiConfig(orgId),
    ]);
    if (!stillOn || !latestAiCfg.enabled || !latestAiCfg.aiAutoReplyGlobalEnabled) return;
    if (!(await isConversationEligibleForAutoReply(
      conversationId,
      stillOn.aiAutoReplyEnabled,
      normalizeAutoReplyScope(latestAiCfg.aiAutoReplyScope),
      latestAiCfg.aiAutoReplyInboundStrangerEnabled,
      conv.zaloAccountId,
      conv.externalThreadId,
    ))) return;

    // Full-auto may have been switched off during the human-like delay. Re-apply
    // the review gate before sending so the current organization setting wins.
    const latestPolicySpan = addSpan(trace, 'policy_evaluation');
    const latestPolicy = decideAutoReplySendPolicy({
      customerText,
      draftText,
      sources,
      sensitiveRe: buildSensitiveRegex(latestAiCfg.aiAutoReplySensitivePattern),
    });
    endSpan(latestPolicySpan);
    if (latestPolicy.action === 'needs_review') {
      traceStatus = 'needs_review';
      await saveNeedsReview({ orgId, conversationId, incomingMessageId, draftText, reason: latestPolicy.reason, sources, io });
      scheduleCustomerSummaryUpdate(orgId, conv.contactId, conversationId, grant);
      return;
    }
    if (latestPolicy.action === 'block') {
      traceStatus = 'policy_blocked';
      logger.warn(`[ai-auto-reply] post-delay policy blocked conv=${conversationId}: ${latestPolicy.reason}`);
      return;
    }

    // 8c. Gửi thật (hoặc mô phỏng khi DRY_RUN) — capability deny-by-default.
    assertAiCapability('send_auto_reply');
    let zaloMsgId = '';
    if (config.marketingDryRun) {
      logger.info(`[ai-auto-reply] [dry-run] KHÔNG gửi thật conv=${conversationId} text="${draftText.slice(0, 60)}"`);
    } else {
      const threadType = conv.threadType === 'group' ? 1 : 0;
      try {
        const sendSpan = addSpan(trace, 'send_zalo');
        const sendResult = await zaloOps.sendMessage(accountId, conv.externalThreadId, threadType, { msg: draftText });
        endSpan(sendSpan);
        const sr = sendResult as unknown as { message?: { msgId?: number | string } | null; attachment?: Array<{ msgId?: number | string }> };
        zaloMsgId = String(sr?.message?.msgId ?? sr?.attachment?.[0]?.msgId ?? '');
      } catch (err) {
        traceStatus = 'send_failed';
        traceErrorType = 'internal';
        logger.warn(`[ai-auto-reply] Zalo từ chối gửi conv=${conversationId}: ${err instanceof Error ? err.message : String(err)}`);
        return;
      }
    }

    // 8d. Lưu Message (echo Zalo sẽ bị message-handler dedupe theo content trong 30s).
    assertAiCapability('save_ai_message');
    const message = await prisma.message.create({
      data: {
        id: randomUUID(),
        conversationId,
        zaloMsgId: zaloMsgId || `local:${randomUUID()}`,
        zaloMsgIdNum: zaloMsgId && /^\d+$/.test(zaloMsgId) ? BigInt(zaloMsgId) : null,
        senderType: 'self',
        senderUid: conv.zaloAccount?.zaloUid || '',
        senderName: 'AI tự tư vấn',
        content: draftText,
        contentType: 'text',
        sentAt: new Date(),
        isLocal: config.marketingDryRun,
        sentVia: 'ai_auto',
        // FE đọc metadata.aiAuto (hoặc sentVia='ai_auto') → badge "⚡ AI tự gửi".
        metadata: {
          aiAuto: true,
          sources,
          dryRun: config.marketingDryRun || undefined,
        } as object,
      },
    });

    await prisma.conversation.update({
      where: { id: conversationId },
      data: { lastMessageAt: new Date(), isReplied: true },
    });

    await emitChatMessage({
      io,
      orgId,
      accountId,
      conversationId,
      message: { ...message, zaloMsgIdNum: message.zaloMsgIdNum?.toString() ?? null },
      privacyMode: conv.zaloAccount?.privacyMode ?? 'sub',
      ownerUserId: conv.zaloAccount?.ownerUserId ?? null,
      extra: { _aiAuto: true },
    });

    // 8e. Audit — ActivityLog actorType='bot', gắn entity conversation.
    auditAiAction(orgId, 'auto_reply_sent', {
      conversationId, messageId: message.id, incomingMessageId,
      sources, dryRun: config.marketingDryRun,
    });
    void runSystemQuery(() =>
      prisma.activityLog.create({
        data: {
          orgId,
          actorType: 'bot',
          botName: 'AI tự tư vấn',
          category: 'automation',
          action: 'ai_auto_reply_sent',
          entityType: 'conversation',
          entityId: conversationId,
          details: { messageId: message.id, incomingMessageId, sources, dryRun: config.marketingDryRun } as object,
        },
      }),
    ).catch(() => {});

    logger.info(`[ai-auto-reply] Đã gửi conv=${conversationId} msg=${message.id} delay=${Math.round(delayMs / 1000)}s`);
    traceStatus = 'auto_sent';
    traceAutoSent = true;
    scheduleCustomerSummaryUpdate(orgId, conv.contactId, conversationId, grant);
  } catch (err) {
    traceErrorType = traceErrorType ?? 'internal';
    logger.error('[ai-auto-reply] Lỗi xử lý:', err);
  } finally {
    endAiTrace(trace, {
      status: traceStatus,
      provider: traceProvider,
      model: traceModel,
      sourceCount: traceSourceCount,
      autoSent: traceAutoSent,
      errorType: traceErrorType,
    });
  }
}

function scheduleCustomerSummaryUpdate(orgId: string, contactId: string | null, conversationId: string, grant: AiDataGrant): void {
  if (!contactId) return;
  void import('./customer-summary-service.js')
    .then(({ updateCustomerSummary }) => updateCustomerSummary({ orgId, contactId, conversationId, grant }))
    .catch(() => {});
}

// ── Helpers ────────────────────────────────────────────────────────────────

/** Giờ VN nằm trong [startHour, endHour). start >= end → coi như luôn ngoài khung. */
export function isWithinAutoReplyWindow(at: Date, startHour: number, endHour: number): boolean {
  const vnHour = new Date(at.getTime() + VN_OFFSET_MS).getUTCHours();
  if (!Number.isFinite(startHour) || !Number.isFinite(endHour) || startHour >= endHour) return false;
  return vnHour >= startHour && vnHour < endHour;
}

/** Regex nhạy cảm từ cấu hình org; pattern rỗng/sai → dùng default (fail SAFE). */
export function buildSensitiveRegex(pattern: string | null | undefined): RegExp {
  const raw = (pattern ?? '').trim();
  if (raw) {
    try {
      return new RegExp(raw, 'i');
    } catch {
      logger.warn('[ai-auto-reply] Regex nhạy cảm của org không hợp lệ → dùng mặc định');
    }
  }
  return new RegExp(DEFAULT_SENSITIVE_PATTERN, 'i');
}

/** Message này do AI auto-reply gửi? (metadata.aiAuto hoặc sentVia='ai_auto') */
function isAiAutoMessage(m: { sentVia?: string | null; metadata?: unknown }): boolean {
  if (m.sentVia === 'ai_auto') return true;
  const meta = m.metadata as { aiAuto?: unknown } | null | undefined;
  return meta?.aiAuto === true;
}

/**
 * Đếm số tin AI-auto đã gửi KỂ TỪ tin 'self' của NGƯỜI THẬT gần nhất.
 * Người thật nhắn → bộ đếm reset (sale đã vào cuộc).
 */
async function countConsecutiveAutoReplies(conversationId: string): Promise<number> {
  const recent = await prisma.message.findMany({
    where: { conversationId, senderType: 'self' },
    orderBy: { sentAt: 'desc' },
    take: 20,
    select: { sentVia: true, metadata: true },
  });
  let n = 0;
  for (const m of recent) {
    if (isAiAutoMessage(m)) n++;
    else break; // gặp tin người thật → dừng
  }
  return n;
}

/** Nhánh "cần duyệt": lưu nháp + báo sale. TUYỆT ĐỐI không gửi Zalo. */
async function saveNeedsReview(args: {
  orgId: string;
  conversationId: string;
  incomingMessageId: string;
  draftText: string;
  reason: NeedsReviewReason;
  sources: string[];
  io: Server | null;
}): Promise<void> {
  const { orgId, conversationId, incomingMessageId, draftText, reason, sources, io } = args;
  try {
    assertAiCapability('create_suggestion');
    await prisma.aiSuggestion.create({
      data: {
        orgId,
        conversationId,
        messageId: incomingMessageId,
        type: 'auto_reply_needs_review',
        content: draftText.slice(0, 2000),
        confidence: 0,
      },
    });
  } catch (err) {
    logger.warn(`[ai-auto-reply] Lưu nháp cần duyệt thất bại conv=${conversationId}: ${err instanceof Error ? err.message : String(err)}`);
  }
  io?.to(`org:${orgId}`).emit('chat:ai-needs-review', {
    conversationId,
    messageId: incomingMessageId,
    draft: draftText,
    reason,
    sources,
  });
  auditAiAction(orgId, 'auto_reply_needs_review', { conversationId, incomingMessageId, reason });
  logger.info(`[ai-auto-reply] CẦN DUYỆT (${reason}) conv=${conversationId} — KHÔNG gửi`);
}
