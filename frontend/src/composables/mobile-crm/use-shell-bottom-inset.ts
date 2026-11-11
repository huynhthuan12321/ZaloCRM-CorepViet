// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Nguyễn Tiến Lộc
import { computed, inject, type ComputedRef } from 'vue';
import { MOBILE_SHELL_KEY } from '@/components/mobile/shell/shell-context';

/**
 * Khoảng cách đáy cho nút nổi của màn CRM (FAB "Tạo khách"/"Tạo lịch"): phải nằm TRÊN tabbar và nút Hội thoại nổi
 * (--m-fab-lift) khi tabbar hiện; khi tabbar ẩn (bàn phím, màn chi tiết) thì chỉ cần cách đáy một khoảng + safe-area.
 * Đọc shell qua inject tùy chọn để presenter vẫn mount được ngoài MobileLayout (test).
 */
export function useShellBottomInset(): ComputedRef<string> {
  const shell = inject(MOBILE_SHELL_KEY, null);
  return computed(() => {
    const tabbar = shell ? shell.tabbarVisible.value : true;
    return tabbar
      ? 'calc(var(--m-tabbar) + var(--m-fab-lift) + var(--m-space-4) + var(--m-safe-bottom))'
      : 'calc(var(--m-space-4) + var(--m-safe-bottom))';
  });
}
