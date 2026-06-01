// Phase 7 Engine — Gate evaluator.
//
// Gates are checked SEQUENTIALLY before executing a task action. Short-circuits
// on first failure. Memory rules locked here (anh chốt):
//   - allowedHourRange [6, 22]
//   - randomDelayPerSend (applied at scheduling, not gate-check)
//   - perNickThrottle (last_friend_req_sent_at / last_message_sent_at per nick)
//   - crossNickRecencyDays (skip if any nick had recent activity with KH)
//   - stopOnAccept (skip if Contact.acceptedNicksCount > 0)
//
// Gates are PURE for unit-testing — DB lookups happen in caller (task-worker)
// which then passes the read values into these functions.

import type { SequenceRuntimeRules, GateResult } from './types.js';
import type { BlockActionType } from '../blocks/types.js';

// ── Pure gate functions ───────────────────────────────────────────────────

// Hour range gate — returns retryAfter for next valid window if blocked.
// Mọi cài đặt nhân hệ thống theo Asia/Ho_Chi_Minh (UTC+7) — container có thể UTC.
export function checkHourRange(
  now: Date,
  rules: SequenceRuntimeRules,
): GateResult {
  const range = rules.allowedHourRange;
  if (!range) return { passed: true };
  const [start, end] = range;
  // Convert "now" to VN local clock by shifting +7h, then read as if UTC.
  const vnNow = new Date(now.getTime() + 7 * 60 * 60 * 1000);
  const vnHour = vnNow.getUTCHours();
  if (vnHour >= start && vnHour <= end) {
    return { passed: true };
  }
  // Compute next valid VN window, then convert back to UTC for retryAfter.
  const vnRetry = new Date(vnNow);
  if (vnHour < start) {
    vnRetry.setUTCHours(start, 0, 0, 0);
  } else {
    vnRetry.setUTCDate(vnRetry.getUTCDate() + 1);
    vnRetry.setUTCHours(start, 0, 0, 0);
  }
  const retryAfter = new Date(vnRetry.getTime() - 7 * 60 * 60 * 1000);
  return {
    passed: false,
    failedGate: 'hour_range',
    detail: `Outside hours VN [${start}:00 - ${end}:00], retry at ${retryAfter.toISOString()}`,
    retryAfter,
  };
}

// Per-nick throttle gate — checks if minDelay has elapsed since this nick's
// last send of the SAME action category (friend-add or message).
// `lastSentAt` is read by caller from ZaloAccount.lastFriendReqSentAt or
// lastMessageSentAt depending on actionType.
export function checkPerNickThrottle(
  now: Date,
  actionType: BlockActionType,
  lastSentAt: Date | null,
  rules: SequenceRuntimeRules,
): GateResult {
  // Treat null/undefined/false as DISABLED (UI may write absent/false when off).
  if (rules.perNickThrottle == null || rules.perNickThrottle === false) return { passed: true };
  if (!lastSentAt) return { passed: true };

  const delay = rules.randomDelayPerSend;
  if (!delay) return { passed: true };

  // Use min as throttle floor — gate only blocks if not even `min` minutes
  // have elapsed. The actual jittered delay is applied at scheduleNext.
  const minMs = delay.min * 60 * 1000;
  const elapsed = now.getTime() - lastSentAt.getTime();
  if (elapsed >= minMs) return { passed: true };

  const retryAfter = new Date(lastSentAt.getTime() + minMs);
  return {
    passed: false,
    failedGate: 'per_nick_throttle',
    detail: `Nick gửi gần đây quá (${actionType}), throttle còn ${Math.ceil((minMs - elapsed) / 60000)} phút`,
    retryAfter,
  };
}

// Daily cap gate — caller passes count of tasks executed today by this nick
// for this action category. Cap value from ZaloAccount per-nick override.
export function checkDailyCap(
  actionType: BlockActionType,
  executedTodayCount: number,
  capValue: number,
): GateResult {
  if (capValue <= 0) return { passed: true }; // 0 = unlimited (admin convention)
  if (executedTodayCount < capValue) return { passed: true };

  // Retry at midnight (cap resets per day)
  const retryAfter = new Date();
  retryAfter.setDate(retryAfter.getDate() + 1);
  retryAfter.setHours(0, 5, 0, 0); // 5 min after midnight for safety
  return {
    passed: false,
    failedGate: actionType === 'request_friend' ? 'cap_friend_add' : 'cap_message',
    detail: `Nick hit daily cap ${capValue} (${executedTodayCount} đã gửi)`,
    retryAfter,
  };
}

