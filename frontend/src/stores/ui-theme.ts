// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Nguyễn Tiến Lộc
import { defineStore } from 'pinia';
import { computed, onScopeDispose, ref } from 'vue';

/**
 * Tùy chọn giao diện của mobile shell (CONTRACT-A §6). Tối CHỈ áp cho mobile (D-3).
 *
 * - KHÔNG đọc/ghi key 'theme' (desktop ghi 'hsLight' vào đó -> trước đây mobile hiểu nhầm là dark, H2).
 * - Mặc định 'light' (D-2); giá trị lạ trong storage -> 'light'.
 * - Lưu theo người dùng: sau bindUser(id) lựa chọn nằm ở `${THEME_STORAGE_KEY}:${id}`.
 *   Chưa có user (bindUser(null)) dùng khóa gốc THEME_STORAGE_KEY. User chưa chọn bao giờ -> 'light',
 *   không thừa hưởng lựa chọn của người dùng trước trên cùng thiết bị.
 */
export type ThemePreference = 'light' | 'dark' | 'system';
export type ResolvedTheme = 'light' | 'dark';

export const THEME_STORAGE_KEY = 'crm.mobile.themePreference';
export const VUETIFY_THEME_NAME = { light: 'hsLight', dark: 'hsDark' } as const;

const PREFERENCES: readonly ThemePreference[] = ['light', 'dark', 'system'];
const DARK_QUERY = '(prefers-color-scheme: dark)';

export function normalizeThemePreference(value: unknown): ThemePreference {
  return typeof value === 'string' && (PREFERENCES as readonly string[]).includes(value) ? (value as ThemePreference) : 'light';
}

function storageKey(userId: string | null): string {
  return userId ? `${THEME_STORAGE_KEY}:${userId}` : THEME_STORAGE_KEY;
}

function readStored(userId: string | null): ThemePreference {
  try {
    return normalizeThemePreference(window.localStorage.getItem(storageKey(userId)));
  } catch {
    return 'light'; // Safari private mode / storage bị chặn
  }
}

function writeStored(userId: string | null, value: ThemePreference): void {
  try {
    window.localStorage.setItem(storageKey(userId), value);
  } catch {
    /* Safari private mode: giữ lựa chọn trong RAM */
  }
}

export const useUiThemeStore = defineStore('uiTheme', () => {
  let boundUserId: string | null = null;
  const preference = ref<ThemePreference>(typeof window === 'undefined' ? 'light' : readStored(null));
  const systemPrefersDark = ref(false);

  if (typeof window !== 'undefined' && typeof window.matchMedia === 'function') {
    const media = window.matchMedia(DARK_QUERY);
    systemPrefersDark.value = media.matches;
    const onChange = (event: MediaQueryListEvent) => { systemPrefersDark.value = event.matches; };
    media.addEventListener('change', onChange);
    // Chỉ chạy khi store bị $dispose (test / HMR) — store sống suốt vòng đời app.
    onScopeDispose(() => media.removeEventListener('change', onChange));
  }

  const resolved = computed<ResolvedTheme>(() => {
    if (preference.value === 'system') return systemPrefersDark.value ? 'dark' : 'light';
    return preference.value;
  });

  /** Gắn lựa chọn với một người dùng; gọi khi `auth.user?.id` đổi (MobileLayout). */
  function bindUser(userId: string | null): void {
    boundUserId = userId || null;
    preference.value = typeof window === 'undefined' ? 'light' : readStored(boundUserId);
  }

  function setPreference(next: ThemePreference): void {
    const value = normalizeThemePreference(next);
    preference.value = value;
    if (typeof window !== 'undefined') writeStored(boundUserId, value);
  }

  return { preference, systemPrefersDark, resolved, bindUser, setPreference };
});
