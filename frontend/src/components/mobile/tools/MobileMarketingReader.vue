<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- Copyright (C) 2026 Nguyễn Tiến Lộc -->
<script setup lang="ts">
/**
 * Marketing (mobile, CHỈ ĐỌC). Thanh chức năng = chức năng ĐANG BẬT (cùng cờ marketingFeatureGate với router guard/CommunityMarketingShell);
 * thân trang chọn theo đường dẫn hiện tại (/marketing/lists, /marketing/lists/:id, /marketing/group-scan, /marketing/targets, ...).
 * Đường dẫn của chức năng đã tắt -> router guard đã chuyển đi; nếu vẫn tới đây thì báo "đã tắt" thay vì hiện dữ liệu.
 */
import { computed } from 'vue';
import { RouterLink, useRoute } from 'vue-router';
import MobileFeedback from '@/components/mobile/shell/MobileFeedback.vue';
import MarketingGroupScan from './MarketingGroupScan.vue';
import MarketingLists from './MarketingLists.vue';
import MarketingFeatureList from './MarketingFeatureList.vue';
import { enabledMarketingFeatures, marketingFeatureOfPath } from './tools-model';
import { marketingFeatureGate } from '@/utils/marketingFeatureFlags';
import type { MarketingListKey } from '@/composables/mobile-tools/mobile-tool-readers';

const route = useRoute();
const features = computed(() => enabledMarketingFeatures());
const active = computed(() => marketingFeatureOfPath(route.path));
const listId = computed(() => (route.path.match(/^\/marketing\/lists\/([^/?#]+)/)?.[1]));

const COPY: Record<string, { label: string; emptyTitle: string; emptyHint: string }> = {
  targets: { label: 'Mục tiêu', emptyTitle: 'Chưa có mục tiêu nào', emptyHint: 'Tạo mục tiêu tự động kết bạn trên máy tính.' },
  broadcasts: { label: 'Gửi tin hàng loạt', emptyTitle: 'Chưa có chiến dịch gửi tin', emptyHint: 'Tạo chiến dịch trên máy tính; lịch và kết quả hiện ở đây.' },
  sequences: { label: 'Luồng kịch bản', emptyTitle: 'Chưa có luồng kịch bản', emptyHint: 'Soạn luồng bám đuổi trên máy tính.' },
  contentBlocks: { label: 'Khối nội dung', emptyTitle: 'Chưa có khối nội dung', emptyHint: 'Soạn khối trên máy tính để dùng lại trong tin nhắn.' },
  messageTemplates: { label: 'Mẫu tin nhắn', emptyTitle: 'Chưa có mẫu tin nhắn', emptyHint: 'Tạo mẫu gõ "/" trên máy tính.' },
  careSessions: { label: 'Phiên chăm sóc', emptyTitle: 'Chưa có phiên chăm sóc', emptyHint: 'Gắn luồng cho khách trong Hội thoại để bắt đầu.' },
  manualFollowup: { label: 'Bám đuổi thủ công', emptyTitle: 'Chưa có phiên bám đuổi thủ công', emptyHint: 'Xếp khách vào luồng từ Hội thoại.' },
};
const listKey = computed<MarketingListKey | null>(() => (active.value && active.value in COPY ? (active.value as MarketingListKey) : null));
const disabled = computed(() => !!active.value && !marketingFeatureGate[active.value]);
</script>

<template>
  <div class="m-mkt">
    <nav v-if="features.length" class="m-mkt__nav" aria-label="Chức năng Marketing đang bật">
      <RouterLink
        v-for="f in features" :key="f.key" :to="f.to" class="m-mkt__chip" :class="{ 'm-mkt__chip--on': active === f.key }" :aria-current="active === f.key ? 'page' : undefined" :data-feature="f.key"
      ><i class="mdi" :class="f.icon" aria-hidden="true" />{{ f.label }}</RouterLink>
    </nav>

    <MobileFeedback v-if="disabled" state="forbidden" title="Chức năng đang tắt" description="Chức năng này đã được tắt cho bản triển khai hiện tại." />
    <MarketingGroupScan v-else-if="active === 'groupScan'" />
    <MarketingLists v-else-if="active === 'lists'" :key="listId ?? 'lists'" :list-id="listId" />
    <MarketingFeatureList
      v-else-if="listKey" :key="listKey" :feature="listKey" :label="COPY[listKey].label" :empty-title="COPY[listKey].emptyTitle" :empty-hint="COPY[listKey].emptyHint"
    />
    <MobileFeedback v-else state="empty" title="Chọn một chức năng" description="Chọn một mục ở thanh phía trên để xem dữ liệu." />
  </div>
</template>

<style scoped>
.m-mkt { display: flex; flex-direction: column; gap: var(--m-space-3); min-width: 0; }
.m-mkt__nav { display: flex; gap: var(--m-space-2); overflow-x: auto; padding-bottom: 2px; scrollbar-width: none; -webkit-overflow-scrolling: touch; }
.m-mkt__nav::-webkit-scrollbar { display: none; }
.m-mkt__chip { flex: none; display: inline-flex; align-items: center; gap: 4px; min-height: var(--m-touch); padding: 0 var(--m-space-3); border: 1px solid var(--m-line); border-radius: 22px; background: var(--m-surface); color: var(--m-text); font-size: var(--m-font-meta); text-decoration: none; white-space: nowrap; touch-action: manipulation; }
.m-mkt__chip--on { background: var(--m-brand-strong); border-color: var(--m-brand-strong); color: var(--m-on-action); }
.m-mkt__chip:focus-visible { outline: 3px solid var(--m-focus); outline-offset: 2px; }
</style>
