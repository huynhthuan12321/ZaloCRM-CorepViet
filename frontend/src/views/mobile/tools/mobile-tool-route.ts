// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Nguyễn Tiến Lộc
import { defineAsyncComponent, defineComponent, h, type Component } from 'vue';
import { useMobile } from '@/composables/use-mobile';
import type { MobileToolId } from '@/components/mobile/tools/tools-model';

export type MobileToolRouteKey = MobileToolId | 'media';

/**
 * Bọc component route desktop: trên mobile dựng trang mobile tương ứng, ngoài mobile render NGUYÊN component desktop (cùng DOM, không
 * wrapper) nên desktop/tablet không đổi. Dùng ở router (LOCK REQUEST) thay cho `() => import('@/views/XView.vue')`:
 *   component: mobileToolRoute('friends', () => import('@/views/FriendsView.vue'))
 * Trang mobile được nạp lười: bundle desktop không phải gánh code mobile.
 */
export function mobileToolRoute(key: MobileToolRouteKey, desktop: () => Promise<{ default: Component }>): Component {
  const Desktop = defineAsyncComponent(desktop);
  const ToolPage = defineAsyncComponent(() => import('@/components/mobile/tools/MobileToolPage.vue'));
  const MobileMedia = defineAsyncComponent(() => import('./MobileMediaView.vue'));
  return defineComponent({
    name: `MobileToolRoute_${key}`,
    inheritAttrs: false,
    setup(_props, { attrs }) {
      const { isMobile } = useMobile();
      return () => {
        if (!isMobile.value) return h(Desktop, attrs);
        return key === 'media' ? h(MobileMedia) : h(ToolPage, { tool: key });
      };
    },
  });
}
