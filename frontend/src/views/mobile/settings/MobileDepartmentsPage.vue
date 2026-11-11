<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- Copyright (C) 2026 Nguyễn Tiến Lộc -->
<!--
  Phòng ban (mobile, CHỈ ĐỌC): cây phòng ban dạng danh sách thụt lề + số thành viên. Dữ liệu = useRbacStore.loadDepartments (GET /departments).
  Tạo/đổi tên/di chuyển/lưu trữ/gán thành viên -> Dùng máy tính.
-->
<template>
  <section class="crm-dp">
    <MobileFeedback v-if="load.state.value === 'loading'" state="loading" title="Đang tải phòng ban" />
    <MobileFeedback v-else-if="load.state.value !== 'ready'" :state="load.state.value" :title="load.state.value === 'error' ? 'Không tải được phòng ban' : undefined" :retryable="load.state.value !== 'forbidden'" @retry="load.load" />
    <MobileFeedback v-else-if="nodes.length === 0" state="empty" title="Chưa có phòng ban" />
    <template v-else>
      <p class="crm-dp__sum" role="status">{{ nodes.length }} phòng ban</p>
      <ul class="crm-dp__list" aria-label="Cây phòng ban">
        <li v-for="d in nodes" :key="d.node.id" class="crm-dp__item" :style="{ marginLeft: `${Math.min(d.depth, 4) * 14}px` }">
          <span class="crm-dp__name"><i v-if="d.depth > 0" class="mdi mdi-subdirectory-arrow-right" aria-hidden="true" />{{ d.node.name }}</span>
          <span class="crm-dp__meta">{{ departmentLine(d.node) }}<template v-if="d.depth > 0"> · cấp {{ d.depth + 1 }}</template></span>
          <span class="crm-dp__meta">Trưởng phòng: {{ userName(d.node.leaderUserId) }}</span>
          <span class="crm-dp__meta">Phó phòng: {{ userName(d.node.deputyUserId) }}</span>
          <details v-if="members(d.node.id).length"><summary>Thành viên ({{ members(d.node.id).length }})</summary><ul><li v-for="u in members(d.node.id)" :key="u.id">{{ u.fullName }}</li></ul></details>
        </li>
      </ul>
      <MobileDesktopNotice action="thêm, đổi tên, di chuyển phòng ban hoặc gán thành viên" />
    </template>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted } from 'vue';
import MobileFeedback from '@/components/mobile/shell/MobileFeedback.vue';
import MobileDesktopNotice from '@/components/mobile/settings/MobileDesktopNotice.vue';
import { api } from '@/api';
import type { RbacUser } from '@/stores/rbac';
import { useRbacStore } from '@/stores/rbac';
import { useReadonlyLoad } from '@/composables/mobile-settings/use-readonly-load';
import { departmentLine, flattenTree } from '@/composables/mobile-settings/permission-model';

const store = useRbacStore();
const load = useReadonlyLoad(async () => {
  const [, res] = await Promise.all([store.loadDepartments(), api.get('/rbac/users').catch(() => null)]);
  return (res?.data.users ?? []) as RbacUser[];
});
const userName = (id: string | null) => id ? (load.data.value?.find(u => u.id === id)?.fullName ?? 'Không có thông tin trong phạm vi quyền') : 'Chưa giao';
const members = (id: string) => (load.data.value ?? []).filter(u => u.departmentMember?.departmentId === id);
const nodes = computed(() => flattenTree(store.departments));
onMounted(() => { void load.load(); });
</script>

<style scoped>
.crm-dp { display: flex; flex-direction: column; gap: var(--m-space-3); color: var(--m-text); min-width: 0; }
.crm-dp__sum { margin: 0; font-size: var(--m-font-meta); color: var(--m-muted); }
.crm-dp__list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: var(--m-space-2); }
.crm-dp__item { display: flex; flex-direction: column; gap: 2px; min-height: var(--m-touch); padding: var(--m-space-3) var(--m-space-4); border: 1px solid var(--m-line); border-radius: var(--m-radius-card); background: var(--m-surface); box-sizing: border-box; min-width: 0; }
.crm-dp__name { font-weight: 650; overflow-wrap: anywhere; }
.crm-dp__meta { font-size: var(--m-font-meta); color: var(--m-muted); }
.crm-dp__item summary { min-height: 44px; display: flex; align-items: center; cursor: pointer; }
.crm-dp__item ul { padding-left: 20px; overflow-wrap: anywhere; }
</style>
