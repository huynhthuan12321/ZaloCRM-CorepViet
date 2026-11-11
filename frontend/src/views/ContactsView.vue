<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- Copyright (C) 2026 Nguyễn Tiến Lộc -->
<!--
  Wrapper desktop/mobile (CONTRACT-A LOCK D-1, phương án A như C-1). Nhánh mobile KHÔNG mount
  component desktop nên onMounted/fetch desktop không chạy trên mobile (H22/H23).
  Toàn bộ code desktop cũ nằm nguyên trong DesktopContactsView.vue.
-->
<template>
  <MobileContactView v-if="isMobile" />
  <DesktopContactsView v-else />
</template>

<script setup lang="ts">
import DesktopContactsView from '@/views/DesktopContactsView.vue';
import MobileContactView from '@/views/MobileContactView.vue';
import { useMobile } from '@/composables/use-mobile';

const { isMobile } = useMobile();
</script>
