<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- Copyright (C) 2026 Nguyễn Tiến Lộc -->
<!--
  Hàng hội thoại mobile. Signature (system.md): luôn hiện nick Zalo + người phụ trách ("+N" khi có người cùng chăm, D-4).
  Kênh luôn bằng CHỮ + icon (không chỉ màu). Chưa đọc: số + chữ, tương phản cao. Presenter thuần.
-->
<template>
  <button
    type="button"
    class="m-conv-row"
    :data-conv-id="conversation.id"
    :class="{ 'm-conv-row--unread': conversation.unreadCount > 0, 'm-conv-row--selected': selected }"
    :aria-label="ariaLabel"
    :aria-current="selected ? 'true' : undefined"
    @click="emit('select', conversation.id)"
  >
    <Avatar
      class="m-conv-row__avatar"
      :src="avatarSrc"
      :name="name"
      :size="48"
      :is-group="conversation.threadType === 'group'"
      :gradient-seed="conversation.id"
    />
    <span class="m-conv-row__body">
      <span class="m-conv-row__top">
        <span class="m-conv-row__name">{{ name }}</span>
        <span class="m-conv-row__time"><ConvTime :at="conversation.lastMessageAt" /></span>
      </span>
      <span class="m-conv-row__preview">
        <template v-if="blurPreview"><i class="mdi mdi-lock-outline" aria-hidden="true" /> Nội dung riêng tư</template>
        <template v-else>{{ preview || 'Chưa có tin nhắn' }}</template>
      </span>
      <span class="m-conv-row__context">
        <span class="m-conv-row__channel"><i class="mdi mdi-chat-processing-outline" aria-hidden="true" />{{ context.channelLabel }}</span>
        <span class="m-conv-row__nick">Nick {{ context.nickName }}</span>
        <span class="m-conv-row__owner" :class="{ 'm-conv-row__owner--none': !context.ownerName }">
          <i class="mdi mdi-account-outline" aria-hidden="true" />{{ ownerText }}
        </span>
      </span>
      <span v-if="conversation.isReplied === false || context.archivedNick" class="m-conv-row__flags">
        <span v-if="conversation.isReplied === false" class="m-conv-row__flag m-conv-row__flag--wait">Chưa trả lời</span>
        <span v-if="context.archivedNick" class="m-conv-row__flag">Nick đã xóa</span>
      </span>
    </span>
    <span v-if="conversation.unreadCount > 0" class="m-conv-row__unread" aria-hidden="true">
      {{ conversation.unreadCount > 99 ? '99+' : conversation.unreadCount }}
    </span>
  </button>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import Avatar from '@/components/ui/Avatar.vue';
import ConvTime from '@/components/chat/ConvTime.vue';
import { conversationAvatar, conversationDisplayName, conversationPreview, ownerLabel } from './conversation-model';
import type { ConversationRowEmits, ConversationRowProps } from './types';

const props = withDefaults(defineProps<ConversationRowProps>(), { blurPreview: false, selected: false });
const emit = defineEmits<ConversationRowEmits>();

const name = computed(() => conversationDisplayName(props.conversation));
const avatarSrc = computed(() => conversationAvatar(props.conversation));
const preview = computed(() => conversationPreview(props.conversation));
const ownerText = computed(() => (props.context.ownerName ? `Phụ trách: ${ownerLabel(props.context)}` : 'Chưa phân công'));
const ariaLabel = computed(() => {
  const parts = [name.value];
  if (props.conversation.unreadCount > 0) parts.push(`${props.conversation.unreadCount} tin chưa đọc`);
  if (props.conversation.isReplied === false) parts.push('chưa trả lời');
  parts.push(`${props.context.channelLabel}, nick ${props.context.nickName}`);
  parts.push(props.context.ownerName ? `phụ trách ${ownerLabel(props.context)}` : 'chưa phân công');
  return parts.join(', ');
});
</script>

<style scoped>
.m-conv-row {
  position: relative;
  display: flex;
  align-items: flex-start;
  gap: var(--m-space-3);
  width: 100%;
  min-height: 72px;
  padding: var(--m-space-3) var(--m-gutter);
  border: 0;
  border-bottom: 1px solid var(--m-line);
  background: var(--m-surface);
  color: var(--m-text);
  font: inherit;
  text-align: left;
  cursor: pointer;
  touch-action: manipulation;
  -webkit-tap-highlight-color: var(--m-tap-highlight);
}
.m-conv-row--selected {
  background: var(--m-brand-soft);
}
.m-conv-row:focus-visible {
  outline: 3px solid var(--m-focus);
  outline-offset: -3px;
}
.m-conv-row__avatar {
  flex: none;
}
.m-conv-row__body {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.m-conv-row__top {
  display: flex;
  align-items: baseline;
  gap: var(--m-space-2);
}
.m-conv-row__name {
  flex: 1;
  min-width: 0;
  font-size: var(--m-font-body);
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.m-conv-row--unread .m-conv-row__name {
  font-weight: 750;
}
.m-conv-row__time {
  flex: none;
  font-size: var(--m-font-meta);
  color: var(--m-muted);
}
.m-conv-row__preview {
  display: -webkit-box;
  -webkit-line-clamp: 2;
  line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  font-size: 14px;
  line-height: 1.35;
  color: var(--m-muted);
  overflow-wrap: anywhere;
}
.m-conv-row--unread .m-conv-row__preview {
  color: var(--m-text);
  font-weight: 600;
}
.m-conv-row__context {
  display: flex;
  flex-wrap: wrap;
  gap: 2px var(--m-space-3);
  margin-top: 2px;
  font-size: 12.5px;
  line-height: 1.3;
  color: var(--m-muted);
}
.m-conv-row__context > span {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  min-width: 0;
  overflow-wrap: anywhere;
}
.m-conv-row__channel {
  font-weight: 650;
  color: var(--m-brand-strong);
}
.m-conv-row__owner--none {
  color: var(--m-warning);
  font-weight: 600;
}
.m-conv-row__flags {
  display: flex;
  gap: var(--m-space-2);
  margin-top: 2px;
}
.m-conv-row__flag {
  padding: 1px 8px;
  border-radius: 999px;
  background: var(--m-surface-inset);
  color: var(--m-muted);
  font-size: 12px;
  font-weight: 650;
}
.m-conv-row__flag--wait {
  background: var(--m-warning-soft);
  color: var(--m-warning);
}
.m-conv-row__unread {
  flex: none;
  align-self: center;
  min-width: 24px;
  height: 24px;
  padding: 0 7px;
  border-radius: 12px;
  background: var(--m-brand-strong);
  color: var(--m-on-action);
  font-size: 13px;
  font-weight: 750;
  line-height: 24px;
  text-align: center;
}
</style>
