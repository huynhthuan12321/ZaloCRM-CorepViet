<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- Copyright (C) 2026 Nguyễn Tiến Lộc -->
<!--
  Inbox mobile (CONTRACT-A §2.3, §3.1). Presenter: nhận dữ liệu từ MobileChatView (một useChat), không gọi API/socket.
  Khi mở thread, cha để inbox vẫn mounted nhưng `active=false` (ẩn + inert) để giữ bộ lọc và vị trí cuộn.
-->
<template>
  <section
    class="m-inbox"
    :class="{ 'm-inbox--hidden': !active }"
    :inert="!active || undefined"
    :aria-hidden="!active ? 'true' : undefined"
    aria-label="Danh sách hội thoại"
  >
    <div class="m-inbox__tools">
      <label class="m-inbox__search">
        <i class="mdi mdi-magnify" aria-hidden="true" />
        <input
          :value="query"
          type="search"
          inputmode="search"
          enterkeyhint="search"
          autocomplete="off"
          autocapitalize="off"
          placeholder="Tìm tên khách hoặc số điện thoại"
          aria-label="Tìm hội thoại"
          @input="emit('update:query', ($event.target as HTMLInputElement).value)"
        />
      </label>
      <button type="button" class="m-inbox__tool" :class="{ 'm-inbox__tool--on': activeFilterCount > 0 }" :aria-label="filterLabel" @click="filterOpen = true">
        <i class="mdi mdi-filter-variant" aria-hidden="true" />
        <span v-if="activeFilterCount > 0" class="m-inbox__tool-count">{{ activeFilterCount }}</span>
      </button>
      <button type="button" class="m-inbox__tool" aria-label="Tin nhắn mới" @click="emit('compose')">
        <i class="mdi mdi-square-edit-outline" aria-hidden="true" />
      </button>
    </div>

    <ul v-if="activeFilterCount > 0" class="m-inbox__chips" aria-label="Bộ lọc đang áp dụng">
      <li v-if="filters.unreplied" class="m-inbox__chip">Chưa trả lời</li>
      <li v-if="filters.unread" class="m-inbox__chip">Chưa đọc</li>
      <li v-if="filters.mine" class="m-inbox__chip">Khách của tôi</li>
      <li v-if="canChooseSale && filters.assignedUserId" class="m-inbox__chip">
        Đang xem: {{ saleViewName }}
        <button type="button" class="m-inbox__chip-clear" aria-label="Bỏ lọc sale"
          @click="emit('update:filters', { ...filters, mine: false, assignedUserId: null })">Bỏ lọc</button>
      </li>
      <li v-if="filters.accountId" class="m-inbox__chip">Nick: {{ accountName }}</li>
      <li><button type="button" class="m-inbox__chip-clear" @click="clearFilters">Xóa bộ lọc</button></li>
    </ul>

    <div ref="scroller" class="m-inbox__list" @scroll.passive="onScroll">
      <MobileFeedback v-if="state === 'loading' && conversations.length === 0" state="loading" title="Đang tải hội thoại…" />
      <MobileFeedback
        v-else-if="state === 'error' && conversations.length === 0"
        state="error"
        title="Không tải được hội thoại"
        description="Kiểm tra kết nối rồi thử lại."
        retryable
        @retry="emit('retry')"
      />
      <MobileFeedback
        v-else-if="state === 'offline' && conversations.length === 0"
        state="offline"
        title="Đang mất kết nối"
        description="Chưa có hội thoại nào được tải. Kết nối lại rồi thử lại."
        retryable
        @retry="emit('retry')"
      />
      <MobileFeedback
        v-else-if="conversations.length === 0"
        state="empty"
        :title="hasCriteria ? 'Không có hội thoại phù hợp' : 'Chưa có hội thoại nào'"
        :description="hasCriteria ? 'Thử bỏ bớt bộ lọc hoặc đổi từ khóa tìm kiếm.' : 'Khi khách nhắn tin, hội thoại sẽ hiện ở đây.'"
        :clearable="hasCriteria"
        @clear-filters="clearAll"
      />
      <template v-else>
        <ConversationRow
          v-for="row in rows"
          :key="row.conversation.id"
          :conversation="row.conversation"
          :context="row.context"
          :blur-preview="row.blur"
          :selected="row.conversation.id === selectedId"
          @select="emit('select', $event)"
        />
        <div v-if="loadingMore" class="m-inbox__more" role="status">Đang tải thêm…</div>
        <button v-else-if="hasMore" type="button" class="m-inbox__more-btn" @click="emit('loadMore')">Tải thêm hội thoại</button>
      </template>
    </div>

    <InboxFilterSheet
      v-model:open="filterOpen"
      :filters="filters"
      :accounts="accounts"
      :can-choose-sale="canChooseSale" :sale-users="saleUsers" :sales-loading="salesLoading"
      :sales-error="salesError" :current-user-name="currentUserName"
      @apply="emit('update:filters', $event)"
      @clear="clearFilters"
    />
  </section>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import MobileFeedback from '@/components/mobile/shell/MobileFeedback.vue';
import { usePrivacyVisibility } from '@/composables/use-privacy-visibility';
import ConversationRow from './ConversationRow.vue';
import InboxFilterSheet from './InboxFilterSheet.vue';
import { buildConversationContext } from './conversation-model';
import { countActiveFilters } from '@/composables/mobile/use-mobile-inbox-filters';
import type { MobileInboxEmits, MobileInboxProps } from './types';

const props = withDefaults(defineProps<MobileInboxProps & { active?: boolean }>(), { active: true, selectedId: null });
const emit = defineEmits<MobileInboxEmits>();

const privacy = usePrivacyVisibility();
const filterOpen = ref(false);
const scroller = ref<HTMLElement | null>(null);

