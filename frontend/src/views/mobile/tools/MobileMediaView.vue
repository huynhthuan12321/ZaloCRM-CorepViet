<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- Copyright (C) 2026 Nguyễn Tiến Lộc -->
<!--
  Trang /media trên điện thoại (F2). Tiêu đề + nút Quay lại (về Tài khoản) do MobilePageHeader của MobileLayout dựng.
  Đích gửi chọn qua MediaTargetSheet rồi giữ snapshot; quyền xem/gửi là của API hiện có. Quản lý kho (tải lên, thư mục, xóa) -> máy tính.
-->
<script setup lang="ts">
import { ref } from 'vue';
import '@/assets/mobile-tokens.css';
import MobileMediaLibrary from '@/components/mobile/media/MobileMediaLibrary.vue';
import MediaTargetSheet from '@/components/mobile/media/MediaTargetSheet.vue';
import MobileDesktopNotice from '@/components/mobile/settings/MobileDesktopNotice.vue';
import type { MediaTarget } from '@/components/mobile/media/media-model';

const target = ref<MediaTarget | null>(null);
const targetOpen = ref(false);

// Đích giữ nguyên sau khi gửi để gửi tiếp cho cùng khách; muốn đổi thì bấm "Đổi".
</script>

<template>
  <div class="crm-mobile m-media-page">
    <MobileMediaLibrary :target="target" @change-target="targetOpen = true" />
    <MobileDesktopNotice action="tải lên, tạo thư mục, gắn tag hoặc xóa mục trong kho" />
    <MediaTargetSheet v-model:open="targetOpen" @select="target = $event" />
  </div>
</template>

<style scoped>
.m-media-page {
  display: flex; flex-direction: column; gap: var(--m-space-4); min-width: 0;
  padding: var(--m-space-3) var(--m-gutter) var(--m-space-8); background: var(--m-bg); color: var(--m-text); font-family: var(--m-font-family);
}
</style>
