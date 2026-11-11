<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- Copyright (C) 2026 Nguyễn Tiến Lộc -->
<template>
  <nav class="m-tabbar" aria-label="Điều hướng chính">
    <ul class="m-tabbar__list" :style="{ gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))` }">
      <li v-for="item in items" :key="item.key" class="m-tabbar__cell">
        <a
          class="m-tab"
          :class="{ 'm-tab--active': item.key === activeKey, 'm-tab--prominent': item.prominent }"
          :href="hrefFor(item)"
          :aria-current="item.key === activeKey ? 'page' : undefined"
          :aria-label="ariaLabelFor(item)"
          @click="onClick($event, item)"
        >
          <span v-if="item.prominent" class="m-tab__fab" aria-hidden="true">
            <i class="mdi m-tab__icon m-tab__icon--fab" :class="item.icon" />
            <span v-if="badgeText(item)" class="m-tab__badge">{{ badgeText(item) }}</span>
          </span>
          <i v-else class="mdi m-tab__icon" :class="item.icon" aria-hidden="true" />
          <span class="m-tab__label">{{ item.label }}</span>
        </a>
      </li>
    </ul>
  </nav>
</template>

<script setup lang="ts">
import { inject } from 'vue';
import { routerKey } from 'vue-router';
import type { MobileTabBarEmits, MobileTabBarProps, MobileTabItem } from './types';

defineProps<MobileTabBarProps>();
const emit = defineEmits<MobileTabBarEmits>();

// Không dùng useRouter() để component vẫn mount được khi không có router (test/preview) mà không cảnh báo inject.
const router = inject(routerKey, null);

function hrefFor(item: MobileTabItem): string {
  if (!router) return '#';
  try {
    return router.resolve(item.to).href;
  } catch {
    return '#';
  }
}

function badgeText(item: MobileTabItem): string {
  if (typeof item.badge !== 'number' || item.badge <= 0) return '';
  return item.badge > 99 ? '99+' : String(item.badge);
}

function ariaLabelFor(item: MobileTabItem): string {
  return badgeText(item) && item.badgeLabel ? `${item.label}, ${item.badgeLabel}` : item.label;
}

function onClick(event: MouseEvent, item: MobileTabItem) {
  // Ctrl/Cmd/Shift-click, chuột giữa: để trình duyệt tự mở tab mới.
  if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
  event.preventDefault();
  emit('navigate', item.key);
}
</script>

<style scoped>
.m-tabbar {
  position: relative;
  flex: none;
  z-index: var(--m-z-nav);
  background: var(--m-surface);
  color: var(--m-muted);
  border-top: 1px solid var(--m-line);
  padding: 0 var(--m-safe-right) var(--m-safe-bottom) var(--m-safe-left); /* safe-bottom cộng đúng 1 lần, ở đây */
  font-family: var(--m-font-family);
}
.m-tabbar__list {
  display: grid;
  height: var(--m-tabbar);
  margin: 0;
  padding: 0 var(--m-space-1); /* pill mục đang chọn không chạm sát mép màn ở ô ngoài cùng */
  list-style: none;
}
.m-tabbar__cell {
  position: relative;
  min-width: 0;
}
.m-tab {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 2px;
  width: 100%;
  height: 100%;
  min-height: var(--m-touch);
  padding: 0 1px;
  border-radius: var(--m-radius-md);
  color: var(--m-muted);
  text-decoration: none;
  font-size: 12px;
  line-height: 1.2;
  font-weight: 600;
  touch-action: manipulation;
  -webkit-tap-highlight-color: var(--m-tap-highlight);
  transition: color 0.16s ease, background-color 0.16s ease;
}
/* 12px không vừa chữ "Khách hàng" ở 320px (đo: 64px > 60px khả dụng) -> màn <=359px dùng 11px. */
@media (max-width: 359px) {
  .m-tab {
    font-size: 11px;
  }
}
.m-tab__icon {
  font-size: 24px;
  line-height: 1;
}
.m-tab__label {
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.m-tab--active {
  color: var(--m-brand-strong);
  background: var(--m-brand-soft);
  font-weight: 700;
}
/* Chỉ báo phụ ngoài màu: vạch trên + nền pill. */
.m-tab::after {
  content: '';
  position: absolute;
  top: 0;
  left: 25%;
  right: 25%;
  height: 3px;
  border-radius: 0 0 3px 3px;
  background: var(--m-brand-strong);
  opacity: 0;
  transform: scaleX(0.4);
  transition: opacity 0.16s ease, transform 0.16s ease;
}
.m-tab--active::after {
  opacity: 1;
  transform: scaleX(1);
}
.m-tab--prominent::after {
  display: none;
}
.m-tab:focus-visible {
  outline: 3px solid var(--m-focus);
  outline-offset: -3px;
}

/* Nút Hội thoại nổi giữa */
.m-tab--prominent,
.m-tab--prominent.m-tab--active {
  background: transparent;
  overflow: visible;
}
/* Chỗ giữ cho icon (24px) để nhãn nằm cùng baseline với nhãn các tab khác; nút tròn là absolute nên không chiếm chỗ. */
.m-tab--prominent::before {
  content: '';
  display: block;
  flex: none;
  height: 26px;
}
.m-tab--prominent.m-tab--active {
  color: var(--m-brand-strong);
}
.m-tab--prominent:focus-visible {
  outline: none;
}
.m-tab__fab {
  position: absolute;
  top: calc(-1 * var(--m-fab-lift));
  left: 50%;
  transform: translateX(-50%);
  display: grid;
  place-items: center;
  width: var(--m-fab-size);
  height: var(--m-fab-size);
  box-sizing: border-box;
  border-radius: 50%;
  border: 4px solid var(--m-surface);
  background: var(--m-brand);
  color: var(--m-on-action);
  /* Không active: giảm nhấn (bóng nhẹ, không vòng), kích thước/vị trí giữ nguyên. */
  box-shadow: var(--m-shadow-rest);
  transition: transform 0.15s ease, box-shadow 0.16s ease;
}
.m-tab__icon--fab {
  font-size: 26px;
}
.m-tab--prominent:active .m-tab__fab {
  transform: translateX(-50%) scale(0.94);
}
.m-tab--prominent.m-tab--active .m-tab__fab {
  box-shadow: 0 0 0 3px var(--m-brand-soft), var(--m-shadow);
}
.m-tab--prominent:focus-visible .m-tab__fab {
  outline: 3px solid var(--m-focus);
  outline-offset: 2px;
}
.m-tab__badge {
  position: absolute;
  top: -6px;
  right: -8px;
  min-width: 22px;
  height: 22px;
  padding: 0 5px;
  box-sizing: border-box;
  border-radius: 11px;
  border: 2px solid var(--m-surface);
  background: var(--m-danger);
  color: var(--m-on-danger);
  font-size: 12px;
  font-weight: 700;
  line-height: 18px;
  text-align: center;
}
@media (prefers-reduced-motion: reduce) {
  .m-tab,
  .m-tab::after,
  .m-tab__fab {
    transition: none;
  }
}
</style>
