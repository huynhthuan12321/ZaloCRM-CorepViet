<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- Copyright (C) 2026 Nguyễn Tiến Lộc -->
<!--
  CommunityMarketingShell — menu Marketing cho bản COMMUNITY (open-core).
  Chỉ gồm chức năng CORE: Quét nhóm + Tệp khách hàng. KHÔNG chứa chức năng EE
  (triggers/sequences/blocks/broadcasts/care…). Route /marketing này chỉ đăng ký
  khi !isExtension (xem router/index.ts) nên KHÔNG đụng shell Marketing của EE.
-->
<template>
  <div class="ce-marketing-shell">
    <aside class="ce-mkt-sidebar">
      <div class="ce-mkt-header">
        <v-icon size="20">mdi-bullhorn-variant-outline</v-icon>
        <span class="ce-mkt-title">Marketing</span>
      </div>
      <nav class="ce-mkt-nav">
        <RouterLink
          v-for="item in navItems"
          :key="item.to"
          :to="item.to"
          class="ce-mkt-link"
          :class="{ 'is-active': isActive(item.to) }"
        >
          <v-icon size="18">{{ item.icon }}</v-icon>
          <span>{{ item.label }}</span>
        </RouterLink>
      </nav>
    </aside>
    <main class="ce-mkt-content">
      <router-view />
    </main>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useRoute } from 'vue-router';
import { marketingFeatureGate } from '@/utils/marketingFeatureFlags';

const route = useRoute();

// Chỉ chức năng core. Phase 2 thêm Tệp khách hàng (/marketing/lists) khi Lists move ra core.
const allNavItems = [
  { to: '/marketing/group-scan', label: 'Quét nhóm', icon: 'mdi-account-group-outline', enabled: marketingFeatureGate.groupScan },
  { to: '/marketing/lists', label: 'Tệp khách hàng', icon: 'mdi-format-list-bulleted', enabled: marketingFeatureGate.lists },
  { to: '/marketing/targets', label: 'Mục tiêu', icon: 'mdi-account-multiple-plus-outline', enabled: marketingFeatureGate.targets },
  // Phiên chăm sóc + Bám đuổi thủ công: backend đã có worker; UI standalone đang triển khai
  // → route trỏ trang PLACEHOLDER an toàn (không 404, không gọi API gửi thật). Xem GAP B5.
  { to: '/marketing/care-sessions', label: 'Phiên chăm sóc', icon: 'mdi-account-heart-outline', enabled: marketingFeatureGate.careSessions },
  { to: '/marketing/sequences', label: 'Luồng kịch bản', icon: 'mdi-target-variant', enabled: marketingFeatureGate.sequences },
  { to: '/marketing/manual-followup', label: 'Bám đuổi thủ công', icon: 'mdi-account-clock-outline', enabled: marketingFeatureGate.manualFollowup },
  { to: '/marketing/broadcasts', label: 'Gửi tin hàng loạt', icon: 'mdi-bullhorn-variant-outline', enabled: marketingFeatureGate.broadcasts },
  { to: '/marketing/content-blocks', label: 'Khối nội dung', icon: 'mdi-view-grid-plus-outline', enabled: marketingFeatureGate.contentBlocks },
  { to: '/marketing/message-templates', label: 'Mẫu tin nhắn', icon: 'mdi-message-flash-outline', enabled: marketingFeatureGate.messageTemplates },
];

const navItems = computed(() => allNavItems.filter((item) => item.enabled));

function isActive(to: string): boolean {
  return route.path === to || route.path.startsWith(to + '/');
}
</script>

<style scoped>
.ce-marketing-shell { display: flex; height: 100%; min-height: 0; }
.ce-mkt-sidebar {
  flex: 0 0 220px; border-right: 1px solid var(--border, #e5e4e7);
  background: #fbfbfc; display: flex; flex-direction: column; padding: 12px 8px;
}
.ce-mkt-header {
  display: flex; align-items: center; gap: 8px; padding: 8px 10px 12px;
  font-weight: 700; color: #0e445a; font-size: 15px;
}
.ce-mkt-nav { display: flex; flex-direction: column; gap: 2px; }
.ce-mkt-link {
  display: flex; align-items: center; gap: 10px; padding: 9px 12px;
  border-radius: 8px; color: #44505c; text-decoration: none; font-size: 14px;
}
.ce-mkt-link:hover { background: rgba(15, 111, 160, 0.08); }
.ce-mkt-link.is-active { background: rgba(15, 111, 160, 0.14); color: #0e445a; font-weight: 600; }
.ce-mkt-content { flex: 1 1 auto; min-width: 0; overflow: auto; }

@media (max-width: 768px) {
  .ce-marketing-shell { flex-direction: column; }
  .ce-mkt-sidebar { flex: 0 0 auto; border-right: none; border-bottom: 1px solid var(--border, #e5e4e7); }
  .ce-mkt-nav { flex-direction: row; overflow-x: auto; }
}
</style>
