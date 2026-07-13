// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Huỳnh Ngọc Thuận — Community extension
/**
 * care-session-view-logic.ts — logic THUẦN cho trang Phiên chăm sóc / Bám đuổi thủ công
 * (Phase 4.1). Tách khỏi composable/component để unit-test không cần DOM.
 * Nhãn trạng thái, lọc theo state, định dạng tiến độ + thời gian tương đối.
 */

export type CareState = 'running' | 'paused' | 'completed' | 'stopped';

export interface CareSessionItem {
  id: string;
  contactId: string;
  contactName: string;
  contactPhone: string | null;
  sequenceId: string | null;
  sequenceName: string;
  nickName: string;
  sourceType: string;
  state: CareState;
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
  dryRun: boolean;
}

export const STATE_META: Record<CareState, { label: string; tone: string }> = {
  running: { label: 'Đang chạy', tone: 'run' },
  paused: { label: 'Tạm dừng', tone: 'pause' },
  completed: { label: 'Hoàn thành', tone: 'done' },
  stopped: { label: 'Đã dừng', tone: 'stop' },
};

export function stateLabel(s: CareState): string {
  return STATE_META[s]?.label ?? s;
}
export function stateTone(s: CareState): string {
  return STATE_META[s]?.tone ?? 'run';
}

/** Bộ lọc chọn được ở UI (thứ tự hiển thị). */
export const STATE_FILTERS: Array<{ value: string; label: string }> = [
  { value: 'all', label: 'Tất cả' },
  { value: 'running', label: 'Đang chạy' },
  { value: 'paused', label: 'Tạm dừng' },
  { value: 'completed', label: 'Hoàn thành' },
  { value: 'stopped', label: 'Đã dừng' },
];

/** Lọc client theo state + từ khoá (tên KH / SĐT). Dùng khi đã có sẵn list (không gọi API lại). */
export function filterSessions(items: CareSessionItem[], opts: { state?: string; q?: string }): CareSessionItem[] {
  const state = opts.state && opts.state !== 'all' ? opts.state : null;
  const q = (opts.q ?? '').trim().toLowerCase();
  return items.filter((it) => {
    if (state && it.state !== state) return false;
    if (q && !it.contactName.toLowerCase().includes(q) && !(it.contactPhone ?? '').toLowerCase().includes(q)) return false;
    return true;
  });
}

/** "bước 2/5" (đã gửi/tổng). Ưu tiên stepsSent; fallback currentStepIdx khi chưa có event. */
export function progressLabel(it: Pick<CareSessionItem, 'stepsSent' | 'currentStepIdx' | 'totalSteps'>): string {
  const done = Math.max(it.stepsSent, it.currentStepIdx);
  const total = it.totalSteps || 0;
  if (!total) return `${done} bước`;
  return `bước ${Math.min(done, total)}/${total}`;
}

/** Thời gian tương đối tiếng Việt gọn (so với `now`, mặc định hiện tại). */
export function relTime(iso: string | null, now: Date = new Date()): string {
  if (!iso) return '';
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return '';
  const diff = now.getTime() - t;
  const abs = Math.abs(diff);
  const min = Math.round(abs / 60000);
  const suffix = diff >= 0 ? 'trước' : 'nữa';
  if (min < 1) return 'vừa xong';
  if (min < 60) return `${min} phút ${suffix}`;
  const hrs = Math.round(min / 60);
  if (hrs < 24) return `${hrs} giờ ${suffix}`;
  const days = Math.round(hrs / 24);
  return `${days} ngày ${suffix}`;
}
