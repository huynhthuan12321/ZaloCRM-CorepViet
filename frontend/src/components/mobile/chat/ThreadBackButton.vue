<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- Copyright (C) 2026 Nguyễn Tiến Lộc -->
<!-- Nút quay lại đặt vào slot #header-leading của MessageThread (không tạo header thứ hai, CONTRACT-A §3.1). -->
<template>
  <button type="button" class="m-thread-back" aria-label="Quay lại danh sách hội thoại" @click="emit('back')">
    <i class="mdi mdi-arrow-left" aria-hidden="true" />
  </button>
</template>

<script setup lang="ts">
import type { ThreadBackButtonEmits } from './types';

const emit = defineEmits<ThreadBackButtonEmits>();
</script>

<style scoped>
.m-thread-back {
  flex: none;
  align-self: center;
  display: inline-grid;
  place-items: center;
  width: var(--m-touch, 44px);
  height: var(--m-touch, 44px);
  margin-left: -6px;
  padding: 0;
  border: 0;
  border-radius: var(--m-radius-md, 12px);
  background: transparent;
  color: var(--m-text, inherit);
  font-size: 24px;
  cursor: pointer;
  touch-action: manipulation;
}
.m-thread-back:focus-visible {
  outline: 3px solid var(--m-focus, #0b5880);
  outline-offset: 1px;
}
</style>
