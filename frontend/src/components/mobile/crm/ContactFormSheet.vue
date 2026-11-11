<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- Copyright (C) 2026 Nguyễn Tiến Lộc -->
<!--
  Form tạo/sửa khách (sheet toàn chiều cao). Dùng lại quy tắc của desktop (tên bắt buộc) và GIỮ NGUYÊN mọi trường
  không có trên form mobile (contact-form-model.ts) để lưu trên điện thoại không xóa dữ liệu. Presenter: không gọi API.
-->
<template>
  <MobileSheet
    :open="open" :title="isNew ? 'Thêm khách hàng' : 'Sửa khách hàng'" full-height :dirty="dirty" :persistent="saving"
    @update:open="emit('update:open', $event)"
  >
    <form id="crm-contact-form" class="crm-form" novalidate @submit.prevent="onSubmit">
      <p v-if="error" class="crm-form__error" role="alert">{{ error }}</p>

      <div class="crm-form__field">
        <label for="cf-fullName">Tên hiển thị Zalo <span class="crm-form__req">(bắt buộc)</span></label>
        <input id="cf-fullName" v-model="form.fullName" type="text" autocomplete="off" :aria-invalid="!!errors.fullName" aria-describedby="cf-fullName-err" />
        <p v-if="errors.fullName" id="cf-fullName-err" class="crm-form__err">{{ errors.fullName }}</p>
      </div>
      <div class="crm-form__field">
        <label for="cf-crmName">Tên CRM (tên thật)</label>
        <input id="cf-crmName" v-model="form.crmName" type="text" autocomplete="off" />
      </div>
      <div class="crm-form__field">
        <label for="cf-phone">SĐT chính</label>
        <input id="cf-phone" v-model="form.phone" type="tel" inputmode="tel" autocomplete="off" />
      </div>
      <div class="crm-form__field">
        <label for="cf-phone2">SĐT 2</label>
        <input id="cf-phone2" v-model="form.phone2" type="tel" inputmode="tel" autocomplete="off" />
      </div>
      <div class="crm-form__field">
        <label for="cf-phone3">SĐT 3</label>
        <input id="cf-phone3" v-model="form.phone3" type="tel" inputmode="tel" autocomplete="off" />
      </div>
      <div class="crm-form__field">
        <label for="cf-email">Email</label>
        <input id="cf-email" v-model="form.email" type="email" inputmode="email" autocomplete="off" />
      </div>
      <div class="crm-form__field">
        <label for="cf-source">Nguồn</label>
        <select id="cf-source" v-model="form.source">
          <option value="">Chưa chọn</option>
          <option v-for="o in sourceOptions" :key="o.value" :value="o.value">{{ o.text }}</option>
        </select>
      </div>
      <div class="crm-form__field">
        <label for="cf-status">Trạng thái</label>
        <select id="cf-status" v-model="form.status">
          <option value="">Chưa chọn</option>
          <option v-for="o in STATUS_OPTIONS" :key="o.value" :value="o.value">{{ o.text }}</option>
        </select>
      </div>
      <div class="crm-form__field">
        <label for="cf-occupation">Nghề nghiệp</label>
        <input id="cf-occupation" v-model="form.occupation" type="text" autocomplete="off" />
      </div>
      <div class="crm-form__field">
        <label for="cf-address">Địa chỉ chi tiết</label>
        <textarea id="cf-address" v-model="form.addressLine" rows="2" />
      </div>
      <div class="crm-form__field">
        <label for="cf-province">Tỉnh/Thành phố</label>
        <input id="cf-province" v-model="form.province" type="text" autocomplete="off" />
      </div>
      <div class="crm-form__field">
        <label for="cf-district">Quận/Huyện</label>
        <input id="cf-district" v-model="form.district" type="text" autocomplete="off" />
      </div>
      <div class="crm-form__field">
        <label for="cf-ward">Phường/Xã</label>
        <input id="cf-ward" v-model="form.ward" type="text" autocomplete="off" />
      </div>
      <div class="crm-form__field">
        <label for="cf-notes">Ghi chú</label>
        <textarea id="cf-notes" v-model="form.notes" rows="3" />
      </div>
    </form>
    <template #footer>
      <div class="crm-form__footer">
        <button type="button" class="crm-btn" :disabled="saving" @click="emit('update:open', false)">Hủy</button>
        <button type="submit" form="crm-contact-form" class="crm-btn crm-btn--primary" :disabled="saving">
          {{ saving ? 'Đang lưu…' : isNew ? 'Thêm khách' : 'Lưu thay đổi' }}
        </button>
      </div>
    </template>
  </MobileSheet>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import MobileSheet from '@/components/mobile/shell/MobileSheet.vue';
