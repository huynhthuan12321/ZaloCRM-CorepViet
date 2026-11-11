<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- Copyright (C) 2026 Nguyễn Tiến Lộc -->
<template>
  <div class="m-menu">
    <section v-for="group in groups" :key="group.key" class="m-menu__group" :aria-labelledby="`m-menu-${group.key}`">
      <h2 :id="`m-menu-${group.key}`" class="m-menu__heading">{{ group.title }}</h2>
      <ul class="m-menu__list">
        <li v-for="item in group.items" :key="item.id">
          <button type="button" class="m-menu__row" :data-menu-id="item.id" @click="emit('select', item.id)">
            <i class="mdi m-menu__icon" :class="item.icon" aria-hidden="true" />
            <span class="m-menu__label">{{ item.label }}</span>
            <span v-if="item.unavailableNote" class="m-menu__note">{{ item.unavailableNote }}</span>
            <i class="mdi mdi-chevron-right m-menu__chevron" aria-hidden="true" />
          </button>
        </li>
      </ul>
    </section>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type { AccountMenuItem, AccountMenuListEmits, AccountMenuListProps } from './account-menu';

const props = defineProps<AccountMenuListProps>();
const emit = defineEmits<AccountMenuListEmits>();

const GROUP_TITLES: Record<AccountMenuItem['group'], string> = { personal: 'Cá nhân', work: 'Công việc', other: 'Khác' };

// Mục `visible: false` (đã lọc quyền ở adapter) không render; nhóm rỗng cũng ẩn nốt tiêu đề.
const groups = computed(() =>
  (['personal', 'work', 'other'] as const)
    .map(key => ({ key, title: GROUP_TITLES[key], items: props.items.filter(i => i.group === key && i.visible) }))
    .filter(g => g.items.length > 0),
);
</script>

<style scoped>
.m-menu {
  display: flex;
  flex-direction: column;
  gap: var(--m-space-5);
}
.m-menu__heading {
  margin: 0 0 var(--m-space-2) var(--m-space-1);
  font-size: var(--m-font-meta);
  font-weight: 700;
  letter-spacing: 0.4px;
  text-transform: uppercase;
  color: var(--m-muted);
}
.m-menu__list {
  margin: 0;
  padding: 0;
  list-style: none;
  overflow: hidden;
  border: 1px solid var(--m-line);
  border-radius: var(--m-radius-card);
  background: var(--m-surface);
}
.m-menu__list li + li {
  border-top: 1px solid var(--m-line);
}
.m-menu__row {
  display: flex;
  align-items: center;
  gap: var(--m-space-3);
  width: 100%;
  min-height: 52px;
  padding: var(--m-space-2) var(--m-space-4);
  border: 0;
  background: transparent;
  color: var(--m-text);
  font: inherit;
  font-size: var(--m-font-body);
  text-align: left;
  cursor: pointer;
  touch-action: manipulation;
  -webkit-tap-highlight-color: var(--m-tap-highlight);
}
.m-menu__row:focus-visible {
  outline: 3px solid var(--m-focus);
  outline-offset: -3px;
}
.m-menu__icon {
  flex: none;
  font-size: 22px;
  line-height: 1;
  color: var(--m-brand-strong);
}
.m-menu__label {
  flex: 1;
  min-width: 0;
  overflow-wrap: anywhere;
}
.m-menu__note {
  flex: none;
  font-size: var(--m-font-meta);
  color: var(--m-muted);
}
.m-menu__chevron {
  flex: none;
  font-size: 22px;
  line-height: 1;
  color: var(--m-muted);
}
</style>
