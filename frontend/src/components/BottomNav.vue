<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- Copyright (C) 2026 Nguyễn Tiến Lộc -->
<template>
  <v-bottom-navigation class="crm-bottom-nav" grow :height="isReportsRoute ? 64 : 56" :model-value="activeTab" @update:model-value="navigate" style="position: fixed; bottom: 0; left: 0; right: 0; z-index: 100; padding-bottom: env(safe-area-inset-bottom);">
    <v-btn v-for="tab in tabs" :key="tab.path" :value="tab.path">
      <v-icon>{{ tab.icon }}</v-icon>
      <span class="text-caption">{{ tab.title }}</span>
    </v-btn>
  </v-bottom-navigation>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useAuthStore } from '@/stores/auth';
import { canViewReports } from '@/utils/report-access';

const route = useRoute();
const router = useRouter();
const auth = useAuthStore();
const isReportsRoute = computed(() => route.path.startsWith('/reports/'));

const baseTabs = [
  { title: 'Chat', icon: 'mdi-message-text-outline', path: '/chat' },
  { title: 'Khách hàng', icon: 'mdi-account-group-outline', path: '/contacts' },
  { title: 'Lịch hẹn', icon: 'mdi-calendar-clock-outline', path: '/appointments' },
  { title: 'Tổng quan', icon: 'mdi-view-dashboard-outline', path: '/' },
];
const tabs = computed(() => canViewReports(auth.user) ? [...baseTabs, { title: 'Báo cáo', icon: 'mdi-chart-box-outline', path: '/reports/tong-quan' }] : baseTabs);

const activeTab = computed(() => {
  if (isReportsRoute.value) return '/reports/tong-quan';
  return tabs.value.find(t => t.path === route.path)?.path ?? '/chat';
});

function navigate(path: string) {
  router.push(path);
}
</script>

<style scoped>
.crm-bottom-nav :deep(.v-btn){min-width:0;min-height:44px;padding:4px;flex:1}
.crm-bottom-nav :deep(.text-caption){white-space:normal;line-height:1.2;font-size:11px!important}
</style>
