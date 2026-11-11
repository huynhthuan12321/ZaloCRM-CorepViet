<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- Copyright (C) 2026 Nguyễn Tiến Lộc -->
<!--
  Chọn hội thoại nhận khi gửi từ trang /media. Mỗi dòng luôn hiện TÊN KHÁCH + NICK + người phụ trách (signature).
  Dòng không gửi được bị khóa và nói rõ lý do bằng chữ. Chọn xong phát `select` một snapshot MediaTarget.
-->
<script setup lang="ts">
import { watch } from 'vue';
import MobileSheet from '@/components/mobile/shell/MobileSheet.vue';
import MobileFeedback from '@/components/mobile/shell/MobileFeedback.vue';
import { useMobileMediaTargets, type MediaTargetRow } from '@/composables/mobile-media/use-mobile-media-targets';
import type { MediaTarget } from './media-model';

const props = defineProps<{ open: boolean }>();
const emit = defineEmits<{ 'update:open': [open: boolean]; select: [target: MediaTarget] }>();

const targets = useMobileMediaTargets();
watch(() => props.open, (isOpen) => { if (isOpen) void targets.load(); }, { immediate: true });

function pick(row: MediaTargetRow) {
  if (row.lockReason) return;
  const { ownerText: _ownerText, ...target } = row;
  emit('select', { ...target });
  emit('update:open', false);
}
</script>

<template>
  <MobileSheet :open="open" title="Gửi tới khách nào?" full-height @update:open="emit('update:open', $event)">
    <div class="m-mts">
      <label class="m-mts__search">
        <i class="mdi mdi-magnify" aria-hidden="true" />
        <input v-model="targets.query.value" type="search" inputmode="search" enterkeyhint="search" placeholder="Tìm tên khách, số điện thoại" aria-label="Tìm hội thoại" autocomplete="off" />
      </label>

      <MobileFeedback v-if="targets.state.value === 'loading' || targets.state.value === 'idle'" state="loading" title="Đang tải hội thoại" />
      <MobileFeedback v-else-if="targets.state.value === 'error'" state="error" title="Không tải được hội thoại" retryable @retry="targets.load()" />
      <MobileFeedback v-else-if="targets.state.value === 'empty'" state="empty" title="Không có hội thoại phù hợp" description="Thử từ khóa khác hoặc mở hội thoại từ mục Hội thoại." />
      <ul v-else class="m-mts__list" role="list">
        <li v-for="row in targets.rows.value" :key="row.convId">
          <button type="button" class="m-mts__row" :disabled="!!row.lockReason" :aria-describedby="row.lockReason ? `m-mts-lock-${row.convId}` : undefined" @click="pick(row)">
            <span class="m-mts__main">
              <strong class="m-mts__name">{{ row.customerName }}</strong>
              <span class="m-mts__sub"><i class="mdi mdi-cellphone-link" aria-hidden="true" />Nick {{ row.nickName }}</span>
              <span class="m-mts__sub m-mts__sub--owner"><i class="mdi mdi-account-outline" aria-hidden="true" />{{ row.ownerText }}</span>
              <span v-if="row.lockReason" :id="`m-mts-lock-${row.convId}`" class="m-mts__lock"><i class="mdi mdi-lock-outline" aria-hidden="true" />{{ row.lockReason }}</span>
            </span>
            <i v-if="!row.lockReason" class="mdi mdi-chevron-right" aria-hidden="true" />
          </button>
        </li>
        <li v-if="targets.loadingMore.value" class="m-mts__more" role="status">Đang tải thêm…</li>
        <li v-else-if="targets.hasMore.value" class="m-mts__morewrap">
          <button type="button" class="m-mts__loadmore" data-action="load-more" @click="targets.loadMore()">{{ targets.moreError.value ? 'Không tải thêm được, thử lại' : `Tải thêm (${targets.rows.value.length}/${targets.total.value})` }}</button>
        </li>
      </ul>
    </div>
  </MobileSheet>
</template>

<style scoped>
.m-mts { display: flex; flex-direction: column; gap: var(--m-space-3); padding: var(--m-space-2) var(--m-space-3) var(--m-space-4); }
.m-mts__search { display: flex; align-items: center; gap: var(--m-space-2); min-height: var(--m-touch); padding: 0 var(--m-space-3); border: 1px solid var(--m-line); border-radius: var(--m-radius-md); background: var(--m-surface); color: var(--m-muted); }
.m-mts__search input { flex: 1; min-width: 0; border: 0; outline: 0; background: transparent; color: var(--m-text); font: inherit; font-size: 16px; }
.m-mts__search:focus-within { outline: 3px solid var(--m-focus); outline-offset: 1px; }
.m-mts__list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: var(--m-space-1); }
.m-mts__row { display: flex; align-items: center; gap: var(--m-space-3); width: 100%; min-height: 64px; padding: var(--m-space-2) var(--m-space-3); border: 1px solid var(--m-line); border-radius: var(--m-radius-md); background: var(--m-surface); color: var(--m-text); font: inherit; text-align: left; cursor: pointer; touch-action: manipulation; }
.m-mts__row:disabled { cursor: default; background: var(--m-surface-inset); }
.m-mts__row:focus-visible { outline: 3px solid var(--m-focus); outline-offset: 2px; }
.m-mts__main { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
.m-mts__name { overflow-wrap: anywhere; }
.m-mts__sub { display: inline-flex; align-items: center; gap: 4px; font-size: var(--m-font-meta); color: var(--m-muted); overflow-wrap: anywhere; }
.m-mts__sub--owner { color: var(--m-text); }
.m-mts__lock { display: inline-flex; align-items: flex-start; gap: 4px; margin-top: 2px; font-size: var(--m-font-meta); font-weight: 600; color: var(--m-warning); }
.m-mts__more { text-align: center; font-size: var(--m-font-meta); color: var(--m-muted); padding: var(--m-space-2); }
.m-mts__morewrap { display: flex; justify-content: center; }
.m-mts__loadmore { min-height: var(--m-touch); padding: 0 var(--m-space-4); border: 1px solid var(--m-line); border-radius: var(--m-radius-md); background: var(--m-surface); color: var(--m-brand-strong); font: inherit; font-weight: 650; cursor: pointer; touch-action: manipulation; }
.m-mts__loadmore:focus-visible { outline: 3px solid var(--m-focus); outline-offset: 2px; }
.m-mts .mdi-chevron-right { color: var(--m-muted); font-size: 22px; }
</style>
