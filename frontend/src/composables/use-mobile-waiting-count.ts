// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Nguyễn Tiến Lộc
import { getCurrentScope, onScopeDispose, readonly, ref, watch, type Ref } from 'vue';
import { useRoute } from 'vue-router';
import { api } from '@/api/index';
import { useAuthStore } from '@/stores/auth';

/**
 * Badge "khách chờ trả lời" trên tab Hội thoại (CONTRACT-A §4.4, D-11).
 * Nguồn: GET /conversations/counts -> `unreplied` (phạm vi nick user được xem; admin = toàn org, endpoint nặng).
 *
 * - null = chưa có / lỗi / chưa đăng nhập -> KHÔNG hiện badge (không bao giờ đổi lỗi thành 0).
 * - Không tạo socket, không polling nền. Làm mới khi: shell mount, đổi route, tab hiện lại,
 *   window 'chat:inbound-message' (chỉ phát khi use-chat đang mở socket).
 * - Debounce 2s; giữa hai lần gọi TỰ ĐỘNG tối thiểu 30s (gọi tay refresh() bỏ qua mốc này).
 * - Single-flight; kết quả của người dùng cũ bị bỏ khi logout/đổi user.
 */
export const WAITING_COUNT_DEBOUNCE_MS = 2000;
export const WAITING_COUNT_MIN_INTERVAL_MS = 30000;
export const CHAT_INBOUND_EVENT = 'chat:inbound-message';

export interface MobileWaitingCount {
  count: Readonly<Ref<number | null>>;
  refresh(): Promise<void>;
  /** Logout / đổi user: xóa số, hủy lịch, bỏ qua kết quả đang bay. */
  reset(): void;
}

const count = ref<number | null>(null);
let inflight: Promise<void> | null = null;
let inflightGeneration = -1;
let generation = 0;
let lastRequestAt = 0;
let timer: ReturnType<typeof setTimeout> | null = null;
let consumers = 0;

function pageHidden(): boolean {
  return typeof document !== 'undefined' && document.visibilityState === 'hidden';
}

function clearTimer() {
  if (timer !== null) clearTimeout(timer);
  timer = null;
}

function reset() {
  generation += 1;
  count.value = null;
  clearTimer();
}

function refresh(): Promise<void> {
  const auth = useAuthStore();
  if (!auth.user) {
    reset();
    return Promise.resolve();
  }
  if (inflight && inflightGeneration === generation) return inflight; // single-flight
  const gen = generation;
  inflightGeneration = gen;
  lastRequestAt = Date.now();
  const run = (async () => {
    try {
      const res = await api.get('/conversations/counts');
      if (gen !== generation) return;
      const raw = res.data?.unreplied;
      count.value = typeof raw === 'number' && Number.isFinite(raw) && raw >= 0 ? Math.floor(raw) : null;
    } catch {
      if (gen === generation) count.value = null; // lỗi -> không hiện, tuyệt đối không là 0
    }
  })();
  inflight = run;
  // Xóa cờ single-flight SAU khi đã gán (an toàn cả khi run kết thúc đồng bộ).
  void run.then(() => { if (inflight === run) inflight = null; });
  return run;
}

function scheduleRefresh() {
  if (pageHidden()) return; // không gọi nền khi tab ẩn; visibilitychange sẽ kích hoạt lại
  clearTimer();
  const wait = Math.max(WAITING_COUNT_DEBOUNCE_MS, lastRequestAt + WAITING_COUNT_MIN_INTERVAL_MS - Date.now());
  timer = setTimeout(() => {
    timer = null;
    if (!pageHidden()) void refresh();
  }, wait);
}

function onVisibility() {
  if (!pageHidden()) scheduleRefresh();
}

function retain() {
  consumers += 1;
  if (consumers === 1 && typeof window !== 'undefined') {
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener(CHAT_INBOUND_EVENT, scheduleRefresh);
  }
}

function release() {
  consumers -= 1;
  if (consumers === 0 && typeof window !== 'undefined') {
    document.removeEventListener('visibilitychange', onVisibility);
    window.removeEventListener(CHAT_INBOUND_EVENT, scheduleRefresh);
    clearTimer();
  }
}

export function useMobileWaitingCount(): MobileWaitingCount {
  retain();
  let released = false;
  if (getCurrentScope()) {
    const auth = useAuthStore();
    const route = useRoute();
    // Đăng nhập / đổi user: lấy số mới ngay; logout: về null.
    watch(
      () => auth.user?.id ?? null,
      (id, prev) => {
        if (id === prev) return;
        reset();
        if (id) void refresh();
      },
      { immediate: false },
    );
    watch(() => route.fullPath, () => scheduleRefresh());
    onScopeDispose(() => {
      if (released) return;
      released = true;
      release();
    });
    // Mount shell: lấy số ngay (bỏ qua debounce), chỉ khi đã có user.
    if (auth.user && !pageHidden() && Date.now() - lastRequestAt >= WAITING_COUNT_MIN_INTERVAL_MS) void refresh();
  }
  return { count: readonly(count), refresh, reset };
}

/** Chỉ cho test: đưa singleton về trạng thái sạch. */
export function __resetWaitingCountForTests() {
  reset();
  inflight = null;
  lastRequestAt = 0;
  consumers = 0;
}
