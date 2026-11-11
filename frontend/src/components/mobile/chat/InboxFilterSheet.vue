<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- Copyright (C) 2026 Nguyễn Tiến Lộc -->
<!--
  Bộ lọc inbox hai pha (CONTRACT-A §2.3): chọn trong nháp nội bộ -> "Áp dụng" mới đổi bộ lọc thật; "Xóa" đưa về mặc định.
  Presenter thuần: không gọi API.
-->
<template>
  <MobileSheet :open="open" title="Lọc hội thoại" :dirty="false" @update:open="emit('update:open', $event)">
    <fieldset class="m-filter__group">
      <legend>Trạng thái</legend>
      <label class="m-filter__check"><input v-model="draft.unreplied" type="checkbox" /><span>Chưa trả lời</span></label>
      <label class="m-filter__check"><input v-model="draft.unread" type="checkbox" /><span>Chưa đọc</span></label>
      <label v-if="!canChooseSale" class="m-filter__check"><input v-model="draft.mine" type="checkbox" disabled /><span>Khách của tôi</span></label>
    </fieldset>

    <fieldset v-if="canChooseSale" class="m-filter__group">
      <legend>Sale phụ trách</legend>
      <SaleAssigneePicker :model-value="draft.mine ? null : draft.assignedUserId ?? 'all'"
        :users="saleUsers ?? []" :loading="salesLoading" :error="salesError" :current-user-name="currentUserName" mobile
        @update:model-value="selectSale" />
    </fieldset>

    <fieldset v-if="accounts.length > 0" class="m-filter__group">
      <legend>Nick Zalo</legend>
      <label class="m-filter__check">
        <input v-model="draft.accountId" type="radio" name="m-filter-account" :value="null" /><span>Tất cả nick</span>
      </label>
      <label v-for="acc in accounts" :key="acc.id" class="m-filter__check">
        <input v-model="draft.accountId" type="radio" name="m-filter-account" :value="acc.id" /><span>{{ acc.displayName }}</span>
      </label>
    </fieldset>

    <template #footer>
      <button type="button" class="m-filter__btn" data-action="clear" @click="clear">Xóa bộ lọc</button>
      <button type="button" class="m-filter__btn m-filter__btn--primary" data-action="apply" @click="apply">Áp dụng</button>
    </template>
  </MobileSheet>
</template>

<script setup lang="ts">
import { reactive, watch } from 'vue';
import MobileSheet from '@/components/mobile/shell/MobileSheet.vue';
import SaleAssigneePicker from '@/components/chat/SaleAssigneePicker.vue';
import type { InboxSaleOption } from '@/composables/use-inbox-sales';
import type { InboxAccountOption, InboxFilters } from './types';

const props = defineProps<{ open: boolean; filters: InboxFilters; accounts: InboxAccountOption[];
  canChooseSale?: boolean; saleUsers?: InboxSaleOption[]; salesLoading?: boolean; salesError?: string; currentUserName?: string }>();
const emit = defineEmits<{ 'update:open': [open: boolean]; apply: [filters: InboxFilters]; clear: [] }>();

const draft = reactive<InboxFilters>({ ...props.filters });
// Mỗi lần mở sheet nạp lại từ bộ lọc đang áp dụng (pha 1 luôn bắt đầu từ trạng thái thật).
watch(
  () => props.open,
  (open) => { if (open) Object.assign(draft, props.filters); },
);

function apply() {
  emit('apply', { ...draft });
  emit('update:open', false);
}
function selectSale(value: string | null) {
  draft.mine = value === null;
  draft.assignedUserId = value;
}
function clear() {
  Object.assign(draft, { unread: false, unreplied: false, mine: false, accountId: null, assignedUserId: null });
  emit('clear');
  emit('update:open', false);
}
</script>

<style scoped>
.m-filter__group {
  margin: 0 0 var(--m-space-4);
  padding: 0;
  border: 0;
}
.m-filter__group legend {
  margin-bottom: var(--m-space-2);
  font-size: var(--m-font-meta);
  font-weight: 650;
  color: var(--m-muted);
}
.m-filter__check {
  display: flex;
  align-items: center;
  gap: var(--m-space-3);
  min-height: var(--m-touch);
  font-size: var(--m-font-body);
  cursor: pointer;
}
.m-filter__check input {
  flex: none;
  width: 22px;
  height: 22px;
  accent-color: var(--m-brand-strong);
}
.m-filter__btn {
  flex: 1;
  min-height: var(--m-touch);
  border: 1px solid var(--m-line);
  border-radius: var(--m-radius-md);
  background: var(--m-surface);
  color: var(--m-text);
  font: inherit;
  font-weight: 650;
  cursor: pointer;
  touch-action: manipulation;
}
.m-filter__btn--primary {
  border-color: transparent;
  background: var(--m-brand-strong);
  color: var(--m-on-action);
}
.m-filter__btn:focus-visible {
  outline: 3px solid var(--m-focus);
  outline-offset: 2px;
}
</style>
