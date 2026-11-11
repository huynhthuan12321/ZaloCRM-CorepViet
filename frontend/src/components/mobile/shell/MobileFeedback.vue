<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- Copyright (C) 2026 Nguyễn Tiến Lộc -->
<template>
  <div v-if="state === 'loading'" class="m-feedback m-feedback--loading" role="status" aria-live="polite" aria-busy="true">
    <span class="m-feedback__sr">{{ resolvedTitle }}</span>
    <div v-for="n in 3" :key="n" class="m-feedback__skeleton" aria-hidden="true">
      <span class="m-feedback__bar m-feedback__bar--wide" />
      <span class="m-feedback__bar" />
    </div>
  </div>
  <div v-else class="m-feedback" :class="`m-feedback--${state}`" :role="state === 'error' ? 'alert' : 'status'">
    <i class="mdi m-feedback__icon" :class="icon" aria-hidden="true" />
    <h2 class="m-feedback__title">{{ resolvedTitle }}</h2>
    <p v-if="resolvedDescription" class="m-feedback__desc">{{ resolvedDescription }}</p>
    <div v-if="showRetry || showClear" class="m-feedback__actions">
      <button v-if="showRetry" type="button" class="m-feedback__btn m-feedback__btn--primary" @click="emit('retry')">Thử lại</button>
      <button v-if="showClear" type="button" class="m-feedback__btn" @click="emit('clearFilters')">Xóa bộ lọc</button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type { MobileFeedbackEmits, MobileFeedbackProps, MobileFeedbackState } from './types';

const props = withDefaults(defineProps<MobileFeedbackProps>(), {
  title: undefined,
  description: undefined,
  retryable: false,
  clearable: false,
});
const emit = defineEmits<MobileFeedbackEmits>();

// Câu chữ mặc định. Offline KHÔNG hứa tự gửi/đồng bộ gì ngoài việc cập nhật lại khi có mạng.
const DEFAULTS: Record<MobileFeedbackState, { title: string; description: string; icon: string }> = {
  loading: { title: 'Đang tải…', description: '', icon: 'mdi-loading' },
  empty: { title: 'Chưa có dữ liệu', description: 'Khi có dữ liệu, bạn sẽ thấy ở đây.', icon: 'mdi-tray-remove' },
  error: { title: 'Không tải được dữ liệu', description: 'Có lỗi xảy ra. Hãy thử lại.', icon: 'mdi-alert-circle-outline' },
  offline: { title: 'Đang mất kết nối', description: 'Nội dung đã tải vẫn xem được. Kết nối lại rồi thử lại.', icon: 'mdi-wifi-off' },
  forbidden: { title: 'Bạn không có quyền xem mục này', description: 'Liên hệ quản trị viên nếu bạn cần truy cập.', icon: 'mdi-lock-outline' },
};

const icon = computed(() => DEFAULTS[props.state].icon);
const resolvedTitle = computed(() => props.title ?? DEFAULTS[props.state].title);
const resolvedDescription = computed(() => props.description ?? DEFAULTS[props.state].description);
// Thử lại chỉ có nghĩa với lỗi/offline; Xóa bộ lọc chỉ với trạng thái rỗng.
const showRetry = computed(() => props.retryable && (props.state === 'error' || props.state === 'offline'));
const showClear = computed(() => props.clearable && props.state === 'empty');
</script>

<style scoped>
.m-feedback {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--m-space-2);
  padding: var(--m-space-8) var(--m-gutter);
  text-align: center;
  color: var(--m-text);
  font-family: var(--m-font-family);
}
.m-feedback__icon {
  font-size: 40px;
  line-height: 1;
  color: var(--m-muted);
}
.m-feedback--error .m-feedback__icon {
  color: var(--m-danger);
}
.m-feedback--offline .m-feedback__icon {
  color: var(--m-warning);
}
.m-feedback__title {
  margin: 0;
  font-size: var(--m-font-section);
  font-weight: 650;
  line-height: 1.35;
  text-wrap: balance;
}
.m-feedback__desc {
  margin: 0;
  max-width: 32ch;
  font-size: var(--m-font-meta);
  line-height: 1.45;
  color: var(--m-muted);
}
.m-feedback__actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: var(--m-space-2);
  margin-top: var(--m-space-2);
}
.m-feedback__btn {
  min-width: var(--m-touch);
  min-height: var(--m-touch);
  padding: 0 var(--m-space-4);
  border: 1px solid var(--m-line);
  border-radius: var(--m-radius-md);
  background: var(--m-surface);
  color: var(--m-text);
  font: inherit;
  font-weight: 650;
  cursor: pointer;
  touch-action: manipulation;
}
.m-feedback__btn--primary {
  border-color: transparent;
  background: var(--m-brand-strong);
  color: var(--m-on-action);
}
.m-feedback__btn:focus-visible {
  outline: 3px solid var(--m-focus);
  outline-offset: 2px;
}
.m-feedback--loading {
  align-items: stretch;
  gap: var(--m-space-3);
  padding: var(--m-space-4) var(--m-gutter);
}
.m-feedback__skeleton {
  display: flex;
  flex-direction: column;
  gap: var(--m-space-2);
  padding: var(--m-space-3);
  border: 1px solid var(--m-line);
  border-radius: var(--m-radius-card);
  background: var(--m-surface);
}
.m-feedback__bar {
  display: block;
  width: 55%;
  height: 12px;
  border-radius: 6px;
  background: var(--m-surface-inset);
  animation: m-feedback-pulse 1.4s ease-in-out infinite;
}
.m-feedback__bar--wide {
  width: 80%;
  height: 16px;
}
.m-feedback__sr {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip-path: inset(50%);
  white-space: nowrap;
}
@keyframes m-feedback-pulse {
  50% {
    opacity: 0.45;
  }
}
@media (prefers-reduced-motion: reduce) {
  .m-feedback__bar {
    animation: none;
  }
}
</style>
