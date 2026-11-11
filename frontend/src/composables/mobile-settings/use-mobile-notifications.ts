// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Nguyễn Tiến Lộc
import { ref } from 'vue';
import { api } from '@/api/index';
import { useMobile } from '@/composables/use-mobile';
import { classifyLoadError, type SettingsLoadState } from './load-state';

export interface MobileNotificationItem { id: string; type: string; title: string; detail: string; priority: string }

/** Đích điều hướng của một thông báo — CÙNG bản đồ với NotificationBell.handleClick và NotificationListSheet. */
export function notificationTarget(id: string): string | null {
  if (id === 'unreplied') return '/chat';
  if (id.startsWith('apt-') || id === 'tmr-apts') return '/appointments';
  if (id.startsWith('zalo-')) return '/zalo-accounts';
  return null;
}

/** Chỉ đọc: GET /notifications (API hiện có). Lỗi hiện là lỗi/offline, không giả làm "không có thông báo". */
export function useMobileNotifications() {
  const { isOnline } = useMobile();
  const items = ref<MobileNotificationItem[]>([]);
  const state = ref<SettingsLoadState>('loading');
  let seq = 0;

  async function load(): Promise<void> {
    const mine = ++seq;
    state.value = 'loading';
    try {
      const res = await api.get('/notifications');
      if (mine !== seq) return;
      items.value = Array.isArray(res.data?.notifications) ? res.data.notifications : [];
      state.value = 'ready';
    } catch (err) {
      if (mine !== seq) return;
      state.value = classifyLoadError(err, isOnline.value);
    }
  }
  return { items, state, load };
}
