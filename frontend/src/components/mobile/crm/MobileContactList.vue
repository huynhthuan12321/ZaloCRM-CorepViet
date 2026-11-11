<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- Copyright (C) 2026 Nguyễn Tiến Lộc -->
<!--
  Danh sách khách hàng mobile: tìm kiếm + nút Lọc (sheet hai pha ở view adapter) + thẻ + tải tiếp + FAB "Tạo khách".
  Presenter: không gọi API. FAB nằm TRÊN tabbar và nút Hội thoại nổi (useShellBottomInset), thay cho bottom:88px cố định.
-->
<template>
  <section class="crm-list" aria-label="Danh sách khách hàng">
    <div class="crm-list__bar">
      <div class="crm-list__search">
        <i class="mdi mdi-magnify" aria-hidden="true" />
        <input
          :value="text" type="search" inputmode="search" enterkeyhint="search" autocomplete="off"
          placeholder="Tìm tên hoặc số điện thoại" aria-label="Tìm khách hàng" @input="onInput"
        />
        <button v-if="text" type="button" class="crm-list__clear" aria-label="Xóa nội dung tìm" @click="setText('')">
          <i class="mdi mdi-close-circle" aria-hidden="true" />
        </button>
      </div>
      <button type="button" class="crm-list__filter" :class="{ 'crm-list__filter--on': activeCount > 0 }" :aria-label="filterLabel" @click="emit('openFilter')">
        <i class="mdi mdi-tune-variant" aria-hidden="true" />
        <span v-if="activeCount > 0" class="crm-list__filter-count" aria-hidden="true">{{ activeCount }}</span>
      </button>
    </div>

    <p v-if="state === 'ready' || contacts.length" class="crm-list__total" role="status">
      {{ total.toLocaleString('vi-VN') }} khách hàng<template v-if="activeCount > 0 || text"> phù hợp</template>
    </p>

    <div v-if="contacts.length && (state === 'error' || state === 'offline')" class="crm-list__banner" role="alert">
      <span>{{ state === 'offline' ? 'Đang mất kết nối, danh sách có thể chưa mới.' : 'Không cập nhật được danh sách.' }}</span>
      <button type="button" class="crm-list__link" @click="emit('retry')">Thử lại</button>
    </div>

    <MobileFeedback v-if="state === 'loading' && !contacts.length" state="loading" title="Đang tải khách hàng" />
    <MobileFeedback v-else-if="!contacts.length && (state === 'error' || state === 'offline')" :state="state" retryable @retry="emit('retry')" />
    <MobileFeedback
      v-else-if="!contacts.length"
      state="empty"
      :title="hasCriteria ? 'Không tìm thấy khách hàng' : 'Chưa có khách hàng'"
      :description="hasCriteria ? 'Thử đổi từ khóa hoặc bỏ bớt bộ lọc.' : 'Khách hàng mới sẽ xuất hiện ở đây.'"
      :clearable="hasCriteria"
      @clear-filters="onClearAll"
    />

    <ul v-else class="crm-list__items">
      <li v-for="c in contacts" :key="c.id">
        <ContactCard
          :contact="c"
          :status-label="contactStatusLabel(c)"
          :owner-name="contactOwner(c).name"
          :owner-extra="contactOwner(c).extra"
          :nick-count="contactNickCount(c)"
          @open-profile="emit('openProfile', $event)"
        />
      </li>
      <li v-if="hasMore" class="crm-list__more">
        <div ref="sentinel" class="crm-list__sentinel" aria-hidden="true" />
        <button type="button" class="crm-list__more-btn" :disabled="loadingMore" @click="emit('loadMore')">
          {{ loadingMore ? 'Đang tải thêm…' : 'Tải thêm khách hàng' }}
        </button>
      </li>
      <li v-else class="crm-list__end">Đã hiển thị hết danh sách</li>
    </ul>

    <button
      v-if="canCreate" type="button" class="crm-list__fab" :style="{ bottom: fabBottom }" aria-label="Thêm khách hàng" @click="emit('create')"
    >
      <i class="mdi mdi-plus" aria-hidden="true" />
    </button>
  </section>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import MobileFeedback from '@/components/mobile/shell/MobileFeedback.vue';
import { useShellBottomInset } from '@/composables/mobile-crm/use-shell-bottom-inset';
import ContactCard from './ContactCard.vue';
import { contactNickCount, contactOwner, contactStatusLabel, countActiveFilters } from './crm-model';
import type { MobileContactListEmits, MobileContactListProps } from './types';

const props = defineProps<MobileContactListProps>();
const emit = defineEmits<MobileContactListEmits & { openFilter: [] }>();

const fabBottom = useShellBottomInset();
const text = ref(props.filters.search ?? '');
watch(() => props.filters.search, (v) => { if ((v ?? '') !== text.value.trim()) text.value = v ?? ''; });

const activeCount = computed(() => countActiveFilters(props.filters));
const hasCriteria = computed(() => activeCount.value > 0 || !!text.value.trim());
const filterLabel = computed(() => (activeCount.value > 0 ? `Lọc khách hàng, đang bật ${activeCount.value} bộ lọc` : 'Lọc khách hàng'));

