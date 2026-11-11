<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- Copyright (C) 2026 Nguyễn Tiến Lộc -->
<!--
  Tin đang nằm trong hàng đợi offline của hội thoại này (rào 5, CONTRACT-A §3.5), hiện cuối thread.
  waiting: "Đang chờ gửi" + Hủy · sending: "Đang gửi…" · unsent: "Chưa gửi" + Gửi lại / Xóa. Presenter thuần.
-->
<template>
  <ul v-if="items.length > 0" class="m-pending" aria-label="Tin đang chờ gửi">
    <li v-for="item in items" :key="item.id" class="m-pending__item" :data-state="item.state">
      <p class="m-pending__text">{{ item.content }}</p>
      <div class="m-pending__meta">
        <span class="m-pending__status" role="status">
          <i class="mdi" :class="item.state === 'unsent' ? 'mdi-alert-circle-outline' : 'mdi-clock-outline'" aria-hidden="true" />
          {{ statusText(item) }}
        </span>
        <span class="m-pending__actions">
          <button
            v-if="item.state === 'unsent'"
            type="button"
            class="m-pending__btn"
            data-action="resend"
            :disabled="!online"
            @click="emit('resend', item.id)"
          >Gửi lại</button>
          <button
            v-if="item.state !== 'sending'"
            type="button"
            class="m-pending__btn m-pending__btn--ghost"
            :data-action="item.state === 'unsent' ? 'delete' : 'cancel'"
            @click="emit('cancel', item.id)"
          >{{ item.state === 'unsent' ? 'Xóa' : 'Hủy' }}</button>
        </span>
      </div>
    </li>
  </ul>
</template>

<script setup lang="ts">
import type { PendingDisplayState } from '@/composables/use-offline-queue';

export interface PendingStripItem {
  id: string;
  content: string;
  state: PendingDisplayState;
  /** Từng 'đang gửi' rồi trang tắt: có thể khách đã nhận. */
  maybeDelivered?: boolean;
}

defineProps<{ items: PendingStripItem[]; online: boolean }>();
const emit = defineEmits<{ cancel: [id: string]; resend: [id: string] }>();

function statusText(item: PendingStripItem): string {
  const state: PendingDisplayState = item.state;
  if (state === 'sending') return 'Đang gửi…';
  if (state === 'unsent') return item.maybeDelivered ? 'Có thể đã gửi — xem lại hội thoại trước khi gửi lại' : 'Chưa gửi';
  return 'Đang chờ gửi';
}
</script>

<style scoped>
.m-pending {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: var(--m-space-2);
}
.m-pending__item {
  max-width: 86%;
  padding: var(--m-space-2) var(--m-space-3);
  border: 1px dashed var(--m-line);
  border-radius: var(--m-radius-lg) var(--m-radius-lg) var(--m-radius-sm) var(--m-radius-lg);
  background: var(--m-bubble-out);
  color: var(--m-text);
}
.m-pending__item[data-state='unsent'] {
  border-color: var(--m-danger);
}
.m-pending__text {
  margin: 0;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  font-size: var(--m-font-body);
  line-height: 1.4;
}
.m-pending__meta {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: var(--m-space-2);
  margin-top: var(--m-space-1);
}
.m-pending__status {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: var(--m-font-meta);
  font-weight: 650;
  color: var(--m-warning);
}
.m-pending__item[data-state='unsent'] .m-pending__status {
  color: var(--m-danger);
}
.m-pending__actions {
  display: inline-flex;
  gap: var(--m-space-1);
}
.m-pending__btn {
  min-width: var(--m-touch);
  min-height: var(--m-touch);
  padding: 0 var(--m-space-3);
  border: 1px solid var(--m-brand-strong);
  border-radius: var(--m-radius-md);
  background: var(--m-brand-strong);
  color: var(--m-on-action);
  font: inherit;
  font-size: 14px;
  font-weight: 650;
  cursor: pointer;
  touch-action: manipulation;
}
.m-pending__btn--ghost {
  background: transparent;
  color: var(--m-brand-strong);
}
.m-pending__btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
.m-pending__btn:focus-visible {
  outline: 3px solid var(--m-focus);
  outline-offset: 2px;
}
</style>
