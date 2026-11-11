<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- Copyright (C) 2026 Nguyễn Tiến Lộc -->
<!-- Chọn phạm vi xem ("Tôi" / cấp dưới) thay cho dropdown "Tôi (...)" desktop. Chỉ hiện với quản lý (canSwitchScope). Presenter thuần. -->
<template>
  <MobileSheet :open="open" title="Xem số liệu của" @update:open="emit('update:open', $event)">
    <div class="crm-sc">
      <div class="crm-sc__search">
        <i class="mdi mdi-magnify" aria-hidden="true" />
        <input v-model="q" type="search" autocomplete="off" placeholder="Tìm nhân viên" aria-label="Tìm nhân viên" />
      </div>
      <p class="crm-sc__group">Của tôi</p>
      <button type="button" class="crm-sc__row" :class="{ 'crm-sc__row--on': !currentUserId }" :aria-pressed="!currentUserId" @click="pick(null)">
        <span>{{ selfName }}</span><i v-if="!currentUserId" class="mdi mdi-check" aria-hidden="true" />
      </button>
      <p v-if="filtered.length" class="crm-sc__group">Cấp dưới</p>
      <button v-for="u in filtered" :key="u.id" type="button" class="crm-sc__row" :class="{ 'crm-sc__row--on': currentUserId === u.id }" :aria-pressed="currentUserId === u.id" @click="pick(u.id)">
        <span class="crm-sc__name">{{ u.fullName }}<small v-if="u.departmentName">{{ u.departmentName }}</small></span>
        <i v-if="currentUserId === u.id" class="mdi mdi-check" aria-hidden="true" />
      </button>
      <p v-if="q && !filtered.length" class="crm-sc__empty">Không tìm thấy "{{ q }}"</p>
    </div>
  </MobileSheet>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import MobileSheet from '@/components/mobile/shell/MobileSheet.vue';
import type { PickerUser } from '@/composables/use-dashboard-action-hub';

const props = defineProps<{ open: boolean; users: PickerUser[]; currentUserId: string | null; selfName: string }>();
const emit = defineEmits<{ 'update:open': [v: boolean]; select: [userId: string | null] }>();

const q = ref('');
watch(() => props.open, (o) => { if (o) q.value = ''; });
const filtered = computed(() => {
  const s = q.value.trim().toLowerCase();
  return props.users.filter(u => !u.isSelf).filter(u => !s || u.fullName.toLowerCase().includes(s));
});
function pick(id: string | null) { emit('select', id); emit('update:open', false); }
</script>

<style scoped>
.crm-sc { display: flex; flex-direction: column; gap: var(--m-space-1); padding: var(--m-space-1) var(--m-space-4) var(--m-space-4); }
.crm-sc__search { display: flex; align-items: center; gap: var(--m-space-2); min-height: 48px; padding: 0 var(--m-space-3); border: 1px solid var(--m-line); border-radius: var(--m-radius-md); background: var(--m-surface-inset); color: var(--m-muted); }
.crm-sc__search input { flex: 1; min-width: 0; height: 44px; border: 0; background: transparent; color: var(--m-text); font: inherit; font-size: 16px; outline: none; }
.crm-sc__group { margin: var(--m-space-3) 0 var(--m-space-1); font-size: 12px; font-weight: 700; color: var(--m-muted); }
.crm-sc__row { display: flex; align-items: center; justify-content: space-between; gap: var(--m-space-2); width: 100%; min-height: 52px; padding: 0 var(--m-space-3); border: 1px solid transparent; border-radius: var(--m-radius-md); background: transparent; color: var(--m-text); font: inherit; text-align: left; cursor: pointer; }
.crm-sc__row--on { background: var(--m-brand-soft); color: var(--m-brand-strong); font-weight: 650; }
.crm-sc__name { display: flex; flex-direction: column; min-width: 0; overflow-wrap: anywhere; }
.crm-sc__name small { font-size: 12px; color: var(--m-muted); font-weight: 500; }
.crm-sc__row:focus-visible { outline: 3px solid var(--m-focus); outline-offset: 2px; }
.crm-sc__empty { margin: var(--m-space-3) 0 0; color: var(--m-muted); font-size: var(--m-font-meta); }
</style>
