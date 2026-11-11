<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- Copyright (C) 2026 Nguyễn Tiến Lộc -->
<!--
  Dòng signature của thread (system.md): LUÔN hiện kênh + nick Zalo + người phụ trách ("+N" khi cùng chăm, D-4).
  Đặt ngay dưới header của MessageThread. Không suy người phụ trách từ người gửi tin cuối.
-->
<template>
  <div v-if="compact" class="m-ctx m-ctx--compact" role="group" aria-label="Nick Zalo và người phụ trách">
    <span class="m-ctx__line">Nick <strong>{{ context.nickName }}</strong> · <template v-if="context.ownerName">PT <strong>{{ context.ownerName }}</strong><template v-if="context.ownerExtra > 0"> (+{{ context.ownerExtra }})</template></template><template v-else>Chưa phân công</template></span>
  </div>
  <div v-else class="m-ctx" role="group" aria-label="Nick Zalo và người phụ trách">
    <span class="m-ctx__item m-ctx__channel"><i class="mdi mdi-chat-processing-outline" aria-hidden="true" />{{ context.channelLabel }}</span>
    <span class="m-ctx__item">Nick <strong>{{ context.nickName }}</strong></span>
    <span class="m-ctx__item" :class="{ 'm-ctx__item--none': !context.ownerName }">
      <i class="mdi mdi-account-outline" aria-hidden="true" />
      <template v-if="context.ownerName">Phụ trách <strong>{{ context.ownerName }}</strong><span v-if="context.ownerExtra > 0" class="m-ctx__extra"> (+{{ context.ownerExtra }} cùng chăm)</span></template>
      <template v-else>Chưa phân công</template>
    </span>
    <span v-if="context.archivedNick" class="m-ctx__item m-ctx__item--warn">Nick đã xóa</span>
    <span v-if="context.virtual" class="m-ctx__item m-ctx__item--warn">Chat nội bộ</span>
  </div>
</template>

<script setup lang="ts">
import type { ConversationContext } from './types';

/** compact: bàn phím mở / màn ngang thấp -> một dòng "Nick X · PT Y" (vẫn giữ signature, không ẩn hẳn). */
defineProps<{ context: ConversationContext; compact?: boolean }>();
</script>

<style scoped>
.m-ctx {
  flex: none;
  display: flex;
  flex-wrap: wrap;
  gap: 2px var(--m-space-3);
  padding: var(--m-space-1) var(--m-gutter);
  border-bottom: 1px solid var(--m-line);
  background: var(--m-surface-inset);
  color: var(--m-muted);
  font-size: 12.5px;
  line-height: 1.35;
}
.m-ctx--compact {
  flex-wrap: nowrap;
  padding-block: 2px;
}
.m-ctx__line {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.m-ctx__line strong {
  color: var(--m-text);
  font-weight: 650;
}
.m-ctx__item {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  min-width: 0;
  overflow-wrap: anywhere;
}
.m-ctx__item strong {
  color: var(--m-text);
  font-weight: 650;
}
.m-ctx__channel {
  font-weight: 650;
  color: var(--m-brand-strong);
}
.m-ctx__item--none,
.m-ctx__item--warn {
  color: var(--m-warning);
  font-weight: 650;
}
</style>
