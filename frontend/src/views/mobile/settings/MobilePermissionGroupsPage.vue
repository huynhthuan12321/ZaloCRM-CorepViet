<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- Copyright (C) 2026 Nguyễn Tiến Lộc -->
<!--
  Nhóm quyền (mobile, CHỈ ĐỌC): chọn một nhóm để xem các quyền được cấp. Dữ liệu = useRbacStore.loadPermissionGroups (GET /permission-groups + /meta),
  không gọi hàm ghi nào. Tạo/sửa/xóa/ma trận chỉnh -> Dùng máy tính. Theo token --m-* nên có Sáng/Tối.
-->
<template>
  <section class="crm-pg">
    <MobileFeedback v-if="load.state.value === 'loading'" state="loading" title="Đang tải nhóm quyền" />
    <MobileFeedback v-else-if="load.state.value !== 'ready'" :state="load.state.value" :title="load.state.value === 'error' ? 'Không tải được nhóm quyền' : undefined" :retryable="load.state.value !== 'forbidden'" @retry="reload" />
    <MobileFeedback v-else-if="groups.length === 0" state="empty" title="Chưa có nhóm quyền" />
    <template v-else>
      <h2 id="crm-pg-list" class="crm-pg__h">Chọn nhóm để xem quyền</h2>
      <ul class="crm-pg__list" aria-labelledby="crm-pg-list">
        <li v-for="g in groups" :key="g.node.id" :style="{ paddingLeft: `${Math.min(g.depth, 3) * 12}px` }">
          <button type="button" class="crm-pg__item" :aria-pressed="selectedId === g.node.id" @click="selectedId = g.node.id">
            <span class="crm-pg__name">{{ g.node.name }}<span v-if="g.node.isSystem" class="crm-pg__tag">Hệ thống</span></span>
            <span class="crm-pg__meta">{{ g.node.memberCount }} thành viên</span>
          </button>
        </li>
      </ul>

      <div v-if="selected" class="crm-pg__detail" role="region" :aria-label="`Quyền của nhóm ${selected.name}`" aria-live="polite">
        <h2 class="crm-pg__h">Quyền của “{{ selected.name }}”</h2>
        <p class="crm-pg__sum">Được cấp {{ summary.granted }} / {{ summary.total }} quyền</p>
        <ul class="crm-pg__rows">
          <li v-for="r in rows" :key="r.resource" class="crm-pg__row">
            <span class="crm-pg__res">{{ r.label }}</span>
            <span class="crm-pg__acts" :class="{ 'crm-pg__acts--none': r.allowed.length === 0 }">{{ r.allowed.length ? r.allowed.join(', ') : 'Không có quyền' }}</span>
          </li>
        </ul>
      </div>
      <MobileDesktopNotice action="tạo, đổi tên, xóa nhóm hoặc chỉnh quyền" />
    </template>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import MobileFeedback from '@/components/mobile/shell/MobileFeedback.vue';
import MobileDesktopNotice from '@/components/mobile/settings/MobileDesktopNotice.vue';
import { useRbacStore } from '@/stores/rbac';
import { useReadonlyLoad } from '@/composables/mobile-settings/use-readonly-load';
import { flattenTree, grantRows, grantSummary } from '@/composables/mobile-settings/permission-model';

const store = useRbacStore();
const load = useReadonlyLoad(() => store.loadPermissionGroups());
const groups = computed(() => flattenTree(store.permissionGroups));
const selectedId = ref<string | null>(null);
const selected = computed(() => groups.value.find((g) => g.node.id === selectedId.value)?.node ?? null);
const rows = computed(() => (selected.value ? grantRows(selected.value, store.matrixMeta) : []));
const summary = computed(() => grantSummary(rows.value));
async function reload() {
  await load.load();
  if (!selectedId.value && groups.value.length) selectedId.value = groups.value[0].node.id;
}
onMounted(() => { void reload(); });
</script>

<style scoped>
.crm-pg { display: flex; flex-direction: column; gap: var(--m-space-4); color: var(--m-text); min-width: 0; }
.crm-pg__h { margin: 0; font-size: var(--m-font-section); font-weight: 650; }
.crm-pg__list, .crm-pg__rows { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: var(--m-space-2); }
.crm-pg__item { display: flex; flex-direction: column; align-items: flex-start; gap: 2px; width: 100%; min-height: var(--m-touch); padding: var(--m-space-3) var(--m-space-4); border: 1px solid var(--m-line); border-radius: var(--m-radius-card); background: var(--m-surface); color: var(--m-text); font: inherit; text-align: left; cursor: pointer; touch-action: manipulation; box-sizing: border-box; }
.crm-pg__item[aria-pressed='true'] { border: 2px solid var(--m-brand-strong); padding: calc(var(--m-space-3) - 1px) calc(var(--m-space-4) - 1px); }
.crm-pg__name { font-weight: 650; overflow-wrap: anywhere; }
.crm-pg__tag { margin-left: var(--m-space-2); padding: 1px 8px; border-radius: 999px; background: var(--m-surface-inset); color: var(--m-muted); font-size: 12px; font-weight: 600; }
.crm-pg__meta { font-size: var(--m-font-meta); color: var(--m-muted); }
.crm-pg__detail { display: flex; flex-direction: column; gap: var(--m-space-2); padding: var(--m-space-4); border: 1px solid var(--m-line); border-radius: var(--m-radius-card); background: var(--m-surface); }
.crm-pg__sum { margin: 0; font-size: var(--m-font-meta); color: var(--m-muted); }
.crm-pg__row { display: flex; flex-direction: column; gap: 2px; padding: var(--m-space-2) 0; border-top: 1px solid var(--m-line); }
.crm-pg__res { font-weight: 650; }
.crm-pg__acts { font-size: var(--m-font-meta); color: var(--m-success); overflow-wrap: anywhere; }
.crm-pg__acts--none { color: var(--m-muted); }
.crm-pg__item:focus-visible { outline: 3px solid var(--m-focus); outline-offset: 2px; }
</style>
