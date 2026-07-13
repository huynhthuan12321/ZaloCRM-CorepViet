<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- Copyright (C) 2026 Huỳnh Ngọc Thuận — Community extension -->
<!--
  CareSessionsView — Phiên chăm sóc (Phase 4.1). Tổng hợp MỌI phiên bám đuổi (gắn tay
  từ chat + auto từ Mục tiêu). Dùng chung CareSessionListPanel, không lọc theo nguồn.
-->
<template>
  <CareSessionListPanel
    title="Phiên chăm sóc"
    description="Theo dõi các phiên bám đuổi tự động đang chạy cho từng khách: đang chạy, tạm dừng, hoàn thành, đã dừng. Production chạy dry-run — worker chỉ ghi mock, không gửi Zalo thật."
    empty-text="Chưa có phiên chăm sóc nào. Gắn luồng cho khách trong Chat → Follow-up để bắt đầu."
  />
</template>

<script setup lang="ts">
import CareSessionListPanel from '@/views/marketing/CareSessionListPanel.vue';
</script>
