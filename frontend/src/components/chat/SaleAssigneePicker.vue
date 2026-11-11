<script setup lang="ts">
import { computed, shallowRef } from 'vue';
import type { InboxSaleOption } from '@/composables/use-inbox-sales';

const props = withDefaults(defineProps<{
  modelValue: string | null;
  users: InboxSaleOption[];
  currentUserName?: string;
  currentUserId?: string;
  loading?: boolean;
  error?: string;
  mobile?: boolean;
}>(), { currentUserName: 'Tôi', loading: false, error: '', mobile: false });
const emit = defineEmits<{ 'update:modelValue': [value: string | null] }>();
const search = shallowRef('');
const matching = computed(() => {
  const normalize = (text: string) => text.normalize('NFD').replace(/\p{Diacritic}/gu, '').replace(/đ/gi, 'd').toLocaleLowerCase('vi');
  const query = normalize(search.value.trim());
  return props.users.filter(user => normalize(user.fullName).includes(query));
});
const presets = computed(() => [
  { id: props.currentUserId ?? null, label: `Tôi (${props.currentUserName})` },
  { id: 'all', label: props.mobile ? 'Tất cả' : 'Tất cả sale' },
  { id: 'unassigned', label: props.mobile ? 'Chưa giao' : 'Chưa giao sale' },
]);
</script>

<template>
  <div class="sale-picker" :class="{ 'sale-picker--mobile': mobile }">
    <button v-for="preset in presets" :key="preset.id ?? 'self'" type="button"
      class="sale-picker__option" :aria-pressed="modelValue === preset.id || (modelValue === null && preset.id === currentUserId)"
      @click="emit('update:modelValue', preset.id)">{{ preset.label }}</button>
    <input v-model="search" type="search" class="sale-picker__search"
      placeholder="Tìm nhân viên..." aria-label="Tìm nhân viên" autocomplete="off" />
    <p v-if="loading" role="status">Đang tải nhân viên…</p>
    <p v-else-if="error" role="alert">{{ error }}</p>
    <div v-else class="sale-picker__list" aria-label="Nhân viên trong phạm vi quyền">
      <button v-for="user in matching" :key="user.id" type="button"
        class="sale-picker__option" :aria-pressed="modelValue === user.id"
        @click="emit('update:modelValue', user.id)">{{ user.fullName }}</button>
      <p v-if="matching.length === 0">Không có nhân viên phù hợp.</p>
    </div>
  </div>
</template>

<style scoped>
.sale-picker__option { display: block; width: 100%; padding: 7px 8px; border: 0; border-radius: 4px; text-align: left; background: transparent; color: inherit; font: inherit; font-size: 12.5px; cursor: pointer; }
.sale-picker__option:hover { background: #f4f4f7; }
.sale-picker__option[aria-pressed="true"] { color: #5e6ad2; background: #eef0ff; font-weight: 600; }
.sale-picker__search { width: 100%; box-sizing: border-box; margin: 8px 0; padding: 8px; border: 1px solid #d4d6db; border-radius: 6px; font: inherit; font-size: 13px; }
.sale-picker__list { max-height: 240px; overflow-y: auto; }
.sale-picker p { font-size: 12px; }
.sale-picker--mobile .sale-picker__option { min-height: var(--m-touch); font-size: var(--m-font-body); }
.sale-picker--mobile .sale-picker__search { min-height: var(--m-touch); font-size: 16px; }
.sale-picker__option:focus-visible, .sale-picker__search:focus-visible { outline: 2px solid #5e6ad2; outline-offset: 2px; }
</style>
