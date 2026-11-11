<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- Copyright (C) 2026 Nguyễn Tiến Lộc -->
<!--
  Trình xem toàn màn hình: vuốt NGANG đổi mục, vuốt XUỐNG hoặc nút Đóng/Esc để thoát; có nút Trước/Sau và phím mũi tên (không
  chỉ cử chỉ). Phông tối cố định (chuẩn trình xem ảnh, không theo Sáng/Tối). Dựng bằng VDialog (teleport có class crm-mobile)
  nên có bẫy focus, nền bị inert/khóa cuộn do Vuetify quản và Esc chỉ đóng viewer.
-->
<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue';
import type { MediaAssetItem } from '@/api/media';
import { formatBytes, resolveViewerSwipe } from './media-model';

const props = defineProps<{ open: boolean; items: MediaAssetItem[]; index: number; selectedIds: string[]; /** Thông báo từ chối chọn (vd quá 12 mục) vì viewer che hết trang bên dưới. */ notice?: string }>();
const emit = defineEmits<{ close: []; 'update:index': [index: number]; toggle: [item: MediaAssetItem] }>();

const root = ref<HTMLElement | null>(null);
const current = computed(() => props.items[props.index] ?? null);
const selected = computed(() => !!current.value && props.selectedIds.includes(current.value.id));
const sizeText = computed(() => formatBytes(current.value?.sizeBytes));

function go(delta: number) {
  const next = props.index + delta;
  if (next < 0 || next >= props.items.length) return;
  emit('update:index', next);
}

// ── Cử chỉ ──
let startX = 0;
let startY = 0;
let tracking = false;
const dx = ref(0);
const dy = ref(0);
const dragging = ref(false);

const stageStyle = computed(() => {
  if (!dragging.value) return undefined;
  const fade = dy.value > 0 && Math.abs(dy.value) > Math.abs(dx.value) ? Math.max(0.4, 1 - dy.value / 400) : 1;
  const x = Math.abs(dx.value) >= Math.abs(dy.value) ? dx.value : 0;
  const y = Math.abs(dy.value) > Math.abs(dx.value) ? Math.max(0, dy.value) : 0;
  return { transform: `translate(${x}px, ${y}px)`, opacity: String(fade), transition: 'none' };
});

function onStart(e: TouchEvent) {
  // Chạm trên video (thanh tua/âm lượng/điều khiển gốc) thì để video tự xử lý; đổi mục bằng nút Trước/Sau.
  const t = e.target as Element | null;
  if (t && typeof t.closest === 'function' && t.closest('video')) { tracking = false; return; }
  if (e.touches.length !== 1) { tracking = false; return; }
  tracking = true;
  startX = e.touches[0].clientX;
  startY = e.touches[0].clientY;
  dx.value = 0;
  dy.value = 0;
}
function onMove(e: TouchEvent) {
  if (!tracking || e.touches.length !== 1) return;
  dx.value = e.touches[0].clientX - startX;
  dy.value = e.touches[0].clientY - startY;
  dragging.value = Math.abs(dx.value) > 8 || Math.abs(dy.value) > 8;
  if (dragging.value && e.cancelable) e.preventDefault();
}
function reset() { tracking = false; dragging.value = false; dx.value = 0; dy.value = 0; }
function onEnd() {
  if (!tracking) return reset();
  const action = resolveViewerSwipe(dx.value, dy.value);
  reset();
  if (action === 'next') go(1);
  else if (action === 'prev') go(-1);
  else if (action === 'close') emit('close');
}
function onCancel() { reset(); }

function onKey(e: KeyboardEvent) {
  if (e.key === 'ArrowRight') go(1);
  else if (e.key === 'ArrowLeft') go(-1);
}
function onDialog(v: boolean) { if (!v) emit('close'); }

// VDialog không có activator nên Vuetify không trả focus: nhớ phần tử đang focus lúc mở (ô lưới) và trả lại sau khi đóng.
let returnTo: HTMLElement | null = null;
watch(() => props.open, (o) => {
  if (o) {
    const a = document.activeElement;
    returnTo = a instanceof HTMLElement && a !== document.body ? a : null;
  }
}, { flush: 'sync' });
function restoreFocus() {
  const el = returnTo;
  returnTo = null;
  if (el && el.isConnected) void nextTick(() => el.focus({ preventScroll: true }));
}
function onAfterLeave() { reset(); restoreFocus(); }
function focusRoot() { root.value?.focus({ preventScroll: true }); }
</script>

