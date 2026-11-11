<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- Copyright (C) 2026 Nguyễn Tiến Lộc -->
<!--
  Tạo/sửa lịch hẹn trong sheet toàn chiều cao (thay dialog "Tạo nhắc hẹn" desktop trên mobile). Giờ nhập là giờ theo MÚI GIỜ
  TỔ CHỨC (timezoneLabel hiển thị rõ). Không gửi source/externalRef/conversationId: chúng thuộc bản ghi cũ và được giữ nguyên.
  Presenter: không gọi API; tìm khách phát sự kiện searchContact cho view adapter.
-->
<template>
  <MobileSheet
    :open="open" :title="isEdit ? 'Sửa lịch hẹn' : 'Tạo lịch hẹn'" full-height :dirty="dirty" :persistent="saving"
    @update:open="emit('update:open', $event)"
  >
    <form id="crm-appt-form" class="crm-appt" novalidate @submit.prevent="onSubmit">
      <p v-if="error" class="crm-appt__error" role="alert">{{ error }}</p>

      <div class="crm-appt__field">
        <span class="crm-appt__label" id="ap-contact-label">Khách hàng</span>
        <div v-if="draft.contactId" class="crm-appt__contact" aria-labelledby="ap-contact-label">
          <i class="mdi mdi-account-outline" aria-hidden="true" />
          <span class="crm-appt__contact-name">{{ pickedName || contactName || 'Khách đã chọn' }}</span>
          <button v-if="!lockedContact" type="button" class="crm-appt__link" @click="clearContact">Đổi</button>
        </div>
        <template v-else>
          <input
            v-model="query" type="search" inputmode="search" autocomplete="off" placeholder="Tìm tên hoặc số điện thoại khách"
            aria-labelledby="ap-contact-label" @input="emit('searchContact', query)"
          />
          <ul v-if="contactResults.length" class="crm-appt__results">
            <li v-for="c in contactResults" :key="c.id">
              <button type="button" class="crm-appt__result" @click="pickContact(c)">
                <strong>{{ c.name }}</strong><span>{{ c.phone || 'Chưa có SĐT' }}</span>
              </button>
            </li>
          </ul>
          <p v-else-if="searching" class="crm-appt__hint" role="status">Đang tìm khách…</p>
        </template>
        <p v-if="errors.contactId" class="crm-appt__err">{{ errors.contactId }}</p>
      </div>

      <div class="crm-appt__field">
        <span class="crm-appt__label" id="ap-type-label">Loại nhắc hẹn</span>
        <div class="crm-appt__chips" role="radiogroup" aria-labelledby="ap-type-label">
          <button
            v-for="t in APPOINTMENT_TYPE_OPTIONS" :key="t.value" type="button" role="radio" class="crm-chip"
            :class="{ 'crm-chip--on': draft.type === t.value }" :aria-checked="draft.type === t.value" @click="draft.type = t.value"
          >{{ t.text }}</button>
        </div>
      </div>

      <div class="crm-appt__field">
        <label class="crm-appt__label" for="ap-title">Tiêu đề</label>
        <input id="ap-title" v-model="draft.title" type="text" autocomplete="off" :aria-invalid="!!errors.title" />
        <p v-if="errors.title" class="crm-appt__err">{{ errors.title }}</p>
      </div>

      <div class="crm-appt__row">
        <div class="crm-appt__field">
          <label class="crm-appt__label" for="ap-date">Ngày</label>
          <input id="ap-date" v-model="date" type="date" :aria-invalid="!!errors.date" />
          <p v-if="errors.date" class="crm-appt__err">{{ errors.date }}</p>
        </div>
        <div class="crm-appt__field">
          <label class="crm-appt__label" for="ap-time">Giờ</label>
          <input id="ap-time" v-model="time" type="time" step="300" :aria-invalid="!!errors.time" />
          <p v-if="errors.time" class="crm-appt__err">{{ errors.time }}</p>
        </div>
      </div>
      <p class="crm-appt__hint"><i class="mdi mdi-earth" aria-hidden="true" /> Giờ theo múi giờ tổ chức ({{ timezoneLabel }}), không theo giờ máy.</p>

      <div class="crm-appt__field">
        <label class="crm-appt__label" for="ap-dur">Thời lượng</label>
        <select id="ap-dur" v-model.number="draft.durationMin">
          <option v-for="d in durationOptions" :key="d.value" :value="d.value">{{ d.text }}</option>
        </select>
      </div>

      <div v-if="users.length" class="crm-appt__field">
        <label class="crm-appt__label" for="ap-owner">Người phụ trách</label>
        <select id="ap-owner" v-model="ownerValue">
          <option value="">Chưa phân công</option>
          <option v-for="u in users" :key="u.id" :value="u.id">{{ u.fullName }}</option>
        </select>
      </div>

      <div class="crm-appt__field">
        <label class="crm-appt__label" for="ap-notes">Ghi chú</label>
        <textarea id="ap-notes" v-model="draft.notes" rows="3" />
      </div>
    </form>
    <template #footer>
      <div class="crm-appt__footer">
        <button type="button" class="crm-btn" :disabled="saving" @click="emit('update:open', false)">Hủy</button>
        <button type="submit" form="crm-appt-form" class="crm-btn crm-btn--primary" :disabled="saving">
          {{ saving ? 'Đang lưu…' : isEdit ? 'Cập nhật' : 'Tạo lịch hẹn' }}
        </button>
      </div>
    </template>
  </MobileSheet>