// Stop-on-accept gate — if rule on and Contact has any accepted nick, skip.
// Caller passes acceptedNicksCount from Contact row.
export function checkStopOnAccept(
  rules: SequenceRuntimeRules,
  acceptedNicksCount: number,
): GateResult {
  // Treat null/undefined/false as DISABLED.
  if (rules.stopOnAccept == null || rules.stopOnAccept === false) return { passed: true };
  if (acceptedNicksCount === 0) return { passed: true };
  return {
    passed: false,
    failedGate: 'stop_on_accept',
    detail: `KH đã accept ${acceptedNicksCount} nick khác, dừng theo rule`,
  };
}

// Cross-nick recency gate — if ANY other nick had recent (within recencyDays)
// activity with this contact, skip. Caller passes the latest activity date
// across all other nicks (or null if none).
export function checkCrossNickRecency(
  now: Date,
  rules: SequenceRuntimeRules,
  latestOtherNickActivity: Date | null,
): GateResult {
  const days = rules.crossNickRecencyDays;
  // Treat null/undefined/0 as DISABLED — FE writes 0 when field cleared.
  if (days == null || days === 0) return { passed: true };
  if (days <= 0) return { passed: true };
  if (!latestOtherNickActivity) return { passed: true };

  const cutoffMs = days * 24 * 60 * 60 * 1000;
  const elapsed = now.getTime() - latestOtherNickActivity.getTime();
  if (elapsed >= cutoffMs) return { passed: true };

  // Retry after recency window expires
  const retryAfter = new Date(latestOtherNickActivity.getTime() + cutoffMs);
  return {
    passed: false,
    failedGate: 'cross_nick_recency',
    detail: `Nick khác đã active với KH trong ${Math.ceil((cutoffMs - elapsed) / (24 * 60 * 60 * 1000))} ngày qua`,
    retryAfter,
  };
}

// Block-archived gate — block was archived after task was enqueued. Snapshot
// still works (task carries content) but business rule: don't send if block
// was deliberately archived.
export function checkBlockArchived(
  blockArchivedAt: Date | null,
): GateResult {
  if (!blockArchivedAt) return { passed: true };
  return {
    passed: false,
    failedGate: 'block_archived',
    detail: 'Block đã bị archive sau khi task được enqueue',
  };
}

// Rule-disabled gate — Sequence / Trigger / Broadcast was disabled.
export function checkRuleEnabled(enabled: boolean): GateResult {
  if (enabled) return { passed: true };
  return {
    passed: false,
    failedGate: 'rule_disabled',
    detail: 'Sequence/Trigger đã bị disable',
  };
}

// ── Wave 1 — Frequency cap per contact on a Khối (chốt 2026-05-23) ────────
//
// Caller passes how many tasks for THIS contact × THIS block đã DONE trong
// window (typically queried as: state=done, contactId+blockId, executedAt > now - windowDays).
// Config từ Block.content.frequencyCapPerContact: { max: number, windowDays: number }.
// null/missing = no cap (default).
export function checkFrequencyCapPerContact(
  doneCount: number,
  cap: { max: number; windowDays: number } | null,
): GateResult {
  if (!cap || cap.max <= 0) return { passed: true };
  if (doneCount < cap.max) return { passed: true };
  return {
    passed: false,
    failedGate: 'frequency_cap_per_contact',
    detail: `KH đã nhận ${doneCount} tin từ Khối này trong ${cap.windowDays} ngày (cap=${cap.max})`,
  };
}

// Extract frequency cap from block.content. Returns null when missing/invalid.
export function extractFrequencyCap(
  blockContent: unknown,
): { max: number; windowDays: number } | null {
  if (!blockContent || typeof blockContent !== 'object') return null;
  const c = (blockContent as Record<string, unknown>).frequencyCapPerContact;
  if (!c || typeof c !== 'object') return null;
  const obj = c as Record<string, unknown>;
  const max = typeof obj.max === 'number' && Number.isInteger(obj.max) ? obj.max : null;
  const windowDays = typeof obj.windowDays === 'number' && Number.isInteger(obj.windowDays) ? obj.windowDays : null;
  if (max === null || windowDays === null) return null;
  if (max <= 0 || windowDays <= 0) return null;
  return { max, windowDays };
}
