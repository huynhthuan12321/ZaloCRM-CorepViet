<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- Copyright (C) 2026 Nguyễn Tiến Lộc -->
<template>
  <!-- Banner nằm TRONG luồng flex của MobileLayout (đầu cột), không còn position:fixed đè lên header.
       Câu chữ khớp hành vi thật: hàng đợi offline của mobile tự gửi lại khi có mạng (CONTRACT-A §3.5 mục 5). -->
  <div v-if="!isOnline" class="m-offline" role="status" aria-live="polite">
    <i class="mdi mdi-wifi-off m-offline__icon" aria-hidden="true" />
    <span class="m-offline__text">Mất kết nối — tin đang chờ sẽ tự gửi khi có mạng</span>
  </div>
</template>

<script setup lang="ts">
import { useMobile } from '@/composables/use-mobile';
const { isOnline } = useMobile();
</script>

<style scoped>
.m-offline {
  flex: none;
  z-index: var(--m-z-header);
  display: flex;
  align-items: center;
  gap: var(--m-space-2);
  min-height: 36px;
  padding: calc(var(--m-space-2) + var(--m-safe-top)) calc(var(--m-gutter) + var(--m-safe-right)) var(--m-space-2) calc(var(--m-gutter) + var(--m-safe-left));
  background: var(--m-warning-soft);
  color: var(--m-warning);
  font-family: var(--m-font-family);
  font-size: var(--m-font-meta);
  font-weight: 600;
  line-height: 1.35;
}
.m-offline__icon {
  flex: none;
  font-size: 18px;
  line-height: 1;
}
.m-offline__text {
  min-width: 0;
}
</style>
