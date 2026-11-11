<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- Copyright (C) 2026 Nguyễn Tiến Lộc -->
<!--
  Nhân viên (mobile) — PRESENTER thuần: nhận dữ liệu + trạng thái từ controller UsersRbacView (khi chạy trong khung Cài đặt mobile) và
  chỉ phát sự kiện. KHÔNG gọi API, KHÔNG biết quyền: cờ canCreate/canBulk do controller gốc tính. Sửa chi tiết = UserEditPanel gốc, tạo mới =
  CreateUserWithZaloModal gốc, gán hàng loạt = applyBulk gốc (payload không đổi). Màu theo token --m-* nên có Sáng/Tối.
-->
<template>
  <section class="crm-el" :aria-busy="state === 'loading'" aria-label="Danh sách nhân viên">
    <div class="crm-el__top">
      <p class="crm-el__count" role="status">{{ users.length }} / {{ stats.total }} nhân viên</p>
      <button v-if="canCreate" type="button" class="crm-el__add" @click="openCreate">
        <i class="mdi mdi-plus" aria-hidden="true" /> Thêm nhân viên
      </button>
    </div>

    <div class="crm-el__search">
      <i class="mdi mdi-magnify" aria-hidden="true" />
      <input :value="searchQ" type="search" inputmode="search" autocomplete="off" placeholder="Tìm tên / SĐT / email" aria-label="Tìm nhân viên" @input="emit('update:searchQ', ($event.target as HTMLInputElement).value)" />
    </div>

    <div class="crm-el__filters">
      <label class="crm-el__field">
        <span>Phòng ban</span>
        <select :value="filterDept" @change="emit('update:filterDept', ($event.target as HTMLSelectElement).value)">
          <option value="">Mọi phòng ban</option>
          <option v-for="d in departments" :key="d.id" :value="d.id">{{ '— '.repeat(d._depth) }}{{ d.name }}</option>
        </select>
      </label>
      <label class="crm-el__field">
        <span>Nhóm quyền</span>
        <select :value="filterGroup" @change="emit('update:filterGroup', ($event.target as HTMLSelectElement).value)">
          <option value="">Mọi nhóm quyền</option>
          <option v-for="g in groups" :key="g.id" :value="g.id">{{ '— '.repeat(g._depth) }}{{ g.name }}</option>
        </select>
      </label>
    </div>

    <div class="crm-el__chips" role="group" aria-label="Lọc theo trạng thái">
      <button type="button" class="crm-el__chip" :aria-pressed="selectedStatuses.size === 0" @click="emit('clearStatus')">Tất cả</button>
      <button v-for="c in EMPLOYEE_STATUS_CHIPS" :key="c.value" type="button" class="crm-el__chip" :aria-pressed="selectedStatuses.has(c.value)" @click="emit('toggleStatus', c.value)">
        {{ c.label }} <span class="crm-el__n">{{ counts[c.value] }}</span>
      </button>
    </div>

    <div v-if="canBulk && selectedIds.size > 0" class="crm-el__bulk" role="group" aria-label="Thao tác hàng loạt">
      <strong>Đã chọn {{ selectedIds.size }} nhân viên</strong>
      <label class="crm-el__field">
        <span>Gán phòng ban</span>
        <select :value="bulkDept" @change="emit('update:bulkDept', ($event.target as HTMLSelectElement).value)">
          <option value="__none__">Không đổi</option>
          <option value="">(Bỏ phòng ban)</option>
          <option v-for="d in departments" :key="d.id" :value="d.id">{{ d.name }}</option>
        </select>
      </label>
      <label class="crm-el__field">
        <span>Gán nhóm quyền</span>
        <select :value="bulkGroup" @change="emit('update:bulkGroup', ($event.target as HTMLSelectElement).value)">
          <option value="__none__">Không đổi</option>
          <option value="">(Bỏ nhóm quyền)</option>
          <option v-for="g in groups" :key="g.id" :value="g.id">{{ g.name }}</option>
        </select>
      </label>
      <div class="crm-el__bulk-actions">
        <button type="button" class="crm-el__btn crm-el__btn--primary" :disabled="bulkBusy || (bulkDept === '__none__' && bulkGroup === '__none__')" @click="emit('applyBulk')">{{ bulkBusy ? 'Đang gán…' : 'Áp dụng' }}</button>
        <button type="button" class="crm-el__btn" :disabled="bulkBusy" @click="emit('clearSelection')">Bỏ chọn</button>
      </div>
    </div>

    <MobileFeedback v-if="state === 'loading' && totalCount === 0" state="loading" title="Đang tải nhân viên" />
    <MobileFeedback v-else-if="state !== 'ready' && state !== 'loading'" :state="state" :title="state === 'error' ? 'Không tải được danh sách nhân viên' : undefined" :retryable="state !== 'forbidden'" @retry="emit('retry')" />
    <MobileFeedback v-else-if="users.length === 0" state="empty" :title="hasServerFilters || totalCount > 0 ? 'Không có nhân viên khớp bộ lọc' : 'Chưa có nhân viên nào'" :clearable="hasFilters" @clear-filters="clearFilters" />
    <template v-else>
      <label v-if="canBulk" class="crm-el__all"><input type="checkbox" :checked="allSelected" @change="emit('toggleAll')" /> Chọn tất cả {{ users.length }} nhân viên đang hiển thị</label>
      <ul class="crm-el__list">
        <li v-for="u in users" :key="u.id" class="crm-el__item" :class="{ 'crm-el__item--active': activeId === u.id }">
          <label v-if="canBulk" class="crm-el__check">
            <input type="checkbox" :checked="selectedIds.has(u.id)" :aria-label="`Chọn ${u.fullName || 'nhân viên'}`" @change="emit('toggleOne', u.id)" />
          </label>
          <button type="button" :data-user-id="u.id" class="crm-el__card" :aria-label="`Mở chi tiết ${u.fullName || 'nhân viên'}`" @click="openEmployee($event, u)">
            <Avatar :src="u.avatarUrl" :name="u.fullName" :size="44" :platform="null" />
            <span class="crm-el__body">
              <span class="crm-el__name">{{ u.fullName || '(chưa đặt tên)' }}<template v-if="u.role === 'owner'"> · Chủ tổ chức</template></span>
              <span class="crm-el__meta">{{ formatPhone(u.phone) || u.email || '—' }}</span>
              <span class="crm-el__meta">{{ u.permissionGroup?.name || 'Chưa gán nhóm quyền' }}<template v-if="u.departmentMember"> · {{ u.departmentMember.department.name }}</template></span>
            </span>
            <span class="crm-el__st" :class="`crm-el__st--${statusOf(u)}`">{{ employeeStatusLabel(statusOf(u)) }}</span>
          </button>
        </li>
      </ul>
    </template>
  </section>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import Avatar from '@/components/ui/Avatar.vue';
