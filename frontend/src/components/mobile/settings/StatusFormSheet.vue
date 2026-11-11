<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- Copyright (C) 2026 Nguyễn Tiến Lộc -->
<!-- Form tạo/sửa Trạng thái KH (sheet). Presenter: không gọi API. dirty -> MobileSheet hỏi trước khi đóng. -->
<template>
  <MobileSheet :open="open" :title="status ? 'Sửa trạng thái' : 'Thêm trạng thái'" :dirty="dirty" :persistent="saving" @update:open="emit('update:open', $event)">
    <form id="crm-status-form" class="crm-sf" novalidate @submit.prevent="onSubmit">
      <p v-if="error" class="crm-sf__err" role="alert">{{ error }}</p>
      <div class="crm-sf__field">
        <label for="sf-name">Tên <span>(bắt buộc)</span></label>
        <input id="sf-name" v-model="form.name" type="text" autocomplete="off" :aria-invalid="!!error && !form.name.trim()" />
      </div>
      <div class="crm-sf__field">
        <label for="sf-order">Thứ tự ưu tiên</label>
        <input id="sf-order" v-model.number="form.order" type="number" inputmode="numeric" />
        <p class="crm-sf__hint">Càng cao càng ưu tiên khi trạng thái cha tổng hợp từ con.</p>
      </div>
      <div class="crm-sf__field">
        <label for="sf-color">Màu nhãn</label>
        <div class="crm-sf__color"><input id="sf-color" v-model="form.color" type="color" /><code>{{ form.color }}</code></div>
      </div>
      <label class="crm-sf__check"><input v-model="form.isTerminal" type="checkbox" /><span>Trạng thái kết thúc (Chốt / Mất / Thất bại)</span></label>
      <label class="crm-sf__check"><input v-model="form.isDefault" type="checkbox" /><span>Mặc định cho khách mới</span></label>
    </form>
    <template #footer="{ requestClose }">
      <div class="crm-sf__foot">
        <button type="button" class="crm-sf__btn" :disabled="saving" @click="requestClose">Hủy</button>
        <button type="submit" form="crm-status-form" class="crm-sf__btn crm-sf__btn--primary" :disabled="saving">{{ saving ? 'Đang lưu…' : status ? 'Lưu thay đổi' : 'Tạo' }}</button>
      </div>
    </template>
  </MobileSheet>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import MobileSheet from '@/components/mobile/shell/MobileSheet.vue';
import { emptyStatusForm, isStatusFormDirty, statusToForm, type MobileStatus, type StatusForm } from '@/composables/mobile-settings/use-mobile-statuses';

const props = withDefaults(defineProps<{ open: boolean; status: MobileStatus | null; count: number; saving?: boolean; error?: string }>(), { saving: false, error: '' });
const emit = defineEmits<{ 'update:open': [open: boolean]; submit: [form: StatusForm] }>();

const form = ref<StatusForm>(emptyStatusForm(0));
const baseline = ref<StatusForm>(emptyStatusForm(0));
const dirty = computed(() => props.open && isStatusFormDirty(form.value, baseline.value));

watch(() => props.open, (o) => {
  if (!o) return;
  const f = props.status ? statusToForm(props.status) : emptyStatusForm(props.count);
  form.value = { ...f };
  baseline.value = { ...f };
});
function onSubmit() { emit('submit', { ...form.value, order: Number(form.value.order) || 1 }); }
</script>

<style scoped>
.crm-sf { display: flex; flex-direction: column; gap: var(--m-space-4); padding: var(--m-space-2) var(--m-space-5) var(--m-space-4); color: var(--m-text); }
.crm-sf__field { display: flex; flex-direction: column; gap: var(--m-space-1); }
.crm-sf__field label { font-size: var(--m-font-meta); font-weight: 650; color: var(--m-muted); }
.crm-sf__field label span { font-weight: 500; }
.crm-sf__field input[type='text'], .crm-sf__field input[type='number'] { width: 100%; min-height: 48px; padding: 0 var(--m-space-3); border: 1px solid var(--m-line); border-radius: var(--m-radius-md); background: var(--m-surface-inset); color: var(--m-text); font: inherit; font-size: 16px; box-sizing: border-box; }
.crm-sf__hint { margin: 0; font-size: var(--m-font-meta); color: var(--m-muted); }
.crm-sf__color { display: flex; align-items: center; gap: var(--m-space-3); }
.crm-sf__color input { width: 56px; height: 48px; padding: 2px; border: 1px solid var(--m-line); border-radius: var(--m-radius-md); background: var(--m-surface-inset); cursor: pointer; }
.crm-sf__color code { color: var(--m-muted); }
.crm-sf__check { display: flex; align-items: center; gap: var(--m-space-3); min-height: var(--m-touch); }
.crm-sf__check input { flex: none; width: 24px; height: 24px; accent-color: var(--m-brand-strong); }
.crm-sf__err { margin: 0; padding: var(--m-space-3); border-radius: var(--m-radius-md); background: var(--m-warning-soft); color: var(--m-warning); font-weight: 600; }
.crm-sf__foot { display: flex; width: 100%; gap: var(--m-space-3); padding: var(--m-space-3) var(--m-space-5); }
.crm-sf__btn { flex: 1; min-width: 44px; min-height: 48px; border: 1px solid var(--m-line); border-radius: var(--m-radius-md); background: var(--m-surface); color: var(--m-text); font: inherit; font-weight: 650; cursor: pointer; touch-action: manipulation; }
.crm-sf__btn:disabled { opacity: 0.6; cursor: default; }
.crm-sf__btn--primary { border-color: transparent; background: var(--m-brand-strong); color: var(--m-on-action); }
.crm-sf input:focus-visible, .crm-sf__btn:focus-visible { outline: 3px solid var(--m-focus); outline-offset: 2px; }
</style>
