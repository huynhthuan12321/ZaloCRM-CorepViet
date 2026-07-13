// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Huỳnh Ngọc Thuận — Community extension
/**
 * care-session-list-helpers.ts — logic THUẦN (không I/O) cho trang standalone
 * "Phiên chăm sóc" + "Bám đuổi thủ công" (Phase 4.1).
 *
 * Tách khỏi routes để unit-test được: suy ra trạng thái hiển thị, map DTO cho UI,
 * và tổng hợp thẻ đếm. KHÔNG gọi Zalo, KHÔNG side-effect — chỉ biến đổi dữ liệu.
 *
 * Trạng thái hiển thị (khác `state` DB thô):
 *   running   — phiên active, đang được worker Community chạy (dry-run trên production).
 *   paused    — active nhưng pausedUntil còn hiệu lực (KH vừa trả lời / sale tạm dừng).
 *   completed — đã đóng do chạy hết bước (closedReason completed|source_done).
 *   stopped   — đã đóng vì lý do khác (sale_resolved|customer_blocked|step_failed…).
 */

export type CareSessionListState = 'running' | 'paused' | 'completed' | 'stopped';

export interface CareSessionStateInput {
  state: string; // 'active' | 'closed'
  closedReason: string | null;
  pausedUntil: Date | null;
  /** Mốc "hiện tại" để so pausedUntil — truyền vào để test tất định (không dùng Date.now trong hàm thuần). */
  now?: Date;
}

/** Suy ra trạng thái hiển thị từ cột DB thô. */
export function deriveSessionState(s: CareSessionStateInput): CareSessionListState {
  if (s.state === 'closed') {
    return s.closedReason === 'completed' || s.closedReason === 'source_done' ? 'completed' : 'stopped';
  }
  const now = (s.now ?? new Date()).getTime();
  if (s.pausedUntil && s.pausedUntil.getTime() > now) return 'paused';
  return 'running';
}

export interface CareSessionRow {
  id: string;
  contactId: string;
  nickId: string;
  sourceType: string;
  sourceSequenceId: string | null;
  state: string;
  closedReason: string | null;
  pausedUntil: Date | null;
  lastReplyAt: Date | null;
  currentStepIdx: number;
  stepsSnapshot: unknown;
  nextRunAt: Date | null;
  lastSentAt: Date | null;
  lastError: string | null;
  openedAt: Date;
  closedAt: Date | null;
}

export interface CareSessionListItem {
  id: string;
  contactId: string;
  contactName: string;
  contactPhone: string | null;
  sequenceId: string | null;
  sequenceName: string;
  nickId: string;
  nickName: string;
  sourceType: string;
  state: CareSessionListState;
  currentStepIdx: number;
  totalSteps: number;
  stepsSent: number;
  lastSentAt: string | null;
  nextRunAt: string | null;
  pausedUntil: string | null;
  lastReplyAt: string | null;
  lastError: string | null;
  openedAt: string;
  closedAt: string | null;
  closedReason: string | null;
  /** Production dry-run: phiên đang chạy KHÔNG gửi Zalo thật (worker ghi mock). */
  dryRun: boolean;
}

export interface ListItemContext {
  contactName: string;
  contactPhone: string | null;
  sequenceName: string;
  nickName: string;
  stepsSent: number;
  /** config.marketingDryRun — badge "đang chạy dry-run". */
  dryRun: boolean;
  now?: Date;
}

function totalStepsOf(stepsSnapshot: unknown): number {
  return Array.isArray(stepsSnapshot) ? stepsSnapshot.length : 0;
}

/** Map 1 CareSession + ngữ cảnh (đã join sẵn) → DTO cho UI. */
export function careSessionToListItem(row: CareSessionRow, ctx: ListItemContext): CareSessionListItem {
  const state = deriveSessionState({
    state: row.state,
    closedReason: row.closedReason,
    pausedUntil: row.pausedUntil,
    now: ctx.now,
  });
  return {
    id: row.id,
    contactId: row.contactId,
    contactName: ctx.contactName,
    contactPhone: ctx.contactPhone,
    sequenceId: row.sourceSequenceId,
    sequenceName: ctx.sequenceName,
    nickId: row.nickId,
    nickName: ctx.nickName,
    sourceType: row.sourceType,
    state,
    currentStepIdx: row.currentStepIdx,
    totalSteps: totalStepsOf(row.stepsSnapshot),
    stepsSent: ctx.stepsSent,
    lastSentAt: row.lastSentAt?.toISOString() ?? null,
    // nextRunAt chỉ có nghĩa khi phiên còn chạy — đóng rồi thì ẩn.
    nextRunAt: state === 'running' ? row.nextRunAt?.toISOString() ?? null : null,
    pausedUntil: row.pausedUntil?.toISOString() ?? null,
    lastReplyAt: row.lastReplyAt?.toISOString() ?? null,
    lastError: row.lastError,
    openedAt: row.openedAt.toISOString(),
    closedAt: row.closedAt?.toISOString() ?? null,
    closedReason: row.closedReason,
    // Chỉ phiên đang chạy mới liên quan dry-run (phiên đã đóng không gửi gì nữa).
    dryRun: ctx.dryRun && state === 'running',
  };
}

export interface CareSessionSummary {
  total: number;
  running: number;
  paused: number;
  completed: number;
  stopped: number;
}

/** Đếm thẻ tổng theo trạng thái hiển thị. */
export function summarizeSessions(items: Array<{ state: CareSessionListState }>): CareSessionSummary {
  const summary: CareSessionSummary = { total: items.length, running: 0, paused: 0, completed: 0, stopped: 0 };
  for (const it of items) summary[it.state]++;
  return summary;
}

/** Map filter state hiển thị → điều kiện Prisma `where` (append vào base where). */
export function stateFilterToWhere(state: string | undefined, now: Date): Record<string, unknown> | null {
  switch (state) {
    case 'running':
      return { state: 'active', OR: [{ pausedUntil: null }, { pausedUntil: { lte: now } }] };
    case 'paused':
      return { state: 'active', pausedUntil: { gt: now } };
    case 'completed':
      return { state: 'closed', closedReason: { in: ['completed', 'source_done'] } };
    case 'stopped':
      return { state: 'closed', NOT: { closedReason: { in: ['completed', 'source_done'] } } };
    default:
      return null; // 'all' / undefined → không filter thêm
  }
}
