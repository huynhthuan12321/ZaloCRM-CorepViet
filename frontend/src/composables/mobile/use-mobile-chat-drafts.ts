// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Nguyễn Tiến Lộc
import { getCurrentScope, onScopeDispose, reactive } from 'vue';
import { MOBILE_SESSION_RESET_EVENT } from '@/components/mobile/shell/shell-context';

/**
 * Nháp theo hội thoại cho mobile (CONTRACT-A §3.2, D-7): CHỈ nằm trong RAM, khóa theo convId, không localStorage.
 * Đổi hội thoại không mang chữ sang khách khác (H11). Dọn sạch khi logout/đổi user (crm:mobile-session-reset).
 */
export interface MobileChatDrafts {
  get(convId: string): string;
  set(convId: string, text: string): void;
  clear(convId: string): void;
  clearAll(): void;
  hasDraft(convId: string): boolean;
  /** Còn nháp nào có chữ (dùng cho cảnh báo beforeunload). */
  hasAnyDraft(): boolean;
}

const drafts = reactive(new Map<string, string>());
let resetListenerBound = false;

function bindResetListener() {
  if (resetListenerBound || typeof window === 'undefined') return;
  resetListenerBound = true;
  window.addEventListener(MOBILE_SESSION_RESET_EVENT, () => drafts.clear());
}

const api: MobileChatDrafts = {
  get: (convId) => drafts.get(convId) ?? '',
  set(convId, text) {
    if (!convId) return;
    if (text === '') drafts.delete(convId);
    else drafts.set(convId, text);
  },
  clear: (convId) => { drafts.delete(convId); },
  clearAll: () => drafts.clear(),
  hasDraft: (convId) => (drafts.get(convId) ?? '').trim() !== '',
  hasAnyDraft() {
    for (const text of drafts.values()) if (text.trim() !== '') return true;
    return false;
  },
};

export function useMobileChatDrafts(): MobileChatDrafts {
  bindResetListener();
  return api;
}

/**
 * Cảnh báo khi đóng/tải lại tab mà còn nháp chưa gửi (D-7). Chỉ hoạt động trong vòng đời scope gọi nó.
 * Safari iOS thường bỏ qua hộp thoại này; nháp vẫn mất khi app bị hệ thống thu hồi (ghi nhận trong báo cáo).
 */
export function useDraftUnloadGuard(drafts: Pick<MobileChatDrafts, 'hasAnyDraft'> = api): void {
  if (typeof window === 'undefined') return;
  const handler = (e: BeforeUnloadEvent) => {
    if (!drafts.hasAnyDraft()) return;
    e.preventDefault();
    e.returnValue = '';
  };
  window.addEventListener('beforeunload', handler);
  if (getCurrentScope()) onScopeDispose(() => window.removeEventListener('beforeunload', handler));
}

/** Chỉ dùng trong test. */
export function __resetMobileChatDraftsForTest() {
  drafts.clear();
}