import { STATUS_OPTIONS, SOURCE_OPTIONS, type Contact } from '@/composables/use-contacts';
import { MOBILE_SOURCE_OPTIONS } from './crm-model';
import {
  contactToForm, emptyContactForm, isContactFormDirty, validateContactForm, type ContactFormState,
} from './contact-form-model';

const props = withDefaults(defineProps<{ open: boolean; contact: Contact | null; saving?: boolean; error?: string }>(), { saving: false, error: '' });
const emit = defineEmits<{ 'update:open': [v: boolean]; submit: [form: ContactFormState] }>();

const isNew = computed(() => !props.contact?.id);
const form = ref<ContactFormState>(emptyContactForm());
const baseline = ref<ContactFormState>(emptyContactForm());
const errors = ref<Record<string, string>>({});

// Nếu khách đang có nguồn đã bỏ (vd TikTok) vẫn giữ trong danh sách để không đổi nguồn ngoài ý muốn.
const sourceOptions = computed(() => {
  const cur = form.value.source;
  if (cur && !MOBILE_SOURCE_OPTIONS.some(o => o.value === cur)) {
    return [...MOBILE_SOURCE_OPTIONS, SOURCE_OPTIONS.find(o => o.value === cur) ?? { text: cur, value: cur }];
  }
  return MOBILE_SOURCE_OPTIONS;
});

watch(() => props.open, (o) => {
  if (!o) return;
  form.value = contactToForm(props.contact);
  baseline.value = contactToForm(props.contact);
  errors.value = {};
}, { immediate: true });

const dirty = computed(() => isContactFormDirty(form.value, baseline.value));

function onSubmit() {
  errors.value = validateContactForm(form.value);
  if (Object.keys(errors.value).length) return;
  emit('submit', { ...form.value, fullName: form.value.fullName.trim() });
}
</script>

<style scoped>
.crm-form { display: flex; flex-direction: column; gap: var(--m-space-4); padding: var(--m-space-2) var(--m-space-5) var(--m-space-4); }
.crm-form__field { display: flex; flex-direction: column; gap: var(--m-space-1); }
.crm-form__field label { font-size: var(--m-font-meta); font-weight: 650; color: var(--m-muted); }
.crm-form__req { font-weight: 500; }
.crm-form__field input, .crm-form__field select, .crm-form__field textarea {
  width: 100%; min-height: 48px; padding: 0 var(--m-space-3); border: 1px solid var(--m-line); border-radius: var(--m-radius-md);
  background: var(--m-surface-inset); color: var(--m-text); font: inherit; font-size: 16px; box-sizing: border-box;
}
.crm-form__field textarea { padding: var(--m-space-3); resize: vertical; line-height: 1.4; }
.crm-form__field input:focus-visible, .crm-form__field select:focus-visible, .crm-form__field textarea:focus-visible { outline: 3px solid var(--m-focus); outline-offset: 1px; }
.crm-form__field input[aria-invalid='true'] { border-color: var(--m-danger); }
.crm-form__err { margin: 0; font-size: var(--m-font-meta); color: var(--m-danger); font-weight: 600; }
.crm-form__error { margin: 0; padding: var(--m-space-3); border-radius: var(--m-radius-md); background: var(--m-warning-soft); color: var(--m-warning); font-weight: 600; }
.crm-form__footer { display: flex; gap: var(--m-space-3); padding: var(--m-space-3) var(--m-space-5); }
.crm-btn {
  flex: 1; min-height: 48px; border: 1px solid var(--m-line); border-radius: var(--m-radius-md); background: var(--m-surface);
  color: var(--m-text); font: inherit; font-weight: 650; cursor: pointer; touch-action: manipulation;
}
.crm-btn:disabled { opacity: 0.6; cursor: default; }
.crm-btn--primary { border-color: transparent; background: var(--m-brand-strong); color: var(--m-on-action); }
.crm-btn:focus-visible { outline: 3px solid var(--m-focus); outline-offset: 2px; }
</style>