import MobileFeedback from '@/components/mobile/shell/MobileFeedback.vue';
import type { RbacUser } from '@/stores/rbac';
import type { SettingsLoadState } from '@/composables/mobile-settings/load-state';
import { EMPLOYEE_STATUS_CHIPS, employeeStatusLabel, formatPhone, type EmployeeStatusKey } from '@/composables/mobile-settings/employee-model';

interface TreeOpt { id: string; name: string; _depth: number }
const props = defineProps<{
  state: SettingsLoadState;
  users: RbacUser[];
  totalCount: number;
  stats: { total: number; statusActive: number; statusPending: number; statusSilent: number; statusDisabled: number };
  statusOf: (u: RbacUser) => EmployeeStatusKey;
  searchQ: string;
  filterDept: string;
  filterGroup: string;
  departments: TreeOpt[];
  groups: TreeOpt[];
  selectedStatuses: ReadonlySet<EmployeeStatusKey>;
  canCreate: boolean;
  canBulk: boolean;
  selectedIds: ReadonlySet<string>;
  bulkDept: string;
  bulkGroup: string;
  bulkBusy: boolean;
  activeId: string | null;
}>();
const emit = defineEmits<{
  'update:searchQ': [v: string];
  'update:filterDept': [v: string];
  'update:filterGroup': [v: string];
  'update:bulkDept': [v: string];
  'update:bulkGroup': [v: string];
  toggleStatus: [s: EmployeeStatusKey];
  clearStatus: [];
  open: [u: RbacUser];
  create: [];
  retry: [];
  toggleOne: [id: string];
  toggleAll: [];
  clearSelection: [];
  applyBulk: [];
}>();

const counts = computed<Record<EmployeeStatusKey, number>>(() => ({
  active: props.stats.statusActive,
  silent: props.stats.statusSilent,
  pending: props.stats.statusPending,
  disabled: props.stats.statusDisabled,
}));
const allSelected = computed(() => props.users.length > 0 && props.users.every((u) => props.selectedIds.has(u.id)));
const hasFilters = computed(() => !!(props.searchQ || props.filterDept || props.filterGroup || props.selectedStatuses.size));
const hasServerFilters = computed(() => !!(props.searchQ || props.filterDept || props.filterGroup));
function clearFilters() {
  emit('update:searchQ', '');
  emit('update:filterDept', '');
  emit('update:filterGroup', '');
  emit('clearStatus');
}
// Safari không tự focus button khi chạm: lưu đúng điểm quay lại trước khi mở dialog.
function openEmployee(event: MouseEvent, user: RbacUser) {
  (event.currentTarget as HTMLElement).focus({ preventScroll: true });
  emit('open', user);
}
function openCreate(event: MouseEvent) {
  (event.currentTarget as HTMLElement).focus({ preventScroll: true });
  emit('create');
}
</script>

