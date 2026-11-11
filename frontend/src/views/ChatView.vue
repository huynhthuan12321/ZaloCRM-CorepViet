<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- Copyright (C) 2026 Nguyễn Tiến Lộc -->
<!--
  Wrapper desktop/mobile (CONTRACT-A LOCK C-1, phương án A, D-12). Mỗi nhánh tự gọi useChat() riêng:
  mobile KHÔNG còn tạo instance useChat/socket/watcher route thứ hai của desktop (H8).
  Toàn bộ code desktop cũ nằm nguyên trong DesktopChatView.vue.
-->
<template>
  <MobileChatView v-if="isMobile" />
  <DesktopChatView v-else />
</template>

<script setup lang="ts">
import DesktopChatView from '@/views/DesktopChatView.vue';
import MobileChatView from '@/views/MobileChatView.vue';
import { useMobile } from '@/composables/use-mobile';

const { isMobile } = useMobile();
</script>
