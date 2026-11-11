<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- Copyright (C) 2026 Nguyễn Tiến Lộc -->
<!--
  Cấp 1 của Cài đặt mobile: danh sách menu toàn màn hình. Nhận groups ĐÃ LỌC QUYỀN từ useSettingsNav().visibleGroups
  (cùng nguồn + cùng thứ tự nhóm với sidebar desktop) và kết quả tìm kiếm (searchItems). Presenter: không đọc store, không điều hướng.
-->
<template>
  <nav class="crm-sm" aria-label="Cài đặt">
    <div class="crm-sm__search">
      <i class="mdi mdi-magnify" aria-hidden="true" />
      <input :value="query" type="search" inputmode="search" autocomplete="off" placeholder="Tìm cài đặt" aria-label="Tìm cài đặt" @input="onInput" />
      <button v-if="query" type="button" class="crm-sm__clear" aria-label="Xóa nội dung tìm" @click="emit('update:query', '')"><i class="mdi mdi-close-circle" aria-hidden="true" /></button>
    </div>

    <template v-if="query.trim()">
      <ul v-if="results.length" class="crm-sm__list" aria-label="Kết quả tìm kiếm">
        <li v-for="item in results" :key="`sr-${item.route}`">
          <button type="button" class="crm-sm__row" @click="emit('select', item.route)">
            <i class="mdi crm-sm__ic" :class="item.icon" aria-hidden="true" />
            <span class="crm-sm__label">{{ item.label }}</span>
            <span v-if="item.comingSoon" class="crm-sm__soon">Sắp ra mắt</span>
            <i class="mdi mdi-chevron-right crm-sm__chev" aria-hidden="true" />
          </button>
        </li>
      </ul>
      <p v-else class="crm-sm__empty" role="status">Không tìm thấy "{{ query.trim() }}"</p>
    </template>

    <template v-else>
      <section v-for="g in groups" :key="g.id" class="crm-sm__group" :aria-labelledby="`crm-sm-g-${g.id}`">
        <h2 :id="`crm-sm-g-${g.id}`" class="crm-sm__gh"><i class="mdi" :class="g.icon" aria-hidden="true" />{{ g.label }}</h2>
        <ul class="crm-sm__list">
          <li v-for="item in g.items" :key="item.route">
            <button type="button" class="crm-sm__row" @click="emit('select', item.route)">
              <i class="mdi crm-sm__ic" :class="item.icon" aria-hidden="true" />
              <span class="crm-sm__label">{{ item.label }}</span>
              <span v-if="item.comingSoon" class="crm-sm__soon">Sắp ra mắt</span>
              <i class="mdi mdi-chevron-right crm-sm__chev" aria-hidden="true" />
            </button>
          </li>
        </ul>
      </section>
      <MobileFeedback v-if="!groups.length" state="forbidden" title="Chưa có mục cài đặt nào dành cho bạn" description="Liên hệ quản trị viên nếu bạn cần quyền truy cập." />
    </template>
  </nav>
</template>

<script setup lang="ts">
import MobileFeedback from '@/components/mobile/shell/MobileFeedback.vue';
import type { SettingsGroup, SettingsItem } from '@/composables/use-settings-nav';

defineProps<{ groups: SettingsGroup[]; query: string; results: SettingsItem[] }>();
const emit = defineEmits<{ select: [route: string]; 'update:query': [q: string] }>();

function onInput(e: Event) { emit('update:query', (e.target as HTMLInputElement).value); }
</script>

<style scoped>
.crm-sm { display: flex; flex-direction: column; gap: var(--m-space-4); padding: var(--m-space-3) var(--m-gutter) var(--m-space-8); }
.crm-sm__search { display: flex; align-items: center; gap: var(--m-space-2); min-height: 48px; padding: 0 var(--m-space-3); border: 1px solid var(--m-line); border-radius: var(--m-radius-md); background: var(--m-surface-inset); color: var(--m-muted); }
.crm-sm__search:focus-within { border-color: var(--m-focus); outline: 2px solid var(--m-focus); }
.crm-sm__search input { flex: 1; min-width: 0; height: 44px; border: 0; background: transparent; color: var(--m-text); font: inherit; font-size: 16px; outline: none; -webkit-appearance: none; appearance: none; }
.crm-sm__search input::placeholder { color: var(--m-muted); }
.crm-sm__clear { display: inline-grid; place-items: center; width: var(--m-touch); height: var(--m-touch); margin-right: -10px; border: 0; background: none; color: var(--m-muted); font-size: 20px; cursor: pointer; }
.crm-sm__gh { display: flex; align-items: center; gap: var(--m-space-2); margin: 0 0 var(--m-space-2) var(--m-space-1); font-size: var(--m-font-meta); font-weight: 700; color: var(--m-muted); }
.crm-sm__list { list-style: none; margin: 0; padding: 0; border: 1px solid var(--m-line); border-radius: var(--m-radius-card); background: var(--m-surface); overflow: hidden; }
.crm-sm__list > li + li { border-top: 1px solid var(--m-line); }
.crm-sm__row { display: flex; align-items: center; gap: var(--m-space-3); width: 100%; min-height: 56px; padding: 0 var(--m-space-3) 0 var(--m-space-4); border: 0; background: transparent; color: var(--m-text); font: inherit; text-align: left; cursor: pointer; touch-action: manipulation; -webkit-tap-highlight-color: var(--m-tap-highlight); }
.crm-sm__row:active { background: var(--m-surface-inset); }
.crm-sm__row:focus-visible, .crm-sm__clear:focus-visible { outline: 3px solid var(--m-focus); outline-offset: -3px; }
.crm-sm__ic { flex: none; font-size: 22px; color: var(--m-brand-strong); }
.crm-sm__label { flex: 1; min-width: 0; overflow-wrap: anywhere; font-weight: 600; }
.crm-sm__soon { flex: none; padding: 0 8px; border-radius: 999px; background: var(--m-surface-inset); color: var(--m-muted); font-size: 12px; font-weight: 650; }
.crm-sm__chev { flex: none; font-size: 22px; color: var(--m-muted); }
.crm-sm__empty { margin: 0; padding: var(--m-space-4); color: var(--m-muted); text-align: center; }
</style>
