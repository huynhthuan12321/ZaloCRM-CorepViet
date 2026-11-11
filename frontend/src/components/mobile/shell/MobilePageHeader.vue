<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- Copyright (C) 2026 Nguyễn Tiến Lộc -->
<template>
  <header class="m-header" :class="{ 'm-header--brand': tone === 'brand' }">
    <div class="m-header__row">
      <slot name="leading">
        <button v-if="showBack" type="button" class="m-header__btn" aria-label="Quay lại" @click="emit('back')">
          <i class="mdi mdi-arrow-left" aria-hidden="true" />
        </button>
      </slot>
      <div class="m-header__titles" :class="{ 'm-header__titles--indent': !showBack && !$slots.leading }">
        <h1 class="m-header__title">{{ title }}</h1>
        <p v-if="subtitle" class="m-header__subtitle">{{ subtitle }}</p>
      </div>
      <button
        v-for="action in visibleActions"
        :key="action.id"
        type="button"
        class="m-header__btn"
        :aria-label="action.label"
        :disabled="action.disabled"
        @click="emit('action', action.id)"
      >
        <i class="mdi" :class="action.icon" aria-hidden="true" />
      </button>
      <slot name="trailing" />
    </div>
  </header>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type { MobilePageHeaderEmits, MobilePageHeaderProps } from './types';

const props = withDefaults(defineProps<MobilePageHeaderProps & { tone?: 'default' | 'brand' }>(), {
  subtitle: undefined,
  showBack: false,
  actions: () => [],
  tone: 'default',
});
const emit = defineEmits<MobilePageHeaderEmits>();

// Hợp đồng: tối đa 2 action; thừa thì bỏ (không tràn ngang ở 320px).
const visibleActions = computed(() => props.actions.slice(0, 2));
</script>

<style scoped>
.m-header {
  flex: none;
  z-index: var(--m-z-header);
  padding: var(--m-safe-top) var(--m-safe-right) 0 var(--m-safe-left);
  background: var(--m-surface);
  color: var(--m-text);
  border-bottom: 1px solid var(--m-line);
  font-family: var(--m-font-family);
}
.m-header--brand {
  background: var(--m-brand-strong);
  color: var(--m-on-action);
  border-bottom-color: transparent;
}
.m-header__row {
  display: flex;
  align-items: center;
  gap: var(--m-space-1);
  height: var(--m-header);
  padding: 0 var(--m-space-2);
}
.m-header__titles {
  flex: 1;
  min-width: 0;
}
.m-header__titles--indent {
  padding-left: calc(var(--m-gutter) - var(--m-space-2));
}
.m-header__title {
  margin: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 20px;
  line-height: 1.25;
  font-weight: 700;
  letter-spacing: -0.2px;
}
.m-header__subtitle {
  margin: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: var(--m-font-meta);
  line-height: 1.3;
  color: var(--m-muted);
}
.m-header--brand .m-header__subtitle {
  color: inherit;
  opacity: 0.85;
}
.m-header__btn {
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
  line-height: 1;
  cursor: pointer;
  touch-action: manipulation;
  -webkit-tap-highlight-color: var(--m-tap-highlight);
}
.m-header__btn:disabled {
  opacity: 0.55;
  cursor: default;
}
.m-header__btn:focus-visible {
  outline: 3px solid var(--m-focus);
  outline-offset: 1px;
}
.m-header--brand .m-header__btn:focus-visible {
  outline-color: var(--m-on-action);
}
/* Chuông thông báo (NotificationBell, v-btn Vuetify) đặt qua slot trailing: cùng cỡ chạm + màu kế thừa. */
.m-header :deep(.v-btn) {
  min-width: var(--m-touch);
  min-height: var(--m-touch);
  color: inherit;
}
.m-header :deep(.v-btn:focus-visible) {
  outline: 3px solid var(--m-focus);
  outline-offset: 1px;
}
.m-header--brand :deep(.v-btn:focus-visible) {
  outline-color: var(--m-on-action);
}
</style>
