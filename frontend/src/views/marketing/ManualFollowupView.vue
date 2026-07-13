<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- Copyright (C) 2026 Huỳnh Ngọc Thuận — Community extension -->
<!--
  ManualFollowupView — Bám đuổi thủ công (Phase 4.1). Chỉ các phiên GẮN TAY từ chat
  (sourceType=sequence_manual). Dùng chung CareSessionListPanel lọc theo nguồn.
-->
<template>
  <CareSessionListPanel
    title="Bám đuổi thủ công"
    description="Các luồng bám đuổi được sale gắn tay cho khách trong Chat → Follow-up. Production chạy dry-run — không gửi Zalo thật, chỉ ghi mock để xem trước luồng."
    empty-text="Chưa có phiên bám đuổi thủ công nào. Bấm “+ Gắn thêm luồng bám đuổi” trong tab Follow-up của Chat."
    source-type="sequence_manual"
  />
</template>

<script setup lang="ts">
import CareSessionListPanel from '@/views/marketing/CareSessionListPanel.vue';
</script>
