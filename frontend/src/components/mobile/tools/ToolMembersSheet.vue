<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- Copyright (C) 2026 Nguyễn Tiến Lộc -->
<script setup lang="ts">
/** Sheet chỉ-đọc liệt kê thành viên (của nhóm Zalo hoặc của một lần quét). `load` chỉ gọi GET. Đóng sheet -> hủy kết quả muộn. */
import MobileSheet from '@/components/mobile/shell/MobileSheet.vue';
import ToolReadList from './ToolReadList.vue';
import { useMobileReadList, type ReadPage, type ReadRequest } from '@/composables/mobile-tools/use-mobile-read-list';

const props = defineProps<{
  open: boolean;
  title: string;
  /** Khóa nguồn (id nhóm/lần quét): đổi khóa = tải lại. null = chưa chọn. */
  sourceKey: string | null;
  load: (req: ReadRequest) => Promise<ReadPage>;
  paged?: boolean;
}>();
const emit = defineEmits<{ 'update:open': [open: boolean] }>();

const list = useMobileReadList({
  pageSize: 50,
  load: (req) => props.load(req),
  deps: () => (props.open ? props.sourceKey : null),
  ready: () => props.open && !!props.sourceKey,
  localSearch: props.paged ? undefined : (row, q) => `${row.title} ${row.subtitle ?? ''}`.toLowerCase().includes(q),
});
</script>

<template>
  <MobileSheet :open="open" :title="title" full-height @update:open="emit('update:open', $event)">
    <div class="m-tms">
      <!-- Lần quét (paged): API scan-members KHÔNG hỗ trợ tìm kiếm (chỉ isFriend/page/limit) nên ẩn ô tìm thay vì giả lọc. Nhóm Zalo: lọc client trên danh sách đã tải. -->
      <ToolReadList :list="list" :no-search="paged" label="Thành viên" search-placeholder="Tìm thành viên" empty-title="Chưa có thành viên" />
    </div>
  </MobileSheet>
</template>

<style scoped>
.m-tms { padding: var(--m-space-2) var(--m-space-3) var(--m-space-4); }
</style>
