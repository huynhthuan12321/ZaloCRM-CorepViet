// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Huỳnh Ngọc Thuận — Community extension
/**
 * sequence-snapshot.ts — helper thuần cho steps của Luồng kịch bản (Community).
 *
 * Dùng chung giữa community-automation-routes (CRUD/enroll), care-session-cron
 * (worker gửi bước) và care-session-listener (enroll bám đuổi từ Mục tiêu).
 * Snapshot LÚC ENROLL được ghi vào CareSession.stepsSnapshot — sửa luồng sau đó
 * KHÔNG làm đổi nội dung các phiên đang chạy (fix rủi ro "sửa template live").
 */

export type SequenceDraftStep = {
  text: string;
  delayMinutes: number;
  styles: unknown[];
};

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function textFromUnknown(value: unknown): string {
  if (typeof value === 'string') return value;
  if (!value || typeof value !== 'object') return '';
  const row = value as Record<string, unknown>;
  return String(row.text ?? row.content ?? row.messageText ?? row.message ?? '');
}

/**
 * Parse steps từ JSON (steps live của sequence HOẶC stepsSnapshot của phiên).
 * KHÔNG chèn step mặc định khi rỗng — worker cần biết "không có gì để gửi"
 * thay vì gửi placeholder cho khách thật.
 */
export function parseSequenceSteps(value: unknown, fallbackText = ''): SequenceDraftStep[] {
  const raw = asArray(value);
  const rows = raw.length ? raw : (fallbackText.trim() ? [{ text: fallbackText }] : []);
  return rows
    .map((row, index) => {
      const obj = row && typeof row === 'object' ? row as Record<string, unknown> : {};
      const text = textFromUnknown(row).trim();
      const delay = Number(obj.delayMinutes ?? obj.delay ?? (index === 0 ? 0 : 1440));
      return {
        text,
        delayMinutes: Number.isFinite(delay) && delay >= 0 ? Math.round(delay) : (index === 0 ? 0 : 1440),
        styles: Array.isArray(obj.styles) ? obj.styles : [],
      };
    })
    .filter((row) => row.text);
}

/**
 * Như parseSequenceSteps nhưng đảm bảo ≥1 step (chèn mặc định khi rỗng) —
 * dành cho CRUD tạo/sửa luồng, giữ nguyên hành vi cũ của routes.
 */
export function normalizeSequenceSteps(value: unknown, fallbackText = ''): SequenceDraftStep[] {
  const steps = parseSequenceSteps(value, fallbackText);
  return steps.length ? steps : [{ text: 'Tin nhan cham soc khach hang', delayMinutes: 0, styles: [] }];
}

/** Luật runtime đọc từ CareSession.rulesSnapshot (fallback mặc định an toàn). */
export type SnapshotRules = {
  /** Khung giờ VN cho phép gửi [start, end) — mặc định [8, 21]. */
  allowedHourRange: [number, number];
  /** Giãn cách tối thiểu (phút) giữa 2 tin automation trên CÙNG nick — "giãn đều giữa nick". */
  sendGapMinutes: number;
  /** KH trả lời → tạm dừng phiên bấy nhiêu giờ (0 = chỉ ghi nhận, không dừng). */
  pauseOnReplyHours: number;
  /** KH trả lời → đóng hẳn phiên (ưu tiên hơn pauseOnReplyHours). */
  stopOnReply: boolean;
};

export function parseSnapshotRules(value: unknown): SnapshotRules {
  const raw = value && typeof value === 'object' ? value as Record<string, unknown> : {};
  const range = Array.isArray(raw.allowedHourRange) ? raw.allowedHourRange : [];
  const start = Number(range[0]);
  const end = Number(range[1]);
  const gap = raw.sendGap && typeof raw.sendGap === 'object' ? raw.sendGap as Record<string, unknown> : null;
  const gapValue = Number(gap?.value);
  const gapUnit = String(gap?.unit ?? 'minute');
  const gapMinutes = Number.isFinite(gapValue) && gapValue > 0
    ? Math.round(gapUnit === 'hour' ? gapValue * 60 : gapValue)
    : 5;
  const pauseHours = Number(raw.pauseOnReplyHours);
  return {
    allowedHourRange: [
      Number.isFinite(start) ? Math.min(23, Math.max(0, start)) : 8,
      Number.isFinite(end) ? Math.min(24, Math.max(1, end)) : 21,
    ],
    sendGapMinutes: Math.min(24 * 60, Math.max(1, gapMinutes)),
    pauseOnReplyHours: Number.isFinite(pauseHours) ? Math.min(168, Math.max(0, pauseHours)) : 24,
    stopOnReply: raw.stopOnReply === true || raw.stopIfCustomerReplied === true,
  };
}
