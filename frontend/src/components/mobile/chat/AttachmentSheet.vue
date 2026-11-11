<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- Copyright (C) 2026 Nguyễn Tiến Lộc -->
<!--
  Sheet của nút + (CONTRACT-A §3.3): Ảnh · Chụp ảnh · Video · Tài liệu · Kho media.
  Presenter thuần: KHÔNG gọi API. Chỉ chọn tệp -> lọc theo luật backend -> emit pick/rejected/openLibrary.
  conversationId là SNAPSHOT lúc mở sheet; đổi hội thoại khi sheet mở thì sheet tự đóng và không phát pick.
-->
<template>
  <MobileSheet :open="open" title="Thêm vào tin nhắn" @update:open="onUpdateOpen">
    <p class="m-attach__target">Gửi tới <strong>{{ customerName }}</strong> qua nick <strong>{{ context.nickName }}</strong></p>

    <p v-if="disabled" class="m-attach__lock" role="status">
      <i class="mdi mdi-lock-outline" aria-hidden="true" />
      <span>{{ disabledReason || 'Hiện chưa gửi được tệp trong hội thoại này.' }}</span>
    </p>

    <ul class="m-attach__list">
      <li v-for="opt in ATTACHMENT_OPTIONS" :key="opt.kind">
        <button
          type="button"
          class="m-attach__item"
          :data-kind="opt.kind"
          :disabled="disabled"
          :aria-describedby="`m-attach-hint-${opt.kind}`"
          @click="choose(opt)"
        >
          <i class="mdi m-attach__icon" :class="opt.icon" aria-hidden="true" />
          <span class="m-attach__text">
            <span class="m-attach__label">{{ opt.label }}</span>
            <span :id="`m-attach-hint-${opt.kind}`" class="m-attach__hint">{{ opt.hint }}</span>
          </span>
        </button>
      </li>
    </ul>

    <!-- Input file ẩn bằng CSS (không dùng display:none để iOS vẫn mở được bộ chọn). -->
    <template v-for="opt in fileOptions" :key="`in-${opt.kind}`">
      <input
        :ref="(el) => setInputRef(opt.kind, el as HTMLInputElement | null)"
        class="m-attach__input"
        type="file"
        :data-kind="opt.kind"
        :accept="opt.accept"
        :capture="opt.capture"
        :multiple="opt.multiple"
        tabindex="-1"
        aria-hidden="true"
        @change="onPicked(opt.kind as FileKind, $event)"
      />
    </template>
  </MobileSheet>
</template>

<script setup lang="ts">
import { computed, watch } from 'vue';
import MobileSheet from '@/components/mobile/shell/MobileSheet.vue';
import { ATTACHMENT_OPTIONS, filterPickedFiles, type AttachmentOption } from './attachment-config';
import type { AttachmentKind, AttachmentSheetEmits, AttachmentSheetProps } from './types';

type FileKind = Exclude<AttachmentKind, 'library'>;

const props = defineProps<AttachmentSheetProps>();
const emit = defineEmits<AttachmentSheetEmits>();

const fileOptions = computed(() => ATTACHMENT_OPTIONS.filter(o => o.kind !== 'library'));
const inputs = new Map<string, HTMLInputElement>();

function setInputRef(kind: string, el: HTMLInputElement | null) {
  if (el) inputs.set(kind, el);
  else inputs.delete(kind);
}

function onUpdateOpen(value: boolean) {
  emit('update:open', value);
}

// Đổi hội thoại khi sheet đang mở -> đóng, không upload (rủi ro gửi nhầm khách).
watch(
  () => props.currentConversationId,
  (id) => {
    if (props.open && id !== props.conversationId) emit('update:open', false);
  },
);

function choose(opt: AttachmentOption) {
  if (props.disabled) return;
  if (opt.kind === 'library') {
    emit('openLibrary', props.conversationId);
    return;
  }
  inputs.get(opt.kind)?.click();
}

function onPicked(kind: FileKind, event: Event) {
  const input = event.target as HTMLInputElement;
  const files = Array.from(input.files ?? []);
  input.value = ''; // cho phép chọn lại đúng tệp đó lần sau
  if (!files.length) return;

  if (props.disabled) {
    emit('rejected', [props.disabledReason || 'Hiện chưa gửi được tệp trong hội thoại này.']);
    return;
  }
  // Chặn lần cuối: người dùng đã sang hội thoại khác trong lúc bộ chọn tệp mở.
  if (props.currentConversationId !== props.conversationId) {
    emit('rejected', ['Đã đổi sang khách khác nên chưa gửi tệp. Hãy chọn lại tệp trong hội thoại đúng.']);
    emit('update:open', false);
    return;
  }
  const { accepted, reasons } = filterPickedFiles(kind, files);
  if (reasons.length) emit('rejected', reasons);
  if (accepted.length) emit('pick', { kind, files: accepted, conversationId: props.conversationId });
}
</script>

<style scoped>
.m-attach__target {
  margin: 0 0 var(--m-space-3);
  font-size: var(--m-font-meta);
  color: var(--m-muted);
  overflow-wrap: anywhere;
}
.m-attach__target strong {
  color: var(--m-text);
  font-weight: 650;
}
.m-attach__lock {
  display: flex;
  gap: var(--m-space-2);
  align-items: flex-start;
  margin: 0 0 var(--m-space-3);
  padding: var(--m-space-3);
  border-radius: var(--m-radius-md);
  background: var(--m-warning-soft);
  color: var(--m-warning);
  font-size: var(--m-font-meta);
  font-weight: 600;
  line-height: 1.4;
}
.m-attach__list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: var(--m-space-1);
}
.m-attach__item {
  width: 100%;
  min-height: 56px;
  display: flex;
  align-items: center;
  gap: var(--m-space-3);
  padding: var(--m-space-2) var(--m-space-3);
  border: 1px solid var(--m-line);
  border-radius: var(--m-radius-md);
  background: var(--m-surface);
  color: var(--m-text);
  font: inherit;
  text-align: left;
  cursor: pointer;
  touch-action: manipulation;
}
.m-attach__item:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}
.m-attach__item:focus-visible {
  outline: 3px solid var(--m-focus);
  outline-offset: 2px;
}
.m-attach__icon {
  flex: none;
  font-size: 26px;
  line-height: 1;
  color: var(--m-brand-strong);
}
.m-attach__text {
  display: flex;
  flex-direction: column;
  min-width: 0;
}
.m-attach__label {
  font-weight: 650;
}
.m-attach__hint {
  font-size: var(--m-font-meta);
  color: var(--m-muted);
  line-height: 1.35;
}
.m-attach__input {
  position: absolute;
  width: 1px;
  height: 1px;
  opacity: 0;
  overflow: hidden;
  pointer-events: none;
}
</style>
