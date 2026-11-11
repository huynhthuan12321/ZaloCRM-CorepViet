// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Nguyễn Tiến Lộc
import { onScopeDispose, ref, shallowRef } from 'vue';
import { useMobile } from '@/composables/use-mobile';
import { classifyLoadError, type SettingsLoadState } from './load-state';

/**
 * Tải một lần dữ liệu CHỈ ĐỌC cho trang cài đặt mobile. Có số thứ tự (response cũ không ghi đè mới), phân loại lỗi (mất mạng/403/lỗi khác),
 * không bao giờ giả làm "rỗng". Fetcher do trang truyền vào, dùng đúng endpoint/store GET sẵn có của desktop.
 */
export function useReadonlyLoad<T>(fetcher: () => Promise<T>) {
  const { isOnline } = useMobile();
  const state = ref<SettingsLoadState>('loading');
  const data = shallowRef<T | null>(null);
  let seq = 0;
  async function load(): Promise<void> {
    const mine = ++seq;
    state.value = 'loading';
    try {
      const result = await fetcher();
      if (mine !== seq) return;
      data.value = result;
      state.value = 'ready';
    } catch (err) {
      if (mine === seq) state.value = classifyLoadError(err, isOnline.value);
    }
  }
  onScopeDispose(() => { seq++; });
  return { state, data, load };
}
