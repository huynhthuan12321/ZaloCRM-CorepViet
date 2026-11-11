<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- Copyright (C) 2026 Nguyễn Tiến Lộc -->
<!-- Lọc agenda hai pha: trạng thái + người phụ trách (Tôi / Tất cả / một nhân viên). Loại, nguồn, tuần/tháng: hoãn (PARITY §7). -->
<template>
  <MobileSheet :open="open" title="Lọc lịch hẹn" @update:open="emit('update:open', $event)">
    <div class="crm-af">
      <section aria-labelledby="crm-af-status">
        <h3 id="crm-af-status" class="crm-af__label">Trạng thái</h3>
        <div class="crm-af__chips" role="radiogroup" aria-labelledby="crm-af-status">
          <button
            v-for="m in STATUS_MODES" :key="m.value" type="button" role="radio" class="crm-chip"
            :class="{ 'crm-chip--on': draft.mode === m.value }" :aria-checked="draft.mode === m.value" @click="draft.mode = m.value"
          >{{ m.text }}</button>
        </div>
      </section>
      <section>
        <label class="crm-af__label" for="crm-af-owner">Người phụ trách</label>
        <select id="crm-af-owner" v-model="draft.assignee" class="crm-af__select">
          <option value="me">Của tôi</option>
          <option value="all">Tất cả mọi người</option>
          <option v-for="u in users" :key="u.id" :value="u.id">{{ u.fullName }}</option>
        </select>
      </section>
    </div>
    <template #footer>
      <div class="crm-af__footer">
        <button type="button" class="crm-btn" @click="onReset">Đặt lại</button>
        <button type="button" class="crm-btn crm-btn--primary" @click="onApply">Áp dụng</button>
      </div>
    </template>
  </MobileSheet>
</template>

<script setup lang="ts">
import { reactive, watch } from 'vue';
import MobileSheet from '@/components/mobile/shell/MobileSheet.vue';
import { STATUS_MODES, type StatusMode } from './agenda-model';

const props = defineProps<{ open: boolean; mode: StatusMode; assignee: string; users: Array<{ id: string; fullName: string }> }>();
const emit = defineEmits<{ 'update:open': [v: boolean]; apply: [v: { mode: StatusMode; assignee: string }] }>();

const draft = reactive<{ mode: StatusMode; assignee: string }>({ mode: 'open', assignee: 'me' });
watch(() => props.open, (o) => { if (o) { draft.mode = props.mode; draft.assignee = props.assignee; } }, { immediate: true });

function onApply() { emit('apply', { mode: draft.mode, assignee: draft.assignee }); emit('update:open', false); }
function onReset() { emit('apply', { mode: 'open', assignee: 'me' }); emit('update:open', false); }
</script>

<style scoped>
.crm-af { display: flex; flex-direction: column; gap: var(--m-space-5); padding: var(--m-space-2) var(--m-space-5) var(--m-space-4); }
.crm-af__label { display: block; margin: 0 0 var(--m-space-2); font-size: var(--m-font-meta); font-weight: 650; color: var(--m-muted); }
.crm-af__chips { display: flex; flex-wrap: wrap; gap: var(--m-space-2); }
.crm-chip { min-height: var(--m-touch); padding: 0 var(--m-space-4); border: 1px solid var(--m-line); border-radius: 999px; background: var(--m-surface); color: var(--m-text); font: inherit; font-weight: 600; cursor: pointer; touch-action: manipulation; }
.crm-chip--on { background: var(--m-brand-strong); border-color: var(--m-brand-strong); color: var(--m-on-action); }
.crm-af__select { width: 100%; min-height: var(--m-touch); padding: 0 var(--m-space-3); border: 1px solid var(--m-line); border-radius: var(--m-radius-md); background: var(--m-surface-inset); color: var(--m-text); font: inherit; font-size: 16px; }
.crm-chip:focus-visible, .crm-btn:focus-visible, .crm-af__select:focus-visible { outline: 3px solid var(--m-focus); outline-offset: 2px; }
.crm-af__footer { display: flex; gap: var(--m-space-3); padding: var(--m-space-3) var(--m-space-5); }
.crm-btn { flex: 1; min-height: 48px; border: 1px solid var(--m-line); border-radius: var(--m-radius-md); background: var(--m-surface); color: var(--m-text); font: inherit; font-weight: 650; cursor: pointer; }
.crm-btn--primary { border-color: transparent; background: var(--m-brand-strong); color: var(--m-on-action); }
</style>
