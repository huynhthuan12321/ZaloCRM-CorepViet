<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- Copyright (C) 2026 Nguyễn Tiến Lộc -->
<!--
  Lưới Kho media mobile. Chạm ô = xem; nút tròn góc ô (vùng chạm 44px) = chọn/bỏ chọn. Ô tài liệu hiện tên + cỡ tệp.
  Thuần trình bày: không gọi API. Số thứ tự trên ô chọn = thứ tự gửi.
-->
<script setup lang="ts">
import type { MediaAssetItem } from '@/api/media';
import { formatBytes, formatDuration } from './media-model';

const props = defineProps<{ items: MediaAssetItem[]; selectedIds: string[] }>();
const emit = defineEmits<{ open: [index: number]; toggle: [item: MediaAssetItem] }>();

const fileIcon = 'mdi-file-document-outline';
function order(id: string): number {
  return props.selectedIds.indexOf(id) + 1;
}
function open(index: number, event: MouseEvent) {
  // Safari không tự focus nút khi chạm/click: đặt rõ điểm quay về trước khi mở dialog.
  (event.currentTarget as HTMLButtonElement).focus({ preventScroll: true });
  emit('open', index);
}
</script>

<template>
  <ul class="m-mg" role="list">
    <li v-for="(item, index) in items" :key="item.id" class="m-mg__item" :class="{ 'm-mg__item--doc': item.kind === 'file' }">
      <button
        type="button"
        class="m-mg__cell"
        :class="{ 'm-mg__cell--on': order(item.id) > 0 }"
        :aria-label="`Xem ${item.name}`"
        @click="open(index, $event)"
      >
        <img v-if="item.kind !== 'file' && (item.thumbnailUrl || (item.kind === 'image' && item.url))" class="m-mg__img" :src="(item.thumbnailUrl || item.url) ?? ''" alt="" loading="lazy" decoding="async" />
        <span v-else class="m-mg__ph" aria-hidden="true"><i class="mdi" :class="item.kind === 'video' ? 'mdi-video-outline' : fileIcon" /></span>
        <span v-if="item.kind === 'video'" class="m-mg__badge"><i class="mdi mdi-play" aria-hidden="true" />{{ formatDuration(item.durationSec) || 'Video' }}</span>
        <span v-if="item.kind === 'file'" class="m-mg__doc">
          <span class="m-mg__name">{{ item.name }}</span>
          <span v-if="formatBytes(item.sizeBytes)" class="m-mg__size">{{ formatBytes(item.sizeBytes) }}</span>
        </span>
        <span v-if="item.visibility === 'private'" class="m-mg__lock" title="Riêng tư"><i class="mdi mdi-lock-outline" aria-hidden="true" /><span class="m-mg__sr">Riêng tư</span></span>
      </button>
      <button
        type="button"
        class="m-mg__pick"
        role="checkbox"
        :aria-checked="order(item.id) > 0"
        :aria-label="`Chọn ${item.name}`"
        @click="emit('toggle', item)"
      >
        <span class="m-mg__tick" :class="{ 'm-mg__tick--on': order(item.id) > 0 }">{{ order(item.id) > 0 ? order(item.id) : '' }}</span>
      </button>
    </li>
  </ul>
</template>

<style scoped>
.m-mg { list-style: none; margin: 0; padding: 0; display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: var(--m-space-1); }
@media (max-width: 359px) { .m-mg { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
@media (min-width: 560px) { .m-mg { grid-template-columns: repeat(4, minmax(0, 1fr)); } }
.m-mg__item { position: relative; aspect-ratio: 1; min-width: 0; }
.m-mg__cell {
  position: relative; display: block; width: 100%; height: 100%; padding: 0; overflow: hidden; border: 1px solid var(--m-line);
  border-radius: var(--m-radius-sm); background: var(--m-surface-inset); color: var(--m-text); font: inherit; cursor: pointer;
  touch-action: manipulation; -webkit-tap-highlight-color: var(--m-tap-highlight);
}
.m-mg__cell--on { outline: 3px solid var(--m-brand-strong); outline-offset: -3px; }
.m-mg__cell:focus-visible, .m-mg__pick:focus-visible { outline: 3px solid var(--m-focus); outline-offset: 2px; }
.m-mg__img { display: block; width: 100%; height: 100%; object-fit: cover; }
.m-mg__ph { display: flex; align-items: center; justify-content: center; width: 100%; height: 100%; font-size: 34px; color: var(--m-muted); }
.m-mg__item--doc .m-mg__ph { align-items: flex-start; padding-top: var(--m-space-3); height: 60%; }
.m-mg__badge {
  position: absolute; left: 4px; bottom: 4px; display: inline-flex; align-items: center; gap: 2px; padding: 1px 6px; border-radius: 10px;
  background: rgb(0 0 0 / .62); color: #fff; font-size: 11px; font-weight: 600; max-width: calc(100% - 8px);
}
.m-mg__doc { position: absolute; left: 0; right: 0; bottom: 0; display: flex; flex-direction: column; padding: 4px 6px; background: var(--m-surface); border-top: 1px solid var(--m-line); text-align: left; }
.m-mg__name { font-size: 12px; font-weight: 600; line-height: 1.25; display: -webkit-box; -webkit-line-clamp: 2; line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; overflow-wrap: anywhere; }
.m-mg__size { font-size: 11px; color: var(--m-muted); }
.m-mg__lock { position: absolute; left: 4px; top: 4px; display: inline-flex; width: 20px; height: 20px; align-items: center; justify-content: center; border-radius: 10px; background: var(--m-surface); color: var(--m-muted); font-size: 13px; }
.m-mg__sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }
/* Vùng chạm 44px phủ góc phải trên; hình tròn nhìn thấy nhỏ hơn để không che ảnh. */
.m-mg__pick { position: absolute; top: 0; right: 0; display: flex; align-items: flex-start; justify-content: flex-end; width: 44px; height: 44px; padding: 6px; border: 0; background: transparent; cursor: pointer; touch-action: manipulation; }
.m-mg__tick { display: inline-flex; align-items: center; justify-content: center; width: 24px; height: 24px; border: 2px solid #fff; border-radius: 12px; background: rgb(0 0 0 / .55); color: #fff; font-size: 12px; font-weight: 700; box-shadow: var(--m-shadow-rest); }
.m-mg__tick--on { background: var(--m-brand-strong); border-color: #fff; color: var(--m-on-action); }
</style>