function setText(v: string) { text.value = v; emit('update:filters', { search: v }); }
function onInput(e: Event) { setText((e.target as HTMLInputElement).value); }
function onClearAll() { text.value = ''; emit('update:filters', { search: '', status: '', source: '', assignedUserId: '' }); }

// Tải tiếp tự động khi cuộn tới cuối; nút "Tải thêm" luôn có sẵn làm đường dự phòng (iOS cũ, trợ năng).
const sentinel = ref<HTMLElement | null>(null);
let io: IntersectionObserver | null = null;
function observe() {
  io?.disconnect();
  if (typeof IntersectionObserver === 'undefined' || !sentinel.value) return;
  io = new IntersectionObserver((entries) => {
    if (entries.some(e => e.isIntersecting) && props.hasMore && !props.loadingMore && props.state === 'ready') emit('loadMore');
  }, { rootMargin: '240px 0px' });
  io.observe(sentinel.value);
}
onMounted(observe);
watch(() => [props.hasMore, props.contacts.length], () => { void nextTick(observe); });
onBeforeUnmount(() => io?.disconnect());
</script>

<style scoped>
.crm-list { display: flex; flex-direction: column; gap: var(--m-space-3); padding: var(--m-space-3) var(--m-gutter) var(--m-space-8); }
.crm-list__bar { display: flex; gap: var(--m-space-2); }
.crm-list__search {
  flex: 1; min-width: 0; display: flex; align-items: center; gap: var(--m-space-2); min-height: 48px; padding: 0 var(--m-space-3);
  border: 1px solid var(--m-line); border-radius: var(--m-radius-md); background: var(--m-surface-inset); color: var(--m-muted);
}
.crm-list__search:focus-within { border-color: var(--m-focus); outline: 2px solid var(--m-focus); outline-offset: 0; }
.crm-list__search input {
  flex: 1; min-width: 0; height: 44px; border: 0; background: transparent; color: var(--m-text); font: inherit; font-size: 16px; outline: none;
  -webkit-appearance: none; appearance: none;
}
.crm-list__search input::placeholder { color: var(--m-muted); }
.crm-list__search .mdi { font-size: 20px; }
.crm-list__clear { display: inline-grid; place-items: center; width: var(--m-touch); height: var(--m-touch); margin-right: -10px; border: 0; background: none; color: var(--m-muted); font-size: 20px; cursor: pointer; }
.crm-list__filter {
  position: relative; flex: none; display: inline-grid; place-items: center; width: 48px; height: 48px; padding: 0;
  border: 1px solid var(--m-line); border-radius: var(--m-radius-md); background: var(--m-surface); color: var(--m-text); font-size: 22px; cursor: pointer; touch-action: manipulation;
}
.crm-list__filter--on { border-color: var(--m-brand-strong); color: var(--m-brand-strong); background: var(--m-brand-soft); }
.crm-list__filter-count {
  position: absolute; top: -6px; right: -6px; min-width: 20px; height: 20px; padding: 0 5px; border-radius: 999px;
  background: var(--m-brand-strong); color: var(--m-on-action); font-size: 12px; font-weight: 700; line-height: 20px; text-align: center;
}
.crm-list__filter:focus-visible, .crm-list__clear:focus-visible, .crm-list__fab:focus-visible, .crm-list__more-btn:focus-visible, .crm-list__link:focus-visible { outline: 3px solid var(--m-focus); outline-offset: 2px; }
.crm-list__total { margin: 0; font-size: var(--m-font-meta); color: var(--m-muted); font-variant-numeric: tabular-nums; }
.crm-list__banner {
  display: flex; align-items: center; justify-content: space-between; gap: var(--m-space-2); padding: var(--m-space-2) var(--m-space-3);
  border-radius: var(--m-radius-md); background: var(--m-warning-soft); color: var(--m-warning); font-size: var(--m-font-meta); font-weight: 600;
}
.crm-list__link { min-height: var(--m-touch); padding: 0 var(--m-space-2); border: 0; background: none; color: inherit; font: inherit; font-weight: 700; text-decoration: underline; cursor: pointer; }
.crm-list__items { list-style: none; margin: 0; padding: 0 0 calc(56px + var(--m-space-8)); display: flex; flex-direction: column; gap: var(--m-space-2); }
.crm-list__more { display: flex; flex-direction: column; align-items: stretch; }
.crm-list__sentinel { height: 1px; }
.crm-list__more-btn {
  min-height: 48px; border: 1px solid var(--m-line); border-radius: var(--m-radius-md); background: var(--m-surface); color: var(--m-brand-strong);
  font: inherit; font-weight: 650; cursor: pointer; touch-action: manipulation;
}
.crm-list__more-btn:disabled { opacity: 0.6; cursor: default; }
.crm-list__end { padding: var(--m-space-3); text-align: center; font-size: var(--m-font-meta); color: var(--m-muted); }
.crm-list__fab {
  position: fixed; right: max(var(--m-gutter), var(--m-safe-right)); z-index: 25; display: inline-grid; place-items: center; width: 56px; height: 56px; padding: 0;
  border: 0; border-radius: 50%; background: var(--m-brand-strong); color: var(--m-on-action); font-size: 28px; box-shadow: var(--m-shadow); cursor: pointer; touch-action: manipulation;
}
.crm-list__fab:active { transform: scale(0.97); }
</style>
