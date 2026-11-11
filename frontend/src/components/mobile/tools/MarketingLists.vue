<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- Copyright (C) 2026 Nguyễn Tiến Lộc -->
<script setup lang="ts">
/**
 * Marketing > Tệp khách hàng (CHỈ ĐỌC). Không có `listId` -> danh sách tệp (GET /customer-lists, phân trang + tìm theo server);
 * có `listId` -> chi tiết: tiêu đề + các dòng số điện thoại (GET /customer-lists/:id/entries, phân trang + tìm theo server).
 * Tạo/nhập/xóa/quét lại Zalo/xuất CSV/gán người phụ trách KHÔNG có ở mobile (dùng máy tính).
 */
import { RouterLink } from 'vue-router';
import { onMounted, ref } from 'vue';
import ToolReadList from './ToolReadList.vue';
import { useMobileReadList, classifyReadError } from '@/composables/mobile-tools/use-mobile-read-list';
import { fetchListEntries, fetchListHeader, fetchListsPage } from '@/composables/mobile-tools/mobile-tool-readers';
import { useMobile } from '@/composables/use-mobile';

const props = defineProps<{ listId?: string }>();
const { isOnline } = useMobile();

const list = useMobileReadList({
  pageSize: 30,
  deps: () => props.listId ?? '',
  load: (req) => (props.listId ? fetchListEntries(props.listId, req) : fetchListsPage(req)),
});
void list.reload();

const header = ref<{ name: string; totalEntries: number; hasZaloEntries: number } | null>(null);
const headerError = ref('');
onMounted(async () => {
  if (!props.listId) return;
  try { header.value = await fetchListHeader(props.listId); } catch (err) { headerError.value = classifyReadError(err, isOnline.value).message; }
});
</script>

<template>
  <div class="m-ml">
    <template v-if="listId">
      <RouterLink to="/marketing/lists" class="m-ml__back" data-action="back-to-lists"><i class="mdi mdi-chevron-left" aria-hidden="true" />Tất cả tệp khách hàng</RouterLink>
      <header v-if="header" class="m-ml__head">
        <h2 class="m-ml__name">{{ header.name || 'Tệp khách hàng' }}</h2>
        <p class="m-ml__stat">{{ header.totalEntries }} số · {{ header.hasZaloEntries }} có Zalo</p>
      </header>
      <p v-else-if="headerError" class="m-ml__err" role="status">{{ headerError }}</p>
      <ToolReadList :list="list" label="Dòng trong tệp" search-placeholder="Tìm tên hoặc số điện thoại" empty-title="Tệp chưa có dòng nào" />
    </template>
    <ToolReadList v-else :list="list" label="Tệp khách hàng" search-placeholder="Tìm tên tệp" empty-title="Chưa có tệp khách hàng" empty-hint="Tạo tệp từ máy tính để xem tại đây." />
  </div>
</template>

<style scoped>
.m-ml { display: flex; flex-direction: column; gap: var(--m-space-3); min-width: 0; }
.m-ml__back { display: inline-flex; align-items: center; align-self: flex-start; min-height: var(--m-touch); padding-right: var(--m-space-3); color: var(--m-brand-strong); font-weight: 650; text-decoration: none; touch-action: manipulation; }
.m-ml__back:focus-visible { outline: 3px solid var(--m-focus); outline-offset: 2px; }
.m-ml__back .mdi { font-size: 22px; }
.m-ml__head { padding: var(--m-space-3) var(--m-space-4); border: 1px solid var(--m-line); border-radius: var(--m-radius-card); background: var(--m-surface); }
.m-ml__name { margin: 0; font-size: var(--m-font-section); font-weight: 650; overflow-wrap: anywhere; }
.m-ml__stat { margin: var(--m-space-1) 0 0; font-size: var(--m-font-meta); color: var(--m-muted); }
.m-ml__err { margin: 0; font-size: var(--m-font-meta); color: var(--m-warning); font-weight: 600; }
</style>
