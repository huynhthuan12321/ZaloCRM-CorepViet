// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Nguyễn Tiến Lộc
import type { MobileFeedbackState } from '@/components/mobile/shell/types';

export type SettingsLoadState = 'loading' | 'ready' | 'error' | 'offline' | 'forbidden';

/** Phân loại lỗi tải: mất mạng -> offline; 401/403 -> forbidden; còn lại -> error. Không bao giờ giả làm "danh sách rỗng". */
export function classifyLoadError(err: unknown, online: boolean): Exclude<SettingsLoadState, 'loading' | 'ready'> {
  if (!online) return 'offline';
  const status = (err as { response?: { status?: number } } | null)?.response?.status;
  if (status === 403 || status === 401) return 'forbidden';
  if (!(err as { response?: unknown } | null)?.response && typeof navigator !== 'undefined' && navigator.onLine === false) return 'offline';
  return 'error';
}

export function apiErrorMessage(err: unknown, fallback: string): string {
  const data = (err as { response?: { data?: { error?: unknown; message?: unknown } } } | null)?.response?.data;
  const msg = data?.error ?? data?.message;
  return typeof msg === 'string' && msg.trim() ? msg : fallback;
}

export function feedbackStateOf(s: SettingsLoadState): MobileFeedbackState | null {
  return s === 'ready' ? null : s;
}
