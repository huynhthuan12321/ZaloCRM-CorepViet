<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- Copyright (C) 2026 Nguyễn Tiến Lộc -->
<!--
  Hiển thị PrivacySplit: số công khai và số nick riêng tư TÁCH RỜI (khóa + số), KHÔNG cộng gộp để không lộ số private.
  Không có dữ liệu (undefined/null) -> "—" (không phải 0): lỗi/thiếu section không được hiển thị như "không có việc".
-->
<template>
  <span class="crm-pv" :aria-label="aria">
    <template v-if="parts">
      <span class="crm-pv__pub">{{ parts.pub }}</span>
      <span v-if="parts.priv > 0" class="crm-pv__priv"><i class="mdi mdi-lock-outline" aria-hidden="true" />{{ parts.priv }}</span>
    </template>
    <span v-else class="crm-pv__na">—</span>
  </span>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type { PrivacySplit } from '@/composables/use-dashboard-action-hub';
import { splitAriaLabel, splitParts } from './crm-model';

const props = defineProps<{ split?: PrivacySplit | null; label: string }>();
const parts = computed(() => splitParts(props.split));
const aria = computed(() => splitAriaLabel(props.label, props.split));
</script>

<style scoped>
.crm-pv { display: inline-flex; align-items: baseline; gap: 6px; font-variant-numeric: tabular-nums; }
.crm-pv__priv { display: inline-flex; align-items: center; gap: 2px; font-size: 0.75em; font-weight: 600; color: var(--m-warning); }
.crm-pv__na { color: var(--m-muted); }
</style>
