import { computed, watch, type Ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';

export function parseSaleQuery(value: unknown): string | null {
  return typeof value === 'string' && (value === 'all' || value === 'unassigned'
    || /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)) ? value : null;
}

export const SALE_FILTER_STORAGE_PREFIX = 'crm.inbox.saleAssigneeId:';

/** URL owns navigation; saved IDs are scoped to the signed-in org and user. */
export function useSaleFilterUrl(selection: Ref<string | null>, canChoose: Readonly<Ref<boolean>>,
  currentUserId: Readonly<Ref<string>>, orgId: Readonly<Ref<string>>) {
  const route = useRoute();
  const router = useRouter();
  const storageKey = computed(() => currentUserId.value && orgId.value
    ? `${SALE_FILTER_STORAGE_PREFIX}${orgId.value}:${currentUserId.value}` : null);
  function saved() {
    try {
      const value = storageKey.value ? localStorage.getItem(storageKey.value) : null;
      // Migrate the old unscoped value once; never let it override the URL.
      return value === null ? parseSaleQuery(localStorage.getItem('saleAssigneeId')) : parseSaleQuery(JSON.parse(value));
    } catch { return null; }
  }
  function persist() {
    if (!storageKey.value) return;
    try {
      localStorage.setItem(storageKey.value, JSON.stringify(selection.value));
      localStorage.removeItem('saleAssigneeId');
    } catch { /* Storage can be disabled; the in-memory scope still applies. */ }
  }
  function read(restoreSaved = false) {
    selection.value = canChoose.value
      ? (route.query.assignedUserId === undefined && restoreSaved ? saved() : parseSaleQuery(route.query.assignedUserId))
      : currentUserId.value || null;
    persist();
  }
  read(true); // Normalize before the caller builds its very first request.
  watch(() => route.query.assignedUserId, () => read(), { flush: 'sync' });
  watch([canChoose, storageKey], () => read(true), { flush: 'sync' });
  watch(selection, value => {
    if (!canChoose.value && value !== (currentUserId.value || null)) {
      selection.value = currentUserId.value || null;
      return;
    }
    persist();
  }, { flush: 'sync' });
  watch(selection, value => {
    const next = canChoose.value ? value : null;
    if ((route.query.assignedUserId ?? null) === next) return;
    const query = { ...route.query };
    if (next) query.assignedUserId = next;
    else delete query.assignedUserId;
    void router.replace({ query });
  }, { immediate: true });
}
