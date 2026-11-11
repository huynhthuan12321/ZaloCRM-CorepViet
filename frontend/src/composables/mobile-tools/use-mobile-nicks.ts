// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Nguyễn Tiến Lộc
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { useMobile } from '@/composables/use-mobile';
import { classifyReadError } from './use-mobile-read-list';
import { fetchNickOptions, loadStoredNick, storeNick, type NickOption } from './mobile-tool-readers';

/**
 * Chọn nick Zalo cho các trang chỉ-đọc. Đọc GET /zalo-accounts (KHÔNG dùng useZaloAccounts vì nó mở socket QR khi mount).
 * Nhớ lựa chọn bằng cùng khóa localStorage với desktop; nick đã lưu không còn tồn tại -> rơi về nick đầu tiên.
 */
export function useMobileNicks(opts: { allowAll?: boolean } = {}) {
  const { isOnline } = useMobile();
  const nicks = ref<NickOption[]>([]);
  const nickId = ref('');
  const state = ref<'loading' | 'ready' | 'empty' | 'error' | 'offline' | 'forbidden'>('loading');
  let seq = 0;

  async function load(): Promise<void> {
    const mine = ++seq;
    state.value = 'loading';
    try {
      const list = await fetchNickOptions();
      if (mine !== seq) return;
      nicks.value = list;
      if (!list.length) { state.value = 'empty'; return; }
      const stored = loadStoredNick();
      if (!nickId.value || (nickId.value !== 'all' && !list.some(n => n.id === nickId.value))) {
        nickId.value = list.some(n => n.id === stored) ? stored : list[0].id;
      }
      state.value = 'ready';
    } catch (err) {
      if (mine !== seq) return;
      state.value = classifyReadError(err, isOnline.value).state;
    }
  }
  function select(id: string) {
    nickId.value = id;
    storeNick(id);
  }
  const options = computed(() => (opts.allowAll && nicks.value.length > 1 ? [{ id: 'all', label: 'Tất cả nick', status: '' }, ...nicks.value] : nicks.value));
  const selectedLabel = computed(() => options.value.find(n => n.id === nickId.value)?.label ?? '');

  onMounted(() => { void load(); });
  onBeforeUnmount(() => { seq++; });
  return { nicks, options, nickId, state, selectedLabel, select, load };
}
