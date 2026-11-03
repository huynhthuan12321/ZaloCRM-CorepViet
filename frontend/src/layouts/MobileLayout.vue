<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- Copyright (C) 2026 Nguyễn Tiến Lộc -->
<template>
  <v-app :class="{ 'rpt-app rpt-mobile-app': isReportsRoute }" :theme="isReportsRoute ? 'hsLight' : undefined">
    <OfflineIndicator />

    <!-- Slim mobile app bar -->
    <v-app-bar density="compact" flat :height="isReportsRoute ? 56 : undefined">
      <v-btn v-if="isReportsRoute" icon aria-label="Về Tổng quan CRM" variant="text" @click="router.push('/')"><v-icon>mdi-arrow-left</v-icon></v-btn>
      <div v-if="isReportsRoute" class="rpt-mobile-brand"><strong>Báo cáo</strong><span>CRM · {{ authStore.user?.orgName }}</span></div>
      <div v-else class="d-flex align-center ml-3" style="gap: 8px;">
        <div class="d-flex align-center justify-center" style="width: 28px; height: 28px; background: linear-gradient(135deg, #00F2FF, #0077B6); border-radius: 8px;">
          <v-icon size="16" color="white">mdi-robot</v-icon>
        </div>
        <span class="font-weight-bold text-body-1"><span style="color: #00F2FF;">CRM</span></span>
      </div>

      <v-spacer />

      <NotificationBell />
      <v-btn v-if="!isReportsRoute" icon size="small" variant="text" @click="toggleTheme">
        <v-icon size="20">{{ isDark ? 'mdi-weather-sunny' : 'mdi-weather-night' }}</v-icon>
      </v-btn>
      <v-btn icon size="small" variant="text" aria-label="Đăng xuất" @click="logout">
        <v-icon size="20">mdi-logout</v-icon>
      </v-btn>
    </v-app-bar>

    <!-- Main content with padding for bottom nav -->
    <v-main :class="{ 'rpt-mobile-main': isReportsRoute }">
      <div :style="{ paddingBottom: isReportsRoute ? '0' : '72px' }">
        <slot />
      </div>
    </v-main>

    <BottomNav />
  </v-app>
</template>

<script setup lang="ts">
import { computed, ref, onMounted } from 'vue';
import { useTheme } from 'vuetify';
import { useAuthStore } from '@/stores/auth';
import { useRouter, useRoute } from 'vue-router';
import NotificationBell from '@/components/NotificationBell.vue';
import BottomNav from '@/components/BottomNav.vue';
import OfflineIndicator from '@/components/OfflineIndicator.vue';

const theme = useTheme();
const authStore = useAuthStore();
const router = useRouter();
const route = useRoute();
const isReportsRoute = computed(() => route.path.startsWith('/reports/'));
const isDark = ref(localStorage.getItem('theme') !== 'light');

onMounted(() => {
  theme.global.name.value = isDark.value ? 'dark' : 'light';
});

function toggleTheme() {
  isDark.value = !isDark.value;
  theme.global.name.value = isDark.value ? 'dark' : 'light';
  localStorage.setItem('theme', isDark.value ? 'dark' : 'light');
}

function logout() {
  authStore.logout();
  router.push('/login');
}
</script>