<style scoped>
.crm-el { display: flex; flex-direction: column; gap: var(--m-space-3); min-width: 0; color: var(--m-text); }
.crm-el__top { display: flex; align-items: center; justify-content: space-between; gap: var(--m-space-3); flex-wrap: wrap; }
.crm-el__count { margin: 0; font-size: var(--m-font-meta); color: var(--m-muted); }
.crm-el__add { display: inline-flex; align-items: center; gap: var(--m-space-2); min-height: var(--m-touch); padding: 0 var(--m-space-4); border: 0; border-radius: var(--m-radius-md); background: var(--m-brand-strong); color: var(--m-on-action); font: inherit; font-weight: 650; cursor: pointer; touch-action: manipulation; }
.crm-el__search { display: flex; align-items: center; gap: var(--m-space-2); min-height: 48px; padding: 0 var(--m-space-3); border: 1px solid var(--m-line); border-radius: var(--m-radius-md); background: var(--m-surface-inset); color: var(--m-muted); }
.crm-el__search:focus-within { outline: 2px solid var(--m-focus); }
.crm-el__search input { flex: 1; min-width: 0; height: 44px; border: 0; background: transparent; color: var(--m-text); font: inherit; font-size: 16px; outline: none; -webkit-appearance: none; appearance: none; }
.crm-el__filters { display: grid; grid-template-columns: minmax(0, 1fr); gap: var(--m-space-2); }
.crm-el__field { display: flex; flex-direction: column; gap: 4px; font-size: var(--m-font-meta); color: var(--m-muted); min-width: 0; }
.crm-el__field select { min-height: 48px; width: 100%; padding: 0 var(--m-space-3); border: 1px solid var(--m-line); border-radius: var(--m-radius-md); background: var(--m-surface-inset); color: var(--m-text); font: inherit; font-size: 16px; }
.crm-el__chips { display: flex; gap: var(--m-space-2); overflow-x: auto; margin: 0 calc(var(--m-gutter) * -1); padding: 0 var(--m-gutter) var(--m-space-1); scrollbar-width: none; }
.crm-el__chip { flex: none; min-height: var(--m-touch); padding: 0 var(--m-space-4); border: 1px solid var(--m-line); border-radius: 999px; background: var(--m-surface); color: var(--m-text); font: inherit; font-weight: 600; cursor: pointer; touch-action: manipulation; }
.crm-el__chip[aria-pressed='true'] { border-color: transparent; background: var(--m-brand-strong); color: var(--m-on-action); }
.crm-el__n { margin-left: 4px; opacity: 0.8; font-weight: 500; }
.crm-el__bulk { position: sticky; top: var(--m-header); z-index: 2; display: flex; flex-direction: column; gap: var(--m-space-2); padding: var(--m-space-3); border: 1px solid var(--m-brand-strong); border-radius: var(--m-radius-card); background: var(--m-surface); }
.crm-el__bulk-actions { display: flex; gap: var(--m-space-2); }
.crm-el__btn { flex: 1; min-height: var(--m-touch); padding: 0 var(--m-space-4); border: 1px solid var(--m-line); border-radius: var(--m-radius-md); background: var(--m-surface-inset); color: var(--m-text); font: inherit; font-weight: 650; cursor: pointer; touch-action: manipulation; }
.crm-el__btn--primary { border-color: transparent; background: var(--m-brand-strong); color: var(--m-on-action); }
.crm-el__btn:disabled { opacity: 0.5; cursor: not-allowed; }
.crm-el__all { display: flex; align-items: center; gap: var(--m-space-2); min-height: var(--m-touch); font-size: var(--m-font-meta); color: var(--m-muted); }
.crm-el__all input, .crm-el__check input { width: 24px; height: 24px; accent-color: var(--m-brand-strong); }
.crm-el__list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: var(--m-space-2); }
.crm-el__item { display: flex; align-items: stretch; gap: var(--m-space-2); min-width: 0; }
.crm-el__check { flex: none; display: inline-grid; place-items: center; width: var(--m-touch); }
.crm-el__card { flex: 1; min-width: 0; display: flex; align-items: center; gap: var(--m-space-3); min-height: 72px; padding: var(--m-space-3); border: 1px solid var(--m-line); border-radius: var(--m-radius-card); background: var(--m-surface); color: var(--m-text); font: inherit; text-align: left; cursor: pointer; touch-action: manipulation; box-sizing: border-box; }
.crm-el__item--active .crm-el__card { border-color: var(--m-brand-strong); }
.crm-el__card:active { background: var(--m-surface-inset); }
.crm-el__body { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
.crm-el__name { font-weight: 650; overflow-wrap: anywhere; }
.crm-el__meta { font-size: var(--m-font-meta); color: var(--m-muted); overflow-wrap: anywhere; }
.crm-el__st { flex: none; max-width: 36%; font-size: 12px; font-weight: 650; text-align: right; }
.crm-el__st--active { color: var(--m-success); }
.crm-el__st--silent, .crm-el__st--pending { color: var(--m-warning); }
.crm-el__st--disabled { color: var(--m-muted); }
.crm-el__chip:focus-visible, .crm-el__card:focus-visible, .crm-el__add:focus-visible, .crm-el__btn:focus-visible, .crm-el__field select:focus-visible, .crm-el__all input:focus-visible, .crm-el__check input:focus-visible { outline: 3px solid var(--m-focus); outline-offset: 2px; }
</style>
