// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Nguyen Tien Loc

export type NeedsReviewReason = 'giá/chốt đơn' | 'thiếu nguồn tài liệu';

export type AiSendPolicyDecision =
  | { action: 'allow' }
  | { action: 'needs_review'; reason: NeedsReviewReason }
  | { action: 'block'; reason: string };

const MONEY_LIKE_RE = /(\d[\d.,]{2,})\s*(d|vnd|k|nghin|tr|trieu|cu|%)|\b\d{8,}\b/i;
export const FORBIDDEN_FOLLOWUP_RE = /(?:gia|gia\s+(?:bao|chi)|coc|chot(?:\s+don)?|don\s+hang|thanh\s+toan|chuyen\s+khoan|\b(?:cod|stk|tien)\b|nghin|trieu|[₫$€]|\d)/iu;

export function decideAutoReplySendPolicy(args: {
  customerText: string;
  draftText: string;
  sources: string[];
  sensitiveRe: RegExp;
}): AiSendPolicyDecision {
  const { customerText, draftText, sources, sensitiveRe } = args;
  if (sensitiveRe.test(customerText)) return { action: 'needs_review', reason: 'giá/chốt đơn' };
  if (sensitiveRe.test(draftText) || MONEY_LIKE_RE.test(draftText)) return { action: 'needs_review', reason: 'giá/chốt đơn' };
  if (sources.length === 0) return { action: 'needs_review', reason: 'thiếu nguồn tài liệu' };
  return { action: 'allow' };
}

export function decideFollowupSendPolicy(content: string): AiSendPolicyDecision {
  const text = content.trim();
  if (!text) return { action: 'block', reason: 'empty_followup' };
  if (FORBIDDEN_FOLLOWUP_RE.test(text)) return { action: 'block', reason: 'transactional_followup' };
  return { action: 'allow' };
}
