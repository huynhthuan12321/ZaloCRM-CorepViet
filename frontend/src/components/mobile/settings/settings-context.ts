// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Nguyễn Tiến Lộc
import { inject, type InjectionKey } from 'vue';

/**
 * Khung Cài đặt mobile `provide(true)` cho mọi trang cấp 2 nó mount qua RouterView. Component desktop dùng chung (OrgSettings,
 * UsersRbacView) đọc cờ này (hoặc prop `mobile` tường minh) để bật bố cục mobile; ngoài khung mobile mặc định false -> DOM desktop không đổi.
 * Dùng provide/inject thay vì truyền prop vì trang được RouterView dựng (onBeforeRouteLeave chỉ chạy được bên trong RouterView).
 */
export const MOBILE_SETTINGS_KEY: InjectionKey<boolean> = Symbol('mobile-settings-page');

export function useInMobileSettings(): boolean {
  return inject(MOBILE_SETTINGS_KEY, false);
}
