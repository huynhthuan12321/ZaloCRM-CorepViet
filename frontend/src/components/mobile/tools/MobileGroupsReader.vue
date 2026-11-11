<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- Copyright (C) 2026 Nguyễn Tiến Lộc -->
<script setup lang="ts">
/**
 * Nhóm Zalo (mobile, CHỈ ĐỌC): chọn nick -> danh sách nhóm (GET groups, tìm ở client) -> chạm để xem thành viên (GET members).
 * Tạo/đổi tên/thêm-xóa thành viên, liên kết mời, giải tán... KHÔNG có ở đây (dùng máy tính).
 */
import { ref } from 'vue';
import ToolNickPicker from './ToolNickPicker.vue';
import ToolReadList from './ToolReadList.vue';
import ToolMembersSheet from './ToolMembersSheet.vue';
import { useMobileNicks } from '@/composables/mobile-tools/use-mobile-nicks';
import { useMobileReadList, type ReadRow } from '@/composables/mobile-tools/use-mobile-read-list';
import { fetchGroupMembers, fetchGroupsPage } from '@/composables/mobile-tools/mobile-tool-readers';

const nicks = useMobileNicks();
const list = useMobileReadList({
  pageSize: 1000,
  deps: () => `${nicks.state.value}|${nicks.nickId.value}`,
  ready: () => nicks.state.value === 'ready' && !!nicks.nickId.value,
  load: () => fetchGroupsPage(nicks.nickId.value),
  localSearch: (row, q) => row.title.toLowerCase().includes(q),
});

const open = ref(false);
const group = ref<ReadRow | null>(null);
function openGroup(row: ReadRow) { group.value = row; open.value = true; }
</script>

<template>
  <div class="m-gr">
    <ToolNickPicker :options="nicks.options.value" :model-value="nicks.nickId.value" :state="nicks.state.value" @update:model-value="nicks.select" @retry="nicks.load()" />
    <ToolReadList
      v-if="nicks.state.value === 'ready'"
      :list="list" label="Nhóm" clickable search-placeholder="Tìm tên nhóm" empty-title="Nick này chưa có nhóm" @open="openGroup"
    />
    <ToolMembersSheet
      v-model:open="open"
      :title="group?.title ?? 'Thành viên'"
      :source-key="group ? `${nicks.nickId.value}:${group.id}` : null"
      :load="() => fetchGroupMembers(nicks.nickId.value, group!.id)"
    />
  </div>
</template>

<style scoped>
.m-gr { display: flex; flex-direction: column; gap: var(--m-space-3); min-width: 0; }
</style>
