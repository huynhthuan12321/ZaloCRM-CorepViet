<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- Copyright (C) 2026 Nguyễn Tiến Lộc -->
<script setup lang="ts">
/** Chọn nick Zalo (select gốc: menu iOS chuẩn, chữ 16px chống zoom). Trạng thái tải nick do useMobileNicks báo. */
import MobileFeedback from '@/components/mobile/shell/MobileFeedback.vue';
import type { NickOption } from '@/composables/mobile-tools/mobile-tool-readers';

defineProps<{
  options: NickOption[];
  modelValue: string;
  state: 'loading' | 'ready' | 'empty' | 'error' | 'offline' | 'forbidden';
}>();
const emit = defineEmits<{ 'update:modelValue': [id: string]; retry: [] }>();
</script>

<template>
  <div class="m-tnp">
    <MobileFeedback v-if="state === 'loading'" state="loading" title="Đang tải danh sách nick" />
    <MobileFeedback v-else-if="state === 'offline'" state="offline" retryable @retry="emit('retry')" />
    <MobileFeedback v-else-if="state === 'forbidden'" state="forbidden" />
    <MobileFeedback v-else-if="state === 'error'" state="error" title="Không tải được danh sách nick" retryable @retry="emit('retry')" />
    <MobileFeedback v-else-if="state === 'empty'" state="empty" title="Chưa có nick Zalo" description="Thêm nick Zalo trên máy tính để xem dữ liệu tại đây." />
    <label v-else class="m-tnp__field">
      <span class="m-tnp__label">Nick Zalo</span>
      <select class="m-tnp__select" :value="modelValue" aria-label="Chọn nick Zalo" @change="emit('update:modelValue', ($event.target as HTMLSelectElement).value)">
        <option v-for="n in options" :key="n.id" :value="n.id">{{ n.label }}</option>
      </select>
    </label>
  </div>
</template>

<style scoped>
.m-tnp__field { display: flex; flex-direction: column; gap: var(--m-space-1); }
.m-tnp__label { font-size: var(--m-font-meta); font-weight: 650; color: var(--m-muted); }
.m-tnp__select { min-height: var(--m-touch); width: 100%; padding: 0 var(--m-space-3); border: 1px solid var(--m-line); border-radius: var(--m-radius-md); background: var(--m-surface); color: var(--m-text); font: inherit; font-size: 16px; }
.m-tnp__select:focus-visible { outline: 3px solid var(--m-focus); outline-offset: 1px; }
</style>
