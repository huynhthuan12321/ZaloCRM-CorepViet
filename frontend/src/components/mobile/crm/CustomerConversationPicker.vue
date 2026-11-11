<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- Copyright (C) 2026 Nguyễn Tiến Lộc -->
<!-- Chọn hội thoại khi một khách có từ 2 nick trở lên: mỗi dòng luôn hiện nick + người phụ trách (signature). -->
<template>
  <MobileSheet :open="open" title="Nhắn tin qua nick nào?" @update:open="emit('update:open', $event)">
    <ul class="crm-picker" role="list">
      <li v-for="o in options" :key="o.convId">
        <button type="button" class="crm-picker__row" @click="onSelect(o.convId)">
          <span class="crm-picker__main">
            <strong class="crm-picker__nick">Nick {{ o.nickName }}</strong>
            <span class="crm-picker__owner" :class="{ 'crm-picker__owner--none': !o.ownerName }">
              <i class="mdi mdi-account-outline" aria-hidden="true" />{{ o.ownerName ? `Phụ trách: ${o.ownerName}` : 'Chưa phân công' }}
            </span>
          </span>
          <i class="mdi mdi-chevron-right" aria-hidden="true" />
        </button>
      </li>
    </ul>
  </MobileSheet>
</template>

<script setup lang="ts">
import MobileSheet from '@/components/mobile/shell/MobileSheet.vue';
import type { CustomerConversationPickerEmits, CustomerConversationPickerProps } from './types';

defineProps<CustomerConversationPickerProps>();
const emit = defineEmits<CustomerConversationPickerEmits>();

function onSelect(convId: string) {
  emit('select', convId);
  emit('update:open', false);
}
</script>

<style scoped>
.crm-picker { list-style: none; margin: 0; padding: var(--m-space-1) var(--m-space-3) var(--m-space-4); display: flex; flex-direction: column; gap: var(--m-space-1); }
.crm-picker__row {
  display: flex; align-items: center; gap: var(--m-space-3); width: 100%; min-height: 60px; padding: var(--m-space-2) var(--m-space-3);
  border: 1px solid var(--m-line); border-radius: var(--m-radius-md); background: var(--m-surface); color: var(--m-text); font: inherit; text-align: left; cursor: pointer; touch-action: manipulation;
}
.crm-picker__row:focus-visible { outline: 3px solid var(--m-focus); outline-offset: 2px; }
.crm-picker__main { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
.crm-picker__nick { overflow-wrap: anywhere; }
.crm-picker__owner { display: inline-flex; align-items: center; gap: 4px; font-size: var(--m-font-meta); color: var(--m-text); overflow-wrap: anywhere; }
.crm-picker__owner--none { color: var(--m-muted); }
.crm-picker .mdi-chevron-right { color: var(--m-muted); font-size: 22px; }
</style>
