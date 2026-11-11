<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- Copyright (C) 2026 Nguyễn Tiến Lộc -->
<script setup lang="ts">
/**
 * Marketing > Quét nhóm (CHỈ ĐỌC): các lần quét ĐÃ XONG của nick (GET /target-jobs/group-scans/:nick) và thành viên đã thu được của từng lần
 * (GET group-scans/:scan/members). Bắt đầu quét mới / thêm vào tệp KHÔNG có ở mobile (dùng máy tính).
 */
import { ref } from 'vue';
import ToolNickPicker from './ToolNickPicker.vue';
import ToolReadList from './ToolReadList.vue';
import ToolMembersSheet from './ToolMembersSheet.vue';
import { useMobileNicks } from '@/composables/mobile-tools/use-mobile-nicks';
import { useMobileReadList, type ReadRow } from '@/composables/mobile-tools/use-mobile-read-list';
import { fetchGroupScans, fetchScanMembers } from '@/composables/mobile-tools/mobile-tool-readers';

const nicks = useMobileNicks();
const list = useMobileReadList({
  pageSize: 20,
  deps: () => `${nicks.state.value}|${nicks.nickId.value}`,
  ready: () => nicks.state.value === 'ready' && !!nicks.nickId.value,
  load: () => fetchGroupScans(nicks.nickId.value),
  localSearch: (row, q) => `${row.title} ${row.subtitle ?? ''}`.toLowerCase().includes(q),
});

const open = ref(false);
const scan = ref<ReadRow | null>(null);
function openScan(row: ReadRow) { scan.value = row; open.value = true; }
</script>

<template>
  <div class="m-gs">
    <ToolNickPicker :options="nicks.options.value" :model-value="nicks.nickId.value" :state="nicks.state.value" @update:model-value="nicks.select" @retry="nicks.load()" />
    <ToolReadList
      v-if="nicks.state.value === 'ready'"
      :list="list" label="Lần quét nhóm" clickable search-placeholder="Tìm theo tên nhóm" empty-title="Chưa có lần quét nào"
      empty-hint="Quét nhóm trên máy tính; kết quả đã xong sẽ hiện ở đây để xem."
      @open="openScan"
    />
    <ToolMembersSheet
      v-model:open="open"
      paged
      :title="scan?.title ?? 'Thành viên đã quét'"
      :source-key="scan ? `${nicks.nickId.value}:${scan.id}` : null"
      :load="(req) => fetchScanMembers(nicks.nickId.value, scan!.id, req)"
    />
  </div>
</template>

<style scoped>
.m-gs { display: flex; flex-direction: column; gap: var(--m-space-3); min-width: 0; }
</style>
