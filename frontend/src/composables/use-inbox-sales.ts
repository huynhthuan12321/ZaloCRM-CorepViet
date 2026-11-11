import { computed, shallowRef, watch } from 'vue';
import { api } from '@/api';
import { useAuthStore } from '@/stores/auth';

export interface InboxSaleOption { id: string; fullName: string }

/** Intersect the org users endpoint with the existing server-authorized picker. */
export function useInboxSales() {
  const auth = useAuthStore();
  const users = shallowRef<InboxSaleOption[]>([]);
  const loading = shallowRef(false);
  const error = shallowRef('');
  const canChooseSale = computed(() => auth.isManager || auth.canAccess('contact', 'view_all'));
  watch(() => [auth.user?.id, auth.user?.orgId, auth.user?.departmentId, auth.user?.deptRole,
    auth.user?.canViewAll, auth.user?.grants?.contact?.view_all, canChooseSale.value], async (_, _old, onCleanup) => {
    const controller = new AbortController();
    onCleanup(() => controller.abort());
    users.value = [];
    error.value = '';
    loading.value = false;
    if (!canChooseSale.value) return;
    loading.value = true;
    try {
      const [org, scope] = await Promise.all([
        api.get<{ users: Array<InboxSaleOption & { isActive: boolean }> }>('/users', { signal: controller.signal }),
        api.get<{ users: InboxSaleOption[] }>('/dashboard/action-hub/picker/users', { signal: controller.signal }),
      ]);
      if (controller.signal.aborted) return;
      const allowed = new Set(scope.data.users.map(user => user.id));
      users.value = org.data.users.filter(user => user.isActive === true && allowed.has(user.id))
        .map(({ id, fullName }) => ({ id, fullName }))
        .sort((a, b) => a.fullName.localeCompare(b.fullName, 'vi'));
    } catch {
      if (!controller.signal.aborted) error.value = 'Không tải được nhân viên trong phạm vi quyền.';
    } finally {
      if (!controller.signal.aborted) loading.value = false;
    }
  }, { immediate: true });
  return { users, loading, error, canChooseSale };
}