</template>

<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue';
import MobileSheet from '@/components/mobile/shell/MobileSheet.vue';
import { APPOINTMENT_TYPE_OPTIONS } from '@/composables/use-appointments';
import { DURATION_OPTIONS, splitDraftDate, validateDraft } from './agenda-model';
import type { AppointmentDraft, AppointmentSheetEmits, AppointmentSheetProps } from './types';

const props = withDefaults(defineProps<AppointmentSheetProps & {
  /** Có = sửa lịch đã có (đổi tiêu đề nút). */
  editing?: boolean;
  contactName?: string;
  users?: Array<{ id: string; fullName: string }>;
  contactResults?: Array<{ id: string; name: string; phone: string | null }>;
  searching?: boolean;
}>(), { editing: false, contactName: '', users: () => [], contactResults: () => [], searching: false });
const emit = defineEmits<AppointmentSheetEmits & { searchContact: [q: string] }>();

const durationOptions = DURATION_OPTIONS;
const isEdit = computed(() => props.editing);
const draft = reactive<AppointmentDraft>(blank());
const baseline = ref('');
const date = ref('');
const time = ref('');
const errors = ref<Record<string, string>>({});
const query = ref('');
const pickedName = ref('');
const lockedContact = ref(false);

function blank(): AppointmentDraft {
  return { contactId: '', title: '', appointmentDate: '', durationMin: 15, type: 'call', notes: '', assignedUserId: null, conversationId: null };
}

const ownerValue = computed({
  get: () => draft.assignedUserId ?? '',
  set: (v: string) => { draft.assignedUserId = v || null; },
});

function snapshot(): string {
  return JSON.stringify({ ...draft, appointmentDate: `${date.value}T${time.value}` });
}

watch(() => props.open, (o) => {
  if (!o) return;
  Object.assign(draft, blank(), props.initial);
  const parts = splitDraftDate(draft.appointmentDate || '');
  date.value = parts.date;
  time.value = parts.time;
  errors.value = {};
  query.value = '';
  pickedName.value = '';
  lockedContact.value = !!props.initial.contactId;
  baseline.value = snapshot();
}, { immediate: true });

const dirty = computed(() => baseline.value !== '' && snapshot() !== baseline.value);

function pickContact(c: { id: string; name: string }) {
  draft.contactId = c.id;
  pickedName.value = c.name;
  if (!draft.title.trim()) draft.title = `Hẹn ${c.name}`;
}
function clearContact() { draft.contactId = ''; pickedName.value = ''; query.value = ''; }

function onSubmit() {
  const next: AppointmentDraft = { ...draft, appointmentDate: `${date.value}T${time.value}` };
  errors.value = validateDraft(next);
  if (Object.keys(errors.value).length) return;
  emit('submit', next);
}
</script>

