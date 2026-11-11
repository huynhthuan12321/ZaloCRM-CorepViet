<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- Copyright (C) 2026 Nguyễn Tiến Lộc -->
<script setup lang="ts">
/**
 * Danh sách CHỈ-ĐỌC dùng chung cho Bạn bè / Nhóm / Marketing (mobile). Nhận một `list` từ useMobileReadList và hiện đủ trạng thái
 * đang tải / rỗng / lỗi / offline / không quyền / còn trang sau. Không có thao tác ghi. Dòng có `to` là liên kết, `clickable` là nút.
 */
import { RouterLink } from 'vue-router';
import MobileFeedback from '@/components/mobile/shell/MobileFeedback.vue';
import type { ReadList, ReadRow } from '@/composables/mobile-tools/use-mobile-read-list';

withDefaults(defineProps<{
  list: ReadList;
  searchPlaceholder?: string;
  /** Ẩn ô tìm (vd danh sách ngắn). */
  noSearch?: boolean;
  emptyTitle?: string;
  emptyHint?: string;
  clickable?: boolean;
  label: string;
}>(), { searchPlaceholder: 'Tìm kiếm', noSearch: false, emptyTitle: 'Chưa có dữ liệu', emptyHint: '', clickable: false });
const emit = defineEmits<{ open: [row: ReadRow] }>();
</script>

<template>
  <section class="m-trl" :aria-label="label">
    <label v-if="!noSearch" class="m-trl__search">
      <i class="mdi mdi-magnify" aria-hidden="true" />
      <input v-model="list.search.value" type="search" inputmode="search" enterkeyhint="search" :placeholder="searchPlaceholder" :aria-label="searchPlaceholder" autocomplete="off" />
    </label>

    <MobileFeedback v-if="list.state.value === 'loading' || list.state.value === 'idle'" state="loading" :title="`Đang tải ${label.toLowerCase()}`" />
    <MobileFeedback v-else-if="list.state.value === 'offline'" state="offline" :description="list.errorMessage.value" retryable @retry="list.reload()" />
    <MobileFeedback v-else-if="list.state.value === 'forbidden'" state="forbidden" :description="list.errorMessage.value" />
    <MobileFeedback v-else-if="list.state.value === 'error'" state="error" :title="`Không tải được ${label.toLowerCase()}`" :description="list.errorMessage.value" retryable @retry="list.reload()" />
    <MobileFeedback v-else-if="list.state.value === 'empty' || list.isEmpty.value" state="empty" :title="list.filtered.value ? 'Không có mục phù hợp' : emptyTitle" :description="list.filtered.value ? 'Thử từ khóa khác.' : emptyHint" />
    <template v-else>
      <ul class="m-trl__list" role="list">
        <li v-for="row in list.rows.value" :key="row.id" class="m-trl__item">
          <component
            :is="row.to ? RouterLink : clickable ? 'button' : 'div'"
            v-bind="row.to ? { to: row.to } : clickable ? { type: 'button' } : {}"
            class="m-trl__row"
            :class="{ 'm-trl__row--act': !!row.to || clickable }"
            data-row
            @click="clickable && !row.to ? emit('open', row) : undefined"
          >
            <span class="m-trl__main">
              <strong class="m-trl__title">{{ row.title }}</strong>
              <span v-if="row.subtitle" class="m-trl__sub">{{ row.subtitle }}</span>
              <span v-if="row.meta?.length" class="m-trl__meta">{{ row.meta.join(' · ') }}</span>
            </span>
            <span v-if="row.badge" class="m-trl__badge" :class="`m-trl__badge--${row.badge.tone}`">{{ row.badge.text }}</span>
            <i v-if="row.to || clickable" class="mdi mdi-chevron-right m-trl__chev" aria-hidden="true" />
          </component>
        </li>
      </ul>
      <p v-if="list.loadingMore.value" class="m-trl__more" role="status">Đang tải thêm…</p>
      <button v-else-if="list.hasMore.value" type="button" class="m-trl__loadmore" data-action="load-more" @click="list.loadMore()">
        {{ list.moreError.value ? 'Không tải thêm được, thử lại' : `Tải thêm (${list.rows.value.length}/${list.total.value})` }}
      </button>
      <p v-else class="m-trl__end">Đã hiện {{ list.rows.value.length }} mục.</p>
    </template>
  </section>
</template>

<style scoped>
.m-trl { display: flex; flex-direction: column; gap: var(--m-space-3); min-width: 0; color: var(--m-text); font-family: var(--m-font-family); font-size: var(--m-font-body); }
.m-trl__search { display: flex; align-items: center; gap: var(--m-space-2); min-height: var(--m-touch); padding: 0 var(--m-space-3); border: 1px solid var(--m-line); border-radius: var(--m-radius-md); background: var(--m-surface); color: var(--m-muted); }
.m-trl__search input { flex: 1; min-width: 0; border: 0; outline: 0; background: transparent; color: var(--m-text); font: inherit; font-size: 16px; }
.m-trl__search:focus-within { outline: 3px solid var(--m-focus); outline-offset: 1px; }
.m-trl__list { list-style: none; margin: 0; padding: 0; overflow: hidden; border: 1px solid var(--m-line); border-radius: var(--m-radius-card); background: var(--m-surface); }
.m-trl__item + .m-trl__item { border-top: 1px solid var(--m-line); }
.m-trl__row { display: flex; align-items: center; gap: var(--m-space-3); width: 100%; min-height: 56px; padding: var(--m-space-3) var(--m-space-4); border: 0; background: transparent; color: inherit; font: inherit; text-align: left; text-decoration: none; }
.m-trl__row--act { cursor: pointer; touch-action: manipulation; }
.m-trl__row--act:focus-visible { outline: 3px solid var(--m-focus); outline-offset: -3px; }
.m-trl__main { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
.m-trl__title { overflow-wrap: anywhere; }
.m-trl__sub { font-size: var(--m-font-meta); color: var(--m-text); overflow-wrap: anywhere; }
.m-trl__meta { font-size: var(--m-font-meta); color: var(--m-muted); line-height: 1.4; overflow-wrap: anywhere; }
.m-trl__badge { flex: none; padding: 2px 8px; border-radius: 12px; font-size: 12px; font-weight: 650; background: var(--m-surface-inset); color: var(--m-muted); }
.m-trl__badge--ok { background: var(--m-brand-soft); color: var(--m-success); }
.m-trl__badge--warn { background: var(--m-warning-soft); color: var(--m-warning); }
.m-trl__badge--danger { color: var(--m-danger); }
.m-trl__chev { flex: none; font-size: 22px; color: var(--m-muted); }
.m-trl__more, .m-trl__end { margin: 0; text-align: center; font-size: var(--m-font-meta); color: var(--m-muted); }
.m-trl__loadmore { align-self: center; min-height: var(--m-touch); padding: 0 var(--m-space-4); border: 1px solid var(--m-line); border-radius: var(--m-radius-md); background: var(--m-surface); color: var(--m-brand-strong); font: inherit; font-weight: 650; cursor: pointer; touch-action: manipulation; }
.m-trl__loadmore:focus-visible { outline: 3px solid var(--m-focus); outline-offset: 2px; }
</style>
