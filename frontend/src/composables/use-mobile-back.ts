// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Nguyễn Tiến Lộc
import { computed, type ComputedRef } from 'vue';
import { useRoute, useRouter, type RouteLocationRaw } from 'vue-router';

/**
 * Nút quay lại trong app (CONTRACT-A §4.2). Không bao giờ để back rời app/đóng PWA:
 * không có lịch sử nội bộ -> router.replace(fallback). Không hijack vuốt-back của Safari.
 */
export function useMobileBack(fallback: RouteLocationRaw): { canGoBackInApp: ComputedRef<boolean>; goBack(): Promise<void> } {
  const router = useRouter();
  const route = useRoute();

  // vue-router 4 ghi history.state.back (chuỗi) cho điều hướng nội bộ, null ở lần vào đầu tiên.
  // history.state không reactive -> phụ thuộc route.fullPath để tính lại sau mỗi lần điều hướng.
  const canGoBackInApp = computed(() => {
    void route.fullPath;
    return typeof window !== 'undefined' && typeof window.history.state?.back === 'string';
  });

  async function goBack(): Promise<void> {
    if (canGoBackInApp.value) router.back();
    else await router.replace(fallback);
  }

  return { canGoBackInApp, goBack };
}
