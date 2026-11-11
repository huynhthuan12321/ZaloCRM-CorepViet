// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Nguyễn Tiến Lộc
import { computed, getCurrentScope, inject, onScopeDispose, shallowRef, type ComputedRef, type InjectionKey, type Ref } from 'vue';
import type { MobileViewportState } from '@/composables/use-mobile-viewport';

/**
 * Ngữ cảnh shell cho màn con (CONTRACT-A §5). MobileLayout là nơi DUY NHẤT gọi useMobileViewport
 * và provide giá trị này; màn con đọc qua useMobileShell(), không tự trừ pixel header/tabbar.
 */
export interface MobileChromeRequest {
  tabbar?: boolean;
  header?: boolean;
}

export interface MobileShellContext {
  viewport: MobileViewportState;
  /** Mặc định theo route (§4.1) và luôn ẩn khi bàn phím mở. */
  tabbarVisible: Readonly<Ref<boolean>>;
  /** Ẩn ở thread/profile (màn có header riêng). */
  headerVisible: Readonly<Ref<boolean>>;
  /** Màn con xin ẩn/hiện chrome; trả hàm release, tự release khi scope của caller dispose. */
  requestChrome(req: MobileChromeRequest): () => void;
}

/**
 * Phát trên window khi logout / đổi user (MobileLayout, CONTRACT-A §8). Chủ sở hữu từng kho state mobile
 * (nháp chat, bộ lọc inbox, hàng đợi offline...) lắng nghe để tự dọn; shell không import chúng.
 * detail: { previousUserId: string | null; userId: string | null }
 */
export const MOBILE_SESSION_RESET_EVENT = 'crm:mobile-session-reset';

export const MOBILE_SHELL_KEY: InjectionKey<MobileShellContext> = Symbol('mobile-shell');

export function useMobileShell(): MobileShellContext {
  const ctx = inject(MOBILE_SHELL_KEY, null);
  if (!ctx) throw new Error('useMobileShell() phải được gọi bên trong MobileLayout (thiếu MOBILE_SHELL_KEY).');
  return ctx;
}

/** Tạo bộ điều khiển chrome: mặc định theo route, request của màn con (mới nhất thắng) đè lên. */
export function createChromeController(defaults: {
  tabbar: Readonly<Ref<boolean>>;
  header: Readonly<Ref<boolean>>;
  keyboardOpen: Readonly<Ref<boolean>>;
}): Pick<MobileShellContext, 'tabbarVisible' | 'headerVisible' | 'requestChrome'> {
  const requests = shallowRef<Array<{ id: number } & MobileChromeRequest>>([]);
  let seq = 0;

  const pick = (field: 'tabbar' | 'header', fallback: boolean): boolean => {
    for (let i = requests.value.length - 1; i >= 0; i -= 1) {
      const value = requests.value[i][field];
      if (value !== undefined) return value;
    }
    return fallback;
  };

  const tabbarVisible: ComputedRef<boolean> = computed(() => pick('tabbar', defaults.tabbar.value) && !defaults.keyboardOpen.value);
  const headerVisible: ComputedRef<boolean> = computed(() => pick('header', defaults.header.value));

  function requestChrome(req: MobileChromeRequest): () => void {
    const id = (seq += 1);
    requests.value = [...requests.value, { id, ...req }];
    let released = false;
    const release = () => {
      if (released) return;
      released = true;
      requests.value = requests.value.filter(r => r.id !== id);
    };
    if (getCurrentScope()) onScopeDispose(release);
    return release;
  }

  return { tabbarVisible, headerVisible, requestChrome };
}
