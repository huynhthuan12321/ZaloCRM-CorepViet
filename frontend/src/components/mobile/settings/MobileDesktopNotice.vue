<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- Copyright (C) 2026 Nguyễn Tiến Lộc -->
<!-- Thông báo "Dùng máy tính" cho thao tác chưa có trên điện thoại. Dùng token --m-* nên đúng cả Sáng/Tối. -->
<template>
  <p class="crm-dn" role="note">
    <i class="mdi mdi-laptop" aria-hidden="true" />
    <span><strong>Dùng máy tính</strong> để {{ action }}.</span>
  </p>
</template>

<script setup lang="ts">
withDefaults(defineProps<{ action?: string }>(), { action: 'chỉnh sửa mục này' });
</script>

<style scoped>
.crm-dn { display: flex; align-items: flex-start; gap: var(--m-space-2); margin: 0; padding: var(--m-space-3); border: 1px solid var(--m-line); border-radius: var(--m-radius-md); background: var(--m-surface-inset); color: var(--m-text); font-size: var(--m-font-meta); line-height: 1.4; }
.crm-dn i { flex: none; font-size: 20px; color: var(--m-brand-strong); }
.crm-dn span { min-width: 0; overflow-wrap: anywhere; }
</style>
