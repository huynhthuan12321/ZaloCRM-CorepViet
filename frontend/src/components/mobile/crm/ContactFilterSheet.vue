<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- Copyright (C) 2026 Nguyễn Tiến Lộc -->
<!--
  Bộ lọc khách hàng dạng bottom sheet HAI PHA (CONTRACT-A / PARITY §6): chọn nháp -> "Áp dụng" mới đổi danh sách;
  "Xóa lọc" đưa nháp về rỗng và áp ngay. Pha 1 chỉ gồm trạng thái + nguồn + người phụ trách; lọc nâng cao khác hoãn.
-->
<template>
  <MobileSheet :open="open" title="Lọc khách hàng" :dirty="false" @update:open="emit('update:open', $event)">
    <div class="crm-filter">
      <section class="crm-filter__group" aria-labelledby="crm-f-status">
        <h3 id="crm-f-status" class="crm-filter__label">Trạng thái</h3>
        <div class="crm-filter__chips" role="radiogroup" aria-labelledby="crm-f-status">
          <button
            v-for="o in statusOptions" :key="o.value" type="button" role="radio"
            class="crm-chip" :class="{ 'crm-chip--on': draft.status === o.value }" :aria-checked="draft.status === o.value"
            @click="draft.status = o.value"
          >{{ o.text }}</button>
        </div>
      </section>

      <section class="crm-filter__group" aria-labelledby="crm-f-source">
        <h3 id="crm-f-source" class="crm-filter__label">Nguồn</h3>
        <div class="crm-filter__chips" role="radiogroup" aria-labelledby="crm-f-source">
          <button
            v-for="o in sourceOptions" :key="o.value" type="button" role="radio"
            class="crm-chip" :class="{ 'crm-chip--on': draft.source === o.value }" :aria-checked="draft.source === o.value"
            @click="draft.source = o.value"
          >{{ o.text }}</button>
        </div>
      </section>

      <section class="crm-filter__group">
        <label class="crm-filter__label" for="crm-f-owner">Người phụ trách</label>
        <select id="crm-f-owner" v-model="draft.assignedUserId" class="crm-filter__select" :disabled="usersState === 'loading'">
          <option value="">Tất cả</option>
          <option v-for="u in users" :key="u.id" :value="u.id">{{ u.fullName }}</option>
        </select>
        <p v-if="usersState === 'loading'" class="crm-filter__hint" role="status">Đang tải danh sách nhân viên…</p>
        <p v-else-if="usersState === 'error'" class="crm-filter__hint crm-filter__hint--err" role="alert">
          Không tải được danh sách nhân viên.
          <button type="button" class="crm-filter__link" @click="emit('retryUsers')">Thử lại</button>
        </p>
      </section>
    </div>
    <template #footer>
      <div class="crm-filter__footer">
        <button type="button" class="crm-btn" @click="onClear">Xóa lọc</button>
        <button type="button" class="crm-btn crm-btn--primary" @click="onApply">
          Áp dụng<template v-if="draftCount > 0"> ({{ draftCount }})</template>
        </button>
      </div>
    </template>
  </MobileSheet>
</template>

<script setup lang="ts">
import { computed, reactive, watch } from 'vue';
import MobileSheet from '@/components/mobile/shell/MobileSheet.vue';
import { STATUS_OPTIONS } from '@/composables/use-contacts';
import { MOBILE_SOURCE_OPTIONS, countActiveFilters } from './crm-model';

export interface ContactFilterValue { status: string; source: string; assignedUserId: string }

const props = withDefaults(defineProps<{
  open: boolean;
  value: ContactFilterValue;
  users?: Array<{ id: string; fullName: string }>;
  usersState?: 'ready' | 'loading' | 'error';
}>(), { users: () => [], usersState: 'ready' });
const emit = defineEmits<{
  'update:open': [v: boolean];
  apply: [v: ContactFilterValue];
  clear: [];
  retryUsers: [];
}>();

const statusOptions = [{ text: 'Tất cả', value: '' }, ...STATUS_OPTIONS];
const sourceOptions = [{ text: 'Tất cả', value: '' }, ...MOBILE_SOURCE_OPTIONS];

const draft = reactive<ContactFilterValue>({ status: '', source: '', assignedUserId: '' });
// Mỗi lần mở sheet: nháp = giá trị đang áp dụng (đóng không Áp dụng thì bỏ nháp).
watch(() => props.open, (o) => { if (o) Object.assign(draft, props.value); }, { immediate: true });
const draftCount = computed(() => countActiveFilters(draft));

function onApply() { emit('apply', { ...draft }); emit('update:open', false); }
function onClear() {
  Object.assign(draft, { status: '', source: '', assignedUserId: '' });
  emit('clear');
  emit('update:open', false);
}
</script>

<style scoped>
.crm-filter { display: flex; flex-direction: column; gap: var(--m-space-5); padding: var(--m-space-2) var(--m-space-5) var(--m-space-4); }
.crm-filter__label { margin: 0 0 var(--m-space-2); font-size: var(--m-font-meta); font-weight: 650; color: var(--m-muted); text-transform: none; display: block; }
.crm-filter__chips { display: flex; flex-wrap: wrap; gap: var(--m-space-2); }
.crm-chip {
  min-height: var(--m-touch); padding: 0 var(--m-space-4); border: 1px solid var(--m-line); border-radius: 999px;
  background: var(--m-surface); color: var(--m-text); font: inherit; font-weight: 600; cursor: pointer; touch-action: manipulation;
}
.crm-chip--on { background: var(--m-brand-strong); border-color: var(--m-brand-strong); color: var(--m-on-action); }
.crm-chip:focus-visible, .crm-btn:focus-visible, .crm-filter__select:focus-visible { outline: 3px solid var(--m-focus); outline-offset: 2px; }
.crm-filter__select {
  width: 100%; min-height: var(--m-touch); padding: 0 var(--m-space-3); border: 1px solid var(--m-line); border-radius: var(--m-radius-md);
  background: var(--m-surface-inset); color: var(--m-text); font: inherit; font-size: 16px;
}
.crm-filter__hint { margin: var(--m-space-2) 0 0; font-size: var(--m-font-meta); color: var(--m-muted); }
.crm-filter__hint--err { color: var(--m-danger); }
.crm-filter__link { min-height: var(--m-touch); padding: 0 var(--m-space-2); border: 0; background: none; color: var(--m-brand-strong); font: inherit; font-weight: 650; text-decoration: underline; cursor: pointer; }
.crm-filter__footer { display: flex; gap: var(--m-space-3); padding: var(--m-space-3) var(--m-space-5); }
.crm-btn {
  flex: 1; min-height: 48px; border: 1px solid var(--m-line); border-radius: var(--m-radius-md); background: var(--m-surface);
  color: var(--m-text); font: inherit; font-weight: 650; cursor: pointer; touch-action: manipulation;
}
.crm-btn--primary { border-color: transparent; background: var(--m-brand-strong); color: var(--m-on-action); }
</style>
