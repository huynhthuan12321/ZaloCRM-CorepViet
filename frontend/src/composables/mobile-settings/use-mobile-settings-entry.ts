// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Nguyễn Tiến Lộc
import { computed, onScopeDispose, ref, watch, getCurrentScope } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { backDeltaToRoot, isSettingsDetail, isSettingsRoot, needsEntryNormalize, SETTINGS_ROOT } from './settings-nav-model';

/**
 * Điều hướng hai cấp của Cài đặt mobile.
 *
 * Cách chọn (an toàn): CHỈ thao tác bằng router.replace/push TRONG app, không dùng history.go(-n) hay can thiệp popstate
 * (không hijack vuốt-back Safari). Khi vào cấp 2 mà entry trước không thuộc Cài đặt, ghi đè entry hiện tại bằng `/settings`
 * rồi push đích -> lịch sử = [..., /settings, đích]. Back từ đích về /settings (cấp 1); từ /settings nút quay lại của shell
 * (useMobileBack('/account')) quay về entry trước nếu có, ngược lại replace('/account') nên không bao giờ rời app.
 * `ready` = false trong lúc chuẩn hóa để không chớp nội dung cấp 2 trước khi lịch sử đúng.
 */
export function useMobileSettingsEntry() {
  const route = useRoute();
  const router = useRouter();
  const ready = ref(false);
  /** true trong lúc chèn cấp 1 vào lịch sử (replace rồi push): UI không được coi là cấp 1 / không chớp menu. */
  const normalizing = ref(false);
  /** history.state.position của entry `/settings` gần nhất (vue-router ghi sẵn) — để quay về ĐÚNG entry đó bằng router.go(-n). */
  let rootPosition: number | null = null;
  let busy = false;
  let disposed = false;

  const isRoot = computed(() => isSettingsRoot(route.path));
  const isDetail = computed(() => isSettingsDetail(route.path));

  const historyBack = (): unknown => (typeof window === 'undefined' ? null : window.history.state?.back);
  const historyPosition = (): number | null => {
    const p = typeof window === 'undefined' ? null : window.history.state?.position;
    return typeof p === 'number' ? p : null;
  };

  async function check(): Promise<void> {
    if (busy || disposed) return;
    if (isRoot.value) rootPosition = historyPosition();
    if (!isDetail.value) { ready.value = true; return; }
    if (!needsEntryNormalize(route.path, historyBack())) { ready.value = true; return; }
    busy = true;
    normalizing.value = true;
    ready.value = false;
    const target = route.fullPath;
    try {
      await router.replace(SETTINGS_ROOT);
      rootPosition = historyPosition();
      await router.push(target);
    } finally {
      busy = false;
      normalizing.value = false;
      ready.value = true;
    }
  }

  watch(() => route.fullPath, () => { void check(); }, { immediate: true });
  if (getCurrentScope()) onScopeDispose(() => { disposed = true; });

  /**
   * Nút quay lại ở header cấp 2 -> luôn về danh sách (cấp 1) và KHÔNG tạo thêm entry `/settings`:
   * đi cấp 2 A -> cấp 2 B bằng link trong trang rồi bấm quay lại thì router.go(-n) lùi đúng tới entry `/settings` đã có
   * (lịch sử [/account, /settings, A, B] -> [/account, /settings], Back tiếp về /account), thay vì replace('/settings')
   * làm lịch sử thành [/settings, A, /settings]. Không biết vị trí (lịch sử lạ) mới dùng replace.
   */
  async function backToList(): Promise<void> {
    const delta = backDeltaToRoot(rootPosition, historyPosition());
    if (delta !== null) router.go(delta);
    else await router.replace(SETTINGS_ROOT);
  }

  function openItem(to: string): void {
    void router.push(to);
  }

  return { ready, normalizing, isRoot, isDetail, backToList, openItem };
}
