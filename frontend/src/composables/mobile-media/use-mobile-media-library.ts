// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Nguyễn Tiến Lộc
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import { listMediaFolders, listMediaPaged, type MediaAssetItem, type MediaFolder } from '@/api/media';
import { useMobile } from '@/composables/use-mobile';
import {
  describeMediaLoadError, hasMoreMedia, mergeMediaPage, MEDIA_PAGE_SIZE, type MediaKind,
} from '@/components/mobile/media/media-model';

export type MediaLibraryState = 'loading' | 'ready' | 'empty' | 'error' | 'offline' | 'forbidden';

/**
 * Danh sách Kho media cho mobile: loại (ảnh/video/tài liệu) + thư mục hiện có + tìm kiếm + tải thêm vô hạn.
 * Chỉ ĐỌC qua api/media (RBAC/phạm vi do server quyết định). Mỗi lần đổi bộ lọc tăng `seq` để bỏ kết quả cũ về muộn.
 */
export function useMobileMediaLibrary() {
  const { isOnline } = useMobile();
  const kind = ref<MediaKind>('image');
  const search = ref('');
  const folderId = ref<string | null>(null);
  const items = ref<MediaAssetItem[]>([]);
  const total = ref(0);
  const folders = ref<MediaFolder[]>([]);
  const state = ref<MediaLibraryState>('loading');
  const errorMessage = ref('');
  const loadingMore = ref(false);
  const moreError = ref(false);
  const more = ref(false);

  let seq = 0;
  let folderSeq = 0;
  let searchTimer: ReturnType<typeof setTimeout> | undefined;
  let activeSearch = '';

  const foldersOfKind = computed(() => folders.value.filter(f => f.kind === kind.value));

  function params(skip: number) {
    return {
      kind: kind.value,
      q: activeSearch.trim() || undefined,
      folderId: folderId.value || undefined,
      sort: 'recent' as const,
      limit: MEDIA_PAGE_SIZE,
      skip,
    };
  }

  async function reload(): Promise<void> {
    const mine = ++seq;
    state.value = 'loading';
    errorMessage.value = '';
    moreError.value = false;
    // Đổi bộ lọc khi loadMore còn bay: kết quả của nó sẽ bị bỏ (seq lệch) nên finally của nó không còn mở khóa -> phải reset tại đây.
    loadingMore.value = false;
    try {
      const res = await listMediaPaged(params(0));
      if (mine !== seq) return;
      items.value = res.items;
      total.value = res.total;
      more.value = hasMoreMedia(res.items.length, res.total, res.items.length);
      state.value = res.items.length ? 'ready' : 'empty';
    } catch (err) {
      if (mine !== seq) return;
      const d = describeMediaLoadError(err, isOnline.value);
      // reload() chạy khi bộ lọc/loại/từ khóa đổi hoặc bấm Thử lại, nên danh sách cũ không còn khớp bộ lọc: XÓA và báo lỗi (không giữ dữ liệu cũ).
      // Vùng chọn nằm riêng ở component nên không mất.
      state.value = d.state;
      errorMessage.value = d.message;
      items.value = [];
      total.value = 0;
      more.value = false;
    }
  }

  async function loadMore(): Promise<void> {
    if (loadingMore.value || !more.value || state.value !== 'ready') return;
    const mine = seq;
    loadingMore.value = true;
    moreError.value = false;
    try {
      const res = await listMediaPaged(params(items.value.length));
      if (mine !== seq) return;
      items.value = mergeMediaPage(items.value, res.items);
      total.value = res.total;
      more.value = hasMoreMedia(items.value.length, res.total, res.items.length);
    } catch {
      if (mine === seq) moreError.value = true;
    } finally {
      if (mine === seq) loadingMore.value = false;
    }
  }

  async function loadFolders(): Promise<void> {
    const mine = ++folderSeq;
    try {
      const res = await listMediaFolders();
      if (mine === folderSeq) folders.value = res;
    } catch {
      if (mine === folderSeq) folders.value = []; // thư mục chỉ là bộ lọc phụ: lỗi thì vẫn xem được "Tất cả".
    }
  }

  function setKind(next: MediaKind) {
    if (next === kind.value) return;
    kind.value = next;
    folderId.value = null; // thư mục thuộc từng loại
    void reload();
  }
  function setFolder(id: string | null) {
    if (id === folderId.value) return;
    folderId.value = id;
    void reload();
  }
  function applySearchNow() {
    clearTimeout(searchTimer);
    if (activeSearch === search.value) return;
    activeSearch = search.value;
    void reload();
  }
  watch(search, () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(applySearchNow, 350);
  });
  watch(isOnline, (online, was) => {
    // Có mạng lại sau lỗi offline: tự tải lại danh sách (đọc, không gửi gì).
    if (online && !was && (state.value === 'offline' || state.value === 'error')) void reload();
  });
  onBeforeUnmount(() => { clearTimeout(searchTimer); seq++; folderSeq++; });

  void loadFolders();
  void reload();

  return {
    kind, search, folderId, items, total, folders: foldersOfKind, state, errorMessage,
    loadingMore, moreError, hasMore: more, setKind, setFolder, reload, loadMore, applySearchNow,
  };
}
