// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Nguyễn Tiến Lộc
/**
 * Danh sách khách hàng cho mobile: bọc `useContacts` (KHÔNG API mới) để thêm
 * - tải tiếp (tích lũy trang, loại trùng id),
 * - trạng thái loading/ready/error/offline (useContacts nuốt lỗi nên phát hiện bằng mốc sentinel),
 * - tìm kiếm có debounce, bộ lọc hai pha (chỉ trạng thái + nguồn + người phụ trách; còn lại hoãn),
 * - hàng đợi tuần tự để hai lần gọi không ghi đè kết quả của nhau.
 * Presenter không gọi API; chỉ view adapter dùng composable này.
 */
import { computed, onScopeDispose, getCurrentScope, ref, toRaw } from 'vue';
import { useContacts, type Contact, type ContactFilters } from '@/composables/use-contacts';
import { useMobile } from '@/composables/use-mobile';
import { useToast } from '@/composables/use-toast';
import { MOBILE_SESSION_RESET_EVENT } from '@/components/mobile/shell/shell-context';
import { emptyFilterPatch } from '@/components/mobile/crm/crm-model';

export type MobileContactsState = 'loading' | 'ready' | 'error' | 'offline';
export const SEARCH_DEBOUNCE_MS = 300;

export function useMobileContacts() {
  const base = useContacts();
  const { isOnline } = useMobile();
  const toast = useToast();

  const items = ref<Contact[]>([]);
  const state = ref<MobileContactsState>('loading');
  const loadingMore = ref(false);
  const searchText = ref('');
  let chain: Promise<unknown> = Promise.resolve();
  let generation = 0;
  let searchTimer: ReturnType<typeof setTimeout> | undefined;

  const total = computed(() => base.total.value);
  const hasMore = computed(() => items.value.length < base.total.value);

  function enqueue<T>(fn: () => Promise<T>): Promise<T> {
    const next = chain.then(fn, fn);
    chain = next.catch(() => undefined);
    return next;
  }

  /** useContacts.fetchContacts nuốt lỗi -> gán sentinel trước, nếu sau khi gọi vẫn là sentinel thì request thất bại. */
  async function fetchPage(): Promise<Contact[] | null> {
    const sentinel: Contact[] = [];
    base.contacts.value = sentinel;
    await base.fetchContacts();
    return toRaw(base.contacts.value) === sentinel ? null : [...base.contacts.value];
  }

  function failState(): MobileContactsState {
    return isOnline.value ? 'error' : 'offline';
  }

  async function reload(opts: { clear?: boolean } = {}): Promise<void> {
    const gen = ++generation;
    if (opts.clear) items.value = [];
    if (!items.value.length) state.value = 'loading';
    loadingMore.value = false;
    await enqueue(async () => {
      if (gen !== generation) return;
      base.pagination.page = 1;
      const rows = await fetchPage();
      if (gen !== generation) return;
      if (rows) {
        items.value = rows;
        state.value = 'ready';
      } else {
        state.value = failState();
      }
    });
  }

  async function loadMore(): Promise<void> {
    if (loadingMore.value || !hasMore.value || state.value !== 'ready') return;
    const gen = generation;
    loadingMore.value = true;
    await enqueue(async () => {
      if (gen !== generation) return;
      base.pagination.page += 1;
      const rows = await fetchPage();
      if (gen !== generation) return;
      if (rows) {
        const seen = new Set(items.value.map(c => c.id));
        items.value = [...items.value, ...rows.filter(c => !seen.has(c.id))];
      } else {
        base.pagination.page -= 1;
        toast.error('Không tải thêm được. Kéo xuống rồi thử lại.');
      }
    });
    if (gen === generation) loadingMore.value = false;
  }

  function setSearch(text: string): void {
    searchText.value = text;
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
      base.filters.search = text.trim();
      void reload({ clear: true });
    }, SEARCH_DEBOUNCE_MS);
  }

  /** Pha "Áp dụng" của sheet lọc: chỉ ghi ba trường được hỗ trợ rồi tải lại trang 1. */
  function applyFilters(patch: Partial<Pick<ContactFilters, 'status' | 'source' | 'assignedUserId'>>): void {
    clearTimeout(searchTimer);
    if (patch.status !== undefined) base.filters.status = patch.status;
    if (patch.source !== undefined) base.filters.source = patch.source;
    if (patch.assignedUserId !== undefined) base.filters.assignedUserId = patch.assignedUserId;
    base.filters.search = searchText.value.trim();
    void reload({ clear: true });
  }

  function clearFilters(): void {
    clearTimeout(searchTimer);
    searchText.value = '';
    base.filters.search = '';
    Object.assign(base.filters, emptyFilterPatch());
    void reload({ clear: true });
  }

  async function createContact(payload: Partial<Contact>): Promise<Contact | null> {
    const created = await enqueue(() => base.createContact(payload));
    if (created) await reload();
    return created;
  }

  async function updateContact(id: string, payload: Partial<Contact>): Promise<Contact | null> {
    const updated = await enqueue(() => base.updateContact(id, payload));
    if (updated) {
      const i = items.value.findIndex(c => c.id === id);
      if (i !== -1) items.value[i] = updated;
    }
    return updated;
  }

  async function deleteContact(id: string): Promise<boolean> {
    const ok = await enqueue(() => base.deleteContact(id));
    if (ok) await reload();
    return ok;
  }

  function reset(): void {
    generation += 1;
    clearTimeout(searchTimer);
    items.value = [];
    searchText.value = '';
    state.value = 'loading';
    loadingMore.value = false;
    base.filters.search = '';
    Object.assign(base.filters, emptyFilterPatch());
    base.pagination.page = 1;
  }

  if (typeof window !== 'undefined') window.addEventListener(MOBILE_SESSION_RESET_EVENT, reset);
  if (getCurrentScope()) {
    onScopeDispose(() => {
      clearTimeout(searchTimer);
      generation += 1;
      if (typeof window !== 'undefined') window.removeEventListener(MOBILE_SESSION_RESET_EVENT, reset);
    });
  }

  return {
    items, total, hasMore, state, loadingMore, searchText, filters: base.filters,
    saving: base.saving, deleting: base.deleting,
    reload, loadMore, setSearch, applyFilters, clearFilters,
    createContact, updateContact, deleteContact, fetchContact: base.fetchContact,
  };
}
