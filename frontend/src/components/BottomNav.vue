<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- Copyright (C) 2026 Nguyễn Tiến Lộc -->
<!-- Wrapper mỏng: nối MobileTabBar với router + quyền + badge. Không còn v-bottom-navigation / tab Báo cáo
     (Báo cáo nằm trong Tài khoản). Tabbar là phần tử TRONG luồng flex của MobileLayout, không position:fixed. -->
<template>
  <MobileTabBar :items="items" :active-key="activeKey" @navigate="onNavigate" />
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import MobileTabBar from '@/components/mobile/shell/MobileTabBar.vue';
import type { MobileTabKey } from '@/components/mobile/shell/types';
import { resolveMobileTab, useMobileNavItems } from '@/composables/use-mobile-nav';

const route = useRoute();
const router = useRouter();
const items = useMobileNavItems();
const activeKey = computed(() => resolveMobileTab(route));

function onNavigate(key: MobileTabKey) {
  const item = items.value.find(i => i.key === key);
  if (item) void router.push(item.to);
}
</script>
