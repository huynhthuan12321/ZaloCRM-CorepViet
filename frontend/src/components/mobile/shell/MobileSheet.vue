<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- Copyright (C) 2026 Nguyễn Tiến Lộc -->
<template>
  <!-- Overlay Vuetify teleport ra ngoài .crm-mobile: content-class + class crm-mobile ở panel để nhận token (cả tối). -->
  <v-bottom-sheet
    :model-value="open"
    :persistent="persistent"
    content-class="crm-mobile m-sheet-content"
    @update:model-value="onVuetifyUpdate"
    @after-enter="focusPanel"
  >
    <div
      ref="panel"
      class="crm-mobile m-sheet"
      :class="{ 'm-sheet--full': fullHeight }"
      role="dialog"
      aria-modal="true"
      :aria-labelledby="titleId"
      tabindex="-1"
    >
      <div class="m-sheet__head">
        <h2 :id="titleId" class="m-sheet__title">{{ title }}</h2>
        <button type="button" class="m-sheet__close" aria-label="Đóng" @click="requestClose">
          <i class="mdi mdi-close" aria-hidden="true" />
        </button>
      </div>
      <div class="m-sheet__body" :class="{ 'm-sheet__body--bare': !$slots.footer }"><slot /></div>
      <div v-if="$slots.footer" class="m-sheet__footer"><slot name="footer" :request-close="requestClose" /></div>
    </div>
  </v-bottom-sheet>
</template>

<script setup lang="ts">
import { ref, useId } from 'vue';
import { useConfirm } from '@/composables/use-confirm';
import type { MobileSheetEmits, MobileSheetProps } from './types';

const props = withDefaults(defineProps<MobileSheetProps>(), { dirty: false, fullHeight: false, persistent: false });
const emit = defineEmits<MobileSheetEmits>();

const titleId = `m-sheet-title-${useId()}`;
const panel = ref<HTMLElement | null>(null);
const { confirm } = useConfirm();
let closing = false;

function focusPanel() {
  panel.value?.focus({ preventScroll: true });
}

async function requestClose() {
  // `persistent` (vd đang lưu) chặn cả nút Đóng ở header, không chỉ Esc/chạm nền của Vuetify. Mặc định false -> hành vi cũ.
  if (closing || props.persistent) return;
  if (props.dirty) {
    closing = true;
    const ok = await confirm({
      title: 'Bỏ thay đổi chưa lưu?',
      message: 'Các thay đổi trong biểu mẫu sẽ bị mất.',
      confirmText: 'Bỏ thay đổi',
      cancelText: 'Tiếp tục chỉnh sửa',
      tone: 'danger',
    });
    closing = false;
    if (!ok) return;
  }
  emit('update:open', false);
  emit('close');
}

// Esc / chạm nền do Vuetify phát: đi qua requestClose để tôn trọng `dirty`. `persistent` đã chặn ở Vuetify.
function onVuetifyUpdate(value: boolean) {
  if (!value) void requestClose();
}
</script>

<style scoped>
.m-sheet {
  display: flex;
  flex-direction: column;
  max-height: 85dvh;
  background: var(--m-surface);
  color: var(--m-text);
  border-radius: var(--m-radius-sheet) var(--m-radius-sheet) 0 0;
  font-family: var(--m-font-family);
  font-size: var(--m-font-body);
  box-shadow: var(--m-shadow);
  outline: none;
  padding-left: var(--m-safe-left);
  padding-right: var(--m-safe-right);
}
.m-sheet--full {
  height: 85dvh;
}
.m-sheet__head {
  flex: none;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--m-space-2);
  padding: var(--m-space-3) var(--m-space-2) var(--m-space-1) var(--m-space-5);
}
.m-sheet__title {
  margin: 0;
  min-width: 0;
  font-size: var(--m-font-section);
  line-height: 1.35;
  font-weight: 650;
  overflow-wrap: anywhere;
}
.m-sheet__close {
  flex: none;
  display: inline-grid;
  place-items: center;
  width: var(--m-touch);
  height: var(--m-touch);
  padding: 0;
  border: 0;
  border-radius: var(--m-radius-md);
  background: transparent;
  color: inherit;
  font-size: 24px;
  cursor: pointer;
  touch-action: manipulation;
}
.m-sheet__close:focus-visible {
  outline: 3px solid var(--m-focus);
  outline-offset: 1px;
}
.m-sheet__body {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  overscroll-behavior: contain;
  padding: var(--m-space-2) var(--m-space-5) var(--m-space-5);
}
/* Không có footer: body tự chừa vùng home indicator. */
.m-sheet__body--bare {
  padding-bottom: calc(var(--m-space-5) + var(--m-safe-bottom));
}
.m-sheet__footer {
  flex: none;
  display: flex;
  gap: var(--m-space-2);
  padding: var(--m-space-3) var(--m-space-5) calc(var(--m-space-3) + var(--m-safe-bottom));
  border-top: 1px solid var(--m-line);
}
</style>