<style scoped>
.crm-appt { display: flex; flex-direction: column; gap: var(--m-space-4); padding: var(--m-space-2) var(--m-space-5) var(--m-space-4); }
.crm-appt__row { display: grid; grid-template-columns: 1fr 1fr; gap: var(--m-space-3); }
.crm-appt__field { display: flex; flex-direction: column; gap: var(--m-space-1); min-width: 0; }
.crm-appt__label { font-size: var(--m-font-meta); font-weight: 650; color: var(--m-muted); }
.crm-appt__field input, .crm-appt__field select, .crm-appt__field textarea {
  width: 100%; min-width: 0; min-height: 48px; padding: 0 var(--m-space-3); border: 1px solid var(--m-line); border-radius: var(--m-radius-md);
  background: var(--m-surface-inset); color: var(--m-text); font: inherit; font-size: 16px; box-sizing: border-box;
}
.crm-appt__field textarea { padding: var(--m-space-3); resize: vertical; line-height: 1.4; }
.crm-appt__field input:focus-visible, .crm-appt__field select:focus-visible, .crm-appt__field textarea:focus-visible, .crm-btn:focus-visible, .crm-chip:focus-visible, .crm-appt__result:focus-visible, .crm-appt__link:focus-visible { outline: 3px solid var(--m-focus); outline-offset: 1px; }
.crm-appt__field input[aria-invalid='true'] { border-color: var(--m-danger); }
.crm-appt__contact { display: flex; align-items: center; gap: var(--m-space-2); min-height: 48px; padding: 0 var(--m-space-3); border-radius: var(--m-radius-md); background: var(--m-brand-soft); color: var(--m-brand-strong); font-weight: 650; }
.crm-appt__contact-name { flex: 1; min-width: 0; overflow-wrap: anywhere; }
.crm-appt__link { min-height: var(--m-touch); padding: 0 var(--m-space-2); border: 0; background: none; color: var(--m-brand-strong); font: inherit; font-weight: 700; text-decoration: underline; cursor: pointer; }
.crm-appt__results { list-style: none; margin: 0; padding: 0; border: 1px solid var(--m-line); border-radius: var(--m-radius-md); overflow: hidden; }
.crm-appt__result { display: flex; flex-direction: column; align-items: flex-start; gap: 2px; width: 100%; min-height: 56px; padding: var(--m-space-2) var(--m-space-3); border: 0; border-bottom: 1px solid var(--m-line); background: var(--m-surface); color: var(--m-text); font: inherit; text-align: left; cursor: pointer; }
.crm-appt__result span { font-size: var(--m-font-meta); color: var(--m-muted); }
.crm-appt__chips { display: flex; flex-wrap: wrap; gap: var(--m-space-2); }
.crm-chip { min-height: var(--m-touch); padding: 0 var(--m-space-4); border: 1px solid var(--m-line); border-radius: 999px; background: var(--m-surface); color: var(--m-text); font: inherit; font-weight: 600; cursor: pointer; touch-action: manipulation; }
.crm-chip--on { background: var(--m-brand-strong); border-color: var(--m-brand-strong); color: var(--m-on-action); }
.crm-appt__hint { margin: 0; display: flex; gap: 6px; font-size: var(--m-font-meta); color: var(--m-muted); }
.crm-appt__err { margin: 0; font-size: var(--m-font-meta); color: var(--m-danger); font-weight: 600; }
.crm-appt__error { margin: 0; padding: var(--m-space-3); border-radius: var(--m-radius-md); background: var(--m-warning-soft); color: var(--m-warning); font-weight: 600; }
.crm-appt__footer { display: flex; gap: var(--m-space-3); padding: var(--m-space-3) var(--m-space-5); }
.crm-btn { flex: 1; min-height: 48px; border: 1px solid var(--m-line); border-radius: var(--m-radius-md); background: var(--m-surface); color: var(--m-text); font: inherit; font-weight: 650; cursor: pointer; touch-action: manipulation; }
.crm-btn:disabled { opacity: 0.6; cursor: default; }
.crm-btn--primary { border-color: transparent; background: var(--m-brand-strong); color: var(--m-on-action); }
</style>
