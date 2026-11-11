<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- Copyright (C) 2026 Nguyễn Tiến Lộc -->
<!--
  Kho media trong thread (CONTRACT-A §3.3, H16; F2): lưới mobile + trình xem + chọn 1/nhiều, gửi qua sendMediaToConversation /
  sendAlbumToConversation (cùng API với MediaTabPanel). Đích CỐ ĐỊNH = snapshot `conversationId` lúc mở sheet, luôn hiện tên khách + nick.
  Không xếp hàng offline: khi khóa (offline/nick xóa/hội thoại ảo/Riêng tư) vẫn XEM được kho nhưng nút Gửi bị khóa, kèm lý do bằng chữ.
  Đổi hội thoại khi đang mở -> tự đóng.
  Tab "Khối" (parity MediaTabPanel): nhúng NGUYÊN AutomationBlocksPanel hiện có (chỉ bản mở rộng; bản Community stub không có nội dung nên
  không hiện tab). Khi thread khóa gửi thì pane Khối chỉ hiện lý do, không mount panel (panel gửi tin).
-->
<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { isExtension } from '@ee/edition';
import AutomationBlocksPanel from '@ee/automation/chat-blocks/AutomationBlocksPanel.vue';
import MobileSheet from '@/components/mobile/shell/MobileSheet.vue';
import MobileMediaLibrary from '@/components/mobile/media/MobileMediaLibrary.vue';
import type { MediaTarget } from '@/components/mobile/media/media-model';
import type { Contact } from '@/composables/use-contacts';

const props = defineProps<{
  open: boolean;
  /** Snapshot lúc mở sheet. */
  conversationId: string;
  currentConversationId: string | null;
  contact?: Contact | null;
  ownerNickId?: string | null;
  nickName?: string | null;
  /** Tên hiển thị của khách (ưu tiên). Không truyền -> suy từ contact. */
  customerName?: string | null;
  ownerName?: string | null;
  disabled: boolean;
  disabledReason?: string;
}>();
const emit = defineEmits<{ 'update:open': [open: boolean]; sent: [payload: { convId: string; sent: number }] }>();

const hasBlocks = isExtension;
const pane = ref<'media' | 'block'>('media');
const lockText = computed(() => props.disabledReason || 'Hiện chưa gửi được từ kho media trong hội thoại này.');

const target = computed<MediaTarget>(() => {
  // Gửi phải nêu RÕ khách + nick trong hộp xác nhận: thiếu một trong hai thì khóa gửi (vẫn xem được kho), không điền chữ giả.
  const customerName = props.customerName?.trim() || props.contact?.crmName?.trim() || props.contact?.fullName?.trim() || '';
  const nickName = props.nickName?.trim() || '';
  const missing = !nickName ? 'nick gửi' : !customerName ? 'khách nhận' : '';
  return {
    convId: props.conversationId,
    customerName: customerName || 'Chưa rõ khách',
    nickName: nickName || 'chưa rõ',
    ownerName: props.ownerName ?? null,
    // Khóa tĩnh khác (nick xóa, Riêng tư...) do thread tính và truyền xuống qua external-lock.
    lockReason: missing ? `Chưa xác định được ${missing} của hội thoại này nên chưa gửi từ kho được. Mở lại hội thoại hoặc tải lại trang.` : null,
  };
});

watch(
  () => props.currentConversationId,
  (id) => {
    if (props.open && id !== props.conversationId) emit('update:open', false);
  },
);
watch(() => props.open, (o) => { if (!o) pane.value = 'media'; });
</script>

<template>
  <MobileSheet :open="open" title="Kho media" full-height @update:open="emit('update:open', $event)">
    <div v-if="open && conversationId === currentConversationId" class="m-media">
      <div v-if="hasBlocks" class="m-media__tabs" role="tablist" aria-label="Kho media hoặc Khối">
        <button type="button" role="tab" class="m-media__tab" :class="{ 'm-media__tab--on': pane === 'media' }" :aria-selected="pane === 'media'" data-pane="media" @click="pane = 'media'">Ảnh, video, tệp</button>
        <button type="button" role="tab" class="m-media__tab" :class="{ 'm-media__tab--on': pane === 'block' }" :aria-selected="pane === 'block'" data-pane="block" @click="pane = 'block'">Khối</button>
      </div>
      <p v-if="disabled" class="m-media__lock" role="status">
        <i class="mdi mdi-lock-outline" aria-hidden="true" />
        <span>{{ lockText }}</span>
      </p>
      <!-- v-show cho thư viện để đổi qua lại không mất chọn/cuộn/bộ lọc. -->
      <MobileMediaLibrary v-show="pane === 'media'" :key="conversationId" fixed-target :target="target" :external-lock="disabled ? lockText : null" @sent="emit('sent', $event)" />
      <AutomationBlocksPanel
        v-if="hasBlocks && pane === 'block' && !disabled"
        :key="`blocks-${conversationId}`"
        :conversation-id="conversationId"
        :contact="contact ?? null"
        :owner-nick-id="ownerNickId ?? null"
        :nick-name="nickName ?? null"
      />
    </div>
  </MobileSheet>
</template>

<style scoped>
.m-media { padding: var(--m-space-2) var(--m-space-3) var(--m-space-4); display: flex; flex-direction: column; gap: var(--m-space-3); min-height: 0; }
.m-media__tabs { display: flex; gap: var(--m-space-1); padding: var(--m-space-1); border-radius: var(--m-radius-md); background: var(--m-surface-inset); }
.m-media__tab { flex: 1; min-height: var(--m-touch); padding: 0 var(--m-space-3); border: 0; border-radius: var(--m-radius-sm); background: transparent; color: var(--m-muted); font: inherit; font-weight: 600; cursor: pointer; touch-action: manipulation; }
.m-media__tab--on { background: var(--m-surface); color: var(--m-brand-strong); box-shadow: var(--m-shadow-rest); }
.m-media__tab:focus-visible { outline: 3px solid var(--m-focus); outline-offset: 2px; }
.m-media__lock {
  display: flex;
  gap: var(--m-space-2);
  align-items: flex-start;
  margin: 0;
  padding: var(--m-space-3);
  border-radius: var(--m-radius-md);
  background: var(--m-warning-soft);
  color: var(--m-warning);
  font-size: var(--m-font-meta);
  font-weight: 600;
  line-height: 1.4;
}
</style>
