<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- Copyright (C) 2026 Nguyễn Tiến Lộc -->
<script setup lang="ts">
/** Marketing: danh sách chỉ-đọc của Mục tiêu / Gửi tin hàng loạt / Luồng kịch bản / Khối nội dung / Mẫu tin nhắn / Phiên chăm sóc / Bám đuổi thủ công. */
import ToolReadList from './ToolReadList.vue';
import { useMobileReadList } from '@/composables/mobile-tools/use-mobile-read-list';
import { fetchMarketingFeature, type MarketingListKey } from '@/composables/mobile-tools/mobile-tool-readers';

const props = defineProps<{ feature: MarketingListKey; label: string; emptyTitle: string; emptyHint: string }>();

const list = useMobileReadList({
  pageSize: 100,
  deps: () => props.feature,
  load: (req) => fetchMarketingFeature(props.feature, req),
});
void list.reload();
</script>

<template>
  <ToolReadList :list="list" :label="label" :search-placeholder="`Tìm trong ${label.toLowerCase()}`" :empty-title="emptyTitle" :empty-hint="emptyHint" />
</template>
