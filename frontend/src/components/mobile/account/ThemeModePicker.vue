<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- Copyright (C) 2026 Nguyễn Tiến Lộc -->
<template>
  <fieldset class="m-theme">
    <legend class="m-theme__legend">Giao diện</legend>
    <div class="m-theme__options">
      <label
        v-for="option in OPTIONS"
        :key="option.value"
        class="m-theme__option"
        :class="{ 'm-theme__option--on': modelValue === option.value }"
      >
        <input
          class="m-theme__input"
          type="radio"
          name="m-theme-mode"
          :value="option.value"
          :checked="modelValue === option.value"
          @change="emit('update:modelValue', option.value)"
        />
        <i class="mdi m-theme__icon" :class="option.icon" aria-hidden="true" />
        <span class="m-theme__label">{{ option.label }}</span>
        <i v-if="modelValue === option.value" class="mdi mdi-check m-theme__check" aria-hidden="true" />
      </label>
    </div>
  </fieldset>
</template>

<script setup lang="ts">
import type { ThemePreference } from '@/stores/ui-theme';

defineProps<{ modelValue: ThemePreference }>();
const emit = defineEmits<{ 'update:modelValue': [value: ThemePreference] }>();

const OPTIONS: Array<{ value: ThemePreference; label: string; icon: string }> = [
  { value: 'light', label: 'Sáng', icon: 'mdi-white-balance-sunny' },
  { value: 'dark', label: 'Tối', icon: 'mdi-weather-night' },
  { value: 'system', label: 'Theo máy', icon: 'mdi-cellphone' },
];
</script>

<style scoped>
.m-theme {
  min-width: 0;
  margin: 0;
  padding: 0;
  border: 0;
}
.m-theme__legend {
  padding: 0;
  margin-bottom: var(--m-space-2);
  margin-left: var(--m-space-1);
  font-size: var(--m-font-meta);
  font-weight: 700;
  letter-spacing: 0.4px;
  text-transform: uppercase;
  color: var(--m-muted);
}
.m-theme__options {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: var(--m-space-2);
}
.m-theme__option {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: var(--m-space-1);
  min-height: 64px;
  padding: var(--m-space-2) var(--m-space-1);
  border: 1px solid var(--m-line);
  border-radius: var(--m-radius-md);
  background: var(--m-surface);
  color: var(--m-text);
  font-size: 14px;
  text-align: center;
  cursor: pointer;
  touch-action: manipulation;
  -webkit-tap-highlight-color: var(--m-tap-highlight);
}
/* Trạng thái chọn: viền dày + chữ đậm + dấu tích (không chỉ dựa vào màu). */
.m-theme__option--on {
  border: 2px solid var(--m-brand-strong);
  background: var(--m-brand-soft);
  color: var(--m-brand-strong);
  font-weight: 700;
}
.m-theme__option:focus-within {
  outline: 3px solid var(--m-focus);
  outline-offset: 2px;
}
.m-theme__input {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  margin: 0;
  opacity: 0;
  cursor: pointer;
}
.m-theme__icon {
  font-size: 22px;
  line-height: 1;
}
.m-theme__label {
  min-width: 0;
  overflow-wrap: anywhere;
}
.m-theme__check {
  position: absolute;
  top: 4px;
  right: 4px;
  font-size: 16px;
  line-height: 1;
}
</style>