<template>
  <!-- VDialog của Vuetify lo: teleport, bẫy focus, khóa cuộn nền (đếm tham chiếu nên không mở khóa nhầm sheet bên dưới), Esc chỉ đóng viewer. -->
  <v-dialog
    :model-value="open && !!current"
    fullscreen
    :scrim="false"
    transition="fade-transition"
    content-class="crm-mobile m-viewer-host"
    @update:model-value="onDialog"
    @after-enter="focusRoot"
    @after-leave="onAfterLeave"
  >
    <div v-if="current" ref="root" class="crm-mobile m-viewer" role="group" :aria-label="`Xem ${current.name}`" tabindex="-1" @keydown="onKey">
      <header class="m-viewer__bar">
        <button type="button" class="m-viewer__btn" aria-label="Đóng trình xem" @click="emit('close')"><i class="mdi mdi-close" aria-hidden="true" /></button>
        <p class="m-viewer__title">
          <span class="m-viewer__name">{{ current.name }}</span>
          <span class="m-viewer__meta">{{ index + 1 }}/{{ items.length }}<template v-if="sizeText"> · {{ sizeText }}</template></span>
        </p>
      </header>

      <div
        class="m-viewer__stage"
        :style="stageStyle"
        @touchstart.passive="onStart"
        @touchmove="onMove"
        @touchend="onEnd"
        @touchcancel="onCancel"
      >
        <video v-if="current.kind === 'video' && current.url" :key="current.id" class="m-viewer__media" :src="current.url" :poster="current.thumbnailUrl ?? undefined" controls playsinline preload="metadata" />
        <img v-else-if="current.kind === 'image' && (current.url || current.thumbnailUrl)" :key="current.id" class="m-viewer__media" :src="(current.url || current.thumbnailUrl) ?? ''" :alt="current.name" draggable="false" />
        <div v-else class="m-viewer__doc">
          <i class="mdi mdi-file-document-outline" aria-hidden="true" />
          <p>{{ current.name }}</p>
          <a v-if="current.url" class="m-viewer__open" :href="current.url" target="_blank" rel="noopener noreferrer">Mở tệp</a>
          <p v-else class="m-viewer__hint">Chưa có đường dẫn xem tệp này trên điện thoại.</p>
        </div>
      </div>

      <p v-if="notice" class="m-viewer__notice" role="status">{{ notice }}</p>

      <footer class="m-viewer__foot">
        <button type="button" class="m-viewer__btn" aria-label="Mục trước" :disabled="index <= 0" @click="go(-1)"><i class="mdi mdi-chevron-left" aria-hidden="true" /></button>
        <button type="button" class="m-viewer__pick" :aria-pressed="selected" @click="emit('toggle', current)">
          <i class="mdi" :class="selected ? 'mdi-check-circle' : 'mdi-checkbox-blank-circle-outline'" aria-hidden="true" />{{ selected ? 'Đã chọn' : 'Chọn để gửi' }}
        </button>
        <button type="button" class="m-viewer__btn" aria-label="Mục sau" :disabled="index >= items.length - 1" @click="go(1)"><i class="mdi mdi-chevron-right" aria-hidden="true" /></button>
      </footer>
    </div>
  </v-dialog>
</template>

<style scoped>
.m-viewer {
  /* Màu cục bộ của trình xem ảnh (đen cố định cả Sáng/Tối); không phải token --m-* dùng chung. */
  --viewer-bg: #000; --viewer-fg: #fff; --viewer-chip: rgb(255 255 255 / .16);
  width: 100%; height: 100%; display: flex; flex-direction: column; background: var(--viewer-bg); color: var(--viewer-fg);
  font-family: var(--m-font-family); outline: none;
  padding-left: env(safe-area-inset-left, 0px); padding-right: env(safe-area-inset-right, 0px);
}
.m-viewer__bar { display: flex; align-items: center; gap: 8px; padding: calc(env(safe-area-inset-top, 0px) + 4px) 8px 4px; }
.m-viewer__title { flex: 1; min-width: 0; margin: 0; display: flex; flex-direction: column; }
.m-viewer__name { font-size: 15px; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.m-viewer__meta { font-size: 12px; opacity: .75; }
.m-viewer__btn {
  flex: none; display: inline-flex; align-items: center; justify-content: center; width: 44px; height: 44px; border: 0; border-radius: 22px;
  background: var(--viewer-chip); color: var(--viewer-fg); font-size: 24px; cursor: pointer; touch-action: manipulation;
}
.m-viewer__btn:disabled { opacity: .35; cursor: default; }
.m-viewer__btn:focus-visible, .m-viewer__pick:focus-visible, .m-viewer__open:focus-visible { outline: 3px solid var(--viewer-fg); outline-offset: 2px; }
.m-viewer__stage { flex: 1; min-height: 0; display: flex; align-items: center; justify-content: center; overflow: hidden; touch-action: none; transition: transform .18s ease, opacity .18s ease; }
.m-viewer__media { max-width: 100%; max-height: 100%; object-fit: contain; -webkit-user-select: none; user-select: none; }
.m-viewer__doc { display: flex; flex-direction: column; align-items: center; gap: 12px; padding: 24px; text-align: center; max-width: 100%; }
.m-viewer__doc .mdi { font-size: 72px; opacity: .8; }
.m-viewer__doc p { margin: 0; overflow-wrap: anywhere; }
.m-viewer__hint { font-size: 13px; opacity: .75; }
.m-viewer__open { display: inline-flex; align-items: center; min-height: 44px; padding: 0 20px; border-radius: 22px; background: var(--viewer-fg); color: var(--viewer-bg); font-weight: 650; text-decoration: none; }
.m-viewer__notice { margin: 0; padding: 8px 16px; font-size: 14px; font-weight: 600; text-align: center; background: var(--viewer-chip); }
.m-viewer__foot { display: flex; align-items: center; justify-content: space-between; gap: 8px; padding: 8px 12px calc(env(safe-area-inset-bottom, 0px) + 8px); }
.m-viewer__pick { display: inline-flex; align-items: center; gap: 8px; min-height: 44px; padding: 0 18px; border: 0; border-radius: 22px; background: var(--viewer-chip); color: var(--viewer-fg); font: inherit; font-weight: 650; cursor: pointer; touch-action: manipulation; }
.m-viewer__pick .mdi { font-size: 22px; }
@media (prefers-reduced-motion: reduce) { .m-viewer__stage { transition: none; } }
</style>
