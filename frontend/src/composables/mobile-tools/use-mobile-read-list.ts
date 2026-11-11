// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Nguyễn Tiến Lộc
import { computed, onBeforeUnmount, ref, watch, type Ref } from 'vue';
import { useMobile } from '@/composables/use-mobile';

export type ReadState = 'idle' | 'loading' | 'ready' | 'empty' | 'error' | 'offline' | 'forbidden';
export type ReadTone = 'ok' | 'warn' | 'muted' | 'danger';

/** Một dòng hiển thị chỉ-đọc (đã chuẩn hóa từ dữ liệu API hiện có). */
export interface ReadRow {
  id: string;
  title: string;
  subtitle?: string;
  meta?: string[];
  badge?: { text: string; tone: ReadTone };
  /** Có = dòng là liên kết (vd chi tiết tệp khách hàng). */
  to?: string;
}

export interface ReadPage {
  rows: ReadRow[];
  /** Tổng số bản ghi phía server (để biết còn trang sau). Danh sách không phân trang: = rows.length. */
  total: number;
}

export interface ReadRequest { page: number; limit: number; search: string }

interface HttpErrorLike { response?: { status?: number } }

export function classifyReadError(err: unknown, online: boolean): { state: 'offline' | 'forbidden' | 'error'; message: string } {
  const e = (err ?? {}) as HttpErrorLike;
  if (e.response?.status === 403) return { state: 'forbidden', message: 'Bạn không có quyền xem mục này.' };
  if (!e.response && !online) return { state: 'offline', message: 'Đang mất kết nối. Hãy kiểm tra mạng rồi thử lại.' };
  return { state: 'error', message: 'Không tải được dữ liệu. Hãy thử lại.' };
}

export interface ReadListOptions {
  pageSize: number;
  /** Chỉ ĐỌC (GET). Ném lỗi để hook phân loại; không nuốt lỗi thành "rỗng". */
  load: (req: ReadRequest) => Promise<ReadPage>;
  /** Khi giá trị này đổi (vd nick đang chọn, bộ lọc) -> tải lại từ trang 1. Trả null = chưa đủ điều kiện tải (giữ 'idle'). */
  deps?: () => unknown;
  /** Điều kiện đủ để tải (vd đã chọn nick). */
  ready?: () => boolean;
  /** Tìm kiếm phía client (danh sách server không phân trang): đổi từ khóa không gọi API. */
  localSearch?: (row: ReadRow, q: string) => boolean;
  debounceMs?: number;
}

/**
 * Danh sách chỉ-đọc có phân trang cho các trang Bạn bè/Nhóm/Marketing trên mobile.
 * Mỗi lần tải lại tăng `seq` để bỏ kết quả cũ về muộn và RESET `loadingMore` (tránh kẹt "Đang tải thêm" khi đổi bộ lọc giữa chừng).
 */
export function useMobileReadList(opts: ReadListOptions) {
  const { isOnline } = useMobile();
  const search = ref('');
  const allRows = ref<ReadRow[]>([]);
  const total = ref(0);
  const state = ref<ReadState>('idle');
  const errorMessage = ref('');
  const page = ref(1);
  const loadingMore = ref(false);
  const moreError = ref(false);
  let seq = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;

  const q = computed(() => search.value.trim());
  const rows = computed(() => {
    if (!opts.localSearch || !q.value) return allRows.value;
    const needle = q.value.toLowerCase();
    return allRows.value.filter(r => opts.localSearch!(r, needle));
  });
  const hasMore = computed(() => !opts.localSearch && state.value === 'ready' && allRows.value.length < total.value);
  const isEmpty = computed(() => state.value === 'ready' && rows.value.length === 0);

  function canLoad() { return opts.ready ? opts.ready() : true; }

  async function reload(): Promise<void> {
    const mine = ++seq;
    loadingMore.value = false;
    moreError.value = false;
    if (!canLoad()) { state.value = 'idle'; allRows.value = []; total.value = 0; return; }
    state.value = 'loading';
    errorMessage.value = '';
    page.value = 1;
    try {
      const res = await opts.load({ page: 1, limit: opts.pageSize, search: opts.localSearch ? '' : q.value });
      if (mine !== seq) return;
      allRows.value = res.rows;
      total.value = res.total;
      state.value = res.rows.length ? 'ready' : 'empty';
    } catch (err) {
      if (mine !== seq) return;
      const d = classifyReadError(err, isOnline.value);
      state.value = d.state;
      errorMessage.value = d.message;
      allRows.value = [];
      total.value = 0;
    }
  }

  async function loadMore(): Promise<void> {
    if (loadingMore.value || !hasMore.value) return;
    const mine = seq;
    loadingMore.value = true;
    moreError.value = false;
    try {
      const res = await opts.load({ page: page.value + 1, limit: opts.pageSize, search: q.value });
      if (mine !== seq) return;
      const seen = new Set(allRows.value.map(r => r.id));
      const fresh = res.rows.filter(r => !seen.has(r.id));
      allRows.value = allRows.value.concat(fresh);
      page.value += 1;
      total.value = res.rows.length === 0 ? allRows.value.length : res.total; // hết dữ liệu thật: dừng, không lặp
    } catch {
      if (mine === seq) moreError.value = true;
    } finally {
      if (mine === seq) loadingMore.value = false;
    }
  }

  if (opts.deps) watch(opts.deps, () => { void reload(); });
  watch(search, () => {
    if (opts.localSearch) return;
    clearTimeout(timer);
    timer = setTimeout(() => { void reload(); }, opts.debounceMs ?? 350);
  });
  watch(isOnline, (online, was) => {
    if (online && !was && (state.value === 'offline' || state.value === 'error')) void reload();
  });
  onBeforeUnmount(() => { clearTimeout(timer); seq++; });

  return {
    search, rows, total, state, errorMessage, loadingMore, moreError, hasMore, isEmpty, reload, loadMore,
    /** Đã có dữ liệu ở bộ lọc hiện tại (để chọn giữa "Chưa có dữ liệu" và "Không có mục phù hợp"). */
    filtered: computed(() => !!q.value),
  };
}

export type ReadList = ReturnType<typeof useMobileReadList>;
export type { Ref };