const rows = computed(() => props.conversations.map(conversation => ({
  conversation,
  context: buildConversationContext(conversation),
  blur: privacy.shouldBlurConv(conversation),
})));

const activeFilterCount = computed(() => countActiveFilters(props.filters));
const hasCriteria = computed(() => activeFilterCount.value > 0 || props.query.trim() !== '');
const filterLabel = computed(() => (activeFilterCount.value > 0 ? `Bộ lọc, đang bật ${activeFilterCount.value} mục` : 'Mở bộ lọc'));
const accountName = computed(() => props.accounts.find(a => a.id === props.filters.accountId)?.displayName ?? 'đã chọn');
const saleViewName = computed(() => props.filters.assignedUserId === 'all' ? 'Tất cả sale'
  : props.filters.assignedUserId === 'unassigned' ? 'Chưa giao sale'
  : props.saleUsers?.find(user => user.id === props.filters.assignedUserId)?.fullName ?? 'Nhân viên đã chọn');

/** Trả focus về hàng hội thoại vừa mở (sau khi back từ thread). Không cuộn: giữ nguyên vị trí danh sách. */
function focusRow(convId: string) {
  const rowEl = [...(scroller.value?.querySelectorAll<HTMLElement>('[data-conv-id]') ?? [])].find(el => el.dataset.convId === convId);
  rowEl?.focus({ preventScroll: true });
}

function clearFilters() {
  emit('update:filters', { unread: false, unreplied: false, mine: false, accountId: null, assignedUserId: null });
}
function clearAll() {
  clearFilters();
  emit('update:query', '');
}

// Tải tiếp khi cuộn gần đáy; nút "Tải thêm" là đường dự phòng cho trợ năng.
function onScroll() {
  const el = scroller.value;
  if (!el || !props.hasMore || props.loadingMore) return;
  if (el.scrollHeight - el.scrollTop - el.clientHeight < 320) emit('loadMore');
}

defineExpose({ scroller, focusRow });
</script>

<style scoped>
.m-inbox {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  min-height: 0;
  background: var(--m-bg);
  color: var(--m-text);
}
/* Ẩn nhưng GIỮ layout để không mất vị trí cuộn (display:none làm reset scrollTop trên một số trình duyệt). */
.m-inbox--hidden {
  visibility: hidden;
  pointer-events: none;
}
.m-inbox__tools {
  flex: none;
  display: flex;
  align-items: center;
  gap: var(--m-space-2);
  padding: var(--m-space-2) var(--m-gutter);
  background: var(--m-surface);
  border-bottom: 1px solid var(--m-line);
}
.m-inbox__search {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
  gap: var(--m-space-2);
  min-height: var(--m-touch);
  padding: 0 var(--m-space-3);
  border: 1px solid var(--m-line);
  border-radius: var(--m-radius-md);
  background: var(--m-surface-inset);
  color: var(--m-muted);
}
.m-inbox__search input {
  flex: 1;
  min-width: 0;
  height: 100%;
  border: 0;
  outline: 0;
  background: transparent;
  color: var(--m-text);
  font: inherit;
  font-size: 16px; /* >=16px: iOS không tự zoom */
}
.m-inbox__search:focus-within {
  outline: 3px solid var(--m-focus);
  outline-offset: 1px;
}
.m-inbox__tool {
  position: relative;
  flex: none;
  display: inline-grid;
  place-items: center;
  width: var(--m-touch);
  height: var(--m-touch);
  border: 1px solid var(--m-line);
  border-radius: var(--m-radius-md);
  background: var(--m-surface);
  color: var(--m-text);
  font-size: 22px;
  cursor: pointer;
  touch-action: manipulation;
}
.m-inbox__tool--on {
  border-color: var(--m-brand-strong);
  color: var(--m-brand-strong);
}
.m-inbox__tool:focus-visible {
  outline: 3px solid var(--m-focus);
  outline-offset: 2px;
}
.m-inbox__tool-count {
  position: absolute;
  top: -6px;
  right: -6px;
  min-width: 20px;
  height: 20px;
  padding: 0 5px;
  border-radius: 10px;
  background: var(--m-brand-strong);
  color: var(--m-on-action);
  font-size: 12px;
  font-weight: 750;
  line-height: 20px;
  text-align: center;
}
.m-inbox__chips {
  flex: none;
  display: flex;
  flex-wrap: wrap;
  gap: var(--m-space-2);
  margin: 0;
  padding: var(--m-space-2) var(--m-gutter);
  list-style: none;
  background: var(--m-surface);
  border-bottom: 1px solid var(--m-line);
}
.m-inbox__chip {
  padding: 4px 10px;
  border-radius: 999px;
  background: var(--m-brand-soft);
  color: var(--m-brand-strong);
  font-size: 13px;
  font-weight: 650;
}
.m-inbox__chip-clear {
  min-height: 32px;
  padding: 0 10px;
  border: 0;
  background: transparent;
  color: var(--m-brand-strong);
  font: inherit;
  font-size: 13px;
  font-weight: 650;
  text-decoration: underline;
  cursor: pointer;
}
.m-inbox__list {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  overflow-x: hidden;
  overscroll-behavior: contain;
  -webkit-overflow-scrolling: touch;
}
.m-inbox__more,
.m-inbox__more-btn {
  display: block;
  width: 100%;
  min-height: var(--m-touch);
  padding: var(--m-space-3);
  border: 0;
  background: transparent;
  color: var(--m-muted);
  font: inherit;
  font-size: var(--m-font-meta);
  text-align: center;
}
.m-inbox__more-btn {
  color: var(--m-brand-strong);
  font-weight: 650;
  cursor: pointer;
}
</style>
