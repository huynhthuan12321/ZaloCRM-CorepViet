<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- Copyright (C) 2026 Nguyễn Tiến Lộc -->
<script setup lang="ts">
/**
 * Trang đích mobile cho Marketing / Nhóm / Bạn bè (F3), nằm trong khung MobileLayout (tiêu đề + nút Quay lại về Tài khoản do shell dựng).
 * Hiện DỮ LIỆU THẬT ở chế độ CHỈ ĐỌC (đọc qua các endpoint GET desktop đang dùng), không bảng nhiều cột, không thao tác ghi/quét/gửi.
 * Thao tác nặng (tạo, sửa, quét, gửi hàng loạt, duyệt kết bạn...) nằm sau ghi chú "Dùng máy tính".
 */
import { computed } from 'vue';
import { RouterLink } from 'vue-router';
import '@/assets/mobile-tokens.css';
import { isExtension } from '@ee/edition';
import { useAuthStore } from '@/stores/auth';
import MobileFeedback from '@/components/mobile/shell/MobileFeedback.vue';
import MobileDesktopNotice from '@/components/mobile/settings/MobileDesktopNotice.vue';
import MobileFriendsReader from './MobileFriendsReader.vue';
import MobileGroupsReader from './MobileGroupsReader.vue';
import MobileMarketingReader from './MobileMarketingReader.vue';
import { resolveToolEntries, TOOL_COPY, type MobileToolId } from './tools-model';

const props = defineProps<{ tool: MobileToolId }>();
const auth = useAuthStore();

const copy = computed(() => TOOL_COPY[props.tool]);
// Cùng quyền + cờ tính năng với menu (và desktop). Router guard + server vẫn là chốt thật; đây chỉ tránh hiện trang cho người không đủ điều kiện.
const allowed = computed(() => resolveToolEntries(auth, isExtension).find(e => e.id === props.tool)?.visible ?? false);

const alternatives = computed(() => {
  const list: Array<{ to: string; label: string; icon: string }> = [];
  if (auth.canAccess('conversation')) list.push({ to: '/chat', label: 'Mở Hội thoại', icon: 'mdi-message-text-outline' });
  if (auth.canAccess('contact')) list.push({ to: '/contacts', label: 'Mở Khách hàng', icon: 'mdi-account-group-outline' });
  return list;
});
</script>

<template>
  <div class="crm-mobile m-tool">
    <MobileFeedback v-if="!allowed" state="forbidden" />
    <template v-else>
      <section class="m-tool__intro" :aria-labelledby="`m-tool-${tool}`">
        <i class="mdi m-tool__icon" :class="copy.icon" aria-hidden="true" />
        <div class="m-tool__intro-text">
          <h2 :id="`m-tool-${tool}`" class="m-tool__title">{{ copy.title }}</h2>
          <p class="m-tool__summary">{{ copy.summary }}</p>
        </div>
      </section>

      <MobileFriendsReader v-if="tool === 'friends'" />
      <MobileGroupsReader v-else-if="tool === 'groups'" />
      <MobileMarketingReader v-else />

      <MobileDesktopNotice :action="copy.desktopAction" />

      <nav v-if="alternatives.length" class="m-tool__alt" aria-label="Làm việc nhanh trên điện thoại">
        <RouterLink v-for="a in alternatives" :key="a.to" :to="a.to" class="m-tool__alt-link">
          <i class="mdi" :class="a.icon" aria-hidden="true" /><span>{{ a.label }}</span><i class="mdi mdi-chevron-right m-tool__chev" aria-hidden="true" />
        </RouterLink>
      </nav>
    </template>
  </div>
</template>

<style scoped>
.m-tool { display: flex; flex-direction: column; gap: var(--m-space-4); min-width: 0; padding: var(--m-space-4) var(--m-gutter) var(--m-space-8); background: var(--m-bg); color: var(--m-text); font-family: var(--m-font-family); font-size: var(--m-font-body); }
.m-tool__intro { display: flex; gap: var(--m-space-3); align-items: flex-start; padding: var(--m-space-3) var(--m-space-4); border: 1px solid var(--m-line); border-radius: var(--m-radius-card); background: var(--m-surface); }
.m-tool__icon { flex: none; font-size: 24px; line-height: 1.2; color: var(--m-brand-strong); }
.m-tool__intro-text { min-width: 0; }
.m-tool__title { margin: 0 0 var(--m-space-1); font-size: var(--m-font-section); font-weight: 650; line-height: 1.3; overflow-wrap: anywhere; }
.m-tool__summary { margin: 0; font-size: var(--m-font-meta); line-height: 1.5; color: var(--m-muted); overflow-wrap: anywhere; }
.m-tool__alt { display: flex; flex-direction: column; overflow: hidden; border: 1px solid var(--m-line); border-radius: var(--m-radius-card); background: var(--m-surface); }
.m-tool__alt-link { display: flex; align-items: center; gap: var(--m-space-3); min-height: 52px; padding: var(--m-space-2) var(--m-space-4); color: var(--m-text); text-decoration: none; touch-action: manipulation; }
.m-tool__alt-link + .m-tool__alt-link { border-top: 1px solid var(--m-line); }
.m-tool__alt-link:focus-visible { outline: 3px solid var(--m-focus); outline-offset: -3px; }
.m-tool__alt-link .mdi:first-child { font-size: 22px; color: var(--m-brand-strong); }
.m-tool__alt-link span { flex: 1; min-width: 0; }
.m-tool__chev { color: var(--m-muted); font-size: 22px; }
</style>
