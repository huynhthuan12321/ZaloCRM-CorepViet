// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Nguyễn Tiến Lộc
/**
 * care-session-timeline.ts — Map CareSessionEvent → timeline item cho UI (Phase 4).
 *
 * Frontend FollowUpHistoryDialog gọi GET /contacts/:contactId/followup-history nhưng
 * bản Community trước KHÔNG có endpoint (EE-only) → dialog timeline Phiên chăm sóc
 * CHẾT 404. Helper thuần này (không phụ thuộc prisma) map event log sang shape
 * `TimelineItem` mà dialog kỳ vọng; test độc lập.
 *
 * eventType (CareSessionEvent):
 *   'step_sent'      → kind 'step' (tin bám đuổi đã gửi thật)
 *   'step_simulated'  → kind 'step' (mô phỏng dry-run, status='simulated')
 *   'reply'           → kind 'reply' (khách trả lời)
 *   còn lại (reaction_pos/neg, paused, closed, notified, opened, blocked,
 *            friend_accept, friend_reject) → giữ nguyên kind = eventType (mark).
 */

export interface CareEventRow {
  eventType: string;
  payload: unknown;
  createdAt: Date;
}

export interface TimelineItem {
  kind: string;
  at: string;
  stepIdx?: number | null;
  content?: string | null;
  contentType?: string | null;
  attachments?: unknown;
  status?: string;
  text?: string | null;
  emoji?: string | null;
  /** 'dry_run' | 'live' — chế độ gửi, để frontend phân biệt. */
  deliveryMode?: string | null;
  /** 'scheduled' | 'manual_run_now' — trigger nguồn. */
  trigger?: string | null;
}

function asRecord(v: unknown): Record<string, unknown> {
  return v && typeof v === 'object' ? (v as Record<string, unknown>) : {};
}

export function careEventToTimelineItem(ev: CareEventRow): TimelineItem {
  const p = asRecord(ev.payload);
  const at = ev.createdAt.toISOString();

  if (ev.eventType === 'step_sent' || ev.eventType === 'step_simulated') {
    return {
      kind: 'step',
      at,
      stepIdx: typeof p.stepIdx === 'number' ? p.stepIdx : null,
      content: typeof p.text === 'string' ? p.text : null,
      contentType: 'text',
      attachments: Array.isArray(p.attachments) ? p.attachments : [],
      status: ev.eventType === 'step_simulated' ? 'simulated'
        : (typeof p.status === 'string' ? p.status : 'sent'),
      deliveryMode: typeof p.deliveryMode === 'string' ? p.deliveryMode
        : (ev.eventType === 'step_simulated' ? 'dry_run' : 'live'),
      trigger: typeof p.trigger === 'string' ? p.trigger : null,
    };
  }

  if (ev.eventType === 'reply') {
    return { kind: 'reply', at, text: typeof p.text === 'string' ? p.text : null };
  }

  // Mark events: giữ nguyên kind = eventType (frontend MARK map biết các key này).
  return {
    kind: ev.eventType,
    at,
    emoji: typeof p.emoji === 'string' ? p.emoji : null,
    text: typeof p.reason === 'string' ? p.reason : null,
  };
}

/** Dựng response { flow: { stepsSent, stepsSimulated, stepsProcessed }, timeline } từ danh sách event đã sort tăng dần. */
export function buildFollowupHistory(events: CareEventRow[]): {
  flow: { stepsSent: number; stepsSimulated: number; stepsProcessed: number };
  timeline: TimelineItem[];
} {
  const timeline = events.map(careEventToTimelineItem);
  const stepsSent = events.filter((e) => e.eventType === 'step_sent').length;
  const stepsSimulated = events.filter((e) => e.eventType === 'step_simulated').length;
  return {
    flow: { stepsSent, stepsSimulated, stepsProcessed: stepsSent + stepsSimulated },
    timeline,
  };
}
