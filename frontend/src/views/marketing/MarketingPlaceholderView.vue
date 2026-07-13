<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- Copyright (C) 2026 Huỳnh Ngọc Thuận — Community extension -->
<!--
  MarketingPlaceholderView — trang giữ chỗ AN TOÀN PRODUCTION cho các module Marketing EE
  đã có backend nhưng CHƯA dựng UI standalone (Phiên chăm sóc, Bám đuổi thủ công).
  Mục tiêu: click vào menu KHÔNG bị 404/trắng/crash; nêu rõ trạng thái "đang triển khai"
  + dry-run; KHÔNG gọi bất kỳ API gửi thật nào (thuần tĩnh, đọc title/desc từ route meta).
-->
<template>
  <div class="mkt-placeholder">
    <div class="mp-card">
      <div class="mp-icon"><v-icon size="40">{{ icon }}</v-icon></div>
      <h1 class="mp-title">{{ title }}</h1>
      <div class="mp-badge"><v-icon size="15">mdi-progress-wrench</v-icon> Đang triển khai · An toàn dry-run</div>
      <p class="mp-desc">{{ description }}</p>

      <div v-if="bullets.length" class="mp-list">
        <div class="mp-list-head">Sẽ có ở bản đầy đủ:</div>
        <ul>
          <li v-for="(b, i) in bullets" :key="i"><v-icon size="15">mdi-check-circle-outline</v-icon> {{ b }}</li>
        </ul>
      </div>

      <div class="mp-note">
        <v-icon size="16">mdi-shield-check-outline</v-icon>
        Trang này chưa gọi API gửi tin. Dữ liệu {{ dataHint }} hiện xem theo từng khách trong
        <b>Chat / Follow-up</b>. Không có thao tác nào gửi Zalo thật từ đây.
      </div>

      <RouterLink class="mp-back" :to="backTo">
        <v-icon size="16">mdi-arrow-left</v-icon> {{ backLabel }}
      </RouterLink>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useRoute } from 'vue-router';

const route = useRoute();

// Nội dung lấy từ route meta (mỗi route đặt riêng) — 1 component dùng lại cho nhiều trang.
const title = computed(() => (route.meta.placeholderTitle as string) ?? 'Đang triển khai');
const description = computed(
  () => (route.meta.placeholderDesc as string) ?? 'Chức năng này đang được hoàn thiện.',
);
const icon = computed(() => (route.meta.placeholderIcon as string) ?? 'mdi-progress-wrench');
const bullets = computed(() => (route.meta.placeholderBullets as string[]) ?? []);
const dataHint = computed(() => (route.meta.placeholderDataHint as string) ?? 'liên quan');
const backTo = computed(() => (route.meta.placeholderBackTo as string) ?? '/marketing/targets');
const backLabel = computed(() => (route.meta.placeholderBackLabel as string) ?? 'Về Mục tiêu');
</script>

<style scoped>
.mkt-placeholder { display: flex; justify-content: center; padding: 48px 20px; }
.mp-card {
  max-width: 560px; width: 100%; text-align: center;
  background: #fff; border: 1px solid var(--border, #e5e4e7);
  border-radius: 14px; padding: 34px 30px; box-shadow: 0 1px 3px rgba(0,0,0,0.04);
}
.mp-icon { color: #0f6fa0; margin-bottom: 8px; }
.mp-title { font-size: 20px; font-weight: 700; color: #0e445a; margin: 0 0 12px; }
.mp-badge {
  display: inline-flex; align-items: center; gap: 6px; font-size: 12.5px; font-weight: 600;
  color: #8a5a00; background: #fff3d6; border: 1px solid #f0d999;
  padding: 4px 10px; border-radius: 999px; margin-bottom: 14px;
}
.mp-desc { color: #44505c; font-size: 14px; line-height: 1.6; margin: 0 0 18px; }
.mp-list { text-align: left; background: #f7fafc; border-radius: 10px; padding: 14px 16px; margin-bottom: 16px; }
.mp-list-head { font-weight: 600; font-size: 13px; color: #0e445a; margin-bottom: 8px; }
.mp-list ul { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 6px; }
.mp-list li { display: flex; align-items: center; gap: 8px; font-size: 13.5px; color: #44505c; }
.mp-list li .v-icon { color: #2e9e6b; }
.mp-note {
  display: flex; align-items: flex-start; gap: 8px; text-align: left;
  font-size: 12.8px; color: #4b5563; background: #eef6fb;
  border: 1px solid #cfe6f3; border-radius: 10px; padding: 10px 12px; margin-bottom: 18px;
}
.mp-note .v-icon { color: #0f6fa0; flex: 0 0 auto; margin-top: 1px; }
.mp-back {
  display: inline-flex; align-items: center; gap: 6px;
  color: #0f6fa0; text-decoration: none; font-size: 14px; font-weight: 600;
}
.mp-back:hover { text-decoration: underline; }
</style>
