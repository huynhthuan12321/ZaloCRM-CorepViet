<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- Copyright (C) 2026 Nguyễn Tiến Lộc -->
<!--
  Wrapper desktop/mobile (CONTRACT-A LOCK D-3, phương án A như C-1). Nhánh mobile KHÔNG mount
  component desktop nên onMounted/fetch desktop không chạy trên mobile (H22/H23).
  Toàn bộ code desktop cũ nằm nguyên trong DesktopContactProfileView.vue.
-->
<template>
  <MobileContactProfileView v-if="isMobile" />
  <DesktopContactProfileView v-else />
</template>

<script setup lang="ts">
import DesktopContactProfileView from '@/views/DesktopContactProfileView.vue';
import MobileContactProfileView from '@/views/mobile/crm/MobileContactProfileView.vue';
import { useMobile } from '@/composables/use-mobile';

const { isMobile } = useMobile();
</script>
