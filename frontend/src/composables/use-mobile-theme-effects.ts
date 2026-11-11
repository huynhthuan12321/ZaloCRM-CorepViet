// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Nguyễn Tiến Lộc
import { computed, onScopeDispose, watch, type ComputedRef, type Ref } from 'vue';
import { useTheme } from 'vuetify';
import { useUiThemeStore, VUETIFY_THEME_NAME, type ResolvedTheme } from '@/stores/ui-theme';

/**
 * Áp giao diện Sáng/Tối của mobile shell ra ngoài Vue (CONTRACT-A §6). Gọi DUY NHẤT trong setup()
 * của MobileLayout. Rời mobile (unmount) hoặc sang Báo cáo -> trả mọi thứ về trạng thái Sáng của
 * desktop (DefaultLayout luôn ép hsLight).
 *
 * Ghi chú: thuộc tính data-theme của root `.crm-mobile` do MobileLayout bind từ `effective`
 * (token tối khai báo cả cho `html[data-theme=dark] .crm-mobile` nên overlay teleport cũng ăn).
 */
export const THEME_COLOR = { light: '#f7f9fc', dark: '#0f1720' } as const; // = --m-bg (meta không đọc được CSS var)
const COLOR_SCHEME = { light: 'light only', dark: 'dark' } as const;

function metaTag(name: string): HTMLMetaElement {
  let el = document.head.querySelector<HTMLMetaElement>(`meta[name="${name}"]`);
  if (!el) {
    el = document.createElement('meta');
    el.setAttribute('name', name);
    document.head.appendChild(el);
  }
  return el;
}

export function useMobileThemeEffects(opts: { forceLight: Ref<boolean> }): { effective: ComputedRef<ResolvedTheme> } {
  const store = useUiThemeStore();
  const vuetifyTheme = useTheme();
  const effective = computed<ResolvedTheme>(() => (opts.forceLight.value ? 'light' : store.resolved));

  const colorSchemeMeta = metaTag('color-scheme');
  const themeColorMeta = metaTag('theme-color');
  const originalThemeColor = themeColorMeta.getAttribute('content');

  // Nền html/body theo token khi Tối: rubber-band / bàn phím iOS không lộ dải trắng. Sáng/Báo cáo/desktop: trả giá trị cũ.
  const rootEl = document.documentElement;
  const bodyEl = document.body;
  const originalBg = { html: rootEl.style.backgroundColor, body: bodyEl.style.backgroundColor };
  function applyBackdrop(mode: ResolvedTheme) {
    rootEl.style.backgroundColor = mode === 'dark' ? THEME_COLOR.dark : originalBg.html;
    bodyEl.style.backgroundColor = mode === 'dark' ? THEME_COLOR.dark : originalBg.body;
  }

  watch(
    effective,
    (mode) => {
      applyBackdrop(mode);
      vuetifyTheme.change(VUETIFY_THEME_NAME[mode]);
      document.documentElement.setAttribute('data-theme', mode);
      colorSchemeMeta.setAttribute('content', COLOR_SCHEME[mode]);
      themeColorMeta.setAttribute('content', THEME_COLOR[mode]);
    },
    { immediate: true },
  );

  onScopeDispose(() => {
    rootEl.style.backgroundColor = originalBg.html;
    bodyEl.style.backgroundColor = originalBg.body;
    vuetifyTheme.change(VUETIFY_THEME_NAME.light);
    document.documentElement.removeAttribute('data-theme');
    colorSchemeMeta.setAttribute('content', COLOR_SCHEME.light);
    if (originalThemeColor === null) themeColorMeta.removeAttribute('content');
    else themeColorMeta.setAttribute('content', originalThemeColor);
  });

  return { effective };
}
