<!--
  LeadPoolTabsPage — wrapper 2 tab (2026-06-10, CEO-review).
  Gộp 2 mục menu cũ thành 1: "Nhận Lead" (config) + "Queue chia Lead" (preview).
    • Tab "Cấu hình nhận lead" — LeadPoolConfigPage (quota, câu chào, điều kiện).
    • Tab "Queue chia lead"   — LeadPoolPreviewPage (xem trước hàng đợi chia).
  Mỗi tab là page độc lập, chỉ bọc tab bar. ?tab=queue để deep-link.
-->
<template>
  <div class="lp-tabs-wrap">
    <v-tabs v-model="tab" class="lp-tabs" color="primary" density="comfortable">
      <v-tab value="config">
        <v-icon start size="18" icon="mdi-cog-outline" /> Cấu hình nhận lead
      </v-tab>
      <v-tab value="queue">
        <v-icon start size="18" icon="mdi-format-list-numbered" /> Queue chia lead
      </v-tab>
    </v-tabs>

    <!-- Giữ cả 2 mounted bằng v-show để không mất state khi chuyển tab. -->
    <div v-show="tab === 'config'">
      <LeadPoolConfigPage />
    </div>
    <div v-show="tab === 'queue'">
      <LeadPoolPreviewPage />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import LeadPoolConfigPage from './LeadPoolConfigPage.vue';
import LeadPoolPreviewPage from './LeadPoolPreviewPage.vue';

// Tab mặc định = Cấu hình. ?tab=queue để deep-link sang Queue.
const initial = new URLSearchParams(window.location.search).get('tab');
const tab = ref<'config' | 'queue'>(initial === 'queue' ? 'queue' : 'config');
</script>

<style scoped>
.lp-tabs-wrap { display: flex; flex-direction: column; }
.lp-tabs { border-bottom: 1px solid var(--border, #e5e7eb); margin-bottom: 16px; }
</style>
